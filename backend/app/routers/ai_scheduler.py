from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
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
    
    # Fix: generator returns 'conflicts' list, not 'conflicts_found' int
    conflicts_count = len(results.get('conflicts', []))
    
    # Log the activity
    log_activity(
        db,
        current_user.id,
        "Generate Schedule",
        f"Generated schedule for {dept.name} ({semester.academic_year} {semester.term}). Schedules generated: {results.get('generated', 0)}. Unresolved conflicts: {conflicts_count}",
        "success" if conflicts_count == 0 else "warning"
    )

    return {
        "msg": "Schedule generation completed",
        "generated": results.get('generated', 0),
        "conflicts_count": conflicts_count,
        "unresolved_conflicts": results.get('conflicts', [])
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

    # Pre-fetch rooms and faculty to avoid repetitive DB hits
    all_rooms = db.query(models.Room).all()
    
    # Timeslots and Days for relocation
    from ..services.schedule_generator import TIMESLOTS, DAYS

    for conflict_id in conflict_ids:
        conflict = db.query(models.Conflict).filter(models.Conflict.id == conflict_id).first()
        if not conflict or conflict.resolved_at:
            continue
        
        # Get the schedules involved
        s1 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_1).first()
        s2 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_2).first()

        if not s1 or not s2:
            continue

        # Strategy 1: Relocate s2 while keeping room and faculty
        # Strategy 2: Swap room for s2
        # Strategy 3: Swap faculty for s2 (if curriculum allows)
        
        curriculum_item = db.query(models.Curriculum).filter(models.Curriculum.id == s2.curriculum_id).first()
        valid_rooms = [r for r in all_rooms if r.type == curriculum_item.type or (r.type == 'computer_lab' and curriculum_item.type == 'lab')]
        
        found = False
        
        # Helper to check for ALL types of overlaps (Room, Faculty, Section)
        def is_really_free(day, start_t, end_t, room_id, faculty_id, section, exclude_id):
            overlap = db.query(models.Schedule).filter(
                models.Schedule.semester_id == s2.semester_id,
                models.Schedule.day_of_week == day,
                models.Schedule.start_time == start_t,
                models.Schedule.end_time == end_t,
                models.Schedule.id != exclude_id
            ).filter(
                (models.Schedule.room_id == room_id) | 
                (models.Schedule.faculty_id == faculty_id) |
                (models.Schedule.section == section)
            ).first()
            if overlap: return False
            
            # Also check faculty unavailability
            blocked = db.query(models.FacultyUnavailability).filter(
                models.FacultyUnavailability.faculty_id == faculty_id,
                models.FacultyUnavailability.day_of_week == day,
                models.FacultyUnavailability.start_time < end_t,
                models.FacultyUnavailability.end_time > start_t
            ).first()
            return blocked is None

        # Try to find a new slot
        for r in valid_rooms:
            if found: break
            for day in DAYS:
                if found: break
                for start_t, end_t in TIMESLOTS:
                    if is_really_free(day, start_t, end_t, r.id, s2.faculty_id, s2.section, s2.id):
                        s2.day_of_week = day
                        s2.start_time = start_t
                        s2.end_time = end_t
                        s2.room_id = r.id
                        conflict.resolved_at = datetime.now(timezone.utc)
                        db.commit()
                        resolved_count += 1
                        found = True
                        results.append({
                            "conflict_id": conflict_id, 
                            "status": "resolved", 
                            "message": f"Moved to {r.name} on {day} {start_t.strftime('%H:%M')}"
                        })
                        
                        log_activity(db, current_user.id, "Resolve Conflict", f"Auto-resolved conflict #{conflict_id} by relocating {curriculum_item.code}")
                        break
        
        if not found:
            results.append({"conflict_id": conflict_id, "status": "unresolvable"})

    return {
        "resolved_count": resolved_count,
        "results": results
    }
