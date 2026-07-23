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
         
    # Map input User IDs to Faculty IDs
    faculty_records = db.query(models.Faculty).filter(models.Faculty.id.in_(request.faculty_ids)).all()
    resolved_faculty_ids = [f.id for f in faculty_records]

    # Run the generator
    results = generate_schedules(db, semester_id, resolved_faculty_ids, dept.id, auto_bump_units=request.auto_bump_units if request.auto_bump_units is not None else True) # type: ignore
    
    unplaced_data = results.get('unplaced', [])
    unplaced_count = len(unplaced_data) if isinstance(unplaced_data, list) else 0
    
    # Log the activity
    log_activity(
        db,
        int(current_user.id),
        "Generate Schedule",
        f"Generated schedule for {dept.name} ({semester.academic_year} {semester.term}). Schedules generated: {results.get('generated', 0)}. Unplaced: {unplaced_count}. Skipped GenEd: {results.get('skipped_gened', 0)}",
        "success" if unplaced_count == 0 else "warning",
        department_id=dept.id # type: ignore
    )

    return {
        "msg": "Schedule generation completed",
        "generated": results.get('generated', 0),
        "unplaced_count": unplaced_count,
        "unplaced_items": unplaced_data,
        "skipped_gened": results.get('skipped_gened', 0)
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
            
        conflicts = db.query(models.Conflict).filter(
            models.Conflict.resolved_at == None
        ).offset(skip).limit(limit).all()

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
        models.Curriculum.code.label("subject_code"),
        models.Curriculum.name.label("subject_name"),
        models.Faculty.first_name,
        models.Faculty.last_name,
        models.Room.name.label("room_name"),
        models.Room.building.label("room_building"),
        models.Schedule.day_of_week,
        models.Schedule.start_time,
        models.Schedule.end_time,
        models.Schedule.section,
        models.Department.name.label("department_name"),
        models.Schedule.status
    ).join(
        models.Curriculum, models.Schedule.curriculum_id == models.Curriculum.id
    ).join(
        models.Faculty, models.Schedule.faculty_id == models.Faculty.id
    ).join(
        models.Room, models.Schedule.room_id == models.Room.id
    ).join(
        models.Department, models.Curriculum.department_id == models.Department.id
    ).filter(
        models.Schedule.semester_id == semester_id
    )

    if current_user.role in ['program_chair', 'faculty', 'student']:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Curriculum.department_id == dept.id)
    
    schedules = query.all()
    
    response = []
    for s in schedules:
        response.append({
            "id": s.id,
            "subject_code": s.subject_code,
            "subject_name": s.subject_name,
            "faculty_name": f"{s.first_name} {s.last_name}",
            "room_name": s.room_name,
            "room_building": s.room_building,
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

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
            all_rooms = db.query(models.Room).all()
            from ..services.schedule_generator import TIMESLOTS, DAYS, is_room_conflict, is_prof_conflict
            all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == target_sched.semester_id).all()

            placed = False
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

        from ..services.schedule_generator import LECTURE_SLOTS, LAB_SLOTS, MW_PAIR, TTH_PAIR, FS_PAIR, is_room_conflict, is_prof_conflict
        all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()

        part_type = req.part_type or 'lecture'
        slots = LAB_SLOTS if part_type == 'lab' else LECTURE_SLOTS
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

        # Fallback placement if all standard slots are occupied
        if not placed:
            r = all_rooms[0]
            d1, d2 = 'Mon', 'Wed'
            start_t, end_t = slots[0][0], slots[0][1]
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
