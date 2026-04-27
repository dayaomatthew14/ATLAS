import random
from datetime import time, datetime, timezone
from sqlalchemy.orm import Session
from .. import models

# predefined 1.5 hr slots
TIMESLOTS = [
    (time(8, 0), time(9, 30)),
    (time(9, 30), time(11, 0)),
    (time(11, 0), time(12, 30)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]

DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

def generate_schedules(db: Session, semester_id: int, department_id: int):
    # 1. Fetch data
    subjects = db.query(models.Subject).filter(models.Subject.department_id == department_id).all()
    faculties = db.query(models.Faculty).filter(models.Faculty.department_id == department_id).all()
    rooms = db.query(models.Room).all()
    
    # Track assigned units locally for this generation run
    faculty_units = {f.id: 0 for f in faculties}
    
    generated_schedules = []
    unresolved_conflicts = []
    
    # Helper to check overlaps in current generation pool and DB
    def is_overlap(day, start_t, end_t, room_id, faculty_id):
        # Check against already-generated schedules this run
        for s in generated_schedules:
            if s.day_of_week == day:
                if s.start_time == start_t and s.end_time == end_t:
                    if s.room_id == room_id or s.faculty_id == faculty_id:
                        return True
                         
        # Check existing DB schedules for the semester
        existing = db.query(models.Schedule).filter(
            models.Schedule.semester_id == semester_id,
            models.Schedule.day_of_week == day,
            models.Schedule.start_time == start_t,
            models.Schedule.end_time == end_t
        ).filter(
            (models.Schedule.room_id == room_id) | 
            (models.Schedule.faculty_id == faculty_id)
        ).first()
        
        if existing:
            return True

        # Check faculty unavailability blocks — respect blocked time windows
        # A proposed (start_t, end_t) overlaps a block if: start_t < block.end_time AND end_t > block.start_time
        blocked = db.query(models.FacultyUnavailability).filter(
            models.FacultyUnavailability.faculty_id == faculty_id,
            models.FacultyUnavailability.day_of_week == day,
            models.FacultyUnavailability.start_time < end_t,
            models.FacultyUnavailability.end_time > start_t
        ).first()

        if blocked:
            return True

        return False

    for subject in subjects:
        # Match type
        valid_rooms = [r for r in rooms if r.type == subject.type or (r.type == 'computer_lab' and subject.type == 'lab')]
        
        if not valid_rooms:
            unresolved_conflicts.append({
                "subject_id": subject.id,
                "reason": f"No valid rooms found for type {subject.type}"
            })
            continue
            
        # Find faculty with available units
        valid_faculty = [f for f in faculties if (faculty_units[f.id] + subject.units) <= f.max_units]
        
        if not valid_faculty:
            unresolved_conflicts.append({
                "subject_id": subject.id,
                "reason": "No faculty available with sufficient units"
            })
            continue
            
        # Shuffle to randomize
        random.shuffle(valid_rooms)
        random.shuffle(valid_faculty)
        random.shuffle(DAYS)
        
        placed = False
        
        # Try finding a slot
        for faculty in valid_faculty:
            if placed: break
            for room in valid_rooms:
                if placed: break
                for day in DAYS:
                    if placed: break
                    for start_t, end_t in TIMESLOTS:
                        if not is_overlap(day, start_t, end_t, room.id, faculty.id):
                            # Place it
                            new_sched = models.Schedule(
                                semester_id=semester_id,
                                subject_id=subject.id,
                                faculty_id=faculty.id,
                                room_id=room.id,
                                day_of_week=day,
                                start_time=start_t,
                                end_time=end_t,
                                section=f"A1", # Simplification
                                status='draft'
                            )
                            generated_schedules.append(new_sched)
                            faculty_units[faculty.id] += subject.units
                            placed = True
                            break
                            
        if not placed:
            unresolved_conflicts.append({
                "subject_id": subject.id,
                "reason": "Could not find a conflict-free time slot with available resources"
            })
            
    # Save successful generations
    db.add_all(generated_schedules)
    db.commit()

    # Save unresolvable placement failures to SystemLog as warnings.
    # The Conflict table requires two schedule IDs (for schedule-vs-schedule conflicts),
    # so unplaceable subjects are tracked in SystemLog where they surface in the Logs UI.
    for c in unresolved_conflicts:
        subject = db.query(models.Subject).filter(models.Subject.id == c["subject_id"]).first()
        subject_label = f"{subject.code} — {subject.name}" if subject else f"Subject ID {c['subject_id']}"
        db.add(models.SystemLog(
            user_id=None,
            action="Schedule Generation — Placement Failure",
            details=f"Could not place '{subject_label}': {c['reason']}",
            status='warning'
        ))
    
    if unresolved_conflicts:
        db.commit()

    return {
        "generated": len(generated_schedules),
        "conflicts": unresolved_conflicts
    }
