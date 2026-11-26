import logging
from datetime import datetime, timezone, time
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import models, database, auth, schemas

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/lab-rooms",
    tags=["Laboratory Rooms"]
)

COMPUTER_LAB_SPECS = [
    {"name": "Room 608", "building": "Main Building", "capacity": 45, "type": "computer_lab"},
    {"name": "Room 609", "building": "Main Building", "capacity": 45, "type": "computer_lab"},
    {"name": "Cyberneta", "building": "Main Building", "capacity": 50, "type": "computer_lab"},
]

PRIORITY_PROGRAM_CODES = {
    "BSCS", "BSCPE", "CS", "COE", "CE", "UPDA",
    "COMPUTER SCIENCE", "COMPUTER ENGINEERING",
    "BS COMPUTER SCIENCE", "BS COMPUTER ENGINEERING"
}

PSYCHOLOGY_PROGRAM_CODES = {
    "ABPSY", "BSPSY", "PSY", "PSYCH", "PSYC",
    "BA PSYCHOLOGY", "BS PSYCHOLOGY", "PSYCHOLOGY"
}


def ensure_cast_computer_labs(db: Session) -> List[models.Room]:
    """Ensure the 3 Computer Laboratory rooms exist under the CAST department."""
    cast_dept = db.query(models.Department).filter(
        (models.Department.code == "CAST") | (models.Department.name.ilike("%Arts, Sciences%"))
    ).first()

    cast_dept_id = cast_dept.id if cast_dept else None

    rooms = []
    for spec in COMPUTER_LAB_SPECS:
        room = db.query(models.Room).filter(
            models.Room.name == spec["name"]
        ).first()
        if not room:
            room = models.Room(
                name=spec["name"],
                building=spec["building"],
                capacity=spec["capacity"],
                type=spec["type"],
                department_id=cast_dept_id,
            )
            db.add(room)
            db.commit()
            db.refresh(room)
        else:
            # Ensure type and department are accurate
            if room.type != spec["type"] or (cast_dept_id and room.department_id != cast_dept_id):
                room.type = spec["type"]
                if cast_dept_id:
                    room.department_id = cast_dept_id
                db.commit()
                db.refresh(room)
        rooms.append(room)
    return rooms


def assert_cast_access(db: Session, current_user: models.User) -> models.Department:
    """Enforce that only CAST Program Chairs (and CAST Dean/Admin) may access Lab Rooms."""
    if current_user.role == "admin" and not current_user.department:
        cast_dept = db.query(models.Department).filter(models.Department.code == "CAST").first()
        if not cast_dept:
            raise HTTPException(status_code=404, detail="CAST department not found")
        return cast_dept

    dept = auth.resolve_user_department(db, current_user)
    if not dept or dept.code != "CAST":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to Laboratory Rooms is restricted to CAST Program Chairs only."
        )
    return dept


def is_psychology_program(
    curr: Optional[models.Curriculum] = None,
    program_code: Optional[str] = None,
    db: Optional[Session] = None
) -> bool:
    """Check if the subject or requesting program is Psychology (requires CS/COE chair approval)."""
    if program_code:
        p_up = str(program_code).strip().upper()
        if p_up in PSYCHOLOGY_PROGRAM_CODES or "PSYCH" in p_up:
            return True
    if curr:
        p_code = str(getattr(curr, "program_code", "") or "").strip().upper()
        if p_code in PSYCHOLOGY_PROGRAM_CODES or "PSYCH" in p_code:
            return True
        c_code = str(getattr(curr, "code", "") or "").strip().upper()
        if c_code.startswith("PSY"):
            return True
        blk = getattr(curr, "block", None)
        if not blk and db and getattr(curr, "block_id", None):
            blk = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == curr.block_id).first()
        if blk:
            b_name = str(getattr(blk, "program_name", "") or "").strip().upper()
            if "PSYCH" in b_name:
                return True
            b_prog = getattr(blk, "program", None)
            if not b_prog and db and getattr(blk, "program_id", None):
                b_prog = db.query(models.Program).filter(models.Program.id == blk.program_id).first()
            if b_prog and str(getattr(b_prog, "code", "") or "").strip().upper() in PSYCHOLOGY_PROGRAM_CODES:
                return True
    return False


