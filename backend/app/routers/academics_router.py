"""
Colleges and programmes.

Reading is open to every signed-in role -- a chair needs the list to know what
their own workspace is called, and registration needs it before anyone has a
session at all. Writing is administrator-only: this is institutional reference
data, and letting a chair invent a college is exactly how the `DEPT_{id}`
sprawl happened.
"""

import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, field_validator

from .. import models, database, auth, schemas
from ..academics import COLLEGE_CODES
from ..routers.logs import log_activity

router = APIRouter(prefix="/api/colleges", tags=["Academics"])


def _validate_program_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        raise ValueError("Program Code is required (e.g., BSCS).")
    if re.search(r"\s", trimmed):
        raise ValueError("Program Code cannot contain spaces (e.g., use BSCS instead of BS CS).")
    syms = re.findall(r"[^A-Za-z0-9]", trimmed)
    if syms:
        sample = "".join(dict.fromkeys(syms))[:5]
        raise ValueError(
            f"Program Code cannot contain symbols like '{sample}'. Use letters and numbers only (e.g., BSCS)."
        )
    if not re.search(r"[A-Za-z]", trimmed):
        raise ValueError("Program Code must contain at least one letter (e.g., BSCS).")
    if len(trimmed) < 2:
        raise ValueError("Program Code must be at least 2 characters (e.g., BSCS).")
    if len(trimmed) > 20:
        raise ValueError("Program Code must be at most 20 characters.")
    return trimmed.upper()


class ProgramOut(BaseModel):
    id: int
    code: str
    name: str
    department_id: int
    block_count: int = 0
    subject_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class CollegeOut(BaseModel):
    id: int
    code: str
    name: str
    programs: List[ProgramOut] = []


class ProgramCreate(BaseModel):
    code: str
    name: str
    department_id: int

    @field_validator("code")
    @classmethod
    def check_code(cls, v):
        return _validate_program_code(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return schemas.validate_entity_title(
            v, label="Program Name", min_len=3, max_len=255, example="BS Computer Science"
        )


class ProgramUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    department_id: Optional[int] = None

    @field_validator("code")
    @classmethod
    def check_code(cls, v):
        return _validate_program_code(v)

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return schemas.validate_entity_title(
            v, label="Program Name", min_len=3, max_len=255, example="BS Computer Science"
        )


def _seeded_colleges(db: Session):
    """
    Only the four institutional colleges.

    Legacy rows left over from the per-user workspace era (a "Test Dept" still
    holding a real curriculum block, for instance) stay in the table so their
    curriculum keeps its `department_id`, but they are not colleges and must
    never be offered as one. Their blocks surface under Unassigned instead.
    """
    return (
        db.query(models.Department)
        .filter(models.Department.code.in_(COLLEGE_CODES))
        .order_by(models.Department.code)
        .all()
    )


def _require_admin_or_dean(db: Session, current_user: models.User, department_id: Optional[int] = None) -> None:
    auth.require_roles(
        current_user,
        ("admin", "dean"),
        detail="Only administrators can manage the academic structure.",
    )
    if current_user.department and department_id is not None:
        dept = auth.resolve_user_department(db, current_user)
        if not dept or dept.id != department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Deans can only manage programmes for their own college."
            )


def _require_admin(current_user: models.User) -> None:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can perform this action."
        )


def _program_out(db: Session, program: models.Program) -> ProgramOut:
    blocks = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.program_id == program.id
    ).all()
    subject_count = 0
    if blocks:
        subject_count = db.query(models.Curriculum).filter(
            models.Curriculum.block_id.in_([b.id for b in blocks])
        ).count()
    return ProgramOut(
        id=int(program.id),  # type: ignore
        code=str(program.code),  # type: ignore
        name=str(program.name),  # type: ignore
        department_id=int(program.department_id),  # type: ignore
        block_count=len(blocks),
        subject_count=subject_count,
    )


@router.get("/public")
def list_colleges_public(db: Session = Depends(database.get_db)):
    """
    Code and name only, no session required.

    The registration form has to offer the colleges before anyone can sign in,
    and refusing a registration with "choose one of: ..." is useless if the form
    cannot show the list. Deliberately excludes programmes and every count.
    """
    colleges = _seeded_colleges(db)
    return [{"code": c.code, "name": c.name} for c in colleges]


