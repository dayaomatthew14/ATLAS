from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/semesters",
    tags=["Semesters"]
)

@router.get("", response_model=List[schemas.SemesterResponse])
def get_semesters(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return db.query(models.Semester).offset(skip).limit(limit).all()

@router.get("/{semester_id}", response_model=schemas.SemesterResponse)
def get_semester(
    semester_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")
    return semester

@router.post("", response_model=schemas.SemesterResponse, status_code=status.HTTP_201_CREATED)
def create_semester(
    semester: schemas.SemesterCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage semesters")
        
    db_semester = db.query(models.Semester).filter(
        models.Semester.academic_year == semester.academic_year,
        models.Semester.term == semester.term
    ).first()
    if db_semester:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Semester already exists")
        
    new_semester = models.Semester(**semester.model_dump())
    db.add(new_semester)
    db.commit()
    db.refresh(new_semester)
    return new_semester

@router.put("/{semester_id}", response_model=schemas.SemesterResponse)
def update_semester(
    semester_id: int, 
    semester: schemas.SemesterUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage semesters")
        
    db_semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")
        
    update_data = semester.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_semester, key, value)
        
    # If this semester is set to active, deactivate others
    if update_data.get('is_active'):
        db.query(models.Semester).filter(models.Semester.id != semester_id).update({"is_active": False})
        
    db.commit()
    db.refresh(db_semester)
    return db_semester

@router.delete("/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(
    semester_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage semesters")
        
    db_semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")
        
    db.delete(db_semester)
    db.commit()
    return None
