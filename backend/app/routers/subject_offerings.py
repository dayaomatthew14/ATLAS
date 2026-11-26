from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import datetime, time, timezone
from .. import auth, models, schemas
from ..services import faculty_load
from ..database import get_db
from ..auth import get_current_user
from .logs import log_activity

router = APIRouter(
    prefix="/api/subject-offerings",
    tags=["Subject Offerings"]
)

"""
Who may assign which subject.

Two rules, both enforced here rather than only in the UI:

1. The subject's curriculum must be PUBLISHED. A draft curriculum is one the
   administrator is still revising -- codes, units and prerequisites can all
   still change -- so a teaching load built on it would be built on a moving
   target. A subject attached to no curriculum at all cannot be published and is
   refused for the same reason.

2. The scope follows the role. A program chair carries their programme's major
   subjects; a coordinator carries General Education. They are different jobs
   over the same faculty, and each should only be able to commit their own.
"""

#: `is_major` value each role may assign. Empty/absent = unrestricted (users can assign major & GenEd).
ROLE_SUBJECT_SCOPE = {}

SCOPE_LABEL = {True: 'major subjects', False: 'General Education subjects'}


def _assert_role_subject_scope(curriculum: models.Curriculum, current_user: models.User) -> None:
    """Enforce major vs. GenEd assignment scope for the caller's role."""
    expected = ROLE_SUBJECT_SCOPE.get(str(current_user.role))
    if expected is not None and bool(curriculum.is_major) is not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{curriculum.code} is a {SCOPE_LABEL[bool(curriculum.is_major)][:-1]}. "
                f"Your role assigns {SCOPE_LABEL[expected]} only."
            )
        )


def _assert_assignable(curriculum: models.Curriculum, current_user: models.User) -> None:
    block = curriculum.block
    status_value = (getattr(block, 'status', None) or '').upper() if block else ''

    if not block:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{curriculum.code} does not belong to any curriculum, so it cannot be assigned. "
                "Ask an administrator to file it under one."
            )
        )

    if status_value != 'PUBLISHED':
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"The {block.program_name} curriculum is not published yet, so its subjects "
                "cannot be assigned. Ask an administrator to publish it."
            )
        )

    _assert_role_subject_scope(curriculum, current_user)


from pydantic import ConfigDict


GEN_ED_PREFIXES = ('GE', 'CORE', 'PEED', 'NSTP', 'LSVI', 'RZAL', 'RIZAL', 'GEC')


def is_major_subject(curriculum: models.Curriculum) -> bool:
    """Return True if curriculum subject is a major subject (excludes General Education)."""
    if not bool(getattr(curriculum, 'is_major', True)):
        return False
    code = (getattr(curriculum, 'code', '') or '').strip().upper()
    if any(code.startswith(prefix) for prefix in GEN_ED_PREFIXES):
        return False
    return True


def normalize_term(term_str: Any = None) -> str:
    if not term_str:
        return ""
    s = str(term_str).strip().lower()
    if s.startswith("1"):
        return "1st"
    if s.startswith("2"):
        return "2nd"
    if s.startswith("3"):
        return "3rd"
    return s


def _resolve_offerings_department(
    db: Session, current_user: models.User, department_id: Optional[int]
) -> Optional[models.Department]:
    """Resolve target department for subject-offering queries."""
    if current_user.department or current_user.role in ('program_chair', 'coordinator', 'dean'):
        return auth.resolve_user_department(db, current_user)
    if department_id:
        return db.query(models.Department).filter(models.Department.id == department_id).first()
    return db.query(models.Department).first()


def _load_offerings_by_curriculum(
    db: Session, semester_id: Any, curriculum_ids: list
) -> dict:
    """Batch-load subject offerings joined with faculty keyed by curriculum_id."""
    if not curriculum_ids:
        return {}
    from sqlalchemy.orm import joinedload as _joinedload
    raw_offerings = db.query(
        models.SubjectOffering,
        models.Faculty,
    ).options(
        _joinedload(models.SubjectOffering.room)
    ).outerjoin(
        models.Faculty, models.SubjectOffering.faculty_id == models.Faculty.id
    ).filter(
        models.SubjectOffering.semester_id == semester_id,
        models.SubjectOffering.curriculum_id.in_(curriculum_ids),
    ).all()
    offerings_by_curr: dict = {}
    for off, fac in raw_offerings:
        offerings_by_curr.setdefault(off.curriculum_id, []).append((off, fac))
    return offerings_by_curr


