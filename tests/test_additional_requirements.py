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

    # Requirement 6: Plot all remaining unassigned major subjects under UNASSIGNED PROFESSOR
    def test_generate_unassigned_subjects_grid_and_cleanup(self):
        """All unassigned major subjects plot under faculty_id=None (UNASSIGNED PROFESSOR) bypassing hours/overlaps, and clean up when assigned."""
        from backend.app.routers.ai_scheduler import generate_unassigned_schedule, get_global_schedule
        from backend.app.routers.subject_offerings import create_subject_offering

        # Add 20 unassigned major subjects in the same term to force stacking/overlapping slots
        unassigned_currs = []
        for idx in range(1, 21):
            c = models.Curriculum(
                id=100 + idx,
                code=f"CS{200 + idx}A",
                name=f"Unassigned CS Subject {idx}",
                units=3,
                lec_units=3,
                lab_units=0,
                department_id=1,
                type="lecture",
                block_id=self.block_cs.id,
                semester_term="1st",
                is_major=True,
            )
            unassigned_currs.append(c)
        self.db.add_all(unassigned_currs)

        # Also add an existing assigned professor's schedule to confirm it is untouched
        existing_prof_sched = models.Schedule(
            semester_id=self.sem.id,
            curriculum_id=self.curr_cs.id,
            faculty_id=self.fac_cs.id,
            day_of_week="Mon",
            start_time=time(7, 30),
            end_time=time(9, 30),
            status="draft",
        )
        self.db.add(existing_prof_sched)
        self.db.commit()

        # 1. Plot all unassigned major subjects
        res = generate_unassigned_schedule(self.sem.id, db=self.db, current_user=self.chair_cs)
        self.assertEqual(res["subjects_plotted"], 20)
        self.assertEqual(res["schedules_created"], 40)  # 20 x 2 sessions/week

        # No Conflict records created, and existing assigned professor's schedule untouched
        self.assertEqual(self.db.query(models.Conflict).count(), 0)
        self.assertIsNotNone(
            self.db.query(models.Schedule).filter(models.Schedule.id == existing_prof_sched.id).first()
        )

        # 2. Global schedule returns them with faculty_name == "UNASSIGNED PROFESSOR"
        # and spreads them across both morning (07:30-11:30) and afternoon (13:30-17:30)
        global_rows = get_global_schedule(self.sem.id, db=self.db, current_user=self.chair_cs)
        unassigned_rows = [r for r in global_rows if r["faculty_name"] == "UNASSIGNED PROFESSOR"]
        self.assertEqual(len(unassigned_rows), 40)
        self.assertTrue(all(r["faculty_id"] is None for r in unassigned_rows))
        morning_rows = [r for r in unassigned_rows if r["start_time"] < "12:00"]
        afternoon_rows = [r for r in unassigned_rows if r["start_time"] >= "13:00"]
        self.assertGreater(len(morning_rows), 0)
        self.assertGreater(len(afternoon_rows), 0)
        self.assertTrue(any(r["end_time"] == "17:30" for r in afternoon_rows))

        # 3. Re-running replaces cleanly without duplicating
        res2 = generate_unassigned_schedule(self.sem.id, db=self.db, current_user=self.chair_cs)
        self.assertEqual(res2["subjects_plotted"], 20)
        self.assertEqual(
            self.db.query(models.Schedule).filter(models.Schedule.faculty_id.is_(None)).count(),
            40,
        )

        # 4a. Assigning a professor whose slot CONFLICTS (Mon 07:30-09:30 already occupied)
        # removes the UNASSIGNED PROFESSOR placeholder cleanly without double-booking
        conflict_curr = unassigned_currs[0]  # plotted on Mon/Wed 07:30-09:30
        create_subject_offering(
            schemas.SubjectOfferingCreate(
                faculty_id=self.fac_cs.id,
                curriculum_id=conflict_curr.id,
                semester_id=self.sem.id,
            ),
            db=self.db,
            current_user=self.chair_cs,
        )
        self.assertEqual(
            self.db.query(models.Schedule).filter(
                models.Schedule.semester_id == self.sem.id,
                models.Schedule.curriculum_id == conflict_curr.id,
            ).count(),
            0,
        )

        # 4b. Assigning a professor who IS FREE during that exact day/time transfers
        # the UNASSIGNED PROFESSOR sessions directly to that professor at the same day/time
        free_curr = unassigned_currs[1]  # plotted on Tue/Thu 13:30-15:30 (fac_cs is free)
        before_slots = sorted(
            (s.day_of_week, s.start_time, s.end_time)
            for s in self.db.query(models.Schedule).filter(
                models.Schedule.semester_id == self.sem.id,
                models.Schedule.curriculum_id == free_curr.id,
                models.Schedule.faculty_id.is_(None),
            ).all()
        )
        create_subject_offering(
            schemas.SubjectOfferingCreate(
                faculty_id=self.fac_cs.id,
                curriculum_id=free_curr.id,
                semester_id=self.sem.id,
            ),
            db=self.db,
            current_user=self.chair_cs,
        )
        # Gone from UNASSIGNED PROFESSOR...
        self.assertEqual(
            self.db.query(models.Schedule).filter(
                models.Schedule.semester_id == self.sem.id,
                models.Schedule.curriculum_id == free_curr.id,
                models.Schedule.faculty_id.is_(None),
            ).count(),
            0,
        )
        # ...and now plotted on fac_cs at the exact same days and times!
        after_slots = sorted(
            (s.day_of_week, s.start_time, s.end_time)
            for s in self.db.query(models.Schedule).filter(
                models.Schedule.semester_id == self.sem.id,
                models.Schedule.curriculum_id == free_curr.id,
                models.Schedule.faculty_id == self.fac_cs.id,
            ).all()
        )
        self.assertEqual(after_slots, before_slots)

    # Requirement 7: Delete entire schedule per professor (and UNASSIGNED PROFESSOR)
    def test_clear_schedule_per_professor_and_unassigned(self):
        """Clearing a single professor deletes only their schedules; other professors and unassigned remain untouched."""
        from backend.app.routers.schedules import clear_all_schedules

        fac_other = models.Faculty(
            id=99, first_name="Alan", last_name="Turing", department_id=1, email="turing@dlsau.edu.ph"
        )
        self.db.add(fac_other)
        self.db.add_all([
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=self.fac_cs.id,
                day_of_week="Mon", start_time=time(7, 30), end_time=time(9, 30), status="draft",
            ),
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=self.fac_cs.id,
                day_of_week="Wed", start_time=time(7, 30), end_time=time(9, 30), status="draft",
            ),
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=fac_other.id,
                day_of_week="Tue", start_time=time(9, 30), end_time=time(11, 30), status="draft",
            ),
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=None,
                day_of_week="Thu", start_time=time(13, 30), end_time=time(15, 30), status="draft",
            ),
        ])
        self.db.commit()

        # Clear only fac_cs
        res_prof = clear_all_schedules(
            semester_id=self.sem.id, faculty_id=self.fac_cs.id, db=self.db, current_user=self.chair_cs
        )
        self.assertEqual(res_prof["deleted_count"], 2)
        self.assertEqual(len(res_prof["backup"]), 2)
        # fac_other and unassigned remain intact
        self.assertEqual(
            self.db.query(models.Schedule).filter(models.Schedule.faculty_id == fac_other.id).count(), 1
        )
        self.assertEqual(
            self.db.query(models.Schedule).filter(models.Schedule.faculty_id.is_(None)).count(), 1
        )

        # Clear only UNASSIGNED PROFESSOR
        res_unassigned = clear_all_schedules(
            semester_id=self.sem.id, unassigned_only=True, db=self.db, current_user=self.chair_cs
        )
        self.assertEqual(res_unassigned["deleted_count"], 1)
        self.assertEqual(
            self.db.query(models.Schedule).filter(models.Schedule.faculty_id == fac_other.id).count(), 1
        )
        self.assertEqual(
            self.db.query(models.Schedule).filter(models.Schedule.faculty_id.is_(None)).count(), 0
        )

    # Requirement 8: UNASSIGNED PROFESSOR isolation, CT 5:30 PM expansion guard, and Undo CT re-hydration
    def test_unassigned_isolation_ct_cutoff_and_undo_rehydration(self):
        """
        1) UNASSIGNED PROFESSOR placeholders do not leak into exports/publishing or block real generation.
        2) Restoring a late-afternoon CT subject to Regular never silently expands past 17:30 (non-CVMAS).
        3) Undo/restore re-hydrates CT metadata from the active SubjectOffering.
        """
        from backend.app.routers.schedules import (
            _load_export_schedules,
            get_schedule_status,
            clear_all_schedules,
            restore_schedules,
            RestoreSchedulesRequest,
        )
        from backend.app.routers.subject_offerings import update_subject_offering_ct

        # Seed 1 real professor schedule (late afternoon 16:00-17:00 CT) + 1 UNASSIGNED PROFESSOR placeholder
        self.off_cs.enrolled_students = 4
        self.off_cs.credited_hours_override = 1.0
        self.db.add_all([
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=self.fac_cs.id,
                day_of_week="Mon", start_time=time(16, 0), end_time=time(17, 0),
                status="draft", enrolled_students=4, credited_hours_override=1.0,
            ),
            models.Schedule(
                semester_id=self.sem.id, curriculum_id=self.curr_cs.id, faculty_id=None,
                day_of_week="Mon", start_time=time(7, 30), end_time=time(9, 30),
                status="draft",
            ),
        ])
        self.db.commit()

        # 1. Official export and publish status exclude UNASSIGNED PROFESSOR rows
        export_rows, _, _, _ = _load_export_schedules(self.db, self.chair_cs, self.sem.id)
        self.assertEqual(len(export_rows), 1)
        self.assertEqual(export_rows[0].faculty_id, self.fac_cs.id)

        pub_status = get_schedule_status(self.sem.id, db=self.db, current_user=self.chair_cs)
        self.assertEqual(pub_status["total"], 1)

        # 2. Restoring CS101 (starts 16:00, 1 session) from CT (1h) back to Regular (4h -> 20:00)
        # must NOT silently auto-expand past 17:30 for non-CVMAS
        ct_res = update_subject_offering_ct(
            self.off_cs.id, schemas.SubjectOfferingCTUpdate(ct_tier="regular"), self.db, self.chair_cs
        )
        self.assertFalse(ct_res["auto_adjusted"])
        self.assertTrue(ct_res["needs_reschedule"])
        sched_after = self.db.query(models.Schedule).filter(
            models.Schedule.faculty_id == self.fac_cs.id
        ).first()
        self.assertEqual(sched_after.end_time, time(17, 0))

        # 3. Re-flag CT, clear professor, then Undo/Restore -> CT metadata must be preserved!
        update_subject_offering_ct(
            self.off_cs.id, schemas.SubjectOfferingCTUpdate(ct_tier="ct_1_4"), self.db, self.chair_cs
        )
        cleared = clear_all_schedules(
            semester_id=self.sem.id, db=self.db, current_user=self.chair_cs, faculty_id=self.fac_cs.id
        )
        self.assertEqual(cleared["deleted_count"], 1)
        restore_schedules(
            RestoreSchedulesRequest(items=[schemas.ScheduleCreate(**item) for item in cleared["backup"]]),
            db=self.db,
            current_user=self.chair_cs,
        )
        restored = self.db.query(models.Schedule).filter(
            models.Schedule.faculty_id == self.fac_cs.id
        ).first()
        self.assertIsNotNone(restored)
        self.assertEqual(restored.enrolled_students, 4)
        self.assertEqual(restored.credited_hours_override, 1.0)
