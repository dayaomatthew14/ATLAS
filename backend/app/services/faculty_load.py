"""
Faculty teaching load and subject-hour conversion rules.

Teaching load is measured in **weekly teaching hours** (with **exact weekly
minutes** as the internal source of truth), never academic units.

1. Subject Weekly Teaching Hours (applies to all courses with >= 13 students,
   across all degree programs):
   - Lecture (A):
     * 1 unit = 1 hr 20 min / week (80 minutes)
     * 2 units = 2 hrs 40 min / week (160 minutes)
     * 3 units = 4 hrs / week (240 minutes)
   - Laboratory (B):
     * 1 unit = 4 hrs / week (240 minutes)
     * 2 units = 8 hrs / week (480 minutes)
   - Combined Lecture/Laboratory (C):
     * 3 units = 4 hrs / week (240 minutes)
   - Separate Lecture (A) and Laboratory (B) components are calculated
     individually (e.g., 2u Lec A + 1u Lab B = 160 + 240 = 400 min = 6h 40m).
     A subject is only treated as Combined (C) when its curriculum classification
     is genuinely C.

2. Faculty Classifications & Weekly Teaching-Hour Limits:
   - Full-Time Probationary (`full_time_probationary`):
     * 1st Term: 24 hrs (1440 min)
     * 2nd Term: 24 hrs (1440 min)
     * 3rd Term: 24 hrs (1440 min)
   - Full-Time Regular (`full_time_regular` / legacy `full_time`):
     * 1st Term: 24 hrs (1440 min)
     * 2nd Term: 20 hrs (1200 min)
     * 3rd Term: 20 hrs (1200 min)
   - Part-Time (`part_time`):
     * 1st, 2nd, 3rd Term: Maximum 20 hrs (1200 min)

3. Workload Stages:
   - `assigned_hours` (`assigned_minutes`): Derived from SubjectOffering records
     in the active term (counted once per offering).
   - `reg_hours` (`plotted_minutes`): Derived from plotted Schedule meetings in
     the active term (excluding any Mon-Fri 12:00-13:00 lunch break overlap).
   - Assigned hours and plotted hours represent different stages of the same
     workload and are NEVER added together.
"""

import re
from datetime import time
from typing import Dict, Iterable, List, Optional

from .. import models

# Weekly teaching-hour limits by classification and term.
FULL_TIME_PROBATIONARY_HOURS = {
    "1st": 24.0,
    "2nd": 24.0,
    "3rd": 24.0,
}

FULL_TIME_REGULAR_HOURS = {
    "1st": 24.0,
    "2nd": 20.0,
    "3rd": 20.0,
}

# Alias kept for backward compatibility with callers importing FULL_TIME_REQUIRED_HOURS.
FULL_TIME_REQUIRED_HOURS = FULL_TIME_REGULAR_HOURS

PART_TIME_CEILING_HOURS = 20.0
PART_TIME_MAX_HOURS = {
    "1st": 20.0,
    "2nd": 20.0,
    "3rd": 20.0,
}

# The Full-Time 40-hour work week breakdown.
TOTAL_WORK_WEEK_HOURS = 40.0
OFF_CAMPUS_HOURS = {"1st": 2.5, "2nd": 5.5, "3rd": 5.5}
CONSULTATION_HOURS = {"1st": 6.0, "2nd": 6.0, "3rd": 6.0}
MAX_OVERLOAD_HOURS = {"1st": 7.5, "2nd": 8.5, "3rd": 8.5}

# Unified subject-hour pattern across all degree programs (courses with >= 13 students).
# Kept for backward compatibility with callers referencing these constants.
ENGINEERING_PROGRAM_CODES = {"BSCPE"}
ENGINEERING_PATTERN = {"lecture": 4.00, "lab": 4.00}
STANDARD_PATTERN = {"lecture": 4.00, "lab": 4.00}

# Mandatory 1-hour lunch break on Monday through Friday (12:00 PM - 01:00 PM).
LUNCH_BREAK_START = time(12, 0)
LUNCH_BREAK_END = time(13, 0)
LUNCH_BREAK_DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri"}

