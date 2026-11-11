"""
Tests for system-wide diagnostic validation across schemas and routers.
"""

import io
import os
import sys
import unittest
from datetime import time
from pathlib import Path
from typing import cast

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("SECRET_KEY", "test-secret-for-system-validation")

from fastapi import HTTPException, UploadFile  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from backend.app import models, schemas  # noqa: E402
from backend.app.routers import academics_router, curriculum, professors, rooms, schedules, semesters  # noqa: E402


class _FakeUser:
    def __init__(self, role="admin", department=None, user_id=1):
        self.id = user_id
        self.role = role
        self.department = department


def _fake_user(role="admin", department=None, user_id=1) -> models.User:
    return cast(models.User, _FakeUser(role=role, department=department, user_id=user_id))


def _make_memory_db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return SessionLocal()


class RoomAndProgramSchemaValidationTest(unittest.TestCase):
    def test_room_digits_only_name_allowed_and_symbols_diagnosed(self):
        room = schemas.RoomCreate(name="204", building="Main Building", capacity=45, type="Lecture")
        self.assertEqual(room.name, "204")

        with self.assertRaises(ValidationError) as ctx_sym:
            schemas.RoomCreate(name="Room@204", building="Main Building", capacity=45, type="Lecture")
        self.assertIn("@", str(ctx_sym.exception))

        with self.assertRaises(ValidationError) as ctx_cap:
            schemas.RoomCreate(name="204", building="Main Building", capacity=0, type="Lecture")
        self.assertTrue("1" in str(ctx_cap.exception) and "200" in str(ctx_cap.exception))

        with self.assertRaises(ValidationError) as ctx_max_cap:
            schemas.RoomUpdate(capacity=201)
        self.assertIn("200", str(ctx_max_cap.exception))

        with self.assertRaises(ValidationError):
            schemas.RoomCreate(name="204", building="Main Building", capacity=40, type="Gym")

    def test_program_code_and_name_validation(self):
        prog = academics_router.ProgramCreate(code="BSCS", name="BS Computer Science", department_id=1)
        self.assertEqual(prog.code, "BSCS")

        for bad_code in ["BS CS", "BS-CS", "1234", "A"]:
            with self.assertRaises(ValidationError):
                academics_router.ProgramCreate(code=bad_code, name="BS Computer Science", department_id=1)

        with self.assertRaises(ValidationError):
            academics_router.ProgramUpdate(name="12345")


class FacultyValidationTest(unittest.TestCase):
    def test_faculty_names_and_load_bounds(self):
        fac = schemas.FacultyCreate(first_name="Ma. Teresa", last_name="Peña", type="part_time")
        self.assertEqual(fac.max_units, 12)

        with self.assertRaises(ValidationError) as ctx_num:
            schemas.FacultyCreate(first_name="Juan123", last_name="Cruz")
        self.assertIn("numbers", str(ctx_num.exception))

        with self.assertRaises(ValidationError) as ctx_sym:
            schemas.FacultyCreate(first_name="Juan", last_name="Cruz@!")
        self.assertIn("@", str(ctx_sym.exception))

        with self.assertRaises(ValidationError):
            schemas.FacultyCreate(first_name="Ana", last_name="Reyes", type="part_time", load_unit="units", max_units=13)

        with self.assertRaises(ValidationError):
            schemas.FacultyCreate(first_name="Ana", last_name="Reyes", type="full_time", load_unit="units", max_units=19)

        with self.assertRaises(ValidationError):
            schemas.FacultyCreate(first_name="Ana", last_name="Reyes", type="full_time", load_unit="hrs", max_units=31)

        with self.assertRaises(ValidationError):
            schemas.FacultyCreate(first_name="Ana", last_name="Reyes", type="part_time", load_unit="hrs", max_units=21)

        fac_hrs = schemas.FacultyCreate(first_name="Ana", last_name="Reyes", type="full_time", load_unit="hrs", max_units=24)
        self.assertEqual(fac_hrs.max_units, 24)

    def test_faculty_unavailability_validation(self):
        ok = schemas.FacultyUnavailabilityCreate(day_of_week="Mon", start_time=time(9, 0), end_time=time(11, 0))
        self.assertEqual(ok.day_of_week, "Mon")

        with self.assertRaises(ValidationError):
            schemas.FacultyUnavailabilityCreate(day_of_week="Sun", start_time=time(9, 0), end_time=time(11, 0))

        with self.assertRaises(ValidationError):
            schemas.FacultyUnavailabilityCreate(day_of_week="Mon", start_time=time(11, 0), end_time=time(9, 0))