def _format_subject_offering_entry(
    curriculum_item: models.Curriculum,
    is_major: bool,
    assigned_list: list,
    block: Optional[models.CurriculumBlock],
) -> dict:
    """Serialize one curriculum subject and its assigned faculty for the active term view."""
    profs = [
        {
            "offering_id": off.id,
            "faculty_id": fac.id,
            "faculty_name": f"{fac.first_name} {fac.last_name}".strip(),
            "faculty_email": fac.email,
            "faculty_type": faculty_load.normalise_employment_type(fac.type),
            "faculty_type_label": faculty_load.employment_type_label(fac.type),
            "enrolled_students": off.enrolled_students,
            "ct_tier": faculty_load.normalise_ct_tier(enrolled_students=off.enrolled_students),
        }
        for off, fac in assigned_list
        if fac is not None
    ]
    is_assigned = len(profs) > 0
    primary_off = assigned_list[0][0] if assigned_list else None
    enrolled_students = primary_off.enrolled_students if primary_off else None
    ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled_students)
    is_ct = ct_tier != faculty_load.CT_TIER_REGULAR

    prog_name = block.program_name if block else (curriculum_item.program_code or "")
    prog_code = (block.program.code if (block and block.program) else None) or prog_name
    reg_mins = faculty_load.subject_required_minutes(curriculum_item, ct_tier=faculty_load.CT_TIER_REGULAR)
    reg_hrs = faculty_load.round_hours(reg_mins / 60.0)
    req_mins = faculty_load.subject_required_minutes(curriculum_item, enrolled_students=enrolled_students)
    req_hrs = faculty_load.round_hours(req_mins / 60.0)

    # Room details
    room_id = primary_off.room_id if primary_off else None
    room_name = primary_off.room.name if (primary_off and primary_off.room) else None
    room_type = primary_off.room.type if (primary_off and primary_off.room) else None
    room_capacity = primary_off.room.capacity if (primary_off and primary_off.room) else None
    room_approval_status = primary_off.room_approval_status if (primary_off and primary_off.room_id) else None
    room_rejection_reason = primary_off.room_rejection_reason if (primary_off and primary_off.room_id) else None
    room_requested_by = primary_off.room_requested_by if primary_off else None
    room_approved_by = primary_off.room_approved_by if primary_off else None

    # Laboratory classification:
    is_lab = (
        (curriculum_item.type or "").lower() == "lab"
        or (curriculum_item.lab_units or 0) > 0
        or (curriculum_item.code or "").strip().upper().endswith("B")
    )

    return {
        "curriculum_id": curriculum_item.id,
        "offering_id": primary_off.id if primary_off else None,
        "code": curriculum_item.code,
        "name": curriculum_item.name,
        "units": curriculum_item.units,
        "lec_units": curriculum_item.lec_units,
        "lab_units": curriculum_item.lab_units,
        "type": curriculum_item.type,
        "is_lab": is_lab,
        "is_combined_c": faculty_load.is_combined_c_subject(curriculum_item),
        "enrolled_students": enrolled_students,
        "ct_tier": ct_tier,
        "is_ct": is_ct,
        "ct_label": faculty_load.ct_tier_label(ct_tier=ct_tier),
        "ct_short_label": faculty_load.ct_tier_short_label(ct_tier=ct_tier),
        "regular_minutes": reg_mins,
        "regular_hours": reg_hrs,
        "regular_hours_label": faculty_load.format_minutes_label(reg_mins),
        "required_minutes": req_mins,
        "required_hours": req_hrs,
        "required_hours_label": faculty_load.format_minutes_label(req_mins),
        "is_major": is_major,
        "year_level": curriculum_item.year_level or "",
        "semester_term": curriculum_item.semester_term or "",
        "program_code": prog_code,
        "program_name": prog_name,
        "status": "assigned" if is_assigned else "unassigned",
        "assigned_professors": profs,
        "professor_name": profs[0]["faculty_name"] if profs else "Unassigned",
        "room_id": room_id,
        "room_name": room_name,
        "room_type": room_type,
        "room_capacity": room_capacity,
        "room_approval_status": room_approval_status,
        "room_rejection_reason": room_rejection_reason,
        "room_requested_by": room_requested_by,
        "room_approved_by": room_approved_by,
    }


