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
        # Lunch break is flexible and not a fixed hard lock at 12:00 PM - 01:00 PM
        from backend.app.services.faculty_load import meeting_teaching_minutes

        for day in ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]:
            # Classes spanning midday or 12:00 PM - 01:00 PM do NOT raise lunch break conflicts
            self.assertFalse(is_lunch_break_conflict(day, time(11, 30), time(12, 30)))
            self.assertFalse(is_lunch_break_conflict(day, time(12, 0), time(13, 0)))
            self.assertFalse(is_lunch_break_conflict(day, time(12, 30), time(13, 30)))
            self.assertFalse(is_lunch_break_conflict(day, time(11, 30), time(13, 30)))

            # Meeting teaching minutes calculates full duration (e.g. 11:30 to 13:30 is 120 mins)
            self.assertEqual(meeting_teaching_minutes(time(11, 30), time(13, 30), day), 120)

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
        # Office = 0.0h. Excess = 10.0 - 8.5 = 1.5h deducted from Off-Campus (5.5 - 1.5 = 4.0h). Consultation = 6.0h (fixed)
        calc_high = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=10.0)
        self.assertEqual(calc_high["remaining_office"], 0.0)
        self.assertEqual(calc_high["deducted_from_office"], 8.5)
        self.assertEqual(calc_high["excess_overload"], 1.5)
        self.assertEqual(calc_high["deducted_from_off_campus"], 1.5)
        self.assertEqual(calc_high["remaining_off_campus"], 4.0)
        self.assertEqual(calc_high["deducted_from_consultation"], 0.0)
        self.assertEqual(calc_high["adjusted_consultation"], 6.0)
        self.assertFalse(calc_high["policy_review_flag"])

        # 6. Extreme overload exceeding office + off-campus (> 14.0h in 2nd term: 8.5 + 5.5 = 14.0h):
        calc_excess = calculate_consultation_workload("2nd", "full_time_regular", actual_overload=15.0)
        self.assertEqual(calc_excess["remaining_office"], 0.0)
        self.assertEqual(calc_excess["remaining_off_campus"], 0.0)
        self.assertEqual(calc_excess["deducted_from_off_campus"], 5.5)
        self.assertEqual(calc_excess["adjusted_consultation"], 6.0)
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
                # Must be after 12:00 PM (the unavailable morning period ended at 12:00)
                self.assertGreaterEqual(s.start_time, time(12, 0))

    def test_solve_conflict_overload_cascade(self):
        """
        Verify that resolving an overload conflict applies the DLSAU workload cascade deduction:
        - 6.0 allotted consultation hours
        - Off-campus hours: 2.5h (1st term) or 5.5h (2nd/3rd term)
        - Office hours: max 7.5h (1st term) or 8.5h (2nd/3rd term)
        - Overload deducted from office hours first; remaining excess deducted from consultation hours.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.routers.ai_scheduler import solve_conflict, SolveConflictRequest

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Engineering", code="CEA")
        db.add(dept)
        # 2nd term: office 8.5h, off-campus 5.5h, consultation 6.0h
        sem = models.Semester(id=1, term="2nd", academic_year="2026-2027", is_active=True)
        db.add(sem)
        fac = models.Faculty(id=3, first_name="Melanie", last_name="Asuncion", email="melanie@dlsau.edu.ph", type="full_time_regular", department_id=1)
        db.add(fac)
        curr = models.Curriculum(id=277, code="COEP170B", name="Computer Lab", units=2, lec_units=0, lab_units=2, type="lab", department_id=1)
        db.add(curr)
        db.commit()

        chair_user = models.User(
            id=1,
            first_name="Chair",
            last_name="Person",
            email="chair@dlsau.edu.ph",
            password_hash="pw",
            role="program_chair",
            department="Engineering",
            is_verified=True
        )
        db.add(chair_user)
        db.commit()

        # Case 1: 8.0h overload within 8.5h office hours
        conf1 = models.Conflict(
            id=1,
            faculty_id=3,
            curriculum_id=277,
            conflict_type="overload",
            reason="Overload for Engr. Melanie Asuncion (Full-Time Regular): 20.0 + 8.0 hrs/week exceeds the 20.0 hrs/week allowed load by 8.0 hrs"
        )
        db.add(conf1)
        db.commit()

        req1 = SolveConflictRequest(conflict_id=1, faculty_id=3, curriculum_id=277, semester_id=1)
        res1 = solve_conflict(req1, db, current_user=chair_user)

        self.assertEqual(res1["status"], "success")
        self.assertEqual(res1["action_taken"], "overload_approved")
        self.assertIn("cascade", res1)
        cas1 = res1["cascade"]
        self.assertEqual(cas1["overload_hours"], 8.0)
        self.assertEqual(cas1["allocated_office"], 8.5)
        self.assertEqual(cas1["deducted_from_office"], 8.0)
        self.assertEqual(cas1["remaining_office"], 0.5)
        self.assertEqual(cas1["deducted_from_consultation"], 0.0)
        self.assertEqual(cas1["remaining_consultation"], 6.0)
        self.assertEqual(cas1["off_campus_hours"], 5.5)
        self.assertIn("8.0h deducted from office hours (0.5h of 8.5h remaining)", res1["details"])
        self.assertIn("Off-campus hours remain at 5.5h", res1["details"])
        self.assertIn("Consultation hours are fixed at 6.0h", res1["details"])

        # Case 2: 10.0h overload exceeding office hours (spills into off-campus hours, consultation fixed at 6.0h)
        conf2 = models.Conflict(
            id=2,
            faculty_id=3,
            curriculum_id=277,
            conflict_type="overload",
            reason="Overload for Engr. Melanie Asuncion (Full-Time Regular): 20.0 + 10.0 hrs/week exceeds the 20.0 hrs/week allowed load by 10.0 hrs"
        )
        db.add(conf2)
        db.commit()

        req2 = SolveConflictRequest(conflict_id=2, faculty_id=3, curriculum_id=277, semester_id=1)
        res2 = solve_conflict(req2, db, current_user=chair_user)

        self.assertEqual(res2["status"], "success")
        cas2 = res2["cascade"]
        self.assertEqual(cas2["overload_hours"], 10.0)
        self.assertEqual(cas2["deducted_from_office"], 8.5)
        self.assertEqual(cas2["remaining_office"], 0.0)
        self.assertEqual(cas2["deducted_from_off_campus"], 1.5)
        self.assertEqual(cas2["remaining_off_campus"], 4.0)
        self.assertEqual(cas2["off_campus_hours"], 4.0)
        self.assertEqual(cas2["deducted_from_consultation"], 0.0)
        self.assertEqual(cas2["remaining_consultation"], 6.0)
        self.assertIn("8.5h deducted from office hours (0.0h of 8.5h remaining)", res2["details"])
        self.assertIn("1.5h deducted from off-campus hours (4.0h of 5.5h remaining)", res2["details"])
        self.assertIn("Consultation hours are fixed at 6.0h", res2["details"])

        # Case 3: 1st term: office is 7.5h max, off-campus is 2.5h, 9.0h overload
        sem_t1 = models.Semester(id=2, term="1st", academic_year="2026-2027", is_active=False)
        db.add(sem_t1)
        conf3 = models.Conflict(
            id=3,
            faculty_id=3,
            curriculum_id=277,
            conflict_type="overload",
            reason="Overload for Engr. Melanie Asuncion (Full-Time Regular): 24.0 + 9.0 hrs/week exceeds the 24.0 hrs/week allowed load by 9.0 hrs"
        )
        db.add(conf3)
        db.commit()

        req3 = SolveConflictRequest(conflict_id=3, faculty_id=3, curriculum_id=277, semester_id=2)
        res3 = solve_conflict(req3, db, current_user=chair_user)

        self.assertEqual(res3["status"], "success")
        cas3 = res3["cascade"]
        self.assertEqual(cas3["overload_hours"], 9.0)
        self.assertEqual(cas3["allocated_office"], 7.5)
        self.assertEqual(cas3["deducted_from_office"], 7.5)
        self.assertEqual(cas3["remaining_office"], 0.0)
        self.assertEqual(cas3["deducted_from_off_campus"], 1.5)
        self.assertEqual(cas3["remaining_off_campus"], 1.0)
        self.assertEqual(cas3["off_campus_hours"], 1.0)
        self.assertEqual(cas3["deducted_from_consultation"], 0.0)
        self.assertEqual(cas3["remaining_consultation"], 6.0)
        self.assertIn("7.5h deducted from office hours (0.0h of 7.5h remaining)", res3["details"])
        self.assertIn("1.5h deducted from off-campus hours (1.0h of 2.5h remaining)", res3["details"])
        self.assertIn("Consultation hours are fixed at 6.0h", res3["details"])

    def test_converted_tutorial_hours_matrix(self):
        """Verify all 6 subject types across Regular (13+), 9-12, 5-8, and 1-4 students."""
        from types import SimpleNamespace
        cases = [
            # (subject, regular, ct_9_12, ct_5_8, ct_1_4)
            (SimpleNamespace(code="COEP110B", type="lab", units=1, lec_units=0, lab_units=1), 4.0, 3.0, 2.0, 1.0),
            (SimpleNamespace(code="COEP272B", type="lab", units=2, lec_units=0, lab_units=2), 8.0, 6.0, 4.0, 2.0),
            (SimpleNamespace(code="CS101A", type="lecture", units=1, lec_units=1, lab_units=0), 1.33, 1.0, 1.0, 1.0),
            (SimpleNamespace(code="CS102A", type="lecture", units=2, lec_units=2, lab_units=0), 2.67, 2.0, 1.5, 1.0),
            (SimpleNamespace(code="CS103A", type="lecture", units=3, lec_units=3, lab_units=0), 4.0, 3.0, 2.0, 1.0),
            (SimpleNamespace(code="COEC343C", type="combined", units=3, lec_units=2, lab_units=1), 4.0, 3.0, 2.0, 1.0),
        ]
        for subj, reg, h9_12, h5_8, h1_4 in cases:
            self.assertAlmostEqual(subject_required_hours(subj), reg, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=13), reg, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=12), h9_12, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=9), h9_12, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=8), h5_8, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=5), h5_8, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=4), h1_4, places=2)
            self.assertAlmostEqual(subject_required_hours(subj, enrolled_students=1), h1_4, places=2)

    def test_converted_tutorial_recalculates_plotted_load_and_cascade(self):
        """
        Switching an assigned offering to CT immediately updates compute_reg_hours,
        compute_assigned_hours, and the 40-hour work week cascade (office/consultation).
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models, schemas
        from backend.app.services import faculty_load
        from backend.app.routers.subject_offerings import update_subject_offering_ct

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        db.add(dept)
        sem = models.Semester(id=1, term="2nd", academic_year="2026-2027", is_active=True)
        db.add(sem)
        fac = models.Faculty(
            id=1, first_name="Melanie", last_name="Asuncion",
            email="masuncion@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        db.add(fac)
        chair = models.User(
            id=1, first_name="Chair", last_name="User",
            email="chair@dlsau.edu.ph", password_hash="pw",
            role="program_chair", department="CAST", is_verified=True
        )
        db.add(chair)

        # Assign 6 x 3-unit Lecture subjects = 24.0 hrs/week in 2nd term (4.0h overload over 20.0h)
        offerings = []
        for idx in range(1, 7):
            c = models.Curriculum(
                id=idx, code=f"COEP30{idx}A", name=f"Course {idx}",
                units=3, lec_units=3, lab_units=0, type="lecture", department_id=1
            )
            db.add(c)
            off = models.SubjectOffering(id=idx, faculty_id=1, curriculum_id=idx, semester_id=1)
            db.add(off)
            offerings.append(off)
            # Plotted 2 x 2h = 4h/week each
            db.add(models.Schedule(
                semester_id=1, curriculum_id=idx, faculty_id=1,
                day_of_week="Mon", start_time=time(7, 30), end_time=time(9, 30), section=""
            ))
            db.add(models.Schedule(
                semester_id=1, curriculum_id=idx, faculty_id=1,
                day_of_week="Wed", start_time=time(7, 30), end_time=time(9, 30), section=""
            ))
        db.commit()

        # Pre-enrollment (all regular): 24.0h -> OVERLOAD by 4.0h -> Office = 8.5 - 4.0 = 4.5h
        pre_summary = faculty_load.summarise_many(db, [fac], semester=sem)[1]
        self.assertEqual(pre_summary["reg_hours"], 24.0)
        self.assertEqual(pre_summary["load_status"], "OVERLOAD")
        self.assertEqual(pre_summary["work_week"]["office_hours"], 4.5)

        # Post-enrollment: 2 subjects converted to CT (5-8 students -> 2.0h each, -4.0h total)
        res1 = update_subject_offering_ct(1, schemas.SubjectOfferingCTUpdate(ct_tier="ct_5_8"), db, chair)
        res2 = update_subject_offering_ct(2, schemas.SubjectOfferingCTUpdate(ct_tier="ct_5_8"), db, chair)
        self.assertTrue(res1["is_ct"])
        self.assertEqual(res1["required_hours"], 2.0)
        self.assertEqual(res2["required_hours"], 2.0)

        # Load drops from 24.0h -> 20.0h (REGULAR), Office hours automatically restore to 8.5h!
        post_summary = faculty_load.summarise_many(db, [fac], semester=sem)[1]
        self.assertEqual(post_summary["reg_hours"], 20.0)
        self.assertEqual(post_summary["assigned_hours"], 20.0)
        self.assertEqual(post_summary["load_status"], "REGULAR")
        self.assertEqual(post_summary["work_week"]["office_hours"], 8.5)
        self.assertEqual(post_summary["work_week"]["consultation_hours"], 6.0)
        # Plotted blocks are automatically contracted to match the new CT duration (2h)
        self.assertTrue(res1["auto_adjusted"])
        self.assertFalse(res1["needs_reschedule"])
        self.assertEqual(res1["plotted_schedules_count"], 2)

    def test_reassign_preserves_ct_and_cleans_orphan_schedules(self):
        """
        Reassigning a subject to another professor via create_subject_offering
        must preserve enrolled_students/CT status and delete old professor's
        orphaned draft schedules.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models, schemas
        from backend.app.routers.subject_offerings import (
            create_subject_offering,
            update_subject_offering_ct,
        )

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        sem = models.Semester(id=1, term="2nd", academic_year="2026-2027", is_active=True)
        block = models.CurriculumBlock(
            id=1, department_id=1, program_name="BS Computer Science",
            academic_year="2026-2027", status="PUBLISHED",
        )
        prof_a = models.Faculty(
            id=1, first_name="Prof", last_name="Alpha",
            email="alpha@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        prof_b = models.Faculty(
            id=2, first_name="Prof", last_name="Beta",
            email="beta@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        chair = models.User(
            id=1, first_name="Chair", last_name="User",
            email="chair@dlsau.edu.ph", password_hash="pw",
            role="program_chair", department="CAST", is_verified=True
        )
        curr = models.Curriculum(
            id=10, block_id=1, code="COEP301A", name="Embedded Systems",
            units=3, lec_units=3, lab_units=0, type="lecture", department_id=1
        )
        db.add_all([dept, sem, block, prof_a, prof_b, chair, curr])
        db.commit()

        # Assign to Prof Alpha and set CT (5-8 students -> 2h)
        off = create_subject_offering(
            schemas.SubjectOfferingCreate(faculty_id=1, curriculum_id=10, semester_id=1),
            db,
            chair,
        )
        update_subject_offering_ct(off.id, schemas.SubjectOfferingCTUpdate(ct_tier="ct_5_8"), db, chair)

        # Plot a draft schedule for Prof Alpha
        db.add(models.Schedule(
            semester_id=1, curriculum_id=10, faculty_id=1,
            day_of_week="Mon", start_time=time(7, 30), end_time=time(9, 30),
            section="", status="draft",
        ))
        db.commit()

        # Reassign to Prof Beta
        reassigned = create_subject_offering(
            schemas.SubjectOfferingCreate(faculty_id=2, curriculum_id=10, semester_id=1),
            db,
            chair,
        )
        self.assertEqual(reassigned.faculty_id, 2)
        self.assertEqual(reassigned.enrolled_students, 8)
        self.assertEqual(reassigned.credited_hours_override, 2.0)

        # Old professor's draft schedule was cleaned up
        remaining_old = db.query(models.Schedule).filter(
            models.Schedule.faculty_id == 1,
            models.Schedule.curriculum_id == 10,
        ).count()
        self.assertEqual(remaining_old, 0)

    def test_cohort_clash_prevention_in_generator(self):
        """
        Two different professors teaching two subjects in the SAME Program + Year Level
        must NOT be auto-scheduled at overlapping times on the same day.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.services.schedule_generator import generate_schedules

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Engineering", code="CAST")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        block = models.CurriculumBlock(
            id=1, department_id=1, program_name="BS Computer Engineering",
            academic_year="2026-2027", status="PUBLISHED",
        )
        prof1 = models.Faculty(
            id=1, first_name="Juan", last_name="DelaCruz",
            email="juan@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        prof2 = models.Faculty(
            id=2, first_name="Maria", last_name="Santos",
            email="maria@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        c1 = models.Curriculum(
            id=1, code="COEP101A", name="Intro to CpE",
            units=3, lec_units=3, lab_units=0, type="lecture",
            department_id=1, block_id=1, year_level="1", semester_term="1st",
        )
        c2 = models.Curriculum(
            id=2, code="COEM102A", name="Calculus 1",
            units=3, lec_units=3, lab_units=0, type="lecture",
            department_id=1, block_id=1, year_level="1", semester_term="1st",
        )
        off1 = models.SubjectOffering(id=1, faculty_id=1, curriculum_id=1, semester_id=1)
        off2 = models.SubjectOffering(id=2, faculty_id=2, curriculum_id=2, semester_id=1)
        db.add_all([dept, sem, block, prof1, prof2, c1, c2, off1, off2])
        db.commit()

        result = generate_schedules(db, semester_id=1, faculty_ids=[1, 2], department_id=1)
        self.assertGreaterEqual(result["generated"], 4)

        all_scheds = db.query(models.Schedule).filter(models.Schedule.semester_id == 1).all()
        s_c1 = [s for s in all_scheds if s.curriculum_id == 1]
        s_c2 = [s for s in all_scheds if s.curriculum_id == 2]
        self.assertTrue(len(s_c1) > 0 and len(s_c2) > 0)

        for a in s_c1:
            for b in s_c2:
                if a.day_of_week == b.day_of_week:
                    self.assertFalse(
                        a.start_time < b.end_time and b.start_time < a.end_time,
                        f"Cohort clash found on {a.day_of_week}: {a.start_time}-{a.end_time} vs {b.start_time}-{b.end_time}",
                    )

    def test_ct_paired_lecture_before_lab_order(self):
        """
        When paired A (Lecture) and B (Lab) subjects are converted to CT,
        Lab must never be placed earlier than Lecture on a shared day.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.services.schedule_generator import generate_schedules

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        block = models.CurriculumBlock(
            id=1, department_id=1, program_name="BS Computer Science",
            academic_year="2026-2027", status="PUBLISHED",
        )
        prof = models.Faculty(
            id=1, first_name="Anna", last_name="Reyes",
            email="anna@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        lec = models.Curriculum(
            id=1, code="COEP110A", name="Logic Circuits",
            units=2, lec_units=2, lab_units=0, type="lecture",
            department_id=1, block_id=1, year_level="2", semester_term="1st",
        )
        lab = models.Curriculum(
            id=2, code="COEP110B", name="Logic Circuits Lab",
            units=1, lec_units=0, lab_units=1, type="lab",
            department_id=1, block_id=1, year_level="2", semester_term="1st",
        )
        off_l = models.SubjectOffering(
            id=1, faculty_id=1, curriculum_id=1, semester_id=1,
            enrolled_students=8, credited_hours_override=1.5,
        )
        off_b = models.SubjectOffering(
            id=2, faculty_id=1, curriculum_id=2, semester_id=1,
            enrolled_students=8, credited_hours_override=2.0,
        )
        db.add_all([dept, sem, block, prof, lec, lab, off_l, off_b])
        db.commit()

        result = generate_schedules(db, semester_id=1, faculty_ids=[1], department_id=1)
        self.assertGreaterEqual(result["generated"], 2)

        lec_scheds = db.query(models.Schedule).filter(models.Schedule.curriculum_id == 1).all()
        lab_scheds = db.query(models.Schedule).filter(models.Schedule.curriculum_id == 2).all()
        self.assertTrue(len(lec_scheds) > 0 and len(lab_scheds) > 0)

        for lb in lab_scheds:
            for lc in lec_scheds:
                if lb.day_of_week == lc.day_of_week:
                    self.assertGreaterEqual(
                        lb.start_time,
                        lc.end_time,
                        f"CT Lab {lb.start_time} started before CT Lecture ended {lc.end_time} on {lb.day_of_week}",
                    )

    def test_registrar_proposal_excel_format_and_ct(self):
        """
        build_schedule_excel produces Sheet 1 'Registrar Proposal' matching university
        grouping (BSCOE 1ST YEAR, MW 0730 - 0930, LASTNAME, FIRSTNAME, blank lecture rooms,
        lab rooms preserved, total units summed) alongside Class Timetable & Weekly Grid.
        """
        from io import BytesIO
        from types import SimpleNamespace
        from openpyxl import load_workbook
        from backend.app.services.schedule_io import build_schedule_excel

        curr_lec = SimpleNamespace(
            id=1, code="COEM111A", name="Calculus 1", units=3, lec_units=3, lab_units=0,
            type="lecture", year_level="1",
            block=SimpleNamespace(program_name="BS Computer Engineering", program_code="BSCOE"),
        )
        curr_lab = SimpleNamespace(
            id=2, code="COEP110B", name="Programming Logic Lab", units=1, lec_units=0, lab_units=1,
            type="lab", year_level="1",
            block=SimpleNamespace(program_name="BS Computer Engineering", program_code="BSCOE"),
        )
        fac = SimpleNamespace(id=1, first_name="Melanie", last_name="Asuncion")
        lab_room = SimpleNamespace(id=5, name="512", building="Lab")
        lec_room = SimpleNamespace(id=6, name="ShouldStayBlank", building="Main")

        scheds = [
            SimpleNamespace(
                id=1, curriculum_id=1, faculty_id=1, section="",
                curriculum=curr_lec, faculty=fac, room=lec_room,
                day_of_week="Mon", start_time=time(7, 30), end_time=time(9, 30),
                enrolled_students=8, credited_hours_override=2.0,
            ),
            SimpleNamespace(
                id=2, curriculum_id=1, faculty_id=1, section="",
                curriculum=curr_lec, faculty=fac, room=lec_room,
                day_of_week="Wed", start_time=time(7, 30), end_time=time(9, 30),
                enrolled_students=8, credited_hours_override=2.0,
            ),
            SimpleNamespace(
                id=3, curriculum_id=2, faculty_id=1, section="",
                curriculum=curr_lab, faculty=fac, room=lab_room,
                day_of_week="Thu", start_time=time(13, 0), end_time=time(17, 0),
                enrolled_students=None, credited_hours_override=None,
            ),
        ]

        proposal_subjects = [
            {
                "curriculum_id": 1,
                "code": "COEM111A",
                "name": "Calculus 1",
                "units": 3,
                "program_code": "BSCOE",
                "program_name": "BS Computer Engineering",
                "year_level": "1",
                "curriculum": curr_lec,
                "faculty": fac,
                "enrolled_students": 8,
            },
            {
                "curriculum_id": 2,
                "code": "COEP110B",
                "name": "Programming Logic Lab",
                "units": 1,
                "program_code": "BSCOE",
                "program_name": "BS Computer Engineering",
                "year_level": "1",
                "curriculum": curr_lab,
                "faculty": fac,
                "enrolled_students": None,
            },
        ]

        xlsx_buf, _filename = build_schedule_excel(
            scheds,
            term_label="A.Y. 2026-2027 · 1st Term",
            proposal_subjects=proposal_subjects,
        )
        wb = load_workbook(xlsx_buf)
        self.assertEqual(wb.sheetnames, ["Registrar Proposal", "Class Timetable", "Weekly Timetable Grid"])

        ws1 = wb["Registrar Proposal"]
        rows = list(ws1.iter_rows(values_only=True))
        flat_text = [str(cell) for r in rows for cell in r if cell is not None]
        self.assertIn("BSCOE 1ST YEAR", flat_text)
        self.assertIn("MW 0730 - 0930", flat_text)
        self.assertIn("ASUNCION, MELANIE", flat_text)
        self.assertIn("512", flat_text)
        self.assertNotIn("ShouldStayBlank", flat_text)
        self.assertTrue(any("CT" in t for t in flat_text))

        # Check total units row equals 4 (3 + 1)
        total_unit_vals = [r[2] for r in rows if r[0] is None and r[1] is None and r[2] == 4]
        self.assertEqual(len(total_unit_vals), 1)

    def test_extreme_overload_total_hours_reflects_actual_sum(self):
        """
        Normal overload stays at 40.0h total work week, whereas extreme overload
        (exceeding both Office and Consultation hours) reflects the true sum (>40h).
        """
        # 2nd term FT regular: base 20h, off-campus 5.5h, consult 6.0h, office 8.5h (total 40h)
        normal = work_week_breakdown("2nd", "full_time_regular", actual_overload=6.0)
        self.assertEqual(normal["total_hours"], 40.0)
        self.assertEqual(normal["office_hours"], 2.5)

        # Extreme overload: 20h overload -> exhausts 8.5h office + 5.5h off-campus
        # excess_overload_hours = overload - allocated_office = 20.0 - 8.5 = 11.5h
        # unabsorbed_overload_hours = 11.5 - 5.5 = 6.0h
        # Actual total = 40.0h teaching + 0 off-campus + 6.0h fixed consult + 0 office = 46.0h
        extreme = work_week_breakdown("2nd", "full_time_regular", actual_overload=20.0)
        self.assertEqual(extreme["teaching_hours"], 40.0)
        self.assertEqual(extreme["office_hours"], 0.0)
        self.assertEqual(extreme["off_campus_hours"], 0.0)
        self.assertEqual(extreme["consultation_hours"], 6.0)
        self.assertEqual(extreme["excess_overload_hours"], 11.5)
        self.assertEqual(extreme["unabsorbed_overload_hours"], 6.0)
        self.assertEqual(extreme["total_hours"], 46.0)

    def test_schedule_router_rejects_professor_overlap_and_published_edits(self):
        """
        POST /schedules must reject same-professor overlapping time slots (409) and
        must reject edits once the department's term schedule is officially published (409).
        """
        from fastapi import HTTPException
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models, schemas
        from backend.app.routers.schedules import create_schedule, delete_schedule

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="Computer Science", code="CAST")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        prof = models.Faculty(
            id=1, first_name="Jane", last_name="Doe",
            email="jane@dlsau.edu.ph", type="full_time_regular", department_id=1
        )
        chair = models.User(
            id=1, first_name="Chair", last_name="User",
            email="chair@dlsau.edu.ph", password_hash="pw",
            role="program_chair", department="CAST", is_verified=True
        )
        c1 = models.Curriculum(
            id=1, code="CS101A", name="Prog 1", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=1, is_major=True,
        )
        c2 = models.Curriculum(
            id=2, code="CS102A", name="Prog 2", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=1, is_major=True,
        )
        off1 = models.SubjectOffering(id=1, faculty_id=1, curriculum_id=1, semester_id=1)
        off2 = models.SubjectOffering(id=2, faculty_id=1, curriculum_id=2, semester_id=1)
        db.add_all([dept, sem, prof, chair, c1, c2, off1, off2])
        db.commit()

        # First schedule succeeds
        s1 = create_schedule(
            schemas.ScheduleCreate(
                semester_id=1, curriculum_id=1, faculty_id=1, room_id=None,
                day_of_week="Mon", start_time=time(8, 0), end_time=time(10, 0), section="",
            ),
            db,
            chair,
        )
        self.assertIsNotNone(s1.id)

        # Overlapping slot for same professor -> 409 Conflict
        with self.assertRaises(HTTPException) as ctx:
            create_schedule(
                schemas.ScheduleCreate(
                    semester_id=1, curriculum_id=2, faculty_id=1, room_id=None,
                    day_of_week="Mon", start_time=time(9, 0), end_time=time(11, 0), section="",
                ),
                db,
                chair,
            )
        self.assertEqual(ctx.exception.status_code, 409)

        # Mark term published -> creating OR deleting schedule must raise 409
        s1.status = "published"
        db.commit()

        with self.assertRaises(HTTPException) as ctx_pub_add:
            create_schedule(
                schemas.ScheduleCreate(
                    semester_id=1, curriculum_id=2, faculty_id=1, room_id=None,
                    day_of_week="Tue", start_time=time(8, 0), end_time=time(10, 0), section="",
                ),
                db,
                chair,
            )
        self.assertEqual(ctx_pub_add.exception.status_code, 409)

        with self.assertRaises(HTTPException) as ctx_pub_del:
            delete_schedule(s1.id, db, chair)
        self.assertEqual(ctx_pub_del.exception.status_code, 409)

    def test_program_chair_cannot_escalate_role_and_dean_clear_logs_is_scoped(self):
        """
        1) A program_chair cannot escalate themselves to admin or edit another user.
        2) A College Dean clearing audit logs only clears their own college's logs.
        """
        from fastapi import HTTPException
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models, schemas
        from backend.app.routers.users import update_user
        from backend.app.routers.logs import clear_logs

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        d_cast = models.Department(id=1, name="CAST", code="CAST")
        d_cbma = models.Department(id=2, name="CBMA", code="CBMA")
        dean_cast = models.User(
            id=1, first_name="Dean", last_name="CAST", email="dean.cast@dlsau.edu.ph",
            password_hash="pw", role="admin", department="CAST", is_verified=True,
        )
        chair_cast = models.User(
            id=2, first_name="Chair", last_name="CAST", email="chair.cast@dlsau.edu.ph",
            password_hash="pw", role="program_chair", department="CAST", is_verified=True,
        )
        db.add_all([d_cast, d_cbma, dean_cast, chair_cast])
        db.flush()
        log_cast = models.SystemLog(user_id=2, department_id=1, action="Test CAST", status="success")
        log_cbma = models.SystemLog(user_id=None, department_id=2, action="Test CBMA", status="success")
        db.add_all([log_cast, log_cbma])
        db.commit()

        # Program chair trying to promote self to admin -> 403
        with self.assertRaises(HTTPException) as ctx_esc:
            update_user(2, schemas.UserUpdate(role="admin"), db, chair_cast)
        self.assertEqual(ctx_esc.exception.status_code, 403)

        # Program chair trying to demote Dean -> 403
        with self.assertRaises(HTTPException) as ctx_dean:
            update_user(1, schemas.UserUpdate(role="program_chair"), db, chair_cast)
        self.assertEqual(ctx_dean.exception.status_code, 403)

        # CAST Dean clearing logs must preserve CBMA's logs
        clear_logs(db, dean_cast)
        remaining = db.query(models.SystemLog).all()
        self.assertEqual(len(remaining), 1)
        self.assertEqual(remaining[0].department_id, 2)

    def test_published_term_blocks_clear_all_and_scoped_publish_conflicts(self):
        """
        1) Unresolved conflict in College B must NOT block College A from publishing.
        2) Once College A is published, clear_all_schedules and CT update must raise 409.
        """
        from fastapi import HTTPException
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models, schemas
        from backend.app.routers.schedules import (
            set_schedule_status,
            ScheduleStatusRequest,
            clear_all_schedules,
        )
        from backend.app.routers.subject_offerings import update_subject_offering_ct

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        d_a = models.Department(id=1, name="CAST", code="CAST")
        d_b = models.Department(id=2, name="CBMA", code="CBMA")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        dean_a = models.User(
            id=1, first_name="Dean", last_name="A", email="dean.a@dlsau.edu.ph",
            password_hash="pw", role="admin", department="CAST", is_verified=True,
        )
        chair_a = models.User(
            id=2, first_name="Chair", last_name="A", email="chair.a@dlsau.edu.ph",
            password_hash="pw", role="program_chair", department="CAST", is_verified=True,
        )
        fac_a = models.Faculty(
            id=1, first_name="Prof", last_name="A", email="pa@dlsau.edu.ph",
            type="full_time_regular", department_id=1,
        )
        curr_a = models.Curriculum(
            id=1, code="CS101A", name="Prog 1", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=1,
        )
        curr_b = models.Curriculum(
            id=2, code="ACC101A", name="Accounting", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=2,
        )
        db.add_all([d_a, d_b, sem, dean_a, chair_a, fac_a, curr_a, curr_b])
        db.flush()
        off_a = models.SubjectOffering(id=1, faculty_id=1, curriculum_id=1, semester_id=1)
        sched_a = models.Schedule(
            id=1, semester_id=1, curriculum_id=1, faculty_id=1,
            day_of_week="Mon", start_time=time(8, 0), end_time=time(10, 0),
            section="", status="draft",
        )
        # Unresolved conflict ONLY in College B
        conf_b = models.Conflict(curriculum_id=2, conflict_type="unplaced_lecture", reason="CBMA issue")
        db.add_all([off_a, sched_a, conf_b])
        db.commit()

        # College A publishes cleanly despite College B's conflict
        pub = set_schedule_status(
            ScheduleStatusRequest(semester_id=1, status="published"),
            db,
            dean_a,
        )
        self.assertEqual(pub["status"], "published")
        self.assertEqual(pub["affected"], 1)

        # Published lock blocks clear_all_schedules and CT toggle
        with self.assertRaises(HTTPException) as ctx_clear:
            clear_all_schedules(1, db, chair_a)
        self.assertEqual(ctx_clear.exception.status_code, 409)

        with self.assertRaises(HTTPException) as ctx_ct:
            update_subject_offering_ct(1, schemas.SubjectOfferingCTUpdate(ct_tier="ct_5_8"), db, chair_a)
        self.assertEqual(ctx_ct.exception.status_code, 409)

    def test_probationary_work_week_totals_40h_and_global_schedule_ct_no_crash(self):
        """
        1) Full-Time Probationary 2nd/3rd term sums to exactly 40.0h (24 + 2.5 + 6 + 7.5).
        2) GET /ai-scheduler/global-schedule handles CT schedule with NULL credited_hours_override without 500.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.routers.ai_scheduler import get_global_schedule

        for term in ("1st", "2nd", "3rd"):
            ww = work_week_breakdown(term, "full_time_probationary", actual_overload=0.0)
            self.assertEqual(ww["teaching_hours"], 24.0)
            self.assertEqual(ww["off_campus_hours"], 2.5)
            self.assertEqual(ww["consultation_hours"], 6.0)
            self.assertEqual(ww["office_hours"], 7.5)
            self.assertEqual(ww["total_hours"], 40.0)

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="CAST", code="CAST")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        chair = models.User(
            id=1, first_name="Chair", last_name="User", email="chair@dlsau.edu.ph",
            password_hash="pw", role="program_chair", department="CAST", is_verified=True,
        )
        fac = models.Faculty(
            id=1, first_name="Alex", last_name="Pasion", email="alex@dlsau.edu.ph",
            type="full_time_regular", department_id=1,
        )
        curr = models.Curriculum(
            id=1, code="CS201A", name="Algorithms", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=1,
        )
        # CT offering with enrolled_students=8 and credited_hours_override=None (triggers fallback)
        off = models.SubjectOffering(
            id=1, faculty_id=1, curriculum_id=1, semester_id=1,
            enrolled_students=8, credited_hours_override=None,
        )
        sched = models.Schedule(
            id=1, semester_id=1, curriculum_id=1, faculty_id=1,
            day_of_week="Mon", start_time=time(8, 0), end_time=time(10, 0),
            section="", enrolled_students=8, credited_hours_override=None,
        )
        db.add_all([dept, sem, chair, fac, curr, off, sched])
        db.commit()

        rows = get_global_schedule(semester_id=1, db=db, current_user=chair)
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["is_ct"])
        self.assertEqual(rows[0]["credited_hours_override"], 2.0)

    def test_delete_curriculum_cascades_schedules(self):
        """
        Deleting a curriculum item must cascade-delete its dependent Schedule rows
        instead of leaving orphaned schedules with curriculum_id=NULL.
        """
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app import models
        from backend.app.routers.curriculum import delete_curriculum_item

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        db = Session()

        dept = models.Department(id=1, name="CAST", code="CAST")
        sem = models.Semester(id=1, term="1st", academic_year="2026-2027", is_active=True)
        dean = models.User(
            id=1, first_name="Dean", last_name="CAST", email="dean@dlsau.edu.ph",
            password_hash="pw", role="admin", department="CAST", is_verified=True,
        )
        fac = models.Faculty(
            id=1, first_name="Prof", last_name="One", email="p1@dlsau.edu.ph",
            type="full_time_regular", department_id=1,
        )
        curr = models.Curriculum(
            id=1, code="CS999A", name="Temp Subject", units=3, lec_units=3, lab_units=0,
            type="lecture", department_id=1,
        )
        sched = models.Schedule(
            id=1, semester_id=1, curriculum_id=1, faculty_id=1,
            day_of_week="Mon", start_time=time(8, 0), end_time=time(10, 0), section="",
        )
        db.add_all([dept, sem, dean, fac, curr, sched])
        db.commit()

        delete_curriculum_item(1, db, dean)
        self.assertEqual(db.query(models.Schedule).count(), 0)

if __name__ == "__main__":
    unittest.main()
