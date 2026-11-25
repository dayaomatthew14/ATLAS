import unittest
from datetime import time, datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app import models, schemas
from backend.app.services.schedule_generator import faculty_has_flexible_lunch_break, GENERAL_MAX_END_TIME
from backend.app.routers.professors import calculate_unavailability_hours
from backend.app.routers.schedules import create_schedule, _load_registrar_proposal_subjects
from backend.app.routers.lab_rooms import (
    ensure_cast_computer_labs,
    assign_lab_room,
    approve_lab_room,
    reject_lab_room,
    LabRoomAssignRequest,
)
from fastapi import HTTPException


class AdditionalSchedulingRequirementsTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed basic departments
        self.dept_cast = models.Department(id=1, name="College of Arts, Sciences & Technology", code="CAST")
        self.dept_cvmas = models.Department(id=2, name="College of Veterinary Medicine and Agricultural Sciences", code="CVMAS")
        self.db.add_all([self.dept_cast, self.dept_cvmas])

        # Seed semester
        self.sem = models.Semester(id=1, academic_year="2026-2027", term="1st", is_active=True)
        self.db.add(self.sem)

        # Seed programs under CAST
        self.prog_bscs = models.Program(id=1, name="BS Computer Science", code="BSCS", department_id=1)
        self.prog_bscpe = models.Program(id=2, name="BS Computer Engineering", code="BSCPE", department_id=1)
        self.prog_abpsy = models.Program(id=3, name="AB Psychology", code="ABPSY", department_id=1)
        self.db.add_all([self.prog_bscs, self.prog_bscpe, self.prog_abpsy])

        # Seed users
        self.chair_cs = models.User(
            id=1, email="cs.chair@dlsau.edu.ph", first_name="CS", last_name="Chair", role="program_chair",
            department="CAST", is_verified=True, password_hash="pw"
        )
        self.chair_psy = models.User(
            id=2, email="psy.chair@dlsau.edu.ph", first_name="Psy", last_name="Chair", role="program_chair",
            department="CAST", is_verified=True, password_hash="pw"
        )
        self.chair_cvmas = models.User(
            id=3, email="cvmas.chair@dlsau.edu.ph", first_name="CVMAS", last_name="Chair", role="program_chair",
            department="CVMAS", is_verified=True, password_hash="pw"
        )
        self.db.add_all([self.chair_cs, self.chair_psy, self.chair_cvmas])

        # Seed faculty
        self.fac_cs = models.Faculty(id=1, first_name="Ada", last_name="Lovelace", department_id=1, email="ada@dlsau.edu.ph")
        self.fac_cvmas = models.Faculty(id=2, first_name="James", last_name="Herriot", department_id=2, email="herriot@dlsau.edu.ph")
        self.db.add_all([self.fac_cs, self.fac_cvmas])

        # Seed curriculum block
        self.block_cs = models.CurriculumBlock(
            id=1, program_name="BS Computer Science", academic_year="2026-2027",
            department_id=1, program_id=1, status="PUBLISHED"
        )
        self.db.add(self.block_cs)

        # Seed curriculum items
        self.curr_cs = models.Curriculum(
            id=1, code="CS101", name="Programming 1", units=3, department_id=1,
            type="lecture", block_id=1, semester_term="1st", is_major=True
        )
        self.curr_gened = models.Curriculum(
            id=2, code="CORE101", name="Understanding Self", units=3, department_id=1,
            type="lecture", block_id=1, semester_term="1st", is_major=False
        )
        self.curr_cvmas = models.Curriculum(
            id=3, code="VET101", name="Anatomy", units=3, department_id=2,
            type="lecture", semester_term="1st", is_major=True
        )
        self.db.add_all([self.curr_cs, self.curr_gened, self.curr_cvmas])

        # Seed offerings
        self.off_cs = models.SubjectOffering(
            id=1, semester_id=1, curriculum_id=1, faculty_id=1
        )
        self.db.add(self.off_cs)
        self.db.commit()

        # Seed CAST lab rooms
        ensure_cast_computer_labs(self.db)

    def tearDown(self):
        self.db.close()

    # Requirement 1: Scheduling Time Restrictions (5:30 PM - 7:30 PM restricted to CVMAS)
    def test_scheduling_time_restrictions_non_cvmas_blocked(self):
        """Non-CVMAS schedule ending past 17:30 (5:30 PM) must be blocked with HTTP 400."""
        sched_late = schemas.ScheduleCreate(
            curriculum_id=self.curr_cs.id,
            faculty_id=self.fac_cs.id,
            day_of_week="Mon",
            start_time=time(17, 30),
            end_time=time(19, 30),
            semester_id=self.sem.id,
        )
        with self.assertRaises(HTTPException) as ctx:
            create_schedule(sched_late, db=self.db, current_user=self.chair_cs)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("5:30 PM", ctx.exception.detail)

    def test_scheduling_time_restrictions_cvmas_allowed(self):
        """CVMAS schedule ending past 17:30 (e.g. 19:30) is allowed."""
        # Add offering for VET101
        self.db.add(models.SubjectOffering(
            id=2, semester_id=1, curriculum_id=self.curr_cvmas.id, faculty_id=self.fac_cvmas.id
        ))
        self.db.commit()

        sched_cvmas = schemas.ScheduleCreate(
            curriculum_id=self.curr_cvmas.id,
            faculty_id=self.fac_cvmas.id,
            day_of_week="Mon",
            start_time=time(17, 30),
            end_time=time(19, 30),
            semester_id=self.sem.id,
        )
        res = create_schedule(sched_cvmas, db=self.db, current_user=self.chair_cvmas)
        self.assertEqual(res.end_time, time(19, 30))

    # Requirement 2: Faculty Unavailability (10-hour limit warning)
    def test_faculty_unavailability_warning_threshold(self):
        """Warning must trigger when total weekly unavailability exceeds 10.0 hours."""
        unavails_under_10 = [
            models.FacultyUnavailability(faculty_id=1, day_of_week="Mon", start_time=time(8, 0), end_time=time(12, 0)),  # 4h
            models.FacultyUnavailability(faculty_id=1, day_of_week="Wed", start_time=time(13, 0), end_time=time(18, 0)), # 5h -> total 9h
        ]
        hours_under = calculate_unavailability_hours(unavails_under_10)
        self.assertEqual(hours_under, 9.0)
        self.assertFalse(hours_under > 10.0)

        unavails_over_10 = unavails_under_10 + [
            models.FacultyUnavailability(faculty_id=1, day_of_week="Fri", start_time=time(8, 0), end_time=time(10, 0)),  # +2h -> total 11h
        ]
        hours_over = calculate_unavailability_hours(unavails_over_10)
        self.assertEqual(hours_over, 11.0)
        self.assertTrue(hours_over > 10.0)

    # Requirement 3: Flexible Lunch Break (1 continuous hour reserved within 11:00 AM - 2:30 PM)
    def test_flexible_lunch_break_logic(self):
        """Classes spanning midday must leave at least 1 continuous hour free in midday window."""
        # No classes scheduled yet: 11:30 to 13:30 leaves 13:30 to 14:30 (1 hour free)
        ok = faculty_has_flexible_lunch_break(
            faculty_id=1,
            day="Tue",
            cand_start=time(11, 30),
            cand_end=time(13, 30),
            all_schedules=[],
        )
        self.assertTrue(ok, "Placing 11:30-13:30 leaves 13:30-14:30 (60 mins) for lunch")

        # Now suppose a class already exists from 13:30 to 14:30
        existing_sched = models.Schedule(
            id=10, faculty_id=1, day_of_week="Tue",
            start_time=time(13, 30), end_time=time(14, 30)
        )
        # Attempting another class from 11:00 to 13:00 leaves only 13:00-13:30 (30 mins free)
        blocked = faculty_has_flexible_lunch_break(
            faculty_id=1,
            day="Tue",
            cand_start=time(11, 0),
            cand_end=time(13, 0),
            all_schedules=[existing_sched],
        )
        self.assertFalse(blocked, "Leaves only 30 mins free between 11:00 and 14:30, violating 1-hr lunch")

    # Requirement 4: General Education Subjects in Exports
    def test_gen_ed_export_filtering(self):
        """Unassigned GenEd subjects must be excluded from the export proposal sheet."""
        # curr_gened (CORE101) has no offering / no assigned faculty
        proposal_items = _load_registrar_proposal_subjects(self.db, self.dept_cast, 1)
        curr_codes = [p["code"] for p in proposal_items]

        # Major subject CS101 must be present
        self.assertIn("CS101", curr_codes)
        # Unassigned GenEd CORE101 must NOT be present
        self.assertNotIn("CORE101", curr_codes)

        # Now assign CORE101 to a faculty in the department
        self.db.add(models.SubjectOffering(
            id=3, semester_id=1, curriculum_id=self.curr_gened.id, faculty_id=self.fac_cs.id
        ))
        self.db.commit()

        proposal_items_updated = _load_registrar_proposal_subjects(self.db, self.dept_cast, 1)
        curr_codes_updated = [p["code"] for p in proposal_items_updated]
        # Now assigned GenEd must appear
        self.assertIn("CORE101", curr_codes_updated)

    # Requirement 5: Laboratory Rooms Management (CAST Only)
    def test_cast_lab_rooms_priority_and_approvals(self):
        """CS/COE chairs get auto-approval; other chairs submit pending requests requiring approval."""
        rooms = self.db.query(models.Room).filter(models.Room.type == 'computer_lab').all()
        self.assertEqual(len(rooms), 3)
        room_608 = next(r for r in rooms if "608" in r.name)

        # 1. CS Chair assigns Room 608 for BSCS
        assign_data_cs = LabRoomAssignRequest(
            room_id=room_608.id,
            semester_id=self.sem.id,
            curriculum_id=self.curr_cs.id,
            faculty_id=self.fac_cs.id,
            day_of_week="Mon",
            start_time=time(8, 0),
            end_time=time(10, 0),
            program_code="BSCS",
        )
        res_cs = assign_lab_room(assign_data_cs, db=self.db, current_user=self.chair_cs)
        self.assertTrue(res_cs["success"])
        self.assertEqual(res_cs["room_approval_status"], "approved")

        # 2. Overlapping booking on same room and time is strictly rejected
        with self.assertRaises(HTTPException) as ctx:
            assign_lab_room(assign_data_cs, db=self.db, current_user=self.chair_cs)
        self.assertEqual(ctx.exception.status_code, 409)

        # 3. Psychology Chair (non-CS/COE) requests Room 608 at a non-overlapping time
        assign_data_psy = LabRoomAssignRequest(
            room_id=room_608.id,
            semester_id=self.sem.id,
            curriculum_id=self.curr_gened.id,
            faculty_id=self.fac_cs.id,
            day_of_week="Mon",
            start_time=time(10, 30),
            end_time=time(12, 30),
            program_code="ABPSY",
        )
        res_psy = assign_lab_room(assign_data_psy, db=self.db, current_user=self.chair_psy)
        self.assertTrue(res_psy["success"])
        self.assertEqual(res_psy["room_approval_status"], "pending_approval")
        sched_id = res_psy["schedule_id"]

        # 4. CS Chair approves the Psychology request
        approve_res = approve_lab_room(sched_id, db=self.db, current_user=self.chair_cs)
        self.assertTrue(approve_res["success"])
        self.assertEqual(approve_res["room_approval_status"], "approved")

        # Verify DB reflects approved
        sched_db = self.db.query(models.Schedule).filter(models.Schedule.id == sched_id).first()
        self.assertEqual(sched_db.room_approval_status, "approved")
        self.assertEqual(sched_db.room_approved_by, self.chair_cs.id)
