import re
import logging
from datetime import time
from typing import List, Dict, Any, Optional, Tuple, Set, cast
from sqlalchemy.orm import Session
from .. import models
from . import faculty_load

logger = logging.getLogger(__name__)

# Lunch break is flexible and not a fixed hard block at 12:00 PM - 01:00 PM.
# Classes can be scheduled across midday as needed.
LUNCH_BREAK_START = time(12, 0)
LUNCH_BREAK_END = time(13, 0)
LUNCH_BREAK_DAYS = {'Mon', 'Tue', 'Wed', 'Thu', 'Fri'}

# ---------------------------------------------------------------------------
# Slot Grids (supporting flexible scheduling across all periods)
# ---------------------------------------------------------------------------

# 80-minute lecture slots:
# - Used on a 2-day pair (MW, TTh, FS) for 2-unit Lecture (A) subjects -> 2 x 80m = 160m (2h 40m/week)
# - Used on a single day for 1-unit Lecture (A) subjects -> 1 x 80m = 80m (1h 20m/week)
STANDARD_LECTURE_SLOTS = [
    (time(7, 30), time(8, 50)),
    (time(8, 50), time(10, 10)),
    (time(10, 10), time(11, 30)),
    (time(10, 40), time(12, 0)),
    (time(10, 50), time(12, 10)),
    (time(11, 30), time(12, 50)),
    (time(12, 0), time(13, 20)),
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
    (time(11, 0), time(13, 0)),
    (time(11, 30), time(13, 30)),
    (time(12, 0), time(14, 0)),
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
LAB_SLOTS = [
    (time(7, 30), time(9, 30)),
    (time(8, 50), time(10, 50)),
    (time(9, 30), time(11, 30)),
    (time(10, 0), time(12, 0)),
    (time(11, 0), time(13, 0)),
    (time(11, 30), time(13, 30)),
    (time(12, 0), time(14, 0)),
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
    (time(10, 0), time(14, 0)),
    (time(11, 0), time(15, 0)),
    (time(12, 0), time(16, 0)),
    (time(13, 0), time(17, 0)),
    (time(13, 30), time(17, 30)),
    (time(15, 0), time(19, 0)),
    (time(15, 30), time(19, 30)),
]

# Converted Tutorial (CT) slot grids (1h, 1.5h, 3h)
SIXTY_MIN_SLOTS = [
    (time(7, 30), time(8, 30)),
    (time(8, 30), time(9, 30)),
    (time(9, 30), time(10, 30)),
    (time(10, 30), time(11, 30)),
    (time(11, 0), time(12, 0)),
    (time(11, 30), time(12, 30)),
    (time(12, 0), time(13, 0)),
    (time(12, 30), time(13, 30)),
    (time(13, 0), time(14, 0)),
    (time(14, 0), time(15, 0)),
    (time(15, 0), time(16, 0)),
    (time(16, 0), time(17, 0)),
    (time(17, 0), time(18, 0)),
    (time(18, 0), time(19, 0)),
]

NINETY_MIN_SLOTS = [
    (time(7, 30), time(9, 0)),
    (time(9, 0), time(10, 30)),
    (time(10, 30), time(12, 0)),
    (time(11, 30), time(13, 0)),
    (time(12, 0), time(13, 30)),
    (time(13, 0), time(14, 30)),
    (time(14, 30), time(16, 0)),
    (time(16, 0), time(17, 30)),
    (time(17, 30), time(19, 0)),
]

THREE_HOUR_SLOTS = [
    (time(7, 30), time(10, 30)),
    (time(9, 0), time(12, 0)),
    (time(10, 30), time(13, 30)),
    (time(11, 0), time(14, 0)),
    (time(12, 0), time(15, 0)),
    (time(13, 0), time(16, 0)),
    (time(14, 30), time(17, 30)),
    (time(16, 0), time(19, 0)),
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


GENERAL_MAX_END_TIME = time(17, 30)

def filter_slots_for_department(slots: List[Tuple[time, time]], is_cvmas: bool = False) -> List[Tuple[time, time]]:
    """
    Remove the 5:30 PM - 7:30 PM (17:30 - 19:30) scheduling time slot for all departments except CVMAS.
    Only CVMAS is allowed to schedule classes during this period.
    """
    if is_cvmas:
        return slots
    return [s for s in slots if s[1] <= GENERAL_MAX_END_TIME and s[0] < GENERAL_MAX_END_TIME]


def lecture_slots_for(curriculum, is_cvmas: bool = False) -> List[Tuple[time, time]]:
    """
    Select the lecture slot grid that satisfies the subject's weekly lecture minutes:
    - 1 unit  (80 min/week, 1 meeting)  -> STANDARD_LECTURE_SLOTS (80m per session)
    - 2 units (160 min/week, 2 meetings) -> STANDARD_LECTURE_SLOTS (80m per session)
    - 3 units (240 min/week, 2 meetings) -> TWO_HOUR_LECTURE_SLOTS (120m per session)
    Applies to all courses with >= 13 students regardless of degree program.
    """
    lec_u = effective_lecture_units(curriculum)
    base = STANDARD_LECTURE_SLOTS if lec_u <= 2 else TWO_HOUR_LECTURE_SLOTS
    cvmas_flag = is_cvmas
    if not cvmas_flag:
        dept = getattr(curriculum, "department", None)
        if dept and getattr(dept, "code", "").upper() == "CVMAS":
            cvmas_flag = True
    return filter_slots_for_department(base, cvmas_flag)


def lab_slots_for(curriculum, is_cvmas: bool = False) -> List[Tuple[time, time]]:
    """
    Select the laboratory slot grid that satisfies the subject's weekly laboratory minutes:
    - 1 unit  (240 min/week, 2 meetings of 120m) -> LAB_SLOTS
    - 2 units (480 min/week, 2 meetings of 240m) -> FOUR_HOUR_SINGLE_SLOTS
    """
    lab_u = effective_lab_units(curriculum)
    base = FOUR_HOUR_SINGLE_SLOTS if lab_u >= 2 else LAB_SLOTS
    cvmas_flag = is_cvmas
    if not cvmas_flag:
        dept = getattr(curriculum, "department", None)
        if dept and getattr(dept, "code", "").upper() == "CVMAS":
            cvmas_flag = True
    return filter_slots_for_department(base, cvmas_flag)


def get_duration_minutes(start_t: time, end_t: time, day_of_week: Optional[str] = None) -> int:
    return faculty_load.meeting_teaching_minutes(start_t, end_t, day_of_week)


def get_duration_hours(start_t: time, end_t: time, day_of_week: Optional[str] = None) -> float:
    return get_duration_minutes(start_t, end_t, day_of_week) / 60.0


def check_overlap(s1_start: time, s1_end: time, s2_start: time, s2_end: time) -> bool:
    return s1_start < s2_end and s1_end > s2_start


MIDDAY_WINDOW_START_MIN = 11 * 60       # 11:00 AM (660m)
MIDDAY_WINDOW_END_MIN = 14 * 60 + 30    # 02:30 PM (870m)
REQUIRED_LUNCH_BREAK_MINS = 60          # 1 continuous hour

def faculty_has_flexible_lunch_break(
    faculty_id: Any,
    day: str,
    cand_start: time,
    cand_end: time,
    all_schedules: Optional[List[Any]] = None,
    extra_slots: Optional[List[Tuple[time, time]]] = None,
) -> bool:
    """
    Every faculty schedule must include a 1-hour lunch break each day.
    The lunch break does not need to occur at a fixed time, but the scheduling system
    must always reserve one continuous hour without classes in the midday period (11:00 AM - 02:30 PM).
    """
    if day not in LUNCH_BREAK_DAYS:
        return True

    intervals: List[Tuple[int, int]] = []

    cs = cand_start.hour * 60 + cand_start.minute
    ce = cand_end.hour * 60 + cand_end.minute
    if cs < ce:
        intervals.append((cs, ce))

    if extra_slots:
        for es, ee in extra_slots:
            es_m = es.hour * 60 + es.minute
            ee_m = ee.hour * 60 + ee.minute
            if es_m < ee_m:
                intervals.append((es_m, ee_m))

    if all_schedules and faculty_id is not None:
        for s in all_schedules:
            s_fid = getattr(s, 'faculty_id', None)
            if s_fid is not None and str(s_fid) == str(faculty_id):
                s_day = getattr(s, 'day_of_week', None)
                if s_day == day:
                    st = getattr(s, 'start_time', None)
                    et = getattr(s, 'end_time', None)
                    if st and et:
                        sm = st.hour * 60 + st.minute
                        em = et.hour * 60 + et.minute
                        if sm < em:
                            intervals.append((sm, em))

    midday_busy: List[Tuple[int, int]] = []
    for s_m, e_m in intervals:
        overlap_s = max(s_m, MIDDAY_WINDOW_START_MIN)
        overlap_e = min(e_m, MIDDAY_WINDOW_END_MIN)
        if overlap_s < overlap_e:
            midday_busy.append((overlap_s, overlap_e))

    if not midday_busy:
        return True

    midday_busy.sort(key=lambda x: x[0])
    merged = [midday_busy[0]]
    for cur_s, cur_e in midday_busy[1:]:
        last_s, last_e = merged[-1]
        if cur_s <= last_e:
            merged[-1] = (last_s, max(last_e, cur_e))
        else:
            merged.append((cur_s, cur_e))

    free_gaps: List[int] = []
    cursor = MIDDAY_WINDOW_START_MIN
    for b_s, b_e in merged:
        if b_s > cursor:
            free_gaps.append(b_s - cursor)
        cursor = max(cursor, b_e)
    if cursor < MIDDAY_WINDOW_END_MIN:
        free_gaps.append(MIDDAY_WINDOW_END_MIN - cursor)

    return any(gap >= REQUIRED_LUNCH_BREAK_MINS for gap in free_gaps)


def is_lunch_break_conflict(
    day: Optional[str],
    start_t: time,
    end_t: time,
    faculty_id: Optional[Any] = None,
    all_schedules: Optional[List[Any]] = None,
    extra_slots: Optional[List[Tuple[time, time]]] = None,
) -> bool:
    target_day = day or 'Mon'
    return not faculty_has_flexible_lunch_break(
        faculty_id=faculty_id,
        day=target_day,
        cand_start=start_t,
        cand_end=end_t,
        all_schedules=all_schedules,
        extra_slots=extra_slots,
    )


def is_lunch_break_conflict_pair(
    day1: str,
    day2: str,
    start_t: time,
    end_t: time,
    faculty_id: Optional[Any] = None,
    all_schedules: Optional[List[Any]] = None,
    extra_slots: Optional[List[Tuple[time, time]]] = None,
) -> bool:
    if is_lunch_break_conflict(day1, start_t, end_t, faculty_id, all_schedules, extra_slots):
        return True
    if is_lunch_break_conflict(day2, start_t, end_t, faculty_id, all_schedules, extra_slots):
        return True
    return False


def is_room_conflict(room_id, day1, day2, start_t, end_t, all_scheds):
    return False


def _cohort_key(curriculum) -> Optional[Tuple[str, Any, str]]:
    """
    Identify a student cohort by (block_id or program_code, year_level) so two
    mandatory subjects for the same Program & Year Level are never scheduled at
    overlapping times even when taught by different professors.
    """
    if curriculum is None:
        return None
    year_val = str(getattr(curriculum, "year_level", "") or "").strip().lower()
    if not year_val:
        return None
    block_id = getattr(curriculum, "block_id", None)
    if block_id is not None:
        return ("block", block_id, year_val)
    prog = str(getattr(curriculum, "program_code", "") or "").strip().upper()
    if prog:
        return ("prog", prog, year_val)
    return None


def is_cohort_conflict(
    curriculum_id: Any,
    days: Tuple[str, ...],
    start_t: time,
    end_t: time,
    all_scheds: List[models.Schedule],
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
) -> bool:
    if not cohort_by_curr_id or curriculum_id not in cohort_by_curr_id:
        return False
    target_cohort = cohort_by_curr_id[curriculum_id]
    for s in all_scheds:
        if s.day_of_week in days and s.curriculum_id != curriculum_id:
            if cohort_by_curr_id.get(s.curriculum_id) == target_cohort:
                if s.start_time and s.end_time and check_overlap(start_t, end_t, s.start_time, s.end_time):
                    return True
    return False


def _violates_after_order(
    days: Tuple[str, ...],
    start_t: time,
    after_schedules: Optional[List[models.Schedule]] = None,
) -> bool:
    """Ensure a paired Lab never starts before its Lecture ends on a shared day."""
    if not after_schedules:
        return False
    for lec in after_schedules:
        if lec.day_of_week in days and lec.end_time is not None:
            if start_t < lec.end_time:
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
        cascade_calc = faculty_load.calculate_consultation_workload(term_val, norm_type, over_by)
        norm_t = faculty_load.normalise_term(term_val) or "2nd"
        off_ded = cascade_calc["deducted_from_off_campus"]
        rem_off = cascade_calc["remaining_off_campus"]
        alloc_off = cascade_calc["allocated_off_campus"]
        rem_consult = cascade_calc["adjusted_consultation"]
        cascade_summary = (
            f"Cascade deduction: -{cascade_calc['deducted_from_office']:.1f}h office "
            f"({cascade_calc['remaining_office']:.1f}h of {cascade_calc['allocated_office']:.1f}h remaining)"
        )
        if off_ded > 0:
            cascade_summary += f", -{off_ded:.1f}h off-campus ({rem_off:.1f}h of {alloc_off:.1f}h remaining)"
        else:
            cascade_summary += f" · Off-campus: {rem_off:.1f}h"
        cascade_summary += f" · Consultation: {rem_consult:.1f}h (fixed)"
        reason_msg = (
            f"Overload for {fac_name} ({emp_label}): {current_hrs} + "
            f"{faculty_load.round_hours(proposed_hours_total)} hrs/week exceeds the "
            f"{required_hours} hrs/week allowed load by {over_by} hrs. {cascade_summary}."
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
            "curriculum_id": c.id,
            "part_type": part_type,
            "overload_approved": overload_approved,
            "requires_dean_approval": False,
            "cascade": {
                "term": norm_t,
                "is_full_time": True,
                "overload_hours": over_by,
                "allocated_office": cascade_calc["allocated_office"],
                "remaining_office": cascade_calc["remaining_office"],
                "deducted_from_office": cascade_calc["deducted_from_office"],
                "allocated_off_campus": alloc_off,
                "remaining_off_campus": rem_off,
                "deducted_from_off_campus": off_ded,
                "standard_consultation": rem_consult,
                "remaining_consultation": rem_consult,
                "deducted_from_consultation": 0.0,
                "off_campus_hours": rem_off,
                "policy_review_flag": bool(cascade_calc.get("policy_review_flag", False)),
                "flag_reason": cascade_calc.get("flag_reason"),
            },
            "cascade_summary": cascade_summary,
            "message": (
                f"Faculty '{fac_name}' ({emp_label}) exceeds the {required_hours} hrs/week limit: "
                f"{c.code} brings total load to {faculty_load.round_hours(projected_hours)} hrs/week "
                f"(+{over_by} hrs overload). {cascade_summary}."
            )
        }
        conflict = None
        if not overload_approved:
            conflict = models.Conflict(
                faculty_id=pid,
                curriculum_id=c.id,
                conflict_type="overload",
                reason=reason_msg
            )
        return warning, conflict

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
                f"{ceiling} hrs/week Part-Time maximum by {over_by} hrs (exempt from 40h obligation)."
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
                "curriculum_id": c.id,
                "part_type": part_type,
                "overload_approved": overload_approved,
                "requires_dean_approval": False,
                "cascade_summary": "Part-Time faculty are exempt from 40h office/consultation obligations.",
                "message": (
                    f"Faculty '{fac_name}' (Part-Time) reaches "
                    f"{faculty_load.round_hours(projected_hours)} hrs/week with {c.code}, exceeding "
                    f"the {ceiling} hrs/week Part-Time limit by {over_by} hrs."
                )
            }
            conflict = None
            if not overload_approved:
                conflict = models.Conflict(
                    faculty_id=pid,
                    curriculum_id=c.id,
                    conflict_type="part_time_ceiling",
                    reason=reason_msg
                )
            return warning, conflict

    return None, None


def diagnose_unplaced_reason(
    *,
    curriculum: Any,
    faculty: Optional[models.Faculty],
    faculty_id: Any,
    part_type: str,
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
    day_pairs_to_try: Optional[List[List[str]]] = None,
    single_days_to_try: Optional[List[str]] = None,
    slots_to_try: Optional[List[Tuple[time, time]]] = None,
    lecture_slots: Optional[List[Tuple[time, time]]] = None,
    lab_slots: Optional[List[Tuple[time, time]]] = None,
    after_schedules: Optional[List[models.Schedule]] = None,
    target_minutes: Optional[int] = None,
    paired_curriculum: Optional[Any] = None,
    curr_code_map: Optional[Dict[Any, str]] = None,
) -> str:
    """
    Generate an explicit, human-friendly diagnostic reason explaining why a subject
    could not be scheduled, including faculty commitments, marked unavailabilities,
    or cohort clashes per day/slot.
    """
    try:
        code = getattr(curriculum, 'code', 'Subject')
        if faculty:
            fac_name = f"{getattr(faculty, 'first_name', '')} {getattr(faculty, 'last_name', '')}".strip() or f"Faculty #{faculty_id}"
        else:
            fac_name = f"Faculty #{faculty_id}"

        def format_clock(t: time) -> str:
            if not hasattr(t, 'strftime'):
                return str(t)
            return t.strftime('%I:%M %p').lstrip('0')

        def get_sched_code(s: models.Schedule) -> str:
            if s.curriculum and getattr(s.curriculum, 'code', None):
                return s.curriculum.code
            if curr_code_map and s.curriculum_id in curr_code_map:
                return curr_code_map[s.curriculum_id]
            return f"Subject #{s.curriculum_id}" if s.curriculum_id else "teaching"

        # Session description
        if paired_curriculum:
            req_desc = f"consecutive {code} (Lecture) & {paired_curriculum.code} (Lab)"
        elif target_minutes:
            req_desc = f"{target_minutes}-minute {part_type}"
        elif part_type == 'combined':
            req_desc = "4-hour Combined session"
        elif slots_to_try and len(slots_to_try) > 0:
            dur_mins = get_duration_minutes(slots_to_try[0][0], slots_to_try[0][1])
            if dur_mins >= 60:
                hrs = dur_mins / 60
                hrs_str = f"{int(hrs)}h" if hrs.is_integer() else f"{hrs:.1f}h"
            else:
                hrs_str = f"{dur_mins}m"
            req_desc = f"{hrs_str} {part_type}"
        else:
            req_desc = f"{part_type} slot"

        # Normalize day options
        groups_to_check: List[Tuple[str, List[str]]] = []
        if day_pairs_to_try:
            for pair in day_pairs_to_try:
                label = '/'.join(pair) if len(pair) > 1 else pair[0]
                groups_to_check.append((label, list(pair)))
        elif single_days_to_try:
            for day in single_days_to_try:
                groups_to_check.append((day, [day]))
        else:
            groups_to_check = [("Mon-Sat", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])]

        # Handle consecutive lecture & lab pairing
        if paired_curriculum and lecture_slots and lab_slots:
            day_reasons = []
            for day_label, days_list in groups_to_check:
                prof_classes = set()
                unavail_spans = set()
                cohort_classes = set()

                for d in days_list:
                    for u in all_unavails:
                        if u.faculty_id == faculty_id and u.day_of_week == d:
                            unavail_spans.add(f"{format_clock(u.start_time)} - {format_clock(u.end_time)}")

                for l_st, l_et in lecture_slots:
                    for b_st, b_et in lab_slots:
                        if l_et <= b_st:
                            for d in days_list:
                                for s in all_schedules:
                                    if s.faculty_id == faculty_id and s.day_of_week == d and s.start_time and s.end_time:
                                        if max(l_st, s.start_time) < min(l_et, s.end_time) or max(b_st, s.start_time) < min(b_et, s.end_time):
                                            prof_classes.add(get_sched_code(s))

                                    if cohort_by_curr_id:
                                        # lec cohort
                                        if getattr(curriculum, 'id', None) in cohort_by_curr_id:
                                            t_c = cohort_by_curr_id[curriculum.id]
                                            if s.day_of_week == d and s.curriculum_id != curriculum.id and s.start_time and s.end_time:
                                                if cohort_by_curr_id.get(s.curriculum_id) == t_c:
                                                    if max(l_st, s.start_time) < min(l_et, s.end_time):
                                                        cohort_classes.add(get_sched_code(s))
                                        # lab cohort
                                        if getattr(paired_curriculum, 'id', None) in cohort_by_curr_id:
                                            t_cb = cohort_by_curr_id[paired_curriculum.id]
                                            if s.day_of_week == d and s.curriculum_id != paired_curriculum.id and s.start_time and s.end_time:
                                                if cohort_by_curr_id.get(s.curriculum_id) == t_cb:
                                                    if max(b_st, s.start_time) < min(b_et, s.end_time):
                                                        cohort_classes.add(get_sched_code(s))

                blockers = []
                if prof_classes:
                    sorted_classes = sorted(list(prof_classes))
                    blockers.append(f"teaching conflicts ({', '.join(sorted_classes)})")
                if unavail_spans:
                    sorted_u = sorted(list(unavail_spans))
                    blockers.append(f"marked unavailable ({', '.join(sorted_u)})")
                if cohort_classes:
                    sorted_coh = sorted(list(cohort_classes))
                    blockers.append(f"cohort overlap ({', '.join(sorted_coh)})")

                if blockers:
                    day_reasons.append(f"{day_label}: {', '.join(blockers)}")
                else:
                    day_reasons.append(f"{day_label}: no back-to-back lecture & lab window")

            detail_str = "; ".join(day_reasons) if day_reasons else "no conflict-free timeslot found"
            return f"{code} & {paired_curriculum.code} could not be scheduled: No available consecutive window for {fac_name} ({detail_str})."

        # Standard single or pair slots
        effective_slots = slots_to_try
        if not effective_slots:
            if target_minutes == 60:
                effective_slots = SIXTY_MIN_SLOTS
            elif target_minutes == 90:
                effective_slots = NINETY_MIN_SLOTS
            elif target_minutes == 120:
                effective_slots = TWO_HOUR_LECTURE_SLOTS
            elif target_minutes == 180:
                effective_slots = THREE_HOUR_SLOTS
            elif target_minutes and target_minutes >= 240:
                effective_slots = FOUR_HOUR_SINGLE_SLOTS
            elif part_type == 'combined':
                effective_slots = FOUR_HOUR_SINGLE_SLOTS
            elif 'lab' in part_type:
                effective_slots = lab_slots_for(curriculum) if curriculum else LAB_SLOTS
            else:
                effective_slots = lecture_slots_for(curriculum) if curriculum else STANDARD_LECTURE_SLOTS

        day_reasons = []
        for day_label, days_list in groups_to_check:
            prof_classes = set()
            unavail_spans = set()
            cohort_classes = set()
            after_violation = False

            # Gather unavailabilities for these days
            for d in days_list:
                for u in all_unavails:
                    if u.faculty_id == faculty_id and u.day_of_week == d:
                        unavail_spans.add(f"{format_clock(u.start_time)} - {format_clock(u.end_time)}")

            for s_t, e_t in (effective_slots or []):
                if after_schedules and _violates_after_order(tuple(days_list), s_t, after_schedules):
                    after_violation = True

                for d in days_list:
                    for s in all_schedules:
                        if s.faculty_id == faculty_id and s.day_of_week == d and s.start_time and s.end_time:
                            if max(s_t, s.start_time) < min(e_t, s.end_time):
                                prof_classes.add(get_sched_code(s))

                    if cohort_by_curr_id and getattr(curriculum, 'id', None) in cohort_by_curr_id:
                        target_cohort = cohort_by_curr_id[curriculum.id]
                        for s in all_schedules:
                            if s.day_of_week == d and s.curriculum_id != curriculum.id and s.start_time and s.end_time:
                                if cohort_by_curr_id.get(s.curriculum_id) == target_cohort:
                                    if max(s_t, s.start_time) < min(e_t, s.end_time):
                                        cohort_classes.add(get_sched_code(s))

            blockers = []
            if prof_classes:
                sorted_classes = sorted(list(prof_classes))
                blockers.append(f"teaching conflicts ({', '.join(sorted_classes)})")
            if unavail_spans:
                sorted_u = sorted(list(unavail_spans))
                blockers.append(f"marked unavailable ({', '.join(sorted_u)})")
            if cohort_classes:
                sorted_coh = sorted(list(cohort_classes))
                blockers.append(f"cohort overlap ({', '.join(sorted_coh)})")
            if after_violation and not blockers:
                blockers.append("must be scheduled after lecture")

            if blockers:
                day_reasons.append(f"{day_label}: {', '.join(blockers)}")
            else:
                day_reasons.append(f"{day_label}: no continuous open window")

        detail_str = "; ".join(day_reasons) if day_reasons else "no conflict-free timeslot found"
        return f"{code} could not be scheduled: No available {req_desc} window for {fac_name} ({detail_str})."
    except Exception as err:
        logger.warning(f"[diagnose_unplaced_reason] Diagnostic failed: {err}")
        return f"{getattr(curriculum, 'code', 'Subject')} could not be scheduled due to faculty availability or schedule conflict."


