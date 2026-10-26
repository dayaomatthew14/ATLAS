from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List, Optional, cast
from datetime import datetime, timezone
from pydantic import BaseModel
import logging
from .. import models, database, auth
from ..services.schedule_generator import generate_schedules
from .logs import log_activity

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/ai-scheduler",
    tags=["AI Scheduler"]
)

class GenerateRequest(BaseModel):
    faculty_ids: List[int]
    auto_bump_units: Optional[bool] = True
    # `assign_lab_rooms` used to live here. Rooms are best-effort now and never
    # a requirement, so there is nothing for a caller to choose. Pydantic
    # ignores unknown fields by default, so a client still sending it is not an
    # error -- the value simply has no effect.


class SolveConflictRequest(BaseModel):
    conflict_id: Optional[int] = None
    faculty_id: Optional[int] = None
    curriculum_id: Optional[int] = None
    semester_id: Optional[int] = None
    part_type: Optional[str] = "lecture"

@router.post("/generate/{semester_id}")
def generate_schedule(
    semester_id: int,
    request: GenerateRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Generation belongs to the college that owns the timetable. The admin
    # branch that used to sit here fell back to `Department.first()` when the
    # administrator had no department of their own, so generating as an admin
    # silently built a schedule for whichever college happened to sort first.
    dept = None
    if current_user.role in ['dean', 'program_chair']:
        if not current_user.department:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Your account is not assigned to a college. Ask an administrator to set one."
            )
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Institutional administrators do not generate schedules. This is done by the college Dean or Program Chair."
        )
    
    if not dept:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")
         
    # Generate for the semester the caller actually asked for. This used to be
    # overwritten with whichever semester happened to be active, so the path
    # parameter was silently ignored.
    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Semester {semester_id} not found. Create the academic term before generating schedules."
        )


    # Map input User IDs to Faculty IDs
    faculty_records = db.query(models.Faculty).filter(models.Faculty.id.in_(request.faculty_ids)).all()
    resolved_faculty_ids = [cast(int, f.id) for f in faculty_records]

    # Run the generator with strict DLSAU workload limits (auto_bump_units=False)
    results = generate_schedules(
        db, semester_id, resolved_faculty_ids, cast(int, dept.id),
        auto_bump_units=False,
    )

    # The generator commits schedules and conflict records in one transaction, so a
    # failure there discards everything it produced. Never report that as success.
    if results.get('error'):
        log_activity(
            db,
            int(getattr(current_user, 'id')),
            "Generate Schedule",
            f"Schedule generation failed for {dept.name}: {results['error']}",
            "error",
            department_id=dept.id  # type: ignore
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schedule generation failed and no schedules were saved: {results['error']}"
        )

    unplaced_data = results.get('unplaced', [])
    unplaced_count = len(unplaced_data) if isinstance(unplaced_data, list) else 0
    workload_warnings = results.get('bumped_warnings', [])
    warnings_count = len(workload_warnings) if isinstance(workload_warnings, list) else 0
    
    log_detail = f"Generated schedule for {dept.name} ({semester.academic_year} {semester.term}). Schedules generated: {results.get('generated', 0)}. Unplaced: {unplaced_count}. Skipped GenEd: {results.get('skipped_gened', 0)}."
    if warnings_count > 0:
        log_detail += f" Warning: {warnings_count} faculty teaching-load warning(s) (overload or Part-Time ceiling)."

    # Log the activity
    log_activity(
        db,
        int(getattr(current_user, 'id')),
        "Generate Schedule",
        log_detail,
        "success" if (unplaced_count == 0 and warnings_count == 0) else "warning",
        department_id=dept.id # type: ignore
    )

    return {
        "msg": "Schedule generation completed",
        "generated": results.get('generated', 0),
        "unplaced_count": unplaced_count,
        "unplaced_items": unplaced_data,
        "skipped_gened": results.get('skipped_gened', 0),
        "workload_warnings": workload_warnings
    }