HOURS_PRECISION = 2
_EQUALITY_TOLERANCE = 0.005

UNDERLOAD = "UNDERLOAD"
REGULAR = "REGULAR"
OVERLOAD = "OVERLOAD"
NOT_PLOTTED = "NOT_PLOTTED"
NO_ACTIVE_TERM = "NO_ACTIVE_TERM"


def normalise_term(term: Optional[str]) -> Optional[str]:
    """Reduce a Semester.term value to '1st', '2nd', or '3rd'."""
    if not term:
        return None
    for digit, key in (("1", "1st"), ("2", "2nd"), ("3", "3rd")):
        if digit in str(term):
            return key
    return None


def normalise_employment_type(employment_type: Optional[str]) -> str:
    """
    Normalise employment classification into one of:
    - 'full_time_probationary'
    - 'full_time_regular' (default for legacy 'full_time')
    - 'part_time'
    """
    raw = (employment_type or "full_time_regular").strip().lower()
    if "part" in raw:
        return "part_time"
    if "probationary" in raw:
        return "full_time_probationary"
    return "full_time_regular"


def employment_type_label(employment_type: Optional[str]) -> str:
    """Human-readable label for a faculty classification."""
    norm = normalise_employment_type(employment_type)
    if norm == "full_time_probationary":
        return "Full-Time Probationary"
    if norm == "part_time":
        return "Part-Time"
    return "Full-Time Regular"


def is_full_time(employment_type: Optional[str]) -> bool:
    return normalise_employment_type(employment_type).startswith("full_time")


def is_probationary(employment_type: Optional[str]) -> bool:
    return normalise_employment_type(employment_type) == "full_time_probationary"


def required_teaching_hours(term: Optional[str], employment_type: Optional[str]) -> Optional[float]:
    """
    Required weekly teaching hours for Full-Time faculty (Regular or Probationary),
    or None for Part-Time (who have a 20h maximum ceiling rather than a minimum target)
    or when no valid term is active.
    """
    key = normalise_term(term)
    if key is None:
        return None
    norm_type = normalise_employment_type(employment_type)
    if norm_type == "full_time_probationary":
        return FULL_TIME_PROBATIONARY_HOURS.get(key)
    if norm_type == "full_time_regular":
        return FULL_TIME_REGULAR_HOURS.get(key)
    return None


def allowed_teaching_hours(term: Optional[str], employment_type: Optional[str]) -> Optional[float]:
    """
    Maximum/allowed normal weekly teaching hours before overload applies,
    determined by faculty classification and active academic term:
    - Full-Time Probationary: 24h / 24h / 24h
    - Full-Time Regular:      24h / 20h / 20h
    - Part-Time:              20h / 20h / 20h (Maximum 20 hours)
    """
    key = normalise_term(term)
    if key is None:
        norm_type = normalise_employment_type(employment_type)
        if norm_type == "part_time":
            return PART_TIME_CEILING_HOURS
        if norm_type == "full_time_probationary":
            return 24.0
        return None
    norm_type = normalise_employment_type(employment_type)
    if norm_type == "full_time_probationary":
        return FULL_TIME_PROBATIONARY_HOURS.get(key)
    if norm_type == "full_time_regular":
        return FULL_TIME_REGULAR_HOURS.get(key)
    return PART_TIME_MAX_HOURS.get(key, PART_TIME_CEILING_HOURS)


def allowed_teaching_minutes(term: Optional[str], employment_type: Optional[str]) -> Optional[int]:
    hrs = allowed_teaching_hours(term, employment_type)
    if hrs is None:
        return None
    return int(round(hrs * 60))


# ---------------------------------------------------------------------------
# Exact-Minute Subject Conversion Rules (Courses with >= 13 students)
# ---------------------------------------------------------------------------

def lecture_minutes_for_units(lec_units: int) -> int:
    """
    Lecture (A) weekly minutes:
      1 unit  ->  80 minutes (1 hr 20 min)
      2 units -> 160 minutes (2 hrs 40 min)
      3 units -> 240 minutes (4 hrs)
    """
    u = max(0, int(lec_units or 0))
    return u * 80


