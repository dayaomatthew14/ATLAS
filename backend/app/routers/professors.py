from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/professors",
    tags=["Professors"]
)

SCOPED_ROLES = ['program_chair', 'coordinator']


def resolve_user_department(db: Session, current_user: models.User):
    """Return the Department for a user's department code/name, or None."""
    if not current_user.department:
        return None
    return db.query(models.Department).filter(
        (models.Department.code == current_user.department) |
        (models.Department.name == current_user.department)
    ).first()


def assert_faculty_in_scope(db: Session, current_user: models.User, faculty: models.Faculty):
    """
    Reject access to a faculty record outside the caller's department.

    Admins are unrestricted. Every other role is confined to its own department;
    an unresolvable department fails closed rather than granting global access.
    """
    if current_user.role == 'admin':
        return
    if current_user.role not in SCOPED_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    dept = resolve_user_department(db, current_user)
    if not dept or faculty.department_id != dept.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access faculty outside your department"
        )

@router.get("", response_model=List[schemas.FacultyResponse])
@router.get("/", response_model=List[schemas.FacultyResponse], include_in_schema=False)
def get_professors(
    skip: int = 0, 
    limit: int = 100, 
    department_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(models.Faculty)
    
    if current_user.role in SCOPED_ROLES:
        # Fail closed. This previously fell back to returning every faculty
        # member in the university when the department could not be resolved.
        dept = resolve_user_department(db, current_user)
        if not dept:
            return []
        query = query.filter(models.Faculty.department_id == dept.id)
    elif department_id:
        query = query.filter(models.Faculty.department_id == department_id)
        
    faculty_members = query.offset(skip).limit(limit).all()
    
    # Pre-calculate faculty loads for active semester
    active_semester = db.query(models.Semester).filter(models.Semester.is_active == True).first()
    faculty_loads = {}
    if active_semester:
        all_offerings = db.query(
            models.SubjectOffering.faculty_id, models.Curriculum.units
        ).join(
            models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id
        ).filter(
            models.SubjectOffering.semester_id == active_semester.id
        ).all()
        for off in all_offerings:
            if off.faculty_id is not None:
                faculty_loads[off.faculty_id] = faculty_loads.get(off.faculty_id, 0) + off.units
    
    result = []
    for f in faculty_members:
        curr_u = faculty_loads.get(f.id, 0)
        max_u = f.max_units if (f.max_units and f.max_units > 0) else (18 if f.type == 'full_time' else 12)
        rem_u = max(0, max_u - curr_u)
        f_dict = {
            "id": f.id,
            "first_name": f.first_name,
            "last_name": f.last_name,
            "email": f.email,
            "contact_number": f.contact_number,
            "max_units": max_u,
            "type": f.type,
            "department_id": f.department_id,
            "current_units": curr_u,
            "remaining_units": rem_u,
            "unavailability": f.unavailabilities
        }
        result.append(f_dict)
    
    return result

@router.get("/{faculty_id}", response_model=schemas.FacultyResponse)
def get_professor(
    faculty_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, faculty)
    return faculty

@router.post("", response_model=schemas.FacultyResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=schemas.FacultyResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_professor(
    faculty: schemas.FacultyCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not add faculty. This is done by the program chair or coordinator.")
        
    faculty_data = faculty.model_dump()

    if faculty_data.get('type') == 'full_time' and (not faculty_data.get('max_units') or faculty_data.get('max_units') == 0):
        faculty_data['max_units'] = 18
    
    if current_user.role in ['program_chair', 'coordinator']:
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            faculty_data['department_id'] = dept.id
            
    new_faculty = models.Faculty(**faculty_data)
    db.add(new_faculty)
    db.commit()
    db.refresh(new_faculty)

    return new_faculty

@router.put("/{faculty_id}", response_model=schemas.FacultyResponse)
def update_professor(
    faculty_id: int, 
    faculty: schemas.FacultyUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not edit faculty. This is done by the program chair or coordinator.")
        
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, db_faculty)

    update_data = faculty.model_dump(exclude_unset=True)

    # A scoped user must not be able to move a faculty member into another
    # department, which would put the record permanently out of their reach.
    if current_user.role in SCOPED_ROLES and 'department_id' in update_data:
        dept = resolve_user_department(db, current_user)
        if not dept or update_data['department_id'] != dept.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot reassign faculty to another department"
            )

    for key, value in update_data.items():
        setattr(db_faculty, key, value)

    db.commit()
    db.refresh(db_faculty)
    return db_faculty

@router.delete("/{faculty_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_professor(
    faculty_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not remove faculty. This is done by the program chair or coordinator.")
        
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, db_faculty)

    db.query(models.FacultyUnavailability).filter(models.FacultyUnavailability.faculty_id == faculty_id).delete(synchronize_session=False)
    db.query(models.SubjectOffering).filter(models.SubjectOffering.faculty_id == faculty_id).delete(synchronize_session=False)
    db.delete(db_faculty)
    db.commit()
    return None

# --- Faculty Unavailability Endpoints ---

@router.get("/{faculty_id}/unavailability", response_model=List[schemas.FacultyUnavailabilityResponse])
def get_unavailability(
    faculty_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, faculty)

    blocks = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.faculty_id == faculty_id
    ).all()
    return blocks

@router.post("/{faculty_id}/unavailability", response_model=schemas.FacultyUnavailabilityResponse, status_code=status.HTTP_201_CREATED)
def add_unavailability(
    faculty_id: int,
    block: schemas.FacultyUnavailabilityCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not set faculty availability. This is done by the program chair or coordinator.")
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, faculty)

    if block.end_time <= block.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unavailability end time must be after the start time"
        )

    new_block = models.FacultyUnavailability(
        faculty_id=faculty_id,
        day_of_week=block.day_of_week,
        start_time=block.start_time,
        end_time=block.end_time
    )
    db.add(new_block)
    db.commit()
    db.refresh(new_block)
    return new_block