def get_active_term_assigned_subjects(
    db: Session,
    current_user: models.User,
    semester_id: Optional[int] = None,
    department_id: Optional[int] = None
) -> dict:
    if semester_id:
        semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    else:
        semester = db.query(models.Semester).filter(models.Semester.is_active == True).first()

    if not semester:
        return {
            "active_semester": None,
            "department": None,
            "summary": {"total": 0, "assigned": 0, "unassigned": 0, "all_assigned": True},
            "subjects": []
        }

    semester_meta = {"id": semester.id, "academic_year": semester.academic_year, "term": semester.term}
    dept = _resolve_offerings_department(db, current_user, department_id)

    if not dept:
        return {
            "active_semester": semester_meta,
            "department": None,
            "curriculum_courses": [],
            "summary": {"total": 0, "assigned": 0, "unassigned": 0, "all_assigned": True},
            "subjects": []
        }

    dept_meta = {"id": dept.id, "name": dept.name, "code": dept.code}
    from sqlalchemy.orm import joinedload as _joinedload
    published_blocks = db.query(models.CurriculumBlock).options(
        _joinedload(models.CurriculumBlock.program)
    ).filter(
        models.CurriculumBlock.department_id == dept.id,
        models.CurriculumBlock.status == 'PUBLISHED'
    ).all()
    block_map = {b.id: b for b in published_blocks}
    block_ids = list(block_map.keys())

    if not block_ids:
        return {
            "active_semester": semester_meta,
            "department": dept_meta,
            "curriculum_courses": [],
            "summary": {"total": 0, "assigned": 0, "unassigned": 0, "all_assigned": True},
            "subjects": []
        }

    all_block_subjects = db.query(models.Curriculum).filter(
        models.Curriculum.block_id.in_(block_ids)
    ).all()
    sem_term_norm = normalize_term(semester.term)
    offerings_by_curr = _load_offerings_by_curriculum(db, semester.id, [c.id for c in all_block_subjects])

    subject_list = []
    for c in all_block_subjects:
        is_major = is_major_subject(c)
        assigned_list = offerings_by_curr.get(c.id, [])
        if is_major:
            if normalize_term(c.semester_term) != sem_term_norm:
                continue
        elif not assigned_list:
            continue
        subject_list.append(_format_subject_offering_entry(c, is_major, assigned_list, block_map.get(c.block_id)))

    subject_list.sort(key=lambda s: (0 if s["status"] == "unassigned" else 1, s["code"]))

    total = len(subject_list)
    assigned_count = sum(1 for s in subject_list if s["status"] == "assigned")
    unassigned_count = total - assigned_count
    ct_count = sum(1 for s in subject_list if s.get("is_ct"))
    lab_count = sum(1 for s in subject_list if s.get("is_lab"))
    lab_assigned_room_count = sum(1 for s in subject_list if s.get("is_lab") and s.get("room_id"))
    pending_room_approval_count = sum(1 for s in subject_list if s.get("room_approval_status") == "pending_approval")
    all_major_assigned = not any(s["is_major"] and s["status"] == "unassigned" for s in subject_list)

    curriculum_courses = [
        {
            "id": b.id,
            "name": b.program_name,
            "code": (b.program.code if b.program else b.program_name),
            "academic_year": b.academic_year
        }
        for b in published_blocks
    ]

    return {
        "active_semester": semester_meta,
        "department": dept_meta,
        "curriculum_courses": curriculum_courses,
        "summary": {
            "total": total,
            "assigned": assigned_count,
            "unassigned": unassigned_count,
            "ct_count": ct_count,
            "lab_count": lab_count,
            "lab_assigned_room_count": lab_assigned_room_count,
            "pending_room_approval_count": pending_room_approval_count,
            "all_assigned": all_major_assigned
        },
        "subjects": subject_list
    }


@router.get("/assigned-subjects")
def get_assigned_subjects(
    semester_id: Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")
    return get_active_term_assigned_subjects(db, current_user, semester_id, department_id)


class SubjectOfferingExtendedResponse(schemas.SubjectOfferingResponse):
    faculty_name: str
    subject_code: str
    subject_name: str

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[SubjectOfferingExtendedResponse])
def get_subject_offerings(
    semester_id: int = Query(...),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(
        models.SubjectOffering,
        models.Faculty.first_name,
        models.Faculty.last_name,
        models.Curriculum.code.label('subject_code'),
        models.Curriculum.name.label('subject_name')
    ).join(
        models.Faculty, models.SubjectOffering.faculty_id == models.Faculty.id
    ).join(
        models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id
    ).join(
        models.Department, models.Curriculum.department_id == models.Department.id
    ).filter(
        models.SubjectOffering.semester_id == semester_id
    )

    if current_user.department or current_user.role in ['program_chair', 'coordinator', 'dean']:
        query = query.filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        )
    elif department_id:
        query = query.filter(models.Curriculum.department_id == department_id)

    results = query.all()

    response = []
    for offering, fname, lname, scode, sname in results:
        response.append({
            "id": offering.id,
            "faculty_id": offering.faculty_id,
            "curriculum_id": offering.curriculum_id,
            "semester_id": offering.semester_id,
            "assigned_by": offering.assigned_by,
            "enrolled_students": offering.enrolled_students,
            "credited_hours_override": offering.credited_hours_override,
            "created_at": offering.created_at,
            "faculty_name": f"{fname} {lname}",
            "subject_code": scode,
            "subject_name": sname
        })
    return response