def lab_minutes_for_units(lab_units: int) -> int:
    """
    Laboratory (B) weekly minutes:
      1 unit  -> 240 minutes (4 hrs)
      2 units -> 480 minutes (8 hrs)
    """
    u = max(0, int(lab_units or 0))
    return u * 240


def combined_minutes_for_units(units: int = 3) -> int:
    """
    Combined Lecture/Laboratory (C) weekly minutes:
      3 units -> 240 minutes (4 hrs)
    """
    u = max(1, int(units or 3))
    if u == 3:
        return 240
    return int(round((u / 3.0) * 240))


def is_combined_c_subject(curriculum) -> bool:
    """
    Identify a genuine Combined (C) curriculum subject.
    Do NOT classify a subject as C merely because it has both lec_units and lab_units;
    separate A and B components must be calculated individually unless the curriculum
    explicitly designates the subject as Combined (C) via its code suffix or type.
    """
    if curriculum is None:
        return False
    raw_code = str(getattr(curriculum, "code", "") or "").strip()
    clean_code = re.sub(r"\s+", "", raw_code).upper()
    if re.match(r"^.*[0-9][_\-]?C$", clean_code):
        return True
    sub_type = str(getattr(curriculum, "type", "") or "").strip().lower()
    if sub_type in ("c", "combined", "lec_lab", "lec/lab"):
        return True
    return False


def is_lab_b_subject(curriculum) -> bool:
    """Identify a Laboratory (B) curriculum subject."""
    if curriculum is None or is_combined_c_subject(curriculum):
        return False
    raw_code = str(getattr(curriculum, "code", "") or "").strip()
    clean_code = re.sub(r"\s+", "", raw_code).upper()
    sub_type = str(getattr(curriculum, "type", "") or "").strip().lower()
    lec_u = int(getattr(curriculum, "lec_units", 0) or 0)
    lab_u = int(getattr(curriculum, "lab_units", 0) or 0)
    if sub_type in ("lab", "computer_lab"):
        return True
    if re.match(r"^.*[0-9][_\-]?B$", clean_code):
        return True
    if lab_u > 0 and lec_u == 0:
        return True
    return False


def subject_required_minutes(curriculum) -> int:
    """
    Calculate exact required weekly teaching minutes for a curriculum subject:
    - Genuine Combined (C): 3 units = 240 minutes (4 hrs)
    - Subject with both separate Lecture (A) and Lab (B) units (not C):
      lecture_minutes_for_units(lec_units) + lab_minutes_for_units(lab_units)
      (e.g., 2u Lec + 1u Lab = 160 + 240 = 400 minutes = 6 hrs 40 min)
    - Laboratory (B):
      1 unit = 240 min (4 hrs), 2 units = 480 min (8 hrs)
    - Lecture (A):
      1 unit = 80 min (1h 20m), 2 units = 160 min (2h 40m), 3 units = 240 min (4h)
    """
    if curriculum is None:
        return 0

    total_u = int(getattr(curriculum, "units", 0) or 0)
    lec_u = int(getattr(curriculum, "lec_units", 0) or 0)
    lab_u = int(getattr(curriculum, "lab_units", 0) or 0)

    if is_combined_c_subject(curriculum):
        effective_u = total_u if total_u > 0 else (lec_u + lab_u if (lec_u + lab_u) > 0 else 3)
        return combined_minutes_for_units(effective_u)

    if lec_u > 0 and lab_u > 0:
        return lecture_minutes_for_units(lec_u) + lab_minutes_for_units(lab_u)

    if is_lab_b_subject(curriculum):
        effective_lab = lab_u if lab_u > 0 else (total_u if total_u > 0 else 1)
        return lab_minutes_for_units(effective_lab)

    effective_lec = lec_u if lec_u > 0 else (total_u if total_u > 0 else 3)
    return lecture_minutes_for_units(effective_lec)


def subject_required_hours(curriculum) -> float:
    """Required weekly teaching hours for a curriculum subject (rounded to 2 decimal places)."""
    return round_hours(subject_required_minutes(curriculum) / 60.0)


