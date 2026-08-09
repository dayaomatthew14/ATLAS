from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from ..services import faculty_load
from .logs import log_activity

router = APIRouter(
    prefix="/api/professors",
    tags=["Professors"]
)

SCOPED_ROLES = ['program_chair', 'coordinator']


def serialise_faculty(db: Session, faculty: models.Faculty, semester=None, load=None) -> dict:
    """
    One faculty record with its teaching load attached.

    Load is hours per week off the plotted schedule (see services.faculty_load);
    `current_units`/`remaining_units` are the older unit figures, kept because
    the subject-assignment dialog still totals units when a chair picks
    subjects. They are academic information, not the load basis.
    """
    if load is None:
        load = faculty_load.summarise_many(db, [faculty], semester).get(faculty.id, {})

    max_u = faculty.max_units if (faculty.max_units and faculty.max_units > 0) else (
        18 if faculty.type == 'full_time' else 12
    )
    current_u = _unit_load(db, faculty.id, semester)

    return {
        "id": faculty.id,
        "first_name": faculty.first_name,
        "last_name": faculty.last_name,
        "email": faculty.email,
        "contact_number": faculty.contact_number,
        "max_units": max_u,
        "type": faculty.type,
        "department_id": faculty.department_id,
        "current_units": current_u,
        "remaining_units": max(0, max_u - current_u),
        "unavailability": faculty.unavailabilities,
        **load,
    }


def _plural(n: int, singular: str, plural: str = None) -> str:
    """`plural` is explicit because "class" does not take a bare -s."""
    return f"{n} {singular}" if n == 1 else f"{n} {plural or singular + 's'}"


def describe_removed(counts: dict) -> str:
    """The audit-log phrasing for what a faculty deletion took with it."""
    return (
        f"{_plural(counts['schedule_count'], 'plotted class', 'plotted classes')}, "
        f"{_plural(counts['offering_count'], 'subject assignment')} removed with them"
    )


def faculty_dependents(db: Session, faculty_id: int) -> dict:
    """
    What removing this faculty member would take with them.

    Counted rather than assumed, because the answer decides whether a chair is
    discarding an empty record or dismantling part of a plotted term.
    """
    return {
        "schedule_count": db.query(models.Schedule).filter(
            models.Schedule.faculty_id == faculty_id
        ).count(),
        "offering_count": db.query(models.SubjectOffering).filter(
            models.SubjectOffering.faculty_id == faculty_id
        ).count(),
        "unavailability_count": db.query(models.FacultyUnavailability).filter(
            models.FacultyUnavailability.faculty_id == faculty_id
        ).count(),
    }


def purge_faculty_dependents(db: Session, faculty_id: int) -> dict:
    """
    Remove everything that points at a faculty member, and say what went.

    Two problems this exists to stop, both of which came from letting the ORM
    resolve the relationships on its own:

    Schedules were left behind. `Schedule.faculty_id` is nullable, so deleting a
    faculty member set it to NULL instead of removing the row -- the class stayed
    on the timetable holding its slot, taught by nobody, invisible to every
    faculty-scoped screen and counted toward nobody's REG. HOURS.

    Unavailability blocked the delete outright. `faculty_unavailability.faculty_id`
    is NOT NULL, so the same nulling raised IntegrityError and the request failed
    with a 500.

    Rows are removed child-first rather than relying on cascade order, which is
    not the same across SQLite and Postgres.
    """
    counts = faculty_dependents(db, faculty_id)

    schedule_ids = [
        row[0] for row in
        db.query(models.Schedule.id).filter(models.Schedule.faculty_id == faculty_id).all()
    ]
    if schedule_ids:
        db.query(models.Conflict).filter(
            (models.Conflict.schedule_id_1.in_(schedule_ids))
            | (models.Conflict.schedule_id_2.in_(schedule_ids))
        ).delete(synchronize_session=False)

    db.query(models.Conflict).filter(
        models.Conflict.faculty_id == faculty_id
    ).delete(synchronize_session=False)
    db.query(models.Schedule).filter(
        models.Schedule.faculty_id == faculty_id
    ).delete(synchronize_session=False)
    db.query(models.SubjectOffering).filter(
        models.SubjectOffering.faculty_id == faculty_id
    ).delete(synchronize_session=False)
    db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.faculty_id == faculty_id
    ).delete(synchronize_session=False)

    return counts


def _unit_load(db: Session, faculty_id: int, semester) -> int:
    if not semester:
        return 0
    total = db.query(models.Curriculum.units).join(
        models.SubjectOffering, models.SubjectOffering.curriculum_id == models.Curriculum.id
    ).filter(
        models.SubjectOffering.faculty_id == faculty_id,
        models.SubjectOffering.semester_id == semester.id,
    ).all()
    return sum(row[0] or 0 for row in total)


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

    semester = faculty_load.active_semester(db)

    # REG. HOURS for the whole page in one query, rather than one per member.
    loads = faculty_load.summarise_many(db, faculty_members, semester)

    # Unit totals for the same page, likewise batched.
    unit_loads = {}
    if semester:
        offerings = db.query(
            models.SubjectOffering.faculty_id, models.Curriculum.units
        ).join(
            models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id
        ).filter(
            models.SubjectOffering.semester_id == semester.id
        ).all()
        for faculty_id, units in offerings:
            if faculty_id is not None:
                unit_loads[faculty_id] = unit_loads.get(faculty_id, 0) + (units or 0)

    result = []
    for f in faculty_members:
        max_u = f.max_units if (f.max_units and f.max_units > 0) else (18 if f.type == 'full_time' else 12)
        curr_u = unit_loads.get(f.id, 0)
        result.append({
            "id": f.id,
            "first_name": f.first_name,
            "last_name": f.last_name,
            "email": f.email,
            "contact_number": f.contact_number,
            "max_units": max_u,
            "type": f.type,
            "department_id": f.department_id,
            "current_units": curr_u,
            "remaining_units": max(0, max_u - curr_u),
            "unavailability": f.unavailabilities,
            **loads.get(f.id, {}),
        })

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
    return serialise_faculty(db, faculty)

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

    return serialise_faculty(db, new_faculty)

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
    return serialise_faculty(db, db_faculty)

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

    fac_name = f"{db_faculty.first_name} {db_faculty.last_name}".strip()
    dept_id_val = getattr(db_faculty, 'department_id', None)

    removed = purge_faculty_dependents(db, faculty_id)
    db.delete(db_faculty)
    db.commit()

    log_activity(
        db, current_user.id, "Delete Faculty",
        f"Deleted faculty record for {fac_name} ({describe_removed(removed)})",
        "success", department_id=dept_id_val,
    )  # type: ignore
    return None


@router.get("/{faculty_id}/impact")
def get_professor_delete_impact(
    faculty_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    What removing this faculty member would destroy.

    Read at the moment the confirmation opens, not carried with the faculty
    list: a timetable can be generated between a page load and a removal, and
    the figure that matters is the one true when the chair decides.
    """
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")

    assert_faculty_in_scope(db, current_user, faculty)

    semester = faculty_load.active_semester(db)
    counts = faculty_dependents(db, faculty_id)
    hours = faculty_load.compute_reg_hours(
        db, [faculty_id], getattr(semester, "id", None)
    ).get(faculty_id, 0.0)

    return {"faculty_id": faculty_id, "reg_hours": hours, **counts}

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
