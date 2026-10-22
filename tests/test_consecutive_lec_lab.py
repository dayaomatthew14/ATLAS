"""
Unit tests for Consecutive Lecture and Laboratory Scheduling requirements.
Validates:
1. Session order: Lecture first, followed by Laboratory on the same day.
2. Optional gap between sessions without conflicts or dummy placeholders.
3. Conflict validation: Flags violation when Lab is scheduled before Lecture on the same day.
4. Association: Correct subject and room assignments (Lecture in classroom/TBA, Lab in laboratory room).
"""
import unittest
from datetime import time
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import models, schemas
from backend.app.services.schedule_generator import (
    generate_schedules,
    _place_consecutive_lec_lab_slot,
    get_base_code
)
from backend.app.routers.conflicts import validate_schedule_conflict


def setup_test_db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    admin_user = models.User(
        id=1, 
        first_name="System", 
        last_name="Admin", 
        email="admin@dlsau.edu.ph", 
        role="admin", 
        password_hash="pw"
    )
    db.add(admin_user)
    db.commit()
    return db


class TestConsecutiveLecLabScheduling(unittest.TestCase):
    def test_base_code_extractor(self):
        """Test base subject code extraction for DLSAU suffixes."""
        self.assertEqual(get_base_code("OS101A"), "OS101")
        self.assertEqual(get_base_code("OS101B"), "OS101")
        self.assertEqual(get_base_code("CC104A"), "CC104")
        self.assertEqual(get_base_code("CC104B"), "CC104")
        self.assertEqual(get_base_code("MATH101"), "MATH101")
        self.assertEqual(get_base_code("CS201A/B"), "CS201")

    def test_consecutive_slot_generator_order_and_gaps(self):
        """Test that _place_consecutive_lec_lab_slot produces lec_end <= lab_start on the same days."""
        lab_room = models.Room(id=101, name="RM608", building="Main", capacity=40, type="lab")
        rooms_by_type = {"lab": [lab_room]}

        lecture_slots = [
            (time(7, 30), time(8, 50)),
            (time(13, 30), time(14, 50))
        ]
        lab_slots = [
            (time(9, 30), time(11, 30)),
            (time(15, 30), time(17, 30))
        ]

        result = _place_consecutive_lec_lab_slot(
            semester_id=1,
            lec_curriculum_id=1,
            lab_curriculum_id=2,
            faculty_id=10,
            day_pairs_to_try=[['Mon', 'Wed']],
            lecture_slots=lecture_slots,
            lab_slots=lab_slots,
            rooms_by_type=rooms_by_type,
            all_unavails=[],
            all_schedules=[]
        )

        self.assertIsNotNone(result, "Should successfully place consecutive lecture and lab")
        lec1, lec2, lab1, lab2 = result

        # Day alignment
        self.assertEqual(lec1.day_of_week, 'Mon')
        self.assertEqual(lab1.day_of_week, 'Mon')
        self.assertEqual(lec2.day_of_week, 'Wed')
        self.assertEqual(lab2.day_of_week, 'Wed')

        # Chronological order: Lecture strictly precedes or meets Laboratory
        self.assertEqual(lec1.start_time, time(7, 30))
        self.assertEqual(lec1.end_time, time(8, 50))
        self.assertEqual(lab1.start_time, time(9, 30))
        self.assertEqual(lab1.end_time, time(11, 30))
        self.assertLessEqual(lec1.end_time, lab1.start_time)
        self.assertLessEqual(lec2.end_time, lab2.start_time)

        # Gap verification: 40-minute gap between 8:50 AM and 9:30 AM
        gap_minutes = (lab1.start_time.hour * 60 + lab1.start_time.minute) - (lec1.end_time.hour * 60 + lec1.end_time.minute)
        self.assertEqual(gap_minutes, 40)

        # Room allocation: Lecture gets None (TBA/classroom), Lab gets laboratory room
        self.assertIsNone(lec1.room_id)
        self.assertEqual(lab1.room_id, 101)

    def test_consecutive_scheduling_full_flow(self):
        """Test full schedule generation with paired A (LEC) and B (LAB) curricula in the DB."""
        db = setup_test_db()

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        fac = models.Faculty(first_name="Ada", last_name="Lovelace", max_units=24, department_id=dept.id)
        db.add(fac)

        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)
        db.flush()

        lab_room = models.Room(name="RM608", building="Main", capacity=40, type="lab")
        db.add(lab_room)

        curr_lec = models.Curriculum(code="OS101A", name="Operating Systems Lec", units=2, type="lecture", department_id=dept.id, lec_units=2, lab_units=0)
        curr_lab = models.Curriculum(code="OS101B", name="Operating Systems Lab", units=1, type="lab", department_id=dept.id, lec_units=0, lab_units=1)
        db.add_all([curr_lec, curr_lab])
        db.flush()

        off1 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=curr_lec.id, semester_id=sem.id)
        off2 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=curr_lab.id, semester_id=sem.id)
        db.add_all([off1, off2])
        db.commit()

        sem_id: int = int(sem.id)
        fac_id: int = int(fac.id)
        dept_id: int = int(dept.id)

        results = generate_schedules(db, sem_id, [fac_id], dept_id, auto_bump_units=False)
        self.assertEqual(results.get("generated"), 4)
        unplaced = results.get("unplaced", [])
        self.assertEqual(len(unplaced), 0)

        scheds = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()
        self.assertEqual(len(scheds), 4)

        for day in ['Mon', 'Wed']:
            day_scheds = [s for s in scheds if s.day_of_week == day]
            self.assertEqual(len(day_scheds), 2, f"Should have 2 sessions on {day}")
            day_lec = next(s for s in day_scheds if s.curriculum_id == curr_lec.id)
            day_lab = next(s for s in day_scheds if s.curriculum_id == curr_lab.id)

            self.assertLessEqual(day_lec.end_time, day_lab.start_time, f"Lecture must end before Lab starts on {day}")
            self.assertIsNone(day_lec.room_id)
            self.assertEqual(day_lab.room_id, lab_room.id)

    def test_conflict_validation_session_order(self):
        """Test that validate_schedule_conflict flags inverted session order (Lab before Lec on the same day)."""
        db = setup_test_db()
        admin_user = db.query(models.User).filter(models.User.id == 1).first()

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)

        fac = models.Faculty(first_name="Alan", last_name="Turing", department_id=dept.id)
        db.add(fac)

        rm = models.Room(name="RM608", building="Main", capacity=40, type="lab")
        db.add(rm)

        c_lec = models.Curriculum(code="OS101A", name="OS Lecture", units=2, lec_units=2, lab_units=0, type="lecture", department_id=dept.id)
        c_lab = models.Curriculum(code="OS101B", name="OS Laboratory", units=1, lec_units=0, lab_units=1, type="lab", department_id=dept.id)
        db.add_all([c_lec, c_lab])
        db.commit()

        # Existing schedule: Lecture on Monday ('Mon') 07:30 to 08:50
        lec_sched = models.Schedule(
            semester_id=sem.id,
            curriculum_id=c_lec.id,
            faculty_id=fac.id,
            room_id=None,
            section="BSCS3A",
            day_of_week="Mon",
            start_time=time(7, 30),
            end_time=time(8, 50),
            status="draft"
        )
        db.add(lec_sched)
        db.commit()

        # Case A: Try to schedule Lab BEFORE Lecture (06:00 to 07:20) on the same day -> Session Order Conflict!
        val_bad = schemas.ConflictValidate(
            semester_id=sem.id,
            curriculum_id=c_lab.id, # Lab
            faculty_id=fac.id,
            room_id=rm.id,
            section="BSCS3A",
            day_of_week="Mon",
            start_time=time(6, 0),
            end_time=time(7, 20)
        )
        conflicts_bad = validate_schedule_conflict(val_bad, db=db, current_user=admin_user)
        order_conflicts = [c for c in conflicts_bad if c.type == "session_order"]
        self.assertTrue(len(order_conflicts) > 0, "Must flag session_order conflict when Lab is scheduled before Lecture")
        self.assertIn("must be scheduled after its lecture", order_conflicts[0].message.lower())

        # Case B: Try to schedule Lab AFTER Lecture with an empty window (09:30 to 11:30) -> No conflict, perfectly valid!
        val_good = schemas.ConflictValidate(
            semester_id=sem.id,
            curriculum_id=c_lab.id, # Lab
            faculty_id=fac.id,
            room_id=rm.id,
            section="BSCS3A",
            day_of_week="Mon",
            start_time=time(9, 30),
            end_time=time(11, 30)
        )
        conflicts_good = validate_schedule_conflict(val_good, db=db, current_user=admin_user)
        self.assertEqual(len(conflicts_good), 0, "Valid session order with break should produce 0 conflicts")


if __name__ == "__main__":
    unittest.main()
