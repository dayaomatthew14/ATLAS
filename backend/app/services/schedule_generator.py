from datetime import time
from typing import List
from sqlalchemy.orm import Session
from .. import models
from . import faculty_load

# Lecture slot grids, one per institutional pattern.
#
# The grid decides the load a generated lecture carries, because REG. HOURS are
# the plotted duration times the meetings per week. There used to be a single
# 90-minute grid here, which meant every generated lecture came to 3.00 hrs/week
# -- a figure that matches neither confirmed pattern, so the hours ATLAS
# reported could never agree with the ones a chair computes by hand.
#
# Each grid pairs with a two-meetings-a-week day pair (MW, TTh, FS), so the
# weekly total is the slot length doubled.

# 80 minutes x 2 = 2.67 hrs/week. The pattern for CS and the other colleges;
# 7:30-8:50 MW is the institution's own worked example.
STANDARD_LECTURE_SLOTS = [
    (time(7, 30), time(8, 50)),
    (time(8, 50), time(10, 10)),
    (time(10, 10), time(11, 30)),
    (time(13, 0), time(14, 20)),
    (time(14, 20), time(15, 40)),
    (time(15, 40), time(17, 0)),
    (time(17, 0), time(18, 20)),
]

# 2 hours x 2 = 4.00 hrs/week, the engineering (BSCPE) lecture pattern.
ENGINEERING_LECTURE_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(9, 30), time(11, 30)),
    (time(13, 0), time(15, 0)),
    (time(15, 0), time(17, 0)),
    (time(17, 0), time(19, 0)),
]

# Kept as the standard grid so existing importers of this name keep the
# behaviour they had for non-engineering programmes.
LECTURE_SLOTS = STANDARD_LECTURE_SLOTS

# Laboratories are 2 hours x 2 = 4.00 hrs/week in every college, so one grid
# serves both patterns.
LAB_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(9, 30), time(11, 30)),
    (time(11, 30), time(13, 30)),
    (time(13, 30), time(15, 30)),
    (time(15, 30), time(17, 30)),
    (time(17, 30), time(19, 30))
]

# Which grid produces which weekly pattern. Keyed by the figures in
# faculty_load so the policy is stated once and the grids follow it, rather
# than the two drifting apart.
LECTURE_GRIDS_BY_PATTERN = {
    2.67: STANDARD_LECTURE_SLOTS,
    4.00: ENGINEERING_LECTURE_SLOTS,
}


def lecture_slots_for(curriculum):
    """
    The lecture grid a subject should be plotted on.

    Engineering lectures run 4.00 hrs/week against 2.67 elsewhere. ATLAS has no
    College of Engineering -- its colleges are CVMAS, CBMA, COED and CAST -- so
    the distinction is drawn at programme level, on BSCPE.
    """
    pattern = faculty_load.expected_pattern(faculty_load.curriculum_program_code(curriculum))
    return LECTURE_GRIDS_BY_PATTERN.get(pattern["lecture"], STANDARD_LECTURE_SLOTS)

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
    if not room_id:
        return False
    for s in all_scheds:
        if s.room_id and s.room_id == room_id and s.day_of_week in (day1, day2):
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

