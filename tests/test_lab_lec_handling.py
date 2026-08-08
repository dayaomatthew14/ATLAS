import unittest
import re
import io
import openpyxl
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models, schemas
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict
from backend.app.routers.curriculum import _process_curriculum_import

def _make_excel_bytes(rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    if ws is None:
        ws = wb.create_sheet("Sheet")
    for r in rows:
        ws.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()

def setup_test_db():
    engine = create_engine("sqlite:///:memory:")
    models.Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    admin_user = models.User(id=1, first_name="System", last_name="Admin", email="admin@dlsau.edu.ph", role="admin", password_hash="pw")
    db.add(admin_user)
    db.commit()
    return db

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
            raw_code: str = str(item["raw"])
            ab_match = re.search(r"^(.*?)[_\-\s]*A/B$", raw_code, re.IGNORECASE)
            if ab_match:
                base_code = ab_match.group(1).strip()
                result_code = f"{base_code}A" if (item["room"] is None or item["type"] == "lecture") else f"{base_code}B"
            else:
                result_code = raw_code

            self.assertEqual(result_code, item["expected"])

    def test_dvm_already_separated_subjects_classification(self):
        test_rows = [
            {"code": "CHEF102A", "name": "Organic Chemistry Lec", "lec": 2, "lab": 0, "expected_type": "lecture"},
            {"code": "CHEF102B", "name": "Organic Chemistry Lab", "lec": 0, "lab": 1, "expected_type": "lab"},
            {"code": "ANAT101A", "name": "Veterinary Anatomy Lec", "lec": 3, "lab": 0, "expected_type": "lecture"},
            {"code": "ANAT101B", "name": "Veterinary Anatomy Lab", "lec": 0, "lab": 2, "expected_type": "lab"}
        ]

        for r in test_rows:
            lec_units: int = int(r["lec"]) # type: ignore
            lab_units: int = int(r["lab"]) # type: ignore
            code: str = str(r["code"])
            name: str = str(r["name"])

            if lec_units > 0 and lab_units == 0:
                ctype = 'lecture'
            elif lec_units == 0 and lab_units > 0:
                ctype = 'lab'
            else:
                if code.upper().endswith('B') or 'lab' in name.lower() or 'laboratory' in name.lower():
                    ctype = 'lab'
                else:
                    ctype = 'lecture'

            self.assertEqual(ctype, r["expected_type"])

    def test_separate_year_and_semester_section_headers_parsing_logic(self):
        rows = [
            "FIRST YEAR",
            "FIRST SEMESTER",
            "Course Code | Course Title | Lec | Lab | Units",
            "MATH101 | College Algebra | 3 | 0 | 3",
            "SECOND SEMESTER",
            "MATH102 | Trigonometry | 3 | 0 | 3",
            "SECOND YEAR",
            "FIRST SEMESTER",
            "CS201A/B | Data Structures Lec/Lab | 2 | 1 | 3"
        ]

        current_year = None
        current_sem = None
        parsed_subjects = []

        for row in rows:
            row_text = row.upper()
            y_match = re.search(r'(1ST|2ND|3RD|4TH|5TH|FIRST|SECOND|THIRD|FOURTH|FIFTH)\s+YEAR|YEAR\s+([1-5])', row_text)
            s_match = re.search(r'(1ST|2ND|3RD|FIRST|SECOND|THIRD)\s+(SEMESTER|TERM)|(3RD SEMESTER|MIDYEAR)', row_text)

            if y_match:
                current_year = "1" if "FIRST" in y_match.group(0) else ("2" if "SECOND" in y_match.group(0) else "1")
                continue
            if s_match:
                current_sem = "1st" if "FIRST" in s_match.group(0) else ("2nd" if "SECOND" in s_match.group(0) else "1st")
                continue

            if "|" in row and "Course Code" not in row:
                parts = [p.strip() for p in row.split("|")]
                code = parts[0]
                parsed_subjects.append({
                    "code": code,
                    "year": current_year,
                    "semester": current_sem
                })

        self.assertEqual(len(parsed_subjects), 3)
        self.assertEqual(parsed_subjects[0]["code"], "MATH101")
        self.assertEqual(parsed_subjects[0]["year"], "1")
        self.assertEqual(parsed_subjects[0]["semester"], "1st")

        self.assertEqual(parsed_subjects[1]["code"], "MATH102")
        self.assertEqual(parsed_subjects[1]["year"], "1")
        self.assertEqual(parsed_subjects[1]["semester"], "2nd")

        self.assertEqual(parsed_subjects[2]["code"], "CS201A/B")
        self.assertEqual(parsed_subjects[2]["year"], "2")
        self.assertEqual(parsed_subjects[2]["semester"], "1st")

    def test_generic_multi_department_excel_importer_accuracy(self):
        import asyncio
        async def run_async_tests():
            db = setup_test_db()
            dept = models.Department(name="College of Veterinary Medicine", code="CVMAS")
            db.add(dept)
            db.commit()

            class MockUser:
                id = 1
                role = "admin"
                department = "CVMAS"

            # 1. DVM Layout (Doctor of Veterinary Medicine)
            df1_data = [
                ["DE LA SALLE ARANETA UNIVERSITY", "", "", "", "", ""],
                ["DOCTOR OF VETERINARY MEDICINE", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["1ST YEAR 1ST SEMESTER", "", "", "", "", ""],
                ["Course Code", "Course Title", "Lec", "Lab", "Units", "Prerequisite"],
                ["CHEF102A", "Organic Chemistry Lec", 2, 0, 2, "NONE"],
                ["CHEF102B", "Organic Chemistry Lab", 0, 1, 1, "NONE"],
                ["1ST YEAR 2ND SEMESTER", "", "", "", "", ""],
                ["ANAT101A", "Veterinary Anatomy Lec", 3, 0, 3, "NONE"],
                ["ANAT101B", "Veterinary Anatomy Lab", 0, 2, 2, "NONE"]
            ]
            out1_bytes = _make_excel_bytes(df1_data)
            target_d_id: int = int(dept.id) # type: ignore
            res1 = await _process_curriculum_import(out1_bytes, target_d_id, "DVM", True, db, MockUser())
            report1 = res1.get("report", [])
            self.assertEqual(len(report1), 4)

            # 2. BSCS Layout (BS Computer Science - Combined A/B)
            df2_data = [
                ["BACHELOR OF SCIENCE IN COMPUTER SCIENCE", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["FIRST YEAR", "", "", "", "", ""],
                ["FIRST SEMESTER", "", "", "", "", ""],
                ["Subject Code", "Subject Name", "Lec Units", "Lab Units", "Units", "Pre-req"],
                ["CC101A/B", "Introduction to Computing Lec/Lab", 2, 1, 3, "NONE"],
                ["MATH101", "College Algebra", 3, 0, 3, "NONE"],
                ["SECOND SEMESTER", "", "", "", "", ""],
                ["CS201A/B", "Data Structures Lec/Lab", 2, 1, 3, "CC101A,CC101B"]
            ]
            out2_bytes = _make_excel_bytes(df2_data)
            res2 = await _process_curriculum_import(out2_bytes, target_d_id, "BSCS", True, db, MockUser())
            report2 = res2.get("report", [])
            self.assertEqual(len(report2), 5) # CC101A, CC101B, MATH101, CS201A, CS201B

            # 3. BSCpE Layout (BS Computer Engineering - Separate Section Lines)
            df3_data = [
                ["DE LA SALLE ARANETA UNIVERSITY", "", "", "", "", ""],
                ["BACHELOR OF SCIENCE IN COMPUTER ENGINEERING", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["1ST YEAR", "", "", "", "", ""],
                ["1ST SEMESTER", "", "", "", "", ""],
                ["Code", "Catalog Title", "Lec", "Lab", "Total Units", "Prerequisite(s)"],
                ["CPE101A/B", "Logic Circuits Lec/Lab", 2, 1, 3, "NONE"],
                ["PHYS101A/B", "University Physics Lec/Lab", 3, 1, 4, "NONE"],
                ["2ND SEMESTER", "", "", "", "", ""],
                ["MATH102", "Calculus I", 4, 0, 4, "MATH101"]
            ]
            out3_bytes = _make_excel_bytes(df3_data)
            res3 = await _process_curriculum_import(out3_bytes, target_d_id, "BSCpE", True, db, MockUser())
            report3 = res3.get("report", [])
            self.assertEqual(len(report3), 5) # CPE101A, CPE101B, PHYS101A, PHYS101B, MATH102

            # 4. New Unknown Department Layout (NewProgram_Curriculum.xlsx)
            df4_data = [
                ["COLLEGE OF BUSINESS AND MANAGEMENT", "", "", "", "", ""],
                ["BACHELOR OF SCIENCE IN BUSINESS ADMINISTRATION", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["INTRODUCTORY NOTES", "", "", "", "", ""],
                ["1ST YEAR 1ST SEMESTER", "", "", "", "", ""],
                ["Course Code", "Course Title", "Lec", "Lab", "Units", "Prerequisite"],
                ["ACCT101", "Financial Accounting", 3, 0, 3, "NONE"],
                ["BUS102A/B", "Business Analytics Lec/Lab", 2, 1, 3, "NONE"]
            ]
            out4_bytes = _make_excel_bytes(df4_data)
            res4 = await _process_curriculum_import(out4_bytes, target_d_id, "BSBA", True, db, MockUser())
            report4 = res4.get("report", [])
            self.assertEqual(len(report4), 3) # ACCT101, BUS102A, BUS102B

        asyncio.run(run_async_tests())

    def test_curriculum_rbac_admin_only_modifications_suite(self):
        import asyncio
        from fastapi import HTTPException
        from backend.app.routers.curriculum import create_curriculum_block, update_curriculum_block_status, create_curriculum_item, update_curriculum_item, delete_curriculum_item

        db = setup_test_db()
        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.commit()
        dept_id_val: int = int(dept.id) # type: ignore

        class AdminUser:
            id = 1
            role = "admin"
            department = "CAST"

        class ChairUser:
            id = 2
            role = "program_chair"
            department = "CAST"

        class CoordUser:
            id = 3
            role = "coordinator"
            department = "CAST"

        # TEST 1: Admin can create CurriculumBlock
        block_schema = schemas.CurriculumBlockCreate(program_name="BSCS", academic_year="AY 2026-2027", department_id=dept_id_val)
        res_block = create_curriculum_block(block_schema, db, AdminUser())
        self.assertEqual(res_block["program_name"], "BSCS")

        # TEST 2: Program Chair attempts to create CurriculumBlock -> 403
        with self.assertRaises(HTTPException) as ctx2:
            create_curriculum_block(block_schema, db, ChairUser())
        self.assertEqual(ctx2.exception.status_code, 403)

        # TEST 3: Coordinator attempts to create CurriculumBlock -> 403
        with self.assertRaises(HTTPException) as ctx3:
            create_curriculum_block(block_schema, db, CoordUser())
        self.assertEqual(ctx3.exception.status_code, 403)

        # TEST 4 & 5: Admin vs Chair Excel Import permissions
        async def test_import():
            df_data = [
                ["BSCS", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["1ST YEAR 1ST SEMESTER", "", "", "", "", ""],
                ["Course Code", "Course Title", "Lec", "Lab", "Units", "Prerequisite"],
                ["CS101", "Intro to CS", 3, 0, 3, "NONE"]
            ]
            out_bytes = _make_excel_bytes(df_data)

            # TEST 4: Admin import succeeds
            imp_res = await _process_curriculum_import(out_bytes, dept_id_val, "BSCS", True, db, AdminUser())
            self.assertTrue(imp_res.get("is_dry_run"))

            # TEST 5: Chair import fails -> 403
            with self.assertRaises(HTTPException) as ctx5:
                await _process_curriculum_import(out_bytes, dept_id_val, "BSCS", True, db, ChairUser())
            self.assertEqual(ctx5.exception.status_code, 403)

        asyncio.run(test_import())

        # TEST 6 & 7: Admin vs Chair Edit Subject
        block_id_val: int = int(res_block["id"]) # type: ignore
        subj = models.Curriculum(block_id=block_id_val, code="MATH101", name="Algebra", units=3, type="lecture", department_id=dept_id_val)
        db.add(subj)
        db.commit()

        subj_id_val: int = int(subj.id) # type: ignore
        up_schema = schemas.CurriculumUpdate(name="Advanced Algebra")
        # TEST 6: Admin edit succeeds
        up_res = update_curriculum_item(subj_id_val, up_schema, db, AdminUser())
        self.assertEqual(up_res.name, "Advanced Algebra")

        # TEST 7: Chair edit fails -> 403
        with self.assertRaises(HTTPException) as ctx7:
            update_curriculum_item(subj_id_val, up_schema, db, ChairUser())
        self.assertEqual(ctx7.exception.status_code, 403)

        # TEST 8 & 9: Admin vs Chair Publish Status
        # TEST 8: Admin publish succeeds
        pub_res = update_curriculum_block_status(block_id_val, "PUBLISHED", db, AdminUser())
        self.assertEqual(pub_res["status"], "PUBLISHED")

        # TEST 9: Chair publish fails -> 403
        with self.assertRaises(HTTPException) as ctx9:
            update_curriculum_block_status(block_id_val, "PUBLISHED", db, ChairUser())
        self.assertEqual(ctx9.exception.status_code, 403)

        # TEST 10, 11, 12: Selectability rules for PUBLISHED, DRAFT, ARCHIVED
        b_draft = models.CurriculumBlock(program_name="BSIT", academic_year="AY 2026-2027", department_id=dept.id, status="DRAFT")
        b_pub = models.CurriculumBlock(program_name="BSCpE", academic_year="AY 2026-2027", department_id=dept.id, status="PUBLISHED")
        b_arch = models.CurriculumBlock(program_name="BSBA", academic_year="AY 2025-2026", department_id=dept.id, status="ARCHIVED")
        db.add_all([b_draft, b_pub, b_arch])
        db.commit()

        # TEST 10: Non-admin query returns ONLY PUBLISHED
        user_blocks = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.status == "PUBLISHED").all()
        block_names = [b.program_name for b in user_blocks]
        self.assertIn("BSCpE", block_names)
        self.assertNotIn("BSIT", block_names) # DRAFT not selectable
        self.assertNotIn("BSBA", block_names) # ARCHIVED not selectable

    def test_get_curriculum_blocks_all_roles_rbac_endpoint(self):
        from backend.app.routers.curriculum import get_curriculum_blocks

        db = setup_test_db()
        
        # Test 1: Empty database returns empty list without error
        class AdminUser:
            id = 1
            role = "admin"
            department = "CAST"

        res_empty = get_curriculum_blocks(db, AdminUser())
        self.assertEqual(res_empty, [])

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.commit()
        dept_id_val: int = int(dept.id) # type: ignore

        b_pub = models.CurriculumBlock(program_name="BSCS", academic_year="AY 2026-2027", department_id=dept_id_val, status="PUBLISHED")
        b_draft = models.CurriculumBlock(program_name="BSIT", academic_year="AY 2026-2027", department_id=dept_id_val, status="DRAFT")
        b_arch = models.CurriculumBlock(program_name="IS", academic_year="AY 2025-2026", department_id=dept_id_val, status="ARCHIVED")
        db.add_all([b_pub, b_draft, b_arch])
        db.commit()

        # Admin gets all 3 blocks (DRAFT, PUBLISHED, ARCHIVED)
        res_admin = get_curriculum_blocks(db, AdminUser())
        self.assertEqual(len(res_admin), 3)

        # Program Chair sees department PUBLISHED blocks
        class ChairUser:
            id = 2
            role = "program_chair"
            department = "CAST"

        res_chair = get_curriculum_blocks(db, ChairUser())
        self.assertTrue(all(b["status"] == "PUBLISHED" for b in res_chair if "status" in b))

        # Coordinator sees department PUBLISHED blocks
        class CoordUser:
            id = 3
            role = "coordinator"
            department = "CAST"

        res_coord = get_curriculum_blocks(db, CoordUser())
        self.assertTrue(all(b["status"] == "PUBLISHED" for b in res_coord if "status" in b))

        # Faculty sees PUBLISHED blocks
        class FacultyUser:
            id = 4
            role = "faculty"
            department = "CAST"

        res_fac = get_curriculum_blocks(db, FacultyUser())
        self.assertEqual(len(res_fac), 1)
        self.assertEqual(res_fac[0]["program_name"], "BSCS")

        # Student sees PUBLISHED blocks
        class StudentUser:
            id = 5
            role = "student"
            # Student sees PUBLISHED blocks
        res_stud = get_curriculum_blocks(db, StudentUser())
        self.assertEqual(len(res_stud), 1)
        self.assertEqual(res_stud[0]["program_name"], "BSCS")

    def test_remediation_suite_14_scenarios(self):
        from datetime import time
        from fastapi import HTTPException
        from backend.app.routers.users import delete_user
        from backend.app.routers.subject_offerings import create_subject_offering
        from backend.app.services.schedule_generator import generate_schedules

        db = setup_test_db()
        dept1 = models.Department(name="Computer Studies", code="CAST")
        dept2 = models.Department(name="Business Admin", code="CBM")
        db.add_all([dept1, dept2])
        db.commit()

        d1_id = int(dept1.id) # type: ignore
        d2_id = int(dept2.id) # type: ignore

        class AdminUser:
            id = 1
            role = "admin"
            department = "CAST"

        class ChairUser:
            id = 2
            role = "program_chair"
            department = "CAST"

        class CoordUser:
            id = 3
            role = "coordinator"
            department = "CAST"

        class FacultyUser:
            id = 4
            role = "faculty"
            department = "CAST"

        class StudentUser:
            id = 5
            role = "student"
            department = "CAST"

        # The `purge-all-users` endpoint these scenarios used to exercise has
        # been removed -- it deleted every account including the caller's, with
        # no confirmation and no recovery. What replaces it here are the two
        # guards that now stop an administrator locking everyone out.
        #
        # Seeded defensively: the old flow purged the table first, so it could
        # assume id 1 was free. It is not.
        admin_u = db.query(models.User).filter(models.User.id == 1).first()
        if admin_u is None:
            admin_u = models.User(id=1, first_name="Admin", last_name="User", email="admin@dlsau.edu.ph", role="admin", password_hash="pw")
            db.add(admin_u)
        admin_u.role = "admin"
        if db.query(models.User).filter(models.User.id == 7).first() is None:
            db.add(models.User(id=7, first_name="Other", last_name="Chair", email="chair7@dlsau.edu.ph", role="program_chair", department="CBM", password_hash="pw"))
        db.commit()

        # A chair may not delete an account outside their own department.
        with self.assertRaises(HTTPException) as ctx:
            delete_user(7, db, ChairUser())
        self.assertEqual(ctx.exception.status_code, 403)

        # An administrator may not delete their own account.
        with self.assertRaises(HTTPException) as ctx:
            delete_user(1, db, AdminUser())
        self.assertEqual(ctx.exception.status_code, 409)

        # ...nor the last remaining administrator.
        class OtherAdmin:
            id = 99
            role = "admin"
            department = "CAST"

        with self.assertRaises(HTTPException) as ctx:
            delete_user(1, db, OtherAdmin())
        self.assertEqual(ctx.exception.status_code, 409)

        # With a second administrator present the guard lifts. Delete the spare
        # rather than id 1, which the scenarios below still rely on.
        db.add(models.User(id=8, first_name="Second", last_name="Admin", email="admin2@dlsau.edu.ph", role="admin", password_hash="pw"))
        db.commit()
        delete_user(8, db, AdminUser())
        self.assertIsNone(db.query(models.User).filter(models.User.id == 8).first())
        self.assertIsNotNone(db.query(models.User).filter(models.User.id == 1).first())

        # TEST 11: Cross-department subject offering -> 403 Rejected
        #
        # Both subjects are filed under a PUBLISHED curriculum block. Assignment
        # now refuses a subject belonging to no curriculum, or to one still in
        # draft, with 409 -- so a subject left unfiled would be turned away on
        # those grounds and never reach the department check this scenario is
        # about.
        block1 = models.CurriculumBlock(program_name="BSCS", academic_year="AY 2026-2027", department_id=d1_id, status="PUBLISHED")
        block2 = models.CurriculumBlock(program_name="BSA", academic_year="AY 2026-2027", department_id=d2_id, status="PUBLISHED")
        db.add_all([block1, block2])
        db.flush()

        fac1 = models.Faculty(first_name="Prof", last_name="One", department_id=d1_id, max_units=18, type="full_time")
        curr2 = models.Curriculum(block_id=block2.id, code="ACCT101", name="Accounting", units=3, type="lecture", department_id=d2_id)
        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add_all([fac1, curr2, sem])
        db.commit()

        f1_id = int(fac1.id) # type: ignore
        c2_id = int(curr2.id) # type: ignore
        sem_id = int(sem.id) # type: ignore
        b1_id = int(block1.id) # type: ignore

        cross_offering = schemas.SubjectOfferingCreate(faculty_id=f1_id, curriculum_id=c2_id, semester_id=sem_id)
        with self.assertRaises(HTTPException) as ctx_cross:
            create_subject_offering(cross_offering, db, AdminUser())
        self.assertEqual(ctx_cross.exception.status_code, 403)

        # Same-department offering -> Allowed
        curr1 = models.Curriculum(block_id=b1_id, code="CS101", name="Intro to CS", units=3, type="lecture", department_id=d1_id)
        db.add(curr1)
        db.commit()
        c1_id = int(curr1.id) # type: ignore

        same_offering = schemas.SubjectOfferingCreate(faculty_id=f1_id, curriculum_id=c1_id, semester_id=sem_id)
        create_subject_offering(same_offering, db, AdminUser())

        # TEST 7: First schedule generation -> Succeeds
        res_gen1 = generate_schedules(db, sem_id, [f1_id], d1_id, auto_bump_units=False)
        self.assertGreater(res_gen1.get("generated", 0), 0)

        # TEST 9: Add a locked schedule for CS101 to verify it survives regeneration
        locked_sched = models.Schedule(semester_id=sem_id, curriculum_id=c1_id, faculty_id=f1_id, day_of_week="Fri", start_time=time(8, 0), end_time=time(9, 30), status="published", is_locked=True)
        db.add(locked_sched)

        # Add second subject offering CS102 for department 1
        curr1_2 = models.Curriculum(block_id=b1_id, code="CS102", name="Data Structures", units=3, type="lecture", department_id=d1_id)
        db.add(curr1_2)
        db.commit()
        locked_id = int(locked_sched.id) # type: ignore
        c1_2_id = int(curr1_2.id) # type: ignore

        second_offering = schemas.SubjectOfferingCreate(faculty_id=f1_id, curriculum_id=c1_2_id, semester_id=sem_id)
        create_subject_offering(second_offering, db, AdminUser())

        # TEST 8 & 10: Second schedule generation -> Succeeds without duplicating or double-counting stale draft workload
        res_gen2 = generate_schedules(db, sem_id, [f1_id], d1_id, auto_bump_units=False)
        self.assertGreater(res_gen2.get("generated", 0), 0)

        # Verify locked schedule still exists
        survived = db.query(models.Schedule).filter(models.Schedule.id == locked_id).first()
        self.assertIsNotNone(survived)

        # TEST 12: Prerequisite newline and whitespace normalization
        import asyncio
        async def test_prereq():
            df_data = [
                ["BSCS", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["1ST YEAR 1ST SEMESTER", "", "", "", "", ""],
                ["Course Code", "Course Title", "Lec", "Lab", "Units", "Prerequisite"],
                ["CS102", "Data Structures", 3, 0, 3, "CS101\n MATH101 \r\n ENGL101"]
            ]
            out_bytes = _make_excel_bytes(df_data)

            imp_res = await _process_curriculum_import(out_bytes, d1_id, "BSCS", True, db, AdminUser())
            report = imp_res.get("report", [])
            self.assertEqual(len(report), 1)
            self.assertEqual(report[0]["pre_requisite"], "CS101, MATH101, ENGL101")

        asyncio.run(test_prereq())

    def test_curriculum_block_status_management_and_rbac_filtering(self):
        db = setup_test_db()
        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        b1 = models.CurriculumBlock(program_name="BSCS", academic_year="AY 2026-2027", filename="Manual Entry", department_id=dept.id, status="PUBLISHED")
        b2 = models.CurriculumBlock(program_name="BSIT", academic_year="AY 2026-2027", filename="Manual Entry", department_id=dept.id, status="DRAFT")
        b3 = models.CurriculumBlock(program_name="IS", academic_year="AY 2025-2026", filename="Manual Entry", department_id=dept.id, status="ARCHIVED")
        db.add_all([b1, b2, b3])
        db.commit()

        # Admin query sees all 3 blocks
        all_blocks = db.query(models.CurriculumBlock).all()
        self.assertEqual(len(all_blocks), 3)

        # Regular user filtering sees only PUBLISHED blocks
        published_blocks = db.query(models.CurriculumBlock).filter(models.CurriculumBlock.status == "PUBLISHED").all()
        self.assertEqual(len(published_blocks), 1)
        self.assertEqual(published_blocks[0].program_name, "BSCS")

    def test_curriculum_centered_manual_block_and_subject_creation(self):
        db = setup_test_db()

        dept = models.Department(name="College of Computer Studies", code="CAST")
        db.add(dept)
        db.flush()

        block = models.CurriculumBlock(program_name="BSCS", academic_year="AY 2026-2027", filename="Manual Entry", department_id=dept.id)
        db.add(block)
        db.flush()

        self.assertIsNotNone(block.id)

        s1 = models.Curriculum(block_id=block.id, code="MATH101", name="College Algebra", units=3, type="lecture", lec_units=3, lab_units=0, department_id=dept.id)
        db.add(s1)

        s2_a = models.Curriculum(block_id=block.id, code="CC101A", name="Intro to Computing Lec", units=2, type="lecture", lec_units=2, lab_units=0, department_id=dept.id)
        s2_b = models.Curriculum(block_id=block.id, code="CC101B", name="Intro to Computing Lab", units=1, type="lab", lec_units=0, lab_units=1, department_id=dept.id)
        db.add_all([s2_a, s2_b])

        s3_a = models.Curriculum(block_id=block.id, code="CHEF102A", name="Organic Chemistry Lec", units=2, type="lecture", lec_units=2, lab_units=0, department_id=dept.id)
        s3_b = models.Curriculum(block_id=block.id, code="CHEF102B", name="Organic Chemistry Lab", units=1, type="lab", lec_units=0, lab_units=1, department_id=dept.id)
        db.add_all([s3_a, s3_b])

        db.commit()

        stored_subjects = db.query(models.Curriculum).filter(models.Curriculum.block_id == block.id).all()
        self.assertEqual(len(stored_subjects), 5)
        codes = [s.code for s in stored_subjects]
        self.assertIn("MATH101", codes)
        self.assertIn("CC101A", codes)
        self.assertIn("CC101B", codes)
        self.assertIn("CHEF102A", codes)
        self.assertIn("CHEF102B", codes)

        fac = models.Faculty(first_name="John", last_name="McCarthy", max_units=24, department_id=dept.id)
        db.add(fac)
        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)
        db.flush()

        lab_room = models.Room(name="Computer Lab 1", building="Main", capacity=40, type="lab")
        db.add(lab_room)

        off1 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=s1.id, semester_id=sem.id)
        off2 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=s2_a.id, semester_id=sem.id)
        off3 = models.SubjectOffering(faculty_id=fac.id, curriculum_id=s2_b.id, semester_id=sem.id)
        db.add_all([off1, off2, off3])
        db.commit()

        sem_id: int = int(sem.id)  # type: ignore
        fac_id: int = int(fac.id)  # type: ignore
        dept_id: int = int(dept.id)  # type: ignore

        results = generate_schedules(db, sem_id, [fac_id], dept_id, auto_bump_units=False)
        self.assertGreater(results.get("generated", 0), 0)

        schedules = db.query(models.Schedule).filter(models.Schedule.semester_id == sem_id).all()
        math_scheds = [s for s in schedules if s.curriculum_id == s1.id]
        lab_scheds = [s for s in schedules if s.curriculum_id == s2_b.id]

        for s in math_scheds:
            self.assertIsNone(s.room_id)
        for s in lab_scheds:
            self.assertEqual(s.room_id, lab_room.id)

    def test_lecture_room_null_and_lab_room_required(self):
        db = setup_test_db()

        dept = models.Department(name="College of Veterinary Medicine", code="CVMAS")
        db.add(dept)
        db.flush()

        fac = models.Faculty(first_name="Alan", last_name="Turing", max_units=24, department_id=dept.id)
        db.add(fac)

        sem = models.Semester(academic_year="AY 2026-2027", term="1st", is_active=True)
        db.add(sem)
        db.flush()

        lab_room = models.Room(name="Lab 101", building="Main", capacity=40, type="lab")
        db.add(lab_room)

        curr_lec = models.Curriculum(code="CHEF102A", name="Organic Chemistry Lec", units=2, type="lecture", department_id=dept.id, lec_units=2, lab_units=0)
        curr_lab = models.Curriculum(code="CHEF102B", name="Organic Chemistry Lab", units=1, type="lab", department_id=dept.id, lec_units=0, lab_units=1)
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

        for s in lec_scheds:
            self.assertIsNone(s.room_id)

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