class SemesterCurriculumAndScheduleSchemaTest(unittest.TestCase):
    def test_semester_academic_year_and_term(self):
        sem = schemas.SemesterCreate(academic_year="2026-2027", term="1st", is_active=True)
        self.assertEqual(sem.academic_year, "2026-2027")

        for bad_ay in ["AY 2026-2027", "2026-2028", "2026", "abc-defg"]:
            with self.assertRaises(ValidationError):
                schemas.SemesterCreate(academic_year=bad_ay, term="1st")

        with self.assertRaises(ValidationError):
            schemas.SemesterCreate(academic_year="2026-2027", term="Summer")

        with self.assertRaises(ValidationError):
            schemas.SemesterUpdate(academic_year="2026-2028")

    def test_curriculum_block_and_subject_validation(self):
        block = schemas.CurriculumBlockCreate(
            program_name="BS Computer Science",
            academic_year="AY 2026-2027",
            department_id=1,
        )
        self.assertEqual(block.academic_year, "AY 2026-2027")

        bulk = schemas.BulkImportRequest(
            program_name="BS Computer Science",
            academic_year="Unknown AY",
            department_id=1,
            items=[
                schemas.CurriculumCreate(
                    code="CC101A/B",
                    name="Introduction to Computing",
                    units=3,
                    type="lecture",
                    lec_units=2,
                    lab_units=1,
                )
            ],
        )
        self.assertEqual(bulk.academic_year, "Unknown AY")

        with self.assertRaises(ValidationError):
            schemas.CurriculumBlockCreate(
                program_name="BS Computer Science",
                academic_year="2026-2028",
                department_id=1,
            )

        for bad_code in ["101CC", "CC@101", "A"]:
            with self.assertRaises(ValidationError):
                schemas.CurriculumCreate(code=bad_code, name="Computing", units=3, type="lecture")

        with self.assertRaises(ValidationError):
            schemas.CurriculumUpdate(units=25)

        with self.assertRaises(ValidationError):
            schemas.CurriculumUpdate(lec_units=13)

    def test_schedule_and_conflict_validation(self):
        sched = schemas.ScheduleCreate(
            semester_id=1,
            curriculum_id=1,
            faculty_id=1,
            day_of_week="Sat",
            start_time=time(8, 0),
            end_time=time(10, 0),
            section="CS-3A",
        )
        self.assertEqual(sched.section, "CS-3A")

        with self.assertRaises(ValidationError):
            schemas.ScheduleCreate(
                semester_id=1,
                curriculum_id=1,
                faculty_id=1,
                day_of_week="Sun",
                start_time=time(8, 0),
                end_time=time(10, 0),
            )

        with self.assertRaises(ValidationError):
            schemas.ScheduleCreate(
                semester_id=1,
                curriculum_id=1,
                faculty_id=1,
                day_of_week="Mon",
                start_time=time(10, 0),
                end_time=time(9, 0),
            )

        with self.assertRaises(ValidationError):
            schemas.ScheduleUpdate(section="1A@!")

        with self.assertRaises(ValidationError):
            schemas.ConflictValidate(
                semester_id=1,
                curriculum_id=1,
                faculty_id=1,
                day_of_week="Mon",
                start_time=time(10, 0),
                end_time=time(10, 0),
            )


