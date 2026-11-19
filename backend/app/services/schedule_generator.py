import re
from datetime import time
from typing import List, Dict, Any, Optional, Tuple, Set, cast
from sqlalchemy.orm import Session
from .. import models
from . import faculty_load

# Mandatory 1-hour daily lunch break on Monday through Friday (12:00 PM - 01:00 PM).
# Saturday ('Sat') does NOT have a mandatory lunch break restriction.
LUNCH_BREAK_START = time(12, 0)
LUNCH_BREAK_END = time(13, 0)
LUNCH_BREAK_DAYS = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri'}

# ---------------------------------------------------------------------------
# Slot Grids (all slots respect the Mon-Fri 12:00 PM - 01:00 PM lunch break)
# ---------------------------------------------------------------------------

# 80-minute lecture slots:
# - Used on a 2-day pair (MW, TTh, FS) for 2-unit Lecture (A) subjects -> 2 x 80m = 160m (2h 40m/week)
# - Used on a single day for 1-unit Lecture (A) subjects -> 1 x 80m = 80m (1h 20m/week)
STANDARD_LECTURE_SLOTS = [
    (time(7, 30), time(8, 50)),
    (time(8, 50), time(10, 10)),
    (time(10, 10), time(11, 30)),
    (time(10, 40), time(12, 0)),
    (time(13, 0), time(14, 20)),
    (time(14, 20), time(15, 40)),
    (time(15, 40), time(17, 0)),
    (time(17, 0), time(18, 20)),
    (time(18, 10), time(19, 30)),
]

# 120-minute (2-hour) lecture slots:
# - Used on a 2-day pair (MW, TTh, FS) for 3-unit Lecture (A) subjects -> 2 x 120m = 240m (4h/week)
#   across ALL degree programs for classes with >= 13 students.
TWO_HOUR_LECTURE_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(8, 0), time(10, 0)),
    (time(9, 30), time(11, 30)),
    (time(10, 0), time(12, 0)),
    (time(13, 0), time(15, 0)),
    (time(13, 30), time(15, 30)),
    (time(15, 0), time(17, 0)),
    (time(15, 30), time(17, 30)),
    (time(17, 0), time(19, 0)),
    (time(17, 30), time(19, 30)),
]

# Alias preserved for backward compatibility.
ENGINEERING_LECTURE_SLOTS = TWO_HOUR_LECTURE_SLOTS
LECTURE_SLOTS = STANDARD_LECTURE_SLOTS

# 120-minute (2-hour) laboratory slots:
# - Used on a 2-day pair (TTh, MW, FS) for 1-unit Laboratory (B) subjects -> 2 x 120m = 240m (4h/week).
# Note: (11:30, 13:30) was removed so no lab overlaps the 12:00-13:00 Mon-Fri lunch break.
LAB_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(8, 50), time(10, 50)),
    (time(9, 30), time(11, 30)),
    (time(10, 0), time(12, 0)),
    (time(13, 0), time(15, 0)),
    (time(13, 30), time(15, 30)),
    (time(14, 20), time(16, 20)),
    (time(15, 0), time(17, 0)),
    (time(15, 30), time(17, 30)),
    (time(17, 0), time(19, 0)),
    (time(17, 30), time(19, 30)),
]

# 240-minute (4-hour) slots:
# - Used on a single day for 3-unit Combined (C) subjects -> 1 x 240m = 240m (4h/week)
# - Used on a 2-day pair for 2-unit Laboratory (B) subjects -> 2 x 240m = 480m (8h/week)
FOUR_HOUR_SINGLE_SLOTS = [
    (time(8, 0), time(12, 0)),
    (time(7, 30), time(11, 30)),
    (time(13, 0), time(17, 0)),
    (time(13, 30), time(17, 30)),
    (time(15, 0), time(19, 0)),
    (time(15, 30), time(19, 30)),
]

