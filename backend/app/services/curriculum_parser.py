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
    if current_user.role not in ['admin', 'dean']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only System Administrators and Deans can import curriculum Excel files"
        )

    # Determine target department
    target_dept_id = department_id
    if current_user.role == 'dean':
        user_dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if not user_dept:
            raise HTTPException(status_code=400, detail="Dean department not found")
        target_dept_id = user_dept.id
    elif not target_dept_id:
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

        from . import curriculum_sheet_helpers as _csh

        best_sheet, max_score, sheet_auto_selected = _csh.select_best_worksheet(
            wb, mapping_keywords, program_patterns, selected_sheet
        )
        logger.debug(f"DEBUG: Selected sheet '{best_sheet}' with confidence score {max_score}")
        ws_best = wb[best_sheet]
        extracted_ay, extracted_program_name, program_code, full_block_name = _csh.extract_program_metadata(
            ws_best, best_sheet, program_patterns
        )

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
        raw_rows = _csh.unmerge_and_read_rows(ws)

        last_row_identifier = None
        current_year_context = None
        current_sem_context = None
        is_in_active_zone = False
        seen_any_section = False
        col_map = {}

        blacklist = (
            'prepared:', 'noted:', 'approved:', 'grade', 'course code', 'course title',
            'total units', 'summary of units', 'signature', 'printed name', 'page ', 'rev.'
        )

        for idx, row in enumerate(raw_rows):
            row_text = " ".join(str(v).strip().upper() for v in row if not is_na(v))
            if not row_text:
                continue

            cell_strs = [str(v).strip() for v in row if not is_na(v)]
            looks_like_subject = (
                any(re.match(r'^[A-Z]{2,6}\s?\d{2,4}', c.upper()) for c in cell_strs)
                and any(re.fullmatch(r'\d{1,2}(\.\d+)?', c) for c in cell_strs)
            )

            y_match = None if looks_like_subject else re.search(
                r'(1ST|2ND|3RD|4TH|5TH|6TH|FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH)\s+YEAR|YEAR\s+([1-6])',
                row_text,
            )
            s_match = None if looks_like_subject else re.search(
                r'(1ST|2ND|3RD|FIRST|SECOND|THIRD)\s+(SEMESTER|TERM)|(3RD SEMESTER|MIDYEAR)',
                row_text,
            )

            section_updated = False
            if y_match:
                norm_y = _csh.normalize_year(y_match.group(1) or y_match.group(2))
                if norm_y:
                    current_year_context = norm_y
                    section_updated = True
            if s_match:
                norm_s = _csh.normalize_semester(s_match.group(1) or s_match.group(3))
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
                        if key == 'units' and any(k in val for k in ("lec", "lab")):
                            continue
                        temp_map[key] = i
                        break

            if 'code' in temp_map:
                col_map = temp_map
                is_in_active_zone = True
                if not seen_any_section:
                    current_year_context = current_year_context or '1'
                    current_sem_context = current_sem_context or '1st'
                logger.debug(f"DEBUG: Mapped columns at row {idx}: {col_map}")
                continue

            if not is_in_active_zone or not col_map or 'code' not in col_map:
                continue
            if not current_year_context or not current_sem_context or not current_year_context.isdigit():
                continue

            code_raw = row[col_map['code']] if col_map['code'] < len(row) else None
            name_raw = row[col_map['name']] if 'name' in col_map and col_map['name'] < len(row) else ""
            units_raw = row[col_map['units']] if 'units' in col_map and col_map['units'] < len(row) else 0
            units = _csh.parse_numeric_cell(units_raw)

            if is_na(code_raw):
                if units > 0:
                    logger.debug(f"DEBUG: Row {idx} skipped: Subtotal row (units={units}, code=None)")
                    continue
                if not is_na(name_raw) and current_year_context == 'Elective':
                    sub_cat = str(name_raw).strip()
                    if len(sub_cat) > 3:
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

            if not code or any(b in code.lower() for b in blacklist) or len(code) < 2:
                continue

            lec_units = _csh.parse_numeric_cell(row[col_map['lec_units']] if 'lec_units' in col_map and col_map['lec_units'] < len(row) else 0)
            lab_units = _csh.parse_numeric_cell(row[col_map['lab_units']] if 'lab_units' in col_map and col_map['lab_units'] < len(row) else 0)
            if units == 0 and (lec_units > 0 or lab_units > 0):
                units = lec_units + lab_units
            if units == 0 or any(k in name.lower() for k in ("course title", "subtotal", "total units", "description")):
                continue

            pre_req = _csh.clean_prerequisites(
                row[col_map['pre_requisite']] if 'pre_requisite' in col_map and col_map['pre_requisite'] < len(row) else None
            )
            is_major_val = not any(code.upper().strip().startswith(prefix) for prefix in ('CORE', 'PEED', 'NSTP', 'LSVI', 'GE', 'RZAL', 'RIZAL'))

            ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", code, re.IGNORECASE)
            if ab_match and lab_units > 0 and lec_units > 0:
                base_code = ab_match.group(1).strip()
                split_specs = [
                    (f"{base_code}A", "lecture", lec_units, lec_units, 0),
                    (f"{base_code}B", "lab", lab_units, 0, lab_units),
                ]
                for ccode, ctype_val, u_val, lec_u, lab_u in split_specs:
                    _csh.append_parsed_subject(
                        code=ccode, name=name, units=u_val, ctype=ctype_val,
                        lec_units=lec_u, lab_units=lab_u, pre_req=pre_req, is_major_val=is_major_val,
                        block_id=curriculum_block.id, target_dept_id=target_dept_id, program_code=program_code,
                        year_level=current_year_context, semester_term=current_sem_context,
                        items_to_add=items_to_add, skipped_items=skipped_items, all_parsed_data=all_parsed_data,
                    )
                    logger.debug(f"DEBUG: Captured split A/B subject: {ccode} ({ctype_val})")
                continue

            ctype, lec_units, lab_units = _csh.classify_subject_units(code, name, units, lec_units, lab_units)
            issues: list = []
            if (lec_units > 0 or lab_units > 0) and units != (lec_units + lab_units):
                issues.append(f"Unit Mismatch: Total ({units}) != Lec ({lec_units}) + Lab ({lab_units})")
            if not current_year_context or not current_sem_context:
                issues.append("WARNING: Year/Semester context could not be determined")

            item_data = {
                "block_id": curriculum_block.id,
                "code": code, "name": name, "units": units, "type": ctype,
                "department_id": target_dept_id, "program_code": program_code,
                "year_level": current_year_context, "semester_term": current_sem_context,
                "lec_units": lec_units, "lab_units": lab_units, "pre_requisite": pre_req,
                "is_major": is_major_val,
                "validation_issues": issues
            }

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
