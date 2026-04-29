from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/users",
    tags=["Users"]
)

@router.get("")
def get_users(
    skip: int = 0, 
    limit: int = 100, 
    role: Optional[str] = None,
    department: Optional[str] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(models.User)
    
    if current_user.role == 'program_chair':
        if not current_user.department:
            return []
        query = query.filter(models.User.department == current_user.department)
    elif department:
        query = query.filter(models.User.department == department)
        
    if role:
        query = query.filter(models.User.role == role)
        
    users = query.offset(skip).limit(limit).all()
    
    # Enrich each user with faculty load data so the load tracker works
    result = []
    for u in users:
        user_dict = {
            "id": u.id,
            "email": u.email,
            "first_name": u.first_name,
            "last_name": u.last_name,
            "name": f"{u.first_name} {u.last_name}",
            "role": u.role,
            "department": u.department,
            "contact_number": u.contact_number,
            "is_verified": u.is_verified,
            "created_at": u.created_at,
            "max_units": 18,
            "current_units": 0,
            "department_id": None,
        }
        # Look up faculty record for max_units and current load
        faculty = db.query(models.Faculty).filter(models.Faculty.user_id == u.id).first()
        if faculty:
            user_dict["max_units"] = faculty.max_units
            user_dict["department_id"] = faculty.department_id
            # Sum units of active scheduled subjects for this faculty
            active_semester = db.query(models.Semester).filter(models.Semester.is_active == True).first()
            if active_semester:
                schedules = db.query(models.Schedule).filter(
                    models.Schedule.faculty_id == faculty.id,
                    models.Schedule.semester_id == active_semester.id
                ).all()
                total_units = 0
                for s in schedules:
                    subj = db.query(models.Subject).filter(models.Subject.id == s.subject_id).first()
                    if subj:
                        total_units += subj.units
                user_dict["current_units"] = total_units
        result.append(user_dict)
    
    return result

@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user(
    user_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if current_user.role == 'program_chair':
        if user.department != current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this user")
    elif current_user.role not in ['admin'] and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
            
    return user

@router.post("", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: schemas.UserCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair':
        if user.department != current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create users in your department")
        if user.role not in ['faculty', 'student']:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create users with this role")
            
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        
    user_data = user.model_dump()
    password = user_data.pop('password')
    max_units = user_data.pop('max_units', 18)
    
    user_data['password_hash'] = auth.get_password_hash(password)
    user_data['is_verified'] = True # Created by admin/PC so pre-verify
    
    new_user = models.User(**user_data)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    if new_user.role == 'faculty':
        dept = db.query(models.Department).filter(models.Department.code == new_user.department).first()
        if dept:
            faculty = models.Faculty(user_id=new_user.id, max_units=max_units or 18, department_id=dept.id)
            db.add(faculty)
            db.commit()
            
    return new_user

@router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int, 
    user: schemas.UserUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if current_user.role == 'program_chair':
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this user")
        if user.role and user.role not in ['faculty', 'student']:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign this role")
    elif current_user.role != 'admin' and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    update_data = user.model_dump(exclude_unset=True)
    max_units = update_data.pop('max_units', None)
    
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    
    if db_user.role == 'faculty' and max_units is not None:
        faculty = db.query(models.Faculty).filter(models.Faculty.user_id == db_user.id).first()
        if faculty:
            faculty.max_units = max_units
        else:
            dept = db.query(models.Department).filter(models.Department.code == db_user.department).first()
            if dept:
                faculty = models.Faculty(user_id=db_user.id, max_units=max_units, department_id=dept.id)
                db.add(faculty)
        db.commit()
        
    return db_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    if current_user.role == 'program_chair':
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this user")
    elif current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
             
    db.delete(db_user)
    db.commit()
    return None

# --- Faculty Unavailability Endpoints ---

@router.get("/{user_id}/unavailability", response_model=List[schemas.FacultyUnavailabilityResponse])
def get_unavailability(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    blocks = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.faculty_id == user_id
    ).all()
    return blocks

@router.post("/{user_id}/unavailability", response_model=schemas.FacultyUnavailabilityResponse, status_code=status.HTTP_201_CREATED)
def add_unavailability(
    user_id: int,
    block: schemas.FacultyUnavailabilityCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    new_block = models.FacultyUnavailability(
        faculty_id=user_id,
        day_of_week=block.day_of_week,
        start_time=block.start_time,
        end_time=block.end_time
    )
    db.add(new_block)
    db.commit()
    db.refresh(new_block)
    return new_block

@router.delete("/{user_id}/unavailability/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_unavailability(
    user_id: int,
    block_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    block = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.id == block_id,
        models.FacultyUnavailability.faculty_id == user_id
    ).first()
    if not block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Blocked time not found")
    db.delete(block)
    db.commit()
    return None
