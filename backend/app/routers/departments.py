from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth

router = APIRouter(
    prefix="/api/departments",
    tags=["Departments"]
)

@router.get("/", response_model=List[schemas.DepartmentResponse])
def get_departments(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    departments = db.query(models.Department).offset(skip).limit(limit).all()
    return departments

@router.get("/{department_id}", response_model=schemas.DepartmentResponse)
def get_department(
    department_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    department = db.query(models.Department).filter(models.Department.id == department_id).first()
    if not department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    return department

@router.post("/", response_model=schemas.DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    department: schemas.DepartmentCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
    
    db_department = db.query(models.Department).filter(models.Department.code == department.code).first()
    if db_department:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department code already registered")
    
    new_department = models.Department(**department.model_dump())
    db.add(new_department)
    db.commit()
    db.refresh(new_department)
    return new_department

@router.put("/{department_id}", response_model=schemas.DepartmentResponse)
def update_department(
    department_id: int, 
    department: schemas.DepartmentUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_department = db.query(models.Department).filter(models.Department.id == department_id).first()
    if not db_department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        
    update_data = department.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_department, key, value)
        
    db.commit()
    db.refresh(db_department)
    return db_department

@router.delete("/{department_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    department_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_department = db.query(models.Department).filter(models.Department.id == department_id).first()
    if not db_department:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
        
    db.delete(db_department)
    db.commit()
    return None