def _transfer_or_clear_unassigned_schedules(
    db: Session,
    semester_id: int,
    curriculum_id: int,
    target_faculty_id: int,
    enrolled_val: Optional[int] = None,
    eff_hrs: Optional[float] = None,
) -> bool:
    """
    When an unassigned subject is assigned to a professor:
    - If every draft UNASSIGNED PROFESSOR (faculty_id IS NULL) session fits
      without overlapping the professor's existing classes, unavailability, or
      booked room, transfer those exact day/time slots directly to the professor.
    - Otherwise, delete the unassigned placeholders so no conflict is introduced.
    Returns True if transferred, False if cleared (or none existed).
    """
    placeholders = db.query(models.Schedule).filter(
        models.Schedule.semester_id == semester_id,
        models.Schedule.curriculum_id == curriculum_id,
        models.Schedule.faculty_id.is_(None),
        (models.Schedule.status == 'draft') | (models.Schedule.status.is_(None)),
        (models.Schedule.is_locked == False) | (models.Schedule.is_locked.is_(None)),  # noqa: E712
    ).all()
    if not placeholders:
        return False

    already_plotted_for_prof = db.query(models.Schedule.id).filter(
        models.Schedule.semester_id == semester_id,
        models.Schedule.curriculum_id == curriculum_id,
        models.Schedule.faculty_id == target_faculty_id,
    ).first() is not None

    can_transfer = not already_plotted_for_prof
    if can_transfer:
        for s in placeholders:
            if not (s.day_of_week and s.start_time and s.end_time):
                can_transfer = False
                break
            prof_overlap = db.query(models.Schedule.id).filter(
                models.Schedule.semester_id == semester_id,
                models.Schedule.faculty_id == target_faculty_id,
                models.Schedule.day_of_week == s.day_of_week,
                models.Schedule.start_time < s.end_time,
                models.Schedule.end_time > s.start_time,
            ).first()
            if prof_overlap:
                can_transfer = False
                break
            unavail_hit = db.query(models.FacultyUnavailability.id).filter(
                models.FacultyUnavailability.faculty_id == target_faculty_id,
                models.FacultyUnavailability.day_of_week == s.day_of_week,
                models.FacultyUnavailability.start_time < s.end_time,
                models.FacultyUnavailability.end_time > s.start_time,
            ).first()
            if unavail_hit:
                can_transfer = False
                break
            if s.room_id:
                room_overlap = db.query(models.Schedule.id).filter(
                    models.Schedule.id != s.id,
                    models.Schedule.semester_id == semester_id,
                    models.Schedule.faculty_id.isnot(None),
                    models.Schedule.room_id == s.room_id,
                    models.Schedule.day_of_week == s.day_of_week,
                    models.Schedule.room_approval_status != 'rejected',
                    models.Schedule.start_time < s.end_time,
                    models.Schedule.end_time > s.start_time,
                ).first()
                if room_overlap:
                    can_transfer = False
                    break

    if can_transfer:
        for s in placeholders:
            setattr(s, "faculty_id", target_faculty_id)
            if enrolled_val is not None:
                setattr(s, "enrolled_students", enrolled_val)
            if eff_hrs is not None:
                setattr(s, "credited_hours_override", eff_hrs)
        return True

    for s in placeholders:
        db.delete(s)
    return False


