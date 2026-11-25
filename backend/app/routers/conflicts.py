import re
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models, database, auth, schemas
from ..services.schedule_generator import faculty_has_flexible_lunch_break, GENERAL_MAX_END_TIME

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

    Deliberately not wrapped in a blanket `except Exception: return {"count": 0}`.
    Zero is the answer that means "this timetable is clean", and the caller
    renders it as a green all-clear -- so a query that raised and reported zero
    was indistinguishable from a genuinely conflict-free schedule. That is the
    one wrong answer this endpoint must never give, and it is not hypothetical:
    a column missing from `conflicts` (see the schema-drift note in main.py)
    raises here, and the panel went quiet instead of saying so. Failing loudly
    lets the client show "unavailable" rather than "none".

    The early returns below are different: each is a real, known zero, not a
    failure to find out.
    """
    if current_user.role not in ['admin', 'dean', 'program_chair']:
        return {"count": 0}

    # 1. Find the active semester
    active_semester = db.query(models.Semester).filter(models.Semester.is_active == True).first()
    if not active_semester:
        return {"count": 0}

    # 2. Build the query.
    # Conflicts come in two shapes: schedule-overlap conflicts carry
    # schedule_id_1, while generator conflicts (unplaced subject, workload cap)
    # carry only faculty_id/curriculum_id and leave schedule_id_1 NULL. An
    # inner join on schedule_id_1 dropped the entire second group, so this
    # count read 0 while the conflicts panel listed them. Outer-join instead
    # and resolve the department through whichever link the row actually has.
    query = db.query(models.Conflict).outerjoin(
        models.Schedule,
        models.Conflict.schedule_id_1 == models.Schedule.id
    ).outerjoin(
        models.Curriculum,
        models.Curriculum.id == func.coalesce(
            models.Conflict.curriculum_id, models.Schedule.curriculum_id
        )
    ).filter(
        models.Conflict.resolved_at == None,
        # Keep semester scoping where a schedule link exists; generator
        # conflicts have no schedule to scope by and are always current.
        (models.Schedule.id == None) | (models.Schedule.semester_id == active_semester.id)
    )

    # 3. Apply department scoping for Deans and Program Chairs
    if current_user.role in ['dean', 'program_chair']:
        if not current_user.department:
            return {"count": 0}

        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            return {"count": 0}

        query = query.filter(models.Curriculum.department_id == dept.id)

    return {"count": query.count()}
 
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
    if current_user.role not in ['admin', 'dean', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    conflicts = []

    # Check 5:30 PM - 7:30 PM time slot restriction (CVMAS only)
    dept_code = str(current_user.department or "").upper()
    if getattr(validation_data, 'curriculum_id', None):
        c_item = db.query(models.Curriculum).filter(models.Curriculum.id == validation_data.curriculum_id).first()
        if c_item and c_item.department_id:
            c_dept = db.query(models.Department).filter(models.Department.id == c_item.department_id).first()
            if c_dept and c_dept.code:
                dept_code = str(c_dept.code).upper()

    if dept_code != "CVMAS" and validation_data.end_time > GENERAL_MAX_END_TIME:
        conflicts.append(schemas.ConflictDetail(
            type="time_restriction",
            existing_schedule=None,
            message="The 5:30 PM – 7:30 PM time slot is restricted to CVMAS only. Classes must end by 5:30 PM (17:30)."
        ))

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
    
    # A. Faculty Conflict
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
            conflicts.append(schemas.ConflictDetail(
                type="faculty_unavailability",
                existing_schedule=None,
                message=f"Faculty is marked unavailable on {validation_data.day_of_week} from {unavail.start_time} to {unavail.end_time}"
            ))

        # Check flexible 1-hour lunch break
        same_day_scheds_for_lunch = base_query.filter(
            models.Schedule.faculty_id == validation_data.faculty_id
        ).all()
        if not faculty_has_flexible_lunch_break(
            faculty_id=validation_data.faculty_id,
            day=validation_data.day_of_week,
            cand_start=validation_data.start_time,
            cand_end=validation_data.end_time,
            all_schedules=same_day_scheds_for_lunch,
        ):
            conflicts.append(schemas.ConflictDetail(
                type="lunch_break",
                existing_schedule=None,
                message=f"Faculty schedule must include a 1-hour lunch break each day. Placing this class leaves less than 1 continuous hour free between 11:00 AM and 02:30 PM on {validation_data.day_of_week}."
            ))


    # D. Session Order Conflict (Lecture must precede Laboratory on the same day)
    if getattr(validation_data, 'curriculum_id', None) and validation_data.faculty_id:
        target_curr = db.query(models.Curriculum).filter(models.Curriculum.id == validation_data.curriculum_id).first()
        if target_curr:
            target_code = str(target_curr.code or "")
            target_base = re.sub(r"[_\-\s]*(?:A/B|[AB])$", "", target_code, flags=re.IGNORECASE).strip().upper()
            is_target_lab = (target_curr.type == 'lab' or (target_curr.lab_units or 0) > 0 or target_code.upper().endswith('B'))
            is_target_lec = (target_curr.type == 'lecture' or (target_curr.lec_units or 0) > 0 or target_code.upper().endswith('A'))

            same_day_scheds = base_query.filter(
                models.Schedule.faculty_id == validation_data.faculty_id
            ).all()

            for s in same_day_scheds:
                if validation_data.ignore_schedule_id and s.id == validation_data.ignore_schedule_id:
                    continue
                other_curr = s.curriculum
                if not other_curr:
                    continue
                other_code = str(other_curr.code or "")
                other_base = re.sub(r"[_\-\s]*(?:A/B|[AB])$", "", other_code, flags=re.IGNORECASE).strip().upper()

                is_same_subject = (target_base and target_base == other_base) or (
                    target_curr.id == other_curr.id and (target_curr.lec_units or 0) > 0 and (target_curr.lab_units or 0) > 0
                )
                if not is_same_subject:
                    continue

                # Skip session-order comparison when both rows reference the exact same
                # curriculum row (single combined A/B row has both lec_units & lab_units > 0,
                # so comparing it against itself produces a false-positive violation).
                if target_curr.id == other_curr.id:
                    continue

                is_other_lab = (other_curr.type == 'lab' or ((other_curr.lab_units or 0) > 0 and (other_curr.lec_units or 0) == 0) or other_code.upper().endswith('B'))
                is_other_lec = (other_curr.type == 'lecture' or ((other_curr.lec_units or 0) > 0 and (other_curr.lab_units or 0) == 0) or other_code.upper().endswith('A'))

                if is_target_lab and is_other_lec:
                    if validation_data.start_time < s.end_time:
                        conflicts.append(schemas.ConflictDetail(
                            type="session_order",
                            existing_schedule=schemas.ScheduleResponse.model_validate(s),
                            message=f"Session order violation: Laboratory ({target_code}) must be scheduled after its Lecture ({other_code}, ending at {s.end_time.strftime('%I:%M %p')}) on {validation_data.day_of_week}."
                        ))
                elif is_target_lec and is_other_lab:
                    if validation_data.end_time > s.start_time:
                        conflicts.append(schemas.ConflictDetail(
                            type="session_order",
                            existing_schedule=schemas.ScheduleResponse.model_validate(s),
                            message=f"Session order violation: Lecture ({target_code}) must be scheduled before its Laboratory ({other_code}, starting at {s.start_time.strftime('%I:%M %p')}) on {validation_data.day_of_week}."
                        ))

    return conflicts
