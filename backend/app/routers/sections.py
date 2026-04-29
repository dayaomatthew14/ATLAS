from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/sections",
    tags=["Sections"]
)

@router.get("", response_model=List[schemas.SectionResponse])
def get_sections(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    query = db.query(models.Section)
    
    if current_user.role == 'program_chair':
        if not current_user.department:
            return []
        
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        
        if dept:
            query = query.filter(models.Section.department_id == dept.id)
        else:
            return []
            
    return query.offset(skip).limit(limit).all()

@router.get("/{section_id}", response_model=schemas.SectionResponse)
def get_section(
    section_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == section.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
            
    return section

@router.post("", response_model=schemas.SectionResponse, status_code=status.HTTP_201_CREATED)
def create_section(
    section: schemas.SectionCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    section_data = section.model_dump()
    
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept:
             raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Department not found")
        section_data['department_id'] = dept.id
            
    new_section = models.Section(**section_data)
    db.add(new_section)
    db.commit()
    db.refresh(new_section)
    
    log_activity(db, current_user.id, "Create Section", f"Created section: {new_section.name}")
    
    return new_section

@router.put("/{section_id}", response_model=schemas.SectionResponse)
def update_section(
    section_id: int, 
    section: schemas.SectionUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == db_section.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this section")
                
    update_data = section.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_section, key, value)
        
    db.commit()
    db.refresh(db_section)
    
    log_activity(db, current_user.id, "Update Section", f"Updated section: {db_section.name}")
    
    return db_section

@router.delete("/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    section_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_section = db.query(models.Section).filter(models.Section.id == section_id).first()
    if not db_section:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Section not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == db_section.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this section")
                
    name = db_section.name
    db.delete(db_section)
    db.commit()
    
    log_activity(db, current_user.id, "Delete Section", f"Deleted section: {name}")
    
    return None