def format_minutes_label(minutes: int) -> str:
    """Format exact minutes as human-readable hours and minutes (e.g., '2 hrs 40 mins' or '4 hrs')."""
    mins = max(0, int(round(minutes)))
    h = mins // 60
    m = mins % 60
    if h > 0 and m > 0:
        return f"{h} hr{'s' if h != 1 else ''} {m} min{'s' if m != 1 else ''}"
    if h > 0:
        return f"{h} hr{'s' if h != 1 else ''}"
    return f"{m} min{'s' if m != 1 else ''}"


def meeting_teaching_minutes(
    start_t: time,
    end_t: time,
    day_of_week: Optional[str] = None,
) -> int:
    """
    Exact teaching minutes for one scheduled meeting, excluding any overlap with
    the mandatory Mon-Fri 12:00 PM - 01:00 PM lunch break.
    """
    s_min = start_t.hour * 60 + start_t.minute
    e_min = end_t.hour * 60 + end_t.minute
    raw = max(0, e_min - s_min)
    if raw == 0:
        return 0

    if day_of_week in LUNCH_BREAK_DAYS:
        lunch_s = LUNCH_BREAK_START.hour * 60 + LUNCH_BREAK_START.minute
        lunch_e = LUNCH_BREAK_END.hour * 60 + LUNCH_BREAK_END.minute
        overlap = max(0, min(e_min, lunch_e) - max(s_min, lunch_s))
        raw = max(0, raw - overlap)

    return raw


def duration_hours(start_t: time, end_t: time, day_of_week: Optional[str] = None) -> float:
    """Length of one meeting in teaching hours (excluding Mon-Fri lunch break if applicable)."""
    return meeting_teaching_minutes(start_t, end_t, day_of_week) / 60.0


def round_hours(value: float) -> float:
    return round(value, HOURS_PRECISION)


def load_status(
    actual_hours: float,
    required_hours: Optional[float],
    employment_type: Optional[str] = None,
) -> Optional[str]:
    """
    Determine UNDERLOAD / REGULAR / OVERLOAD status.
    - Full-Time (Regular or Probationary): compared against `required_hours`.
    - Part-Time: allowed up to PART_TIME_CEILING_HOURS (20.0h). Never flagged as
      UNDERLOAD; flagged as OVERLOAD when > 20.0h, and REGULAR when > 0 and <= 20.0h.
    """
    if required_hours is None:
        if employment_type is not None and not is_full_time(employment_type):
            if actual_hours - PART_TIME_CEILING_HOURS > _EQUALITY_TOLERANCE:
                return OVERLOAD
            if actual_hours > _EQUALITY_TOLERANCE:
                return REGULAR
        return None
    difference = actual_hours - required_hours
    if abs(difference) <= _EQUALITY_TOLERANCE:
        return REGULAR
    return OVERLOAD if difference > 0 else UNDERLOAD


def compute_plotted_minutes(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, int]:
    """Exact plotted weekly teaching minutes per faculty member for one term."""
    ids = list(faculty_ids)
    totals = {fid: 0 for fid in ids}
    if not ids or not semester_id:
        return totals

    rows = db.query(
        models.Schedule.faculty_id,
        models.Schedule.day_of_week,
        models.Schedule.start_time,
        models.Schedule.end_time,
    ).filter(
        models.Schedule.semester_id == semester_id,
        models.Schedule.faculty_id.in_(ids),
        models.Schedule.start_time.isnot(None),
        models.Schedule.end_time.isnot(None),
    ).all()

    for faculty_id, day_of_week, start_t, end_t in rows:
        if faculty_id in totals:
            totals[faculty_id] += meeting_teaching_minutes(start_t, end_t, day_of_week)

    return totals


def compute_reg_hours(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, float]:
    """Plotted REG. HOURS per faculty member for one term (derived from exact plotted minutes)."""
    mins_map = compute_plotted_minutes(db, faculty_ids, semester_id)
    return {fid: round_hours(mins / 60.0) for fid, mins in mins_map.items()}


