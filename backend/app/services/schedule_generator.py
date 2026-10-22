import re
from datetime import time
from typing import List, Dict, Any, Optional, Tuple, Set, cast
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


def _calculate_workload_warnings(
    semester: models.Semester,
    f_obj: models.Faculty,
    pid: Any,
    c: models.Curriculum,
    part_type: str,
    proposed_hours_total: float,
    current_hours: float
) -> Tuple[Optional[Dict[str, Any]], Optional[models.Conflict]]:
    """
    Evaluate teaching workload for full-time overload or part-time ceiling.
    Returns (warning_dict, conflict_model) if a threshold is exceeded, else (None, None).
    """
    required_hours = faculty_load.required_teaching_hours(
        getattr(semester, 'term', None), getattr(f_obj, 'type', None)
    )
    projected_hours = current_hours + proposed_hours_total

    # Overload is a legitimate state the institution recognises and pays
    # for, so passing the required figure warns rather than refuses. The
    # class is still placed; the chair decides whether to keep it.
    if required_hours is not None and projected_hours > required_hours + 0.005:
        fac_fname = getattr(f_obj, 'first_name', '')
        fac_lname = getattr(f_obj, 'last_name', '')
        fac_name = f"{fac_fname} {fac_lname}".strip() or f"Faculty #{pid}"
        emp_type = "Full-Time"
        current_hrs = faculty_load.round_hours(current_hours)
        over_by = faculty_load.round_hours(projected_hours - required_hours)
        reason_msg = (
            f"Overload for {fac_name} ({emp_type}): {current_hrs} + "
            f"{faculty_load.round_hours(proposed_hours_total)} hrs/week exceeds the "
            f"{required_hours} hrs/week required load by {over_by} hrs"
        )

        warning = {
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
        }
        conflict = models.Conflict(
            faculty_id=pid,
            curriculum_id=c.id,
            conflict_type="overload",
            reason=reason_msg
        )
        return warning, conflict

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

            warning = {
                "faculty_id": pid,
                "faculty_name": fac_name,
                "employment_type": "Part-Time",
                "current_hours": faculty_load.round_hours(current_hours),
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
            }
            conflict = models.Conflict(
                faculty_id=pid,
                curriculum_id=c.id,
                conflict_type="part_time_ceiling",
                reason=reason_msg
            )
            return warning, conflict

    return None, None


def _place_lecture_slot(
    semester_id: int,
    curriculum_id: Any,
    faculty_id: Any,
    day_pairs_to_try: List[List[str]],
    slots: List[Tuple[time, time]],
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
) -> Optional[Tuple[models.Schedule, models.Schedule]]:
    """
    Attempt to find an unconflicted day-pair and timeslot for a lecture.
    Lectures do not assign rooms (room_id=None).
    """
    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for start_t, end_t in slots:
            if is_prof_unavail(faculty_id, day1, day2, start_t, end_t, all_unavails):
                continue
            if is_prof_conflict(faculty_id, day1, day2, start_t, end_t, all_schedules):
                continue

            sched1 = models.Schedule(
                semester_id=semester_id,
                curriculum_id=curriculum_id,
                faculty_id=faculty_id,
                room_id=None,
                day_of_week=day1,
                start_time=start_t,
                end_time=end_t,
                section="",
                status='draft'
            )
            sched2 = models.Schedule(
                semester_id=semester_id,
                curriculum_id=curriculum_id,
                faculty_id=faculty_id,
                room_id=None,
                day_of_week=day2,
                start_time=start_t,
                end_time=end_t,
                section="",
                status='draft'
            )
            return sched1, sched2
    return None


def _place_lab_slot(
    semester_id: int,
    curriculum_id: Any,
    faculty_id: Any,
    day_pairs_to_try: List[List[str]],
    slots: List[Tuple[time, time]],
    rooms_by_type: Dict[str, List[models.Room]],
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
) -> Optional[Tuple[models.Schedule, models.Schedule]]:
    """
    Attempt to place a lab slot. Tries available lab/computer_lab rooms first,
    falling back to unassigned room (room_id=None) if no lab rooms are free.
    """
    lab_rooms = rooms_by_type.get('lab', []) + rooms_by_type.get('computer_lab', [])
    room_passes = ([lab_rooms] if lab_rooms else []) + [[None]]

    for room_candidates in room_passes:
        for days_pair in day_pairs_to_try:
            day1, day2 = days_pair[0], days_pair[1]
            for start_t, end_t in slots:
                if is_prof_unavail(faculty_id, day1, day2, start_t, end_t, all_unavails):
                    continue
                if is_prof_conflict(faculty_id, day1, day2, start_t, end_t, all_schedules):
                    continue

                for room in room_candidates:
                    if room is not None and is_room_conflict(room.id, day1, day2, start_t, end_t, all_schedules):
                        continue
                    room_id = room.id if room is not None else None

                    sched1 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=curriculum_id,
                        faculty_id=faculty_id,
                        room_id=room_id,
                        day_of_week=day1,
                        start_time=start_t,
                        end_time=end_t,
                        section="",
                        status='draft'
                    )
                    sched2 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=curriculum_id,
                        faculty_id=faculty_id,
                        room_id=room_id,
                        day_of_week=day2,
                        start_time=start_t,
                        end_time=end_t,
                        section="",
                        status='draft'
                    )
                    return sched1, sched2
    return None