def is_user_or_curr_priority(
    curr: Optional[models.Curriculum] = None,
    program_code: Optional[str] = None,
    user: Optional[models.User] = None,
    db: Optional[Session] = None
) -> bool:
    """
    Check if the laboratory room assignment has priority (CS / COE).
    CS and COE assignments are confirmed and plotted immediately without approval.
    Only requests from Psychology (ABPSY) require approval from the CS/COE Program Chair.
    """
    # 1. Admin or Dean always has priority
    if user and getattr(user, "role", None) in ("admin", "dean"):
        return True

    # 2. Check if explicitly Psychology - Psychology requires approval
    if is_psychology_program(curr, program_code, db=db):
        return False

    # 3. If program_code is explicitly provided
    if program_code:
        norm_p = str(program_code).strip().upper()
        if norm_p in PRIORITY_PROGRAM_CODES or "COMP" in norm_p or "CS" in norm_p or "COE" in norm_p or "CE" in norm_p:
            return True

    # 4. Check Curriculum code, block, and program
    if curr:
        c_code = str(getattr(curr, "code", "") or "").strip().upper()
        # Common computer / CS / COE course codes
        if c_code.startswith(("CC", "COSC", "CS", "COEC", "COEP", "CPE", "CE", "IT", "IS")):
            return True

        p_code = str(getattr(curr, "program_code", "") or "").strip().upper()
        if p_code in PRIORITY_PROGRAM_CODES or p_code in ("UPDA", "CE", "BSCS", "BSCPE", "CS", "COE") or "COMP" in p_code:
            return True

        # Check curriculum block
        blk = getattr(curr, "block", None)
        if not blk and db and getattr(curr, "block_id", None):
            blk = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == curr.block_id).first()

        if blk:
            blk_name = str(getattr(blk, "program_name", "") or "").strip().upper()
            if any(term in blk_name for term in ("COMPUTER", "SCIENCE", "ENGINEERING", "CS", "COE")):
                return True
            blk_prog = getattr(blk, "program", None)
            if not blk_prog and db and getattr(blk, "program_id", None):
                blk_prog = db.query(models.Program).filter(models.Program.id == blk.program_id).first()
            if blk_prog:
                bp_code = str(getattr(blk_prog, "code", "") or "").strip().upper()
                if bp_code in PRIORITY_PROGRAM_CODES or bp_code in ("BSCS", "BSCPE", "CS", "COE") or "CS" in bp_code or "COE" in bp_code:
                    return True
                bp_name = str(getattr(blk_prog, "name", "") or "").strip().upper()
                if any(term in bp_name for term in ("COMPUTER", "SCIENCE", "ENGINEERING")):
                    return True

    # 5. Check user: If the user is a CAST Program Chair or CS/COE Chair assigning a non-psychology lab
    if user and getattr(user, "role", None) in ("program_chair", "coordinator"):
        dept = str(getattr(user, "department", "") or "").strip().upper()
        if dept in ("CAST", "CS", "COE", "BSCS", "BSCPE"):
            return True

    return False


class LabRoomAssignRequest(BaseModel):
    schedule_id: Optional[int] = None
    semester_id: Optional[int] = None
    curriculum_id: Optional[int] = None
    faculty_id: Optional[int] = None
    room_id: int
    day_of_week: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    program_code: Optional[str] = None


class RejectionRequest(BaseModel):
    reason: Optional[str] = "Room request declined by CS/COE Program Chair."


