import unittest
import re
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict

def setup_test_db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session()

class TestLabLecHandling(unittest.TestCase):

    def test_ab_subject_splitting(self):
        codes_to_test = [
            ("CC101A/B", True, "CC101"),
            ("CC102A/B", True, "CC102"),
            ("DS101A/B", True, "DS101"),
            ("IT101A/B", True, "IT101"),
            ("CS201A/B", True, "CS201"),
            ("ENG101", False, "ENG101"),
            ("MATH102A", False, "MATH102A")
        ]

        for code, expected_match, expected_base in codes_to_test:
            ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", code, re.IGNORECASE)
            if expected_match:
                self.assertIsNotNone(ab_match)
                if ab_match:
                    self.assertEqual(ab_match.group(1).strip(), expected_base)
            else:
                self.assertIsNone(ab_match)

    def test_dynamic_ab_code_formatting_logic(self):
        # Verify formatting logic for Lecture (no room / room = None) vs Lab (with room)
        sample_schedules = [
            {"raw": "CC101A/B", "room": None, "type": "lecture", "expected": "CC101A"},
            {"raw": "CC101A/B", "room": 101, "type": "lab", "expected": "CC101B"},
            {"raw": "DS101A/B", "room": None, "type": "lecture", "expected": "DS101A"},
            {"raw": "DS101A/B", "room": 202, "type": "lab", "expected": "DS101B"},
            {"raw": "IT101A/B", "room": None, "type": "lecture", "expected": "IT101A"},
            {"raw": "IT101A/B", "room": 303, "type": "lab", "expected": "IT101B"},
            {"raw": "CS201A/B", "room": None, "type": "lecture", "expected": "CS201A"},
            {"raw": "CS201A/B", "room": 404, "type": "lab", "expected": "CS201B"},
            {"raw": "ENG101", "room": None, "type": "lecture", "expected": "ENG101"}
        ]

        for item in sample_schedules:
            raw_code = item["raw"]
            ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", raw_code, re.IGNORECASE)
            if ab_match:
                base_code = ab_match.group(1).strip()
                result_code = f"{base_code}A" if (item["room"] is None or item["type"] == "lecture") else f"{base_code}B"
            else:
                result_code = raw_code

            self.assertEqual(result_code, item["expected"])

    def test_lecture_room_null_and_lab_room_required(self):
        db = setup_test_db()

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        fac = models.Faculty(first_name="Alan", last_name="Turing", max_units=24, department_id=dept.id)
        db.add(fac)

        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)
        db.flush()

        lab_room = models.Room(name="Lab 101", building="Main", capacity=40, type="lab")
        db.add(lab_room)

        curr_lec = models.Curriculum(code="CC101A", name="Computer Programming (Lec)", units=2, type="lecture", department_id=dept.id, lec_units=2, lab_units=0)
        curr_lab = models.Curriculum(code="CC101B", name="Computer Programming (Lab)", units=1, type="lab", department_id=dept.id, lec_units=0, lab_units=1)
        db.add_all([curr_lec, curr_lab])
        db.flush()

        off1 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=curr_lec.id, semester_id=sem.id)
        off2 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=curr_lab.id, semester_id=sem.id)
        db.add_all([off1, off2])
        db.commit()

        sem_id: int = int(sem.id)  # type: ignore
        fac_id: int = int(fac.id)  # type: ignore
        dept_id: int = int(dept.id)  # type: ignore

        results = generate_schedules(db, sem_id, [fac_id], dept_id, auto_bump_units=False)

        self.assertEqual(results.get("generated"), 4)
        unplaced_items: List[Dict[str, Any]] = results.get("unplaced", [])  # type: ignore
        self.assertEqual(len(unplaced_items), 0)

        schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()
        self.assertEqual(len(schedules), 4)

        lec_scheds = [s for s in schedules if s.curriculum_id == curr_lec.id]
        lab_scheds = [s for s in schedules if s.curriculum_id == curr_lab.id]

        self.assertEqual(len(lec_scheds), 2)
        self.assertEqual(len(lab_scheds), 2)

        # Verification: Lecture schedules MUST have room_id = None
        for s in lec_scheds:
            self.assertIsNone(s.room_id)

        # Verification: Lab schedules MUST have lab_room.id
        for s in lab_scheds:
            self.assertEqual(s.room_id, lab_room.id)

    def test_unplaced_lab_reason_when_no_lab_room(self):
        db = setup_test_db()

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        fac = models.Faculty(first_name="Ada", last_name="Lovelace", max_units=24, department_id=dept.id)
        db.add(fac)

        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)
        db.flush()

        lec_room = models.Room(name="Room 201", building="Main", capacity=40, type="lecture")
        db.add(lec_room)

        curr_lab = models.Curriculum(code="DS101B", name="Data Science (Lab)", units=1, type="lab", department_id=dept.id, lec_units=0, lab_units=1)
        db.add(curr_lab)
        db.flush()

        off = models.SubjectOffering(faculty_id=fac.id, curriculum_id=curr_lab.id, semester_id=sem.id)
        db.add(off)
        db.commit()

        sem_id: int = int(sem.id)  # type: ignore
        fac_id: int = int(fac.id)  # type: ignore
        dept_id: int = int(dept.id)  # type: ignore

        results = generate_schedules(db, sem_id, [fac_id], dept_id, auto_bump_units=False)

        unplaced_items: List[Dict[str, Any]] = results.get("unplaced", [])  # type: ignore
        self.assertEqual(len(unplaced_items), 1)
        unplaced_item = unplaced_items[0]
        self.assertIn("could not be scheduled because no laboratory room was available", str(unplaced_item.get("reason", "")))

    def test_is_room_conflict_ignores_none_room(self):
        self.assertFalse(is_room_conflict(None, "Mon", "Wed", None, None, []))

if __name__ == "__main__":
    unittest.main()