@router.get("", response_model=List[CollegeOut])
def list_colleges(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = (
        db.query(models.Department)
        .options(selectinload(models.Department.programs))
        .filter(models.Department.code.in_(COLLEGE_CODES))
        .order_by(models.Department.code)
    )
    if current_user.department:
        query = query.filter(models.Department.code == current_user.department)
    colleges = query.all()

    program_ids = [int(p.id) for c in colleges for p in (c.programs or [])]
    block_counts = {}
    subject_counts = {}
    if program_ids:
        for pid, cnt in (
            db.query(models.CurriculumBlock.program_id, func.count(models.CurriculumBlock.id))
            .filter(models.CurriculumBlock.program_id.in_(program_ids))
            .group_by(models.CurriculumBlock.program_id)
            .all()
        ):
            block_counts[int(pid)] = int(cnt)

        for pid, cnt in (
            db.query(models.CurriculumBlock.program_id, func.count(models.Curriculum.id))
            .join(models.Curriculum, models.Curriculum.block_id == models.CurriculumBlock.id)
            .filter(models.CurriculumBlock.program_id.in_(program_ids))
            .group_by(models.CurriculumBlock.program_id)
            .all()
        ):
            subject_counts[int(pid)] = int(cnt)

    return [
        CollegeOut(
            id=int(c.id),  # type: ignore
            code=str(c.code),  # type: ignore
            name=str(c.name),  # type: ignore
            programs=[
                ProgramOut(
                    id=int(p.id),  # type: ignore
                    code=str(p.code),  # type: ignore
                    name=str(p.name),  # type: ignore
                    department_id=int(p.department_id),  # type: ignore
                    block_count=block_counts.get(int(p.id), 0),  # type: ignore
                    subject_count=subject_counts.get(int(p.id), 0),  # type: ignore
                )
                for p in sorted(list(c.programs or []), key=lambda p: str(getattr(p, 'name', '')))
            ],
        )
        for c in colleges
    ]


@router.get("/unassigned")
def list_unassigned_blocks(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    """
    Curriculum blocks that belong to no programme.

    These exist because programme names were free text before the taxonomy was
    seeded. Hiding them would lose real curriculum silently, so they get their
    own listing and an explicit decision: assign, or delete.
    """
    auth.require_roles(current_user, ('admin', 'dean', 'program_chair'))
    query = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.program_id.is_(None)
    )
    if current_user.department or current_user.role in ('dean', 'program_chair'):
        dept = auth.resolve_user_department(db, current_user)
        if not dept:
            return []
        query = query.filter(models.CurriculumBlock.department_id == dept.id)
    if current_user.role not in ('admin', 'dean'):
        query = query.filter(models.CurriculumBlock.status == 'PUBLISHED')
    blocks = query.all()
    block_ids = [b.id for b in blocks]
    subj_counts = {}
    if block_ids:
        for bid, cnt in (
            db.query(models.Curriculum.block_id, func.count(models.Curriculum.id))
            .filter(models.Curriculum.block_id.in_(block_ids))
            .group_by(models.Curriculum.block_id)
            .all()
        ):
            subj_counts[bid] = int(cnt)
    return [
        {
            "id": b.id,
            "program_name": b.program_name,
            "academic_year": b.academic_year,
            "status": getattr(b, "status", "PUBLISHED") or "PUBLISHED",
            "subject_count": subj_counts.get(b.id, 0),
        }
        for b in blocks
    ]


@router.post("/blocks/{block_id}/assign/{program_id}")
def assign_block(
    block_id: int,
    program_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Curriculum block not found.")

    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")
    _require_admin_or_dean(db, current_user, int(program.department_id))  # type: ignore

    block.program_id = program.id  # type: ignore
    block.department_id = program.department_id  # type: ignore
    # Subjects carry their own department_id and are filtered by it elsewhere.
    db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).update(
        {models.Curriculum.department_id: program.department_id}, synchronize_session=False
    )
    db.commit()
    log_activity(
        db, int(current_user.id), "Assign Curriculum Block",  # type: ignore
        f"Assigned '{block.program_name}' to {program.code}", "success",
        department_id=int(program.department_id),  # type: ignore
    )
    return {"message": f"Assigned to {program.name}."}


@router.post("/programs", response_model=ProgramOut, status_code=status.HTTP_201_CREATED)
def create_program(
    payload: ProgramCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _require_admin_or_dean(db, current_user, payload.department_id)
    code = payload.code.strip().upper()
    if db.query(models.Program).filter(models.Program.code == code).first():
        raise HTTPException(status_code=409, detail=f"Programme code {code} is already in use.")
    if not db.query(models.Department).filter(models.Department.id == payload.department_id).first():
        raise HTTPException(status_code=404, detail="College not found.")

    program = models.Program(code=code, name=payload.name.strip(), department_id=payload.department_id)
    db.add(program)
    db.commit()
    db.refresh(program)
    log_activity(db, int(current_user.id), "Create Programme", f"Created programme {code}", "success",  # type: ignore
                 department_id=payload.department_id)
    return _program_out(db, program)


@router.put("/programs/{program_id}", response_model=ProgramOut)
def update_program(
    program_id: int,
    payload: ProgramUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")
    _require_admin_or_dean(db, current_user, int(program.department_id))  # type: ignore
    if payload.department_id:
        _require_admin_or_dean(db, current_user, payload.department_id)

    if payload.code:
        code = payload.code.strip().upper()
        clash = db.query(models.Program).filter(
            models.Program.code == code, models.Program.id != program_id
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"Programme code {code} is already in use.")
        program.code = code  # type: ignore
    if payload.name:
        program.name = payload.name.strip()  # type: ignore
    if payload.department_id:
        program.department_id = payload.department_id  # type: ignore

    db.commit()
    db.refresh(program)
    log_activity(db, int(current_user.id), "Update Programme", f"Updated programme {program.code}", "success",  # type: ignore
                 department_id=int(program.department_id))  # type: ignore
    return _program_out(db, program)


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_program(
    program_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")
    _require_admin_or_dean(db, current_user, int(program.department_id))  # type: ignore

    # Refuse with a count rather than cascading a delete through real curriculum.
    blocks = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.program_id == program_id
    ).count()
    if blocks:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{program.name} still holds {blocks} curriculum "
                f"{'block' if blocks == 1 else 'blocks'}. Delete or reassign them first."
            ),
        )

    code = program.code
    dept_id = program.department_id
    db.delete(program)
    db.commit()
    log_activity(db, int(current_user.id), "Delete Programme", f"Deleted programme {code}", "success",  # type: ignore
                 department_id=int(dept_id) if dept_id is not None else None)  # type: ignore
    return None