@router.post("", response_model=schemas.SubjectOfferingResponse)
def create_subject_offering(
    offering: schemas.SubjectOfferingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    sem_row = db.query(models.Semester).filter(models.Semester.id == offering.semester_id).first()
    if not sem_row:
        raise HTTPException(status_code=404, detail="Semester not found")

    faculty_mem = db.query(models.Faculty).filter(models.Faculty.id == offering.faculty_id).first()
    if not faculty_mem:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == offering.curriculum_id).first()
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum subject not found")

    # Enforce college ownership for scoped callers (fail closed)
    if current_user.department or current_user.role in ('program_chair', 'coordinator', 'dean'):
        caller_dept = auth.resolve_user_department(db, current_user)
        if not caller_dept or curriculum.department_id != caller_dept.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot assign subjects outside your college."
            )

    from .schedules import _assert_term_not_published
    _assert_term_not_published(db, offering.semester_id, curriculum.department_id)

    # Before the duplicate check, not after: a coordinator reaching for a major
    # subject should be told it is out of their scope whether or not somebody
    # else already assigned it. "Already exists" would answer a different
    # question and confirm state they have no business reading.
    _assert_assignable(curriculum, current_user)

    existing = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.faculty_id == offering.faculty_id,
        models.SubjectOffering.curriculum_id == offering.curriculum_id,
        models.SubjectOffering.semester_id == offering.semester_id
    ).first()

    if existing:
        return existing

    if faculty_mem.department_id != curriculum.department_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Faculty member department does not match curriculum subject department"
        )

    # If the subject is already assigned to another professor in this semester, override it
    prior_offering = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.curriculum_id == offering.curriculum_id,
        models.SubjectOffering.semester_id == offering.semester_id
    ).first()

    enrolled_val = offering.enrolled_students
    if enrolled_val is None and offering.ct_tier is not None:
        enrolled_val = faculty_load.students_for_ct_tier(offering.ct_tier)
    eff_tier = faculty_load.normalise_ct_tier(ct_tier=offering.ct_tier, enrolled_students=enrolled_val)
    eff_hrs = (
        faculty_load.subject_required_hours(curriculum, ct_tier=eff_tier)
        if eff_tier != faculty_load.CT_TIER_REGULAR
        else None
    )

    if prior_offering:
        old_faculty_id = prior_offering.faculty_id
        setattr(prior_offering, "faculty_id", offering.faculty_id)
        setattr(prior_offering, "assigned_by", current_user.id)
        if offering.enrolled_students is not None or offering.ct_tier is not None:
            setattr(prior_offering, "enrolled_students", enrolled_val)
            setattr(prior_offering, "credited_hours_override", eff_hrs)
        # Clean up orphaned draft/unlocked schedules belonging to the previous professor
        if old_faculty_id and old_faculty_id != offering.faculty_id:
            db.query(models.Schedule).filter(
                models.Schedule.semester_id == offering.semester_id,
                models.Schedule.curriculum_id == offering.curriculum_id,
                models.Schedule.faculty_id == old_faculty_id,
                (models.Schedule.status == 'draft') | (models.Schedule.status.is_(None)),
                (models.Schedule.is_locked == False) | (models.Schedule.is_locked.is_(None)),  # noqa: E712
            ).delete(synchronize_session=False)
        # Transfer UNASSIGNED PROFESSOR slots directly if professor is free, else clear them
        _transfer_or_clear_unassigned_schedules(
            db,
            offering.semester_id,
            offering.curriculum_id,
            offering.faculty_id,
            enrolled_val=prior_offering.enrolled_students,
            eff_hrs=prior_offering.credited_hours_override,
        )
        if current_user.role not in ('admin', 'dean'):
            setattr(faculty_mem, "overload_approved", False)
        db.commit()
        db.refresh(prior_offering)
        return prior_offering

    # Transfer UNASSIGNED PROFESSOR slots directly if professor is free, else clear them
    _transfer_or_clear_unassigned_schedules(
        db,
        offering.semester_id,
        offering.curriculum_id,
        offering.faculty_id,
        enrolled_val=enrolled_val,
        eff_hrs=eff_hrs,
    )

    new_offering = models.SubjectOffering(
        faculty_id=offering.faculty_id,
        curriculum_id=offering.curriculum_id,
        semester_id=offering.semester_id,
        assigned_by=current_user.id,
        enrolled_students=enrolled_val,
        credited_hours_override=eff_hrs,
    )
    if current_user.role not in ('admin', 'dean'):
        setattr(faculty_mem, "overload_approved", False)
    db.add(new_offering)
    db.commit()
    db.refresh(new_offering)
    return new_offering


