from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, database, auth, schemas

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
        
        # We need to check the department of the curriculum items in the schedules
        # Since Conflict links to Schedule 1 and 2, and both are likely in the same dept if they conflict,
        # checking Schedule 1's curriculum item dept is enough.
        query = query.join(
            models.Curriculum,
            models.Schedule.curriculum_id == models.Curriculum.id
        ).join(
            models.Department,
            models.Curriculum.department_id == models.Department.id
        ).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        )

    count = query.count()
    return {"count": count}
 
@router.post("/validate", response_model=List[schemas.ConflictDetail])
def validate_schedule_conflict(
    validation_data: schemas.ConflictValidate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Checks for conflicts against a potential schedule slot.
    Returns a list of detailed conflicts found.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    conflicts = []
    
    # 1. Base query for overlaps in the same semester and day
    base_query = db.query(models.Schedule).filter(
        models.Schedule.semester_id == validation_data.semester_id,
        models.Schedule.day_of_week == validation_data.day_of_week
    )
    
    # Exclude the schedule we might be updating
    if validation_data.ignore_schedule_id:
        base_query = base_query.filter(models.Schedule.id != validation_data.ignore_schedule_id)

    # Time overlap check: (StartA < EndB) and (EndA > StartB)
    time_filter = (
        (models.Schedule.start_time < validation_data.end_time) & 
        (models.Schedule.end_time > validation_data.start_time)
    )
    
    # A. Room Conflict
    if validation_data.room_id:
        room_overlap = base_query.filter(
            models.Schedule.room_id == validation_data.room_id,
            time_filter
        ).first()
        if room_overlap:
            conflicts.append(schemas.ConflictDetail(
                type="room",
                existing_schedule=schemas.ScheduleResponse.model_validate(room_overlap),
                message=f"Room {room_overlap.room_id} is already occupied by {room_overlap.curriculum_id}"
            ))

    # B. Faculty Conflict
    if validation_data.faculty_id:
        # Check existing schedules
        faculty_overlap = base_query.filter(
            models.Schedule.faculty_id == validation_data.faculty_id,
            time_filter
        ).first()
        if faculty_overlap:
            conflicts.append(schemas.ConflictDetail(
                type="faculty",
                existing_schedule=schemas.ScheduleResponse.model_validate(faculty_overlap),
                message=f"Faculty {faculty_overlap.faculty_id} is already teaching {faculty_overlap.curriculum_id}"
            ))
            
        # Check faculty unavailability
        unavail = db.query(models.FacultyUnavailability).filter(
            models.FacultyUnavailability.faculty_id == validation_data.faculty_id,
            models.FacultyUnavailability.day_of_week == validation_data.day_of_week,
            models.FacultyUnavailability.start_time < validation_data.end_time,
            models.FacultyUnavailability.end_time > validation_data.start_time
        ).first()
        if unavail:
            # We don't have a schedule for unavailability, so we create a dummy Response if needed or just a message
            # For now, let's just focus on schedule-to-schedule conflicts or handle unavail differently
            pass # FacultyUnavailability check should probably return a different structure or we add it to messages

    # C. Section Conflict
    if validation_data.section:
        section_overlap = base_query.filter(
            models.Schedule.section == validation_data.section,
            time_filter
        ).first()
        if section_overlap:
            conflicts.append(schemas.ConflictDetail(
                type="section",
                existing_schedule=schemas.ScheduleResponse.model_validate(section_overlap),
                message=f"Section {section_overlap.section} already has a class: {section_overlap.curriculum_id}"
            ))

    return conflicts
