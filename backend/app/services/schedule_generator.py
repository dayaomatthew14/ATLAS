from datetime import time
from sqlalchemy.orm import Session
from .. import models

# Expanded time slots for maximum scheduling flexibility
LECTURE_SLOTS = [
    (time(7, 30), time(9, 0)),
    (time(9, 0), time(10, 30)),
    (time(10, 30), time(12, 0)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
    (time(17, 30), time(19, 0))
]

LAB_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(9, 30), time(11, 30)),
    (time(11, 30), time(13, 30)),
    (time(13, 30), time(15, 30)),
    (time(15, 30), time(17, 30)),
    (time(17, 30), time(19, 30))
]

MW_PAIR = ['Mon', 'Wed']
TTH_PAIR = ['Tue', 'Thu']
FS_PAIR = ['Fri', 'Sat']
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
TIMESLOTS = [
    (time(8, 0), time(9, 30)),
    (time(9, 30), time(11, 0)),
    (time(11, 0), time(12, 30)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]

def get_duration_hours(start_t: time, end_t: time) -> float:
    return (end_t.hour * 60 + end_t.minute - start_t.hour * 60 - start_t.minute) / 60.0

def check_overlap(s1_start: time, s1_end: time, s2_start: time, s2_end: time) -> bool:
    return s1_start < s2_end and s1_end > s2_start

def is_room_conflict(room_id, day1, day2, start_t, end_t, all_scheds):
    for s in all_scheds:
        if s.room_id == room_id and s.day_of_week in (day1, day2):
            if check_overlap(s.start_time, s.end_time, start_t, end_t):
                return True
    return False

def is_prof_conflict(faculty_id, day1, day2, start_t, end_t, all_scheds):
    for s in all_scheds:
        if s.faculty_id == faculty_id and s.day_of_week in (day1, day2):
            if check_overlap(s.start_time, s.end_time, start_t, end_t):
                return True
    return False

def is_prof_unavail(faculty_id, day1, day2, start_t, end_t, all_unavails):
    for u in all_unavails:
        if u.faculty_id == faculty_id and u.day_of_week in (day1, day2):
            if check_overlap(u.start_time, u.end_time, start_t, end_t):
                return True
    return False

def generate_schedules(db: Session, semester_id: int, department_id: int, faculty_ids: list[int]):
    # 1. Load SubjectOfferings for selected faculties
    subject_offerings = db.query(models.SubjectOffering).filter(
        models.SubjectOffering.semester_id == semester_id,
        models.SubjectOffering.faculty_id.in_(faculty_ids)
    ).all()

    # 2. Load Faculty and initialize hours used
    faculties = db.query(models.Faculty).filter(models.Faculty.id.in_(faculty_ids)).all()
    faculty_objs = {f.id: f for f in faculties}

    faculty_hours_used = {f.id: 0.0 for f in faculties}
    all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id).all()
    for s in all_schedules:
        if s.faculty_id in faculty_hours_used:
            faculty_hours_used[s.faculty_id] += get_duration_hours(s.start_time, s.end_time) # type: ignore

    # Load unavailabilities
    all_unavails = db.query(models.FacultyUnavailability).filter(models.FacultyUnavailability.faculty_id.in_(faculty_ids)).all()

    # 3. Load Rooms grouped by type
    rooms = db.query(models.Room).all()
    rooms_by_type = {}
    for r in rooms:
        if r.type not in rooms_by_type:
            rooms_by_type[r.type] = []
        rooms_by_type[r.type].append(r)

    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
        return {"error": "Invalid semester ID"}

    pending_schedules = []
    pending_conflicts = []
    unplaced = []
    generated_count = 0
    skipped_gened = 0

    # Track which (faculty_id, curriculum_id) pairings are already scheduled
    scheduled_offerings = set()
    for s in all_schedules:
        if s.faculty_id and s.curriculum_id:
            scheduled_offerings.add((s.faculty_id, s.curriculum_id))

    # 4. Process each subject offering directly (No sections required)
    for off in subject_offerings:
        pid = off.faculty_id
        f_obj = faculty_objs.get(pid)
        if not f_obj: continue

        c = db.query(models.Curriculum).filter(models.Curriculum.id == off.curriculum_id).first()
        if not c: continue

        # Skip GE subjects if configured to skip GE in this batch
        if c.code and c.code.startswith('GE'):
            skipped_gened += 1
            continue

        # Skip if offering for this faculty and curriculum is already scheduled
        if (pid, c.id) in scheduled_offerings:
            continue

        # Determine parts to schedule
        has_lec = c.type == 'lecture' or c.lec_units > 0
        has_lab = c.type == 'lab' or c.lab_units > 0

        parts = []
        if has_lec and has_lab:
            parts.append(('lecture', [MW_PAIR, TTH_PAIR, FS_PAIR], LECTURE_SLOTS))
            parts.append(('lab', [TTH_PAIR, MW_PAIR, FS_PAIR], LAB_SLOTS))
        elif has_lab:
            parts.append(('lab', [TTH_PAIR, MW_PAIR, FS_PAIR], LAB_SLOTS))
        else:
            parts.append(('lecture', [MW_PAIR, TTH_PAIR, FS_PAIR], LECTURE_SLOTS))

        for part_type, day_pairs_to_try, slots in parts:
            proposed_hours_total = get_duration_hours(slots[0][0], slots[0][1]) * 2
            max_allowed = f_obj.max_units if f_obj.max_units and f_obj.max_units > 0 else 24.0

            # Check professor max workload hours/units
            if faculty_hours_used[pid] + proposed_hours_total > max_allowed:
                reason_msg = f"Faculty max units limit ({max_allowed} hrs) exceeded for {part_type}"
                conf_rec = models.Conflict(
                    faculty_id=pid,
                    curriculum_id=c.id,
                    conflict_type="max_units_exceeded",
                    reason=reason_msg
                )
                pending_conflicts.append(conf_rec)

                unplaced.append({
                    "faculty": pid,
                    "curriculum_id": c.id,
                    "subject": c.code,
                    "part_type": part_type,
                    "reason": reason_msg
                })
                continue

            valid_rooms = []
            if part_type == 'lab':
                valid_rooms = rooms_by_type.get('lab', []) + rooms_by_type.get('computer_lab', [])
            else:
                valid_rooms = rooms_by_type.get('lecture', [])

            # Fallback to any room if no rooms of the specific type are registered
            if not valid_rooms:
                valid_rooms = rooms

            if not valid_rooms:
                reason_msg = "No valid rooms found in the campus database"
                conf_rec = models.Conflict(
                    faculty_id=pid,
                    curriculum_id=c.id,
                    conflict_type="no_rooms_available",
                    reason=reason_msg
                )
                pending_conflicts.append(conf_rec)

                unplaced.append({
                    "faculty": pid,
                    "curriculum_id": c.id,
                    "subject": c.code,
                    "part_type": part_type,
                    "reason": reason_msg
                })
                continue

            placed = False

            for days_pair in day_pairs_to_try:
                if placed: break
                day1, day2 = days_pair[0], days_pair[1]

                for start_t, end_t in slots:
                    if placed: break

                    if is_prof_unavail(pid, day1, day2, start_t, end_t, all_unavails): continue
                    if is_prof_conflict(pid, day1, day2, start_t, end_t, all_schedules): continue

                    for room in valid_rooms:
                        if is_room_conflict(room.id, day1, day2, start_t, end_t, all_schedules): continue

                        sched1 = models.Schedule(
                            semester_id=semester_id,
                            curriculum_id=c.id,
                            faculty_id=pid,
                            room_id=room.id,
                            day_of_week=day1,
                            start_time=start_t,
                            end_time=end_t,
                            section="",
                            status='draft'
                        )
                        sched2 = models.Schedule(
                            semester_id=semester_id,
                            curriculum_id=c.id,
                            faculty_id=pid,
                            room_id=room.id,
                            day_of_week=day2,
                            start_time=start_t,
                            end_time=end_t,
                            section="",
                            status='draft'
                        )
                        pending_schedules.extend([sched1, sched2])
                        all_schedules.extend([sched1, sched2])
                        scheduled_offerings.add((pid, c.id))

                        faculty_hours_used[pid] += proposed_hours_total
                        generated_count += 2
                        placed = True
                        break

            if not placed:
                reason_msg = f"Could not find a conflict-free slot for {part_type} (faculty availability or room conflict)"
                conf_rec = models.Conflict(
                    faculty_id=pid,
                    curriculum_id=c.id,
                    conflict_type=f"unplaced_{part_type}",
                    reason=reason_msg
                )
                pending_conflicts.append(conf_rec)

                unplaced.append({
                    "faculty": pid,
                    "curriculum_id": c.id,
                    "subject": c.code,
                    "part_type": part_type,
                    "reason": reason_msg
                })

    # Commit schedules and conflict records
    try:
        if pending_schedules:
            db.add_all(pending_schedules)
        if pending_conflicts:
            db.add_all(pending_conflicts)
        if pending_schedules or pending_conflicts:
            db.commit()

        # Attach conflict IDs after commit
        for item in unplaced:
            for conf in pending_conflicts:
                if conf.faculty_id == item.get("faculty") and conf.curriculum_id == item.get("curriculum_id"):
                    item["conflict_id"] = conf.id
                    break

    except Exception as e:
        db.rollback()
        return {"error": str(e)}

    return {
        "generated": generated_count,
        "unplaced": unplaced,
        "skipped_gened": skipped_gened
    }