@router.patch("/{offering_id}/ct")
def update_subject_offering_ct(
    offering_id: int,
    payload: schemas.SubjectOfferingCTUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Update a SubjectOffering's Converted Tutorial (CT) tier / enrolled student count.
    Synchronizes the CT enrollment metadata onto matching active-term schedules so
    timetable displays and faculty load calculations immediately reflect the CT hours.
    """
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == offering_id).first()
    if not offering:
        raise HTTPException(status_code=404, detail="Subject offering not found")

    curriculum = db.query(models.Curriculum).filter(
        models.Curriculum.id == offering.curriculum_id
    ).first()
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum subject not found")

    _assert_role_subject_scope(curriculum, current_user)

    if current_user.department or current_user.role in ('program_chair', 'coordinator', 'dean'):
        dept = auth.resolve_user_department(db, current_user)
        if not dept or (curriculum.department_id and curriculum.department_id != dept.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot update Converted Tutorial status for a subject outside your department."
            )

    from .schedules import _assert_term_not_published
    _assert_term_not_published(db, offering.semester_id, curriculum.department_id)

    if payload.enrolled_students is not None:
        enrolled_val = int(payload.enrolled_students)
        ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled_val)
        if ct_tier == faculty_load.CT_TIER_REGULAR:
            enrolled_val = None
    else:
        ct_tier = faculty_load.normalise_ct_tier(ct_tier=payload.ct_tier)
        enrolled_val = faculty_load.students_for_ct_tier(ct_tier)

    is_ct = ct_tier != faculty_load.CT_TIER_REGULAR
    req_mins = faculty_load.subject_required_minutes(curriculum, ct_tier=ct_tier)
    req_hrs = faculty_load.round_hours(req_mins / 60.0)
    reg_mins = faculty_load.subject_required_minutes(curriculum, ct_tier=faculty_load.CT_TIER_REGULAR)
    reg_hrs = faculty_load.round_hours(reg_mins / 60.0)

    setattr(offering, "enrolled_students", enrolled_val)
    setattr(offering, "credited_hours_override", req_hrs if is_ct else None)

    # Sync onto plotted schedules for this offering and auto-adjust duration to match req_mins
    matching_schedules = db.query(models.Schedule).filter(
        models.Schedule.semester_id == offering.semester_id,
        models.Schedule.curriculum_id == offering.curriculum_id,
        models.Schedule.faculty_id == offering.faculty_id,
    ).order_by(models.Schedule.id).all()

    valid_scheds = [s for s in matching_schedules if s.start_time and s.end_time]
    auto_adjusted = False
    if valid_scheds and req_mins > 0:
        dept_obj = db.query(models.Department).filter(
            models.Department.id == curriculum.department_id
        ).first() if curriculum.department_id else None
        is_cvmas = bool(dept_obj and getattr(dept_obj, "code", "").upper() == "CVMAS")
        max_end_min = (19 * 60 + 30) if is_cvmas else (17 * 60 + 30)

        n_scheds = len(valid_scheds)
        base_mins = req_mins // n_scheds
        rem_mins = req_mins % n_scheds

        can_adjust_all = True
        adjusted_times = []
        for idx, sched in enumerate(valid_scheds):
            alloc = base_mins + (rem_mins if idx == 0 else 0)
            start_m = sched.start_time.hour * 60 + sched.start_time.minute
            old_end_m = sched.end_time.hour * 60 + sched.end_time.minute
            new_end_m = start_m + alloc

            # Never auto-expand past the college's allowed daily cutoff (17:30 non-CVMAS / 19:30 CVMAS)
            if new_end_m > old_end_m and new_end_m > max_end_min:
                can_adjust_all = False
                break

            # Guard against 24:00 overflow
            if new_end_m >= 24 * 60:
                can_adjust_all = False
                break

            # If expanding beyond previous end_time, check for conflicts
            if new_end_m > old_end_m:
                new_end_time = time(new_end_m // 60, new_end_m % 60)
                overlap_fac = db.query(models.Schedule).filter(
                    models.Schedule.id != sched.id,
                    models.Schedule.semester_id == sched.semester_id,
                    models.Schedule.faculty_id == sched.faculty_id,
                    models.Schedule.day_of_week == sched.day_of_week,
                    models.Schedule.start_time < new_end_time,
                    models.Schedule.end_time > sched.start_time,
                ).first()
                overlap_room = None
                if sched.room_id:
                    overlap_room = db.query(models.Schedule).filter(
                        models.Schedule.id != sched.id,
                        models.Schedule.semester_id == sched.semester_id,
                        models.Schedule.faculty_id.isnot(None),
                        models.Schedule.room_id == sched.room_id,
                        models.Schedule.day_of_week == sched.day_of_week,
                        models.Schedule.room_approval_status != 'rejected',
                        models.Schedule.start_time < new_end_time,
                        models.Schedule.end_time > sched.start_time,
                    ).first()
                if overlap_fac or overlap_room:
                    can_adjust_all = False
                    break

            new_end_time = time(new_end_m // 60, new_end_m % 60)
            adjusted_times.append((sched, new_end_time))

        if can_adjust_all:
            for sched, new_end_time in adjusted_times:
                sched.end_time = new_end_time
            auto_adjusted = True

    plotted_clock_mins = 0
    for sched in matching_schedules:
        setattr(sched, "enrolled_students", enrolled_val)
        setattr(sched, "credited_hours_override", req_hrs if is_ct else None)
        if sched.start_time and sched.end_time:
            plotted_clock_mins += faculty_load.meeting_teaching_minutes(
                sched.start_time, sched.end_time, sched.day_of_week
            )

    needs_reschedule = bool(matching_schedules and abs(plotted_clock_mins - req_mins) >= 5)

    label = faculty_load.ct_tier_label(ct_tier=ct_tier)
    hours_label = faculty_load.format_minutes_label(req_mins)
    log_activity(
        db,
        current_user.id,  # type: ignore
        "Update Converted Tutorial",
        f"Set {curriculum.code} to {label} ({hours_label}/week)",
        "success",
        department_id=getattr(curriculum, "department_id", None),
    )
    db.commit()
    db.refresh(offering)

    return {
        "offering_id": offering.id,
        "curriculum_id": offering.curriculum_id,
        "faculty_id": offering.faculty_id,
        "semester_id": offering.semester_id,
        "enrolled_students": offering.enrolled_students,
        "ct_tier": ct_tier,
        "is_ct": is_ct,
        "ct_label": label,
        "ct_short_label": faculty_load.ct_tier_short_label(ct_tier=ct_tier),
        "regular_minutes": reg_mins,
        "regular_hours": reg_hrs,
        "regular_hours_label": faculty_load.format_minutes_label(reg_mins),
        "required_minutes": req_mins,
        "required_hours": req_hrs,
        "required_hours_label": hours_label,
        "plotted_schedules_count": len(matching_schedules),
        "needs_reschedule": needs_reschedule,
        "auto_adjusted": auto_adjusted,
    }

@router.delete("/{id}")
def delete_subject_offering(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == id).first()
    if not offering:
        raise HTTPException(status_code=404, detail="Subject offering not found")

    # The same scope that governs assigning governs unassigning.
    curriculum = db.query(models.Curriculum).filter(
        models.Curriculum.id == offering.curriculum_id
    ).first()
    if curriculum is not None:
        _assert_role_subject_scope(curriculum, current_user)
        if current_user.department or current_user.role in ('program_chair', 'coordinator', 'dean'):
            dept = auth.resolve_user_department(db, current_user)
            if not dept or curriculum.department_id != dept.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot remove a subject assignment outside your college."
                )
        from .schedules import _assert_term_not_published
        _assert_term_not_published(db, offering.semester_id, curriculum.department_id)

    # Clean up unlocked draft schedules for this unassigned offering so no orphaned plots remain
    db.query(models.Schedule).filter(
        models.Schedule.semester_id == offering.semester_id,
        models.Schedule.curriculum_id == offering.curriculum_id,
        models.Schedule.faculty_id == offering.faculty_id,
        (models.Schedule.status == 'draft') | (models.Schedule.status == None),
        (models.Schedule.is_locked == False) | (models.Schedule.is_locked == None),
    ).delete(synchronize_session=False)

    db.delete(offering)
    db.commit()
    return {"message": "Subject offering deleted successfully"}


@router.get("/available-lab-rooms")
def get_available_lab_rooms(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from .lab_rooms import ensure_cast_computer_labs
    rooms = ensure_cast_computer_labs(db)
    return [
        {
            "id": r.id,
            "name": r.name,
            "building": r.building or "Main Building",
            "capacity": r.capacity or 45,
            "type": r.type or "computer_lab",
        }
        for r in rooms
    ]


@router.post("/assign-room")
def assign_lab_room(
    payload: schemas.SubjectOfferingRoomAssign,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Assign or update a Computer Laboratory room for a laboratory subject."""
    if current_user.role not in ['program_chair', 'coordinator', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == payload.curriculum_id).first()
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum subject not found")

    is_lab = (
        (curriculum.type or "").lower() == "lab"
        or (curriculum.lab_units or 0) > 0
        or (curriculum.code or "").strip().upper().endswith("B")
    )
    if not is_lab:
        raise HTTPException(status_code=400, detail="Only laboratory subjects can be assigned to Computer Laboratory rooms.")

    # Check CAST scope
    caller_dept = auth.resolve_user_department(db, current_user)
    if current_user.role != 'admin' and (not caller_dept or caller_dept.code != 'CAST'):
        raise HTTPException(status_code=403, detail="Laboratory room assignments are restricted to CAST Program Chairs.")

    from .lab_rooms import ensure_cast_computer_labs, is_user_or_curr_priority
    lab_rooms = ensure_cast_computer_labs(db)
    valid_room_ids = {r.id: r for r in lab_rooms}

    selected_room = None
    if payload.room_id is not None:
        if payload.room_id not in valid_room_ids:
            raise HTTPException(status_code=400, detail="Selected room is not a recognized CAST Computer Laboratory room.")
        selected_room = valid_room_ids[payload.room_id]

    offering = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.curriculum_id == payload.curriculum_id,
        models.SubjectOffering.semester_id == payload.semester_id,
    ).first()

    has_priority = is_user_or_curr_priority(curriculum, user=current_user, db=db)
    now = datetime.now(timezone.utc)

    if payload.room_id is None:
        if offering:
            setattr(offering, "room_id", None)
            setattr(offering, "room_approval_status", None)
            setattr(offering, "room_rejection_reason", None)
            setattr(offering, "room_requested_by", None)
            setattr(offering, "room_approved_by", None)
            setattr(offering, "room_approved_at", None)
            matching_schedules = db.query(models.Schedule).filter(
                models.Schedule.semester_id == payload.semester_id,
                models.Schedule.curriculum_id == payload.curriculum_id,
            ).all()
            for s in matching_schedules:
                setattr(s, "room_id", None)
                setattr(s, "room_approval_status", None)
            db.commit()
            db.refresh(offering)
        return {"message": "Room assignment removed successfully", "room_id": None}

    approval_status = "approved" if has_priority else "pending_approval"
    approved_by = current_user.id if has_priority else None
    approved_at = now if has_priority else None
    requested_by = current_user.id if not has_priority else None

    # Check for schedule overlap if matching schedules already have plotted times
    matching_schedules = db.query(models.Schedule).filter(
        models.Schedule.semester_id == payload.semester_id,
        models.Schedule.curriculum_id == payload.curriculum_id,
    ).all()

    if matching_schedules:
        for sched in matching_schedules:
            if sched.day_of_week and sched.start_time and sched.end_time:
                overlap = db.query(models.Schedule).filter(
                    models.Schedule.semester_id == payload.semester_id,
                    models.Schedule.room_id == payload.room_id,
                    models.Schedule.day_of_week == sched.day_of_week,
                    models.Schedule.id != sched.id,
                    models.Schedule.room_approval_status != 'rejected',
                    models.Schedule.start_time < sched.end_time,
                    models.Schedule.end_time > sched.start_time,
                ).first()
                if overlap:
                    raise HTTPException(
                        status_code=409,
                        detail=f"Room {selected_room.name} has a scheduling conflict on {sched.day_of_week} ({sched.start_time.strftime('%H:%M')}–{sched.end_time.strftime('%H:%M')}).",
                    )

    if offering:
        setattr(offering, "room_id", payload.room_id)
        setattr(offering, "room_approval_status", approval_status)
        setattr(offering, "room_requested_by", requested_by)
        setattr(offering, "room_approved_by", approved_by)
        setattr(offering, "room_approved_at", approved_at)
        setattr(offering, "room_rejection_reason", None)
    else:
        offering = models.SubjectOffering(
            faculty_id=None,
            curriculum_id=payload.curriculum_id,
            semester_id=payload.semester_id,
            assigned_by=current_user.id,
            room_id=payload.room_id,
            room_approval_status=approval_status,
            room_requested_by=requested_by,
            room_approved_by=approved_by,
            room_approved_at=approved_at,
        )
        db.add(offering)

    for s in matching_schedules:
        setattr(s, "room_id", payload.room_id)
        setattr(s, "room_approval_status", approval_status)
        setattr(s, "room_requested_by", requested_by)
        setattr(s, "room_approved_by", approved_by)
        setattr(s, "room_approved_at", approved_at)

    status_label = "Confirmed (Priority CS/COE)" if has_priority else "Pending Approval by CS/COE Chair"
    log_activity(
        db,
        current_user.id,
        "Assign Laboratory Room",
        f"Assigned {selected_room.name} to {curriculum.code} ({status_label})",
        "success",
        department_id=getattr(curriculum, "department_id", None),
    )
    db.commit()
    db.refresh(offering)

    return {
        "message": f"{selected_room.name} assigned to {curriculum.code} successfully.",
        "offering_id": offering.id,
        "curriculum_id": curriculum.id,
        "room_id": selected_room.id,
        "room_name": selected_room.name,
        "room_approval_status": approval_status,
        "has_priority": has_priority,
    }


