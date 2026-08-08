"""
Faculty teaching load, computed the way the institution actually computes it.

The rule that matters, and the one ATLAS previously got wrong: teaching load is
measured in **hours per week**, derived from the plotted class schedule --

    class duration x meetings per week = REG. HOURS

-- and *not* from subject units. Units are academic information; they are stored
on Curriculum and shown on curriculum screens, but they are not the basis of a
faculty member's load. Before this module, `Faculty.max_units` (an integer, 18
by default) was compared against an hours figure accumulated from start/end
times, so an 18-unit cap silently behaved as an 18-hour cap and the two numbers
were never the same quantity.

The required load is not a per-faculty setting either. It is fixed by the term
and the employment type, so it is derived here rather than stored on the row.
"""

from datetime import time
from typing import Dict, Iterable, List, Optional

from .. import models

# Required weekly teaching hours for a Full-Time faculty member, by term.
# The 1st term carries the heavier teaching load; the 2nd and 3rd trade four of
# those hours for off-campus work (see WORK_WEEK below), which is why the total
# work week stays at 40 across all three.
FULL_TIME_REQUIRED_HOURS = {
    "1st": 24.0,
    "2nd": 20.0,
    "3rd": 20.0,
}

# A Part-Time faculty member teaches *less than* 20 hours a week. The exact
# minimum and maximum are unconfirmed by the institution, so no required target
# is asserted for them -- they are never reported as UNDERLOAD, because there is
# no figure to be under. This ceiling is only used to warn when a part-timer has
# been plotted into full-time territory.
PART_TIME_CEILING_HOURS = 20.0

# The Full-Time 40-hour work week. Teaching is only part of it; the rest is
# fixed non-teaching duty. Office hours are the remainder, so the row always
# totals 40 and never needs to be kept in sync by hand.
TOTAL_WORK_WEEK_HOURS = 40.0
OFF_CAMPUS_HOURS = {"1st": 2.5, "2nd": 5.5, "3rd": 5.5}
CONSULTATION_HOURS = {"1st": 6.0, "2nd": 6.0, "3rd": 6.0}

# Confirmed institutional lecture/laboratory patterns. These are *expected*
# shapes used to flag a plot that looks off-pattern; they never replace the
# plotted figure, which stays authoritative.
#
# "COE" in the institution's own summary means the engineering programme. ATLAS
# has no College of Engineering -- its four colleges are CVMAS, CBMA, COED and
# CAST -- and engineering exists as the BSCPE programme inside CAST, so the
# engineering pattern attaches at programme level.
ENGINEERING_PROGRAM_CODES = {"BSCPE"}
ENGINEERING_PATTERN = {"lecture": 4.00, "lab": 4.00}
STANDARD_PATTERN = {"lecture": 2.67, "lab": 4.00}

# Hours are reported to two decimals (2.67, 30.67). Comparisons use a tolerance
# slightly wider than that last place so accumulated floating-point noise in a
# sum of 80-minute meetings cannot tip an exactly-complete load into OVERLOAD.
HOURS_PRECISION = 2
_EQUALITY_TOLERANCE = 0.005

UNDERLOAD = "UNDERLOAD"
REGULAR = "REGULAR"
OVERLOAD = "OVERLOAD"

# Two states that are not verdicts on a faculty member at all, but statements
# about how far the term's planning has got. Reporting either as UNDERLOAD --
# which is what happens when 0.00 plotted hours is compared against a required
# figure -- reads as an accusation about the person, and buries the real
# underloads among faculty nobody has plotted yet.
NOT_PLOTTED = "NOT_PLOTTED"      # subjects assigned, timetable not generated
NO_ACTIVE_TERM = "NO_ACTIVE_TERM"  # no active semester, so no hours can exist


def normalise_term(term: Optional[str]) -> Optional[str]:
    """
    Reduce a Semester.term value to the key used by the tables above.

    The stored enum is ('1st', '2nd', '3rd semester') -- the third member
    carries a trailing word the other two do not -- and terms are typed by hand
    elsewhere as "1st Term", "Term 1" and so on. Only the leading digit is
    reliable, so that is what is read.
    """
    if not term:
        return None
    for digit, key in (("1", "1st"), ("2", "2nd"), ("3", "3rd")):
        if digit in str(term):
            return key
    return None


def is_full_time(employment_type: Optional[str]) -> bool:
    return (employment_type or "full_time").lower().startswith("full")


def required_teaching_hours(term: Optional[str], employment_type: Optional[str]) -> Optional[float]:
    """
    Required weekly teaching hours, or None when no target applies.

    None means "ATLAS does not know what this person is supposed to teach", and
    is returned for every Part-Time member (the institution has not confirmed
    their figures) and for an unrecognised term. A None target must never be
    rendered as 0, which would report a fully-loaded part-timer as OVERLOAD.
    """
    if not is_full_time(employment_type):
        return None
    return FULL_TIME_REQUIRED_HOURS.get(normalise_term(term))


def duration_hours(start_t: time, end_t: time) -> float:
    """Length of one meeting, in hours. 7:30-8:50 is 1.333..., not 1.5."""
    return (end_t.hour * 60 + end_t.minute - start_t.hour * 60 - start_t.minute) / 60.0


def round_hours(value: float) -> float:
    return round(value, HOURS_PRECISION)


def load_status(actual_hours: float, required_hours: Optional[float]) -> Optional[str]:
    """
    UNDERLOAD / REGULAR / OVERLOAD, or None when there is no required figure.
    """
    if required_hours is None:
        return None
    difference = actual_hours - required_hours
    if abs(difference) <= _EQUALITY_TOLERANCE:
        return REGULAR
    return OVERLOAD if difference > 0 else UNDERLOAD


