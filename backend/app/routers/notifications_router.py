from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, database, auth, notifications
from .logs import log_activity

router = APIRouter(
    prefix="/api/notifications",
    tags=["Notifications"]
)

@router.post("/notify-faculty")
def notify_faculty(
    semester_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """
    Send schedule notifications to all faculty members of the department.
    """
    if current_user.role not in ['admin', 'program_chair', 'coordinator']:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    # Find department
    dept = db.query(models.Department).filter(
        (models.Department.code == current_user.department) | 
        (models.Department.name == current_user.department)
    ).first()
    
    if not dept:
        raise HTTPException(status_code=400, detail="Department not found")

    # Get all faculty in this department
    faculties = db.query(models.Faculty).filter(models.Faculty.department_id == dept.id).all()
    
    sent_count = 0
    skipped_no_contact = 0
    for faculty in faculties:
        # Faculty records carry their own email/contact_number; there is no link
        # to a User row (Faculty has no user_id column), so read them directly.
        if not faculty.email:
            skipped_no_contact += 1
            continue


        # Get their schedule
        schedules = db.query(models.Schedule).filter(
            models.Schedule.semester_id == semester_id,
            models.Schedule.faculty_id == faculty.id
        ).all()
        
        if not schedules:
            continue
            
        # Format schedule for email
        schedule_text = "Your schedule for the upcoming semester:\n\n"
        for s in schedules:
            curriculum_item = db.query(models.Curriculum).filter(models.Curriculum.id == s.curriculum_id).first()
            room = db.query(models.Room).filter(models.Room.id == s.room_id).first()
            schedule_text += f"- {curriculum_item.name if curriculum_item else 'N/A'} ({s.section}): {s.day_of_week} {s.start_time.strftime('%I:%M %p')} - {s.end_time.strftime('%I:%M %p')} @ {room.name if room else 'N/A'}\n"
            
        # Send email
        success_email = notifications.send_email_notification(
            str(faculty.email),
            "ATLAS - Your Academic Schedule",
            f"Hello {faculty.first_name},\n\n{schedule_text}\n\nBest regards,\nATLAS Team"
        )

        # Send SMS if contact number exists
        success_sms = False
        if faculty.contact_number:
            sms_text = f"ATLAS: Hello {faculty.first_name}, your schedule for the upcoming semester has been generated. Please check your email for details."
            success_sms = notifications.send_textbee_notification(str(faculty.contact_number), sms_text)

        if success_email or success_sms:
            sent_count += 1

    log_activity(db, current_user.id, "Notify Faculty", f"Sent schedule notifications to {sent_count} faculty members in {dept.name}")

    return {
        "message": f"Notifications sent to {sent_count} faculty members",
        "sent_count": sent_count,
        "skipped_no_contact": skipped_no_contact
    }
