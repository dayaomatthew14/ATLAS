import io
import json
import math
import re
import logging
import traceback
from typing import Optional, List, Dict, Any
import openpyxl
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from .. import models
from ..routers.logs import log_activity

logger = logging.getLogger(__name__)


def is_na(v: Any) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return False


def parse_excel_headers(contents: bytes) -> Dict[str, Any]:
    """
    Read first 10 rows of each sheet in an uploaded workbook for header preview.
    """
    wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    sheets_data: Dict[str, Any] = {}
    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        raw_rows = [list(r) for r in list(ws.iter_rows(values_only=True))[:10]]
        if not raw_rows:
            continue
        rows = []
        for row in raw_rows:
            rows.append([str(v) if not is_na(v) else "" for v in row])
        sheets_data[sheet_name] = {"sample_rows": rows, "sheet_name": sheet_name}
    return sheets_data


async def process_curriculum_import(
    contents: bytes,
    department_id: Optional[int],
    program_code: Optional[str],
    dry_run: bool,
    db: Session,
    current_user: models.User,
    custom_mapping: Optional[str] = None,
    selected_sheet: Optional[str] = None
) -> Dict[str, Any]:
    # Import is the last curriculum write a non-admin could reach. Every other
    # handler in this router is already admin-only, but this one accepted chairs
    # and coordinators -- and with dry_run=false it creates a CurriculumBlock and
    # its subjects outright, so a chair could author curriculum the catalog was
    # meant to hand them. The curriculum is institutional reference data: the
    # administrator owns it, departments read it.
    if current_user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only System Administrators can import curriculum Excel files"
        )

    # Determine target department
    target_dept_id = department_id
    if not target_dept_id:
        first_dept = db.query(models.Department).first()
        if not first_dept:
            raise HTTPException(status_code=400, detail="No departments found in system")
        target_dept_id = first_dept.id

    try:
        wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)

        items_to_add: List[models.Curriculum] = []
        skipped_items: List[Dict[str, Any]] = []
        all_parsed_data: List[Dict[str, Any]] = []

        mapping_keywords = {
            'code': ["course code", "code", "subject code", "catalog"],
            'name': ["course title", "title", "subject name", "description", "subject"],
            'units': ["units", "unit", "credit", "total units"],
            'lec_units': ["lec", "lecture", "lec units", "lec. units"],
            'lab_units': ["lab", "laboratory", "lab units", "lab. units"],
            'pre_requisite': ["pre-req", "prerequisite", "prerequisite(s)", "pre-requisite", "prereq"],
            'year_level': ["year", "yr", "grade"],
            'semester_term': ["sem", "semester", "term"]
        }

        if custom_mapping:
            try:
                user_map = json.loads(custom_mapping)
                for k, v in user_map.items():
                    if k in mapping_keywords:
                        mapping_keywords[k] = [v] if isinstance(v, str) else v
            except Exception:
                pass

        best_sheet = None
        max_score = -1
        best_ay = 0
        extracted_program_name = "Unknown Program"
        extracted_ay = "Unknown AY"

        program_patterns = [
            r'BACHELOR OF SCIENCE IN [A-Z\s]+',
            r'BACHELOR OF [A-Z\s]+',
            r'DOCTOR OF [A-Z\s]+',
            r'MASTER OF [A-Z\s]+',
            r'ASSOCIATE IN [A-Z\s]+',
            r'\bBS[A-Z0-9\-\s]{1,10}\b',
            r'\bAB[A-Z0-9\-\s]{1,10}\b',
            r'\bDVM\b'
        ]

        # Year/term section headers are what a full curriculum grid is made of,
        # so they are the strongest evidence a sheet holds the real curriculum.
        section_re = re.compile(r'\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+YEAR\b')
        term_re = re.compile(r'\b(FIRST|SECOND|THIRD|SUMMER|MIDYEAR)\s+TERM\b')

        for sheet_name in wb.sheetnames:
            try:
                ws_probe = wb[sheet_name]
                all_rows = [list(r) for r in ws_probe.iter_rows(values_only=True)]
                raw_probe_rows = all_rows[:25]
            except Exception:
                continue

            probe_vals = []
            for r in raw_probe_rows:
                for v in r:
                    if not is_na(v):
                        probe_vals.append(str(v).strip())

            probe_text = " ".join([v.upper() for v in probe_vals])
            probe_vals_lower = [v.lower() for v in probe_vals]

            score = 0
            has_code_hdr = any(any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['code']) for val in probe_vals_lower)
            has_title_hdr = any(any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['name']) for val in probe_vals_lower)
            has_unit_hdr = any(any(k == val or (len(k) > 3 and k in val) for k in mapping_keywords['units']) for val in probe_vals_lower)

            if has_code_hdr: score += 40
            if has_title_hdr: score += 30
            if has_unit_hdr: score += 20

            ay_match = re.search(r'AY\s*(\d{4})', probe_text)
            if ay_match:
                score += 10

            for pat in program_patterns:
                if re.search(pat, probe_text):
                    score += 10
                    break

            # Completeness, measured over the whole sheet rather than the first 25 rows.
            sections = 0
            subject_rows = 0
            for row in all_rows:
                cells = [str(v).strip() for v in row if not is_na(v)]
                if not cells:
                    continue
                joined = " ".join(cells).upper()
                if section_re.search(joined) and term_re.search(joined):
                    sections += 1
                # A subject row: a code-shaped token plus at least one number.
                elif any(re.match(r'^[A-Z]{2,6}\s?\d{2,4}', c.upper()) for c in cells) and \
                     any(re.fullmatch(r'\d{1,2}(\.\d+)?', c) for c in cells):
                    subject_rows += 1

            score += sections * 25 + min(subject_rows, 200)

            ay_year = int(ay_match.group(1)) if ay_match else 0

            candidate = (score, ay_year)
            best = (max_score, best_ay)
            if candidate > best and (has_code_hdr or has_title_hdr):
                max_score, best_ay = candidate
                best_sheet = sheet_name

        if not best_sheet:
            best_sheet = wb.sheetnames[0]

        sheet_auto_selected = True
        if selected_sheet:
            if selected_sheet not in wb.sheetnames:
                raise HTTPException(
                    status_code=400,
                    detail=f"'{selected_sheet}' is not a sheet in this workbook. Available: {', '.join(wb.sheetnames)}"
                )
            best_sheet = selected_sheet
            sheet_auto_selected = False

        logger.debug(f"DEBUG: Selected sheet '{best_sheet}' with confidence score {max_score}")
        ws_best = wb[best_sheet]
        raw_probe_rows = [list(r) for r in list(ws_best.iter_rows(values_only=True))[:25]]
        probe_vals = []
        for r in raw_probe_rows:
            for v in r:
                if not is_na(v):
                    probe_vals.append(str(v).strip())
        probe_text = " ".join([v.upper() for v in probe_vals])

        ay_match = re.search(r'(?:AY|ACADEMIC YEAR)\s*:?\s*(\d{4}\s*[-–]\s*\d{4}|\d{4})', probe_text)
        if ay_match:
            extracted_ay = f"AY {ay_match.group(1).strip()}"
        else:
            ay_simple = re.search(r'\b(20\d{2}\s*[-–]\s*20\d{2})\b', probe_text)
            if ay_simple:
                extracted_ay = f"AY {ay_simple.group(1).strip()}"

        for pat in program_patterns:
            prog_match = re.search(pat, probe_text)
            if prog_match:
                extracted_program_name = prog_match.group(0).strip()
                break

        if extracted_program_name == "Unknown Program":
            clean_sheet_title = best_sheet.replace("_", " ").replace("-", " ").strip()
            if len(clean_sheet_title) > 2 and not clean_sheet_title.lower().startswith("sheet"):
                extracted_program_name = clean_sheet_title.upper()

        words = [w for w in re.split(r'[\s\-]+', extracted_program_name) if w not in ["OF", "IN", "SCIENCE", "BACHELOR", "ASSOCIATE", "DOCTOR", "MASTER", "AND"]]
        if words:
            program_code = "".join([w[0] for w in words])
        else:
            program_code = extracted_program_name[:4].upper()

        if len(program_code) < 2:
            program_code = (best_sheet[:4] if len(best_sheet) >= 4 else best_sheet).upper()

        full_block_name = f"{program_code} ({extracted_ay})" if extracted_ay != "Unknown AY" else f"{program_code} (Curriculum)"

        existing_block = db.query(models.CurriculumBlock).filter(
            models.CurriculumBlock.department_id == target_dept_id,
            models.CurriculumBlock.program_name == extracted_program_name,
            models.CurriculumBlock.academic_year == extracted_ay
        ).first()

        if existing_block:
            curriculum_block = existing_block
            logger.debug(f"DEBUG: Found existing block '{extracted_program_name} ({extracted_ay})' (ID: {curriculum_block.id})")
        else:
            curriculum_block = models.CurriculumBlock(
                department_id=target_dept_id,
                program_name=extracted_program_name,
                academic_year=extracted_ay,
                filename="Uploaded File"
            )
            db.add(curriculum_block)
            db.flush()
            logger.debug(f"DEBUG: Created new block '{full_block_name}' (ID: {curriculum_block.id})")

        ws = wb[best_sheet]

        merged_cells = list(ws.merged_cells.ranges)
        for merged_range in merged_cells:
            min_col, min_row, max_col, max_row = merged_range.bounds
            top_left_value = ws.cell(row=min_row, column=min_col).value
            ws.unmerge_cells(str(merged_range))
            for r in range(min_row, max_row + 1):
                for c in range(min_col, max_col + 1):
                    ws.cell(row=r, column=c).value = top_left_value  # type: ignore

        raw_rows = [list(r) for r in ws.iter_rows(values_only=True)]

        def normalize_year(value: object) -> Optional[str]:
            if is_na(value):
                return None
            s = str(value).strip().upper()
            if not s or s in {"NAN", "NONE", "N/A"}: return None
            m = re.search(r"\b([1-5])\b", s)
            if m: return m.group(1)
            m = re.search(r"\b(1ST|2ND|3RD|4TH|5TH)\b", s)
            if m: return m.group(1)[0]
            word_map = {"FIRST": "1", "SECOND": "2", "THIRD": "3", "FOURTH": "4", "FIFTH": "5", "SIXTH": "6"}
            for k, v in word_map.items():
                if k in s: return v
            return None

        def normalize_semester(value: object) -> Optional[str]:
            if is_na(value):
                return None
            s = str(value).strip().upper()
            if not s or s in {"NAN", "NONE", "N/A"}: return None
            if "3RD SEMESTER" in s or "MIDYEAR" in s: return "3rd semester"
            m = re.search(r"\b([123])\b", s)
            if m: return {"1": "1st", "2": "2nd", "3": "3rd"}[m.group(1)]
            if re.search(r"\bI\b", s): return "1st"
            if re.search(r"\bII\b", s): return "2nd"
            if re.search(r"\bIII\b", s): return "3rd"
            if "1ST" in s or "FIRST" in s: return "1st"
            if "2ND" in s or "SECOND" in s: return "2nd"
            if "3RD" in s or "THIRD" in s: return "3rd"
            return None

        last_row_identifier = None
        current_year_context = None
        current_sem_context = None
        is_in_active_zone = False
        seen_any_section = False
        col_map = {}

        for idx, row in enumerate(raw_rows):
            row_text = " ".join([str(v).strip().upper() for v in row if not is_na(v)])
            if not row_text: continue

            cell_strs = [str(v).strip() for v in row if not is_na(v)]
            looks_like_subject = (
                any(re.match(r'^[A-Z]{2,6}\s?\d{2,4}', c.upper()) for c in cell_strs)
                and any(re.fullmatch(r'\d{1,2}(\.\d+)?', c) for c in cell_strs)
            )

            y_match = None if looks_like_subject else re.search(r'(1ST|2ND|3RD|4TH|5TH|6TH|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+YEAR|YEAR\s+([1-6])', row_text)
            s_match = None if looks_like_subject else re.search(r'(1ST|2ND|3RD|FIRST|SECOND|THIRD)\s+(SEMESTER|TERM)|(3RD SEMESTER|MIDYEAR)', row_text)

            section_updated = False
            if y_match:
                y_raw = y_match.group(1) or y_match.group(2)
                norm_y = normalize_year(y_raw)
                if norm_y:
                    current_year_context = norm_y
                    section_updated = True

            if s_match:
                s_raw = s_match.group(1) or s_match.group(3)
                norm_s = normalize_semester(s_raw)
                if norm_s:
                    current_sem_context = norm_s
                    section_updated = True

            if section_updated:
                is_in_active_zone = True
                last_row_identifier = None
                seen_any_section = True
                logger.debug(f"DEBUG: Found Section Header at row {idx}: Year={current_year_context}, Sem={current_sem_context}")
                continue

            if "ELECTIVES" in row_text:
                current_year_context = None
                current_sem_context = None
                is_in_active_zone = False
                last_row_identifier = None
                continue

            if "SUMMARY OF UNITS" in row_text:
                is_in_active_zone = False
                continue

            row_vals = [str(v).strip().lower() if not is_na(v) else "" for v in row]
            temp_map = {}
            for key, keywords in mapping_keywords.items():
                for i, val in enumerate(row_vals):
                    if any(k == val or (len(k) > 3 and k in val) for k in keywords):
                        if key == 'units' and any(k in val for k in ["lec", "lab"]): continue
                        temp_map[key] = i
                        break

            if 'code' in temp_map:
                col_map = temp_map
                is_in_active_zone = True
                if not seen_any_section:
                    if not current_year_context:
                        current_year_context = '1'
                    if not current_sem_context:
                        current_sem_context = '1st'
                logger.debug(f"DEBUG: Mapped columns at row {idx}: {col_map}")
                continue

            if not is_in_active_zone or not col_map or 'code' not in col_map: continue
            if not current_year_context or not current_sem_context: continue
            if not current_year_context.isdigit(): continue

            code_raw = row[col_map['code']] if col_map['code'] < len(row) else None
            name_raw = row[col_map['name']] if 'name' in col_map and col_map['name'] < len(row) else ""
            units_raw = row[col_map['units']] if 'units' in col_map and col_map['units'] < len(row) else 0

            def parse_num(val):
                if is_na(val): return 0
                s = re.sub(r'[\(\)\[\]\*\s]', '', str(val).strip())
                try: return int(float(s))
                except Exception: return 0

            units = parse_num(units_raw)

            if is_na(code_raw):
                if units > 0:
                    logger.debug(f"DEBUG: Row {idx} skipped: Subtotal row (units={units}, code=None)")
                    continue
                if not is_na(name_raw) and current_year_context == 'Elective':
                    sub_cat = str(name_raw).strip()
                    if sub_cat and len(sub_cat) > 3:
                        current_sem_context = sub_cat
                        logger.debug(f"DEBUG: Found Elective Sub-category at row {idx}: {sub_cat}")
                continue

            code = str(int(code_raw)) if isinstance(code_raw, float) and code_raw.is_integer() else str(code_raw).strip()
            name = str(name_raw).strip() if not is_na(name_raw) else ""
            logger.debug(f"DEBUG: Found Subject candidate at row {idx}: {code} - {name} ({units} units)")

            current_identifier = (code, name, units)
            if current_identifier == last_row_identifier:
                continue
            last_row_identifier = current_identifier

            blacklist = [
                'prepared:', 'noted:', 'approved:', 'grade', 'course code', 'course title',
                'total units', 'summary of units', 'signature', 'printed name', 'page ', 'rev.'
            ]
            if not code or any(b in code.lower() for b in blacklist) or len(code) < 2:
                continue

            lec_units = parse_num(row[col_map['lec_units']] if 'lec_units' in col_map and col_map['lec_units'] < len(row) else 0)
            lab_units = parse_num(row[col_map['lab_units']] if 'lab_units' in col_map and col_map['lab_units'] < len(row) else 0)

            if units == 0 and (lec_units > 0 or lab_units > 0):
                units = lec_units + lab_units

            if units == 0: continue

            if any(k in name.lower() for k in ["course title", "subtotal", "total units", "description"]):
                continue

            def clean_prereqs(val):
                if not val or is_na(val): return None
                s = str(val).lower().strip()
                if s in ['none', 'n/a', '0', 'nan', 'none.', 'no']: return None
                parts = str(val).replace('\r\n', ',').replace('\n', ',').replace('&', ',').replace(';', ',').replace(' AND ', ',').replace(' OR ', ',')
                raw_tokens = [c.strip().upper() for c in parts.split(',') if c and c.strip()]
                codes: list[str] = []
                for tok in raw_tokens:
                    tok_clean = re.sub(r"\s+", " ", tok).strip()
                    if tok_clean in {"AND", "OR", "NONE", "N/A", "0"}: continue
                    if tok_clean:
                        codes.append(tok_clean)
                return ", ".join(codes) if codes else None

            pre_req_raw = row[col_map['pre_requisite']] if 'pre_requisite' in col_map and col_map['pre_requisite'] < len(row) else None
            pre_req = clean_prereqs(pre_req_raw)
            is_major_val = not any(code.upper().strip().startswith(prefix) for prefix in ('CORE', 'PEED', 'NSTP', 'LSVI', 'GE', 'RZAL', 'RIZAL'))

            ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", code, re.IGNORECASE)
            if ab_match and lab_units > 0 and lec_units > 0:
                base_code = ab_match.group(1).strip()
                code_a = f"{base_code}A"
                code_b = f"{base_code}B"

                u_lec = lec_units
                u_lab = lab_units

                split_specs = [
                    (code_a, "lecture", u_lec, u_lec, 0),
                    (code_b, "lab", u_lab, 0, u_lab)
                ]

                for ccode, ctype_val, u_val, lec_u, lab_u in split_specs:
                    item_data = {
                        "block_id": curriculum_block.id,
                        "code": ccode, "name": name, "units": u_val, "type": ctype_val,
                        "department_id": target_dept_id, "program_code": program_code,
                        "year_level": current_year_context, "semester_term": current_sem_context,
                        "lec_units": lec_u, "lab_units": lab_u, "pre_requisite": pre_req,
                        "is_major": is_major_val,
                        "validation_issues": []
                    }

                    is_duplicate_in_run = any(i.code == ccode for i in items_to_add)
                    if is_duplicate_in_run:
                        item_data["validation_issues"].append("Duplicate: Already exists in this file")
                        skipped_items.append({**item_data, "reason": "Already exists in this file"})
                    else:
                        items_to_add.append(models.Curriculum(
                            block_id=curriculum_block.id,
                            code=ccode, name=name, units=u_val, type=ctype_val,
                            department_id=target_dept_id, program_code=program_code,
                            year_level=current_year_context, semester_term=current_sem_context,
                            lec_units=lec_u, lab_units=lab_u, pre_requisite=pre_req,
                            is_major=is_major_val
                        ))
                    all_parsed_data.append(item_data)
                    logger.debug(f"DEBUG: Captured split A/B subject: {ccode} ({ctype_val})")
                continue

            if lec_units > 0 and lab_units == 0:
                ctype = 'lecture'
            elif lec_units == 0 and lab_units > 0:
                ctype = 'lab'
            else:
                if code.upper().endswith('B') or 'lab' in name.lower() or 'laboratory' in name.lower():
                    ctype = 'lab'
                else:
                    ctype = 'lecture'

            item_data = {
                "block_id": curriculum_block.id,
                "code": code, "name": name, "units": units, "type": ctype,
                "department_id": target_dept_id, "program_code": program_code,
                "year_level": current_year_context, "semester_term": current_sem_context,
                "lec_units": lec_units, "lab_units": lab_units, "pre_requisite": pre_req,
                "is_major": is_major_val,
                "validation_issues": []
            }

            if (lec_units > 0 or lab_units > 0) and units != (lec_units + lab_units):
                item_data["validation_issues"].append(
                    f"Unit Mismatch: Total ({units}) != Lec ({lec_units}) + Lab ({lab_units})"
                )

            if not current_year_context or not current_sem_context:
                item_data["validation_issues"].append(
                    "WARNING: Year/Semester context could not be determined"
                )

            is_duplicate_in_run = any(i.code == code for i in items_to_add)

            if is_duplicate_in_run:
                item_data["validation_issues"].append("Duplicate: Already exists in this file")
                skipped_items.append({**item_data, "reason": "Already exists in this file"})
            else:
                items_to_add.append(models.Curriculum(
                    block_id=curriculum_block.id,
                    code=code, name=name, units=units, type=ctype,
                    department_id=target_dept_id, program_code=program_code,
                    year_level=current_year_context, semester_term=current_sem_context,
                    lec_units=lec_units, lab_units=lab_units, pre_requisite=pre_req,
                    is_major=is_major_val
                ))
            all_parsed_data.append(item_data)
            logger.debug(f"DEBUG: Successfully captured subject: {code}")

        total_units_extracted = sum(item["units"] for item in all_parsed_data)
        excel_grand_total = 0
        summary_labels_values = []

        found_summary_start = -1
        for i, row in enumerate(raw_rows):
            row_text = " ".join([str(v).strip().upper() for v in row if not is_na(v)])
            if "SUMMARY OF UNITS" in row_text or "TOTAL UNITS" in row_text:
                found_summary_start = i
                break

        if found_summary_start != -1:
            for i in range(found_summary_start, len(raw_rows)):
                s_row = raw_rows[i]
                s_row_text = " ".join([str(v).strip().upper() for v in s_row if not is_na(v)])
                numeric_vals = [v for v in s_row if isinstance(v, (int, float)) and v > 0]
                label_vals = [v.strip() for v in s_row if isinstance(v, str) and len(v.strip()) > 2]
                if numeric_vals:
                    val = numeric_vals[-1]
                    label = label_vals[0] if label_vals else "Unnamed Category"
                    summary_labels_values.append({"label": label, "value": val})
                    if "TOTAL" in s_row_text or i == len(raw_rows) - 1:
                        excel_grand_total = val

        structured_zones = []
        zone_map: Dict[Any, Any] = {}
        for item in all_parsed_data:
            zone_key = (item["year_level"], item["semester_term"])
            if zone_key not in zone_map:
                zone_map[zone_key] = {
                    "year": item["year_level"],
                    "semester": item["semester_term"],
                    "subjects": [],
                    "zone_total": 0
                }
                structured_zones.append(zone_map[zone_key])

            zone_map[zone_key]["subjects"].append(item)
            zone_map[zone_key]["zone_total"] += item["units"]

        validation_status = "Match"
        if excel_grand_total > 0 and abs(total_units_extracted - excel_grand_total) > 0.5:
            validation_status = f"Discrepancy: Excel says {excel_grand_total}, Parser found {total_units_extracted}"

        summary = {
            "program_name": extracted_program_name,
            "academic_year": extracted_ay,
            "selected_sheet": best_sheet,
            "available_sheets": wb.sheetnames,
            "sheet_auto_selected": sheet_auto_selected,
            "selected_sheet_reason": (
                f"Reading '{best_sheet}' because it has Course Code, Title, Units and Lec/Lab columns (confidence {max_score})."
                if sheet_auto_selected
                else f"Reading '{best_sheet}' because you chose it."
            ),
            "scanned_rows": len(raw_rows),
            "total_rows": len(all_parsed_data),
            "detected_subjects": len(all_parsed_data),
            "created_subjects": len(items_to_add),
            "valid_new_items": len(items_to_add),
            "duplicates_skipped": len(skipped_items),
            "skipped_rows": len(skipped_items),
            "issues_found": sum(1 for i in all_parsed_data if i["validation_issues"]),
            "warnings_count": sum(1 for i in all_parsed_data if i["validation_issues"]),
            "errors_count": len(skipped_items),
            "unit_validation": validation_status,
            "excel_total": excel_grand_total,
            "parser_total": total_units_extracted,
            "summary_details": summary_labels_values
        }

        if dry_run:
            return {
                "is_dry_run": True,
                "message": f"Dry run complete. {summary['issues_found']} items have potential issues. {validation_status}",
                "summary": summary,
                "zones": structured_zones,
                "report": all_parsed_data,
                "errors": skipped_items,
                "course": program_code
            }

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()

            log_activity(db, current_user.id, "Import Curriculum", f"Imported {len(items_to_add)} items for {extracted_program_name}", "success", department_id=target_dept_id)  # type: ignore

            return {
                "is_dry_run": False,
                "message": f"Successfully imported {len(items_to_add)} items",
                "summary": summary,
                "zones": structured_zones,
                "errors": skipped_items,
                "course": program_code
            }
        else:
            return {
                "is_dry_run": False,
                "message": "No new items to import",
                "summary": summary,
                "zones": structured_zones,
                "errors": skipped_items,
                "course": program_code
            }

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
