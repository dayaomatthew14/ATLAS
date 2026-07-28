from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import io
import json
import re
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/curriculum",
    tags=["Curriculum"]
)

@router.get("/blocks", response_model=List[schemas.CurriculumBlockWithCount])
def get_curriculum_blocks(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.CurriculumBlock)
    
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.CurriculumBlock.department_id == dept.id)
        else:
            return []

    blocks = query.all()
    results = []
    
    for block in blocks:
        subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
        subject_count = len(subjects)
        total_units = sum(s.units for s in subjects)
        
        results.append({
            "id": block.id,
            "program_name": block.program_name,
            "academic_year": block.academic_year,
            "filename": block.filename,
            "department_id": block.department_id,
            "created_at": block.created_at,
            "subject_count": subject_count,
            "total_units": total_units
        })
        
    return results

@router.get("", response_model=List[schemas.CurriculumResponse])
def get_curriculum(
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    program_code: Optional[str] = None,
    block_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Curriculum)
    
    if current_user.role == 'program_chair' and current_user.department:
        # Filter curriculum by the program chair's department
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Curriculum.department_id == dept.id)
        else:
            return [] # No department match means no access
    elif department_id:
        query = query.filter(models.Curriculum.department_id == department_id)

    if program_code:
        query = query.filter(models.Curriculum.program_code == program_code)
    
    if block_id:
        query = query.filter(models.Curriculum.block_id == block_id)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{curriculum_id}", response_model=schemas.CurriculumResponse)
