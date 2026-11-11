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

def _assert_department_rule_access(
    db: Session,
    current_user: models.User,
    rule_department_id: Optional[int],
    detail: str,
) -> None:
    """Enforce department scoping for deans and program chairs modifying AI rules."""
    if current_user.role in ('dean', 'program_chair'):
        dept = auth.resolve_user_department(db, current_user)
        if not dept or rule_department_id != dept.id:
            raise HTTPException(status_code=403, detail=detail)


@router.get("", response_model=List[schemas.AIRuleResponse])
def get_rules(
    department_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    auth.require_roles(current_user, ('admin', 'dean', 'program_chair'))

    query = db.query(models.AIRule)

    if current_user.role in ('dean', 'program_chair'):
        dept = auth.resolve_user_department(db, current_user)
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
    _assert_department_rule_access(db, current_user, rule.department_id, "Can only create rules for your department")

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

    _assert_department_rule_access(
        db, current_user, db_rule.department_id, "Not authorized to update this department's rules"  # type: ignore
    )

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

    _assert_department_rule_access(
        db, current_user, db_rule.department_id, "Not authorized to delete this department's rules"  # type: ignore
    )
            
    db.delete(db_rule)
    db.commit()
    
    log_activity(db, current_user.id, "Delete AI Rule", f"Deleted rule: {db_rule.rule_type}", "success", department_id=db_rule.department_id) # type: ignore
    
    return {"message": "Rule deleted successfully"}
