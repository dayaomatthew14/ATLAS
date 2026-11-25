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
# Exact-Minute Subject Conversion Rules (Regular 13+ & Converted Tutorial CT)
# ---------------------------------------------------------------------------

CT_TIER_REGULAR = "regular"
CT_TIER_9_12 = "ct_9_12"
CT_TIER_5_8 = "ct_5_8"
CT_TIER_1_4 = "ct_1_4"

VALID_CT_TIERS = {CT_TIER_REGULAR, CT_TIER_9_12, CT_TIER_5_8, CT_TIER_1_4}

CT_TIER_LABELS = {
    CT_TIER_REGULAR: "Regular (13+ students)",
    CT_TIER_9_12: "CT (9–12 students)",
    CT_TIER_5_8: "CT (5–8 students)",
    CT_TIER_1_4: "CT (1–4 students)",
}

CT_TIER_SHORT_LABELS = {
    CT_TIER_REGULAR: "Regular",
    CT_TIER_9_12: "CT · 9–12",
    CT_TIER_5_8: "CT · 5–8",
    CT_TIER_1_4: "CT · 1–4",
}

CT_TIER_DEFAULT_STUDENTS = {
    CT_TIER_REGULAR: None,
    CT_TIER_9_12: 12,
    CT_TIER_5_8: 8,
    CT_TIER_1_4: 4,
}


def normalise_ct_tier(ct_tier: Optional[str] = None, enrolled_students: Optional[int] = None) -> str:
    """
    Resolve a Converted Tutorial (CT) tier from either an explicit tier key or
    an actual enrolled student count:
      - None or >= 13 students -> 'regular'
      - 9..12 students         -> 'ct_9_12'
      - 5..8 students          -> 'ct_5_8'
      - 1..4 students          -> 'ct_1_4'
    """
    if ct_tier is not None and str(ct_tier).strip():
        raw = str(ct_tier).strip().lower()
        if raw in VALID_CT_TIERS:
            return raw
    if enrolled_students is not None:
        try:
            count = int(enrolled_students)
        except (TypeError, ValueError):
            return CT_TIER_REGULAR
        if count <= 0 or count >= 13:
            return CT_TIER_REGULAR
        if count >= 9:
            return CT_TIER_9_12
        if count >= 5:
            return CT_TIER_5_8
        return CT_TIER_1_4
    return CT_TIER_REGULAR


def is_ct_tier(ct_tier: Optional[str] = None, enrolled_students: Optional[int] = None) -> bool:
    return normalise_ct_tier(ct_tier=ct_tier, enrolled_students=enrolled_students) != CT_TIER_REGULAR


def ct_tier_from_students(enrolled_students: Optional[int] = None) -> str:
    """Convenience helper to resolve CT tier from enrolled student count."""
    return normalise_ct_tier(enrolled_students=enrolled_students)


def students_for_ct_tier(ct_tier: Optional[str]) -> Optional[int]:
    norm = normalise_ct_tier(ct_tier=ct_tier)
    return CT_TIER_DEFAULT_STUDENTS.get(norm)


def ct_tier_label(ct_tier: Optional[str] = None, enrolled_students: Optional[int] = None) -> str:
    norm = normalise_ct_tier(ct_tier=ct_tier, enrolled_students=enrolled_students)
    return CT_TIER_LABELS.get(norm, CT_TIER_LABELS[CT_TIER_REGULAR])


def ct_tier_short_label(ct_tier: Optional[str] = None, enrolled_students: Optional[int] = None) -> str:
    norm = normalise_ct_tier(ct_tier=ct_tier, enrolled_students=enrolled_students)
    return CT_TIER_SHORT_LABELS.get(norm, CT_TIER_SHORT_LABELS[CT_TIER_REGULAR])


