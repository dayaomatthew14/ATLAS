"""
Tests for Assigned Subjects functionality and scheduling workflow enforcement.
"""

import unittest
from datetime import time
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import models, schemas
from backend.app.routers.subject_offerings import get_active_term_assigned_subjects
from backend.app.routers.ai_scheduler import generate_schedule, GenerateRequest
from backend.app.routers.schedules import create_schedule


class AssignedSubjectsWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed college & user
        self.dept = models.Department(id=1, name="College of Accountancy and Science Technology", code="CAST")
        self.db.add(self.dept)

        self.user = models.User(
            id=1,
            first_name="Chair",
            last_name="Person",
            email="chair@dlsau.edu.ph",
            password_hash="hash",
            role="program_chair",
            department="CAST"
        )
        self.db.add(self.user)

        # Active semester: 1st Term
        self.sem1 = models.Semester(id=1, academic_year="2026-2027", term="1st", is_active=True)
        # Inactive semester: 2nd Term
        self.sem2 = models.Semester(id=2, academic_year="2026-2027", term="2nd", is_active=False)
        self.db.add_all([self.sem1, self.sem2])

        # Published curriculum block
        self.block = models.CurriculumBlock(
            id=1,
            program_name="BS Computer Science",
            academic_year="2026-2027",
            status="PUBLISHED",
            department_id=1
        )
        self.db.add(self.block)

        # Subjects: two for 1st term, one for 2nd term
        self.c1 = models.Curriculum(
            id=101,
            block_id=1,
            code="CS101",
            name="Programming 1",
            units=3,
            lec_units=2,
            lab_units=1,
            type="lecture",
            semester_term="1st",
            department_id=1,
            is_major=True
        )
        self.c2 = models.Curriculum(
            id=102,
            block_id=1,
            code="CS102",
            name="Discrete Structures",
            units=3,
            lec_units=3,
            lab_units=0,
            type="lecture",
            semester_term="1st",
            department_id=1,
            is_major=True
        )
        self.c3 = models.Curriculum(
            id=103,
            block_id=1,
            code="CS201",
            name="Data Structures",
            units=3,
            lec_units=2,
            lab_units=1,
            type="lecture",
            semester_term="2nd",
            department_id=1,
            is_major=True
        )
        # GenEd subjects in active term (should be excluded)
        self.c_ge1 = models.Curriculum(
            id=104,
            block_id=1,
            code="GE101",
            name="Understanding the Self",
            units=3,
            lec_units=3,
            lab_units=0,
            type="lecture",
            semester_term="1st",
            department_id=1,
            is_major=False
        )
        self.c_ge2 = models.Curriculum(
            id=105,
            block_id=1,
            code="PEED1",
            name="Physical Fitness",
            units=2,
            lec_units=2,
            lab_units=0,
            type="lecture",
            semester_term="1st",
            department_id=1,
            is_major=True  # Has GenEd code prefix
        )
        self.db.add_all([self.c1, self.c2, self.c3, self.c_ge1, self.c_ge2])

        # Faculty
        self.f1 = models.Faculty(
            id=1,
            first_name="Alan",
            last_name="Turing",
            email="alan@dlsau.edu.ph",
            max_units=18,
            type="full_time",
            department_id=1
        )
        self.f2 = models.Faculty(
            id=2,
            first_name="Ada",
            last_name="Lovelace",
            email="ada@dlsau.edu.ph",
            max_units=18,
            type="full_time",
            department_id=1
        )
        self.db.add_all([self.f1, self.f2])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(self.engine)

    def test_assigned_subjects_active_term_summary(self):
        """Only 1st term subjects are included for active term (CS101 and CS102, not CS201)."""
        res = get_active_term_assigned_subjects(self.db, self.user)

        self.assertEqual(res["active_semester"]["id"], 1)
        self.assertEqual(res["active_semester"]["term"], "1st")
        self.assertEqual(res["summary"]["total"], 2)
        self.assertEqual(res["summary"]["assigned"], 0)
        self.assertEqual(res["summary"]["unassigned"], 2)
        self.assertFalse(res["summary"]["all_assigned"])

        # Codes present
        codes = [s["code"] for s in res["subjects"]]
        self.assertIn("CS101", codes)
        self.assertIn("CS102", codes)
        self.assertNotIn("CS201", codes)  # 2nd term subject excluded

        # Curriculum courses and program name match the curriculum block
        self.assertIn("curriculum_courses", res)
        self.assertEqual(len(res["curriculum_courses"]), 1)
        self.assertEqual(res["curriculum_courses"][0]["name"], "BS Computer Science")
        self.assertEqual(res["subjects"][0]["program_name"], "BS Computer Science")

    def test_assigning_professor_updates_status(self):
        """Assigning a professor to CS101 updates counts to 1 assigned, 1 unassigned."""
        offering = models.SubjectOffering(
            faculty_id=1,
            curriculum_id=101,
            semester_id=1,
            assigned_by=1
        )
        self.db.add(offering)
        self.db.commit()

        res = get_active_term_assigned_subjects(self.db, self.user)
        self.assertEqual(res["summary"]["total"], 2)
        self.assertEqual(res["summary"]["assigned"], 1)
        self.assertEqual(res["summary"]["unassigned"], 1)
        self.assertFalse(res["summary"]["all_assigned"])

        cs101 = next(s for s in res["subjects"] if s["code"] == "CS101")
        self.assertEqual(cs101["status"], "assigned")
        self.assertEqual(cs101["professor_name"], "Alan Turing")

        cs102 = next(s for s in res["subjects"] if s["code"] == "CS102")
        self.assertEqual(cs102["status"], "unassigned")
        self.assertEqual(cs102["professor_name"], "Unassigned")

    def test_ai_generator_blocked_when_unassigned_subjects_exist(self):
        """AI schedule generation must be blocked if any active-term subject is unassigned."""
        # Only assign CS101; leave CS102 unassigned
        offering1 = models.SubjectOffering(faculty_id=1, curriculum_id=101, semester_id=1, assigned_by=1)
        self.db.add(offering1)
        self.db.commit()

        req = GenerateRequest(faculty_ids=[1, 2])
        with self.assertRaises(HTTPException) as ctx:
            generate_schedule(semester_id=1, request=req, db=self.db, current_user=self.user)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("CS102", ctx.exception.detail)
        self.assertIn("unassigned", ctx.exception.detail.lower())

    def test_manual_schedule_blocked_for_unassigned_subject(self):
        """Manual schedule creation must be blocked if the subject has no assigned professor in SubjectOffering."""
        sched_data = schemas.ScheduleCreate(
            semester_id=1,
            curriculum_id=102,  # CS102 is unassigned
            faculty_id=1,
            day_of_week="Mon",
            start_time=time(8, 0),
            end_time=time(9, 30),
            section="CS-1A"
        )

        with self.assertRaises(HTTPException) as ctx:
            create_schedule(schedule=sched_data, db=self.db, current_user=self.user)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("unassigned", ctx.exception.detail.lower())

    def test_manual_schedule_blocked_for_unmatched_faculty(self):
        """Manual schedule creation must be blocked if the faculty is not the one assigned in SubjectOffering."""
        # Assign CS101 to Faculty 1 (Alan Turing)
        offering1 = models.SubjectOffering(faculty_id=1, curriculum_id=101, semester_id=1, assigned_by=1)
        self.db.add(offering1)
        self.db.commit()

        # Try to schedule CS101 with Faculty 2 (Ada Lovelace)
        sched_data = schemas.ScheduleCreate(
            semester_id=1,
            curriculum_id=101,
            faculty_id=2,  # Not assigned to CS101!
            day_of_week="Mon",
            start_time=time(8, 0),
            end_time=time(9, 30),
            section="CS-1A"
        )

        with self.assertRaises(HTTPException) as ctx:
            create_schedule(schedule=sched_data, db=self.db, current_user=self.user)

        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("not assigned", ctx.exception.detail.lower())

    def test_gen_ed_subjects_excluded_from_assigned_subjects(self):
        """GenEd subjects (is_major=False or GE/PEED prefixes) must not appear in assigned subjects."""
        res = get_active_term_assigned_subjects(self.db, self.user)
        codes = [s["code"] for s in res["subjects"]]

        self.assertIn("CS101", codes)
        self.assertIn("CS102", codes)
        self.assertNotIn("GE101", codes)
        self.assertNotIn("PEED1", codes)
        self.assertEqual(res["summary"]["total"], 2)

    def test_gen_ed_subjects_do_not_block_scheduling(self):
        """When all major subjects are assigned, unassigned GenEd subjects do not block all_assigned."""
        offering1 = models.SubjectOffering(faculty_id=1, curriculum_id=101, semester_id=1, assigned_by=1)
        offering2 = models.SubjectOffering(faculty_id=2, curriculum_id=102, semester_id=1, assigned_by=1)
        self.db.add_all([offering1, offering2])
        self.db.commit()

        res = get_active_term_assigned_subjects(self.db, self.user)
        self.assertEqual(res["summary"]["total"], 2)
        self.assertEqual(res["summary"]["assigned"], 2)
        self.assertEqual(res["summary"]["unassigned"], 0)
        self.assertTrue(res["summary"]["all_assigned"])

    def test_manual_schedule_allowed_for_gen_ed_without_offering(self):
        """Manual schedule creation for GenEd subjects does not require a chair SubjectOffering."""
        sched_data = schemas.ScheduleCreate(
            semester_id=1,
            curriculum_id=104,  # GE101
            faculty_id=1,
            day_of_week="Tue",
            start_time=time(10, 0),
            end_time=time(11, 30),
            section="CS-1A"
        )
        created = create_schedule(schedule=sched_data, db=self.db, current_user=self.user)
        self.assertEqual(created.curriculum_id, 104)


if __name__ == "__main__":
    unittest.main()