@router.get("/conflicts")
def get_conflicts(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    List unresolved conflicts for the caller's scope.

    An empty list here means "nothing is wrong with this timetable", so it is
    never used to report a failure to find out -- a blanket
    `except Exception: return []` made a crashed query look like a clean
    schedule. Unexpected errors propagate and the client shows the panel as
    unavailable. The early returns below are genuine, known-empty cases.
    """
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        return []

    query = db.query(models.Conflict).filter(models.Conflict.resolved_at == None)

    # Scope to the caller's department. Without this, a chair saw every
    # department's conflicts. Resolve the department through curriculum_id
    # directly, or through the linked schedule for overlap conflicts.
    if current_user.role in ['program_chair', 'coordinator']:
        if not current_user.department:
            return []
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            return []

        dept_curriculum_ids = [
            c.id for c in db.query(models.Curriculum.id).filter(
                models.Curriculum.department_id == dept.id
            ).all()
        ]
        dept_schedule_ids = [
            s.id for s in db.query(models.Schedule.id).filter(
                models.Schedule.curriculum_id.in_(dept_curriculum_ids)
            ).all()
        ] if dept_curriculum_ids else []

        query = query.filter(
            models.Conflict.curriculum_id.in_(dept_curriculum_ids) |
            models.Conflict.schedule_id_1.in_(dept_schedule_ids)
        )

    conflicts = query.offset(skip).limit(limit).all()

    res = []
    for c in conflicts:
        try:
            curr = db.query(models.Curriculum).filter(models.Curriculum.id == c.curriculum_id).first() if c.curriculum_id else None
            fac = db.query(models.Faculty).filter(models.Faculty.id == c.faculty_id).first() if c.faculty_id else None
            s1 = db.query(models.Schedule).filter(models.Schedule.id == c.schedule_id_1).first() if c.schedule_id_1 else None

            curriculum_code = curr.code if curr else (s1.curriculum.code if s1 and s1.curriculum else "Subject Issue")
            faculty_name = f"{fac.first_name} {fac.last_name}" if fac else (f"{s1.faculty.first_name} {s1.faculty.last_name}" if s1 and s1.faculty else "Faculty")

            res.append({
                "id": c.id,
                "conflict_id": c.id,
                "type": (c.conflict_type or "Conflict").replace('_', ' ').title(),
                "reason": c.reason or "Overlapping time or resource constraints.",
                "curriculum": curriculum_code,
                "faculty_name": faculty_name,
                "curriculum_id": c.curriculum_id or (s1.curriculum_id if s1 else None),
                "faculty_id": c.faculty_id or (s1.faculty_id if s1 else None),
                "schedule_id_1": c.schedule_id_1,
                "schedule_id_2": c.schedule_id_2
            })
        except Exception as e:
            # One unreadable row must not delete a conflict from the user's
            # view -- `continue` here silently shrank the list, which reads as
            # "fewer problems than there are". Surface a placeholder instead:
            # the row still occupies its place and still counts, and it says
            # plainly that its detail could not be loaded.
            logger.warning(f"[conflicts] row {getattr(c, 'id', '?')} could not be rendered: {type(e).__name__}: {e}")
            res.append({
                "id": getattr(c, "id", None),
                "conflict_id": getattr(c, "id", None),
                "type": "Unreadable Conflict",
                "reason": "This conflict exists but its details could not be loaded. Report it to an administrator.",
                "curriculum": "Unknown",
                "faculty_name": "Unknown",
                "curriculum_id": None,
                "faculty_id": None,
                "schedule_id_1": None,
                "schedule_id_2": None,
                "degraded": True,
            })

    return res

@router.get("/global-schedule")
def get_global_schedule(
    semester_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(
        models.Schedule.id,
        models.Schedule.curriculum_id,
        models.Schedule.faculty_id,
        models.Curriculum.code.label("subject_code"),
        models.Curriculum.name.label("subject_name"),
        models.Curriculum.type.label("curriculum_type"),
        models.Faculty.first_name,
        models.Faculty.last_name,
        models.Schedule.day_of_week,
        models.Schedule.start_time,
        models.Schedule.end_time,
        models.Schedule.section,
        models.Department.name.label("department_name"),
        models.Schedule.status,
        models.Schedule.room_id
    ).join(
        models.Curriculum, models.Schedule.curriculum_id == models.Curriculum.id
    ).join(
        models.Faculty, models.Schedule.faculty_id == models.Faculty.id
    ).join(
        models.Department, models.Curriculum.department_id == models.Department.id
    ).filter(
        models.Schedule.semester_id == semester_id
    )

    if current_user.role in ['program_chair', 'coordinator', 'faculty', 'student']:
        # Fail closed. Previously an unresolvable department left the query
        # unfiltered, exposing the whole university's schedule.
        if not current_user.department:
            return []
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            return []
        query = query.filter(models.Curriculum.department_id == dept.id)

    schedules = query.all()
    
    import re
    response = []
    for s in schedules:
        raw_code: str = str(s.subject_code or "")
        display_code = raw_code
        ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", raw_code, re.IGNORECASE)
        if ab_match:
            base_code = ab_match.group(1).strip()
            if s.curriculum_type == 'lecture':
                display_code = f"{base_code}A"
            else:
                display_code = f"{base_code}B"

        response.append({
            "id": s.id,
            # The conflict lens matches conflicts to blocks on curriculum_id.
            # Without it every block dims and none light up.
            "curriculum_id": s.curriculum_id,
            "faculty_id": s.faculty_id,
            "subject_code": display_code,
            "subject_name": s.subject_name,
            "faculty_name": f"{s.first_name} {s.last_name}",
            "room_name": "TBA",
            "room_building": "",
            "day_of_week": s.day_of_week,
            "start_time": s.start_time.strftime("%H:%M") if s.start_time else "00:00",
            "end_time": s.end_time.strftime("%H:%M") if s.end_time else "00:00",
            "section": s.section,
            "department_name": s.department_name,
            "status": s.status
        })

    return response

@router.post("/solve-conflict")
def solve_conflict(
    req: SolveConflictRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators do not resolve conflicts. This is done by the program chair or coordinator."
        )

    conflict = None
    if req.conflict_id:
        conflict = db.query(models.Conflict).filter(models.Conflict.id == req.conflict_id).first()

    faculty_id = req.faculty_id or (conflict.faculty_id if conflict else None)
    curriculum_id = req.curriculum_id or (conflict.curriculum_id if conflict else None)

    f_obj = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first() if faculty_id else None
    c_obj = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first() if curriculum_id else None

    fac_name = f"{f_obj.first_name} {f_obj.last_name}".strip() if f_obj else "Faculty member"
    subj_code = c_obj.code if c_obj else "Subject"

    dept_id: Optional[int] = cast(Optional[int], f_obj.department_id) if f_obj else None
    if not dept_id and current_user.department:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            dept_id = cast(int, dept.id)

    # 1. Schedule-to-Schedule Overlap Conflict
    if conflict and conflict.schedule_id_1:
        s1 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_1).first()
        s2 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_2).first() if conflict.schedule_id_2 else None

        target_sched = s2 or s1
        if target_sched:
            curr_item = db.query(models.Curriculum).filter(models.Curriculum.id == target_sched.curriculum_id).first()
            is_lec = (curr_item and curr_item.type == 'lecture') or (req.part_type == 'lecture')
            
            from ..services.schedule_generator import TIMESLOTS, DAYS, is_prof_conflict
            all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == target_sched.semester_id).all()

            placed = False
            item_code = curr_item.code if curr_item else subj_code
            for day in DAYS:
                if placed: break
                for start_t, end_t in TIMESLOTS:
                    if not is_prof_conflict(target_sched.faculty_id, day, day, start_t, end_t, all_schedules):
                        target_sched.room_id = None # type: ignore
                        target_sched.day_of_week = day # type: ignore
                        target_sched.start_time = start_t # type: ignore
                        target_sched.end_time = end_t # type: ignore
                        conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
                        log_activity(
                            db,
                            current_user.id,
                            "Resolve Conflict",
                            f"Relocated schedule for {item_code} ({fac_name}) to {day} {start_t.strftime('%H:%M')}",
                            "success",
                            dept_id
                        )
                        db.commit()
                        placed = True
                        return {
                            "status": "success",
                            "action_taken": "schedule_relocated",
                            "title": "Schedule Relocated",
                            "message": f"Relocated schedule to {day} {start_t.strftime('%H:%M')}.",
                            "details": f"Schedule for {item_code} was moved to {day} {start_t.strftime('%H:%M')}–{end_t.strftime('%H:%M')} to resolve the overlap. Recorded in the Activity Log."
                        }

            if not placed:
                conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
                log_activity(
                    db,
                    current_user.id,
                    "Resolve Conflict",
                    f"Overlap conflict #{conflict.id} ({conflict.reason or 'overlap'}) resolved via administrative override",
                    "warning",
                    dept_id
                )
                db.commit()
                return {
                    "status": "success",
                    "action_taken": "admin_override",
                    "title": "Administrative Override",
                    "message": "Conflict resolved via administrative override.",
                    "details": "The schedule conflict was marked as resolved under administrative exception. Recorded in the Activity Log."
                }

    # 2. Overload or Part-Time Ceiling Conflict
    if conflict and (
        conflict.conflict_type in ['overload', 'part_time_ceiling'] or 
        (conflict.reason and 'overload' in conflict.reason.lower())
    ):
        conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
        
        # Mark all pending overload / part_time_ceiling conflicts for this faculty & curriculum as resolved
        if faculty_id and curriculum_id:
            pending_overloads = db.query(models.Conflict).filter(
                models.Conflict.faculty_id == faculty_id,
                models.Conflict.curriculum_id == curriculum_id,
                models.Conflict.conflict_type.in_(['overload', 'part_time_ceiling']),
                models.Conflict.resolved_at == None
            ).all()
            for oc in pending_overloads:
                oc.resolved_at = datetime.now(timezone.utc) # type: ignore

        is_overload = conflict.conflict_type == 'overload' or (conflict.reason and 'overload' in conflict.reason.lower())
        action_title = "Overload Authorized" if is_overload else "Load Exception Authorized"
        reason_desc = conflict.reason or "Overload condition approved by department head"
        log_msg = f"Authorized {('overload' if is_overload else 'part-time ceiling exception')} for {fac_name} on {subj_code}: {reason_desc}"
        
        log_activity(db, current_user.id, "Resolve Conflict", log_msg, "success", dept_id)
        db.commit()

        return {
            "status": "success",
            "action_taken": "overload_approved",
            "title": action_title,
            "message": f"Overload for {fac_name} on {subj_code} has been authorized.",
            "details": f"{reason_desc}. The assigned teaching load has been approved and confirmed in the timetable. Recorded in the Activity Log."
        }

    # 3. Subject Assignment / Unplaced Subject
    if faculty_id and curriculum_id:
        if not f_obj or not c_obj:
            raise HTTPException(status_code=404, detail="Faculty or Curriculum item not found")

        sem_id = req.semester_id
        if not sem_id:
            active_sem = db.query(models.Semester).filter(models.Semester.is_active == True).first()
            sem_id = active_sem.id if active_sem else 1

        # Check if subject is ALREADY scheduled in this semester for this faculty
        existing_schedules = db.query(models.Schedule).filter(
            models.Schedule.semester_id == sem_id,
            models.Schedule.curriculum_id == c_obj.id,
            models.Schedule.faculty_id == faculty_id
        ).all()

        if existing_schedules:
            if conflict:
                conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
            # Mark all pending conflicts for this faculty + subject resolved
            unresolved = db.query(models.Conflict).filter(
                models.Conflict.faculty_id == faculty_id,
                models.Conflict.curriculum_id == curriculum_id,
                models.Conflict.resolved_at == None
            ).all()
            for uc in unresolved:
                uc.resolved_at = datetime.now(timezone.utc) # type: ignore

            log_msg = f"Confirmed schedule placement for {c_obj.code} ({fac_name}): {conflict.reason if conflict else 'Existing timetable entry validated'}"
            log_activity(db, current_user.id, "Resolve Conflict", log_msg, "success", dept_id)
            db.commit()

            return {
                "status": "success",
                "action_taken": "already_scheduled",
                "title": "Schedule Confirmed",
                "message": f"{c_obj.code} is already scheduled for {fac_name}.",
                "details": f"Schedule placement for {c_obj.code} ({c_obj.name}) was confirmed. Conflict marked resolved and recorded in the Activity Log."
            }

        # Automatically bump faculty max units cap to accommodate the unplaced subject
        f_obj.max_units = int((f_obj.max_units or 18) + 12) # type: ignore

        from ..services.schedule_generator import LAB_SLOTS, MW_PAIR, TTH_PAIR, FS_PAIR, is_prof_conflict, lecture_slots_for
        all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()

        part_type = req.part_type or 'lecture'
        # Same grid the generator would have used for this subject. Re-plotting a
        # conflict on a different grid would give the class a different weekly
        # load than the one the timetable was built with.
        slots = LAB_SLOTS if part_type == 'lab' else lecture_slots_for(c_obj)
        day_pairs = [MW_PAIR, TTH_PAIR, FS_PAIR]

        placed = False
        placed_days_str = ""
        placed_times_str = ""
        for days in day_pairs:
            if placed: break
            d1, d2 = days[0], days[1]
            for start_t, end_t in slots:
                if not is_prof_conflict(faculty_id, d1, d2, start_t, end_t, all_schedules):
                    s1 = models.Schedule(
                        semester_id=sem_id,
                        curriculum_id=c_obj.id,
                        faculty_id=faculty_id,
                        room_id=None,
                        day_of_week=d1,
                        start_time=start_t,
                        end_time=end_t,
                        section="",
                        status='draft'
                    )
                    s2 = models.Schedule(
                        semester_id=sem_id,
                        curriculum_id=c_obj.id,
                        faculty_id=faculty_id,
                        room_id=None,
                        day_of_week=d2,
                        start_time=start_t,
                        end_time=end_t,
                        section="",
                        status='draft'
                    )
                    db.add_all([s1, s2])
                    placed = True
                    placed_days_str = f"{d1}/{d2}"
                    placed_times_str = f"{start_t.strftime('%H:%M')}–{end_t.strftime('%H:%M')}"
                    break

        if not placed:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No conflict-free slot exists for {c_obj.code} with the current timetable "
                    f"and {f_obj.first_name} {f_obj.last_name}'s availability. "
                    "Relax an unavailable window or raise the teaching-load cap, "
                    "then try again."
                )
            )

        if conflict:
            conflict.resolved_at = datetime.now(timezone.utc) # type: ignore

        # Mark all pending unplaced conflicts for this faculty + subject as resolved
        unresolved = db.query(models.Conflict).filter(
            models.Conflict.faculty_id == faculty_id,
            models.Conflict.curriculum_id == curriculum_id,
            models.Conflict.resolved_at == None
        ).all()
        for uc in unresolved:
            uc.resolved_at = datetime.now(timezone.utc) # type: ignore

        log_msg = f"Scheduled unplaced subject {c_obj.code} for {fac_name} on {placed_days_str} {placed_times_str}"
        log_activity(db, current_user.id, "Resolve Conflict", log_msg, "success", dept_id)
        db.commit()

        return {
            "status": "success",
            "action_taken": "subject_scheduled",
            "title": "Subject Scheduled",
            "message": f"Successfully resolved conflict and scheduled {c_obj.code} for {fac_name}.",
            "details": f"Assigned time slot {placed_days_str} {placed_times_str}. Teaching capacity was adjusted and recorded in the Activity Log."
        }

    # 4. Fallback: Any other conflict marked resolved by administrative decision
    if conflict:
        conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
        log_msg = f"Conflict #{conflict.id} resolved via administrative override: {conflict.reason or 'Exception approved'}"
        log_activity(db, current_user.id, "Resolve Conflict", log_msg, "success", dept_id)
        db.commit()
        return {
            "status": "success",
            "action_taken": "admin_override",
            "title": "Conflict Resolved",
            "message": "Conflict resolved via administrative override.",
            "details": f"Conflict #{conflict.id} ({conflict.reason or 'Overridden'}) was resolved under administrative exception. Recorded in the Activity Log."
        }

    raise HTTPException(status_code=400, detail="Could not solve conflict with provided details.")

@router.post("/resolve-conflicts")
def resolve_conflicts(
    conflict_ids: List[int] = Body(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'dean', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    resolved_count = 0
    results = []

    for conflict_id in conflict_ids:
        try:
            res = solve_conflict(SolveConflictRequest(conflict_id=conflict_id), db, current_user)
            resolved_count += 1
            results.append({"conflict_id": conflict_id, "status": "resolved", "message": res.get("message")})
        except Exception as e:
            results.append({"conflict_id": conflict_id, "status": "failed", "reason": str(e)})

    return {
        "resolved_count": resolved_count,
        "results": results
    }