def compute_reg_hours(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> Dict[int, float]:
    """
    REG. HOURS per faculty member for one term, from the plotted schedule.

    Every plotted row counts, draft as well as published: a draft timetable is
    still a plot, and the generator accounts for its own placements the same way
    while it works. Faculty with subject offerings but nothing plotted yet come
    back as 0.0 -- that is the true plotted figure, and reporting an estimate in
    its place would put a number the schedule cannot support in front of a chair.
    """
    ids = list(faculty_ids)
    totals = {fid: 0.0 for fid in ids}
    if not ids or not semester_id:
        return totals

    rows = db.query(
        models.Schedule.faculty_id,
        models.Schedule.start_time,
        models.Schedule.end_time,
    ).filter(
        models.Schedule.semester_id == semester_id,
        models.Schedule.faculty_id.in_(ids),
        models.Schedule.start_time.isnot(None),
        models.Schedule.end_time.isnot(None),
    ).all()

    for faculty_id, start_t, end_t in rows:
        if faculty_id in totals:
            totals[faculty_id] += duration_hours(start_t, end_t)

    return {fid: round_hours(hours) for fid, hours in totals.items()}


def expected_pattern(program_code: Optional[str]) -> Dict[str, float]:
    """Expected weekly lecture/laboratory hours for a programme."""
    if program_code and program_code.upper() in ENGINEERING_PROGRAM_CODES:
        return dict(ENGINEERING_PATTERN)
    return dict(STANDARD_PATTERN)


def curriculum_program_code(curriculum) -> Optional[str]:
    """
    The programme a subject belongs to.

    `program_code` is denormalised onto the curriculum row by the importer but
    is nullable, so the seeded block -> programme relationship is the fallback.
    """
    direct = getattr(curriculum, "program_code", None)
    if direct:
        return direct
    block = getattr(curriculum, "block", None)
    program = getattr(block, "program", None) if block else None
    return getattr(program, "code", None) if program else None


def work_week_breakdown(term: Optional[str], employment_type: Optional[str]) -> Optional[dict]:
    """
    The Full-Time 40-hour work week for a term.

    40 hours is the *total* duty week, not 40 teaching hours -- the distinction
    this returns. Office hours absorb the remainder so the parts always sum to
    40. Returns None for Part-Time, who have no defined 40-hour week.
    """
    key = normalise_term(term)
    if key is None or not is_full_time(employment_type):
        return None

    teaching = FULL_TIME_REQUIRED_HOURS[key]
    off_campus = OFF_CAMPUS_HOURS[key]
    consultation = CONSULTATION_HOURS[key]
    office = TOTAL_WORK_WEEK_HOURS - teaching - off_campus - consultation

    return {
        "term": key,
        "teaching_hours": teaching,
        "off_campus_hours": off_campus,
        "consultation_hours": consultation,
        "office_hours": round_hours(office),
        "total_hours": TOTAL_WORK_WEEK_HOURS,
    }


def summarise(
    reg_hours: float,
    term: Optional[str],
    employment_type: Optional[str],
    has_offerings: bool = False,
) -> dict:
    """
    The full load picture for one faculty member, ready to serialise.

    `overload_hours` and `remaining_hours` are deliberately both present and
    both nullable: a member is only ever one of the two, and collapsing them
    into a single signed number reads as a negative overload on screen.

    `has_offerings` separates "nobody has plotted this timetable yet" from a
    real underload. Both show 0.00 hrs, but only one of them is about the
    faculty member, and a chair looking at a fresh term needs to be told to
    generate a timetable rather than shown a page of apparent underloads.
    """
    actual = round_hours(reg_hours)
    required = required_teaching_hours(term, employment_type)
    status = load_status(actual, required)

    if normalise_term(term) is None:
        # No active semester, or one whose term ATLAS cannot read. There is no
        # required figure and no schedule to measure, so no verdict is possible.
        status = NO_ACTIVE_TERM
    elif actual == 0.0 and has_offerings:
        status = NOT_PLOTTED

    overload = None
    remaining = None
    if required is not None:
        if status == OVERLOAD:
            overload = round_hours(actual - required)
        elif status == UNDERLOAD:
            remaining = round_hours(required - actual)

    # A part-timer has no target, so the only thing that can be said about their
    # load is whether it has crossed into full-time territory.
    exceeds_ceiling = (
        not is_full_time(employment_type) and actual >= PART_TIME_CEILING_HOURS
    )

    return {
        "reg_hours": actual,
        "required_hours": required,
        "load_status": status,
        "overload_hours": overload,
        "remaining_hours": remaining,
        "part_time_ceiling_hours": None if is_full_time(employment_type) else PART_TIME_CEILING_HOURS,
        "exceeds_part_time_ceiling": exceeds_ceiling,
        "work_week": work_week_breakdown(term, employment_type),
    }


def active_semester(db):
    """The term load is reported against, or None when no term is active."""
    return db.query(models.Semester).filter(models.Semester.is_active == True).first()  # noqa: E712


def faculty_with_offerings(db, faculty_ids: Iterable[int], semester_id: Optional[int]) -> set:
    """
    Which faculty have subjects assigned for the term.

    Needed to tell an unplotted timetable apart from a genuine underload: both
    read 0.00 hrs, but only a member who has been given subjects is waiting on
    generation rather than on the chair.
    """
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
    hours = compute_reg_hours(db, ids, semester_id)
    with_offerings = faculty_with_offerings(db, ids, semester_id)

    return {
        f.id: summarise(hours.get(f.id, 0.0), term, f.type, f.id in with_offerings)
        for f in faculty_members
    }
