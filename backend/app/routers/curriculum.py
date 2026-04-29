from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form
from sqlalchemy.orm import Session
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
             
    db_curriculum = db.query(models.Curriculum).filter(models.Curriculum.code == curriculum_item.code).first()
    if db_curriculum:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Curriculum code already exists")
        
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
@router.post("/import")
async def import_curriculum(
    file: UploadFile = File(...),
    department_id: Optional[int] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # If program chair, force their department
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
        # Default to first department or error
        first_dept = db.query(models.Department).first()
        if not first_dept:
             raise HTTPException(status_code=400, detail="No departments found in system")
        target_dept_id = first_dept.id

    try:
        contents = await file.read()
        xl = pd.ExcelFile(io.BytesIO(contents))
        
        items_to_add = []
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
                        break
                
                if header_row_idx != -1 and 'code' in col_map and 'name' in col_map:
                    data_df = full_df.iloc[header_row_idx + 1:]
                    for _, row in data_df.iterrows():
                        code = str(row[col_map['code']]).strip()
                        name = str(row[col_map['name']]).strip()
                        units_val = row[col_map['units']] if 'units' in col_map else 3
                        
                        if not code or code == 'nan' or len(code) < 3 or code.lower() == 'course code':
                            continue
                            
                        try:
                            units = int(float(units_val))
                        except:
                            units = 3
                            
                        ctype = 'lecture'
                        if 'lab' in name.lower() or 'laboratory' in name.lower() or code.endswith('B'):
                            ctype = 'lab'
                            
                        # Check if already exists in this department
                        existing = db.query(models.Curriculum).filter(
                            models.Curriculum.code == code,
                            models.Curriculum.department_id == target_dept_id
                        ).first()
                        
                        if not existing:
                            items_to_add.append(models.Curriculum(
                                code=code,
                                name=name,
                                units=units,
                                type=ctype,
                                department_id=target_dept_id
                            ))
                    break # Only process the first school-related sheet found

        if not found_target_sheet:
            raise HTTPException(status_code=400, detail="Could not find a sheet with the school name")

        if items_to_add:
            db.add_all(items_to_add)
            db.commit()
            return {"message": f"Successfully imported {len(items_to_add)} curriculum items", "count": len(items_to_add)}
        else:
            return {"message": "No new curriculum items to import", "count": 0}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
