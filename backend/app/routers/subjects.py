from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import io
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/subjects",
    tags=["Subjects"]
)

@router.get("/", response_model=List[schemas.SubjectResponse])
def get_subjects(
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    program_code: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Subject)
    
    if current_user.role == 'program_chair' and current_user.department:
        # Filter subjects by the program chair's department
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Subject.department_id == dept.id)
        else:
            return [] # No department match means no access
    elif department_id:
        query = query.filter(models.Subject.department_id == department_id)
        
    if program_code:
        query = query.filter(models.Subject.program_code == program_code)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{subject_id}", response_model=schemas.SubjectResponse)
def get_subject(
    subject_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    subject = db.query(models.Subject).filter(models.Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this subject")
            
    return subject

@router.post("/", response_model=schemas.SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_subject(
    subject: schemas.SubjectCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create subjects for your department")
             
    # Unique check per program
    db_subject = db.query(models.Subject).filter(
        models.Subject.code == subject.code,
        models.Subject.program_code == subject.program_code
    ).first()
    if db_subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject code already exists for this program")
        
    new_subject = models.Subject(**subject.model_dump())
    db.add(new_subject)
    db.commit()
    db.refresh(new_subject)
    return new_subject

@router.put("/{subject_id}", response_model=schemas.SubjectResponse)
def update_subject(
    subject_id: int, 
    subject: schemas.SubjectUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_subject = db.query(models.Subject).filter(models.Subject.id == subject_id).first()
    if not db_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == db_subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this subject")
             
    update_data = subject.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_subject, key, value)
        
    db.commit()
    db.refresh(db_subject)
    return db_subject

@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(
    subject_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_subject = db.query(models.Subject).filter(models.Subject.id == subject_id).first()
    if not db_subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == db_subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this subject")
             
    db.delete(db_subject)
    db.commit()
    return None

async def _process_import_logic(
    contents: bytes,
    department_id: Optional[int],
    program_code: Optional[str],
    dry_run: bool,
    db: Session,
    current_user: models.User
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            raise HTTPException(status_code=400, detail="User department not found")
        target_dept_id = dept.id
    elif department_id:
        target_dept_id = department_id
    else:
        first_dept = db.query(models.Department).first()
        if not first_dept:
             raise HTTPException(status_code=400, detail="No departments found in system")
        target_dept_id = first_dept.id

    try:
        xl = pd.ExcelFile(io.BytesIO(contents))
        
        items_to_add = []
        skipped_items = []
        total_parsed = 0
        found_target_sheet = False
        
        for sheet in xl.sheet_names:
            df_header = pd.read_excel(xl, sheet_name=sheet, nrows=20, header=None)
            header_text = df_header.to_string().lower()
            
            if "de la salle" in header_text or "university" in header_text:
                found_target_sheet = True
                full_df = pd.read_excel(xl, sheet_name=sheet, header=None)
                header_row_idx = -1
                col_map = {}
                
                for i, row in full_df.iterrows():
                    row_vals = [str(v).strip().lower() for v in row.values]
                    if "course code" in row_vals or "code" in row_vals:
                        header_row_idx = i
                        for idx, val in enumerate(row_vals):
                            if "course code" in val or "code" == val: col_map['code'] = idx
                            if "course title" in val or "title" in val or "subject name" in val: col_map['name'] = idx
                            if "units" == val or "unit" in val: col_map['units'] = idx
                            if "lec" in val or "lecture" in val: col_map['lec_units'] = idx
                            if "lab" in val or "laboratory" in val: col_map['lab_units'] = idx
                            if "pre-req" in val or "prerequisite" in val: col_map['pre_requisite'] = idx
                            if "year" in val: col_map['year_level'] = idx
                            if "sem" in val or "semester" in val: col_map['semester_term'] = idx
                        break
                
                if header_row_idx != -1 and 'code' in col_map and 'name' in col_map:
                    data_df = full_df.iloc[header_row_idx + 1:]
                    
                    current_year = None
                    current_sem = None
                    
                    for _, row in data_df.iterrows():
                        total_parsed += 1
                        
                        if 'year_level' in col_map and not pd.isna(row[col_map['year_level']]):
                            current_year = str(row[col_map['year_level']]).strip()
                        if 'semester_term' in col_map and not pd.isna(row[col_map['semester_term']]):
                            current_sem = str(row[col_map['semester_term']]).strip()
                            
                        code_raw = row[col_map['code']]
                        if pd.isna(code_raw):
                            continue
                            
                        if isinstance(code_raw, float) and code_raw.is_integer():
                            code = str(int(code_raw)).strip()
                        else:
                            code = str(code_raw).strip()
                            
                        name_raw = row[col_map['name']]
                        name = str(name_raw).strip() if not pd.isna(name_raw) else ""
                        
                        units_val = row[col_map['units']] if 'units' in col_map else 3
                        
                        if not code or code.lower() == 'nan' or len(code) < 3 or code.lower() == 'course code':
                            skipped_items.append({"code": code, "name": name, "reason": "Invalid or missing course code"})
                            continue
                            
                        try: units = int(float(units_val))
                        except: units = 3
                            
                        lec_units = 0
                        if 'lec_units' in col_map and not pd.isna(row[col_map['lec_units']]):
                            try: lec_units = int(float(row[col_map['lec_units']]))
                            except: pass
                            
                        lab_units = 0
                        if 'lab_units' in col_map and not pd.isna(row[col_map['lab_units']]):
                            try: lab_units = int(float(row[col_map['lab_units']]))
                            except: pass
                            
                        pre_requisite = None
                        if 'pre_requisite' in col_map:
                            val = str(row[col_map['pre_requisite']]).strip()
                            if val and val.lower() != 'nan' and val.lower() != 'none':
                                pre_requisite = val
                                
                        ctype = 'lecture'
                        if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B') or lab_units > 0:
                            ctype = 'lab'
                            
                        prog_code_check = program_code.lower() if program_code else None
                        existing = db.query(models.Subject).filter(
                            func.lower(models.Subject.code) == code.lower(),
                            models.Subject.department_id == target_dept_id
                        )
                        
                        if prog_code_check:
                            existing = existing.filter(func.lower(models.Subject.program_code) == prog_code_check)
                        else:
                            existing = existing.filter(models.Subject.program_code.is_(None))
                            
                        existing = existing.first()
                        
                        if not existing:
                            items_to_add.append(models.Subject(
                                code=code,
                                name=name,
                                units=units,
                                type=ctype,
                                department_id=target_dept_id,
                                program_code=program_code,
                                year_level=current_year,
                                semester_term=current_sem,
                                lec_units=lec_units,
                                lab_units=lab_units,
                                pre_requisite=pre_requisite
                            ))
                        else:
                            skipped_items.append({"code": code, "name": name, "reason": "Already exists for this program"})
                    break

        if not found_target_sheet:
            raise HTTPException(status_code=400, detail="Could not find a sheet with the school name")

        summary = {
            "total_parsed": total_parsed,
            "to_add": len(items_to_add),
            "skipped": len(skipped_items)
        }

        if dry_run:
            preview = [item.__dict__ for item in items_to_add]
            for p in preview:
                p.pop('_sa_instance_state', None)
            
            return {
                "is_dry_run": True,
                "message": "Dry run complete",
                "summary": summary,
                "preview": preview,
                "errors": skipped_items
            }

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()
            return {
                "is_dry_run": False,
                "message": f"Successfully imported {len(items_to_add)} subjects",
                "summary": summary,
                "errors": skipped_items
            }
        else:
            return {
                "is_dry_run": False,
                "message": "No new subjects to import",
                "summary": summary,
                "errors": skipped_items
            }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.post("/import")
async def import_subjects(
    file: UploadFile = File(...),
    department_id: Optional[int] = Form(None),
    program_code: Optional[str] = Form(None),
    dry_run: bool = Form(False),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    return await _process_import_logic(contents, department_id, program_code, dry_run, db, current_user)

import os
@router.post("/import/local")
async def import_subjects_local(
    file_path: str = Form(r"C:\Users\Domz\Downloads\BSCS CURRICULUM AY 2026.xlsx"),
    department_id: Optional[int] = Form(None),
    program_code: Optional[str] = Form(None),
    dry_run: bool = Form(False),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if not os.path.exists(file_path):
        raise HTTPException(status_code=400, detail=f"File not found at path: {file_path}")
        
    with open(file_path, "rb") as f:
        contents = f.read()
        
    return await _process_import_logic(contents, department_id, program_code, dry_run, db, current_user)
