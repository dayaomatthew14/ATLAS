"""
Pure worksheet selection, metadata extraction, and cell normalization helpers
for Excel curriculum imports.
"""

import logging
import re
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException
from .. import models

logger = logging.getLogger(__name__)


def is_empty_cell(value: Any) -> bool:
    """Return True if an openpyxl cell value represents empty or NaN/None."""
    if value is None:
        return True
    if isinstance(value, float) and value != value:  # NaN check without pandas
        return True
    if isinstance(value, str) and value.strip().lower() in ("", "nan", "none"):
        return True
    return False


def normalize_year(value: object) -> Optional[str]:
    """Normalize year-level headings (e.g., '1st Year', 'SECOND YEAR') to '1'..'6'."""
    if is_empty_cell(value):
        return None
    s = str(value).strip().upper()
    if not s or s in {"NAN", "NONE", "N/A"}:
        return None
    m = re.search(r"\b([1-5])\b", s)
    if m:
        return m.group(1)
    m = re.search(r"\b(1ST|2ND|3RD|4TH|5TH)\b", s)
    if m:
        return m.group(1)[0]
    word_map = {
        "FIRST": "1",
        "SECOND": "2",
        "THIRD": "3",
        "FOURTH": "4",
        "FIFTH": "5",
        "SIXTH": "6",
    }
    for k, v in word_map.items():
        if k in s:
            return v
    return None


def normalize_semester(value: object) -> Optional[str]:
    """Normalize semester headings (e.g., 'First Term', 'II', 'Midyear') to canonical tokens."""
    if is_empty_cell(value):
        return None
    s = str(value).strip().upper()
    if not s or s in {"NAN", "NONE", "N/A"}:
        return None
    if "3RD SEMESTER" in s or "MIDYEAR" in s:
        return "3rd semester"
    m = re.search(r"\b([123])\b", s)
    if m:
        return {"1": "1st", "2": "2nd", "3": "3rd"}[m.group(1)]
    if re.search(r"\bI\b", s):
        return "1st"
    if re.search(r"\bII\b", s):
        return "2nd"
    if re.search(r"\bIII\b", s):
        return "3rd"
    if "1ST" in s or "FIRST" in s:
        return "1st"
    if "2ND" in s or "SECOND" in s:
        return "2nd"
    if "3RD" in s or "THIRD" in s:
        return "3rd"
    return None


def parse_numeric_cell(val: Any) -> int:
    """Parse an integer unit cell value, stripping brackets/parentheses/asterisks."""
    if is_empty_cell(val):
        return 0
    s = re.sub(r'[\(\)\[\]\*\s]', '', str(val).strip())
    try:
        return int(float(s))
    except Exception:
        return 0


def clean_prerequisites(val: Any) -> Optional[str]:
    """Normalize comma/newline/conjunction-separated prerequisite codes."""
    if not val or is_empty_cell(val):
        return None
    s = str(val).lower().strip()
    if s in ['none', 'n/a', '0', 'nan', 'none.', 'no']:
        return None
    parts = (
        str(val)
        .replace('\r\n', ',')
        .replace('\n', ',')
        .replace('&', ',')
        .replace(';', ',')
        .replace(' AND ', ',')
        .replace(' OR ', ',')
    )
    raw_tokens = [c.strip().upper() for c in parts.split(',') if c and c.strip()]
    codes: List[str] = []
    for tok in raw_tokens:
        tok_clean = re.sub(r"\s+", " ", tok).strip()
        if tok_clean in {"AND", "OR", "NONE", "N/A", "0"}:
            continue
        if tok_clean:
            codes.append(tok_clean)
    return ", ".join(codes) if codes else None


