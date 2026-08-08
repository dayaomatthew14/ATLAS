from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/semesters",
    tags=["Semesters"]
)

# Semester.term is stored as '1st' | '2nd' | '3rd semester'. Messages that reach
# the user should read the way a registrar writes a term, not the way it is
# stored -- "2026-2027 1st" is not a term name.
TERM_LABELS = {'1st': '1st Term', '2nd': '2nd Term', '3rd semester': 'Midyear'}


def term_display(semester) -> str:
    return f"{semester.academic_year} {TERM_LABELS.get(semester.term, semester.term)}"

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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Semester management is restricted to administrators.")
        
    # Normalize term to match enum
    term_mapping = {
        '1st Semester': '1st',
        '2nd Semester': '2nd',
        '3rd Semester': '3rd semester'
    }
    normalized_term = term_mapping.get(semester.term, semester.term)
    
    db_semester = db.query(models.Semester).filter(
        models.Semester.academic_year == semester.academic_year,
        models.Semester.term == normalized_term
    ).first()
    if db_semester:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Semester already exists")
        
    sem_data = semester.model_dump()
    sem_data['term'] = normalized_term
    
    # Deactivate others if this is active
    if sem_data.get('is_active'):
        db.query(models.Semester).update({"is_active": False}, synchronize_session=False)
        
    new_semester = models.Semester(**sem_data)
    db.add(new_semester)
    db.commit()
    db.refresh(new_semester)
    
    log_activity(db, current_user.id, "Create Semester", f"Created semester: {new_semester.academic_year} {new_semester.term}", "success") # type: ignore
    
    return new_semester

@router.put("/{semester_id}", response_model=schemas.SemesterResponse)
def update_semester(
    semester_id: int, 
    semester: schemas.SemesterUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Semester management is restricted to administrators.")
        
    db_semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")
        
    update_data = semester.model_dump(exclude_unset=True)
    
    # Normalize term if it's being updated
    if 'term' in update_data:
        term_mapping = {
            '1st Semester': '1st',
            '2nd Semester': '2nd',
            '3rd Semester': '3rd semester'
        }
        update_data['term'] = term_mapping.get(update_data['term'], update_data['term'])
        
    for key, value in update_data.items():
        setattr(db_semester, key, value)
        
    # If this semester is set to active, deactivate others
    if update_data.get('is_active'):
        db.query(models.Semester).filter(models.Semester.id != semester_id).update({"is_active": False}, synchronize_session=False)
        
    db.commit()
    db.refresh(db_semester)
    
    log_activity(db, current_user.id, "Update Semester", f"Updated semester: {db_semester.academic_year} {db_semester.term}", "success") # type: ignore
    
    return db_semester

@router.delete("/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(
    semester_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Semester management is restricted to administrators.")
        
    db_semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not db_semester:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")

    # Schedule.semester_id is nullable and the relationship has no delete rule,
    # so deleting a term did not fail -- it silently set semester_id to NULL on
    # every class in it. Those rows stay in the database but disappear from
    # every query that filters by term, with no way to find them from the UI.
    scheduled = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id).count()
    offerings = db.query(models.SubjectOffering).filter(models.SubjectOffering.semester_id == semester_id).count()
    if scheduled or offerings:
        parts = []
        if scheduled:
            parts.append(f"{scheduled} scheduled {'class' if scheduled == 1 else 'classes'}")
        if offerings:
            parts.append(f"{offerings} subject {'assignment' if offerings == 1 else 'assignments'}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{term_display(db_semester)} still holds {' and '.join(parts)}. "
                "Clear the schedule for this term before deleting it."
            )
        )

    if db_semester.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is the active term. Activate a different term before deleting it."
        )

    ay = db_semester.academic_year
    term = db_semester.term
    db.delete(db_semester)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Semester", f"Deleted semester: {ay} {term}", "success")
    
    return None