def get_base_code(code: Optional[str]) -> str:
    if not code:
        return ""
    m = re.match(r"^(.*?)[_\-\s]*(?:A/B|[AB])$", code.strip(), re.IGNORECASE)
    if m:
        return m.group(1).strip().upper()
    return code.strip().upper()


def _place_consecutive_lec_lab_slot(
    semester_id: int,
    lec_curriculum_id: Any,
    lab_curriculum_id: Any,
    faculty_id: Any,
    day_pairs_to_try: List[List[str]],
    lecture_slots: List[Tuple[time, time]],
    lab_slots: List[Tuple[time, time]],
    rooms_by_type: Dict[str, List[models.Room]],
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
) -> Optional[Tuple[models.Schedule, models.Schedule, models.Schedule, models.Schedule]]:
    """
    Attempt to place a consecutive lecture and laboratory session on the same day pair.
    Requirements:
    1. Lecture scheduled first, followed by laboratory on the same day (lec_end <= lab_start).
    2. Optional time gap between them is permitted and prioritized by minimal gap.
    3. Neither session overlaps with the other or any existing scheduled class/unavailability.
    4. Laboratory session attempts available lab/computer_lab rooms first, falling back to None (TBA).
       Lecture session does not assign a room (room_id=None).
    """
    candidate_pairs = []
    for l_start, l_end in lecture_slots:
        for b_start, b_end in lab_slots:
            if l_end <= b_start:
                gap = (b_start.hour * 60 + b_start.minute) - (l_end.hour * 60 + l_end.minute)
                candidate_pairs.append((l_start, l_end, b_start, b_end, gap))

    # Sort by lecture start time, then minimal gap to maintain natural chronological sequence
    candidate_pairs.sort(key=lambda x: (x[0], x[4]))

    lab_rooms = rooms_by_type.get('lab', []) + rooms_by_type.get('computer_lab', [])
    room_passes = ([lab_rooms] if lab_rooms else []) + [[None]]

    for room_candidates in room_passes:
        for days_pair in day_pairs_to_try:
            day1, day2 = days_pair[0], days_pair[1]
            for l_start, l_end, b_start, b_end, _gap in candidate_pairs:
                if is_prof_unavail(faculty_id, day1, day2, l_start, l_end, all_unavails):
                    continue
                if is_prof_unavail(faculty_id, day1, day2, b_start, b_end, all_unavails):
                    continue

                if is_prof_conflict(faculty_id, day1, day2, l_start, l_end, all_schedules):
                    continue
                if is_prof_conflict(faculty_id, day1, day2, b_start, b_end, all_schedules):
                    continue

                for room in room_candidates:
                    if room is not None and is_room_conflict(room.id, day1, day2, b_start, b_end, all_schedules):
                        continue
                    room_id = room.id if room is not None else None

                    lec_sched1 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=lec_curriculum_id,
                        faculty_id=faculty_id,
                        room_id=None,
                        day_of_week=day1,
                        start_time=l_start,
                        end_time=l_end,
                        section="",
                        status='draft'
                    )
                    lec_sched2 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=lec_curriculum_id,
                        faculty_id=faculty_id,
                        room_id=None,
                        day_of_week=day2,
                        start_time=l_start,
                        end_time=l_end,
                        section="",
                        status='draft'
                    )

                    lab_sched1 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=lab_curriculum_id,
                        faculty_id=faculty_id,
                        room_id=room_id,
                        day_of_week=day1,
                        start_time=b_start,
                        end_time=b_end,
                        section="",
                        status='draft'
                    )
                    lab_sched2 = models.Schedule(
                        semester_id=semester_id,
                        curriculum_id=lab_curriculum_id,
                        faculty_id=faculty_id,
                        room_id=room_id,
                        day_of_week=day2,
                        start_time=b_start,
                        end_time=b_end,
                        section="",
                        status='draft'
                    )

                    return lec_sched1, lec_sched2, lab_sched1, lab_sched2

    return None