@router.put("/{faculty_id}/unavailability", response_model=List[schemas.FacultyUnavailabilityResponse])
def replace_unavailability(
    faculty_id: int,
    blocks: List[schemas.FacultyUnavailabilityCreate],
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Replace a faculty member's entire unavailability set in one transaction.

    The UI previously saved by deleting every existing block one at a time and
    then POSTing each new one -- N+1 sequential requests where a failure
    partway through left the person with half their availability recorded and
    nothing to indicate it (audit finding FLOW-03). This either applies the
    whole set or changes nothing.
    """
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not set faculty availability. This is done by the program chair or coordinator.")

    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")
    assert_faculty_in_scope(db, current_user, faculty)

    valid_days = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'}
    for b in blocks:
        if b.day_of_week not in valid_days:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{b.day_of_week} is not a scheduling day. Use Mon to Sat."
            )
        if b.end_time <= b.start_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unavailability on {b.day_of_week} must end after it starts."
            )

    try:
        db.query(models.FacultyUnavailability).filter(
            models.FacultyUnavailability.faculty_id == faculty_id
        ).delete(synchronize_session=False)

        created = [
            models.FacultyUnavailability(
                faculty_id=faculty_id,
                day_of_week=b.day_of_week,
                start_time=b.start_time,
                end_time=b.end_time,
            )
            for b in blocks
        ]
        if created:
            db.add_all(created)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save availability, so nothing was changed: {e}"
        )

    return db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.faculty_id == faculty_id
    ).all()

@router.delete("/{faculty_id}/unavailability/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_unavailability(
    faculty_id: int,
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrators do not set faculty availability. This is done by the program chair or coordinator.")

    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")
    assert_faculty_in_scope(db, current_user, faculty)

    block = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.id == block_id,
        models.FacultyUnavailability.faculty_id == faculty_id
    ).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked time not found")
    db.delete(block)
    db.commit()
    return None