def _place_lecture_slot(
    semester_id: int,
    curriculum_id: Any,
    faculty_id: Any,
    day_pairs_to_try: List[List[str]],
    slots: List[Tuple[time, time]],
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
    after_schedules: Optional[List[models.Schedule]] = None,
) -> Optional[Tuple[models.Schedule, models.Schedule]]:
    """
    Attempt to find an unconflicted day-pair and timeslot for a 2-meeting lecture.
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break and Program+Year cohort separation.
    """
    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for start_t, end_t in slots:
            if is_lunch_break_conflict_pair(day1, day2, start_t, end_t, faculty_id=faculty_id, all_schedules=all_schedules):
                continue
            if _violates_after_order((day1, day2), start_t, after_schedules):
                continue
            if is_prof_unavail(faculty_id, day1, day2, start_t, end_t, all_unavails):
                continue
            if is_prof_conflict(faculty_id, day1, day2, start_t, end_t, all_schedules):
                continue
            if is_cohort_conflict(curriculum_id, (day1, day2), start_t, end_t, all_schedules, cohort_by_curr_id):
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
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
    after_schedules: Optional[List[models.Schedule]] = None,
) -> Optional[Tuple[models.Schedule, models.Schedule]]:
    """
    Attempt to place a 2-meeting lab slot on a day pair.
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break and Program+Year cohort separation.
    """
    for days_pair in day_pairs_to_try:
        day1, day2 = days_pair[0], days_pair[1]
        for start_t, end_t in slots:
            if is_lunch_break_conflict_pair(day1, day2, start_t, end_t, faculty_id=faculty_id, all_schedules=all_schedules):
                continue
            if _violates_after_order((day1, day2), start_t, after_schedules):
                continue
            if is_prof_unavail(faculty_id, day1, day2, start_t, end_t, all_unavails):
                continue
            if is_prof_conflict(faculty_id, day1, day2, start_t, end_t, all_schedules):
                continue
            if is_cohort_conflict(curriculum_id, (day1, day2), start_t, end_t, all_schedules, cohort_by_curr_id):
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
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
    after_schedules: Optional[List[models.Schedule]] = None,
) -> Optional[models.Schedule]:
    """
    Attempt to place a single-day session on one available day (used for 4-hour Combined 'C'
    blocks, 1-unit 80-minute single-session lectures, and CT single sessions).
    Enforces the Mon-Fri 12:00 PM - 01:00 PM lunch break and Program+Year cohort separation.
    """
    for day in days_to_try:
        for start_t, end_t in slots:
            if is_lunch_break_conflict(day, start_t, end_t, faculty_id=faculty_id, all_schedules=all_schedules):
                continue
            if _violates_after_order((day,), start_t, after_schedules):
                continue
            if is_prof_unavail_single(faculty_id, day, start_t, end_t, all_unavails):
                continue
            if is_prof_conflict_single(faculty_id, day, start_t, end_t, all_schedules):
                continue
            if is_cohort_conflict(curriculum_id, (day,), start_t, end_t, all_schedules, cohort_by_curr_id):
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
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
) -> Optional[Tuple[models.Schedule, models.Schedule, models.Schedule, models.Schedule]]:
    """
    Attempt to place a consecutive lecture and laboratory session on the same day pair:
    1. Lecture scheduled first, followed by laboratory on the same day (lec_end <= lab_start).
    2. Prioritized by lecture start time and minimal gap between Lecture and Lab.
    3. Neither session may overlap the Mon-Fri 12:00 PM - 01:00 PM lunch break or any
       existing scheduled class/unavailability or same-cohort class.
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
            if is_lunch_break_conflict_pair(day1, day2, l_start, l_end, faculty_id=faculty_id, all_schedules=all_schedules, extra_slots=[(b_start, b_end)]):
                continue
            if is_lunch_break_conflict_pair(day1, day2, b_start, b_end, faculty_id=faculty_id, all_schedules=all_schedules, extra_slots=[(l_start, l_end)]):
                continue
            if is_prof_unavail(faculty_id, day1, day2, l_start, l_end, all_unavails):
                continue
            if is_prof_unavail(faculty_id, day1, day2, b_start, b_end, all_unavails):
                continue

            if is_prof_conflict(faculty_id, day1, day2, l_start, l_end, all_schedules):
                continue
            if is_prof_conflict(faculty_id, day1, day2, b_start, b_end, all_schedules):
                continue
            if is_cohort_conflict(lec_curriculum_id, (day1, day2), l_start, l_end, all_schedules, cohort_by_curr_id):
                continue
            if is_cohort_conflict(lab_curriculum_id, (day1, day2), b_start, b_end, all_schedules, cohort_by_curr_id):
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

        # Scope conflict cleanup to this department's curricula and this semester's schedules
        dept_curr_ids = [
            cid for (cid,) in db.query(models.Curriculum.id).filter(
                models.Curriculum.department_id == department_id
            ).all()
        ]
        if dept_curr_ids:
            db.query(models.Conflict).filter(
                models.Conflict.faculty_id.in_(faculty_ids),
                models.Conflict.curriculum_id.in_(dept_curr_ids),
                models.Conflict.resolved_at == None,
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

    dept_obj = db.query(models.Department).filter(models.Department.id == department_id).first()
    is_cvmas = bool(dept_obj and getattr(dept_obj, 'code', '').upper() == 'CVMAS')

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

    # Build Program + Year Level cohort map and curriculum code lookup
    cohort_by_curr_id: Dict[Any, Tuple[str, Any, str]] = {}
    curr_code_map: Dict[Any, str] = {}
    all_dept_currs = db.query(models.Curriculum).filter(
        models.Curriculum.department_id == department_id
    ).all()
    for dc in all_dept_currs:
        curr_code_map[dc.id] = dc.code
        ck = _cohort_key(dc)
        if ck is not None:
            cohort_by_curr_id[dc.id] = ck
    extra_sched_cids = {s.curriculum_id for s in all_schedules if s.curriculum_id and s.curriculum_id not in cohort_by_curr_id}
    if extra_sched_cids:
        for ec in db.query(models.Curriculum).filter(models.Curriculum.id.in_(extra_sched_cids)).all():
            curr_code_map[ec.id] = ec.code
            ck = _cohort_key(ec)
            if ck is not None:
                cohort_by_curr_id[ec.id] = ck

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
        # Explicitly assigned offerings (including assigned GenEd) are scheduled;
        # only skip rows that are already plotted.
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

        # Step 4b: Schedule genuine Combined 'C' subjects (Regular 240m or CT-adjusted)
        for off_c, c_comb in combined_items:
            enrolled_c = getattr(off_c, 'enrolled_students', None)
            is_ct_c = faculty_load.is_ct_tier(enrolled_students=enrolled_c)
            target_mins_c = faculty_load.subject_required_minutes(c_comb, enrolled_students=enrolled_c)
            proposed_hours = faculty_load.round_hours(target_mins_c / 60.0)
            warn_c, conf_c = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c_comb, part_type='combined',
                proposed_hours_total=proposed_hours, current_hours=faculty_hours_used[pid]
            )
            if warn_c:
                bumped_warnings.append(warn_c)
            if conf_c:
                pending_conflicts.append(conf_c)

            if is_ct_c:
                ct_placed = _place_ct_sessions(
                    semester_id=semester_id,
                    curriculum_id=c_comb.id,
                    faculty_id=pid,
                    target_minutes=target_mins_c,
                    enrolled_students=enrolled_c,
                    credited_hours=proposed_hours,
                    is_lab=False,
                    is_combined=True,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                )
                if ct_placed:
                    pending_schedules.extend(ct_placed)
                    all_schedules.extend(ct_placed)
                    scheduled_offerings.add((pid, c_comb.id))
                    faculty_hours_used[pid] += proposed_hours
                    generated_count += len(ct_placed)
                else:
                    reason_msg = diagnose_unplaced_reason(
                        curriculum=c_comb,
                        faculty=f_obj,
                        faculty_id=pid,
                        part_type="combined (CT)",
                        target_minutes=target_mins_c,
                        all_unavails=all_unavails,
                        all_schedules=all_schedules,
                        cohort_by_curr_id=cohort_by_curr_id,
                        single_days_to_try=SINGLE_DAYS_ORDER,
                        curr_code_map=curr_code_map,
                    )
                    pending_conflicts.append(
                        models.Conflict(
                            faculty_id=pid, curriculum_id=c_comb.id, conflict_type="unplaced_combined",
                            reason=reason_msg
                        )
                    )
                    unplaced.append({
                        "faculty": pid, "curriculum_id": c_comb.id, "subject": c_comb.code,
                        "part_type": "combined", "reason": reason_msg
                    })
                continue

            comb_single_slots = filter_slots_for_department(FOUR_HOUR_SINGLE_SLOTS, is_cvmas)
            comb_pair_slots = filter_slots_for_department(TWO_HOUR_LECTURE_SLOTS, is_cvmas)

            placed = _place_single_4hr_slot(
                semester_id=semester_id,
                curriculum_id=c_comb.id,
                faculty_id=pid,
                days_to_try=SINGLE_DAYS_ORDER,
                slots=comb_single_slots,
                all_unavails=all_unavails,
                all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
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
                    slots=comb_pair_slots,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                )
                if placed_pair:
                    s1, s2 = placed_pair
                    pending_schedules.extend([s1, s2])
                    all_schedules.extend([s1, s2])
                    scheduled_offerings.add((pid, c_comb.id))
                    faculty_hours_used[pid] += proposed_hours
                    generated_count += 2
                else:
                    reason_msg = diagnose_unplaced_reason(
                        curriculum=c_comb,
                        faculty=f_obj,
                        faculty_id=pid,
                        part_type="combined",
                        all_unavails=all_unavails,
                        all_schedules=all_schedules,
                        cohort_by_curr_id=cohort_by_curr_id,
                        single_days_to_try=SINGLE_DAYS_ORDER,
                        slots_to_try=FOUR_HOUR_SINGLE_SLOTS,
                        day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                        curr_code_map=curr_code_map,
                    )
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
            cohort_by_curr_id=cohort_by_curr_id,
            curr_code_map=curr_code_map,
            is_cvmas=is_cvmas,
        )

        # Step 4d: Standalone offerings (Lecture A only or Lab B only)
        generated_count += _schedule_standalone_offerings(
            offs=offs, used_off_ids=used_off_ids, off_currs=off_currs,
            semester=semester, semester_id=semester_id, f_obj=f_obj, pid=pid,
            rooms_by_type=rooms_by_type, all_unavails=all_unavails, all_schedules=all_schedules,
            pending_schedules=pending_schedules, pending_conflicts=pending_conflicts,
            scheduled_offerings=scheduled_offerings, faculty_hours_used=faculty_hours_used,
            bumped_warnings=bumped_warnings, unplaced=unplaced,
            cohort_by_curr_id=cohort_by_curr_id,
            curr_code_map=curr_code_map,
            is_cvmas=is_cvmas,
        )

    return _commit_generation_results(
        db=db, pending_schedules=pending_schedules, pending_conflicts=pending_conflicts,
        generated_count=generated_count, unplaced=unplaced,
        skipped_gened=skipped_gened, bumped_warnings=bumped_warnings,
    )


def _stamp_ct_metadata(
    scheds: List[models.Schedule],
    enrolled_students: Optional[int],
    credited_hours: Optional[float],
) -> List[models.Schedule]:
    if enrolled_students is not None:
        for s in scheds:
            setattr(s, "enrolled_students", enrolled_students)
            setattr(s, "credited_hours_override", credited_hours)
    return scheds


def _place_ct_sessions(
    *,
    semester_id: int,
    curriculum_id: int,
    faculty_id: int,
    target_minutes: int,
    enrolled_students: Optional[int],
    credited_hours: float,
    is_lab: bool,
    is_combined: bool,
    all_unavails: List[models.FacultyUnavailability],
    all_schedules: List[models.Schedule],
    cohort_by_curr_id: Optional[Dict[Any, Tuple[str, Any, str]]] = None,
    after_schedules: Optional[List[models.Schedule]] = None,
    is_cvmas: bool = False,
) -> Optional[List[models.Schedule]]:
    """
    Place lunch-safe weekly sessions matching exact Converted Tutorial (CT) minutes:
      60m  (1.0h) -> 1 x 60m
      90m  (1.5h) -> 1 x 90m
      120m (2.0h) -> 1 x 120m (fallback: 2 x 60m)
      180m (3.0h) -> 2 x 90m  (fallback: 1 x 180m)
      240m (4.0h) -> 1 x 240m if combined else 2 x 120m
      360m (6.0h) -> 2 x 180m
    """
    day_pairs = [TTH_PAIR, MW_PAIR, FS_PAIR] if is_lab else [MW_PAIR, TTH_PAIR, FS_PAIR]
    single_days = SINGLE_DAYS_ORDER if is_combined else ['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat']

    # If paired with a Lecture (after_schedules), prioritize the Lecture's own day(s) first
    if after_schedules:
        lec_days = [s.day_of_week for s in after_schedules if s.day_of_week]
        if lec_days:
            prioritized_single = list(dict.fromkeys(lec_days + single_days))
            single_days = prioritized_single
            lec_day_set = set(lec_days)
            matching_pairs = [p for p in [MW_PAIR, TTH_PAIR, FS_PAIR] if lec_day_set.issubset(set(p))]
            if matching_pairs:
                day_pairs = matching_pairs + [p for p in day_pairs if p not in matching_pairs]

    slots_60 = filter_slots_for_department(SIXTY_MIN_SLOTS, is_cvmas)
    slots_90 = filter_slots_for_department(NINETY_MIN_SLOTS, is_cvmas)
    slots_120 = filter_slots_for_department(TWO_HOUR_LECTURE_SLOTS, is_cvmas)
    slots_180 = filter_slots_for_department(THREE_HOUR_SLOTS, is_cvmas)
    slots_240 = filter_slots_for_department(FOUR_HOUR_SINGLE_SLOTS, is_cvmas)

    if target_minutes <= 60:
        s = _place_single_4hr_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            days_to_try=single_days, slots=slots_60,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        return _stamp_ct_metadata([s], enrolled_students, credited_hours) if s else None

    if target_minutes <= 90:
        s = _place_single_4hr_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            days_to_try=single_days, slots=slots_90,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        return _stamp_ct_metadata([s], enrolled_students, credited_hours) if s else None

    if target_minutes <= 120:
        s = _place_single_4hr_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            days_to_try=single_days, slots=slots_120,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        if s:
            return _stamp_ct_metadata([s], enrolled_students, credited_hours)
        pair = _place_lecture_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            day_pairs_to_try=day_pairs, slots=slots_60,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        return _stamp_ct_metadata(list(pair), enrolled_students, credited_hours) if pair else None

    if target_minutes <= 180:
        pair = _place_lecture_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            day_pairs_to_try=day_pairs, slots=slots_90,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        if pair:
            return _stamp_ct_metadata(list(pair), enrolled_students, credited_hours)
        s = _place_single_4hr_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            days_to_try=single_days, slots=slots_180,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        return _stamp_ct_metadata([s], enrolled_students, credited_hours) if s else None

    if target_minutes <= 240:
        if is_combined:
            s = _place_single_4hr_slot(
                semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
                days_to_try=single_days, slots=slots_240,
                all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
            )
            if s:
                return _stamp_ct_metadata([s], enrolled_students, credited_hours)
        pair = _place_lecture_slot(
            semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
            day_pairs_to_try=day_pairs, slots=slots_120,
            all_unavails=all_unavails, all_schedules=all_schedules,
            cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
        )
        return _stamp_ct_metadata(list(pair), enrolled_students, credited_hours) if pair else None

    # 360m (6h) -> 2 x 3h
    pair = _place_lecture_slot(
        semester_id=semester_id, curriculum_id=curriculum_id, faculty_id=faculty_id,
        day_pairs_to_try=day_pairs, slots=slots_180,
        all_unavails=all_unavails, all_schedules=all_schedules,
        cohort_by_curr_id=cohort_by_curr_id, after_schedules=after_schedules,
    )
    return _stamp_ct_metadata(list(pair), enrolled_students, credited_hours) if pair else None


def _schedule_paired_offerings(
    *, paired_items, semester, semester_id, f_obj, pid, rooms_by_type,
    all_unavails, all_schedules, pending_schedules, pending_conflicts,
    scheduled_offerings, faculty_hours_used, bumped_warnings, unplaced,
    cohort_by_curr_id=None,
    curr_code_map=None,
    is_cvmas: bool = False,
) -> int:
    """Place consecutive lecture+lab pairs on shared day pairs, returning count of created slots."""
    added = 0
    for _kind, _off_l, _off_b, c_lec, c_lab in paired_items:
        enrolled_l = getattr(_off_l, 'enrolled_students', None)
        enrolled_b = getattr(_off_b, 'enrolled_students', None)
        is_ct_pair = (
            faculty_load.is_ct_tier(enrolled_students=enrolled_l)
            or faculty_load.is_ct_tier(enrolled_students=enrolled_b)
        )

        if is_ct_pair:
            lec_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled_l)
            lab_tier = faculty_load.normalise_ct_tier(enrolled_students=enrolled_b)
            lec_mins = faculty_load.lecture_minutes_for_units(effective_lecture_units(c_lec), ct_tier=lec_tier)
            lab_mins = faculty_load.lab_minutes_for_units(effective_lab_units(c_lab), ct_tier=lab_tier)
            lec_hours = faculty_load.round_hours(lec_mins / 60.0)
            lab_hours = faculty_load.round_hours(lab_mins / 60.0)

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

            placed_l = _place_ct_sessions(
                semester_id=semester_id, curriculum_id=c_lec.id, faculty_id=pid,
                target_minutes=lec_mins, enrolled_students=enrolled_l, credited_hours=lec_hours,
                is_lab=False, is_combined=False, all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id, is_cvmas=is_cvmas,
            )
            if placed_l:
                pending_schedules.extend(placed_l)
                all_schedules.extend(placed_l)
                scheduled_offerings.add((pid, c_lec.id))
                faculty_hours_used[pid] += lec_hours
                added += len(placed_l)
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c_lec,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type="lecture (CT)",
                    target_minutes=lec_mins,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    single_days_to_try=['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                    curr_code_map=curr_code_map,
                )
                pending_conflicts.append(models.Conflict(faculty_id=pid, curriculum_id=c_lec.id, conflict_type="unplaced_lecture", reason=reason_msg))
                unplaced.append({"faculty": pid, "curriculum_id": c_lec.id, "subject": c_lec.code, "part_type": "lecture", "reason": reason_msg})

            placed_b = _place_ct_sessions(
                semester_id=semester_id, curriculum_id=c_lab.id, faculty_id=pid,
                target_minutes=lab_mins, enrolled_students=enrolled_b, credited_hours=lab_hours,
                is_lab=True, is_combined=False, all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id, after_schedules=placed_l, is_cvmas=is_cvmas,
            )
            if placed_b:
                pending_schedules.extend(placed_b)
                all_schedules.extend(placed_b)
                scheduled_offerings.add((pid, c_lab.id))
                faculty_hours_used[pid] += lab_hours
                added += len(placed_b)
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c_lab,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type="lab (CT)",
                    target_minutes=lab_mins,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    single_days_to_try=['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                    after_schedules=placed_l,
                    curr_code_map=curr_code_map,
                )
                pending_conflicts.append(models.Conflict(faculty_id=pid, curriculum_id=c_lab.id, conflict_type="unplaced_lab", reason=reason_msg))
                unplaced.append({"faculty": pid, "curriculum_id": c_lab.id, "subject": c_lab.code, "part_type": "lab", "reason": reason_msg})
            continue

        # 1-unit Lecture (80m = 1 single meeting) paired with Lab:
        # Place 1 lecture session (80m), then place the Lab after Lecture on any shared day.
        if faculty_load.subject_required_minutes(c_lec) == 80:
            lec_slots = lecture_slots_for(c_lec, is_cvmas=is_cvmas)
            b_slots = lab_slots_for(c_lab, is_cvmas=is_cvmas)
            lec_hours = faculty_load.round_hours(80.0 / 60.0)
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

            placed_l = _place_single_4hr_slot(
                semester_id=semester_id, curriculum_id=c_lec.id, faculty_id=pid,
                days_to_try=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                slots=lec_slots, all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
            )
            if placed_l:
                pending_schedules.append(placed_l)
                all_schedules.append(placed_l)
                scheduled_offerings.add((pid, c_lec.id))
                faculty_hours_used[pid] += lec_hours
                added += 1
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c_lec,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type="lecture",
                    slots_to_try=lec_slots,
                    single_days_to_try=["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    curr_code_map=curr_code_map,
                )
                pending_conflicts.append(models.Conflict(faculty_id=pid, curriculum_id=c_lec.id, conflict_type="unplaced_lecture", reason=reason_msg))
                unplaced.append({"faculty": pid, "curriculum_id": c_lec.id, "subject": c_lec.code, "part_type": "lecture", "reason": reason_msg})

            placed_b = _place_lab_slot(
                semester_id=semester_id, curriculum_id=c_lab.id, faculty_id=pid,
                day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                slots=b_slots, rooms_by_type=rooms_by_type,
                all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
                after_schedules=[placed_l] if placed_l else None,
            )
            if placed_b:
                s1, s2 = placed_b
                pending_schedules.extend([s1, s2])
                all_schedules.extend([s1, s2])
                scheduled_offerings.add((pid, c_lab.id))
                faculty_hours_used[pid] += lab_hours
                added += 2
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c_lab,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type="lab",
                    slots_to_try=b_slots,
                    day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    after_schedules=[placed_l] if placed_l else None,
                    curr_code_map=curr_code_map,
                )
                pending_conflicts.append(models.Conflict(faculty_id=pid, curriculum_id=c_lab.id, conflict_type="unplaced_lab", reason=reason_msg))
                unplaced.append({"faculty": pid, "curriculum_id": c_lab.id, "subject": c_lab.code, "part_type": "lab", "reason": reason_msg})
            continue

        lec_slots = lecture_slots_for(c_lec, is_cvmas=is_cvmas)
        b_slots = lab_slots_for(c_lab, is_cvmas=is_cvmas)
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
            cohort_by_curr_id=cohort_by_curr_id,
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
            reason_msg = diagnose_unplaced_reason(
                curriculum=c_lec,
                faculty=f_obj,
                faculty_id=pid,
                part_type="consecutive_lec_lab",
                paired_curriculum=c_lab,
                lecture_slots=lec_slots,
                lab_slots=b_slots,
                day_pairs_to_try=[MW_PAIR, TTH_PAIR, FS_PAIR],
                all_unavails=all_unavails,
                all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
                curr_code_map=curr_code_map,
            )
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
    cohort_by_curr_id=None,
    curr_code_map=None,
    is_cvmas: bool = False,
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

        enrolled = getattr(off, 'enrolled_students', None)
        if faculty_load.is_ct_tier(enrolled_students=enrolled):
            ct_mins = faculty_load.subject_required_minutes(c, enrolled_students=enrolled)
            proposed_hours_total = faculty_load.round_hours(ct_mins / 60.0)
            warn, conf = _calculate_workload_warnings(
                semester=semester, f_obj=f_obj, pid=pid, c=c, part_type=part_type,
                proposed_hours_total=proposed_hours_total, current_hours=faculty_hours_used[pid],
            )
            if warn:
                bumped_warnings.append(warn)
            if conf:
                pending_conflicts.append(conf)

            ct_placed = _place_ct_sessions(
                semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                target_minutes=ct_mins, enrolled_students=enrolled, credited_hours=proposed_hours_total,
                is_lab=is_lab, is_combined=False, all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id, is_cvmas=is_cvmas,
            )
            if ct_placed:
                pending_schedules.extend(ct_placed)
                all_schedules.extend(ct_placed)
                scheduled_offerings.add((pid, c.id))
                faculty_hours_used[pid] += proposed_hours_total
                added += len(ct_placed)
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type=f"{part_type} (CT)",
                    target_minutes=ct_mins,
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    single_days_to_try=SINGLE_DAYS_ORDER if is_lab else ['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                    curr_code_map=curr_code_map,
                )
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
            continue

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

            standard_lec_slots = filter_slots_for_department(STANDARD_LECTURE_SLOTS, is_cvmas)
            placed_single = _place_single_4hr_slot(
                semester_id=semester_id,
                curriculum_id=c.id,
                faculty_id=pid,
                days_to_try=['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                slots=standard_lec_slots,
                all_unavails=all_unavails,
                all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
            )
            if placed_single:
                pending_schedules.append(placed_single)
                all_schedules.append(placed_single)
                scheduled_offerings.add((pid, c.id))
                faculty_hours_used[pid] += proposed_hours_total
                added += 1
            else:
                reason_msg = diagnose_unplaced_reason(
                    curriculum=c,
                    faculty=f_obj,
                    faculty_id=pid,
                    part_type="lecture",
                    slots_to_try=standard_lec_slots,
                    single_days_to_try=['Mon', 'Wed', 'Tue', 'Thu', 'Fri', 'Sat'],
                    all_unavails=all_unavails,
                    all_schedules=all_schedules,
                    cohort_by_curr_id=cohort_by_curr_id,
                    curr_code_map=curr_code_map,
                )
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
        slots = lab_slots_for(c, is_cvmas=is_cvmas) if is_lab else lecture_slots_for(c, is_cvmas=is_cvmas)

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
                cohort_by_curr_id=cohort_by_curr_id,
            )
        else:
            placed_pair = _place_lab_slot(
                semester_id=semester_id, curriculum_id=c.id, faculty_id=pid,
                day_pairs_to_try=day_pairs_to_try, slots=slots,
                rooms_by_type=rooms_by_type, all_unavails=all_unavails, all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
            )

        if placed_pair:
            sched1, sched2 = placed_pair
            pending_schedules.extend([sched1, sched2])
            all_schedules.extend([sched1, sched2])
            scheduled_offerings.add((pid, c.id))
            faculty_hours_used[pid] += proposed_hours_total
            added += 2
        else:
            reason_msg = diagnose_unplaced_reason(
                curriculum=c,
                faculty=f_obj,
                faculty_id=pid,
                part_type=part_type,
                slots_to_try=slots,
                day_pairs_to_try=day_pairs_to_try,
                all_unavails=all_unavails,
                all_schedules=all_schedules,
                cohort_by_curr_id=cohort_by_curr_id,
                curr_code_map=curr_code_map,
            )
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

        for warn in bumped_warnings:
            for conf in pending_conflicts:
                if conf.faculty_id == warn.get("faculty_id") and conf.curriculum_id == warn.get("curriculum_id") and conf.conflict_type in ("overload", "part_time_ceiling"):
                    warn["conflict_id"] = conf.id
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
