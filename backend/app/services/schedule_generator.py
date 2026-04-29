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
    curriculum_items = db.query(models.Curriculum).filter(models.Curriculum.department_id == department_id).all()
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

    for curriculum_item in curriculum_items:
        # Match type
        valid_rooms = [r for r in rooms if r.type == curriculum_item.type or (r.type == 'computer_lab' and curriculum_item.type == 'lab')]
        
        if not valid_rooms:
            unresolved_conflicts.append({
                "curriculum_id": curriculum_item.id,
                "reason": f"No valid rooms found for type {curriculum_item.type}"
            })
            continue
            
        # Find faculty with available units
        valid_faculty = [f for f in faculties if (faculty_units[f.id] + curriculum_item.units) <= f.max_units]
        
        if not valid_faculty:
            unresolved_conflicts.append({
                "curriculum_id": curriculum_item.id,
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
                                curriculum_id=curriculum_item.id,
                                faculty_id=faculty.id,
                                room_id=room.id,
                                day_of_week=day,
                                start_time=start_t,
                                end_time=end_t,
                                section=f"A1", # Simplification
                                status='draft'
                            )
                            generated_schedules.append(new_sched)
                            faculty_units[faculty.id] += curriculum_item.units
                            placed = True
                            break
                            
        if not placed:
            unresolved_conflicts.append({
                "curriculum_id": curriculum_item.id,
                "reason": "Could not find a conflict-free time slot with available resources"
            })
            
    # Save successful generations
    db.add_all(generated_schedules)
    db.commit()

    # Save unresolvable placement failures to SystemLog as warnings.
    # The Conflict table requires two schedule IDs (for schedule-vs-schedule conflicts),
    # so unplaceable curriculum items are tracked in SystemLog where they surface in the Logs UI.
    for c in unresolved_conflicts:
        curriculum_item = db.query(models.Curriculum).filter(models.Curriculum.id == c["curriculum_id"]).first()
        curriculum_label = f"{curriculum_item.code} — {curriculum_item.name}" if curriculum_item else f"Curriculum ID {c['curriculum_id']}"
        db.add(models.SystemLog(
            user_id=None,
            action="Schedule Generation — Placement Failure",
            details=f"Could not place '{curriculum_label}': {c['reason']}",
            status='warning'
        ))
    
    if unresolved_conflicts:
        db.commit()

    return {
        "generated": len(generated_schedules),
        "conflicts": unresolved_conflicts
    }