@router.post("/{offering_id}/approve-room")
def approve_lab_room(
    offering_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Approve a pending laboratory room assignment (CS/COE Program Chairs or Admin)."""
    if current_user.role not in ['program_chair', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == offering_id).first()
    if not offering or not offering.room_id:
        raise HTTPException(status_code=404, detail="Subject offering or room assignment not found")

    now = datetime.now(timezone.utc)
    setattr(offering, "room_approval_status", "approved")
    setattr(offering, "room_approved_by", current_user.id)
    setattr(offering, "room_approved_at", now)
    setattr(offering, "room_rejection_reason", None)

    matching_schedules = db.query(models.Schedule).filter(
        models.Schedule.semester_id == offering.semester_id,
        models.Schedule.curriculum_id == offering.curriculum_id,
    ).all()
    for s in matching_schedules:
        setattr(s, "room_approval_status", "approved")
        setattr(s, "room_approved_by", current_user.id)
        setattr(s, "room_approved_at", now)
        setattr(s, "room_rejection_reason", None)

    curr_code = offering.curriculum.code if offering.curriculum else f"offering #{offering.id}"
    room_name = offering.room.name if offering.room else "lab room"
    log_activity(
        db,
        current_user.id,
        "Approve Laboratory Room",
        f"Approved assignment of {room_name} for {curr_code}",
        "success",
        department_id=getattr(offering.curriculum, "department_id", None) if offering.curriculum else None,
    )
    db.commit()
    db.refresh(offering)
    return {"message": f"Room assignment for {curr_code} approved successfully.", "room_approval_status": "approved"}


@router.post("/{offering_id}/reject-room")
def reject_lab_room(
    offering_id: int,
    payload: schemas.SubjectOfferingRoomRejection,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Reject a pending laboratory room assignment."""
    if current_user.role not in ['program_chair', 'admin', 'dean']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == offering_id).first()
    if not offering or not offering.room_id:
        raise HTTPException(status_code=404, detail="Subject offering or room assignment not found")

    reason = payload.reason or "Room request declined by CS/COE Program Chair."
    setattr(offering, "room_approval_status", "rejected")
    setattr(offering, "room_rejection_reason", reason)

    matching_schedules = db.query(models.Schedule).filter(
        models.Schedule.semester_id == offering.semester_id,
        models.Schedule.curriculum_id == offering.curriculum_id,
    ).all()
    for s in matching_schedules:
        setattr(s, "room_approval_status", "rejected")
        setattr(s, "room_rejection_reason", reason)

    curr_code = offering.curriculum.code if offering.curriculum else f"offering #{offering.id}"
    log_activity(
        db,
        current_user.id,
        "Reject Laboratory Room",
        f"Declined lab room assignment for {curr_code}: {reason}",
        "warning",
        department_id=getattr(offering.curriculum, "department_id", None) if offering.curriculum else None,
    )
    db.commit()
    db.refresh(offering)
    return {"message": f"Room assignment for {curr_code} rejected.", "room_approval_status": "rejected", "reason": reason}
