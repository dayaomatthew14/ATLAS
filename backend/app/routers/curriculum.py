from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import io
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
                        if pd.isna(code_raw): continue
                            
                        code = str(int(code_raw)).strip() if isinstance(code_raw, float) and code_raw.is_integer() else str(code_raw).strip()
                        name = str(row[col_map['name']]).strip() if not pd.isna(row[col_map['name']]) else ""
                        
                        if not code or code.lower() == 'nan' or len(code) < 3 or code.lower() == 'course code':
                            skipped_items.append({"code": code, "name": name, "reason": "Invalid or missing course code"})
                            continue
                            
                        # Handle units
                        units_val = row[col_map['units']] if 'units' in col_map else 3
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
                            
                        pre_requisite = str(row[col_map['pre_requisite']]).strip() if 'pre_requisite' in col_map and not pd.isna(row[col_map['pre_requisite']]) else None
                        if pre_requisite and (pre_requisite.lower() == 'nan' or pre_requisite.lower() == 'none'):
                            pre_requisite = None
                            
                        ctype = 'lecture'
                        if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B') or lab_units > 0:
                            ctype = 'lab'
                            
                        # Duplicate check
                        existing = db.query(models.Curriculum).filter(
                            func.lower(models.Curriculum.code) == code.lower(),
                            models.Curriculum.department_id == target_dept_id,
                            func.lower(models.Curriculum.program_code) == program_code.lower() if program_code else models.Curriculum.program_code.is_(None)
                        ).first()
                        
                        if not existing:
                            items_to_add.append(models.Curriculum(
                                code=code, name=name, units=units, type=ctype,
                                department_id=target_dept_id, program_code=program_code,
                                year_level=current_year, semester_term=current_sem,
                                lec_units=lec_units, lab_units=lab_units, pre_requisite=pre_requisite
                            ))
                        else:
                            skipped_items.append({"code": code, "name": name, "reason": "Already exists in this program"})
                    break

        if not found_target_sheet:
            raise HTTPException(status_code=400, detail="Could not find a valid curriculum sheet (missing school name header)")

        summary = {"total_parsed": total_parsed, "to_add": len(items_to_add), "skipped": len(skipped_items)}

        if dry_run:
            preview = [{"code": i.code, "name": i.name, "units": i.units, "year": i.year_level, "sem": i.semester_term} for i in items_to_add[:10]]
            return {
                "is_dry_run": True,
                "message": f"Dry run complete. {len(items_to_add)} items ready for import.",
                "summary": summary,
                "preview": preview,
                "errors": skipped_items
            }

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()
            return {"is_dry_run": False, "message": f"Successfully imported {len(items_to_add)} curriculum items", "summary": summary, "errors": skipped_items}
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
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    return await _process_curriculum_import(contents, department_id, program_code, dry_run, db, current_user)
