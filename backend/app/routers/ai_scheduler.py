from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, database, auth
from ..services.schedule_generator import generate_schedules

router = APIRouter(
    prefix="/api/ai-scheduler",
    tags=["AI Scheduler"]
)

@router.post("/generate/{semester_id}")
def generate_schedule(
    semester_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'program_chair':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Program Chairs can generate schedules")
        
    if not current_user.department:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You must be assigned to a department")
        
    # Find department id
    dept = db.query(models.Department).filter(
        (models.Department.code == current_user.department) | 
        (models.Department.name == current_user.department)
    ).first()
    
    if not dept:
         raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")
         
    # Check if semester exists
    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
         raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")
         
    # Run the generator
    results = generate_schedules(db, semester_id, dept.id)
    
    return {
        "msg": "Schedule generation completed",
        "results": results
    }

@router.get("/conflicts")
def get_conflicts(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    # In a full implementation, this would query models.Conflict
    # and join with Schedule to enforce department scoping.
    conflicts = db.query(models.Conflict).offset(skip).limit(limit).all()
    return conflicts
