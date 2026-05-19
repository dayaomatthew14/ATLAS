from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/faculty",
    tags=["Faculty"]
)

@router.get("", response_model=List[schemas.FacultyResponse])
def get_faculties(
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Faculty)
    
    if current_user.role in ['program_chair', 'faculty', 'student']:
        if not current_user.department:
            return []
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Faculty.department_id == dept.id)
        else:
            return []
    elif department_id:
        query = query.filter(models.Faculty.department_id == department_id)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{faculty_id}", response_model=schemas.FacultyResponse)
def get_faculty(
    faculty_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")
        
    if current_user.role in ['program_chair', 'faculty', 'student']:
        dept = db.query(models.Department).filter(models.Department.id == faculty.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
            
    return faculty

@router.post("", response_model=schemas.FacultyResponse, status_code=status.HTTP_201_CREATED)
def create_faculty(
    faculty: schemas.FacultyCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == faculty.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create faculty for your department")
             
    db_faculty = db.query(models.Faculty).filter(models.Faculty.user_id == faculty.user_id).first()
    if db_faculty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already registered as faculty")
        
    new_faculty = models.Faculty(**faculty.model_dump())
    db.add(new_faculty)
    db.commit()
    db.refresh(new_faculty)
    
    log_activity(db, current_user.id, "Create Faculty", f"Created faculty record for user ID: {new_faculty.user_id}", "success", department_id=new_faculty.department_id) # type: ignore
    
    return new_faculty

@router.put("/{faculty_id}", response_model=schemas.FacultyResponse)
def update_faculty(
    faculty_id: int, 
    faculty: schemas.FacultyUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == db_faculty.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this faculty")
                
    update_data = faculty.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_faculty, key, value)
        
    db.commit()
    db.refresh(db_faculty)
    
    log_activity(db, current_user.id, "Update Faculty", f"Updated faculty record for user ID: {db_faculty.user_id}", "success", department_id=db_faculty.department_id) # type: ignore
    
    return db_faculty

@router.delete("/{faculty_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_faculty(
    faculty_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == db_faculty.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this faculty")
                
    db.delete(db_faculty)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Faculty", f"Deleted faculty record for user ID: {db_faculty.user_id}", "success", department_id=db_faculty.department_id) # type: ignore
    
    return None
