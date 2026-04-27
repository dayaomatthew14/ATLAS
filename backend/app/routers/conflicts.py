from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, database, auth

router = APIRouter(
    prefix="/api/conflicts",
    tags=["Conflicts"]
)

@router.get("/count")
def get_conflict_count(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns the total number of unresolved conflicts for the active semester.
    Scoped to the Program Chair's department.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    # 1. Find the active semester
    active_semester = db.query(models.Semester).filter(models.Semester.is_active == True).first()
    if not active_semester:
        return {"count": 0}

    # 2. Build the query
    query = db.query(models.Conflict).join(
        models.Schedule, 
        models.Conflict.schedule_id_1 == models.Schedule.id
    ).filter(
        models.Schedule.semester_id == active_semester.id,
        models.Conflict.resolved_at == None
    )

    # 3. Apply department scoping for Program Chairs
    if current_user.role == 'program_chair':
        if not current_user.department:
            return {"count": 0}
        
        # We need to check the department of the subjects in the schedules
        # Since Conflict links to Schedule 1 and 2, and both are likely in the same dept if they conflict,
        # checking Schedule 1's subject dept is enough.
        query = query.join(
            models.Subject,
            models.Schedule.subject_id == models.Subject.id
        ).join(
            models.Department,
            models.Subject.department_id == models.Department.id
        ).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        )

    count = query.count()
    return {"count": count}