def compute_assigned_minutes(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, int]:
    """
    Exact assigned weekly teaching minutes per faculty member from SubjectOffering rows
    in the active term. Counted once per SubjectOffering (never duplicated across meetings).
    """
    ids = list(faculty_ids)
    totals = {fid: 0 for fid in ids}
    if not ids or not semester_id:
        return totals

    offerings = (
        db.query(models.SubjectOffering.faculty_id, models.Curriculum)
        .join(models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id)
        .filter(
            models.SubjectOffering.semester_id == semester_id,
            models.SubjectOffering.faculty_id.in_(ids),
        )
        .all()
    )

    for fid, curr in offerings:
        if fid in totals and curr is not None:
            totals[fid] += subject_required_minutes(curr)

    return totals


def compute_assigned_hours(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, float]:
    """Assigned weekly teaching hours per faculty member from SubjectOffering rows."""
    mins_map = compute_assigned_minutes(db, faculty_ids, semester_id)
    return {fid: round_hours(mins / 60.0) for fid, mins in mins_map.items()}


def expected_pattern(program_code: Optional[str] = None) -> Dict[str, float]:
    """Expected weekly lecture/laboratory hours for a 3-unit lecture and 1-unit lab across all programs."""
    return dict(STANDARD_PATTERN)


def curriculum_program_code(curriculum) -> Optional[str]:
    """The programme a subject belongs to."""
    direct = getattr(curriculum, "program_code", None)
    if direct:
        return direct
    block = getattr(curriculum, "block", None)
    program = getattr(block, "program", None) if block else None
    return getattr(program, "code", None) if program else None


ALLOCATED_OFFICE_HOURS = {"1st": 7.5, "2nd": 8.5, "3rd": 8.5}
MAX_OVERLOAD_HOURS = ALLOCATED_OFFICE_HOURS


def calculate_consultation_workload(
    term: Optional[str],
    employment_type: Optional[str],
    actual_overload: float = 0.0,
) -> dict:
    """
    Panelist consultation hour and overload cascade deduction rules:
    - Standard consultation allocation: 6.0 hours per term.
    - Off-campus hours: 2.5h (1st Term), 5.5h (2nd & 3rd Term).
    - Office hours: 7.5h (1st Term), 8.5h (2nd & 3rd Term).
    - Cascade deduction rule:
      1. Overload hours must first be deducted from the allocated office hours.
      2. If overload exceeds available office hours, the remaining excess must then
         be deducted from the standard 6.0 consultation hours.
      3. If excess overload exceeds 6.0 hours, consultation is clamped to 0.0h and flagged.
      4. Part-time faculty are exempt (have no 40h obligation).
    """
    norm_term = normalise_term(term)
    norm_type = normalise_employment_type(employment_type)
    if norm_term is None or not is_full_time(norm_type):
        return {
            "standard_consultation": 0.0,
            "adjusted_consultation": 0.0,
            "allocated_office": 0.0,
            "remaining_office": 0.0,
            "deducted_from_office": 0.0,
            "deducted_from_consultation": 0.0,
            "excess_overload": 0.0,
            "max_overload": 0.0,
            "overload_difference": 0.0,
            "policy_review_flag": False,
            "flag_reason": None,
        }

    std_consultation = CONSULTATION_HOURS.get(norm_term, 6.0)
    alloc_office = ALLOCATED_OFFICE_HOURS.get(norm_term, 8.5)
    overload = round_hours(max(0.0, actual_overload))

    # Step 1: Overload hours must first be deducted from allocated office hours
    deducted_from_office = min(alloc_office, overload)
    remaining_office = round_hours(alloc_office - deducted_from_office)

    # Step 2: If overload exceeds office hours, remaining excess is deducted from consultation
    excess_overload = round_hours(max(0.0, overload - alloc_office))
    deducted_from_consultation = min(std_consultation, excess_overload)
    remaining_consultation = round_hours(max(0.0, std_consultation - excess_overload))

    # Step 3: Flag for policy review if excess overload exceeds consultation hours
    policy_review = False
    flag_reason = None
    if excess_overload > std_consultation + _EQUALITY_TOLERANCE:
        policy_review = True
        flag_reason = (
            f"Overload ({overload:.2f}h) exceeds available office ({alloc_office:.2f}h) "
            f"and consultation ({std_consultation:.2f}h) hours."
        )

    return {
        "standard_consultation": std_consultation,
        "adjusted_consultation": remaining_consultation,
        "allocated_office": alloc_office,
        "remaining_office": remaining_office,
        "deducted_from_office": deducted_from_office,
        "deducted_from_consultation": deducted_from_consultation,
        "excess_overload": excess_overload,
        "max_overload": alloc_office,
        "overload_difference": remaining_office,
        "policy_review_flag": policy_review,
        "flag_reason": flag_reason,
    }