def lecture_minutes_for_units(lec_units: int, ct_tier: str = CT_TIER_REGULAR) -> int:
    """
    Lecture (A) weekly minutes by units and CT enrollment tier:
      1 unit:  Regular 80m (1.33h) | 9-12: 60m (1h)  | 5-8: 60m (1h)    | 1-4: 60m (1h)
      2 units: Regular 160m (2.67h)| 9-12: 120m (2h) | 5-8: 90m (1.5h)  | 1-4: 60m (1h)
      3 units: Regular 240m (4h)   | 9-12: 180m (3h) | 5-8: 120m (2h)   | 1-4: 60m (1h)
    """
    u = max(0, int(lec_units or 0))
    if u == 0:
        return 0
    tier = normalise_ct_tier(ct_tier=ct_tier)
    if tier == CT_TIER_REGULAR:
        return u * 80
    table = {
        1: {CT_TIER_9_12: 60, CT_TIER_5_8: 60, CT_TIER_1_4: 60},
        2: {CT_TIER_9_12: 120, CT_TIER_5_8: 90, CT_TIER_1_4: 60},
        3: {CT_TIER_9_12: 180, CT_TIER_5_8: 120, CT_TIER_1_4: 60},
    }
    if u in table:
        return table[u][tier]
    factor = {CT_TIER_9_12: 0.75, CT_TIER_5_8: 0.50, CT_TIER_1_4: 0.25}[tier]
    return max(60, int(round(u * 80 * factor)))


def lab_minutes_for_units(lab_units: int, ct_tier: str = CT_TIER_REGULAR) -> int:
    """
    Laboratory (B) weekly minutes by units and CT enrollment tier:
      1 unit:  Regular 240m (4h) | 9-12: 180m (3h) | 5-8: 120m (2h) | 1-4: 60m (1h)
      2 units: Regular 480m (8h) | 9-12: 360m (6h) | 5-8: 240m (4h) | 1-4: 120m (2h)
    """
    u = max(0, int(lab_units or 0))
    if u == 0:
        return 0
    tier = normalise_ct_tier(ct_tier=ct_tier)
    if tier == CT_TIER_REGULAR:
        return u * 240
    factor = {CT_TIER_9_12: 0.75, CT_TIER_5_8: 0.50, CT_TIER_1_4: 0.25}[tier]
    return max(60, int(round(u * 240 * factor)))


def combined_minutes_for_units(units: int = 3, ct_tier: str = CT_TIER_REGULAR) -> int:
    """
    Combined Lecture/Laboratory (C) weekly minutes by units and CT enrollment tier:
      3 units: Regular 240m (4h) | 9-12: 180m (3h) | 5-8: 120m (2h) | 1-4: 60m (1h)
    """
    u = max(1, int(units or 3))
    base = 240 if u == 3 else int(round((u / 3.0) * 240))
    tier = normalise_ct_tier(ct_tier=ct_tier)
    if tier == CT_TIER_REGULAR:
        return base
    factor = {CT_TIER_9_12: 0.75, CT_TIER_5_8: 0.50, CT_TIER_1_4: 0.25}[tier]
    return max(60, int(round(base * factor)))


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


def subject_required_minutes(
    curriculum,
    enrolled_students: Optional[int] = None,
    ct_tier: Optional[str] = None,
) -> int:
    """
    Calculate exact required weekly teaching minutes for a curriculum subject,
    applying Converted Tutorial (CT) rules when enrolled_students < 13 or a CT tier is active:
    - Genuine Combined (C): 3 units = 240m (Regular) | 180m (9-12) | 120m (5-8) | 60m (1-4)
    - Subject with both separate Lecture (A) and Lab (B) units (not C):
      lecture_minutes_for_units(lec_units, tier) + lab_minutes_for_units(lab_units, tier)
    - Laboratory (B):
      1u = 240m / 180m / 120m / 60m; 2u = 480m / 360m / 240m / 120m
    - Lecture (A):
      1u = 80m / 60m / 60m / 60m; 2u = 160m / 120m / 90m / 60m; 3u = 240m / 180m / 120m / 60m
    """
    if curriculum is None:
        return 0

    tier = normalise_ct_tier(ct_tier=ct_tier, enrolled_students=enrolled_students)
    total_u = int(getattr(curriculum, "units", 0) or 0)
    lec_u = int(getattr(curriculum, "lec_units", 0) or 0)
    lab_u = int(getattr(curriculum, "lab_units", 0) or 0)

    if is_combined_c_subject(curriculum):
        effective_u = total_u if total_u > 0 else (lec_u + lab_u if (lec_u + lab_u) > 0 else 3)
        return combined_minutes_for_units(effective_u, ct_tier=tier)

    if lec_u > 0 and lab_u > 0:
        return lecture_minutes_for_units(lec_u, ct_tier=tier) + lab_minutes_for_units(lab_u, ct_tier=tier)

    if is_lab_b_subject(curriculum):
        effective_lab = lab_u if lab_u > 0 else (total_u if total_u > 0 else 1)
        return lab_minutes_for_units(effective_lab, ct_tier=tier)

    effective_lec = lec_u if lec_u > 0 else (total_u if total_u > 0 else 3)
    return lecture_minutes_for_units(effective_lec, ct_tier=tier)


