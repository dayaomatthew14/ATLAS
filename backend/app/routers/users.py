from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/users",
    tags=["Users"]
)

@router.get("/", response_model=List[schemas.UserResponse])
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
        
    return query.offset(skip).limit(limit).all()

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

@router.post("/", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
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
    user_data['password_hash'] = auth.get_password_hash(password)
    user_data['is_verified'] = True # Created by admin/PC so pre-verify
    
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
        
    if current_user.role == 'program_chair':
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
        
    if current_user.role == 'program_chair':
        if db_user.department != current_user.department:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this user")
    elif current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
             
    db.delete(db_user)
    db.commit()
    return None
