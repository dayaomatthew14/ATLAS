from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import io
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from .. import models, schemas, database, auth
from .logs import log_activity

router = APIRouter(
    prefix="/api/schedules",
    tags=["Schedules"]
)

@router.get("/", response_model=List[schemas.ScheduleResponse])
def get_schedules(
    skip: int = 0, 
    limit: int = 100, 
    semester_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    faculty_id: Optional[int] = None,
    room_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Schedule).join(models.Subject)
    
    if current_user.role == 'program_chair':
        if not current_user.department:
            return []
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.filter(models.Subject.department_id == dept.id)
        else:
            return []
            
    if semester_id:
        query = query.filter(models.Schedule.semester_id == semester_id)
    if subject_id:
        query = query.filter(models.Schedule.subject_id == subject_id)
    if faculty_id:
        query = query.filter(models.Schedule.faculty_id == faculty_id)
    if room_id:
        query = query.filter(models.Schedule.room_id == room_id)
        
    return query.offset(skip).limit(limit).all()

@router.get("/{schedule_id}", response_model=schemas.ScheduleResponse)
def get_schedule(
    schedule_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
                
    return schedule

@router.post("/", response_model=schemas.ScheduleResponse, status_code=status.HTTP_201_CREATED)
def create_schedule(
    schedule: schemas.ScheduleCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == schedule.subject_id).first()
        if not subject:
             raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only create schedules for your department's subjects")
             
    new_schedule = models.Schedule(**schedule.model_dump())
    db.add(new_schedule)
    db.commit()
    db.refresh(new_schedule)
    return new_schedule

@router.put("/{schedule_id}", response_model=schemas.ScheduleResponse)
def update_schedule(
    schedule_id: int, 
    schedule: schemas.ScheduleUpdate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not db_schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == db_schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to modify this schedule")
                
    update_data = schedule.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_schedule, key, value)
        
    db.commit()
    db.refresh(db_schedule)
    return db_schedule

@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: int, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    db_schedule = db.query(models.Schedule).filter(models.Schedule.id == schedule_id).first()
    if not db_schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")
        
    if current_user.role == 'program_chair':
        subject = db.query(models.Subject).filter(models.Subject.id == db_schedule.subject_id).first()
        if subject:
            dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
            if not dept or (dept.code != current_user.department and dept.name != current_user.department):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this schedule")
                
    db.delete(db_schedule)
    db.commit()
    return None

@router.get("/suggestions")
def get_schedule_suggestions(
    subject_id: int,
    semester_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Returns a list of conflict-free scheduling suggestions for a given subject.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    subject = db.query(models.Subject).filter(models.Subject.id == subject_id).first()
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")
        
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(models.Department.id == subject.department_id).first()
        if not dept or (dept.code != current_user.department and dept.name != current_user.department):
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this subject")

    # If semester_id not provided, try to find active semester
    if not semester_id:
        active_sem = db.query(models.Semester).filter(models.Semester.is_active == True).first()
        if not active_sem:
            return []
        semester_id = active_sem.id

    from datetime import time
    TIMESLOTS = [
        (time(8, 0), time(9, 30)),
        (time(9, 30), time(11, 0)),
        (time(11, 0), time(12, 30)),
        (time(13, 0), time(14, 30)),
        (time(14, 30), time(16, 0)),
        (time(16, 0), time(17, 30)),
    ]
    DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    # Get valid rooms for the subject type
    rooms = db.query(models.Room).all()
    valid_rooms = [r for r in rooms if r.type == subject.type or (r.type == 'computer_lab' and subject.type == 'lab')]

    # Get valid faculties for the subject department
    faculties = db.query(models.Faculty).filter(models.Faculty.department_id == subject.department_id).all()
    valid_faculties = []
    
    # Calculate current units for faculties
    for f in faculties:
        schedules = db.query(models.Schedule).filter(
            models.Schedule.faculty_id == f.id,
            models.Schedule.semester_id == semester_id
        ).all()
        total_units = sum(
            db.query(models.Subject).filter(models.Subject.id == s.subject_id).first().units
            for s in schedules if db.query(models.Subject).filter(models.Subject.id == s.subject_id).first()
        )
        if (total_units + subject.units) <= f.max_units:
            user = db.query(models.User).filter(models.User.id == f.user_id).first()
            if user:
                valid_faculties.append({
                    "faculty": f,
                    "user": user,
                    "load_percentage": (total_units + subject.units) / f.max_units
                })

    suggestions = []
    
    # Limit suggestions to top 5 to keep it fast and relevant
    import random
    random.shuffle(valid_rooms)
    
    # Sort faculties by load percentage (lowest load first)
    valid_faculties.sort(key=lambda x: x["load_percentage"])

    for f_data in valid_faculties[:3]:  # Try top 3 faculties with lowest load
        faculty = f_data["faculty"]
        user = f_data["user"]
        
        for room in valid_rooms[:3]:  # Try a few valid rooms
            for day in DAYS:
                for start_t, end_t in TIMESLOTS:
                    # Check DB schedule overlaps
                    overlap = db.query(models.Schedule).filter(
                        models.Schedule.semester_id == semester_id,
                        models.Schedule.day_of_week == day,
                        models.Schedule.start_time == start_t,
                        models.Schedule.end_time == end_t
                    ).filter(
                        (models.Schedule.room_id == room.id) | 
                        (models.Schedule.faculty_id == faculty.id)
                    ).first()
                    
                    if overlap:
                        continue
                        
                    # Check faculty unavailability
                    blocked = db.query(models.FacultyUnavailability).filter(
                        models.FacultyUnavailability.faculty_id == faculty.id,
                        models.FacultyUnavailability.day_of_week == day,
                        models.FacultyUnavailability.start_time < end_t,
                        models.FacultyUnavailability.end_time > start_t
                    ).first()
                    
                    if blocked:
                        continue
                        
                    # If we reach here, it's a valid slot
                    # Calculate confidence based on faculty load (lower load = higher confidence, min 70%)
                    confidence = int(100 - (f_data["load_percentage"] * 30))
                    
                    suggestions.append({
                        "faculty_id": faculty.id,
                        "faculty_name": f"{user.first_name} {user.last_name}",
                        "room_id": room.id,
                        "room_name": room.name,
                        "day_of_week": day,
                        "start_time": start_t.strftime("%H:%M"),
                        "end_time": end_t.strftime("%H:%M"),
                        "confidence": confidence
                    })
                    
                    if len(suggestions) >= 5:
                        # Sort suggestions by confidence descending
                        suggestions.sort(key=lambda x: x["confidence"], reverse=True)
                        return suggestions

    # Sort suggestions by confidence descending
    suggestions.sort(key=lambda x: x["confidence"], reverse=True)
    return suggestions

@router.get("/export/pdf")
def export_pdf(
    semester_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Export the current department's schedule for a semester to PDF.
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Fetch data
    query = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id)
    
    dept_name = "All Departments"
    if current_user.role == 'program_chair':
        dept = db.query(models.Department).filter(
            (models.Department.code == current_user.department) | 
            (models.Department.name == current_user.department)
        ).first()
        if dept:
            query = query.join(models.Subject).filter(models.Subject.department_id == dept.id)
            dept_name = dept.name
            
    schedules = query.all()
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    elements.append(Paragraph(f"ATLAS: Official Schedule - {dept_name}", styles['Title']))
    elements.append(Paragraph(f"Generated on: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Paragraph("<br/><br/>", styles['Normal']))
    
    # Table Data
    data = [["Subject", "Section", "Faculty", "Room", "Day", "Time"]]
    for s in schedules:
        subject = db.query(models.Subject).filter(models.Subject.id == s.subject_id).first()
        faculty = db.query(models.Faculty).filter(models.Faculty.id == s.faculty_id).first()
        user = db.query(models.User).filter(models.User.id == faculty.user_id).first() if faculty else None
        room = db.query(models.Room).filter(models.Room.id == s.room_id).first()
        
        data.append([
            subject.name if subject else "N/A",
            s.section,
            f"{user.first_name} {user.last_name}" if user else "TBA",
            room.name if room else "N/A",
            s.day_of_week,
            f"{s.start_time.strftime('%I:%M %p')} - {s.end_time.strftime('%I:%M %p')}"
        ])
    
    t = Table(data)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    elements.append(t)
    
    doc.build(elements)
    buffer.seek(0)
    
    log_activity(db, current_user.id, "Export PDF", f"Exported schedule for {dept_name} to PDF")
    
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=schedule_{dept_name.replace(' ', '_')}.pdf"
    })

@router.post("/import/excel")
async def import_excel(
    file: UploadFile = File(...),
    semester_id: int = 1,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Import schedules from an Excel file.
    Expects columns: SubjectCode, FacultyEmail, RoomName, Day, StartTime, EndTime, Section
    """
    if current_user.role not in ['admin', 'program_chair']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")
        
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    
    # Basic validation
    required_cols = ['SubjectCode', 'FacultyEmail', 'RoomName', 'Day', 'StartTime', 'EndTime', 'Section']
    for col in required_cols:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
            
    success_count = 0
    errors = []
    
    for index, row in df.iterrows():
        try:
            # Look up entities
            subject = db.query(models.Subject).filter(models.Subject.code == row['SubjectCode']).first()
            user = db.query(models.User).filter(models.User.email == row['FacultyEmail']).first()
            faculty = db.query(models.Faculty).filter(models.Faculty.user_id == user.id).first() if user else None
            room = db.query(models.Room).filter(models.Room.name == row['RoomName']).first()
            
            if not subject or not faculty or not room:
                errors.append(f"Row {index+2}: Entity not found (Subject: {subject is not None}, Faculty: {faculty is not None}, Room: {room is not None})")
                continue
                
            # Convert times
            start_t = pd.to_datetime(row['StartTime']).time() if isinstance(row['StartTime'], (str, datetime)) else row['StartTime']
            end_t = pd.to_datetime(row['EndTime']).time() if isinstance(row['EndTime'], (str, datetime)) else row['EndTime']
            
            new_sched = models.Schedule(
                semester_id=semester_id,
                subject_id=subject.id,
                faculty_id=faculty.id,
                room_id=room.id,
                day_of_week=row['Day'],
                start_time=start_t,
                end_time=end_t,
                section=row['Section'],
                status='draft'
            )
            db.add(new_sched)
            success_count += 1
        except Exception as e:
            errors.append(f"Row {index+2}: {str(e)}")
            
    db.commit()
    
    log_activity(db, current_user.id, "Import Excel", f"Imported {success_count} schedules from Excel. Errors: {len(errors)}")
    
    return {
        "message": f"Successfully imported {success_count} schedules",
        "errors": errors
    }