def subject_required_hours(
    curriculum,
    enrolled_students: Optional[int] = None,
    ct_tier: Optional[str] = None,
) -> float:
    """Required weekly teaching hours for a curriculum subject (rounded to 2 decimal places)."""
    return round_hours(
        subject_required_minutes(curriculum, enrolled_students=enrolled_students, ct_tier=ct_tier) / 60.0
    )


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
    Exact teaching minutes for one scheduled meeting.
    Calculated directly from meeting start and end times.
    """
    s_min = start_t.hour * 60 + start_t.minute
    e_min = end_t.hour * 60 + end_t.minute
    return max(0, e_min - s_min)


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
    """
    Exact plotted weekly teaching minutes per faculty member for one term.
    For Regular (13+ students) classes, sums exact plotted clock minutes across meetings.
    For Converted Tutorial (CT, <13 students) classes, credits the exact CT teaching minutes
    defined by the institutional CT conversion table once per plotted subject offering.
    """
    ids = list(faculty_ids)
    totals = {fid: 0 for fid in ids}
    if not ids or not semester_id:
        return totals

    rows = db.query(
        models.Schedule.faculty_id,
        models.Schedule.curriculum_id,
        models.Schedule.day_of_week,
        models.Schedule.start_time,
        models.Schedule.end_time,
        models.Schedule.enrolled_students,
    ).filter(
        models.Schedule.semester_id == semester_id,
        models.Schedule.faculty_id.in_(ids),
        models.Schedule.start_time.isnot(None),
        models.Schedule.end_time.isnot(None),
    ).all()

    if not rows:
        return totals

    # Load active-term SubjectOfferings + Curriculum to inspect CT status cleanly
    offering_ct_map: Dict[tuple, tuple] = {}
    offerings = (
        db.query(models.SubjectOffering, models.Curriculum)
        .join(models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id)
        .filter(
            models.SubjectOffering.semester_id == semester_id,
            models.SubjectOffering.faculty_id.in_(ids),
        )
        .all()
    )
    for off, curr in offerings:
        offering_ct_map[(off.faculty_id, off.curriculum_id)] = (off.enrolled_students, curr)

    # Also fetch Curriculum records for any plotted schedule that has enrolled_students directly
    missing_curr_ids = {
        cid for (_fid, cid, _d, _s, _e, enr) in rows
        if cid is not None and enr is not None and (_fid, cid) not in offering_ct_map
    }
    extra_currs = {}
    if missing_curr_ids:
        for c in db.query(models.Curriculum).filter(models.Curriculum.id.in_(missing_curr_ids)).all():
            extra_currs[c.id] = c

    # Group plotted meetings by (faculty_id, curriculum_id)
    grouped_minutes: Dict[tuple, int] = {}
    sched_enrolled: Dict[tuple, Optional[int]] = {}
    for faculty_id, curriculum_id, day_of_week, start_t, end_t, row_enrolled in rows:
        if faculty_id not in totals:
            continue
        key = (faculty_id, curriculum_id)
        grouped_minutes[key] = grouped_minutes.get(key, 0) + meeting_teaching_minutes(start_t, end_t, day_of_week)
        if row_enrolled is not None and key not in sched_enrolled:
            sched_enrolled[key] = row_enrolled

    for (faculty_id, curriculum_id), plotted_mins in grouped_minutes.items():
        enrolled = None
        curr = None
        if (faculty_id, curriculum_id) in offering_ct_map:
            enrolled, curr = offering_ct_map[(faculty_id, curriculum_id)]
        if enrolled is None and (faculty_id, curriculum_id) in sched_enrolled:
            enrolled = sched_enrolled[(faculty_id, curriculum_id)]
            curr = curr or extra_currs.get(curriculum_id)

        if curr is not None and is_ct_tier(enrolled_students=enrolled):
            totals[faculty_id] += subject_required_minutes(curr, enrolled_students=enrolled)
        else:
            totals[faculty_id] += plotted_mins

    return totals


def compute_reg_hours(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, float]:
    """Plotted REG. HOURS per faculty member for one term (derived from exact plotted minutes)."""
    mins_map = compute_plotted_minutes(db, faculty_ids, semester_id)
    return {fid: round_hours(mins / 60.0) for fid, mins in mins_map.items()}


def compute_assigned_minutes(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, int]:
    """
    Exact assigned weekly teaching minutes per faculty member from SubjectOffering rows
    in the active term (respecting Converted Tutorial CT tiers). Counted once per SubjectOffering.
    """
    ids = list(faculty_ids)
    totals = {fid: 0 for fid in ids}
    if not ids or not semester_id:
        return totals

    offerings = (
        db.query(models.SubjectOffering, models.Curriculum)
        .join(models.Curriculum, models.SubjectOffering.curriculum_id == models.Curriculum.id)
        .filter(
            models.SubjectOffering.semester_id == semester_id,
            models.SubjectOffering.faculty_id.in_(ids),
        )
        .all()
    )

    for off, curr in offerings:
        if off.faculty_id in totals and curr is not None:
            totals[off.faculty_id] += subject_required_minutes(curr, enrolled_students=off.enrolled_students)

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
    Faculty consultation hour, office hours, and overload cascade deduction rules:
    - Standard consultation allocation: 6.0 hours per term (FIXED, never deducted).
    - Off-campus hours: 2.5h (1st Term), 5.5h (2nd & 3rd Term).
    - Office hours: 7.5h (1st Term), 8.5h (2nd & 3rd Term).
    - Overload cascade deduction sequence:
      1. Overload hours must first be deducted from the allocated office hours.
      2. If overload exceeds available office hours, the remaining excess is then
         deducted from off-campus hours.
      3. Consultation hours is fixed at 6.0 hours.
      4. If excess overload exceeds available off-campus hours, it is flagged for policy review.
      5. Part-time faculty are exempt (have no 40h obligation).
    """
    norm_term = normalise_term(term)
    norm_type = normalise_employment_type(employment_type)
    if norm_term is None or not is_full_time(norm_type):
        return {
            "standard_consultation": 0.0,
            "adjusted_consultation": 0.0,
            "allocated_office": 0.0,
            "remaining_office": 0.0,
            "allocated_off_campus": 0.0,
            "remaining_off_campus": 0.0,
            "deducted_from_office": 0.0,
            "deducted_from_off_campus": 0.0,
            "deducted_from_consultation": 0.0,
            "excess_overload": 0.0,
            "unabsorbed_overload": 0.0,
            "max_overload": 0.0,
            "overload_difference": 0.0,
            "policy_review_flag": False,
            "flag_reason": None,
        }

    std_consultation = CONSULTATION_HOURS.get(norm_term, 6.0)
    # Full-Time Probationary carries 24h teaching in all terms (same as 1st term),
    # so its 40-hour work week uses the 24h non-teaching split (2.5h off-campus, 7.5h office).
    effective_split_term = "1st" if norm_type == "full_time_probationary" else norm_term
    alloc_office = ALLOCATED_OFFICE_HOURS.get(effective_split_term, 8.5)
    alloc_off_campus = OFF_CAMPUS_HOURS.get(effective_split_term, 5.5)
    overload = round_hours(max(0.0, actual_overload))

    # Step 1: Overload hours must first be deducted from allocated office hours
    deducted_from_office = min(alloc_office, overload)
    remaining_office = round_hours(alloc_office - deducted_from_office)

    # Step 2: If overload exceeds office hours, remaining excess is deducted from off-campus hours
    excess_overload = round_hours(max(0.0, overload - alloc_office))
    deducted_from_off_campus = min(alloc_off_campus, excess_overload)
    remaining_off_campus = round_hours(max(0.0, alloc_off_campus - excess_overload))
    unabsorbed_overload = round_hours(max(0.0, excess_overload - alloc_off_campus))

    # Step 3: Consultation hours is fixed at 6.0 hours (never deducted)
    adjusted_consultation = std_consultation
    deducted_from_consultation = 0.0

    # Step 4: Flag for policy review if excess overload exceeds office + off-campus hours
    policy_review = False
    flag_reason = None
    if unabsorbed_overload > _EQUALITY_TOLERANCE:
        policy_review = True
        flag_reason = (
            f"Overload ({overload:.2f}h) exceeds available office ({alloc_office:.2f}h) "
            f"and off-campus ({alloc_off_campus:.2f}h) hours."
        )

    return {
        "standard_consultation": std_consultation,
        "adjusted_consultation": adjusted_consultation,
        "allocated_office": alloc_office,
        "remaining_office": remaining_office,
        "allocated_off_campus": alloc_off_campus,
        "remaining_off_campus": remaining_off_campus,
        "deducted_from_office": deducted_from_office,
        "deducted_from_off_campus": deducted_from_off_campus,
        "deducted_from_consultation": deducted_from_consultation,
        "excess_overload": excess_overload,
        "unabsorbed_overload": unabsorbed_overload,
        "max_overload": round_hours(alloc_office + alloc_off_campus),
        "overload_difference": remaining_office,
        "policy_review_flag": policy_review,
        "flag_reason": flag_reason,
    }


