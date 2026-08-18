import unittest
import io
import openpyxl
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models, schemas, auth
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict, check_overlap
from backend.app.routers import (
    auth_router, curriculum, rooms, users, schedules,
    semesters, ai_scheduler, logs, ai_rules,
    notifications_router, conflicts, subject_offerings, professors
)

def _standard_lecture_hours_per_week():
    """Weekly hours one generated standard lecture carries (80 min x 2 = 2.67)."""
    from backend.app.services import schedule_generator as sg
    return sg.get_duration_hours(*sg.STANDARD_LECTURE_SLOTS[0]) * 2


def _lectures_to_exceed(target_hours):
    """How many standard lectures it takes to go strictly past `target_hours`."""
    per = _standard_lecture_hours_per_week()
    count = 1
    while count * per <= target_hours + 0.01:
        count += 1
    return count


def _lectures_to_reach(target_hours):
    """How many standard lectures it takes to reach `target_hours` or more."""
    per = _standard_lecture_hours_per_week()
    count = 1
    while count * per < target_hours:
        count += 1
    return count


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
        """
        Ingestion is an administrator's job. Every write in the curriculum router
        -- create, edit, delete, bulk, header preview, block deletion -- is
        admin-only, and import is no exception: with dry_run=false it authors a
        CurriculumBlock and its subjects outright. The curriculum is institutional
        reference data that chairs and coordinators read, not write.
        """
        import asyncio
        from fastapi import HTTPException
        excel_data = _make_sample_excel_bytes()

        # A chair is refused, which is the rule this scenario runs under.
        chair_user = self.db.query(models.User).filter(models.User.email == "chair.cast@dlsau.edu.ph").first()
        with self.assertRaises(HTTPException) as ctx:
            asyncio.run(curriculum._process_curriculum_import(
                contents=excel_data,
                department_id=1,
                program_code="CS",
                dry_run=False,
                db=self.db,
                current_user=chair_user
            ))
        self.assertEqual(ctx.exception.status_code, 403)

        admin_user = self.db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
        res = asyncio.run(curriculum._process_curriculum_import(
            contents=excel_data,
            department_id=1,
            program_code="CS",
            dry_run=False,
            db=self.db,
            current_user=admin_user
        ))
        self.assertIn("summary", res)
        # Four, not five: CS101, MATH101 and the two halves of CS102A/B. The
        # sheet's fifth row, CS-ELEC1, sits under ELECTIVES -- a pool a student
        # chooses from rather than a subject taught in a given term -- and the
        # importer deliberately leaves that pool out.
        self.assertEqual(res["summary"]["created_subjects"], 4)

        # Check block entity created
        block = self.db.query(models.CurriculumBlock).first()
        self.assertIsNotNone(block)
        self.assertEqual(block.status, "PUBLISHED")

        # Check curriculum subjects created
        subjects = self.db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
        codes = sorted(s.code for s in subjects)
        self.assertEqual(codes, ["CS101", "CS102A", "CS102B", "MATH101"])

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

    def test_09b_generated_lectures_match_institutional_patterns(self):
        """
        A generated lecture must carry the college's actual weekly hours.

        The generator used to plot every lecture on a single 90-minute grid,
        giving 3.00 hrs/week -- a figure matching neither confirmed pattern, so
        the REG. HOURS ATLAS reported could never agree with the ones a chair
        computes by hand. Standard programmes are 80 min x 2 = 2.67 hrs/week and
        engineering (BSCPE) is 2 h x 2 = 4.00.
        """
        from backend.app.services import schedule_generator as sg
        from backend.app.services import faculty_load as fl

        def weekly_hours(grid):
            return {round(sg.get_duration_hours(a, b) * 2, 2) for a, b in grid}

        self.assertEqual(weekly_hours(sg.STANDARD_LECTURE_SLOTS), {2.67})
        self.assertEqual(weekly_hours(sg.ENGINEERING_LECTURE_SLOTS), {4.00})
        self.assertEqual(weekly_hours(sg.LAB_SLOTS), {4.00})

        bscpe = models.Curriculum(
            code="CPE301", name="Logic Circuits", units=3,
            department_id=1, type="lecture", lec_units=3, lab_units=0,
            program_code="BSCPE",
        )
        bscs = models.Curriculum(
            code="CS310", name="Algorithms", units=3,
            department_id=1, type="lecture", lec_units=3, lab_units=0,
            program_code="BSCS",
        )
        self.db.add_all([bscpe, bscs])
        self.db.commit()

        self.assertEqual(weekly_hours(sg.lecture_slots_for(bscpe)), {4.00})
        self.assertEqual(weekly_hours(sg.lecture_slots_for(bscs)), {2.67})

        # A subject with no programme recorded must not silently take the
        # engineering pattern; standard is the safe default.
        no_code = models.Curriculum(
            code="GEN100", name="Unmapped", units=3,
            department_id=1, type="lecture", lec_units=3, lab_units=0,
        )
        self.db.add(no_code)
        self.db.commit()
        self.assertEqual(weekly_hours(sg.lecture_slots_for(no_code)), {2.67})

        # The exact required loads must be reachable, or REGULAR is unreachable
        # and every faculty member reads as under or over for ever.
        plotted = [sg.STANDARD_LECTURE_SLOTS[0]] * 6 + [sg.LAB_SLOTS[0]] * 6
        total = fl.round_hours(sum(fl.duration_hours(a, b) for a, b in plotted))
        self.assertEqual(total, 20.0)
        self.assertEqual(fl.load_status(total, 20.0), fl.REGULAR)

    def test_09c_not_plotted_is_not_an_underload(self):
        """
        Subjects assigned but no timetable generated is a statement about the
        term's progress, not a verdict on the faculty member. Reporting it as
        UNDERLOAD buries the real underloads among faculty nobody has plotted.
        """
        from backend.app.services import faculty_load as fl

        assigned_unplotted = fl.summarise(0.0, '1st', 'full_time', has_offerings=True)
        self.assertEqual(assigned_unplotted["load_status"], fl.NOT_PLOTTED)
        self.assertIsNone(assigned_unplotted["remaining_hours"])
        # The required figure still shows, so a chair can see what is coming.
        self.assertEqual(assigned_unplotted["required_hours"], 24.0)

        # No subjects at all is a real underload -- that member has no work.
        unassigned = fl.summarise(0.0, '1st', 'full_time', has_offerings=False)
        self.assertEqual(unassigned["load_status"], fl.UNDERLOAD)
        self.assertEqual(unassigned["remaining_hours"], 24.0)

        # No active term: no schedule to measure and no figure to measure it
        # against, so no verdict may be given about anyone.
        no_term = fl.summarise(0.0, None, 'full_time', has_offerings=True)
        self.assertEqual(no_term["load_status"], fl.NO_ACTIVE_TERM)
        self.assertIsNone(no_term["required_hours"])
        self.assertIsNone(no_term["work_week"])

    def test_10_overload_warning_and_conflict_logging(self):
        """
        Teaching load is hours per week off the plotted schedule, and the
        required figure comes from the term (1st = 24 hrs) and employment type
        -- not from `max_units`, which counts subject units and is a different
        quantity entirely. Passing the required figure is an overload, which the
        institution recognises: the class is still placed, and the chair is
        warned rather than blocked.
        """
        sem = models.Semester(academic_year="2025-2026", term="1st", is_active=True)
        self.db.add(sem)
        self.db.commit()

        fac = models.Faculty(first_name="Elena", last_name="Gomez", type="full_time", department_id=1)
        self.db.add(fac)
        self.db.commit()

        # Enough standard lectures to pass the 24 hrs/week required in the 1st
        # term. The count is derived from the grid rather than written in, so
        # changing the institutional lecture pattern cannot quietly turn this
        # into a test that no longer overloads anybody.
        count = _lectures_to_exceed(24.0)
        subjects = []
        for i in range(count):
            subjects.append(models.Curriculum(
                code=f"CS{400 + i}", name=f"Overload Subject {i}", units=3,
                department_id=1, type="lecture", lec_units=3, lab_units=0
            ))
        self.db.add_all(subjects)
        self.db.commit()

        self.db.add_all([
            models.SubjectOffering(faculty_id=fac.id, curriculum_id=s.id, semester_id=sem.id)
            for s in subjects
        ])
        self.db.commit()

        res = generate_schedules(self.db, sem.id, [fac.id], department_id=1, auto_bump_units=False)
        self.assertGreater(len(res["bumped_warnings"]), 0)

        warning = res["bumped_warnings"][0]
        self.assertEqual(warning["required_hours"], 24.0)
        self.assertGreater(warning["overload_hours"], 0)

        conf = self.db.query(models.Conflict).filter(models.Conflict.conflict_type == "overload").first()
        self.assertIsNotNone(conf)

        # Overload warns; it does not refuse. The subject is still plotted.
        self.assertGreater(res["generated"], 0)

    def test_10b_part_time_ceiling_warning(self):
        """
        A Part-Time member has no required teaching figure -- the institution
        has not confirmed one -- only a 20 hrs/week ceiling they must stay under.
        """
        sem = models.Semester(academic_year="2026-2027", term="1st", is_active=False)
        self.db.add(sem)
        self.db.commit()

        fac = models.Faculty(first_name="Noel", last_name="Reyes", type="part_time", department_id=1)
        self.db.add(fac)
        self.db.commit()

        subjects = [
            models.Curriculum(
                code=f"PT{500 + i}", name=f"Part Time Subject {i}", units=3,
                department_id=1, type="lecture", lec_units=3, lab_units=0
            )
            for i in range(_lectures_to_reach(20.0))
        ]
        self.db.add_all(subjects)
        self.db.commit()

        self.db.add_all([
            models.SubjectOffering(faculty_id=fac.id, curriculum_id=s.id, semester_id=sem.id)
            for s in subjects
        ])
        self.db.commit()

        res = generate_schedules(self.db, sem.id, [fac.id], department_id=1, auto_bump_units=False)

        self.assertGreater(len(res["bumped_warnings"]), 0)
        warning = res["bumped_warnings"][0]
        self.assertIsNone(warning["required_hours"])
        self.assertEqual(warning["part_time_ceiling_hours"], 20.0)

        conf = self.db.query(models.Conflict).filter(
            models.Conflict.conflict_type == "part_time_ceiling"
        ).first()
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
