from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

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

#: `is_major` value each role may assign. Absent = unrestricted (admin).
ROLE_SUBJECT_SCOPE = {
    'program_chair': True,
    'coordinator': False,
}

SCOPE_LABEL = {True: 'major subjects', False: 'General Education subjects'}


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

    expected = ROLE_SUBJECT_SCOPE.get(str(current_user.role))
    if expected is not None and bool(curriculum.is_major) is not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{curriculum.code} is a {SCOPE_LABEL[bool(curriculum.is_major)][:-1]}. "
                f"Your role assigns {SCOPE_LABEL[expected]} only."
            )
        )


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


def get_active_term_assigned_subjects(
    db: Session,
    current_user: models.User,
    semester_id: Optional[int] = None,
    department_id: Optional[int] = None
) -> dict:
    # 1. Resolve target semester (defaults to currently active term)
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

    # 2. Resolve target department
    dept = None
    if current_user.role in ['program_chair', 'coordinator']:
        if current_user.department:
            dept = db.query(models.Department).filter(
                (models.Department.code == current_user.department) |
                (models.Department.name == current_user.department)
            ).first()
    elif department_id:
        dept = db.query(models.Department).filter(models.Department.id == department_id).first()
    else:
        dept = db.query(models.Department).first()

    if not dept:
        return {
            "active_semester": {
                "id": semester.id,
                "academic_year": semester.academic_year,
                "term": semester.term
            },
            "department": None,
            "curriculum_courses": [],
            "summary": {"total": 0, "assigned": 0, "unassigned": 0, "all_assigned": True},
            "subjects": []
        }

    # 3. Retrieve all PUBLISHED curriculum blocks for this department
    published_blocks = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.department_id == dept.id,
        models.CurriculumBlock.status == 'PUBLISHED'
    ).all()

    block_map = {b.id: b for b in published_blocks}
    block_ids = list(block_map.keys())

    if not block_ids:
        return {
            "active_semester": {
                "id": semester.id,
                "academic_year": semester.academic_year,
                "term": semester.term
            },
            "department": {"id": dept.id, "name": dept.name, "code": dept.code},
            "curriculum_courses": [],
            "summary": {"total": 0, "assigned": 0, "unassigned": 0, "all_assigned": True},
            "subjects": []
        }

    # 4. Fetch all subjects belonging to published blocks
    all_block_subjects = db.query(models.Curriculum).filter(
        models.Curriculum.block_id.in_(block_ids)
    ).all()

    # 5. Filter subjects matching the active semester term and major subjects only (no GenEd)
    sem_term_norm = normalize_term(semester.term)
    term_subjects = [
        c for c in all_block_subjects
        if normalize_term(c.semester_term) == sem_term_norm and is_major_subject(c)
    ]

    # 6. Retrieve subject offerings for these curriculum items in the target semester
    term_curr_ids = [c.id for c in term_subjects]
    offerings_by_curr = {}
    if term_curr_ids:
        raw_offerings = db.query(
            models.SubjectOffering,
            models.Faculty
        ).join(
            models.Faculty, models.SubjectOffering.faculty_id == models.Faculty.id
        ).filter(
            models.SubjectOffering.semester_id == semester.id,
            models.SubjectOffering.curriculum_id.in_(term_curr_ids)
        ).all()

        for off, fac in raw_offerings:
            offerings_by_curr.setdefault(off.curriculum_id, []).append((off, fac))

    # 7. Build subject list
    subject_list = []
    for c in term_subjects:
        assigned_list = offerings_by_curr.get(c.id, [])
        block = block_map.get(c.block_id)
        is_assigned = len(assigned_list) > 0

        profs = [
            {
                "offering_id": off.id,
                "faculty_id": fac.id,
                "faculty_name": f"{fac.first_name} {fac.last_name}".strip(),
                "faculty_email": fac.email,
                "faculty_type": fac.type,
            }
            for off, fac in assigned_list
        ]
        prog_name = block.program_name if block else (c.program_code or "")
        prog_code = (block.program.code if (block and block.program) else None) or prog_name

        subject_list.append({
            "curriculum_id": c.id,
            "code": c.code,
            "name": c.name,
            "units": c.units,
            "lec_units": c.lec_units,
            "lab_units": c.lab_units,
            "type": c.type,
            "is_major": bool(c.is_major),
            "year_level": c.year_level or "",
            "semester_term": c.semester_term or "",
            "program_code": prog_code,
            "program_name": prog_name,
            "status": "assigned" if is_assigned else "unassigned",
            "assigned_professors": profs,
            "professor_name": profs[0]["faculty_name"] if profs else "Unassigned",
        })

    # Sort: unassigned first, then by code
    subject_list.sort(key=lambda s: (0 if s["status"] == "unassigned" else 1, s["code"]))

    total = len(subject_list)
    assigned_count = len([s for s in subject_list if s["status"] == "assigned"])
    unassigned_count = total - assigned_count

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
        "active_semester": {
            "id": semester.id,
            "academic_year": semester.academic_year,
            "term": semester.term
        },
        "department": {"id": dept.id, "name": dept.name, "code": dept.code},
        "curriculum_courses": curriculum_courses,
        "summary": {
            "total": total,
            "assigned": assigned_count,
            "unassigned": unassigned_count,
            "all_assigned": (unassigned_count == 0)
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
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
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
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
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

    if current_user.role in ['program_chair', 'coordinator']:
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
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    faculty_mem = db.query(models.Faculty).filter(models.Faculty.id == offering.faculty_id).first()
    if not faculty_mem:
        raise HTTPException(status_code=404, detail="Faculty member not found")

    curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == offering.curriculum_id).first()
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum subject not found")

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

    new_offering = models.SubjectOffering(
        faculty_id=offering.faculty_id,
        curriculum_id=offering.curriculum_id,
        semester_id=offering.semester_id,
        assigned_by=current_user.id
    )
    db.add(new_offering)
    db.commit()
    db.refresh(new_offering)
    return new_offering

@router.delete("/{id}")
def delete_subject_offering(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == id).first()
    if not offering:
        raise HTTPException(status_code=404, detail="Subject offering not found")

    # The same scope that governs assigning governs unassigning. Without this a
    # coordinator could drop a chair's major-subject load by id -- the screen
    # never offers it, but the endpoint would.
    expected = ROLE_SUBJECT_SCOPE.get(str(current_user.role))
    # SubjectOffering carries no `curriculum` relationship, so look it up.
    curriculum = db.query(models.Curriculum).filter(
        models.Curriculum.id == offering.curriculum_id
    ).first()
    if expected is not None and curriculum is not None and bool(curriculum.is_major) is not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{curriculum.code} is a {SCOPE_LABEL[bool(curriculum.is_major)][:-1]}. "
                f"Your role assigns {SCOPE_LABEL[expected]} only."
            )
        )

    db.delete(offering)
    db.commit()
    return {"message": "Subject offering deleted successfully"}