def generate_schedules(
    db: Session,
    semester_id: int,
    faculty_ids: List[int],
    department_id: int,
    auto_bump_units: bool = True,
    assign_lab_rooms: bool = True,
):
    """
    Build a term's timetable.

    `assign_lab_rooms` is the caller's answer to "should laboratories be given a
    room?". It never affects lectures: a lecture is always saved with room_id
    NULL, whichever way this is set.

      True  -- a laboratory must land in a free 'lab' or 'computer_lab' room, and
               is left unplaced if none is free. Rooms are checked for clashes.
      False -- laboratories are placed on faculty availability alone and saved
               with room_id NULL, exactly as lectures are. Many laboratories are
               assigned centrally by the Registrar, outside ATLAS; when that is
               how a department works, refusing to schedule the class until
               ATLAS knows the room invents a blocker that does not exist.
    """
    # Purge existing unlocked draft schedules for this semester and faculty scope
    if faculty_ids:
        draft_scheds = db.query(models.Schedule).join(models.Curriculum).filter(
            models.Schedule.semester_id == semester_id,
            models.Schedule.faculty_id.in_(faculty_ids),
            models.Curriculum.department_id == department_id,
            (models.Schedule.status == 'draft') | (models.Schedule.status == None),
            (models.Schedule.is_locked == False) | (models.Schedule.is_locked == None)
        ).all()
        draft_ids = [s.id for s in draft_scheds]
        if draft_ids:
            db.query(models.Schedule).filter(models.Schedule.id.in_(draft_ids)).delete(synchronize_session=False)
            db.commit()

        # Clear unresolved conflicts for the faculty scope
        db.query(models.Conflict).filter(
            models.Conflict.faculty_id.in_(faculty_ids),
            models.Conflict.resolved_at == None
        ).delete(synchronize_session=False)
        db.commit()

    # 1. Fetch Subject Offerings for Department
    subject_offerings = db.query(models.SubjectOffering).join(models.Curriculum).filter(
        models.Curriculum.department_id == department_id,
        models.SubjectOffering.semester_id == semester_id,
        models.SubjectOffering.faculty_id.in_(faculty_ids)
    ).all()

    # 2. Load Faculty and initialize hours used from LOCKED/PUBLISHED schedules only
    faculties = db.query(models.Faculty).filter(models.Faculty.id.in_(faculty_ids)).all()
    faculty_objs = {f.id: f for f in faculties}

    faculty_hours_used = {f.id: 0.0 for f in faculties}
    all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id).all()
    for s in all_schedules:
        if s.faculty_id in faculty_hours_used and s.start_time and s.end_time:
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
    bumped_warnings = []
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

        # Engineering lectures are longer than everyone else's, so the grid is
        # chosen per subject rather than fixed for the whole run.
        lecture_slots = lecture_slots_for(c)

        parts = []
        if has_lec and has_lab:
            parts.append(('lecture', [MW_PAIR, TTH_PAIR, FS_PAIR], lecture_slots))
            parts.append(('lab', [TTH_PAIR, MW_PAIR, FS_PAIR], LAB_SLOTS))
        elif has_lab:
            parts.append(('lab', [TTH_PAIR, MW_PAIR, FS_PAIR], LAB_SLOTS))
        else:
            parts.append(('lecture', [MW_PAIR, TTH_PAIR, FS_PAIR], lecture_slots))

        for part_type, day_pairs_to_try, slots in parts:
            proposed_hours_total = get_duration_hours(slots[0][0], slots[0][1]) * 2

            # Required weekly teaching hours for this term and employment type.
            # This used to read `max_units` -- an integer count of subject units
            # -- and compare it against `faculty_hours_used`, which is a sum of
            # plotted durations. The two were never the same quantity, so an
            # 18-unit cap silently acted as an 18-hour one.
            required_hours = faculty_load.required_teaching_hours(
                getattr(semester, 'term', None), getattr(f_obj, 'type', None)
            )

            projected_hours = faculty_hours_used[pid] + proposed_hours_total

            # Overload is a legitimate state the institution recognises and pays
            # for, so passing the required figure warns rather than refuses. The
            # class is still placed; the chair decides whether to keep it.
            if required_hours is not None and projected_hours > required_hours + 0.005:
                fac_fname = getattr(f_obj, 'first_name', '')
                fac_lname = getattr(f_obj, 'last_name', '')
                fac_name = f"{fac_fname} {fac_lname}".strip() or f"Faculty #{pid}"
                emp_type = "Full-Time"
                current_hrs = faculty_load.round_hours(faculty_hours_used[pid])
                over_by = faculty_load.round_hours(projected_hours - required_hours)
                reason_msg = (
                    f"Overload for {fac_name} ({emp_type}): {current_hrs} + "
                    f"{faculty_load.round_hours(proposed_hours_total)} hrs/week exceeds the "
                    f"{required_hours} hrs/week required load by {over_by} hrs"
                )

                bumped_warnings.append({
                    "faculty_id": pid,
                    "faculty_name": fac_name,
                    "employment_type": emp_type,
                    "current_hours": current_hrs,
                    "required_hours": required_hours,
                    "additional_hours": faculty_load.round_hours(proposed_hours_total),
                    "overload_hours": over_by,
                    "subject_code": c.code,
                    "part_type": part_type,
                    "message": (
                        f"Faculty '{fac_name}' ({emp_type}) goes into overload: {c.code} "
                        f"brings them to {faculty_load.round_hours(projected_hours)} hrs/week "
                        f"against a required {required_hours}."
                    )
                })

                pending_conflicts.append(models.Conflict(
                    faculty_id=pid,
                    curriculum_id=c.id,
                    conflict_type="overload",
                    reason=reason_msg
                ))

            # A Part-Time member has no required figure, only a ceiling they
            # must stay under -- crossing it makes them Full-Time in all but name.
            elif required_hours is None and not faculty_load.is_full_time(getattr(f_obj, 'type', None)):
                if projected_hours >= faculty_load.PART_TIME_CEILING_HOURS:
                    fac_fname = getattr(f_obj, 'first_name', '')
                    fac_lname = getattr(f_obj, 'last_name', '')
                    fac_name = f"{fac_fname} {fac_lname}".strip() or f"Faculty #{pid}"
                    reason_msg = (
                        f"Part-Time ceiling reached for {fac_name}: "
                        f"{faculty_load.round_hours(projected_hours)} hrs/week is at or above the "
                        f"{faculty_load.PART_TIME_CEILING_HOURS} hrs/week a Part-Time member must stay under"
                    )

                    bumped_warnings.append({
                        "faculty_id": pid,
                        "faculty_name": fac_name,
                        "employment_type": "Part-Time",
                        "current_hours": faculty_load.round_hours(faculty_hours_used[pid]),
                        "required_hours": None,
                        "part_time_ceiling_hours": faculty_load.PART_TIME_CEILING_HOURS,
                        "additional_hours": faculty_load.round_hours(proposed_hours_total),
                        "subject_code": c.code,
                        "part_type": part_type,
                        "message": (
                            f"Faculty '{fac_name}' (Part-Time) reaches "
                            f"{faculty_load.round_hours(projected_hours)} hrs/week with {c.code}, at or above "
                            f"the {faculty_load.PART_TIME_CEILING_HOURS} hrs/week Part-Time ceiling."
                        )
                    })

                    pending_conflicts.append(models.Conflict(
                        faculty_id=pid,
                        curriculum_id=c.id,
                        conflict_type="part_time_ceiling",
                        reason=reason_msg
                    ))

            placed = False

            if part_type == 'lecture':
                # Lecture subjects do NOT require or use a room (room_id = NULL)
                for days_pair in day_pairs_to_try:
                    if placed: break
                    day1, day2 = days_pair[0], days_pair[1]

                    for start_t, end_t in slots:
                        if placed: break

                        if is_prof_unavail(pid, day1, day2, start_t, end_t, all_unavails): continue
                        if is_prof_conflict(pid, day1, day2, start_t, end_t, all_schedules): continue

                        sched1 = models.Schedule(
                            semester_id=semester_id,
                            curriculum_id=c.id,
                            faculty_id=pid,
                            room_id=None,
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
                            room_id=None,
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
            else:
                # Laboratory subjects. Whether they get a room is the caller's
                # choice; see the docstring.
                valid_lab_rooms = []
                if assign_lab_rooms:
                    valid_lab_rooms = rooms_by_type.get('lab', []) + rooms_by_type.get('computer_lab', [])
                    if not valid_lab_rooms:
                        reason_msg = f"{c.code} could not be scheduled because no laboratory room was available."
                        conf_rec = models.Conflict(
                            faculty_id=pid,
                            curriculum_id=c.id,
                            conflict_type="no_lab_room_available",
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

                # With rooms off, this runs once with no room and no room-clash
                # check, so a laboratory is placed on faculty availability alone.
                room_candidates = valid_lab_rooms if assign_lab_rooms else [None]

                for days_pair in day_pairs_to_try:
                    if placed: break
                    day1, day2 = days_pair[0], days_pair[1]

                    for start_t, end_t in slots:
                        if placed: break

                        if is_prof_unavail(pid, day1, day2, start_t, end_t, all_unavails): continue
                        if is_prof_conflict(pid, day1, day2, start_t, end_t, all_schedules): continue

                        for room in room_candidates:
                            if room is not None and is_room_conflict(room.id, day1, day2, start_t, end_t, all_schedules): continue
                            room_id = room.id if room is not None else None

                            sched1 = models.Schedule(
                                semester_id=semester_id,
                                curriculum_id=c.id,
                                faculty_id=pid,
                                room_id=room_id,
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
                                room_id=room_id,
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
                # With rooms off there is no room to blame, so a laboratory
                # failed for the same reason a lecture would have.
                if part_type == 'lab' and assign_lab_rooms:
                    reason_msg = f"{c.code} could not be scheduled because no laboratory room was available."
                else:
                    reason_msg = f"{c.code} could not be scheduled due to faculty availability or schedule conflict."
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
        "skipped_gened": skipped_gened,
        "bumped_warnings": bumped_warnings
    }
