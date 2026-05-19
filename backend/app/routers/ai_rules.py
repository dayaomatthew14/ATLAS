from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, auth
from ..database import get_db
from .logs import log_activity

router = APIRouter(
    prefix="/api/ai-rules",
    tags=["AI Rules"]
)

@router.get("", response_model=List[schemas.AIRuleResponse])
def get_rules(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    query = db.query(models.AIRule)
    
    if current_user.role == 'program_chair':
        # Find department id
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.AIRule.department_id == dept.id)
    elif department_id:
        query = query.filter(models.AIRule.department_id == department_id)
        
    return query.all()

@router.post("", response_model=schemas.AIRuleResponse, status_code=status.HTTP_201_CREATED)
def create_rule(
    rule: schemas.AIRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept or rule.department_id != dept.id:
            raise HTTPException(status_code=403, detail="Can only create rules for your department")

    db_rule = models.AIRule(**rule.model_dump())
    db.add(db_rule)
    db.commit()
    db.refresh(db_rule)
    log_activity(db, current_user.id, "Create AI Rule", f"Created rule: {db_rule.rule_type}", "success", department_id=db_rule.department_id) # type: ignore
    return db_rule

@router.put("/{rule_id}", response_model=schemas.AIRuleResponse)
def update_rule(
    rule_id: int,
    rule_update: schemas.AIRuleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_rule = db.query(models.AIRule).filter(models.AIRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    # Check authorization
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept or db_rule.department_id != dept.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this department's rules")
            
    for key, value in rule_update.model_dump(exclude_unset=True).items():
        setattr(db_rule, key, value)
        
    db.commit()
    db.refresh(db_rule)
    log_activity(db, current_user.id, "Update AI Rule", f"Updated rule: {db_rule.rule_type}", "success", department_id=db_rule.department_id) # type: ignore
    return db_rule

@router.delete("/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_rule = db.query(models.AIRule).filter(models.AIRule.id == rule_id).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    # Check authorization
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if not dept or db_rule.department_id != dept.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this department's rules")
            
    db.delete(db_rule)
    db.commit()
    
    log_activity(db, current_user.id, "Delete AI Rule", f"Deleted rule: {db_rule.rule_type}", "success", department_id=db_rule.department_id) # type: ignore
    
    return {"message": "Rule deleted successfully"}