def get_curriculum_item(
    curriculum_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    curriculum_item = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not curriculum_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == curriculum_item.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this curriculum item")
            
    return curriculum_item

@router.post("", response_model=schemas.CurriculumResponse, status_code=status.HTTP_201_CREATED)
def create_curriculum_item(
    curriculum_item: schemas.CurriculumCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            curriculum_item.department_id = int(dept.id) # type: ignore
        elif not curriculum_item.department_id:
            first_dept = db.query(models.Department).first()
            if first_dept:
                curriculum_item.department_id = int(first_dept.id) # type: ignore
    elif not curriculum_item.department_id:
        first_dept = db.query(models.Department).first()
        if first_dept:
            curriculum_item.department_id = int(first_dept.id) # type: ignore
             
    db_curriculum = db.query(models.Curriculum).filter(
        models.Curriculum.code == curriculum_item.code,
        models.Curriculum.program_code == curriculum_item.program_code
    ).first()
    if db_curriculum:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Curriculum item with this code already exists for this program")
        
    new_curriculum = models.Curriculum(**curriculum_item.model_dump())
    db.add(new_curriculum)
    db.commit()
    db.refresh(new_curriculum)
    
    log_activity(db, current_user.id, "Create Curriculum", f"Created subject: {new_curriculum.code}", "success", department_id=new_curriculum.department_id) # type: ignore
    
    return new_curriculum

@router.put("/{curriculum_id}", response_model=schemas.CurriculumResponse)
def update_curriculum_item(
    curriculum_id: int, 
    curriculum_item: schemas.CurriculumUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not db_curriculum:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == db_curriculum.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this curriculum item")
             
    update_data = curriculum_item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_curriculum, key, value)
        
    db.commit()
    db.refresh(db_curriculum)
    
    log_activity(db, current_user.id, "Update Curriculum", f"Updated subject: {db_curriculum.code}", "success", department_id=db_curriculum.department_id) # type: ignore
    
    return db_curriculum

@router.delete("/{curriculum_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_curriculum_item(
    curriculum_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not db_curriculum:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == db_curriculum.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this curriculum item")
             
    curr_code = db_curriculum.code
    dept_id = db_curriculum.department_id
    db.delete(db_curriculum)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Curriculum", f"Deleted subject: {curr_code}", "success", department_id=dept_id)
    
    return None

async def _process_curriculum_import(
    contents: bytes,
    department_id: Optional[int],
    program_code: Optional[str],
    dry_run: bool,
    db: Session,
    current_user: models.User,
    custom_mapping: Optional[str] = None
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Determine target department
    target_dept_id = department_id
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            raise HTTPException(status_code=400, detail="User department not found")
        target_dept_id = dept.id
    elif not target_dept_id:
        first_dept = db.query(models.Department).first()
        if not first_dept:
             raise HTTPException(status_code=400, detail="No departments found in system")
        target_dept_id = first_dept.id

    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
        
        items_to_add = []
        skipped_items = []
        all_parsed_data = [] 
        found_valid_sheet = False
        
        mapping_keywords = {
            'code': ["course code", "code", "subject code", "catalog"],
            'name': ["course title", "title", "subject name", "description", "subject"],
            'units': ["units", "unit", "credit", "total units"],
            'lec_units': ["lec", "lecture"],
            'lab_units': ["lab", "laboratory"],
            'pre_requisite': ["pre-req", "prerequisite", "pre-requisite"],
            'year_level': ["year", "yr"],
            'semester_term': ["sem", "semester", "term"]
        }

        if custom_mapping:
            try:
                user_map = json.loads(custom_mapping)
                for k, v in user_map.items():
                    if k in mapping_keywords:
                        mapping_keywords[k] = [v] if isinstance(v, str) else v
            except:
                pass

        # STEP 0 — CURRICULUM BLOCK ISOLATION (IMPORT IDENTITY RULE)
        best_sheet = None
        max_score = 0
        extracted_program_name = "Unknown Program"
        extracted_ay = "Unknown AY"
        
        # Probe all sheets for the DLSAU header and extract Identity
        for sheet_name in xl.sheet_names:
            df_probe = pd.read_excel(xl, sheet_name=sheet_name, nrows=15, header=None)
            probe_text = " ".join([str(v).upper() for v in df_probe.values.flatten() if pd.notna(v)])
            
            if "DE LA SALLE ARANETA UNIVERSITY" in probe_text:
                # Extract Academic Year (e.g., "AY 2026")
                ay_match = re.search(r'AY\s*(\d{4})', probe_text)
                ay_val = f"AY {ay_match.group(1)}" if ay_match else "Unknown AY"
                
                # Extract Program Name
                # Heuristic: Find common program strings or look for lines after DLSAU
                program_patterns = [
                    r'BACHELOR OF SCIENCE IN [A-Z\s]+',
                    r'BACHELOR OF [A-Z\s]+',
                    r'ASSOCIATE IN [A-Z\s]+'
                ]
                prog_name = "Unknown Program"
                for pattern in program_patterns:
                    match = re.search(pattern, probe_text)
                    if match:
                        prog_name = match.group(0).strip()
                        break
                
                score = (int(ay_match.group(1)) * 10 if ay_match else 0) + (5 if 'UPDATED' in str(sheet_name).upper() else 0)
                if not ay_match: score += 1
                
                if score > max_score:
                    max_score = score
                    best_sheet = sheet_name
                    extracted_program_name = prog_name
                    extracted_ay = ay_val

        if not best_sheet:
            raise HTTPException(status_code=400, detail="Could not identify the curriculum sheet. Ensure it contains 'DE LA SALLE ARANETA UNIVERSITY'.")

        if program_code:
            extracted_program_name = program_code

        print(f"DEBUG: Identity Detected -> Program: {extracted_program_name}, Year: {extracted_ay}")

        # Duplicate Import Handling
        existing_block = db.query(models.CurriculumBlock).filter(
            models.CurriculumBlock.program_name == extracted_program_name,
            models.CurriculumBlock.academic_year == extracted_ay,
            models.CurriculumBlock.department_id == target_dept_id
        ).first()

        # If a match exists and we aren't explicitly replacing, throw a special error
        # The frontend will catch this and ask the user to 'Replace' (which would pass a replace=true flag)
        replace_existing = False # This should come from Form params
        
        if existing_block and not dry_run:
            # Check if 'replace' was passed in the future? 
            # For now, let's implement the 'Ask' via a 409 Conflict status
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, 
                detail={
                    "message": f"A curriculum block for '{extracted_program_name}' ({extracted_ay}) already exists.",
                    "block_id": existing_block.id,
                    "program": extracted_program_name,
                    "ay": extracted_ay
                }
            )

        # Create the Isolated Block (if not dry run)
        curriculum_block = None
        if not dry_run:
            curriculum_block = models.CurriculumBlock(
                program_name=extracted_program_name,
                academic_year=extracted_ay,
                department_id=target_dept_id,
                filename="Uploaded File" # Placeholder
            )
            db.add(curriculum_block)
            db.flush() # Get the ID without committing yet

        # STEP 3 — PRE-PROCESSING (Rule 197 - Precise Merged Cell Handling)
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(contents), data_only=True)
        
        if best_sheet not in wb.sheetnames:
            raise HTTPException(status_code=400, detail="Identified sheet not found in workbook.")
            
        ws = wb[str(best_sheet)] # type: ignore
        
        # Explicitly unmerge and fill ONLY within actual merged regions
        # This preserves genuinely empty cells (like identifier columns in totals rows)
        merged_cells = list(ws.merged_cells.ranges)
        for merged_range in merged_cells:
            min_col, min_row, max_col, max_row = merged_range.bounds
            top_left_value = ws.cell(row=min_row, column=min_col).value
            ws.unmerge_cells(str(merged_range))
            for r in range(min_row, max_row + 1):
                for c in range(min_col, max_col + 1):
                    ws.cell(row=r, column=c).value = top_left_value # type: ignore
        
        # Convert the precisely-filled sheet to a DataFrame
        data = list(ws.values)
        df = pd.DataFrame(data)
        
        # Helper functions for context normalization
        def normalize_year(value: object) -> Optional[str]:
            if value is None or (isinstance(value, float) and pd.isna(value)):
                return None
            s = str(value).strip().upper()
            if not s or s in {"NAN", "NONE", "N/A"}: return None
            m = re.search(r"\b([1-5])\b", s)
            if m: return m.group(1)
            m = re.search(r"\b(1ST|2ND|3RD|4TH|5TH)\b", s)
            if m: return m.group(1)[0]
            word_map = {"FIRST": "1", "SECOND": "2", "THIRD": "3", "FOURTH": "4", "FIFTH": "5"}
            for k, v in word_map.items():
                if k in s: return v
            return None

        def normalize_semester(value: object) -> Optional[str]:
            if value is None or (isinstance(value, float) and pd.isna(value)):
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
        
        # STEP 7 — DEDUPLICATION TRACKER (Rule 259)
        last_row_identifier = None
        current_year_context = None
        current_sem_context = None
        is_in_active_zone = False
        looking_for_headers = False
        col_map = {} 

        for idx, row in df.iterrows():
            row_text = " ".join([str(v).strip().upper() for v in row.values if pd.notna(v)])
            if not row_text: continue

            # 1. Zone Header Detection
            y_match = re.search(r'(1ST|2ND|3RD|4TH|5TH|FIRST|SECOND|THIRD|FOURTH|FIFTH)\s+YEAR|YEAR\s+([1-5])', row_text)
            s_match = re.search(r'(1ST|2ND|3RD|FIRST|SECOND|THIRD)\s+(SEMESTER|TERM)|(3RD SEMESTER|MIDYEAR)', row_text)
            
            if y_match and s_match:
                y_raw = y_match.group(1) or y_match.group(2)
                s_raw = s_match.group(1) or s_match.group(3)
                current_year_context = normalize_year(y_raw)
                current_sem_context = normalize_semester(s_raw)
                is_in_active_zone = True
                looking_for_headers = True 
                col_map = {} 
                last_row_identifier = None # Reset for new zone
                print(f"DEBUG: Found Zone Header at row {idx}: {current_year_context} - {current_sem_context}")
                continue

            # 4th Year Close Condition (Rule 215) & Electives Start (Rule 226)
            if "ELECTIVES" in row_text and not (y_match and s_match):
                current_year_context = 'Elective'
                current_sem_context = 'Elective'
                is_in_active_zone = True
                looking_for_headers = True
                col_map = {}
                last_row_identifier = None # Reset for new zone
                continue

            # Summary of Units Trigger (Close Electives/All Zones) - Step 4 Rule 229
            if "SUMMARY OF UNITS" in row_text or "TOTAL UNITS" in row_text:
                is_in_active_zone = False
            
            if not is_in_active_zone:
                continue

            # 2. Dynamic Column Detection
            if looking_for_headers:
                row_vals = [str(v).strip().lower() for v in row.values]
                temp_map = {}
                for key, keywords in mapping_keywords.items():
                    for i, val in enumerate(row_vals):
                        if any(k == val or (len(k) > 3 and k in val) for k in keywords):
                            if key == 'units' and any(k in val for k in ["lec", "lab"]): continue
                            temp_map[key] = i
                            break
                if 'code' in temp_map:
                    col_map = temp_map
                    looking_for_headers = False 
                    print(f"DEBUG: Mapped columns at row {idx}: {col_map}")
                continue

            # 3. Subject Row Capture
            if not col_map or 'code' not in col_map: continue
            
            code_raw = row[col_map['code']]
            name_raw = row[col_map['name']] if 'name' in col_map else ""
            units_raw = row[col_map['units']] if 'units' in col_map else 0
            
            def parse_num(val):
                if pd.isna(val): return 0
                s = re.sub(r'[\(\)\[\]\*\s]', '', str(val).strip())
                try: return int(float(s))
                except: return 0
            
            units = parse_num(units_raw)
            
            if pd.isna(code_raw):
                if units > 0:
                    print(f"DEBUG: Row {idx} skipped: Subtotal row (units={units}, code=None)")
                    continue 
                if not pd.isna(name_raw) and current_year_context == 'Elective':
                    sub_cat = str(name_raw).strip()
                    if sub_cat and len(sub_cat) > 3:
                        current_sem_context = sub_cat
                        print(f"DEBUG: Found Elective Sub-category at row {idx}: {sub_cat}")
                continue
            
            # Cleanup code and name for identifier
            code = str(int(code_raw)) if isinstance(code_raw, float) and code_raw.is_integer() else str(code_raw).strip()
            name = str(name_raw).strip() if not pd.isna(name_raw) else ""
            print(f"DEBUG: Found Subject candidate at row {idx}: {code} - {name} ({units} units)")
            # STEP 7 — CONSECUTIVE DEDUPLICATION (Scenario A, Rule 260)
            current_identifier = (code, name, units)
            if current_identifier == last_row_identifier:
                continue # Skip merged cell artifact
            last_row_identifier = current_identifier
            blacklist = [
                'prepared:', 'noted:', 'approved:', 'grade', 'course code', 'course title', 
                'total units', 'summary of units', 'signature', 'printed name', 'page ', 'rev.'
            ]
            if not code or any(b in code.lower() for b in blacklist) or len(code) < 2:
                continue
            
            lec_units = parse_num(row[col_map['lec_units']] if 'lec_units' in col_map else 0)
            lab_units = parse_num(row[col_map['lab_units']] if 'lab_units' in col_map else 0)
            
            if units == 0 and (lec_units > 0 or lab_units > 0):
                units = lec_units + lab_units
            
            # Rule 205: Must have non-zero Units
            if units == 0: continue

            if any(k in name.lower() for k in ["course title", "subtotal", "total units", "description"]):
                continue

            def clean_prereqs(val):
                if not val or pd.isna(val): return None
                s = str(val).lower().strip()
                if s in ['none', 'n/a', '0', 'nan', 'none.', 'no']: return None
                parts = str(val).replace('&', ',').replace(';', ',').replace(' and ', ',').replace(' or ', ',')
                raw_tokens = [c.strip().upper() for c in parts.split(',') if c and c.strip()]
                codes: list[str] = []
                for tok in raw_tokens:
                    if tok in {"AND", "OR", "NONE", "N/A"}: continue
                    if re.match(r"^[A-Z]{2,}[A-Z0-9\-\s]*\d+[A-Z0-9\-\s]*$", tok):
                        codes.append(re.sub(r"\s+", " ", tok))
                return ",".join(codes) if codes else None

            pre_req = clean_prereqs(row[col_map['pre_requisite']] if 'pre_requisite' in col_map else None)
            ctype = 'lecture'
            if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B') or lab_units > 0:
                ctype = 'lab'

            is_major_val = not any(code.upper().strip().startswith(prefix) for prefix in ('CORE', 'PEED', 'NSTP', 'LSVI', 'GE', 'RZAL', 'RIZAL'))

            item_data = {
                "block_id": curriculum_block.id if curriculum_block else None,
                "code": code, "name": name, "units": units, "type": ctype,
                "department_id": target_dept_id, "program_code": program_code,
                "year_level": current_year_context, "semester_term": current_sem_context,
                "lec_units": lec_units, "lab_units": lab_units, "pre_requisite": pre_req,
                "pre_requisites": pre_req, "year": current_year_context, "semester": current_sem_context, "course": program_code,
                "is_major": is_major_val,
                "validation_issues": []
            }
            
            # Duplication check WITHIN the block (Step 0 rule: Isolated)
            is_duplicate_in_run = any(i.code == code for i in items_to_add)

            if is_duplicate_in_run:
                item_data["validation_issues"].append("Duplicate: Already exists in this file")
                skipped_items.append({**item_data, "reason": "Already exists in this file"})
            else:
                items_to_add.append(models.Curriculum(
                    block_id=curriculum_block.id if curriculum_block else None,
                    code=code, name=name, units=units, type=ctype,
                    department_id=target_dept_id, program_code=program_code,
                    year_level=current_year_context, semester_term=current_sem_context,
                    lec_units=lec_units, lab_units=lab_units, pre_requisite=pre_req,
                    is_major=is_major_val
                ))
            all_parsed_data.append(item_data)
            print(f"DEBUG: Successfully captured subject: {code}")

        # STEP 6 — SUMMARY OF UNITS (VALIDATION ONLY)
        total_units_extracted = sum(item["units"] for item in all_parsed_data)
        excel_grand_total = 0
        summary_labels_values = []

        found_summary_start = -1
        for i, row in df.iterrows():
            row_text = " ".join([str(v).strip().upper() for v in row.values if pd.notna(v)])
            if "SUMMARY OF UNITS" in row_text or "TOTAL UNITS" in row_text:
                found_summary_start = int(i) # type: ignore
                break
        
        if found_summary_start != -1:
            for i in range(found_summary_start, len(df)):
                s_row = df.iloc[i]
                s_row_text = " ".join([str(v).strip().upper() for v in s_row.values if pd.notna(v)])
                numeric_vals = [v for v in s_row.values if isinstance(v, (int, float)) and v > 0]
                label_vals = [v.strip() for v in s_row.values if isinstance(v, str) and len(v) > 2]
                if numeric_vals:
                    val = numeric_vals[-1]
                    label = label_vals[0] if label_vals else "Unnamed Category"
                    summary_labels_values.append({"label": label, "value": val})
                    if "TOTAL" in s_row_text or i == len(df) - 1:
                        excel_grand_total = val

        # STEP 8 — OUTPUT STRUCTURE (FULLY DYNAMIC)
        # Group subjects into structured zones as required by Rule 282
        structured_zones = []
        zone_map = {}
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
            "total_rows": len(all_parsed_data),
            "valid_new_items": len(items_to_add),
            "duplicates_skipped": len(skipped_items),
            "issues_found": sum(1 for i in all_parsed_data if i["validation_issues"]),
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
                "zones": structured_zones, # Structured output (Step 8)
                "report": all_parsed_data, # Flat list for Dayao's Frontend compatibility
                "errors": skipped_items,
                "course": program_code
            }

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()
            
            log_activity(db, current_user.id, "Import Curriculum", f"Imported {len(items_to_add)} items for {extracted_program_name}", "success", department_id=target_dept_id) # type: ignore
            
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

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.post("/import", response_model=schemas.ImportResponse)
async def import_curriculum(
    file: UploadFile = File(...),
    department_id: Optional[int] = Form(None),
    program_code: Optional[str] = Form(None),
    dry_run: bool = Form(False),
    mapping: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    return await _process_curriculum_import(contents, department_id, program_code, dry_run, db, current_user, mapping)

@router.post("/bulk", response_model=schemas.ImportResponse)
def bulk_create_curriculum(
    payload: schemas.BulkImportRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    try:
        # Step 0: Ensure Curriculum Block exists or create it
        if current_user.role == 'program_chair':
            dept = db.query(models.Department).filter(
                (models.Department.code == current_user.department) | 
                (models.Department.name == current_user.department)
            ).first()
            if not dept or dept.id != payload.department_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to import for this department")

        block = db.query(models.CurriculumBlock).filter(
            models.CurriculumBlock.program_name == payload.program_name,
            models.CurriculumBlock.academic_year == payload.academic_year,
            models.CurriculumBlock.department_id == payload.department_id
        ).first()

        if not block:
            block = models.CurriculumBlock(
                program_name=payload.program_name,
                academic_year=payload.academic_year,
                department_id=payload.department_id,
                filename="Bulk Import"
            )
            db.add(block)
            db.flush()

        new_items = []
        skipped_items = []
        for item in payload.items:
            # Check if code already exists IN THIS BLOCK
            existing = db.query(models.Curriculum).filter(
                models.Curriculum.block_id == block.id,
                func.lower(models.Curriculum.code) == item.code.lower()
            ).first()

            if not existing:
                new_item = models.Curriculum(**item.model_dump())
                new_item.block_id = block.id
                new_items.append(new_item)
            else:
                skipped_items.append({"code": item.code, "name": item.name, "reason": "Already exists in this block"})
        
        if new_items:
            db.add_all(new_items)
            db.commit()
            
            log_activity(db, current_user.id, "Bulk Create Curriculum", f"Bulk created {len(new_items)} items for {payload.program_name}", "success", department_id=payload.department_id)
        
        summary = {
            "program_name": payload.program_name,
            "academic_year": payload.academic_year,
            "total_rows": len(payload.items),
            "valid_new_items": len(new_items),
            "duplicates_skipped": len(skipped_items),
            "issues_found": 0
        }
        return {
            "is_dry_run": False,
            "message": f"Successfully committed {len(new_items)} items to {payload.program_name}.",
            "summary": summary,
            "report": None,
            "errors": skipped_items
        }
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Bulk commit failed: {str(e)}")

@router.post("/headers")
async def get_excel_headers(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    contents = await file.read()
    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
        sheets_data = {}
        for sheet in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet, nrows=10, header=None)
            if df.empty: continue
            rows = []
            for _, row in df.iterrows():
                rows.append([str(v) if not pd.isna(v) else "" for v in row.values])
            sheets_data[sheet] = {"sample_rows": rows, "sheet_name": sheet}
        return sheets_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

@router.delete("/course/{course_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_course(
    course_name: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    db.query(models.Curriculum).filter(models.Curriculum.program_code == course_name).delete(synchronize_session=False)
    db.commit()
    
    # Get department for logging
    dept = db.query(models.Department).filter(
        (models.Department.code == current_user.department) | 
        (models.Department.name == current_user.department)
    ).first()
    log_activity(db, current_user.id, "Delete Course", f"Deleted all items for course: {course_name}", "success", department_id=dept.id if dept else None) # type: ignore
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.delete("/block/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_block(
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # Get block details for logging before deletion
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    block_name = block.program_name if block else str(block_id)
    dept_id = block.department_id if block else None

    # Delete all subjects in the block first
    db.query(models.Curriculum).filter(models.Curriculum.block_id == block_id).delete(synchronize_session=False)
    # Then delete the block itself
    db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).delete(synchronize_session=False)
    
    db.commit()
    
    log_activity(db, current_user.id, "Delete Block", f"Deleted curriculum block: {block_name}", "success", department_id=dept_id) # type: ignore
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_item(
    id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    item = db.query(models.Curriculum).filter(models.Curriculum.id == id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