def select_best_worksheet(
    wb: Any,
    mapping_keywords: Dict[str, List[str]],
    program_patterns: List[str],
    selected_sheet: Optional[str],
) -> Tuple[str, int, bool]:
    """Score workbook tabs by curriculum density and return (sheet_name, score, auto_selected)."""
    section_re = re.compile(r'\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+YEAR\b')
    term_re = re.compile(r'\b(FIRST|SECOND|THIRD|SUMMER|MIDYEAR)\s+TERM\b')

    max_score = -1
    best_ay = 0
    best_sheet: Optional[str] = None

    for sheet_name in wb.sheetnames:
        try:
            ws_probe = wb[sheet_name]
            all_rows = [list(r) for r in ws_probe.iter_rows(values_only=True)]
            raw_probe_rows = all_rows[:25]
        except Exception:
            continue

        probe_vals = [
            str(v).strip()
            for r in raw_probe_rows
            for v in r
            if not is_empty_cell(v)
        ]
        probe_text = " ".join(v.upper() for v in probe_vals)
        probe_vals_lower = [v.lower() for v in probe_vals]

        has_code_hdr = any(
            any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['code'])
            for val in probe_vals_lower
        )
        has_title_hdr = any(
            any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['name'])
            for val in probe_vals_lower
        )
        has_unit_hdr = any(
            any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['units'])
            for val in probe_vals_lower
        )

        score = (40 if has_code_hdr else 0) + (30 if has_title_hdr else 0) + (20 if has_unit_hdr else 0)

        ay_match = re.search(r'AY\s*(\d{4})', probe_text)
        if ay_match:
            score += 10

        for pat in program_patterns:
            if re.search(pat, probe_text):
                score += 10
                break

        sections = 0
        subject_rows = 0
        for row in all_rows:
            cells = [str(v).strip() for v in row if not is_empty_cell(v)]
            if not cells:
                continue
            joined = " ".join(cells).upper()
            if section_re.search(joined) and term_re.search(joined):
                sections += 1
            elif (
                any(re.match(r'^[A-Z]{2,6}\s?\d{2,4}', c.upper()) for c in cells)
                and any(re.fullmatch(r'\d{1,2}(\.\d+)?', c) for c in cells)
            ):
                subject_rows += 1

        score += sections * 25 + min(subject_rows, 200)
        ay_year = int(ay_match.group(1)) if ay_match else 0

        if (score, ay_year) > (max_score, best_ay) and (has_code_hdr or has_title_hdr):
            max_score, best_ay = score, ay_year
            best_sheet = sheet_name

    if not best_sheet:
        best_sheet = wb.sheetnames[0]

    sheet_auto_selected = True
    if selected_sheet:
        if selected_sheet not in wb.sheetnames:
            raise HTTPException(
                status_code=400,
                detail=f"'{selected_sheet}' is not a sheet in this workbook. Available: {', '.join(wb.sheetnames)}",
            )
        best_sheet = selected_sheet
        sheet_auto_selected = False

    return best_sheet, max_score, sheet_auto_selected


def extract_program_metadata(
    ws: Any,
    sheet_name: str,
    program_patterns: List[str],
    default_ay: str = "Unknown AY",
    default_program: str = "Unknown Program",
) -> Tuple[str, str, str, str]:
    """Extract (academic_year, program_name, program_code, full_block_name) from sheet header rows."""
    raw_probe_rows = [list(r) for r in list(ws.iter_rows(values_only=True))[:25]]
    probe_text = " ".join(
        str(v).strip().upper()
        for r in raw_probe_rows
        for v in r
        if not is_empty_cell(v)
    )

    extracted_ay = default_ay
    ay_match = re.search(r'(?:AY|ACADEMIC YEAR)\s*:?\s*(\d{4}\s*[-–]\s*\d{4}|\d{4})', probe_text)
    if ay_match:
        extracted_ay = f"AY {ay_match.group(1).strip()}"
    else:
        ay_simple = re.search(r'\b(20\d{2}\s*[-–]\s*20\d{2})\b', probe_text)
        if ay_simple:
            extracted_ay = f"AY {ay_simple.group(1).strip()}"

    extracted_program_name = default_program
    for pat in program_patterns:
        prog_match = re.search(pat, probe_text)
        if prog_match:
            extracted_program_name = prog_match.group(0).strip()
            break

    if extracted_program_name == "Unknown Program":
        clean_sheet_title = sheet_name.replace("_", " ").replace("-", " ").strip()
        if len(clean_sheet_title) > 2 and not clean_sheet_title.lower().startswith("sheet"):
            extracted_program_name = clean_sheet_title.upper()

    words = [
        w
        for w in re.split(r'[\s\-]+', extracted_program_name)
        if w not in ["OF", "IN", "SCIENCE", "BACHELOR", "ASSOCIATE", "DOCTOR", "MASTER", "AND"]
    ]
    program_code = "".join(w[0] for w in words) if words else extracted_program_name[:4].upper()
    if len(program_code) < 2:
        program_code = (sheet_name[:4] if len(sheet_name) >= 4 else sheet_name).upper()

    full_block_name = (
        f"{program_code} ({extracted_ay})"
        if extracted_ay != "Unknown AY"
        else f"{program_code} (Curriculum)"
    )
    return extracted_ay, extracted_program_name, program_code, full_block_name


