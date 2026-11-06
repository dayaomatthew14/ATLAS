import unittest
from datetime import time
from typing import cast
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models
from backend.app.services.schedule_generator import generate_schedules, get_base_code


def setup_test_db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()


class TestSuffixABCAndNoRoom(unittest.TestCase):
    def setUp(self):
        self.db = setup_test_db()
        self.dept = models.Department(name="College of Arts, Sciences & Technology", code="CAST")
        self.db.add(self.dept)
        self.db.flush()

        self.fac = models.Faculty(
            first_name="Ada", last_name="Lovelace", max_units=24, department_id=self.dept.id
        )
        self.db.add(self.fac)

        self.sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        self.db.add(self.sem)
        self.db.commit()

        self.sem_id = int(self.sem.id)  # type: ignore
        self.fac_id = int(self.fac.id)  # type: ignore
        self.dept_id = int(self.dept.id)  # type: ignore

    def tearDown(self):
        self.db.close()

    def test_get_base_code_handles_abc_and_spaces(self):
        self.assertEqual(get_base_code("BASC 105A"), "BASC105")
        self.assertEqual(get_base_code("BASC 105B"), "BASC105")
        self.assertEqual(get_base_code("COSC117C"), "COSC117")
        self.assertEqual(get_base_code("CHEF102A"), "CHEF102")
        self.assertEqual(get_base_code("CHEF102B"), "CHEF102")
        self.assertEqual(get_base_code("CS101-A/B"), "CS101")
        self.assertEqual(get_base_code("GE101"), "GE101")

    def test_combined_c_subject_scheduled_as_single_4hr_block_with_no_room(self):
        # Suffix 'C' is a Combined (Lec + Lab) subject
        curr_c = models.Curriculum(
            code="COSC117C",
            name="CS Thesis 1",
            units=3,
            type="lecture",
            department_id=self.dept_id,
            lec_units=2,
            lab_units=1,
            is_major=True
        )
        self.db.add(curr_c)
        self.db.commit()

        off = models.SubjectOffering(
            faculty_id=self.fac_id, curriculum_id=curr_c.id, semester_id=self.sem_id
        )
        self.db.add(off)
        self.db.commit()

        res = generate_schedules(
            self.db, self.sem_id, [self.fac_id], self.dept_id, auto_bump_units=False
        )

        self.assertEqual(res.get("generated"), 1)
        self.assertEqual(len(res.get("unplaced", [])), 0)

        schedules = (
            self.db.query(models.Schedule)
            .filter(models.Schedule.semester_id == self.sem_id)
            .all()
        )
        self.assertEqual(len(schedules), 1)
        sched = schedules[0]

        # Room must be unassigned (None)
        self.assertIsNone(sched.room_id)

        # Duration must be exactly 4 hours
        duration_hrs = (
            sched.end_time.hour * 60 + sched.end_time.minute
            - sched.start_time.hour * 60 - sched.start_time.minute
        ) / 60.0
        self.assertEqual(duration_hrs, 4.0)

    def test_paired_a_and_b_scheduled_with_no_room(self):
        # Suffix 'A' (Lecture) and 'B' (Lab)
        curr_a = models.Curriculum(
            code="BASC 105A",
            name="Poultry Production Lec",
            units=2,
            type="lecture",
            department_id=self.dept_id,
            lec_units=2,
            lab_units=0,
            is_major=True
        )
        curr_b = models.Curriculum(
            code="BASC 105B",
            name="Poultry Production Lab",
            units=1,
            type="lab",
            department_id=self.dept_id,
            lec_units=0,
            lab_units=1,
            is_major=True
        )
        self.db.add_all([curr_a, curr_b])
        self.db.commit()

        off_a = models.SubjectOffering(
            faculty_id=self.fac_id, curriculum_id=curr_a.id, semester_id=self.sem_id
        )
        off_b = models.SubjectOffering(
            faculty_id=self.fac_id, curriculum_id=curr_b.id, semester_id=self.sem_id
        )
        self.db.add_all([off_a, off_b])
        self.db.commit()

        res = generate_schedules(
            self.db, self.sem_id, [self.fac_id], self.dept_id, auto_bump_units=False
        )

        self.assertEqual(res.get("generated"), 4)
        schedules = (
            self.db.query(models.Schedule)
            .filter(models.Schedule.semester_id == self.sem_id)
            .all()
        )
        self.assertEqual(len(schedules), 4)

        # Every schedule must have room_id = None
        for s in schedules:
            self.assertIsNone(s.room_id)


if __name__ == "__main__":
    unittest.main()
