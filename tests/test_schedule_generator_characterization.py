"""
Characterization test for backend.app.services.schedule_generator.

Captures the exact deterministic scheduling behaviour (generated slot count,
day/time assignments, room assignments, overload warnings, and conflict records)
for a known fixture before refactoring.
"""

import unittest
from datetime import time
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import models
from backend.app.services.schedule_generator import generate_schedules


class ScheduleGeneratorCharacterizationTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed fixtures
        dept = models.Department(id=1, name="College of Accountancy and Science Technology", code="CAST")
        self.db.add(dept)

        sem = models.Semester(
            id=1,
            academic_year="2026-2027",
            term="1st",
            is_active=True
        )
        self.db.add(sem)

        prog_bscs = models.Program(id=1, code="BSCS", name="BS Computer Science", department_id=1)
        prog_bscpe = models.Program(id=2, code="BSCPE", name="BS Computer Engineering", department_id=1)
        self.db.add_all([prog_bscs, prog_bscpe])

        block_bscs = models.CurriculumBlock(
            id=1,
            program_name="BSCS",
            academic_year="2026-2027",
            program_id=1,
            department_id=1
        )
        block_bscpe = models.CurriculumBlock(
            id=2,
            program_name="BSCPE",
            academic_year="2026-2027",
            program_id=2,
            department_id=1
        )
        self.db.add_all([block_bscs, block_bscpe])

        # Faculty: 1 Full-Time, 1 Part-Time
        fac_ft = models.Faculty(
            id=1,
            first_name="Alan",
            last_name="Turing",
            email="alan@dlsau.edu.ph",
            type="full_time",
            department_id=1,
            max_units=21
        )
        fac_pt = models.Faculty(
            id=2,
            first_name="Grace",
            last_name="Hopper",
            email="grace@dlsau.edu.ph",
            type="part_time",
            department_id=1,
            max_units=12
        )
        self.db.add_all([fac_ft, fac_pt])

        # Unavailability: Alan cannot teach Mon morning (7:30 - 10:10)
        unavail = models.FacultyUnavailability(
            id=1,
            faculty_id=1,
            day_of_week="Mon",
            start_time=time(7, 30),
            end_time=time(10, 10)
        )
        self.db.add(unavail)

        # Room: 1 Computer Lab
        lab_room = models.Room(id=10, name="Computer Lab 1", building="Tech Building", type="lab", capacity=40)
        self.db.add(lab_room)

        self.db.commit()

        # Curricula:
        # 1. Standard BSCS Lecture (2.67 hrs/week)
        curr_cs101 = models.Curriculum(
            id=1,
            block_id=1,
            code="CS101",
            name="Intro to Computing",
            units=3,
            lec_units=3,
            lab_units=0,
            type="lecture",
            department_id=1,
            program_code="BSCS"
        )
        # 2. Standard BSCS Lab (4.00 hrs/week)
        curr_cs102 = models.Curriculum(
            id=2,
            block_id=1,
            code="CS102L",
            name="Programming Lab",
            units=1,
            lec_units=0,
            lab_units=1,
            type="lab",
            department_id=1,
            program_code="BSCS"
        )
        # 3. Standard BSCS Lecture for Grace (2.67 hrs/week)
        curr_cs103 = models.Curriculum(
            id=3,
            block_id=1,
            code="CS103",
            name="Discrete Structures",
            units=3,
            lec_units=3,
            lab_units=0,
            type="lecture",
            department_id=1,
            program_code="BSCS"
        )
        # 4. Engineering BSCPE Lecture (4.00 hrs/week)
        curr_cpe101 = models.Curriculum(
            id=4,
            block_id=2,
            code="CPE101",
            name="Computer Engineering Logic",
            units=3,
            lec_units=3,
            lab_units=0,
            type="lecture",
            department_id=1,
            program_code="BSCPE"
        )
        self.db.add_all([curr_cs101, curr_cs102, curr_cs103, curr_cpe101])
        self.db.commit()

        # Subject Offerings
        off1 = models.SubjectOffering(id=1, faculty_id=1, curriculum_id=1, semester_id=1)
        off2 = models.SubjectOffering(id=2, faculty_id=1, curriculum_id=2, semester_id=1)
        off3 = models.SubjectOffering(id=3, faculty_id=2, curriculum_id=3, semester_id=1)
        off4 = models.SubjectOffering(id=4, faculty_id=1, curriculum_id=4, semester_id=1)
        self.db.add_all([off1, off2, off3, off4])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_deterministic_schedule_generation_characterization(self):
        """
        Characterization snapshot: Verifies exact generated slot attributes,
        room allocations, and workload totals for seeded test fixture.
        """
        res = generate_schedules(
            db=self.db,
            semester_id=1,
            faculty_ids=[1, 2],
            department_id=1,
            auto_bump_units=True
        )

        # 4 subjects * 2 meetings each = 8 generated slots
        self.assertEqual(res.get("generated"), 8)
        self.assertEqual(res.get("unplaced"), [])
        self.assertEqual(res.get("skipped_gened"), 0)
        self.assertEqual(res.get("bumped_warnings"), [])

        schedules = (
            self.db.query(models.Schedule)
            .filter(models.Schedule.semester_id == 1)
            .order_by(models.Schedule.curriculum_id, models.Schedule.day_of_week)
            .all()
        )
        self.assertEqual(len(schedules), 8)

        # Extract deterministic schedule footprint:
        # [(curr_id, faculty_id, room_id, day, start_time, end_time)]
        footprint = [
            (
                s.curriculum_id,
                s.faculty_id,
                s.room_id,
                s.day_of_week,
                s.start_time.strftime("%H:%M"),
                s.end_time.strftime("%H:%M"),
            )
            for s in schedules
        ]

        expected_footprint = [
            # CS101 (Faculty 1, Lecture): MW 10:10-11:30 (avoided Mon 7:30-10:10 due to unavailability)
            (1, 1, None, "Mon", "10:10", "11:30"),
            (1, 1, None, "Wed", "10:10", "11:30"),

            # CS102L (Faculty 1, Lab): TTh 07:30-09:30 in Computer Lab 1 (room 10)
            (2, 1, 10, "Thu", "07:30", "09:30"),
            (2, 1, 10, "Tue", "07:30", "09:30"),

            # CS103 (Faculty 2, Lecture): MW 07:30-08:50 (Grace is available Mon early)
            (3, 2, None, "Mon", "07:30", "08:50"),
            (3, 2, None, "Wed", "07:30", "08:50"),

            # CPE101 (Faculty 1, Engineering Lecture 2hr slots): MW 13:00-15:00
            (4, 1, None, "Mon", "13:00", "15:00"),
            (4, 1, None, "Wed", "13:00", "15:00"),
        ]

        self.assertEqual(footprint, expected_footprint)

    def test_overload_and_unplaced_characterization(self):
        """
        Characterization snapshot: Verifies unplaced conflict records when faculty
        is fully unavailable across all scheduling slots.
        """
        # Block Alan (faculty 1) completely across all days and times
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        for idx, d in enumerate(days, start=100):
            self.db.add(models.FacultyUnavailability(
                id=idx,
                faculty_id=1,
                day_of_week=d,
                start_time=time(7, 0),
                end_time=time(20, 0)
            ))
        self.db.commit()

        res = generate_schedules(
            db=self.db,
            semester_id=1,
            faculty_ids=[1],
            department_id=1,
            auto_bump_units=True
        )

        # Faculty 1 has CS101 (lecture), CS102L (lab), CPE101 (lecture) -> all 3 cannot be placed
        self.assertEqual(res.get("generated"), 0)
        self.assertEqual(len(res.get("unplaced", [])), 3)

        unplaced_subjects = [u["subject"] for u in res.get("unplaced", [])]
        self.assertEqual(unplaced_subjects, ["CS101", "CS102L", "CPE101"])

        # Check conflict records in DB
        conflicts = (
            self.db.query(models.Conflict)
            .filter(models.Conflict.faculty_id == 1)
            .order_by(models.Conflict.curriculum_id)
            .all()
        )
        self.assertEqual(len(conflicts), 3)
        self.assertEqual(conflicts[0].conflict_type, "unplaced_lecture")
        self.assertEqual(conflicts[1].conflict_type, "unplaced_lab")
        self.assertEqual(conflicts[2].conflict_type, "unplaced_lecture")


if __name__ == "__main__":
    unittest.main()

