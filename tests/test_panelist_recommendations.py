import unittest
from datetime import time
from backend.app.services.faculty_load import (
    subject_required_minutes,
    subject_required_hours,
    allowed_teaching_hours,
    format_minutes_label,
    is_combined_c_subject,
    calculate_consultation_workload,
    work_week_breakdown,
    FULL_TIME_PROBATIONARY_HOURS,
    FULL_TIME_REGULAR_HOURS,
    PART_TIME_MAX_HOURS,
    OFF_CAMPUS_HOURS,
    CONSULTATION_HOURS,
    MAX_OVERLOAD_HOURS,
)
from backend.app.services.schedule_generator import (
    is_lunch_break_conflict,
    LUNCH_BREAK_START,
    LUNCH_BREAK_END,
    LUNCH_BREAK_DAYS,
)

class SubjectStub:
    def __init__(self, code, name, units, lec_units, lab_units, type_='lecture'):
        self.code = code
        self.name = name
        self.units = units
        self.lec_units = lec_units
        self.lab_units = lab_units
        self.type = type_

class PanelistRecommendationsTestCase(unittest.TestCase):
    def test_lecture_exact_minutes(self):
        # 1 unit = 80 min (1h 20m)
        s1 = SubjectStub("LEC101", "Lecture 1 Unit", 1, 1, 0, "lecture")
        self.assertEqual(subject_required_minutes(s1), 80)
        self.assertEqual(subject_required_hours(s1), 1.33)
        self.assertEqual(format_minutes_label(80), "1 hr 20 mins")

        # 2 units = 160 min (2h 40m)
        s2 = SubjectStub("LEC102", "Lecture 2 Units", 2, 2, 0, "lecture")
        self.assertEqual(subject_required_minutes(s2), 160)
        self.assertEqual(subject_required_hours(s2), 2.67)
        self.assertEqual(format_minutes_label(160), "2 hrs 40 mins")

        # 3 units = 240 min (4h)
        s3 = SubjectStub("LEC103", "Lecture 3 Units", 3, 3, 0, "lecture")
        self.assertEqual(subject_required_minutes(s3), 240)
        self.assertEqual(subject_required_hours(s3), 4.0)
        self.assertEqual(format_minutes_label(240), "4 hrs")

    def test_laboratory_exact_minutes(self):
        # 1 unit = 240 min (4h)
        s1 = SubjectStub("LAB101", "Lab 1 Unit", 1, 0, 1, "lab")
        self.assertEqual(subject_required_minutes(s1), 240)
        self.assertEqual(subject_required_hours(s1), 4.0)
        self.assertEqual(format_minutes_label(240), "4 hrs")

        # 2 units = 480 min (8h)
        s2 = SubjectStub("LAB102", "Lab 2 Units", 2, 0, 2, "lab")
        self.assertEqual(subject_required_minutes(s2), 480)
        self.assertEqual(subject_required_hours(s2), 8.0)
        self.assertEqual(format_minutes_label(480), "8 hrs")

    def test_combined_c_versus_separate_lec_lab(self):
        # Genuine Combined (C) subject: 3 units = 240 min (4h)
        sc = SubjectStub("CS101C", "Combined Subject C", 3, 2, 1, "combined")
        self.assertTrue(is_combined_c_subject(sc))
        self.assertEqual(subject_required_minutes(sc), 240)
        self.assertEqual(subject_required_hours(sc), 4.0)
        self.assertEqual(format_minutes_label(240), "4 hrs")

        # Separate Lec (A) + Lab (B) subject: 2u lec (160m) + 1u lab (240m) = 400 min (6h 40m)
        s_sep = SubjectStub("CS102", "Separate Lec and Lab", 3, 2, 1, "lecture")
        self.assertFalse(is_combined_c_subject(s_sep))
        self.assertEqual(subject_required_minutes(s_sep), 400)
        self.assertEqual(subject_required_hours(s_sep), 6.67)
        self.assertEqual(format_minutes_label(400), "6 hrs 40 mins")

    def test_faculty_teaching_hour_limits_per_term(self):
        # Full-Time Probationary: 24h / 24h / 24h
        self.assertEqual(allowed_teaching_hours("1st", "full_time_probationary"), 24.0)
        self.assertEqual(allowed_teaching_hours("2nd", "full_time_probationary"), 24.0)
        self.assertEqual(allowed_teaching_hours("3rd", "full_time_probationary"), 24.0)

        # Full-Time Regular: 24h (1st), 20h (2nd), 20h (3rd)
        self.assertEqual(allowed_teaching_hours("1st", "full_time_regular"), 24.0)
        self.assertEqual(allowed_teaching_hours("2nd", "full_time_regular"), 20.0)
        self.assertEqual(allowed_teaching_hours("3rd", "full_time_regular"), 20.0)

        # Part-Time: Max 20h / 20h / 20h
        self.assertEqual(allowed_teaching_hours("1st", "part_time"), 20.0)
        self.assertEqual(allowed_teaching_hours("2nd", "part_time"), 20.0)
        self.assertEqual(allowed_teaching_hours("3rd", "part_time"), 20.0)

    def test_mandatory_lunch_break_rules(self):
        # 12:00 PM to 01:00 PM Monday through Friday
        for day in ["Mon", "Tue", "Wed", "Thu", "Fri"]:
            # Overlap during lunch break
            self.assertTrue(is_lunch_break_conflict(day, time(11, 30), time(12, 30)))
            self.assertTrue(is_lunch_break_conflict(day, time(12, 0), time(13, 0)))
            self.assertTrue(is_lunch_break_conflict(day, time(12, 30), time(13, 30)))
            self.assertTrue(is_lunch_break_conflict(day, time(11, 0), time(14, 0)))

            # Cleanly before or after lunch break
            self.assertFalse(is_lunch_break_conflict(day, time(10, 0), time(12, 0)))
            self.assertFalse(is_lunch_break_conflict(day, time(13, 0), time(15, 0)))

        # Saturday is exempt
        self.assertFalse(is_lunch_break_conflict("Sat", time(12, 0), time(13, 0)))
        self.assertFalse(is_lunch_break_conflict("Sat", time(11, 30), time(13, 30)))

    def test_faculty_schemas_always_use_hours(self):
        from backend.app.schemas import FacultyCreate
        # Default full-time regular should have 24 hours
        f1 = FacultyCreate(first_name="Maria", last_name="Santos", type="full_time_regular")
        self.assertEqual(f1.load_unit, "hours")
        self.assertEqual(f1.max_units, 24)

        # Default part-time should have 20 hours
        f2 = FacultyCreate(first_name="Pedro", last_name="Penduko", type="part_time")
        self.assertEqual(f2.load_unit, "hours")
        self.assertEqual(f2.max_units, 20)

        # Default full-time probationary should have 24 hours
        f3 = FacultyCreate(first_name="Juan", last_name="Cruz", type="full_time_probationary")
        self.assertEqual(f3.load_unit, "hours")
        self.assertEqual(f3.max_units, 24)

    def test_subject_offering_assigned_minutes_computation(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.services.faculty_load import compute_assigned_minutes, compute_assigned_hours, summarise_many

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        db.add(dept)
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        db.add(sem)
        fac = models.Faculty(id=1, first_name="Alan", last_name="Turing", email="alan@dlsau.edu.ph", type="full_time_regular", department_id=1)
        db.add(fac)
        curr = models.Curriculum(id=1, code="CS101", name="Intro to CS", units=3, lec_units=3, lab_units=0, type="lecture", department_id=1)
        db.add(curr)
        db.commit()

        off = models.SubjectOffering(id=1, faculty_id=1, curriculum_id=1, semester_id=1)
        db.add(off)
        db.commit()

        # Check compute_assigned_minutes works without attribute error
        assigned_mins = compute_assigned_minutes(db, [1], 1)
        self.assertEqual(assigned_mins.get(1), 240) # 3 units = 240 mins (4 hrs)

        assigned_hrs = compute_assigned_hours(db, [1], 1)
        self.assertEqual(assigned_hrs.get(1), 4.0)

        # Check summarise_many runs cleanly
        summary = summarise_many(db, [fac], sem)
        self.assertIn(1, summary)
        self.assertEqual(summary[1]["assigned_hours"], 4.0)
        self.assertEqual(summary[1]["assigned_minutes"], 240)
        self.assertEqual(summary[1]["allowed_hours"], 24.0)

        # Check get_professors endpoint logic executes cleanly
        from backend.app.routers.professors import get_professors
        admin_user = models.User(id=1, email="admin@dlsau.edu.ph", role="admin", password_hash="pw", is_verified=True)
        res = get_professors(skip=0, limit=100, department_id=1, db=db, current_user=admin_user)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["max_units"], 24)
        self.assertEqual(res[0]["load_unit"], "hours")

    def test_panelist_consultation_and_overload_calculations(self):
        # 1. Baseline parameters
        self.assertEqual(CONSULTATION_HOURS["1st"], 6.0)
        self.assertEqual(CONSULTATION_HOURS["2nd"], 6.0)
        self.assertEqual(CONSULTATION_HOURS["3rd"], 6.0)

        self.assertEqual(OFF_CAMPUS_HOURS["1st"], 2.5)
        self.assertEqual(OFF_CAMPUS_HOURS["2nd"], 5.5)
        self.assertEqual(OFF_CAMPUS_HOURS["3rd"], 5.5)

        self.assertEqual(MAX_OVERLOAD_HOURS["1st"], 7.5)
        self.assertEqual(MAX_OVERLOAD_HOURS["2nd"], 8.5)
        self.assertEqual(MAX_OVERLOAD_HOURS["3rd"], 8.5)

        # 2. Overload within allocated office hours:
        # 2nd term, 5.0h overload:
        # Office = 8.5 - 5.0 = 3.5h. Consultation = 6.0h (untouched)
        calc_term2 = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=5.0)
        self.assertEqual(calc_term2["standard_consultation"], 6.0)
        self.assertEqual(calc_term2["allocated_office"], 8.5)
        self.assertEqual(calc_term2["deducted_from_office"], 5.0)
        self.assertEqual(calc_term2["remaining_office"], 3.5)
        self.assertEqual(calc_term2["excess_overload"], 0.0)
        self.assertEqual(calc_term2["deducted_from_consultation"], 0.0)
        self.assertEqual(calc_term2["adjusted_consultation"], 6.0)
        self.assertFalse(calc_term2["policy_review_flag"])

        # 3. 1st term example: 4.5h overload within 7.5h office hours:
        # Office = 7.5 - 4.5 = 3.0h. Consultation = 6.0h (untouched)
        calc_term1 = calculate_consultation_workload("1st", "full_time_regular", actual_overload=4.5)
        self.assertEqual(calc_term1["standard_consultation"], 6.0)
        self.assertEqual(calc_term1["allocated_office"], 7.5)
        self.assertEqual(calc_term1["deducted_from_office"], 4.5)
        self.assertEqual(calc_term1["remaining_office"], 3.0)
        self.assertEqual(calc_term1["excess_overload"], 0.0)
        self.assertEqual(calc_term1["deducted_from_consultation"], 0.0)
        self.assertEqual(calc_term1["adjusted_consultation"], 6.0)
        self.assertFalse(calc_term1["policy_review_flag"])

        # 4. Zero overload keeps standard 6.0 hours consultation and full office hours
        calc_zero = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=0.0)
        self.assertEqual(calc_zero["adjusted_consultation"], 6.0)
        self.assertEqual(calc_zero["remaining_office"], 8.5)
        self.assertEqual(calc_zero["excess_overload"], 0.0)
        self.assertFalse(calc_zero["policy_review_flag"])

        # 5. Overload exceeding office hours (10.0h in 2nd term):
        # Office = 0.0h. Excess = 10.0 - 8.5 = 1.5h. Consultation = 6.0 - 1.5 = 4.5h
        calc_high = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=10.0)
        self.assertEqual(calc_high["remaining_office"], 0.0)
        self.assertEqual(calc_high["deducted_from_office"], 8.5)
        self.assertEqual(calc_high["excess_overload"], 1.5)
        self.assertEqual(calc_high["deducted_from_consultation"], 1.5)
        self.assertEqual(calc_high["adjusted_consultation"], 4.5)
        self.assertFalse(calc_high["policy_review_flag"])

        # 6. Extreme overload exceeding office + consultation (> 14.5h in 2nd term):
        calc_excess = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=15.0)
        self.assertEqual(calc_excess["remaining_office"], 0.0)
        self.assertEqual(calc_excess["adjusted_consultation"], 0.0)
        self.assertTrue(calc_excess["policy_review_flag"])
        self.assertIn("exceeds available office", calc_excess["flag_reason"].lower())

        # 7. Part-Time faculty is exempt
        calc_pt = calculate_consultation_workload("2nd", "part_time", actual_overload=5.0)
        self.assertEqual(calc_pt["adjusted_consultation"], 0.0)
        self.assertFalse(calc_pt["policy_review_flag"])

        # 8. Work week breakdown integration (all components sum to 40.0h)
        ww = work_week_breakdown("2nd", "full_time_regular", actual_overload=5.0)
        self.assertIsNotNone(ww)
        self.assertEqual(ww["teaching_hours"], 25.0)
        self.assertEqual(ww["off_campus_hours"], 5.5)
        self.assertEqual(ww["office_hours"], 3.5)
        self.assertEqual(ww["consultation_hours"], 6.0)
        self.assertEqual(ww["total_hours"], 40.0)
        self.assertEqual(ww["actual_overload_hours"], 5.0)
        self.assertEqual(ww["overload_difference"], 3.5)
        self.assertEqual(ww["total_hours"], 40.0)

    def test_solve_conflict_respects_faculty_unavailability(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.routers.ai_scheduler import solve_conflict, SolveConflictRequest

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        db.add(dept)
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        db.add(sem)
        fac = models.Faculty(id=1, first_name="Grace", last_name="Hopper", email="grace@dlsau.edu.ph", type="full_time_regular", department_id=1)
        db.add(fac)
        curr = models.Curriculum(id=1, code="CS201", name="Data Structures", units=3, lec_units=3, lab_units=0, type="lecture", department_id=1)
        db.add(curr)
        db.commit()

        # Mark faculty UNAVAILABLE for Mon & Wed morning slots
        unavail1 = models.FacultyUnavailability(faculty_id=1, day_of_week="Mon", start_time=time(7, 30), end_time=time(12, 0))
        unavail2 = models.FacultyUnavailability(faculty_id=1, day_of_week="Wed", start_time=time(7, 30), end_time=time(12, 0))
        db.add_all([unavail1, unavail2])
        db.commit()

        chair_user = models.User(
            id=2,
            first_name="Chair",
            last_name="Person",
            email="chair@dlsau.edu.ph",
            password_hash="pw",
            role="program_chair",
            department="Computer Science",
            is_verified=True
        )
        db.add(chair_user)
        db.commit()

        req = SolveConflictRequest(
            faculty_id=1,
            curriculum_id=1,
            semester_id=1,
            part_type="lecture"
        )
        res = solve_conflict(req, db, current_user=chair_user)
        self.assertEqual(res["status"], "success")

        # Verify that newly plotted classes NEVER overlap the unavailable morning period
        placed_scheds = db.query(models.Schedule).filter(models.Schedule.faculty_id == 1, models.Schedule.curriculum_id == 1).all()
        self.assertGreater(len(placed_scheds), 0)
        for s in placed_scheds:
            if s.day_of_week in ("Mon", "Wed"):
                # Must be after 12:00 PM (and after 13:00 PM lunch)
                self.assertGreaterEqual(s.start_time, time(13, 0))

if __name__ == "__main__":
    unittest.main()
