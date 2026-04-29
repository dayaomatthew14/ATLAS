from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
import pandas as pd
import io
import os
import re
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/curriculum",
    tags=["Curriculum"]
)

@router.get("", response_model=List[schemas.SubjectResponse])
def get_subjects(
    skip: int = 0, 
    limit: int = 5000, 
    department_id: Optional[int] = None,
    course: Optional[str] = None,
    year: Optional[int] = None,
    semester: Optional[str] = None,
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
        
    if course:
        query = query.filter(models.Subject.course == course)
    if year:
        query = query.filter(models.Subject.year == year)
    if semester:
        query = query.filter(models.Subject.semester == semester)
        
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

@router.post("", response_model=schemas.SubjectResponse, status_code=status.HTTP_201_CREATED)
def create_subject(
    subject: schemas.SubjectCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    subject_data = subject.model_dump()
    
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            subject_data['department_id'] = dept.id
        else:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Department not found")
             
    db_subject = db.query(models.Subject).filter(models.Subject.code == subject.code).first()
    if db_subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject code already exists")
        
    new_subject = models.Subject(**subject_data)
    db.add(new_subject)
    db.commit()
    db.refresh(new_subject)
    
    log_activity(db, current_user.id, "Create Subject", f"Created subject: {new_subject.code} - {new_subject.name}")
    
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
    
    log_activity(db, current_user.id, "Update Subject", f"Updated subject: {db_subject.code}")
    
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
             
    code = db_subject.code
    db.delete(db_subject)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Subject", f"Deleted subject: {code}")
    
    return None

@router.delete("/course/{course_name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_curriculum(
    course_name: str, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    query = db.query(models.Subject).filter(models.Subject.course == course_name)
    
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Subject.department_id == dept.id)
        else:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this course")
             
    deleted_count = query.delete()
    if deleted_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found or no subjects deleted")
        
    db.commit()
    log_activity(db, current_user.id, "Delete Curriculum", f"Deleted {deleted_count} subjects for course: {course_name}")
    
    return None

@router.post("/upload", response_model=dict, status_code=status.HTTP_201_CREATED)
async def upload_subjects(
    file: UploadFile = File(...),
    course: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if not file.filename.endswith('.xlsx') and not file.filename.endswith('.xls'):
        raise HTTPException(status_code=400, detail="Only Excel files are supported")
        
    department_id = None
    if current_user.role == 'program_chair' and current_user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            department_id = dept.id
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Department not found")
    else:
        dept = db.query(models.Department).first()
        if dept:
            department_id = dept.id
            
    if not department_id:
        raise HTTPException(status_code=400, detail="No department to assign subjects to")

    contents = await file.read()
    
    try:
        xls = pd.ExcelFile(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {e}")

    added_count = 0
    skipped_count = 0
    global_codes_seen = set()
    
    course_name = "Unknown"
    if course:
        course_name = course.upper()
    else:
        # Try to extract from Excel contents first
        for sheet_name in xls.sheet_names:
            try:
                df_header = pd.read_excel(xls, sheet_name=sheet_name, nrows=10, header=None)
                for index, row in df_header.iterrows():
                    row_str = " ".join([str(x) for x in row.values if pd.notna(x)]).upper()
                    if "BACHELOR OF" in row_str:
                        match = re.search(r'\((.*?)\)', row_str)
                        if match:
                            extracted = match.group(1).strip()
                            if extracted:
                                course_name = extracted
                                break
            except Exception:
                pass
            if course_name != "Unknown":
                break
                
        # Fallback to filename if not found in contents
        if course_name == "Unknown":
            base_name = os.path.splitext(file.filename)[0]
            parts = re.split(r'[\s_\-]+', base_name)
            if parts and parts[0]:
                course_name = parts[0].upper()

    # If course is known, clear existing subjects for this course to ensure a fresh import
    if course_name != "Unknown":
        db.query(models.Subject).filter(
            models.Subject.course == course_name,
            models.Subject.department_id == department_id
        ).delete()
        db.commit()

    for sheet_name in xls.sheet_names:
        try:
            df = pd.read_excel(xls, sheet_name=sheet_name)
            current_year = None
            semester_index = 0
            
            for index, row in df.iterrows():
                row_str = str(row.values).upper()
                if "FIRST YEAR" in row_str:
                    if current_year != 1:
                        current_year = 1
                        semester_index = 0
                    else:
                        semester_index += 1
                elif "SECOND YEAR" in row_str:
                    if current_year != 2:
                        current_year = 2
                        semester_index = 0
                    else:
                        semester_index += 1
                elif "THIRD YEAR" in row_str:
                    if current_year != 3:
                        current_year = 3
                        semester_index = 0
                    else:
                        semester_index += 1
                elif "FOURTH YEAR" in row_str:
                    if current_year != 4:
                        current_year = 4
                        semester_index = 0
                    else:
                        semester_index += 1
                        
                sem_mapping = {0: '1st', 1: '2nd', 2: 'summer'}
                current_sem = sem_mapping.get(semester_index, '1st')

                cleaned = [str(x).strip() for x in row.values if pd.notna(x) and str(x).strip() != '']
                if len(cleaned) >= 5:
                    found = False
                    for i in range(2, len(cleaned) - 2):
                        try:
                            lec = int(float(cleaned[i]))
                            lab = int(float(cleaned[i+1]))
                            units = int(float(cleaned[i+2]))
                            code = cleaned[i-2]
                            title = cleaned[i-1]
                            
                            # Parse pre-requisite (usually the next column after units)
                            pre_req = cleaned[i+3] if i+3 < len(cleaned) else ""
                            if str(pre_req).upper() == 'NONE' or pd.isna(pre_req):
                                pre_req = ""
                                
                            if len(code) > 20 or len(title) < 3:
                                continue
                                
                            found = True
                            break
                        except ValueError:
                            continue
                    
                    if found:
                        subj_type = 'lab' if lab > 0 else 'lecture'
                        
                        # Since we deleted existing for the course, duplicates are only within the file itself
                        if code in global_codes_seen:
                            skipped_count += 1
                        else:
                            new_subj = models.Subject(
                                code=code,
                                name=title,
                                units=units,
                                department_id=department_id,
                                type=subj_type,
                                year=current_year,
                                semester=current_sem,
                                course=course_name,
                                lec_units=lec,
                                lab_units=lab,
                                pre_requisites=pre_req
                            )
                            db.add(new_subj)
                            global_codes_seen.add(code)
                            added_count += 1
        except Exception:
            continue
            
    try:
        db.commit()
        log_activity(db, current_user.id, "Upload Curriculum", f"Imported {added_count} subjects for {course_name} curriculum")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error during commit")

    return {
        "message": "Success", 
        "added": added_count, 
        "skipped": skipped_count,
        "course": course_name
    }
