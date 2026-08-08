from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional
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

    expected = ROLE_SUBJECT_SCOPE.get(current_user.role)
    if expected is not None and bool(curriculum.is_major) is not expected:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{curriculum.code} is a {SCOPE_LABEL[bool(curriculum.is_major)][:-1]}. "
                f"Your role assigns {SCOPE_LABEL[expected]} only."
            )
        )


from pydantic import ConfigDict

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
        raise HTTPException(status_code=400, detail="Subject offering already exists")

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

    # Check for companion A/B component
    cur_code = curriculum.code.upper().strip()
    companion_code = None
    if cur_code.endswith('A'):
        companion_code = cur_code[:-1] + 'B'
    elif cur_code.endswith('B'):
        companion_code = cur_code[:-1] + 'A'

    if companion_code:
        # Scoped to the same curriculum block, not just the same college. The
        # halves of an A/B subject are written on one row of one curriculum
        # sheet, and matching campus-wide could pull the companion out of a
        # draft or superseded curriculum -- assigning, by side effect, a subject
        # the rule above would have refused outright.
        companion_curr = db.query(models.Curriculum).filter(
            models.Curriculum.code == companion_code,
            models.Curriculum.department_id == curriculum.department_id,
            models.Curriculum.block_id == curriculum.block_id
        ).first()

        if companion_curr:
            companion_existing = db.query(models.SubjectOffering).filter(
                models.SubjectOffering.faculty_id == offering.faculty_id,
                models.SubjectOffering.curriculum_id == companion_curr.id,
                models.SubjectOffering.semester_id == offering.semester_id
            ).first()
            if not companion_existing:
                companion_offering = models.SubjectOffering(
                    faculty_id=offering.faculty_id,
                    curriculum_id=companion_curr.id,
                    semester_id=offering.semester_id,
                    assigned_by=current_user.id
                )
                db.add(companion_offering)

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
    expected = ROLE_SUBJECT_SCOPE.get(current_user.role)
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
