from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, Form, Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Any
import logging
import re
from .. import models, schemas, database, auth
from ..services.curriculum_parser import process_curriculum_import, parse_excel_headers
from .logs import log_activity

# Backward-compatible alias for existing tests and internal callers
_process_curriculum_import = process_curriculum_import

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/curriculum",
    tags=["Curriculum"]
)

def _require_admin_or_dept_dean(user: models.User, dept_id: Any, db: Session):
    if user.role not in ['admin', 'dean']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to manage curriculum")
    if user.department:
        if not dept_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department required")
        dept = db.query(models.Department).filter(models.Department.id == int(dept_id)).first()
        if not dept or (dept.code != user.department and dept.name != user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only manage curriculum for your department")
        return

@router.get("/blocks", response_model=List[schemas.CurriculumBlockWithCount])
def get_curriculum_blocks(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    try:
        query = db.query(models.CurriculumBlock)
        
        if current_user.role not in ['admin', 'dean']:
            # All non-admin/dean roles only see PUBLISHED curricula
            query = query.filter(models.CurriculumBlock.status == 'PUBLISHED')

        user_dept = getattr(current_user, 'department', None)
        if user_dept:
            dept = db.query(models.Department).filter(
                (models.Department.code == user_dept) | 
                (models.Department.name == user_dept)
            ).first()
            if dept:
                query = query.filter(models.CurriculumBlock.department_id == dept.id)
            else:
                return []

        blocks = query.all()
        results = []
        
        for block in blocks:
            subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
            results.append({
                "id": block.id,
                "program_name": block.program_name,
                "academic_year": block.academic_year,
                "filename": block.filename,
                "department_id": block.department_id,
                "program_id": getattr(block, "program_id", None),
                "status": getattr(block, "status", "PUBLISHED") or "PUBLISHED",
                "created_at": block.created_at,
                "subject_count": len(subjects),
                "total_units": sum(s.units for s in subjects)
            })
            
        return results
    except Exception as e:
        logger.warning(f"Fallback handling status query error in get_curriculum_blocks: {e}")
        blocks = db.query(models.CurriculumBlock).all()
        results = []
        for block in blocks:
            b_status = getattr(block, "status", "PUBLISHED") or "PUBLISHED"
            if current_user.role not in ['admin', 'dean'] and b_status != 'PUBLISHED':
                continue
            if current_user.role in ['dean', 'program_chair']:
                dept = db.query(models.Department).filter(
                    (models.Department.code == current_user.department) | 
                    (models.Department.name == current_user.department)
                ).first()
                if dept and block.department_id != dept.id:
                    continue

            subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
            results.append({
                "id": block.id,
                "program_name": block.program_name,
                "academic_year": block.academic_year,
                "filename": block.filename,
                "department_id": block.department_id,
                "program_id": getattr(block, "program_id", None),
                "status": b_status,
                "created_at": block.created_at,
                "subject_count": len(subjects),
                "total_units": sum(s.units for s in subjects)
            })
        return results

@router.post("/blocks", response_model=schemas.CurriculumBlockWithCount, status_code=status.HTTP_201_CREATED)
def create_curriculum_block(
    block_data: schemas.CurriculumBlockCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    target_dept_id = block_data.department_id

    # A version belongs to a programme; the college follows from it. Deriving
    # the college here stops a block being filed under one college while its
    # programme sits in another.
    if block_data.program_id:
        program = db.query(models.Program).filter(models.Program.id == block_data.program_id).first()
        if not program:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Programme not found.")
        target_dept_id = program.department_id

    _require_admin_or_dept_dean(current_user, target_dept_id, db)

    existing = db.query(models.CurriculumBlock).filter(
        models.CurriculumBlock.program_name == block_data.program_name,
        models.CurriculumBlock.academic_year == block_data.academic_year,
        models.CurriculumBlock.department_id == target_dept_id
    ).first()
    if existing:
        subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == existing.id).all()
        return {
            "id": existing.id,
            "program_name": existing.program_name,
            "academic_year": existing.academic_year,
            "filename": existing.filename,
            "department_id": existing.department_id,
            "program_id": getattr(existing, "program_id", None),
            "status": getattr(existing, "status", "PUBLISHED") or "PUBLISHED",
            "created_at": existing.created_at,
            "subject_count": len(subjects),
            "total_units": sum(s.units for s in subjects)
        }

    new_block = models.CurriculumBlock(
        program_name=block_data.program_name.strip(),
        academic_year=block_data.academic_year.strip(),
        filename=block_data.filename or "Manual Entry",
        department_id=target_dept_id,
        program_id=block_data.program_id,
        status=block_data.status or 'PUBLISHED'
    )
    db.add(new_block)
    db.commit()
    db.refresh(new_block)
    
    log_activity(db, current_user.id, "Create Curriculum Block", f"Created curriculum block: {new_block.program_name} ({new_block.academic_year})", "success", department_id=target_dept_id) # type: ignore

    return {
        "id": new_block.id,
        "program_name": new_block.program_name,
        "academic_year": new_block.academic_year,
        "filename": new_block.filename,
        "department_id": new_block.department_id,
        "program_id": getattr(new_block, "program_id", None),
        "status": getattr(new_block, "status", "PUBLISHED") or "PUBLISHED",
        "created_at": new_block.created_at,
        "subject_count": 0,
        "total_units": 0
    }

@router.patch("/blocks/{block_id}/status", response_model=schemas.CurriculumBlockWithCount)
def update_curriculum_block_status(
    block_id: int,
    status_value: str = Form(..., alias="status"),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Curriculum block not found")

    _require_admin_or_dept_dean(current_user, block.department_id, db)
        
    new_status = status_value.upper().strip()
    if new_status not in ['DRAFT', 'PUBLISHED', 'ARCHIVED']:
        raise HTTPException(status_code=400, detail="Invalid status. Must be DRAFT, PUBLISHED, or ARCHIVED.")
        
    setattr(block, "status", new_status)
    db.commit()
    db.refresh(block)
    
    log_activity(db, current_user.id, "Update Curriculum Status", f"Updated curriculum {block.program_name} status to {new_status}", "success", department_id=block.department_id) # type: ignore
    
    subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
    return {
        "id": block.id,
        "program_name": block.program_name,
        "academic_year": block.academic_year,
        "filename": block.filename,
        "department_id": block.department_id,
        "status": block.status,
        "created_at": block.created_at,
        "subject_count": len(subjects),
        "total_units": sum(s.units for s in subjects)
    }

@router.get("", response_model=List[schemas.CurriculumResponse])
def get_curriculum(
    skip: int = 0,
    # Was 100. A single curriculum version can hold more than that — DVM has
    # 117 subjects — so the default quietly truncated a whole programme.
    limit: int = 1000,
    department_id: Optional[int] = None,
    program_code: Optional[str] = None,
    block_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Curriculum)
    
    if current_user.role in ['dean', 'program_chair'] and current_user.department:
        # Filter curriculum by the user's department
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Curriculum.department_id == dept.id)
        else:
            return [] # No department match means no access
    elif department_id:
        query = query.filter(models.Curriculum.department_id == department_id)

    if program_code:
        query = query.filter(models.Curriculum.program_code == program_code)
    
    if block_id:
        query = query.filter(models.Curriculum.block_id == block_id)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{curriculum_id}", response_model=schemas.CurriculumResponse)
def get_curriculum_item(
    curriculum_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    curriculum_item = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not curriculum_item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")
        
    if current_user.role in ['dean', 'program_chair'] and current_user.department:
        dept = db.query(models.Department).filter(models.Department.id == curriculum_item.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this curriculum item")
            
    return curriculum_item

@router.post("", response_model=schemas.CurriculumResponse, status_code=status.HTTP_201_CREATED)
def create_curriculum_item(
    curriculum_item: schemas.CurriculumCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if not curriculum_item.department_id:
        if curriculum_item.block_id:
            blk = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == curriculum_item.block_id).first()
            if blk:
                curriculum_item.department_id = int(blk.department_id) # type: ignore
        if not curriculum_item.department_id and current_user.role == 'dean':
            dept = db.query(models.Department).filter(
                (models.Department.code == current_user.department) | 
                (models.Department.name == current_user.department)
            ).first()
            if dept:
                curriculum_item.department_id = int(dept.id) # type: ignore
        if not curriculum_item.department_id:
            first_dept = db.query(models.Department).first()
            if first_dept:
                curriculum_item.department_id = int(first_dept.id) # type: ignore

    _require_admin_or_dept_dean(current_user, curriculum_item.department_id, db)
             
    # Determine subject type using Lec/Lab unit values as primary priority
    lec_u_val = curriculum_item.lec_units
    lab_u_val = curriculum_item.lab_units
    if lec_u_val > 0 and lab_u_val == 0:
        curriculum_item.type = 'lecture'
    elif lec_u_val == 0 and lab_u_val > 0:
        curriculum_item.type = 'lab'

    ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", curriculum_item.code, re.IGNORECASE)
    # Split only when both halves are real; see the import path for why an
    # A/B code with no laboratory units must not gain a fabricated one.
    if ab_match and curriculum_item.lab_units > 0 and curriculum_item.lec_units > 0:
        base_code = ab_match.group(1).strip()
        code_a = f"{base_code}A"
        code_b = f"{base_code}B"

        u_lec = curriculum_item.lec_units
        u_lab = curriculum_item.lab_units

        existing_a = db.query(models.Curriculum).filter(
            models.Curriculum.block_id == curriculum_item.block_id,
            func.lower(models.Curriculum.code) == code_a.lower()
        ).first() if curriculum_item.block_id else None

        existing_b = db.query(models.Curriculum).filter(
            models.Curriculum.block_id == curriculum_item.block_id,
            func.lower(models.Curriculum.code) == code_b.lower()
        ).first() if curriculum_item.block_id else None

        if existing_a and existing_b:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Both {code_a} and {code_b} already exist in this curriculum block")

        created_item = None
        if not existing_a:
            new_a = models.Curriculum(
                **{**curriculum_item.model_dump(), "code": code_a, "type": "lecture", "units": u_lec, "lec_units": u_lec, "lab_units": 0}
            )
            db.add(new_a)
            created_item = new_a
        if not existing_b:
            new_b = models.Curriculum(
                **{**curriculum_item.model_dump(), "code": code_b, "type": "lab", "units": u_lab, "lec_units": 0, "lab_units": u_lab}
            )
            db.add(new_b)
            if not created_item: created_item = new_b

        db.commit()
        if created_item: db.refresh(created_item)
        log_activity(db, current_user.id, "Create Curriculum", f"Created split A/B subjects: {code_a}, {code_b}", "success", department_id=curriculum_item.department_id) # type: ignore
        return created_item or existing_a

    # Check per-block duplicate
    if curriculum_item.block_id:
        existing_single = db.query(models.Curriculum).filter(
            models.Curriculum.block_id == curriculum_item.block_id,
            func.lower(models.Curriculum.code) == curriculum_item.code.lower()
        ).first()
        if existing_single:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Subject {curriculum_item.code} already exists in this curriculum block")
    else:
        db_curriculum = db.query(models.Curriculum).filter(
            models.Curriculum.code == curriculum_item.code,
            models.Curriculum.program_code == curriculum_item.program_code
        ).first()
        if db_curriculum:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Curriculum item with this code already exists for this program")
        
    new_curriculum = models.Curriculum(**curriculum_item.model_dump())
    db.add(new_curriculum)
    db.commit()
    db.refresh(new_curriculum)
    
    log_activity(db, current_user.id, "Create Curriculum", f"Created subject: {new_curriculum.code}", "success", department_id=new_curriculum.department_id) # type: ignore
    
    return new_curriculum

@router.put("/{curriculum_id}", response_model=schemas.CurriculumResponse)
def update_curriculum_item(
    curriculum_id: int, 
    curriculum_item: schemas.CurriculumUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not db_curriculum:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")

    _require_admin_or_dept_dean(current_user, db_curriculum.department_id, db)
             
    update_data = curriculum_item.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_curriculum, key, value)
        
    db.commit()
    db.refresh(db_curriculum)
    
    log_activity(db, current_user.id, "Update Curriculum", f"Updated subject: {db_curriculum.code}", "success", department_id=db_curriculum.department_id) # type: ignore
    
    return db_curriculum

@router.delete("/{curriculum_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_curriculum_item(
    curriculum_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == curriculum_id).first()
    if not db_curriculum:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum item not found")

    _require_admin_or_dept_dean(current_user, db_curriculum.department_id, db)
             
    curr_code = db_curriculum.code
    dept_id = getattr(db_curriculum, 'department_id', None)
    db.delete(db_curriculum)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Curriculum", f"Deleted subject: {curr_code}", "success", department_id=dept_id) # type: ignore
    
    return None

@router.post("/import", response_model=schemas.ImportResponse)
async def import_curriculum(
    file: UploadFile = File(...),
    department_id: Optional[int] = Form(None),
    program_code: Optional[str] = Form(None),
    dry_run: bool = Form(False),
    mapping: Optional[str] = Form(None),
    selected_sheet: Optional[str] = Form(None),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    contents = await file.read()
    return await process_curriculum_import(
        contents, department_id, program_code, dry_run, db, current_user, mapping, selected_sheet
    )

@router.post("/bulk", response_model=schemas.ImportResponse)
def bulk_create_curriculum(
    payload: schemas.BulkImportRequest,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    _require_admin_or_dept_dean(current_user, payload.department_id, db)

    try:
        # Step 0: Ensure Curriculum Block exists or create it
        block = None
        if payload.block_id:
            block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == payload.block_id).first()

        if not block:
            block = db.query(models.CurriculumBlock).filter(
                models.CurriculumBlock.program_name == payload.program_name,
                models.CurriculumBlock.academic_year == payload.academic_year,
                models.CurriculumBlock.department_id == payload.department_id
            ).first()

        if not block:
            block = models.CurriculumBlock(
                program_name=payload.program_name,
                academic_year=payload.academic_year,
                department_id=payload.department_id,
                filename="Bulk Import"
            )
            db.add(block)
            db.flush()

        new_items = []
        skipped_items = []
        for item in payload.items:
            # Check if code already exists IN THIS BLOCK
            existing = db.query(models.Curriculum).filter(
                models.Curriculum.block_id == block.id,
                func.lower(models.Curriculum.code) == item.code.lower()
            ).first()

            if not existing:
                new_item = models.Curriculum(**item.model_dump())
                new_item.block_id = block.id
                new_items.append(new_item)
            else:
                skipped_items.append({"code": item.code, "name": item.name, "reason": "Already exists in this block"})
        
        if new_items:
            db.add_all(new_items)
            db.commit()
            
            log_activity(db, int(current_user.id), "Bulk Create Curriculum", f"Bulk created {len(new_items)} items for {payload.program_name}", "success", department_id=payload.department_id) # type: ignore
        
        summary = {
            "program_name": payload.program_name,
            "academic_year": payload.academic_year,
            "total_rows": len(payload.items),
            "valid_new_items": len(new_items),
            "duplicates_skipped": len(skipped_items),
            "issues_found": 0
        }
        return {
            "is_dry_run": False,
            "message": f"Successfully committed {len(new_items)} items to {payload.program_name}.",
            "summary": summary,
            "report": None,
            "errors": skipped_items
        }
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Bulk commit failed: {str(e)}")

@router.post("/headers")
async def get_excel_headers(
    file: UploadFile = File(...),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'dean']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only System Administrators and Deans can preview Excel headers")
    contents = await file.read()
    try:
        return parse_excel_headers(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {str(e)}")

@router.delete("/course/{course_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_course(
    course_name: str,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role == 'dean':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        dept_id = dept.id if dept else None
        db.query(models.Curriculum).filter(
            models.Curriculum.program_code == course_name,
            models.Curriculum.department_id == dept_id
        ).delete(synchronize_session=False)
        db.commit()
        log_activity(db, int(current_user.id), "Delete Course", f"Deleted items for course: {course_name}", "success", department_id=int(dept_id) if dept_id is not None else None) # type: ignore
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    elif current_user.role == 'admin':
        db.query(models.Curriculum).filter(models.Curriculum.program_code == course_name).delete(synchronize_session=False)
        db.commit()
        log_activity(db, int(current_user.id), "Delete Course", f"Deleted all items for course: {course_name}", "success") # type: ignore
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only System Administrators and Deans can delete curriculum courses")

@router.get("/block/{block_id}/impact")
def curriculum_block_impact(
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    What deleting this curriculum would destroy besides its subjects.

    `schedules.curriculum_id` and `subject_offerings.curriculum_id` are both
    ondelete=CASCADE, so removing a curriculum silently takes every faculty
    assignment and every plotted class that references its subjects. The
    confirmation dialog cannot warn about a quantity it has not been told, and
    "are you sure?" over an unnamed amount of destruction is not a warning.

    Counted at the moment the dialog opens rather than served with the catalog
    listing: a chair can assign subjects between a page load and a delete, and
    the number that matters is the one true when the administrator decides.
    """
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum not found")

    _require_admin_or_dept_dean(current_user, block.department_id, db)

    subject_ids = [
        row[0] for row in
        db.query(models.Curriculum.id).filter(models.Curriculum.block_id == block_id).all()
    ]

    if not subject_ids:
        return {
            "block_id": block_id,
            "subject_count": 0,
            "offering_count": 0,
            "schedule_count": 0,
            "faculty_count": 0,
        }

    offerings = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.curriculum_id.in_(subject_ids)
    ).all()
    schedules = db.query(models.Schedule).filter(
        models.Schedule.curriculum_id.in_(subject_ids)
    ).all()

    # One faculty member losing both an assignment and its plotted classes is
    # one person affected, not three things.
    faculty_ids = {o.faculty_id for o in offerings if o.faculty_id}
    faculty_ids |= {s.faculty_id for s in schedules if s.faculty_id}

    return {
        "block_id": block_id,
        "subject_count": len(subject_ids),
        "offering_count": len(offerings),
        "schedule_count": len(schedules),
        "faculty_count": len(faculty_ids),
    }


@router.delete("/block/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_curriculum_block(
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # Get block details for logging before deletion
    block = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum block not found")

    _require_admin_or_dept_dean(current_user, block.department_id, db)

    block_name = block.program_name
    dept_id = block.department_id

    # Counted before the delete, because the cascade takes these with it and
    # afterwards there is nothing left to count. The audit entry used to record
    # only the block name, which left no trace that a term's plotted classes
    # had gone with it.
    subject_ids = [
        row[0] for row in
        db.query(models.Curriculum.id).filter(models.Curriculum.block_id == block_id).all()
    ]
    offering_count = schedule_count = 0
    if subject_ids:
        offering_count = db.query(models.SubjectOffering).filter(
            models.SubjectOffering.curriculum_id.in_(subject_ids)
        ).count()
        schedule_count = db.query(models.Schedule).filter(
            models.Schedule.curriculum_id.in_(subject_ids)
        ).count()

    # Delete all subjects in the block first
    db.query(models.Curriculum).filter(models.Curriculum.block_id == block_id).delete(synchronize_session=False)
    # Then delete the block itself
    db.query(models.CurriculumBlock).filter(models.CurriculumBlock.id == block_id).delete(synchronize_session=False)

    db.commit()

    detail = (
        f"Deleted curriculum block: {block_name} "
        f"({len(subject_ids)} subjects, {offering_count} faculty assignments, "
        f"{schedule_count} plotted classes)"
    )
    log_activity(db, current_user.id, "Delete Block", detail, "success", department_id=dept_id) # type: ignore
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)

"""
A second DELETE /{id} handler sat here, duplicating the one above.
FastAPI matches the first registration, so it never ran — and it skipped the
audit-log write the live handler performs.
"""
