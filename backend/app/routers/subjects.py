from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
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
             
    db_subject = db.query(models.Subject).filter(models.Subject.code == subject.code).first()
    if db_subject:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Subject code already exists")
        
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