def work_week_breakdown(
    term: Optional[str],
    employment_type: Optional[str],
    actual_overload: float = 0.0,
) -> Optional[dict]:
    """The Full-Time 40-hour work week for a term, including office and off-campus overload cascade adjustments."""
    key = normalise_term(term)
    if key is None or not is_full_time(employment_type):
        return None

    norm_type = normalise_employment_type(employment_type)
    base_teaching = required_teaching_hours(term, norm_type) or FULL_TIME_REGULAR_HOURS[key]
    consult_info = calculate_consultation_workload(term, norm_type, actual_overload)
    
    overload = round_hours(max(0.0, actual_overload))
    teaching = round_hours(base_teaching + overload)
    actual_total_hours = round_hours(
        teaching
        + consult_info["remaining_off_campus"]
        + consult_info["adjusted_consultation"]
        + consult_info["remaining_office"]
    )

    return {
        "term": key,
        "teaching_hours": teaching,
        "base_teaching_hours": base_teaching,
        "off_campus_hours": consult_info["remaining_off_campus"],
        "allocated_off_campus_hours": consult_info["allocated_off_campus"],
        "deducted_from_off_campus": consult_info["deducted_from_off_campus"],
        "consultation_hours": consult_info["adjusted_consultation"],
        "standard_consultation_hours": consult_info["standard_consultation"],
        "adjusted_consultation_hours": consult_info["adjusted_consultation"],
        "office_hours": consult_info["remaining_office"],
        "allocated_office_hours": consult_info["allocated_office"],
        "deducted_from_office": consult_info["deducted_from_office"],
        "deducted_from_consultation": consult_info["deducted_from_consultation"],
        "excess_overload_hours": consult_info["excess_overload"],
        "unabsorbed_overload_hours": consult_info["unabsorbed_overload"],
        "max_overload_hours": consult_info["max_overload"],
        "actual_overload_hours": overload,
        "overload_difference": consult_info["overload_difference"],
        "policy_review_flag": consult_info["policy_review_flag"],
        "flag_reason": consult_info["flag_reason"],
        "total_hours": actual_total_hours,
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