def unmerge_and_read_rows(ws: Any) -> List[List[Any]]:
    """Expand merged ranges with their top-left values and return row lists."""
    for merged_range in list(ws.merged_cells.ranges):
        min_col, min_row, max_col, max_row = merged_range.bounds
        top_left_value = ws.cell(row=min_row, column=min_col).value
        ws.unmerge_cells(str(merged_range))
        for r in range(min_row, max_row + 1):
            for c in range(min_col, max_col + 1):
                ws.cell(row=r, column=c).value = top_left_value  # type: ignore
    return [list(r) for r in ws.iter_rows(values_only=True)]


def classify_subject_units(
    code: str, name: str, units: int, lec_units: int, lab_units: int
) -> Tuple[str, int, int]:
    """Infer ('lecture'|'lab', lec_units, lab_units) from subject code suffix and unit counts."""
    clean_code = code.upper().strip()
    if clean_code.endswith('A'):
        if lec_units == 0 and lab_units == 0:
            lec_units = units
        return 'lecture', lec_units, lab_units
    if clean_code.endswith('B') or 'lab' in name.lower() or 'laboratory' in name.lower():
        if lec_units == 0 and lab_units == 0:
            lab_units = units
        return 'lab', lec_units, lab_units
    if clean_code.endswith('C'):
        if lec_units == 0 and lab_units == 0:
            lab_units = 1
            lec_units = max(1, units - 1)
        return 'lecture', lec_units, lab_units
    if lec_units == 0 and lab_units > 0:
        return 'lab', lec_units, lab_units
    return 'lecture', lec_units, lab_units


def append_parsed_subject(
    *,
    code: str,
    name: str,
    units: int,
    ctype: str,
    lec_units: int,
    lab_units: int,
    pre_req: Optional[str],
    is_major_val: bool,
    block_id: Any,
    target_dept_id: Any,
    program_code: str,
    year_level: str,
    semester_term: str,
    items_to_add: List[models.Curriculum],
    skipped_items: List[dict],
    all_parsed_data: List[dict],
    extra_issues: Optional[List[str]] = None,
) -> None:
    """Validate duplicate/unit consistency and record a subject for curriculum import."""
    item_data: dict = {
        "block_id": block_id,
        "code": code,
        "name": name,
        "units": units,
        "type": ctype,
        "department_id": target_dept_id,
        "program_code": program_code,
        "year_level": year_level,
        "semester_term": semester_term,
        "lec_units": lec_units,
        "lab_units": lab_units,
        "pre_requisite": pre_req,
        "is_major": is_major_val,
        "validation_issues": list(extra_issues or []),
    }
    if any(i.code == code for i in items_to_add):
        item_data["validation_issues"].append("Duplicate: Already exists in this file")
        skipped_items.append({**item_data, "reason": "Already exists in this file"})
    else:
        items_to_add.append(
            models.Curriculum(
                block_id=block_id,
                code=code,
                name=name,
                units=units,
                type=ctype,
                department_id=target_dept_id,
                program_code=program_code,
                year_level=year_level,
                semester_term=semester_term,
                lec_units=lec_units,
                lab_units=lab_units,
                pre_requisite=pre_req,
                is_major=is_major_val,
            )
        )
    all_parsed_data.append(item_data)

