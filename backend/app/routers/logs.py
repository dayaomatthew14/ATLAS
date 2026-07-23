from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, auth
from ..database import get_db

router = APIRouter(
    prefix="/api/logs",
    tags=["logs"]
)

@router.get("", response_model=List[schemas.SystemLogResponse])
def get_logs(
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Get system logs with optional status filtering.
    Only accessible by Admin and Program Chair.
    """
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=403, detail="Not authorized to view logs")
    
    query = db.query(models.SystemLog)
    
    if status:
        query = query.filter(models.SystemLog.status == status)
    
    if current_user.role in ['program_chair', 'coordinator']:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(
                (models.SystemLog.department_id == dept.id) | 
                (models.SystemLog.department_id == None)
            )
        else:
            query = query.filter(models.SystemLog.user_id == current_user.id)
    
    return query.order_by(models.SystemLog.timestamp.desc()).offset(offset).limit(limit).all()

@router.post("", response_model=schemas.SystemLogResponse)
def create_log(
    log: schemas.SystemLogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Manually create a log entry.
    """
    db_log = models.SystemLog(
        user_id=current_user.id if not log.user_id else log.user_id,
        department_id=log.department_id,
        action=log.action,
        details=log.details,
        status=log.status
    )
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log

# Utility function for internal logging
def log_activity(db: Session, user_id: Optional[int], action: str, details: Optional[str] = None, status: str = 'success', department_id: Optional[int] = None):
    db_log = models.SystemLog(
        user_id=user_id,
        department_id=department_id,
        action=action,
        details=details,
        status=status
    )
    db.add(db_log)
    db.commit()

@router.delete("", status_code=204)
def clear_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Clear all system logs.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=403, detail="Only admins and program chairs can clear logs")
    db.query(models.SystemLog).delete()
    db.commit()
    return None
