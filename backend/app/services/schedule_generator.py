from datetime import time
from sqlalchemy.orm import Session
from .. import models

LECTURE_SLOTS = [
    (time(7, 30), time(8, 50)),
    (time(9, 30), time(10, 50)),
    (time(13, 30), time(14, 50))
]

LAB_SLOTS = [
    (time(8, 50), time(10, 50)),
    (time(10, 50), time(12, 50)),
    (time(14, 50), time(16, 50))
]

MW_PAIR = ['Mon', 'Wed']
TTH_PAIR = ['Tue', 'Thu']
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

def is_section_conflict(section_name, day1, day2, start_t, end_t, all_scheds):
    for s in all_scheds:
        if s.section == section_name and s.day_of_week in (day1, day2):
            if check_overlap(s.start_time, s.end_time, start_t, end_t):
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

    # 4. Generate dynamic sections since sections table/management is removed
    distinct_programs = db.query(models.Curriculum.program_code).distinct().all()
    distinct_programs = [p[0] for p in distinct_programs if p[0]]
    
    all_sections = []
    for prog in distinct_programs:
        for year in ['1', '2', '3', '4']:
            # Create a mock section object
            all_sections.append(type('MockSection', (object,), {
                'name': f"{prog}-{year}",
                'year_level': year,
                'curriculum': prog,
                'department_id': department_id
            })())

    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
        return {"error": "Invalid semester ID"}

    pending_schedules = []
    unplaced = []
    generated_count = 0
    skipped_gened = 0

    def section_has_subject(sec_name, cid):
        for s in all_schedules:
            if s.section == sec_name and s.curriculum_id == cid:
                return True
        return False

    # 5. Process
    for off in subject_offerings:
        pid = off.faculty_id
        f_obj = faculty_objs.get(pid)
        if not f_obj: continue

        c = db.query(models.Curriculum).filter(models.Curriculum.id == off.curriculum_id).first()
        if not c: continue

        # A. Skip GE
        if c.code and c.code.startswith('GE'):
            skipped_gened += 1
            continue

        # Find valid sections that need this subject
        needed_sections = []
        for sec in all_sections:
            if c.year_level == sec.year_level and (str(sec.curriculum) in str(c.program_code or "")):
                if c.semester_term and (c.semester_term.lower() in semester.term.lower() or semester.term.lower() in c.semester_term.lower()):
                    if not section_has_subject(sec.name, c.id):
                        needed_sections.append(sec)
        
        for section in needed_sections:
            # B. Determine pattern
            has_lec = c.type == 'lecture' or c.lec_units > 0
            has_lab = c.type == 'lab' or c.lab_units > 0

            parts = []
            if has_lec and has_lab:
                parts.append(('lecture', MW_PAIR, LECTURE_SLOTS))
                parts.append(('lab', TTH_PAIR, LAB_SLOTS))
            elif has_lab:
                parts.append(('lab', TTH_PAIR, LAB_SLOTS))
            else:
                parts.append(('lecture', MW_PAIR, LECTURE_SLOTS))

            for part_type, days_pair, slots in parts:
                proposed_hours_total = get_duration_hours(slots[0][0], slots[0][1]) * 2

                # Check hours
                if faculty_hours_used[pid] + proposed_hours_total > f_obj.max_units:
                    unplaced.append({
                        "faculty": pid,
                        "subject": c.code,
                        "reason": f"Faculty exceeded max units for {part_type}"
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
                    unplaced.append({
                        "faculty": pid,
                        "subject": c.code,
                        "reason": "No valid rooms found in the campus database"
                    })
                    continue

                placed = False

                for room in valid_rooms:
                    if placed: break

                    for start_t, end_t in slots:
                        day1, day2 = days_pair[0], days_pair[1]

                        if is_room_conflict(room.id, day1, day2, start_t, end_t, all_schedules): continue
                        if is_prof_conflict(pid, day1, day2, start_t, end_t, all_schedules): continue
                        if is_prof_unavail(pid, day1, day2, start_t, end_t, all_unavails): continue
                        if is_section_conflict(section.name, day1, day2, start_t, end_t, all_schedules): continue

                        # F. If all 4 checks pass
                        sched1 = models.Schedule(
                            semester_id=semester_id,
                            curriculum_id=c.id,
                            faculty_id=pid,
                            room_id=room.id,
                            day_of_week=day1,
                            start_time=start_t,
                            end_time=end_t,
                            section=section.name,
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
                            section=section.name,
                            status='draft'
                        )
                        pending_schedules.extend([sched1, sched2])
                        all_schedules.extend([sched1, sched2])

                        faculty_hours_used[pid] += proposed_hours_total
                        generated_count += 2
                        placed = True
                        break

                # G. If no slot works
                if not placed:
                    unplaced.append({
                        "faculty": pid,
                        "subject": c.code,
                        "reason": f"Could not find a conflict-free slot for {part_type} in {section.name}"
                    })

    # 6. Commit
    try:
        if pending_schedules:
            db.add_all(pending_schedules)
            db.commit()
    except Exception as e:
        db.rollback()
        return {"error": str(e)}

    # 7. Return
    return {
        "generated": generated_count,
        "unplaced": unplaced,
        "skipped_gened": skipped_gened
    }