def generate_schedules(
    db: Session,
    semester_id: int,
    faculty_ids: List[int],
    department_id: int,
    auto_bump_units: bool = True,
) -> Dict[str, Any]:
    """
    Build a term's timetable.

    Rooms are best-effort, never a requirement.

    What this system owes its users is a professor timetable with no faculty or
    section clashes; that is what gets exported and submitted, and the Registrar
    assigns rooms from there. So a laboratory is given a free 'lab' or
    'computer_lab' room where one exists, and placed without one where it does
    not. A lecture is never given a room at all.

    This used to be a caller's choice, surfaced as a checkbox on the Generate
    dialog. It defaulted to requiring rooms, which meant a college whose
    laboratories are assigned centrally -- and some are -- had classes refused
    over a column ATLAS does not own. Because the checkbox reset every run and
    was set per person, two chairs in the same college could also get different
    timetables from the same data. A blank room now simply means the Registrar
    assigns that one.
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
    faculty_objs: Dict[int, models.Faculty] = {cast(int, f.id): f for f in faculties}

    faculty_hours_used: Dict[int, float] = {cast(int, f.id): 0.0 for f in faculties}
    all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id).all()
    for s in all_schedules:
        s_fid = cast(Optional[int], s.faculty_id)
        if s_fid is not None and s_fid in faculty_hours_used and s.start_time and s.end_time:
            faculty_hours_used[s_fid] += get_duration_hours(s.start_time, s.end_time) # type: ignore

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
    scheduled_offerings: Set[Tuple[int, Any]] = set()
    for s in all_schedules:
        if s.faculty_id and s.curriculum_id:
            scheduled_offerings.add((cast(int, s.faculty_id), s.curriculum_id))

    # 4. Group and process subject offerings for each faculty member
    offerings_by_faculty: Dict[int, List[models.SubjectOffering]] = {}
    for off in subject_offerings:
        if off.faculty_id is None:
            continue
        pid = cast(int, off.faculty_id)
        if pid not in faculty_objs:
            continue
        c = db.query(models.Curriculum).filter(models.Curriculum.id == off.curriculum_id).first()
        if not c:
            continue
        if c.code and str(c.code).startswith('GE'):
            skipped_gened += 1
            continue
        if (pid, c.id) in scheduled_offerings:
            continue
        offerings_by_faculty.setdefault(pid, []).append(off)

    for pid, offs in offerings_by_faculty.items():
        f_obj = faculty_objs[pid]

        off_currs = {}
        for off in offs:
            c = db.query(models.Curriculum).filter(models.Curriculum.id == off.curriculum_id).first()
            if c:
                off_currs[off.id] = c

        paired_items = []
        used_off_ids = set()

        # Step 4a: Detect paired lecture + lab sessions
        for off1 in offs:
            if off1.id in used_off_ids:
                continue
            c1 = off_currs.get(off1.id)
            if not c1:
                continue

            has_lec1 = (c1.type == 'lecture' or (c1.lec_units or 0) > 0)
            has_lab1 = (c1.type == 'lab' or (c1.lab_units or 0) > 0)

            # Single curriculum offering with both lecture and lab (e.g. A/B or lec+lab units)
            if (has_lec1 and has_lab1) or (c1.code and (c1.code.upper().endswith('A/B') or c1.code.upper().endswith('-A/B'))):
                paired_items.append(('single', off1, off1, c1, c1))
                used_off_ids.add(off1.id)
                continue

            base1 = get_base_code(c1.code)
            is_lec1 = has_lec1 or (c1.code and c1.code.upper().endswith('A'))
            is_lab1 = has_lab1 or (c1.code and c1.code.upper().endswith('B'))

            # Look for companion offering with the same base code
            for off2 in offs:
                if off2.id == off1.id or off2.id in used_off_ids:
                    continue
                c2 = off_currs.get(off2.id)
                if not c2:
                    continue

                base2 = get_base_code(c2.code)
                if base1 and base1 == base2:
                    is_lec2 = (c2.type == 'lecture' or (c2.lec_units or 0) > 0) or (c2.code and c2.code.upper().endswith('A'))
                    is_lab2 = (c2.type == 'lab' or (c2.lab_units or 0) > 0) or (c2.code and c2.code.upper().endswith('B'))

                    if is_lec1 and is_lab2:
                        paired_items.append(('pair', off1, off2, c1, c2))
                        used_off_ids.add(off1.id)
                        used_off_ids.add(off2.id)
                        break
                    elif is_lab1 and is_lec2:
                        paired_items.append(('pair', off2, off1, c2, c1))
                        used_off_ids.add(off1.id)
                        used_off_ids.add(off2.id)
                        break

        # Step 4b: Schedule paired items consecutively on the same day pair
        for _kind, off_l, off_b, c_lec, c_lab in paired_items:
            lec_slots = lecture_slots_for(c_lec)
            lec_hours = get_duration_hours(lec_slots[0][0], lec_slots[0][1]) * 2
            lab_hours = get_duration_hours(LAB_SLOTS[0][0], LAB_SLOTS[0][1]) * 2

            warn_l, conf_l = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c_lec, part_type='lecture',
                proposed_hours_total=lec_hours, current_hours=faculty_hours_used[pid]
            )
            if warn_l: bumped_warnings.append(warn_l)
            if conf_l: pending_conflicts.append(conf_l)

            warn_b, conf_b = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c_lab, part_type='lab',
                proposed_hours_total=lab_hours, current_hours=faculty_hours_used[pid] + lec_hours
            )
            if warn_b: bumped_warnings.append(warn_b)
            if conf_b: pending_conflicts.append(conf_b)

            placed = _place_consecutive_lec_lab_slot(
                semester_id=semester_id,
                lec_curriculum_id=c_lec.id,
                lab_curriculum_id=c_lab.id,
                faculty_id=pid,
                day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                lecture_slots=lec_slots,
                lab_slots=LAB_SLOTS,
                rooms_by_type=rooms_by_type,
                all_unavails=all_unavails,
                all_schedules=all_schedules
            )

            if placed:
                s1, s2, s3, s4 = placed
                pending_schedules.extend([s1, s2, s3, s4])
                all_schedules.extend([s1, s2, s3, s4])
                scheduled_offerings.add((pid, c_lec.id))
                scheduled_offerings.add((pid, c_lab.id))
                faculty_hours_used[pid] += (lec_hours + lab_hours)
                generated_count += 4
            else:
                reason_msg = f"{c_lec.code} and {c_lab.code} could not be scheduled consecutively due to faculty availability or schedule conflict."
                conf_rec = models.Conflict(
                    faculty_id=pid, curriculum_id=c_lec.id, conflict_type="unplaced_consecutive",
                    reason=reason_msg
                )
                pending_conflicts.append(conf_rec)
                unplaced.append({
                    "faculty": pid, "curriculum_id": c_lec.id, "subject": c_lec.code,
                    "part_type": "consecutive_lec_lab", "reason": reason_msg
                })

        # Step 4c: Standalone offerings (lecture only or lab only)
        for off in offs:
            if off.id in used_off_ids:
                continue
            c = off_currs.get(off.id)
            if not c:
                continue
            if (pid, c.id) in scheduled_offerings:
                continue

            is_lab = c.type == 'lab' or (c.lab_units or 0) > 0 or (c.code and c.code.upper().endswith('B'))
            part_type = 'lab' if is_lab else 'lecture'
            day_pairs_to_try = [TTH_PAIR, MW_PAIR, FS_PAIR] if is_lab else [MW_PAIR, TTH_PAIR, FS_PAIR]
            slots = LAB_SLOTS if is_lab else lecture_slots_for(c)

            proposed_hours_total = get_duration_hours(slots[0][0], slots[0][1]) * 2
            warn, conf = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c, part_type=part_type,
                proposed_hours_total=proposed_hours_total, current_hours=faculty_hours_used[pid]
            )
            if warn: bumped_warnings.append(warn)
            if conf: pending_conflicts.append(conf)

            if part_type == 'lecture':
                placed_pair = _place_lecture_slot(
                    semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                    day_pairs_to_try=day_pairs_to_try, slots=slots,
                    all_unavails=all_unavails, all_schedules=all_schedules
                )
            else:
                placed_pair = _place_lab_slot(
                    semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                    day_pairs_to_try=day_pairs_to_try, slots=slots,
                    rooms_by_type=rooms_by_type, all_unavails=all_unavails, all_schedules=all_schedules
                )

            if placed_pair:
                sched1, sched2 = placed_pair
                pending_schedules.extend([sched1, sched2])
                all_schedules.extend([sched1, sched2])
                scheduled_offerings.add((pid, c.id))
                faculty_hours_used[pid] += proposed_hours_total
                generated_count += 2
            else:
                reason_msg = f"{c.code} could not be scheduled due to faculty availability or schedule conflict."
                conf_rec = models.Conflict(
                    faculty_id=pid, curriculum_id=c.id, conflict_type=f"unplaced_{part_type}",
                    reason=reason_msg
                )
                pending_conflicts.append(conf_rec)
                unplaced.append({
                    "faculty": pid, "curriculum_id": c.id, "subject": c.code,
                    "part_type": part_type, "reason": reason_msg
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