def work_week_breakdown(
    term: Optional[str],
    employment_type: Optional[str],
    actual_overload: float = 0.0,
) -> Optional[dict]:
    """The Full-Time 40-hour work week for a term, including office and consultation overload cascade adjustments."""
    key = normalise_term(term)
    if key is None or not is_full_time(employment_type):
        return None

    base_teaching = required_teaching_hours(term, employment_type) or FULL_TIME_REGULAR_HOURS[key]
    off_campus = OFF_CAMPUS_HOURS[key]
    consult_info = calculate_consultation_workload(term, employment_type, actual_overload)
    
    overload = round_hours(max(0.0, actual_overload))
    teaching = round_hours(base_teaching + overload)

    return {
        "term": key,
        "teaching_hours": teaching,
        "base_teaching_hours": base_teaching,
        "off_campus_hours": off_campus,
        "consultation_hours": consult_info["adjusted_consultation"],
        "standard_consultation_hours": consult_info["standard_consultation"],
        "adjusted_consultation_hours": consult_info["adjusted_consultation"],
        "office_hours": consult_info["remaining_office"],
        "allocated_office_hours": consult_info["allocated_office"],
        "deducted_from_office": consult_info["deducted_from_office"],
        "deducted_from_consultation": consult_info["deducted_from_consultation"],
        "excess_overload_hours": consult_info["excess_overload"],
        "max_overload_hours": consult_info["max_overload"],
        "actual_overload_hours": overload,
        "overload_difference": consult_info["overload_difference"],
        "policy_review_flag": consult_info["policy_review_flag"],
        "flag_reason": consult_info["flag_reason"],
        "total_hours": TOTAL_WORK_WEEK_HOURS,
    }


