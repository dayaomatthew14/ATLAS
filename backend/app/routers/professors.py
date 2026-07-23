from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/professors",
    tags=["Professors"]
)

@router.get("", response_model=List[schemas.FacultyResponse])
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
    
    if current_user.role in ['program_chair', 'coordinator']:
        if not current_user.department:
            return []
        # Find department ID for the user
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) |
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
            # Fallback: Return all faculty if dept code doesn't map to a single ID
            return query.offset(skip).limit(limit).all()
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
        f_dict = {
            "id": f.id,
            "first_name": f.first_name,
            "last_name": f.last_name,
            "email": f.email,
            "contact_number": f.contact_number,
            "max_units": f.max_units,
            "type": f.type,
            "department_id": f.department_id,
            "current_units": faculty_loads.get(f.id, 0),
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
        
    return faculty

@router.post("", response_model=schemas.FacultyResponse, status_code=status.HTTP_201_CREATED)
def create_professor(
    faculty: schemas.FacultyCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    faculty_data = faculty.model_dump()
    
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
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")
        
    update_data = faculty.model_dump(exclude_unset=True)
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
    db_faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not db_faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")
             
    db.query(models.FacultyUnavailability).filter(models.FacultyUnavailability.faculty_id == faculty_id).delete(synchronize_session=False)
    db.query(models.SubjectOffering).filter(models.SubjectOffering.faculty_id == faculty_id).delete(synchronize_session=False)
    # Ideally should delete schedules as well, or handled via cascade
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
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    faculty = db.query(models.Faculty).filter(models.Faculty.id == faculty_id).first()
    if not faculty:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Professor not found")
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

@router.delete("/{faculty_id}/unavailability/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_unavailability(
    faculty_id: int,
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    block = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.id == block_id,
        models.FacultyUnavailability.faculty_id == faculty_id
    ).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked time not found")
    db.delete(block)
    db.commit()
    return None
