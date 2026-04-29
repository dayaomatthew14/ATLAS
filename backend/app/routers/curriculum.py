from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import io
import json
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/curriculum",
    tags=["Curriculum"]
)

@router.get("/", response_model=List[schemas.CurriculumResponse])
def get_curriculum(
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    program_code: Optional[str] = None,
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

@router.post("/", response_model=schemas.CurriculumResponse, status_code=status.HTTP_201_CREATED)
def create_curriculum_item(
    curriculum_item: schemas.CurriculumCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == curriculum_item.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create curriculum for your department")
             
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
             
    db.delete(db_curriculum)
    db.commit()
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
        all_parsed_data = [] # To store all items for the review report
        found_valid_sheet = False
        
        # Keywords for column mapping
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

        for sheet in xl.sheet_names:
            df = pd.read_excel(xl, sheet_name=sheet, header=None)
            if df.empty: continue

            # 1. Identify Header Row & Column Map
            header_row_idx = -1
            col_map = {}
            
            for i in range(min(50, len(df))):
                row_vals = [str(v).strip().lower() for v in df.iloc[i].values]
                temp_map = {}
                
                for key, keywords in mapping_keywords.items():
                    for idx, val in enumerate(row_vals):
                        if any(k == val or (len(k) > 3 and k in val) for k in keywords):
                            # Prioritize exact matches for 'units' vs 'lec_units'
                            if key == 'units' and any(k in val for k in ["lec", "lab"]): continue
                            temp_map[key] = idx
                            break
                
                if 'code' in temp_map and 'name' in temp_map:
                    header_row_idx = i
                    col_map = temp_map
                    break
            
            if header_row_idx == -1: continue
            found_valid_sheet = True
            
            # 2. Extract and Clean Data
            data_df = df.iloc[header_row_idx + 1:].copy()
            
            # Robust Forward Fill for merged cells (Year and Semester)
            if 'year_level' in col_map:
                data_df.iloc[:, col_map['year_level']] = data_df.iloc[:, col_map['year_level']].ffill()
            if 'semester_term' in col_map:
                data_df.iloc[:, col_map['semester_term']] = data_df.iloc[:, col_map['semester_term']].ffill()
            
            current_year_context = "1"
            current_sem_context = "1st Semester"

            for _, row in data_df.iterrows():
                code_raw = row[col_map['code']]
                if pd.isna(code_raw): continue
                
                # Cleanup code
                code = str(int(code_raw)) if isinstance(code_raw, float) and code_raw.is_integer() else str(code_raw).strip()
                if not code or code.lower() in ['nan', 'none', 'course code', 'code'] or len(code) < 2:
                    continue

                name_raw = row[col_map['name']]
                name = str(name_raw).strip() if not pd.isna(name_raw) else ""
                if not name or name.lower() in ['nan', 'none', 'course title', 'title']:
                    continue

                # Parsing helper for numbers (Handle (2), [3], etc.)
                def parse_num(val, default=0):
                    if pd.isna(val): return default
                    s = str(val).strip()
                    # Remove parentheses, brackets, and non-numeric suffixes
                    s = re.sub(r'[\(\)\[\]\*\s]', '', s)
                    try: 
                        return int(float(s))
                    except: 
                        return default

                # CONTEXT-AWARE TRACKING (Sprint 9 Optimization)
                # If the row contains "YEAR" or "SEMESTER" but is not a subject row, update context
                row_text = " ".join([str(v).strip().upper() for v in row.values if pd.notna(v)])
                
                # Check for Year Level
                if "YEAR" in row_text:
                    if "FIRST" in row_text or "1ST" in row_text: current_year_context = "1"
                    elif "SECOND" in row_text or "2ND" in row_text: current_year_context = "2"
                    elif "THIRD" in row_text or "3RD" in row_text: current_year_context = "3"
                    elif "FOURTH" in row_text or "4TH" in row_text: current_year_context = "4"
                    elif "FIFTH" in row_text or "5TH" in row_text: current_year_context = "5"
                
                # Check for Semester
                if "SEMESTER" in row_text or "TERM" in row_text:
                    if "FIRST" in row_text or "1ST" in row_text: current_sem_context = "1st Semester"
                    elif "SECOND" in row_text or "2ND" in row_text: current_sem_context = "2nd Semester"
                    elif "SUMMER" in row_text or "MIDYEAR" in row_text: current_sem_context = "Summer"

                units = parse_num(row[col_map.get('units')], 0)
                lec_units = parse_num(row[col_map.get('lec_units')], 0)
                lab_units = parse_num(row[col_map.get('lab_units')], 0)
                
                if units == 0 and (lec_units > 0 or lab_units > 0):
                    units = lec_units + lab_units

                # Structured Prerequisite Mapper
                def clean_prereqs(val):
                    if not val or pd.isna(val): return None
                    s = str(val).lower().strip()
                    if s in ['none', 'n/a', '0', 'nan', 'none.', 'no']: return None
                    parts = str(val).replace('&', ',').replace(';', ',').replace(' and ', ',').replace('/', ',')
                    codes = [c.strip().upper() for c in parts.split(',') if len(c.strip()) > 2]
                    return ",".join(codes) if codes else None

                pre_req = clean_prereqs(row[col_map.get('pre_requisite')])

                # Use context if columns are empty
                year = str(row[col_map['year_level']]).strip() if 'year_level' in col_map and not pd.isna(row[col_map['year_level']]) else current_year_context
                sem = str(row[col_map['semester_term']]).strip() if 'semester_term' in col_map and not pd.isna(row[col_map['semester_term']]) else current_sem_context

                ctype = 'lecture'
                if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B') or lab_units > 0:
                    ctype = 'lab'

                item_data = {
                    "code": code, "name": name, "units": units, "type": ctype,
                    "year_level": year, "semester_term": sem,
                    "lec_units": lec_units, "lab_units": lab_units, "pre_requisite": pre_req,
                    "validation_issues": []
                }
                
                # Validation checks
                if units == 0: item_data["validation_issues"].append("Missing or zero units")
                if not year: item_data["validation_issues"].append("Missing year level")
                if not sem: item_data["validation_issues"].append("Missing semester/term")
                
                # Check for duplicates in DB
                existing = db.query(models.Curriculum).filter(
                    func.lower(models.Curriculum.code) == code.lower(),
                    models.Curriculum.department_id == target_dept_id,
                    func.lower(models.Curriculum.program_code) == program_code.lower() if program_code else models.Curriculum.program_code.is_(None)
                ).first()

                if existing:
                    item_data["validation_issues"].append("Duplicate: Already exists in database")
                    skipped_items.append({**item_data, "reason": "Already exists in database"})
                else:
                    items_to_add.append(models.Curriculum(
                        code=code, name=name, units=units, type=ctype,
                        department_id=target_dept_id, program_code=program_code,
                        year_level=year, semester_term=sem,
                        lec_units=lec_units, lab_units=lab_units, pre_requisite=pre_req
                    ))
                
                all_parsed_data.append(item_data)

        if not found_valid_sheet:
            raise HTTPException(status_code=400, detail="No valid curriculum data found. Ensure your Excel has 'Code' and 'Name' columns.")

        # Internal Duplicate Check
        codes_seen = {}
        for item in all_parsed_data:
            c = item['code'].lower()
            if c in codes_seen:
                item["validation_issues"].append(f"Internal Duplicate: Code '{item['code']}' appears multiple times in file")
            codes_seen[c] = True

        # Circular Prerequisite Check
        def find_circular_prereqs(items):
            adj = {i['code']: [p.strip() for p in i['pre_requisite'].split(',')] if i['pre_requisite'] else [] for i in items}
            visited = set()
            stack = set()
            cycles = set()

            def dfs(u):
                visited.add(u)
                stack.add(u)
                for v in adj.get(u, []):
                    if v in stack:
                        cycles.add(u)
                        cycles.add(v)
                    elif v not in visited:
                        dfs(v)
                stack.remove(u)

            for code in adj:
                if code not in visited:
                    dfs(code)
            return cycles

        circular_codes = find_circular_prereqs(all_parsed_data)
        for item in all_parsed_data:
            if item['code'] in circular_codes:
                item["validation_issues"].append("Circular Prerequisite detected")

        summary = {
            "total_rows": len(all_parsed_data),
            "valid_new_items": len(items_to_add),
            "duplicates_skipped": len(skipped_items),
            "issues_found": sum(1 for i in all_parsed_data if i["validation_issues"])
        }

        if dry_run:
            return {
                "is_dry_run": True,
                "message": f"Dry run complete. {summary['issues_found']} items have potential issues.",
                "summary": summary,
                "report": all_parsed_data, # Return everything for the "Review Report"
                "errors": skipped_items
            }

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()
            return {"is_dry_run": False, "message": f"Successfully imported {len(items_to_add)} items", "summary": summary, "errors": skipped_items}
        else:
            return {"is_dry_run": False, "message": "No new items to import", "summary": summary, "errors": skipped_items}

    except Exception as e:
        db.rollback()
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
    items: List[schemas.CurriculumCreate],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # 1. Circular Prerequisite Check
    adj = {i.code: [p.strip().upper() for p in i.pre_requisite.split(',')] if i.pre_requisite else [] for i in items}
    visited = set()
    stack = set()
    cycles = set()

    def dfs(u):
        visited.add(u)
        stack.add(u)
        for v in adj.get(u, []):
            if v in stack:
                cycles.add(u)
                cycles.add(v)
            elif v not in visited:
                dfs(v)
        stack.remove(u)

    for code in adj:
        if code not in visited:
            dfs(code)
    
    if cycles:
        raise HTTPException(status_code=400, detail=f"Circular prerequisites detected in these codes: {', '.join(cycles)}")

    # 2. Prerequisite Existence Check
    # Collect all codes in this batch + all codes in DB for this dept
    batch_codes = {i.code.lower() for i in items}
    dept_id = items[0].department_id if items else None
    db_codes = {c[0].lower() for c in db.query(models.Curriculum.code).filter(models.Curriculum.department_id == dept_id).all()} if dept_id else set()
    all_known_codes = batch_codes.union(db_codes)
    
    broken_links = []
    for item in items:
        if item.pre_requisite:
            prereqs = [p.strip().lower() for p in item.pre_requisite.split(',')]
            for p in prereqs:
                if p not in all_known_codes:
                    broken_links.append(f"{item.code} -> {p}")

    if broken_links:
        # We'll allow broken links but warn the user in the response
        pass

    # 3. Final Commit
    new_items = []
    skipped_items = []
    for item in items:
        existing = db.query(models.Curriculum).filter(
            func.lower(models.Curriculum.code) == item.code.lower(),
            models.Curriculum.department_id == item.department_id,
            func.lower(models.Curriculum.program_code) == item.program_code.lower() if item.program_code else models.Curriculum.program_code.is_(None)
        ).first()
        
        if not existing:
            new_items.append(models.Curriculum(**item.model_dump()))
        else:
            skipped_items.append({"code": item.code, "name": item.name, "reason": "Already exists in database"})
    
    if new_items:
        db.add_all(new_items)
        db.commit()
    
    summary = {
        "total_rows": len(items),
        "valid_new_items": len(new_items),
        "duplicates_skipped": len(skipped_items),
        "issues_found": len(broken_links)
    }

    return {
        "is_dry_run": False,
        "message": f"Successfully committed {len(new_items)} items. {len(broken_links)} potential broken links found.",
        "summary": summary,
        "report": None,
        "errors": skipped_items
    }

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
            
            # Convert first 10 rows to list of lists for preview
            rows = []
            for _, row in df.iterrows():
                rows.append([str(v) if not pd.isna(v) else "" for v in row.values])
                
            sheets_data[sheet] = {
                "sample_rows": rows,
                "sheet_name": sheet
            }
            
        return sheets_data
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

