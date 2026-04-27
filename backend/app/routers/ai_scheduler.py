from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, database, auth
from ..services.schedule_generator import generate_schedules
from .logs import log_activity

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
    
    # Log the activity
    log_activity(
        db, 
        current_user.id, 
        "Generate Schedule", 
        f"Generated schedule for {dept.name} ({semester.academic_year} {semester.term}). Conflicts found: {results['conflicts_found']}",
        "success" if results['conflicts_found'] == 0 else "warning"
    )
    
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

@router.post("/resolve-conflicts")
def resolve_conflicts(
    conflict_ids: List[int],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Attempt to automatically resolve a list of conflicts by finding alternative slots.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    resolved_count = 0
    results = []

    for conflict_id in conflict_ids:
        conflict = db.query(models.Conflict).filter(models.Conflict.id == conflict_id).first()
        if not conflict:
            results.append({"conflict_id": conflict_id, "status": "not_found"})
            continue
        
        # Get the schedules involved
        s1 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_1).first()
        s2 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_2).first()

        if not s1 or not s2:
            results.append({"conflict_id": conflict_id, "status": "schedule_missing"})
            continue

        # Try to relocate s2
        from ..services.schedule_generator import TIMESLOTS, DAYS
        
        # Helper to check overlaps (simplified)
        def check_overlap(day, start_t, end_t, room_id, faculty_id, exclude_id):
            return db.query(models.Schedule).filter(
                models.Schedule.semester_id == s2.semester_id,
                models.Schedule.day_of_week == day,
                models.Schedule.start_time == start_t,
                models.Schedule.end_time == end_t,
                models.Schedule.id != exclude_id
            ).filter(
                (models.Schedule.room_id == room_id) | 
                (models.Schedule.faculty_id == faculty_id)
            ).first() is not None

        found = False
        for day in DAYS:
            if found: break
            for start_t, end_t in TIMESLOTS:
                if not check_overlap(day, start_t, end_t, s2.room_id, s2.faculty_id, s2.id):
                    # Found a slot!
                    s2.day_of_week = day
                    s2.start_time = start_t
                    s2.end_time = end_t
                    conflict.resolved_at = datetime.now(timezone.utc)
                    db.commit()
                    resolved_count += 1
                    found = True
                    results.append({"conflict_id": conflict_id, "status": "resolved", "new_slot": f"{day} {start_t}-{end_t}"})
                    
                    # Log the resolution
                    log_activity(
                        db,
                        current_user.id,
                        "Resolve Conflict",
                        f"Automatically resolved conflict #{conflict_id} by moving schedule #{s2.id} to {day} {start_t}",
                        "success"
                    )
                    break
        
        if not found:
            results.append({"conflict_id": conflict_id, "status": "unresolvable"})

    return {
        "resolved_count": resolved_count,
        "results": results
    }
