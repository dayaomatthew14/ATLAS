from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user

router = APIRouter(
    prefix="/api/subject-offerings",
    tags=["Subject Offerings"]
)

class SubjectOfferingExtendedResponse(schemas.SubjectOfferingResponse):
    faculty_name: str
    subject_code: str
    subject_name: str

    class Config:
        from_attributes = True

@router.get("", response_model=List[SubjectOfferingExtendedResponse])
def get_subject_offerings(
    semester_id: int = Query(...),
    department_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    query = db.query(
        models.SubjectOffering,
        models.Faculty.first_name,
        models.Faculty.last_name,
        models.Curriculum.code.label('subject_code'),
        models.Curriculum.name.label('subject_name')
    ).join(
        models.Faculty, models.SubjectOffering.faculty_id == models.Faculty.id
    ).join(
        models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id
    ).join(
        models.Department, models.Curriculum.department_id == models.Department.id
    ).filter(
        models.SubjectOffering.semester_id == semester_id
    )

    if current_user.role in ['program_chair', 'coordinator']:
        query = query.filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        )
    elif department_id:
        query = query.filter(models.Curriculum.department_id == department_id)

    results = query.all()

    response = []
    for offering, fname, lname, scode, sname in results:
        response.append({
            "id": offering.id,
            "faculty_id": offering.faculty_id,
            "curriculum_id": offering.curriculum_id,
            "semester_id": offering.semester_id,
            "assigned_by": offering.assigned_by,
            "created_at": offering.created_at,
            "faculty_name": f"{fname} {lname}",
            "subject_code": scode,
            "subject_name": sname
        })
    return response

@router.post("", response_model=schemas.SubjectOfferingResponse)
def create_subject_offering(
    offering: schemas.SubjectOfferingCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Check for duplicates
    existing = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.faculty_id == offering.faculty_id,
        models.SubjectOffering.curriculum_id == offering.curriculum_id,
        models.SubjectOffering.semester_id == offering.semester_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Subject offering already exists")

    curriculum = db.query(models.Curriculum).filter(models.Curriculum.id == offering.curriculum_id).first()
    if not curriculum:
        raise HTTPException(status_code=404, detail="Curriculum subject not found")

    new_offering = models.SubjectOffering(
        faculty_id=offering.faculty_id,
        curriculum_id=offering.curriculum_id,
        semester_id=offering.semester_id,
        assigned_by=current_user.id
    )
    db.add(new_offering)
    db.commit()
    db.refresh(new_offering)
    return new_offering

@router.delete("/{id}")
def delete_subject_offering(
    id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role not in ['program_chair', 'coordinator', 'admin']:
        raise HTTPException(status_code=403, detail="Not authorized")

    offering = db.query(models.SubjectOffering).filter(models.SubjectOffering.id == id).first()
    if not offering:
        raise HTTPException(status_code=404, detail="Subject offering not found")

    db.delete(offering)
    db.commit()
    return {"message": "Subject offering deleted successfully"}
