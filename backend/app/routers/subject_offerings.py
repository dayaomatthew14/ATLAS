from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any
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
    raw_offerings = db.query(
        models.SubjectOffering,
        models.Faculty,
    ).join(
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
    ]
    is_assigned = len(assigned_list) > 0
    primary_off = assigned_list[0][0] if is_assigned else None
    enrolled_students = primary_off.enrolled_students if primary_off else None
    ct_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled_students)
    is_ct = ct_tier != faculty_load.CT_TIER_REGULAR

    prog_name = block.program_name if block else (curriculum_item.program_code or "")
    prog_code = (block.program.code if (block and block.program) else None) or prog_name
    reg_mins = faculty_load.subject_required_minutes(curriculum_item, ct_tier=faculty_load.CT_TIER_REGULAR)
    reg_hrs = faculty_load.round_hours(reg_mins / 60.0)
    req_mins = faculty_load.subject_required_minutes(curriculum_item, enrolled_students=enrolled_students)
    req_hrs = faculty_load.round_hours(req_mins / 60.0)
    return {
        "curriculum_id": curriculum_item.id,
        "offering_id": primary_off.id if primary_off else None,
        "code": curriculum_item.code,
        "name": curriculum_item.name,
        "units": curriculum_item.units,
        "lec_units": curriculum_item.lec_units,
        "lab_units": curriculum_item.lab_units,
        "type": curriculum_item.type,
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
    published_blocks = db.query(models.CurriculumBlock).filter(
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
        if current_user.role not in ('admin', 'dean'):
            setattr(faculty_mem, "overload_approved", False)
        db.commit()
        db.refresh(prior_offering)
        return prior_offering

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

    # Sync onto plotted schedules for this offering so cards/popovers/load stay aligned
    matching_schedules = db.query(models.Schedule).filter(
        models.Schedule.semester_id == offering.semester_id,
        models.Schedule.curriculum_id == offering.curriculum_id,
        models.Schedule.faculty_id == offering.faculty_id,
    ).all()
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