LECTURE_GRIDS_BY_PATTERN = {
    1.33: STANDARD_LECTURE_SLOTS,
    2.67: STANDARD_LECTURE_SLOTS,
    4.00: TWO_HOUR_LECTURE_SLOTS,
}

MW_PAIR = ['Mon', 'Wed']
TTH_PAIR = ['Tue', 'Thu']
FS_PAIR = ['Fri', 'Sat']
SINGLE_DAYS_ORDER = ['Fri', 'Sat', 'Mon', 'Wed', 'Tue', 'Thu']
DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
TIMESLOTS = [
    (time(8, 0), time(9, 30)),
    (time(9, 30), time(11, 0)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
]


def effective_lecture_units(curriculum) -> int:
    """Determine effective lecture units for a curriculum record."""
    if curriculum is None:
        return 3
    lec_u = int(getattr(curriculum, "lec_units", 0) or 0)
    if lec_u > 0:
        return lec_u
    total_u = int(getattr(curriculum, "units", 0) or 0)
    return total_u if total_u > 0 else 3


def effective_lab_units(curriculum) -> int:
    """Determine effective laboratory units for a curriculum record."""
    if curriculum is None:
        return 1
    lab_u = int(getattr(curriculum, "lab_units", 0) or 0)
    if lab_u > 0:
        return lab_u
    total_u = int(getattr(curriculum, "units", 0) or 0)
    return total_u if total_u > 0 else 1


def lecture_slots_for(curriculum) -> List[Tuple[time, time]]:
    """
    Select the lecture slot grid that satisfies the subject's weekly lecture minutes:
    - 1 unit  (80 min/week, 1 meeting)  -> STANDARD_LECTURE_SLOTS (80m per session)
    - 2 units (160 min/week, 2 meetings) -> STANDARD_LECTURE_SLOTS (80m per session)
    - 3 units (240 min/week, 2 meetings) -> TWO_HOUR_LECTURE_SLOTS (120m per session)
    Applies to all courses with >= 13 students regardless of degree program.
    """
    lec_u = effective_lecture_units(curriculum)
    if lec_u <= 2:
        return STANDARD_LECTURE_SLOTS
    return TWO_HOUR_LECTURE_SLOTS


def lab_slots_for(curriculum) -> List[Tuple[time, time]]:
    """
    Select the laboratory slot grid that satisfies the subject's weekly laboratory minutes:
    - 1 unit  (240 min/week, 2 meetings of 120m) -> LAB_SLOTS
    - 2 units (480 min/week, 2 meetings of 240m) -> FOUR_HOUR_SINGLE_SLOTS
    """
    lab_u = effective_lab_units(curriculum)
    if lab_u >= 2:
        return FOUR_HOUR_SINGLE_SLOTS
    return LAB_SLOTS


def get_duration_minutes(start_t: time, end_t: time, day_of_week: Optional[str] = None) -> int:
    return faculty_load.meeting_teaching_minutes(start_t, end_t, day_of_week)


def get_duration_hours(start_t: time, end_t: time, day_of_week: Optional[str] = None) -> float:
    return get_duration_minutes(start_t, end_t, day_of_week) / 60.0


def check_overlap(s1_start: time, s1_end: time, s2_start: time, s2_end: time) -> bool:
    return s1_start < s2_end and s1_end > s2_start


def is_lunch_break_conflict(day: Optional[str], start_t: time, end_t: time) -> bool:
    """
    Check if a proposed class on `day` overlaps the mandatory Monday-Friday
    12:00 PM - 01:00 PM lunch break. Saturday ('Sat') is exempt.
    """
    if not day or day not in LUNCH_BREAK_DAYS:
        return False
    return check_overlap(start_t, end_t, LUNCH_BREAK_START, LUNCH_BREAK_END)


def is_lunch_break_conflict_pair(day1: str, day2: str, start_t: time, end_t: time) -> bool:
    return is_lunch_break_conflict(day1, start_t, end_t) or is_lunch_break_conflict(day2, start_t, end_t)


def is_room_conflict(room_id, day1, day2, start_t, end_t, all_scheds):
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


def is_prof_conflict_single(faculty_id, day, start_t, end_t, all_scheds):
    for s in all_scheds:
        if s.faculty_id == faculty_id and s.day_of_week == day:
            if check_overlap(s.start_time, s.end_time, start_t, end_t):
                return True
    return False


def is_prof_unavail_single(faculty_id, day, start_t, end_t, all_unavails):
    for u in all_unavails:
        if u.faculty_id == faculty_id and u.day_of_week == day:
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
    Evaluate teaching workload against the professor's term teaching-hour limit:
    - Full-Time Probationary: 24h / 24h / 24h
    - Full-Time Regular:      24h / 20h / 20h
    - Part-Time:              Maximum 20h / 20h / 20h
    Exceeding the limit does NOT block schedule placement; instead it flags the
    overload for Program Chair override.
    """
    term_val = getattr(semester, 'term', None)
    raw_type = getattr(f_obj, 'type', None)
    norm_type = faculty_load.normalise_employment_type(raw_type)
    emp_label = faculty_load.employment_type_label(norm_type)
    required_hours = faculty_load.required_teaching_hours(term_val, norm_type)
    allowed_hours = faculty_load.allowed_teaching_hours(term_val, norm_type)
    overload_approved = bool(getattr(f_obj, 'overload_approved', False))

    projected_hours = current_hours + proposed_hours_total

    if required_hours is not None and projected_hours > required_hours + 0.005:
        fac_fname = getattr(f_obj, 'first_name', '')
        fac_lname = getattr(f_obj, 'last_name', '')
        fac_name = f"{fac_fname} {fac_lname}".strip() or f"Faculty #{pid}"
        current_hrs = faculty_load.round_hours(current_hours)
        over_by = faculty_load.round_hours(projected_hours - required_hours)
        reason_msg = (
            f"Overload for {fac_name} ({emp_label}): {current_hrs} + "
            f"{faculty_load.round_hours(proposed_hours_total)} hrs/week exceeds the "
            f"{required_hours} hrs/week allowed load by {over_by} hrs."
        )

        warning = {
            "faculty_id": pid,
            "faculty_name": fac_name,
            "employment_type": emp_label,
            "employment_type_code": norm_type,
            "current_hours": current_hrs,
            "required_hours": required_hours,
            "allowed_hours": allowed_hours,
            "additional_hours": faculty_load.round_hours(proposed_hours_total),
            "overload_hours": over_by,
            "subject_code": c.code,
            "part_type": part_type,
            "overload_approved": True,
            "requires_dean_approval": False,
            "message": (
                f"Faculty '{fac_name}' ({emp_label}) exceeds the {required_hours} hrs/week limit: "
                f"{c.code} brings total load to {faculty_load.round_hours(projected_hours)} hrs/week "
                f"(+{over_by} hrs overload)."
            )
        }
        return warning, None

    elif required_hours is None and not faculty_load.is_full_time(norm_type):
        ceiling = allowed_hours or faculty_load.PART_TIME_CEILING_HOURS
        if projected_hours > ceiling + 0.005:
            fac_fname = getattr(f_obj, 'first_name', '')
            fac_lname = getattr(f_obj, 'last_name', '')
            fac_name = f"{fac_fname} {fac_lname}".strip() or f"Faculty #{pid}"
            over_by = faculty_load.round_hours(projected_hours - ceiling)
            reason_msg = (
                f"Part-Time load for {fac_name}: "
                f"{faculty_load.round_hours(projected_hours)} hrs/week exceeds the "
                f"{ceiling} hrs/week Part-Time maximum by {over_by} hrs."
            )

            warning = {
                "faculty_id": pid,
                "faculty_name": fac_name,
                "employment_type": "Part-Time",
                "employment_type_code": "part_time",
                "current_hours": faculty_load.round_hours(current_hours),
                "required_hours": None,
                "allowed_hours": ceiling,
                "part_time_ceiling_hours": ceiling,
                "additional_hours": faculty_load.round_hours(proposed_hours_total),
                "overload_hours": over_by,
                "subject_code": c.code,
                "part_type": part_type,
                "overload_approved": True,
                "requires_dean_approval": False,
                "message": (
                    f"Faculty '{fac_name}' (Part-Time) reaches "
                    f"{faculty_load.round_hours(projected_hours)} hrs/week with {c.code}, exceeding "
                    f"the {ceiling} hrs/week Part-Time limit by {over_by} hrs."
                )
            }
            return warning, None

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
    Attempt to find an unconflicted day-pair and timeslot for a 2-meeting lecture.
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break.
    """
    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for start_t, end_t in slots:
            if is_lunch_break_conflict_pair(day1, day2, start_t, end_t):
                continue
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
    Attempt to place a 2-meeting lab slot on a day pair.
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break.
    """
    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for start_t, end_t in slots:
            if is_lunch_break_conflict_pair(day1, day2, start_t, end_t):
                continue
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


def _place_single_4hr_slot(
    semester_id: int,
    curriculum_id: Any,
    faculty_id: Any,
    days_to_try: List[str],
    slots: List[Tuple[time, time]],
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
) -> Optional[models.Schedule]:
    """
    Attempt to place a single-day session on one available day (used for 4-hour Combined 'C'
    blocks and 1-unit 80-minute single-session lectures).
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break.
    """
    for day in days_to_try:
        for start_t, end_t in slots:
            if is_lunch_break_conflict(day, start_t, end_t):
                continue
            if is_prof_unavail_single(faculty_id, day, start_t, end_t, all_unavails):
                continue
            if is_prof_conflict_single(faculty_id, day, start_t, end_t, all_schedules):
                continue
            return models.Schedule(
                semester_id=semester_id,
                curriculum_id=curriculum_id,
                faculty_id=faculty_id,
                room_id=None,
                day_of_week=day,
                start_time=start_t,
                end_time=end_t,
                section="",
                status='draft'
            )
    return None


def get_base_code(code: Optional[str]) -> str:
    if not code:
        return ""
    clean = re.sub(r"\s+", "", code.strip().upper())
    m = re.match(r"^(.*?)[_\-\s]*(?:A/B|[ABC])$", clean, re.IGNORECASE)
    if m:
        return m.group(1).strip().upper()
    return clean


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
    Attempt to place a consecutive lecture and laboratory session on the same day pair:
    1. Lecture scheduled first, followed by laboratory on the same day (lec_end <= lab_start).
    2. Prioritized by lecture start time and minimal gap between Lecture and Lab.
    3. Neither session may overlap the Mon-Fri 12:00 PM - 01:00 PM lunch break or any
       existing scheduled class/unavailability.
    """
    candidate_pairs = []
    for l_start, l_end in lecture_slots:
        for b_start, b_end in lab_slots:
            if l_end <= b_start:
                gap = (b_start.hour * 60 + b_start.minute) - (l_end.hour * 60 + l_end.minute)
                candidate_pairs.append((l_start, l_end, b_start, b_end, gap))

    candidate_pairs.sort(key=lambda x: (x[0], x[4]))

    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for l_start, l_end, b_start, b_end, _gap in candidate_pairs:
            if is_lunch_break_conflict_pair(day1, day2, l_start, l_end):
                continue
            if is_lunch_break_conflict_pair(day1, day2, b_start, b_end):
                continue
            if is_prof_unavail(faculty_id, day1, day2, l_start, l_end, all_unavails):
                continue
            if is_prof_unavail(faculty_id, day1, day2, b_start, b_end, all_unavails):
                continue

            if is_prof_conflict(faculty_id, day1, day2, l_start, l_end, all_schedules):
                continue
            if is_prof_conflict(faculty_id, day1, day2, b_start, b_end, all_schedules):
                continue

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
                room_id=None,
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
                room_id=None,
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
    Build a term's timetable according to the panelist-approved scheduling rules:
    - Lecture (A): 1u = 80m, 2u = 160m, 3u = 240m per week
    - Laboratory (B): 1u = 240m, 2u = 480m per week
    - Combined (C): 3u = 240m per week (only for genuine 'C' subjects)
    - Mandatory 1-hour Lunch Break (12:00 PM - 01:00 PM, Mon-Fri; Sat exempt)
    - Overload flagged for Program Chair override rather than blocking placement.
    """
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

        db.query(models.Conflict).filter(
            models.Conflict.faculty_id.in_(faculty_ids),
            models.Conflict.resolved_at == None
        ).delete(synchronize_session=False)
        db.commit()

    subject_offerings = db.query(models.SubjectOffering).join(models.Curriculum).filter(
        models.Curriculum.department_id == department_id,
        models.SubjectOffering.semester_id == semester_id,
        models.SubjectOffering.faculty_id.in_(faculty_ids)
    ).all()

    faculties = db.query(models.Faculty).filter(models.Faculty.id.in_(faculty_ids)).all()
    faculty_objs: Dict[int, models.Faculty] = {cast(int, f.id): f for f in faculties}

    faculty_hours_used: Dict[int, float] = {cast(int, f.id): 0.0 for f in faculties}
    all_schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == semester_id).all()
    for s in all_schedules:
        s_fid = cast(Optional[int], s.faculty_id)
        if s_fid is not None and s_fid in faculty_hours_used and s.start_time and s.end_time:
            faculty_hours_used[s_fid] += get_duration_hours(s.start_time, s.end_time, s.day_of_week)

    all_unavails = db.query(models.FacultyUnavailability).filter(
        models.FacultyUnavailability.faculty_id.in_(faculty_ids)
    ).all()

    rooms_by_type = {}

    semester = db.query(models.Semester).filter(models.Semester.id == semester_id).first()
    if not semester:
        return {"error": "Invalid semester ID"}

    pending_schedules = []
    pending_conflicts = []
    unplaced = []
    bumped_warnings = []
    generated_count = 0
    skipped_gened = 0

    scheduled_offerings: Set[Tuple[int, Any]] = set()
    for s in all_schedules:
        if s.faculty_id and s.curriculum_id:
            scheduled_offerings.add((cast(int, s.faculty_id), s.curriculum_id))

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

        combined_items = []
        paired_items = []
        used_off_ids = set()

        # Step 4a: Detect genuine Combined 'C' subjects vs. separate Lecture (A) + Lab (B) pairs
        for off1 in offs:
            if off1.id in used_off_ids:
                continue
            c1 = off_currs.get(off1.id)
            if not c1:
                continue

            clean_code1 = re.sub(r"\s+", "", (c1.code or "").upper().strip())
            # Genuine Combined 'C' subject ONLY: 3 units = 240 minutes (4 hours/week)
            if faculty_load.is_combined_c_subject(c1):
                combined_items.append((off1, c1))
                used_off_ids.add(off1.id)
                continue

            has_lec1 = (c1.type == 'lecture' or (c1.lec_units or 0) > 0)
            has_lab1 = (c1.type == 'lab' or (c1.lab_units or 0) > 0)

            # Single curriculum row containing both separate Lecture and Lab units (e.g., A/B or 2u Lec + 1u Lab)
            if ((c1.lec_units or 0) > 0 and (c1.lab_units or 0) > 0) or (
                clean_code1.endswith('A/B') or clean_code1.endswith('-A/B')
            ):
                paired_items.append(('single', off1, off1, c1, c1))
                used_off_ids.add(off1.id)
                continue

            base1 = get_base_code(c1.code)
            is_lec1 = has_lec1 or (c1.code and clean_code1.endswith('A'))
            is_lab1 = has_lab1 or (c1.code and clean_code1.endswith('B'))

            for off2 in offs:
                if off2.id == off1.id or off2.id in used_off_ids:
                    continue
                c2 = off_currs.get(off2.id)
                if not c2 or faculty_load.is_combined_c_subject(c2):
                    continue

                base2 = get_base_code(c2.code)
                clean_code2 = re.sub(r"\s+", "", (c2.code or "").upper().strip())
                if base1 and base1 == base2:
                    is_lec2 = (c2.type == 'lecture' or (c2.lec_units or 0) > 0) or clean_code2.endswith('A')
                    is_lab2 = (c2.type == 'lab' or (c2.lab_units or 0) > 0) or clean_code2.endswith('B')

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

        # Step 4b: Schedule genuine Combined 'C' subjects (240 minutes = 4 hours/week)
        for off_c, c_comb in combined_items:
            proposed_hours = faculty_load.subject_required_hours(c_comb)
            warn_c, conf_c = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c_comb, part_type='combined',
                proposed_hours_total=proposed_hours, current_hours=faculty_hours_used[pid]
            )
            if warn_c:
                bumped_warnings.append(warn_c)
            if conf_c:
                pending_conflicts.append(conf_c)

            placed = _place_single_4hr_slot(
                semester_id=semester_id,
                curriculum_id=c_comb.id,
                faculty_id=pid,
                days_to_try=SINGLE_DAYS_ORDER,
                slots=FOUR_HOUR_SINGLE_SLOTS,
                all_unavails=all_unavails,
                all_schedules=all_schedules
            )
            if placed:
                pending_schedules.append(placed)
                all_schedules.append(placed)
                scheduled_offerings.add((pid, c_comb.id))
                faculty_hours_used[pid] += proposed_hours
                generated_count += 1
            else:
                # Fallback: try 2 x 2-hour sessions on a day pair (still 240 minutes total)
                placed_pair = _place_lecture_slot(
                    semester_id=semester_id,
                    curriculum_id=c_comb.id,
                    faculty_id=pid,
                    day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                    slots=TWO_HOUR_LECTURE_SLOTS,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                )
                if placed_pair:
                    s1, s2 = placed_pair
                    pending_schedules.extend([s1, s2])
                    all_schedules.extend([s1, s2])
                    scheduled_offerings.add((pid, c_comb.id))
                    faculty_hours_used[pid] += proposed_hours
                    generated_count += 2
                else:
                    reason_msg = f"{c_comb.code} could not be scheduled as a 4-hour Combined (C) subject due to faculty availability or schedule conflict."
                    conf_rec = models.Conflict(
                        faculty_id=pid, curriculum_id=c_comb.id, conflict_type="unplaced_combined",
                        reason=reason_msg
                    )
                    pending_conflicts.append(conf_rec)
                    unplaced.append({
                        "faculty": pid, "curriculum_id": c_comb.id, "subject": c_comb.code,
                        "part_type": "combined", "reason": reason_msg
                    })

        # Step 4c: Schedule paired Lecture (A) + Lab (B) items consecutively on the same day pair
        generated_count += _schedule_paired_offerings(
            paired_items=paired_items, semester=semester, semester_id=semester_id,
            f_obj=f_obj, pid=pid, rooms_by_type=rooms_by_type,
            all_unavails=all_unavails, all_schedules=all_schedules,
            pending_schedules=pending_schedules, pending_conflicts=pending_conflicts,
            scheduled_offerings=scheduled_offerings, faculty_hours_used=faculty_hours_used,
            bumped_warnings=bumped_warnings, unplaced=unplaced,
        )

        # Step 4d: Standalone offerings (Lecture A only or Lab B only)
        generated_count += _schedule_standalone_offerings(
            offs=offs, used_off_ids=used_off_ids, off_currs=off_currs,
            semester=semester, semester_id=semester_id, f_obj=f_obj, pid=pid,
            rooms_by_type=rooms_by_type, all_unavails=all_unavails, all_schedules=all_schedules,
            pending_schedules=pending_schedules, pending_conflicts=pending_conflicts,
            scheduled_offerings=scheduled_offerings, faculty_hours_used=faculty_hours_used,
            bumped_warnings=bumped_warnings, unplaced=unplaced,
        )

    return _commit_generation_results(
        db=db, pending_schedules=pending_schedules, pending_conflicts=pending_conflicts,
        generated_count=generated_count, unplaced=unplaced,
        skipped_gened=skipped_gened, bumped_warnings=bumped_warnings,
    )


def _schedule_paired_offerings(
    *, paired_items, semester, semester_id, f_obj, pid, rooms_by_type,
    all_unavails, all_schedules, pending_schedules, pending_conflicts,
    scheduled_offerings, faculty_hours_used, bumped_warnings, unplaced,
) -> int:
    """Place consecutive lecture+lab pairs on shared day pairs, returning count of created slots."""
    added = 0
    for _kind, _off_l, _off_b, c_lec, c_lab in paired_items:
        lec_slots = lecture_slots_for(c_lec)
        b_slots = lab_slots_for(c_lab)
        lec_hours = get_duration_hours(lec_slots[0][0], lec_slots[0][1]) * 2
        lab_hours = get_duration_hours(b_slots[0][0], b_slots[0][1]) * 2

        warn_l, conf_l = _calculate_workload_warnings(
            semester=semester, f_obj=f_obj, pid=pid, c=c_lec, part_type='lecture',
            proposed_hours_total=lec_hours, current_hours=faculty_hours_used[pid],
        )
        if warn_l:
            bumped_warnings.append(warn_l)
        if conf_l:
            pending_conflicts.append(conf_l)

        warn_b, conf_b = _calculate_workload_warnings(
            semester=semester, f_obj=f_obj, pid=pid, c=c_lab, part_type='lab',
            proposed_hours_total=lab_hours, current_hours=faculty_hours_used[pid] + lec_hours,
        )
        if warn_b:
            bumped_warnings.append(warn_b)
        if conf_b:
            pending_conflicts.append(conf_b)

        placed = _place_consecutive_lec_lab_slot(
            semester_id=semester_id, lec_curriculum_id=c_lec.id, lab_curriculum_id=c_lab.id,
            faculty_id=pid, day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
            lecture_slots=lec_slots, lab_slots=b_slots, rooms_by_type=rooms_by_type,
            all_unavails=all_unavails, all_schedules=all_schedules,
        )
        if placed:
            s1, s2, s3, s4 = placed
            pending_schedules.extend([s1, s2, s3, s4])
            all_schedules.extend([s1, s2, s3, s4])
            scheduled_offerings.add((pid, c_lec.id))
            scheduled_offerings.add((pid, c_lab.id))
            faculty_hours_used[pid] += (lec_hours + lab_hours)
            added += 4
        else:
            reason_msg = f"{c_lec.code} and {c_lab.code} could not be scheduled consecutively due to faculty availability or schedule conflict."
            pending_conflicts.append(
                models.Conflict(
                    faculty_id=pid, curriculum_id=c_lec.id, conflict_type="unplaced_consecutive",
                    reason=reason_msg,
                )
            )
            unplaced.append({
                "faculty": pid, "curriculum_id": c_lec.id, "subject": c_lec.code,
                "part_type": "consecutive_lec_lab", "reason": reason_msg,
            })
    return added


def _schedule_standalone_offerings(
    *, offs, used_off_ids, off_currs, semester, semester_id, f_obj, pid,
    rooms_by_type, all_unavails, all_schedules, pending_schedules, pending_conflicts,
    scheduled_offerings, faculty_hours_used, bumped_warnings, unplaced,
) -> int:
    """Place remaining standalone lecture or lab offerings, returning count of created slots."""
    added = 0
    for off in offs:
        if off.id in used_off_ids:
            continue
        c = off_currs.get(off.id)
        if not c or (pid, c.id) in scheduled_offerings:
            continue

        is_lab = faculty_load.is_lab_b_subject(c)
        part_type = 'lab' if is_lab else 'lecture'

        # 1-unit standalone Lecture (A): 1 meeting of 80 minutes per week (80 min total)
        if not is_lab and effective_lecture_units(c) == 1:
            proposed_hours_total = faculty_load.round_hours(80 / 60.0)
            warn, conf = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c, part_type=part_type,
                proposed_hours_total=proposed_hours_total, current_hours=faculty_hours_used[pid],
            )
            if warn:
                bumped_warnings.append(warn)
            if conf:
                pending_conflicts.append(conf)

            placed_single = _place_single_4hr_slot(
                semester_id=semester_id,
                curriculum_id=c.id,
                faculty_id=pid,
                days_to_try=['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                slots=STANDARD_LECTURE_SLOTS,
                all_unavails=all_unavails,
                all_schedules=all_schedules,
            )
            if placed_single:
                pending_schedules.append(placed_single)
                all_schedules.append(placed_single)
                scheduled_offerings.add((pid, c.id))
                faculty_hours_used[pid] += proposed_hours_total
                added += 1
            else:
                reason_msg = f"{c.code} could not be scheduled due to faculty availability or schedule conflict."
                pending_conflicts.append(
                    models.Conflict(
                        faculty_id=pid, curriculum_id=c.id, conflict_type="unplaced_lecture",
                        reason=reason_msg,
                    )
                )
                unplaced.append({
                    "faculty": pid, "curriculum_id": c.id, "subject": c.code,
                    "part_type": "lecture", "reason": reason_msg,
                })
            continue

        day_pairs_to_try = [TTH_PAIR, MW_PAIR, FS_PAIR] if is_lab else [MW_PAIR, TTH_PAIR, FS_PAIR]
        slots = lab_slots_for(c) if is_lab else lecture_slots_for(c)

        proposed_hours_total = get_duration_hours(slots[0][0], slots[0][1]) * 2
        warn, conf = _calculate_workload_warnings(
            semester=semester, f_obj=f_obj, pid=pid, c=c, part_type=part_type,
            proposed_hours_total=proposed_hours_total, current_hours=faculty_hours_used[pid],
        )
        if warn:
            bumped_warnings.append(warn)
        if conf:
            pending_conflicts.append(conf)

        if part_type == 'lecture':
            placed_pair = _place_lecture_slot(
                semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                day_pairs_to_try=day_pairs_to_try, slots=slots,
                all_unavails=all_unavails, all_schedules=all_schedules,
            )
        else:
            placed_pair = _place_lab_slot(
                semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                day_pairs_to_try=day_pairs_to_try, slots=slots,
                rooms_by_type=rooms_by_type, all_unavails=all_unavails, all_schedules=all_schedules,
            )

        if placed_pair:
            sched1, sched2 = placed_pair
            pending_schedules.extend([sched1, sched2])
            all_schedules.extend([sched1, sched2])
            scheduled_offerings.add((pid, c.id))
            faculty_hours_used[pid] += proposed_hours_total
            added += 2
        else:
            reason_msg = f"{c.code} could not be scheduled due to faculty availability or schedule conflict."
            pending_conflicts.append(
                models.Conflict(
                    faculty_id=pid, curriculum_id=c.id, conflict_type=f"unplaced_{part_type}",
                    reason=reason_msg,
                )
            )
            unplaced.append({
                "faculty": pid, "curriculum_id": c.id, "subject": c.code,
                "part_type": part_type, "reason": reason_msg,
            })
    return added


def _commit_generation_results(
    *, db, pending_schedules, pending_conflicts, generated_count,
    unplaced, skipped_gened, bumped_warnings,
) -> dict:
    """Persist generated schedules/conflicts and attach conflict IDs to unplaced entries."""
    try:
        if pending_schedules:
            db.add_all(pending_schedules)
        if pending_conflicts:
            db.add_all(pending_conflicts)
        if pending_schedules or pending_conflicts:
            db.commit()

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
        "bumped_warnings": bumped_warnings,
    }
