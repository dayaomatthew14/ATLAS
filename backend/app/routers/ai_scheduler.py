from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, time
from pydantic import BaseModel
from .. import models, database, auth
from ..services.schedule_generator import generate_schedules, TIMESLOTS, DAYS
from .logs import log_activity

router = APIRouter(
    prefix="/api/ai-scheduler",
    tags=["AI Scheduler"]
)

class GenerateRequest(BaseModel):
    faculty_ids: List[int]
    auto_bump_units: Optional[bool] = True
    # Whether laboratory subjects should be given a room. Lectures never are,
    # either way. Defaults to True so an older client keeps the behaviour it
    # was written against.
    assign_lab_rooms: Optional[bool] = True

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
    if current_user.role in ['program_chair', 'coordinator']:
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
            detail="Administrators do not generate schedules. This is done by the program chair or coordinator."
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
    resolved_faculty_ids = [f.id for f in faculty_records]

    # Run the generator with strict DLSAU workload limits (auto_bump_units=False)
    assign_lab_rooms = True if request.assign_lab_rooms is None else bool(request.assign_lab_rooms)
    results = generate_schedules(
        db, semester_id, resolved_faculty_ids, dept.id,
        auto_bump_units=False,
        assign_lab_rooms=assign_lab_rooms,
    ) # type: ignore

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
    
    room_mode = "laboratories given rooms" if assign_lab_rooms else "no rooms assigned"
    log_detail = f"Generated schedule for {dept.name} ({semester.academic_year} {semester.term}). Schedules generated: {results.get('generated', 0)}. Unplaced: {unplaced_count}. Skipped GenEd: {results.get('skipped_gened', 0)}. Rooms: {room_mode}."
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
    try:
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
            except Exception:
                continue

        return res
    except Exception:
        return []

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
        models.Room.name.label("room_name"),
        models.Room.building.label("room_building"),
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
    ).outerjoin(
        models.Room, models.Schedule.room_id == models.Room.id
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
            if s.room_id is None or s.curriculum_type == 'lecture':
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
            "room_name": s.room_name if s.room_name else "—",
            "room_building": s.room_building if s.room_building else "",
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
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not resolve conflicts. This is done by the program chair or coordinator.")

    conflict = None
    if req.conflict_id:
        conflict = db.query(models.Conflict).filter(models.Conflict.id == req.conflict_id).first()

    faculty_id = req.faculty_id or (conflict.faculty_id if conflict else None)
    curriculum_id = req.curriculum_id or (conflict.curriculum_id if conflict else None)

    # 1. Schedule-to-Schedule Overlap Conflict
    if conflict and conflict.schedule_id_1:
        s1 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_1).first()
        s2 = db.query(models.Schedule).filter(models.Schedule.id == conflict.schedule_id_2).first() if conflict.schedule_id_2 else None

        target_sched = s2 or s1
        if target_sched:
            curr_item = db.query(models.Curriculum).filter(models.Curriculum.id == target_sched.curriculum_id).first()
            is_lec = (curr_item and curr_item.type == 'lecture') or (req.part_type == 'lecture')
            
            from ..services.schedule_generator import TIMESLOTS, DAYS, is_room_conflict, is_prof_conflict
            all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == target_sched.semester_id).all()

            placed = False
            if is_lec:
                for day in DAYS:
                    if placed: break
                    for start_t, end_t in TIMESLOTS:
                        if not is_prof_conflict(target_sched.faculty_id, day, day, start_t, end_t, all_schedules):
                            target_sched.room_id = None # type: ignore
                            target_sched.day_of_week = day # type: ignore
                            target_sched.start_time = start_t # type: ignore
                            target_sched.end_time = end_t # type: ignore
                            conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
                            db.commit()
                            placed = True
                            return {"status": "success", "message": f"Relocated lecture schedule to {day} {start_t.strftime('%H:%M')}"}
            else:
                all_rooms = db.query(models.Room).filter(models.Room.type.in_(['lab', 'computer_lab'])).all()
                for r in all_rooms:
                    if placed: break
                    for day in DAYS:
                        if placed: break
                        for start_t, end_t in TIMESLOTS:
                            if not is_room_conflict(r.id, day, day, start_t, end_t, all_schedules) and not is_prof_conflict(target_sched.faculty_id, day, day, start_t, end_t, all_schedules):
                                target_sched.room_id = r.id # type: ignore
                                target_sched.day_of_week = day # type: ignore
                                target_sched.start_time = start_t # type: ignore
                                target_sched.end_time = end_t # type: ignore
                                conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
                                db.commit()
                                placed = True
                                return {"status": "success", "message": f"Relocated schedule to {r.name} on {day} {start_t.strftime('%H:%M')}"}

            if not placed:
                conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
                db.commit()
                return {"status": "success", "message": "Conflict resolved via administrative override."}

    # 2. Unplaced Subject / Max Units Limit Exceeded
    if faculty_id and curriculum_id:
        f_obj = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
        c_obj = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()

        if not f_obj or not c_obj:
            raise HTTPException(status_code=404, detail="Faculty or Curriculum item not found")

        # Automatically bump faculty max units cap to accommodate the unplaced subject
        f_obj.max_units = int((f_obj.max_units or 18) + 12) # type: ignore

        sem_id = req.semester_id
        if not sem_id:
            active_sem = db.query(models.Semester).filter(models.Semester.is_active == True).first()
            sem_id = active_sem.id if active_sem else 1

        all_rooms = db.query(models.Room).all()
        if not all_rooms:
            raise HTTPException(status_code=400, detail="No rooms available in database")

        from ..services.schedule_generator import LAB_SLOTS, MW_PAIR, TTH_PAIR, FS_PAIR, is_room_conflict, is_prof_conflict, lecture_slots_for
        all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()

        part_type = req.part_type or 'lecture'
        # Same grid the generator would have used for this subject. Re-plotting a
        # conflict on a different grid would give the class a different weekly
        # load than the one the timetable was built with.
        slots = LAB_SLOTS if part_type == 'lab' else lecture_slots_for(c_obj)
        day_pairs = [MW_PAIR, TTH_PAIR, FS_PAIR]

        placed = False
        for days in day_pairs:
            if placed: break
            d1, d2 = days[0], days[1]
            for start_t, end_t in slots:
                if placed: break
                for r in all_rooms:
                    if not is_room_conflict(r.id, d1, d2, start_t, end_t, all_schedules) and not is_prof_conflict(faculty_id, d1, d2, start_t, end_t, all_schedules):
                        s1 = models.Schedule(
                            semester_id=sem_id,
                            curriculum_id=c_obj.id,
                            faculty_id=faculty_id,
                            room_id=r.id,
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
                            room_id=r.id,
                            day_of_week=d2,
                            start_time=start_t,
                            end_time=end_t,
                            section="",
                            status='draft'
                        )
                        db.add_all([s1, s2])
                        placed = True
                        break

        # DEP-6. There used to be a "fallback placement" here: when no
        # conflict-free slot existed it forced the class into the first room on
        # Mon/Wed regardless of what was already there, marked the conflict
        # resolved, and returned success. That manufactured a double-booking and
        # reported it as a fix. Refusing is the honest outcome -- the schedule
        # needs a room, a wider availability window, or a different cap, and
        # only a human can decide which.
        if not placed:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"No conflict-free slot exists for {c_obj.code} with the current rooms "
                    f"and {f_obj.first_name} {f_obj.last_name}'s availability. "
                    "Add a room, relax an unavailable window, or raise the teaching-load cap, "
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

        db.commit()

        log_activity(db, current_user.id, "Solve Conflict", f"Auto-solved conflict for {c_obj.code} ({f_obj.first_name} {f_obj.last_name})", "success")

        return {
            "status": "success",
            "message": f"Successfully resolved conflict and scheduled {c_obj.code} for {f_obj.first_name} {f_obj.last_name}."
        }

    if conflict:
        conflict.resolved_at = datetime.now(timezone.utc) # type: ignore
        db.commit()
        return {"status": "success", "message": "Conflict resolved via administrative override."}

    raise HTTPException(status_code=400, detail="Could not solve conflict with provided details.")

@router.post("/resolve-conflicts")
def resolve_conflicts(
    conflict_ids: List[int] = Body(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
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