def summarise(
    reg_hours: float,
    term: Optional[str],
    employment_type: Optional[str],
    has_offerings: bool = False,
    assigned_hours: Optional[float] = None,
    overload_approved: bool = False,
) -> dict:
    """
    Full workload summary for one faculty member.
    `reg_hours` (plotted schedule hours) and `assigned_hours` (assigned SubjectOffering
    hours) represent distinct workload stages and are NEVER summed together.
    """
    actual = round_hours(reg_hours)
    assigned = round_hours(assigned_hours) if assigned_hours is not None else 0.0
    norm_type = normalise_employment_type(employment_type)
    required = required_teaching_hours(term, norm_type)
    allowed = allowed_teaching_hours(term, norm_type)
    status = load_status(actual, required, norm_type)

    if normalise_term(term) is None:
        status = NO_ACTIVE_TERM
    elif actual == 0.0 and (has_offerings or assigned > 0.0):
        status = NOT_PLOTTED

    overload = None
    remaining = None
    limit_for_diff = required if required is not None else allowed
    if limit_for_diff is not None and normalise_term(term) is not None:
        diff = actual - limit_for_diff
        if diff > _EQUALITY_TOLERANCE:
            overload = round_hours(diff)
            status = OVERLOAD
        elif diff < -_EQUALITY_TOLERANCE:
            remaining = round_hours(limit_for_diff - actual)

    # Assigned-stage metrics (from SubjectOfferings, independent of plotted schedule)
    assigned_overload = None
    assigned_remaining = None
    assigned_status = load_status(assigned, required, norm_type) if normalise_term(term) is not None else NO_ACTIVE_TERM
    if limit_for_diff is not None and normalise_term(term) is not None:
        a_diff = assigned - limit_for_diff
        if a_diff > _EQUALITY_TOLERANCE:
            assigned_overload = round_hours(a_diff)
            assigned_status = OVERLOAD
        elif a_diff < -_EQUALITY_TOLERANCE:
            assigned_remaining = round_hours(limit_for_diff - assigned)

    exceeds_ceiling = (
        not is_full_time(norm_type) and (
            actual - PART_TIME_CEILING_HOURS > _EQUALITY_TOLERANCE
            or assigned - PART_TIME_CEILING_HOURS > _EQUALITY_TOLERANCE
        )
    )

    is_overloaded = bool(
        status == OVERLOAD
        or assigned_status == OVERLOAD
        or exceeds_ceiling
    )
    requires_dean_approval = bool(is_overloaded and not overload_approved)

    active_overload = (
        overload if (overload is not None and overload > 0.0)
        else (assigned_overload if (assigned_overload is not None and assigned_overload > 0.0) else 0.0)
    )
    consult_calc = calculate_consultation_workload(term, norm_type, active_overload)

    return {
        "employment_type": norm_type,
        "employment_type_label": employment_type_label(norm_type),
        "reg_hours": actual,
        "plotted_hours": actual,
        "plotted_minutes": int(round(actual * 60)),
        "assigned_hours": assigned,
        "assigned_minutes": int(round(assigned * 60)),
        "required_hours": required,
        "allowed_hours": allowed,
        "load_status": status,
        "assigned_status": assigned_status,
        "overload_hours": overload,
        "remaining_hours": remaining,
        "assigned_overload_hours": assigned_overload,
        "assigned_remaining_hours": assigned_remaining,
        "part_time_ceiling_hours": None if is_full_time(norm_type) else PART_TIME_CEILING_HOURS,
        "exceeds_part_time_ceiling": exceeds_ceiling,
        "is_overloaded": is_overloaded,
        "overload_approved": bool(overload_approved),
        "requires_dean_approval": requires_dean_approval,
        "max_overload_hours": consult_calc["max_overload"] if is_full_time(norm_type) else None,
        "standard_consultation_hours": consult_calc["standard_consultation"] if is_full_time(norm_type) else None,
        "adjusted_consultation_hours": consult_calc["adjusted_consultation"] if is_full_time(norm_type) else None,
        "overload_difference": consult_calc["overload_difference"] if is_full_time(norm_type) else None,
        "policy_review_flag": consult_calc["policy_review_flag"],
        "flag_reason": consult_calc["flag_reason"],
        "work_week": work_week_breakdown(term, norm_type, active_overload),
    }


def active_semester(db):
    """The term load is reported against, or None when no term is active."""
    return db.query(models.Semester).filter(models.Semester.is_active == True).first()  # noqa: E712


def faculty_with_offerings(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> set:
    """Which faculty have subjects assigned for the term."""
    ids = list(faculty_ids)
    if not ids or not semester_id:
        return set()

    rows = db.query(models.SubjectOffering.faculty_id).filter(
        models.SubjectOffering.semester_id == semester_id,
        models.SubjectOffering.faculty_id.in_(ids),
    ).distinct().all()
    return {row[0] for row in rows if row[0] is not None}


def summarise_many(db, faculty_members: List[models.Faculty], semester=None) -> Dict[int, dict]:
    """Load summaries keyed by faculty id, for a list page."""
    if semester is None:
        semester = active_semester(db)
    term = getattr(semester, "term", None) if semester else None
    semester_id = getattr(semester, "id", None) if semester else None

    ids = [f.id for f in faculty_members]
    plotted_hours = compute_reg_hours(db, ids, semester_id)
    assigned_hours = compute_assigned_hours(db, ids, semester_id)
    with_offerings = faculty_with_offerings(db, ids, semester_id)

    return {
        f.id: summarise(
            reg_hours=plotted_hours.get(f.id, 0.0),
            term=term,
            employment_type=f.type,
            has_offerings=(f.id in with_offerings),
            assigned_hours=assigned_hours.get(f.id, 0.0),
            overload_approved=bool(getattr(f, "overload_approved", False)),
        )
        for f in faculty_members
    }
