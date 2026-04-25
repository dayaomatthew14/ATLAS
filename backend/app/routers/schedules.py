from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/schedules",
    tags=["Schedules"]
)

@router.get("/", response_model=List[schemas.ScheduleResponse])
def get_schedules(
    skip: int = 0, 
    limit: int = 100, 
    semester_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    faculty_id: Optional[int] = None,
    room_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Schedule).join(models.Subject)
    
    if current_user.role == 'program_chair':
        if not current_user.department:
            return []
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Subject.department_id == dept.id)
        else:
            return []
            
    if semester_id:
        query = query.filter(models.Schedule.semester_id == semester_id)
    if subject_id:
        query = query.filter(models.Schedule.subject_id == subject_id)
    if faculty_id:
        query = query.filter(models.Schedule.faculty_id == faculty_id)
    if room_id:
        query = query.filter(models.Schedule.room_id == room_id)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{schedule_id}", response_model=schemas.ScheduleResponse)
def get_schedule(
    schedule_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
                
    return schedule

@router.post("/", response_model=schemas.ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    schedule: schemas.ScheduleCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == schedule.subject_id).first()
        if not subject:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create schedules for your department's subjects")
             
    new_schedule = models.Schedule(**schedule.model_dump())
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    return new_schedule

@router.put("/{schedule_id}", response_model=schemas.ScheduleResponse)
def update_schedule(
    schedule_id: int, 
    schedule: schemas.ScheduleUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not db_schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == db_schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this schedule")
                
    update_data = schedule.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_schedule, key, value)
        
    db.commit()
    db.refresh(db_schedule)
    return db_schedule

@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not db_schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == db_schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this schedule")
                
    db.delete(db_schedule)
    db.commit()
    return None