class RouterValidationGuardsTest(unittest.TestCase):
    def setUp(self):
        self.db = _make_memory_db()

    def tearDown(self):
        self.db.close()

    def test_semester_update_rejects_duplicate_year_and_term(self):
        s1 = models.Semester(academic_year="2026-2027", term="1st", is_active=False)
        s2 = models.Semester(academic_year="2026-2027", term="2nd", is_active=False)
        self.db.add_all([s1, s2])
        self.db.commit()
        self.db.refresh(s1)
        self.db.refresh(s2)

        with self.assertRaises(HTTPException) as ctx:
            semesters.update_semester(
                semester_id=cast(int, s2.id),
                semester=schemas.SemesterUpdate(term="1st"),
                db=self.db,
                current_user=_fake_user(role="admin"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("already exists", ctx.exception.detail)

    def test_room_update_rejects_duplicate_name_in_same_building(self):
        r1 = models.Room(name="204", capacity=40, type="lecture", building="Main")
        r2 = models.Room(name="205", capacity=40, type="lecture", building="Main")
        self.db.add_all([r1, r2])
        self.db.commit()
        self.db.refresh(r2)

        with self.assertRaises(HTTPException) as ctx:
            rooms.update_room(
                room_id=cast(int, r2.id),
                room=schemas.RoomUpdate(name="204"),
                db=self.db,
                current_user=_fake_user(role="admin"),
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("already exists", ctx.exception.detail)

    def test_professor_update_enforces_effective_load_bounds(self):
        dept = models.Department(code="CAST", name="College of Arts, Sciences and Technology")
        self.db.add(dept)
        self.db.commit()
        self.db.refresh(dept)

        fac = models.Faculty(
            first_name="Elena",
            last_name="Santos",
            email="elena.santos@dlsau.edu.ph",
            type="full_time",
            load_unit="units",
            max_units=18,
            department_id=dept.id,
        )
        self.db.add(fac)
        self.db.commit()
        self.db.refresh(fac)

        # Switching full_time (18 units) -> part_time without reducing max_units violates 1..12 part_time units cap
        with self.assertRaises(HTTPException) as ctx:
            professors.update_professor(
                faculty_id=cast(int, fac.id),
                faculty=schemas.FacultyUpdate(type="part_time"),
                db=self.db,
                current_user=_fake_user(role="program_chair", department="CAST"),
            )
        self.assertEqual(ctx.exception.status_code, 422)

    def test_schedule_update_enforces_effective_time_order(self):
        dept = models.Department(code="CAST", name="College of Arts, Sciences and Technology")
        sem = models.Semester(academic_year="2026-2027", term="1st", is_active=True)
        self.db.add_all([dept, sem])
        self.db.commit()
        self.db.refresh(dept)
        self.db.refresh(sem)

        curr = models.Curriculum(code="CS101", name="Intro CS", units=3, type="lecture", department_id=dept.id)
        fac = models.Faculty(
            first_name="Mario",
            last_name="Cruz",
            email="mario.cruz@dlsau.edu.ph",
            type="full_time",
            load_unit="units",
            max_units=18,
            department_id=dept.id,
        )
        self.db.add_all([curr, fac])
        self.db.commit()
        self.db.refresh(curr)
        self.db.refresh(fac)

        sched = models.Schedule(
            semester_id=sem.id,
            curriculum_id=curr.id,
            faculty_id=fac.id,
            day_of_week="Mon",
            start_time=time(9, 0),
            end_time=time(11, 0),
            section="1A",
        )
        self.db.add(sched)
        self.db.commit()
        self.db.refresh(sched)

        with self.assertRaises(HTTPException) as ctx:
            schedules.update_schedule(
                schedule_id=cast(int, sched.id),
                schedule=schemas.ScheduleUpdate(end_time=time(8, 30)),
                db=self.db,
                current_user=_fake_user(role="program_chair", department="CAST"),
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("after start time", ctx.exception.detail)

    def test_excel_upload_helper_rejects_bad_extension_or_empty_file(self):
        bad_ext = UploadFile(file=io.BytesIO(b"abc"), filename="subjects.csv")
        with self.assertRaises(HTTPException) as ctx_ext:
            curriculum._validate_excel_upload(bad_ext, b"abc")
        self.assertEqual(ctx_ext.exception.status_code, 400)
        self.assertIn(".xlsx", ctx_ext.exception.detail)

        empty_xlsx = UploadFile(file=io.BytesIO(b""), filename="subjects.xlsx")
        with self.assertRaises(HTTPException) as ctx_empty:
            curriculum._validate_excel_upload(empty_xlsx, b"")
        self.assertEqual(ctx_empty.exception.status_code, 400)
        self.assertIn("empty", ctx_empty.exception.detail)

        valid_xlsx = UploadFile(file=io.BytesIO(b"PK\x03\x04"), filename="subjects.xlsx")
        curriculum._validate_excel_upload(valid_xlsx, b"PK\x03\x04")


if __name__ == "__main__":
    unittest.main()