@router.get("")
def list_lab_rooms(
    semester_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """List CAST Computer Laboratory rooms, their active bookings, and pending approvals."""
    cast_dept = assert_cast_access(db, current_user)
    rooms = ensure_cast_computer_labs(db)
    room_ids = [r.id for r in rooms]

    sem = None
    if semester_id:
        sem = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not sem:
        sem = db.query(models.Semester).filter(models.Semester.is_active == True).first()

    schedules_data = []
    pending_requests = []

    if sem:
        scheds = db.query(models.Schedule).filter(
            models.Schedule.semester_id == sem.id,
            models.Schedule.room_id.in_(room_ids),
        ).all()

        for s in scheds:
            curr = s.curriculum
            fac = s.faculty
            prog_code = str(getattr(curr, "program_code", "") or "").strip().upper() if curr else ""
            if not prog_code and curr and getattr(curr, "block", None) and curr.block.program:
                prog_code = str(curr.block.program.code).strip().upper()

            item = {
                "id": s.id,
                "room_id": s.room_id,
                "room_name": s.room.name if s.room else "",
                "subject_code": curr.code if curr else "",
                "subject_name": curr.name if curr else "",
                "faculty_name": f"{fac.first_name} {fac.last_name}".strip() if fac else "Unassigned",
                "day_of_week": s.day_of_week,
                "start_time": s.start_time.strftime("%H:%M") if s.start_time else "",
                "end_time": s.end_time.strftime("%H:%M") if s.end_time else "",
                "program_code": prog_code,
                "room_approval_status": s.room_approval_status or "approved",
                "room_requested_by": s.room_requested_by,
                "room_approved_by": s.room_approved_by,
                "room_approved_at": s.room_approved_at.isoformat() if s.room_approved_at else None,
                "room_rejection_reason": s.room_rejection_reason,
            }
            schedules_data.append(item)
            if s.room_approval_status == "pending_approval":
                pending_requests.append(item)

    return {
        "rooms": [
            {
                "id": r.id,
                "name": r.name,
                "building": r.building,
                "capacity": r.capacity,
                "type": r.type,
                "department_id": r.department_id,
            }
            for r in rooms
        ],
        "schedules": schedules_data,
        "pending_requests": pending_requests,
        "active_semester": {
            "id": sem.id,
            "academic_year": sem.academic_year,
            "term": sem.term,
        } if sem else None,
        "is_priority_role": (
            current_user.role in ("admin", "dean")
            or is_user_or_curr_priority(None, getattr(current_user, "department", None), user=current_user, db=db)
        ),
    }


@router.post("/assign")
def assign_lab_room(
    req: LabRoomAssignRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Assign a Computer Laboratory Room to a schedule.
    CS and COE Program Chairs have priority: assignments are confirmed immediately.
    Other CAST Program Chairs submit requests that require CS/COE chair approval.
    Overlapping room assignments are strictly prevented.
    """
    assert_cast_access(db, current_user)

    target_room = db.query(models.Room).filter(models.Room.id == req.room_id).first()
    if not target_room:
        raise HTTPException(status_code=404, detail="Computer Laboratory room not found")

    sched: Optional[models.Schedule] = None
    if req.schedule_id:
        sched = db.query(models.Schedule).filter(models.Schedule.id == req.schedule_id).first()
        if not sched:
            raise HTTPException(status_code=404, detail="Schedule entry not found")
        day = sched.day_of_week
        start_t = sched.start_time
        end_t = sched.end_time
        sem_id = sched.semester_id
        curr = sched.curriculum
    else:
        if not all([req.semester_id, req.curriculum_id, req.day_of_week, req.start_time, req.end_time]):
            raise HTTPException(
                status_code=400,
                detail="Missing required fields: semester_id, curriculum_id, day_of_week, start_time, end_time"
            )
        day = req.day_of_week
        start_t = req.start_time
        end_t = req.end_time
        sem_id = req.semester_id
        curr = db.query(models.Curriculum).filter(models.Curriculum.id == req.curriculum_id).first()

    # Time slot check: 5:30 PM restriction
    if end_t > time(17, 30):
        raise HTTPException(
            status_code=400,
            detail="The 5:30 PM – 7:30 PM time slot is restricted to CVMAS only. Classes must end by 5:30 PM (17:30)."
        )

    # Overlap prevention check
    overlap_query = db.query(models.Schedule).filter(
        models.Schedule.semester_id == sem_id,
        models.Schedule.room_id == req.room_id,
        models.Schedule.day_of_week == day,
        models.Schedule.start_time < end_t,
        models.Schedule.end_time > start_t,
    )
    if sched:
        overlap_query = overlap_query.filter(models.Schedule.id != sched.id)

    # Check confirmed/approved overlap
    confirmed_overlap = overlap_query.filter(
        (models.Schedule.room_approval_status == 'approved') | (models.Schedule.room_approval_status == None)
    ).first()

    if confirmed_overlap:
        other_curr = confirmed_overlap.curriculum
        other_code = other_curr.code if other_curr else "another class"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Room overlap conflict: {target_room.name} is already booked on {day} "
                f"({confirmed_overlap.start_time.strftime('%I:%M %p')} – {confirmed_overlap.end_time.strftime('%I:%M %p')}) "
                f"by {other_code}."
            )
        )

    # Priority determination
    is_priority = is_user_or_curr_priority(curr, req.program_code, user=current_user, db=db) or current_user.role in ("admin", "dean")

    approval_status = "approved" if is_priority else "pending_approval"

    if sched:
        sched.room_id = req.room_id
        sched.room_approval_status = approval_status
        sched.room_requested_by = current_user.id
        if is_priority:
            sched.room_approved_by = current_user.id
            sched.room_approved_at = datetime.now(timezone.utc)
            sched.room_rejection_reason = None
        db.commit()
        db.refresh(sched)
        target_sched = sched
    else:
        target_sched = models.Schedule(
            semester_id=sem_id,
            curriculum_id=req.curriculum_id,
            faculty_id=req.faculty_id,
            room_id=req.room_id,
            day_of_week=day,
            start_time=start_t,
            end_time=end_t,
            section="",
            status="draft",
            room_approval_status=approval_status,
            room_requested_by=current_user.id,
            room_approved_by=current_user.id if is_priority else None,
            room_approved_at=datetime.now(timezone.utc) if is_priority else None,
        )
        db.add(target_sched)
        db.commit()
        db.refresh(target_sched)

    return {
        "success": True,
        "message": (
            f"{target_room.name} assigned and confirmed (Priority CS/COE)."
            if is_priority else
            f"{target_room.name} requested. Flagged for approval by CS/COE Program Chair."
        ),
        "schedule_id": target_sched.id,
        "room_approval_status": approval_status,
    }


@router.post("/{schedule_id}/approve")
def approve_lab_room(
    schedule_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """CS and COE Program Chairs (or Dean/Admin) approve a pending room assignment."""
    assert_cast_access(db, current_user)

    sched = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not sched or not sched.room_id:
        raise HTTPException(status_code=404, detail="Schedule or room booking not found")

    # Verify no overlapping confirmed booking
    overlap = db.query(models.Schedule).filter(
        models.Schedule.id != sched.id,
        models.Schedule.semester_id == sched.semester_id,
        models.Schedule.room_id == sched.room_id,
        models.Schedule.day_of_week == sched.day_of_week,
        models.Schedule.start_time < sched.end_time,
        models.Schedule.end_time > sched.start_time,
        (models.Schedule.room_approval_status == 'approved') | (models.Schedule.room_approval_status == None),
    ).first()

    if overlap:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot approve: another confirmed booking now occupies this room during this time slot."
        )

    sched.room_approval_status = "approved"
    sched.room_approved_by = current_user.id
    sched.room_approved_at = datetime.now(timezone.utc)
    sched.room_rejection_reason = None
    db.commit()
    db.refresh(sched)

    return {
        "success": True,
        "message": f"Room booking for {sched.room.name if sched.room else 'room'} approved.",
        "room_approval_status": "approved",
    }


@router.post("/{schedule_id}/reject")
def reject_lab_room(
    schedule_id: int,
    rejection: Optional[RejectionRequest] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """CS and COE Program Chairs (or Dean/Admin) decline a pending room request."""
    assert_cast_access(db, current_user)

    sched = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not sched:
        raise HTTPException(status_code=404, detail="Schedule not found")

    sched.room_approval_status = "rejected"
    sched.room_id = None
    sched.room_rejection_reason = rejection.reason if rejection else "Declined by CS/COE Chair"
    db.commit()
    db.refresh(sched)

    return {
        "success": True,
        "message": "Room request rejected and room released.",
        "room_approval_status": "rejected",
    }
