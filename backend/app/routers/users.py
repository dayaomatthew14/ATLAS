import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
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
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(models.User)
    
    if current_user.role in ['program_chair', 'coordinator']:
        if not current_user.department:
            return []
        query = query.filter(models.User.department == current_user.department)
    elif department:
        query = query.filter(models.User.department == department)
        
    if role:
        query = query.filter(models.User.role == role)
        
    users = query.offset(skip).limit(limit).all()
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
        }
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
        
    if current_user.role in ['program_chair', 'coordinator']:
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
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role in ['program_chair', 'coordinator']:
        if user.department != current_user.department:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create users in your department")
        if user.role not in ['faculty', 'student']:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot create users with this role")
            
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")
        
    user_data = user.model_dump()
    new_user = models.User(**user_data)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

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
        
    if current_user.role in ['program_chair', 'coordinator']:
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this user")
        if user.role and user.role not in ['faculty', 'student']:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign this role")
    elif current_user.role != 'admin' and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    update_data = user.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()

    db.refresh(db_user)
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
        
    if current_user.role in ['program_chair', 'coordinator']:
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this user")
    elif current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    db.delete(db_user)
    db.commit()
    return None

@router.post("/{user_id}/toggle-verification")
def toggle_user_verification(
    user_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can toggle user verification")
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db_user.is_verified = not db_user.is_verified # type: ignore
    db.commit()
    db.refresh(db_user)
    return {"id": db_user.id, "is_verified": db_user.is_verified, "msg": f"Verification status updated"}

@router.post("/{user_id}/upload-picture")
def upload_profile_picture(
    user_id: int, 
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin' and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        
    # Generate unique filename
    raw_filename = file.filename or "profile.jpg"
    file_ext = raw_filename.split(".")[-1] if "." in raw_filename else "jpg"
    filename = f"user_{user_id}_{os.urandom(4).hex()}.{file_ext}"
    file_location = f"uploads/profiles/{filename}"
    
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    # Delete old picture if exists
    if db_user.profile_picture:
        try:
            os.remove(str(db_user.profile_picture))
        except OSError:
            pass
            
    setattr(db_user, 'profile_picture', file_location)
    db.commit()
    db.refresh(db_user)
    
    return {"url": f"/{file_location}"}

@router.post("/change-password")
def change_password(
    payload: schemas.ChangePassword,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if not auth.verify_password(payload.old_password, str(current_user.password_hash)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )
    setattr(current_user, 'password_hash', auth.get_password_hash(payload.new_password))
    db.commit()
    return {"msg": "Password updated successfully"}

@router.post("/purge-all-users")
@router.delete("/purge-all-users")
def purge_all_users(db: Session = Depends(database.get_db)):
    deleted_count = db.query(models.User).delete()
    db.commit()
    return {"message": "All users deleted successfully", "deleted_count": deleted_count}
