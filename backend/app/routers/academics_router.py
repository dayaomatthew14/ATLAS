"""
Colleges and programmes.

Reading is open to every signed-in role -- a chair needs the list to know what
their own workspace is called, and registration needs it before anyone has a
session at all. Writing is administrator-only: this is institutional reference
data, and letting a chair invent a college is exactly how the `DEPT_{id}`
sprawl happened.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from .. import models, database, auth
from ..academics import COLLEGE_CODES
from ..routers.logs import log_activity

router = APIRouter(prefix="/api/colleges", tags=["Academics"])


class ProgramOut(BaseModel):
    id: int
    code: str
    name: str
    department_id: int
    block_count: int = 0
    subject_count: int = 0

    class Config:
        from_attributes = True


class CollegeOut(BaseModel):
    id: int
    code: str
    name: str
    programs: List[ProgramOut] = []


class ProgramCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=3, max_length=255)
    department_id: int


class ProgramUpdate(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=20)
    name: Optional[str] = Field(default=None, min_length=3, max_length=255)
    department_id: Optional[int] = None


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


def _require_admin(current_user: models.User):
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can change the academic taxonomy."
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
        id=program.id, code=program.code, name=program.name,
        department_id=program.department_id,
        block_count=len(blocks), subject_count=subject_count,
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
    colleges = _seeded_colleges(db)
    return [
        CollegeOut(
            id=c.id, code=c.code, name=c.name,
            programs=[_program_out(db, p) for p in sorted(c.programs, key=lambda p: p.name)],
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
    blocks = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.program_id.is_(None)
    ).all()
    out = []
    for b in blocks:
        out.append({
            "id": b.id,
            "program_name": b.program_name,
            "academic_year": b.academic_year,
            "status": getattr(b, "status", "PUBLISHED") or "PUBLISHED",
            "subject_count": db.query(models.Curriculum).filter(
                models.Curriculum.block_id == b.id
            ).count(),
        })
    return out


@router.post("/blocks/{block_id}/assign/{program_id}")
def assign_block(
    block_id: int,
    program_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _require_admin(current_user)
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Curriculum block not found.")
    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")

    block.program_id = program.id
    block.department_id = program.department_id
    # Subjects carry their own department_id and are filtered by it elsewhere.
    db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).update(
        {models.Curriculum.department_id: program.department_id}, synchronize_session=False
    )
    db.commit()
    log_activity(
        db, current_user.id, "Assign Curriculum Block",
        f"Assigned '{block.program_name}' to {program.code}", "success",
        department_id=program.department_id,
    )
    return {"message": f"Assigned to {program.name}."}


@router.post("/programs", response_model=ProgramOut, status_code=status.HTTP_201_CREATED)
def create_program(
    payload: ProgramCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _require_admin(current_user)
    code = payload.code.strip().upper()
    if db.query(models.Program).filter(models.Program.code == code).first():
        raise HTTPException(status_code=409, detail=f"Programme code {code} is already in use.")
    if not db.query(models.Department).filter(models.Department.id == payload.department_id).first():
        raise HTTPException(status_code=404, detail="College not found.")

    program = models.Program(code=code, name=payload.name.strip(), department_id=payload.department_id)
    db.add(program)
    db.commit()
    db.refresh(program)
    log_activity(db, current_user.id, "Create Programme", f"Created programme {code}", "success",
                 department_id=payload.department_id)
    return _program_out(db, program)


@router.put("/programs/{program_id}", response_model=ProgramOut)
def update_program(
    program_id: int,
    payload: ProgramUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _require_admin(current_user)
    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")

    if payload.code:
        code = payload.code.strip().upper()
        clash = db.query(models.Program).filter(
            models.Program.code == code, models.Program.id != program_id
        ).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"Programme code {code} is already in use.")
        program.code = code
    if payload.name:
        program.name = payload.name.strip()
    if payload.department_id:
        program.department_id = payload.department_id

    db.commit()
    db.refresh(program)
    log_activity(db, current_user.id, "Update Programme", f"Updated programme {program.code}", "success",
                 department_id=program.department_id)
    return _program_out(db, program)


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_program(
    program_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    _require_admin(current_user)
    program = db.query(models.Program).filter(models.Program.id == program_id).first()
    if not program:
        raise HTTPException(status_code=404, detail="Programme not found.")

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
    log_activity(db, current_user.id, "Delete Programme", f"Deleted programme {code}", "success",
                 department_id=dept_id)
    return None
