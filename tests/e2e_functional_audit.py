import unittest
import io
import openpyxl
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models, schemas, auth
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict, check_overlap
from backend.app.routers import (
    auth_router, curriculum, rooms, users, schedules,
    semesters, faculty, ai_scheduler, logs, ai_rules,
    notifications_router, conflicts, subject_offerings, professors
)

def _make_sample_excel_bytes():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "De La Salle Araneta University"
    
    ws.append(["DE LA SALLE ARANETA UNIVERSITY"])
    ws.append(["BACHELOR OF SCIENCE IN COMPUTER SCIENCE", "AY 2026-2027"])
    ws.append([])
    ws.append(["FIRST YEAR", "First Term"])
    ws.append(["Course Code", "Course Title", "Lec", "Lab", "Units", "Pre-requisite"])
    ws.append(["CS101", "Introduction to Computing", 2, 1, 3, "None"])
    ws.append(["MATH101", "Calculus I", 3, 0, 3, "None"])
    ws.append([])
    ws.append(["FIRST YEAR", "Second Term"])
    ws.append(["Course Code", "Course Title", "Lec", "Lab", "Units", "Pre-requisite"])
    ws.append(["CS102A/B", "Data Structures Lec/Lab", 2, 1, 3, "CS101"])
    ws.append([])
    ws.append(["ELECTIVES"])
    ws.append(["Course Code", "Course Title", "Lec", "Lab", "Units"])
    ws.append(["CS-ELEC1", "Cloud Computing Elective", 3, 0, 3])
    ws.append([])
    ws.append(["SUMMARY OF UNITS"])
    ws.append(["TOTAL UNITS", 12])
    
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()

class EndToEndFunctionalAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(cls.engine)
        cls.SessionLocal = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.SessionLocal()
        # Seed default departments
        dept_cast = models.Department(id=1, name="College of Arts, Sciences, and Technology", code="CAST")
        dept_cbma = models.Department(id=2, name="College of Business Management and Accountancy", code="CBMA")
        self.db.add_all([dept_cast, dept_cbma])
        self.db.commit()

        # Seed master admin
        admin_user = models.User(
            id=1,
            first_name="System",
            last_name="Administrator",
            email="admin@dlsau.edu.ph",
            password_hash=auth.get_password_hash("Admin123!"),
            role="admin",
            department="CAST",
            is_verified=True
        )
        # Seed Program Chair
        chair_user = models.User(
            id=2,
            first_name="Maria",
            last_name="Santos",
            email="chair.cast@dlsau.edu.ph",
            password_hash=auth.get_password_hash("Chair123!"),
            role="program_chair",
            department="CAST",
            is_verified=True
        )
        # Seed Coordinator
        coord_user = models.User(
            id=3,
            first_name="Juan",
            last_name="Dela Cruz",
            email="coord.cast@dlsau.edu.ph",
            password_hash=auth.get_password_hash("Coord123!"),
            role="coordinator",
            department="CAST",
            is_verified=True
        )
        self.db.add_all([admin_user, chair_user, coord_user])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(self.engine)
        models.Base.metadata.create_all(self.engine)

    # ----------------------------------------------------------------------
    # 1. AUTHENTICATION & ACCESS CONTROL VERIFICATION
    # ----------------------------------------------------------------------
    def test_01_authentication_and_password_verification(self):
        admin = self.db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
        self.assertIsNotNone(admin)
        self.assertTrue(auth.verify_password("Admin123!", admin.password_hash))
        self.assertFalse(auth.verify_password("WrongPw", admin.password_hash))

    def test_02_jwt_token_generation_and_decoding(self):
        token = auth.create_access_token({"sub": "admin@dlsau.edu.ph", "role": "admin", "sv": 1})
        self.assertIsNotNone(token)
        from jose import jwt
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        self.assertEqual(payload.get("sub"), "admin@dlsau.edu.ph")
        self.assertEqual(payload.get("role"), "admin")

    # ----------------------------------------------------------------------
    # 2. SYSTEM ADMINISTRATOR WORKFLOWS
    # ----------------------------------------------------------------------
    def test_03_admin_semester_management(self):
        # Create active semester
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        self.db.add(sem)
        self.db.commit()
        self.db.refresh(sem)

        fetched_sem = self.db.query(models.Semester).filter(models.Semester.is_active == True).first()
        self.assertIsNotNone(fetched_sem)
        self.assertEqual(fetched_sem.academic_year, "2025-2026")
        self.assertEqual(fetched_sem.term, "1st")

    def test_04_admin_user_management_crud(self):
        # Add a new coordinator user
        new_coord = models.User(
            first_name="Ana",
            last_name="Reyes",
            email="ana.reyes@dlsau.edu.ph",
            password_hash=auth.get_password_hash("Password123!"),
            role="coordinator",
            department="CAST",
            is_verified=True
        )
        self.db.add(new_coord)
        self.db.commit()

        user_in_db = self.db.query(models.User).filter(models.User.email == "ana.reyes@dlsau.edu.ph").first()
        self.assertIsNotNone(user_in_db)
        self.assertEqual(user_in_db.role, "coordinator")

    # ----------------------------------------------------------------------
    # 3. PROGRAM CHAIR & COORDINATOR WORKFLOWS
    # ----------------------------------------------------------------------
    def test_05_curriculum_block_and_subject_ingestion(self):
        import asyncio
        excel_data = _make_sample_excel_bytes()
        chair_user = self.db.query(models.User).filter(models.User.email == "chair.cast@dlsau.edu.ph").first()
        res = asyncio.run(curriculum._process_curriculum_import(
            contents=excel_data,
            department_id=1,
            program_code="CS",
            dry_run=False,
            db=self.db,
            current_user=chair_user
        ))
        self.assertIn("summary", res)
        self.assertEqual(res["summary"]["created_subjects"], 5)

        # Check block entity created
        block = self.db.query(models.CurriculumBlock).first()
        self.assertIsNotNone(block)
        self.assertEqual(block.status, "PUBLISHED")

        # Check curriculum subjects created
        subjects = self.db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
        self.assertGreaterEqual(len(subjects), 3)

    def test_06_room_resource_management(self):
        room_lec = models.Room(name="Rm 301", building="Jose Rizal Hall", capacity=40, type="lecture")
        room_lab = models.Room(name="CLab 1", building="Jose Rizal Hall", capacity=35, type="computer_lab")
        self.db.add_all([room_lec, room_lab])
        self.db.commit()

        rooms = self.db.query(models.Room).all()
        self.assertEqual(len(rooms), 2)
        types = [r.type for r in rooms]
        self.assertIn("lecture", types)
        self.assertIn("computer_lab", types)

    def test_07_faculty_records_and_unavailability(self):
        fac1 = models.Faculty(first_name="Roberto", last_name="Cruz", email="roberto.cruz@dlsau.edu.ph", max_units=18, type="full_time", department_id=1)
        fac2 = models.Faculty(first_name="Elena", last_name="Gomez", email="elena.gomez@dlsau.edu.ph", max_units=12, type="part_time", department_id=1)
        self.db.add_all([fac1, fac2])
        self.db.commit()

        # Add unavailability for fac1
        unavail = models.FacultyUnavailability(
            faculty_id=fac1.id,
            day_of_week="Mon",
            start_time=schemas.time(7, 30),
            end_time=schemas.time(10, 30)
        )
        self.db.add(unavail)
        self.db.commit()

        unavails = self.db.query(models.FacultyUnavailability).filter(models.FacultyUnavailability.faculty_id == fac1.id).all()
        self.assertEqual(len(unavails), 1)

    def test_08_subject_offering_assignments(self):
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        self.db.add(sem)
        self.db.commit()

        curr1 = models.Curriculum(code="CS101", name="Intro to Computing", units=3, department_id=1, type="lecture", lec_units=2, lab_units=1)
        fac1 = models.Faculty(first_name="Roberto", last_name="Cruz", department_id=1)
        self.db.add_all([curr1, fac1])
        self.db.commit()

        offering = models.SubjectOffering(faculty_id=fac1.id, curriculum_id=curr1.id, semester_id=sem.id, assigned_by=2)
        self.db.add(offering)
        self.db.commit()

        offerings = self.db.query(models.SubjectOffering).all()
        self.assertEqual(len(offerings), 1)

    # ----------------------------------------------------------------------
    # 4. SCHEDULING ENGINE & CONFLICT RESOLUTION
    # ----------------------------------------------------------------------
    def test_09_ai_schedule_generation_lecture_and_lab_rules(self):
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        self.db.add(sem)
        self.db.commit()

        fac1 = models.Faculty(first_name="Roberto", last_name="Cruz", max_units=18, type="full_time", department_id=1)
        room_lab = models.Room(name="CLab 1", building="Main", capacity=30, type="computer_lab")
        curr_lec = models.Curriculum(code="MATH101", name="Calculus I", units=3, department_id=1, type="lecture", lec_units=3, lab_units=0)
        curr_lab = models.Curriculum(code="CS102B", name="Data Structures Lab", units=1, department_id=1, type="lab", lec_units=0, lab_units=1)
        
        self.db.add_all([fac1, room_lab, curr_lec, curr_lab])
        self.db.commit()

        off1 = models.SubjectOffering(faculty_id=fac1.id, curriculum_id=curr_lec.id, semester_id=sem.id)
        off2 = models.SubjectOffering(faculty_id=fac1.id, curriculum_id=curr_lab.id, semester_id=sem.id)
        self.db.add_all([off1, off2])
        self.db.commit()

        # Run AI generator
        res = generate_schedules(self.db, sem.id, [fac1.id], department_id=1, auto_bump_units=False)
        self.assertGreater(res["generated"], 0)

        # Verify generated schedules
        schedules_in_db = self.db.query(models.Schedule).all()
        self.assertGreater(len(schedules_in_db), 0)

        for s in schedules_in_db:
            c = self.db.query(models.Curriculum).filter(models.Curriculum.id == s.curriculum_id).first()
            if c.type == 'lecture':
                self.assertIsNone(s.room_id) # Lecture has room_id NULL
            elif c.type == 'lab':
                self.assertIsNotNone(s.room_id) # Lab has room_id assigned

    def test_10_workload_cap_exceeded_conflict_logging(self):
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        self.db.add(sem)
        self.db.commit()

        # Faculty with 2 units max cap
        fac_limited = models.Faculty(first_name="Elena", last_name="Gomez", max_units=2, type="part_time", department_id=1)
        curr_heavy = models.Curriculum(code="CS401", name="Capstone Project", units=4, department_id=1, type="lecture", lec_units=4, lab_units=0)
        self.db.add_all([fac_limited, curr_heavy])
        self.db.commit()

        off = models.SubjectOffering(faculty_id=fac_limited.id, curriculum_id=curr_heavy.id, semester_id=sem.id)
        self.db.add(off)
        self.db.commit()

        res = generate_schedules(self.db, sem.id, [fac_limited.id], department_id=1, auto_bump_units=False)
        self.assertGreater(len(res["bumped_warnings"]), 0)

        # Conflict logged in DB
        conf = self.db.query(models.Conflict).filter(models.Conflict.conflict_type == "max_units_exceeded").first()
        self.assertIsNotNone(conf)

    # ----------------------------------------------------------------------
    # 5. LOCKING, PUBLISHING & EXPORTS
    # ----------------------------------------------------------------------
    def test_11_schedule_locking_and_publishing(self):
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        curr = models.Curriculum(code="ENG101", name="English Communication", units=3, department_id=1, type="lecture")
        fac = models.Faculty(first_name="Jane", last_name="Doe", department_id=1)
        self.db.add_all([sem, curr, fac])
        self.db.commit()

        sched = models.Schedule(
            semester_id=sem.id,
            curriculum_id=curr.id,
            faculty_id=fac.id,
            room_id=None,
            day_of_week="Mon",
            start_time=schemas.time(8, 0),
            end_time=schemas.time(9, 30),
            status="draft",
            is_locked=False
        )
        self.db.add(sched)
        self.db.commit()

        # Lock schedule
        sched.is_locked = True
        self.db.commit()

        refreshed_sched = self.db.query(models.Schedule).filter(models.Schedule.id == sched.id).first()
        self.assertTrue(refreshed_sched.is_locked)

        # Publish schedules for semester
        self.db.query(models.Schedule).filter(models.Schedule.semester_id == sem.id).update({"status": "published"})
        self.db.commit()

        pub_sched = self.db.query(models.Schedule).filter(models.Schedule.id == sched.id).first()
        self.assertEqual(pub_sched.status, "published")

if __name__ == "__main__":
    unittest.main()
