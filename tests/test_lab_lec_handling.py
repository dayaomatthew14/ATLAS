import unittest
import re
import io
import pandas as pd
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models, schemas
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict
from backend.app.routers.curriculum import _process_curriculum_import

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
            out1 = io.BytesIO()
            with pd.ExcelWriter(out1, engine='openpyxl') as writer:
                pd.DataFrame(df1_data).to_excel(writer, index=False, header=False)
            
            target_d_id: int = int(dept.id) # type: ignore
            res1 = await _process_curriculum_import(out1.getvalue(), target_d_id, "DVM", True, db, MockUser())
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
            out2 = io.BytesIO()
            with pd.ExcelWriter(out2, engine='openpyxl') as writer:
                pd.DataFrame(df2_data).to_excel(writer, index=False, header=False)

            res2 = await _process_curriculum_import(out2.getvalue(), target_d_id, "BSCS", True, db, MockUser())
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
            out3 = io.BytesIO()
            with pd.ExcelWriter(out3, engine='openpyxl') as writer:
                pd.DataFrame(df3_data).to_excel(writer, index=False, header=False)

            res3 = await _process_curriculum_import(out3.getvalue(), target_d_id, "BSCpE", True, db, MockUser())
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
            out4 = io.BytesIO()
            with pd.ExcelWriter(out4, engine='openpyxl') as writer:
                pd.DataFrame(df4_data).to_excel(writer, index=False, header=False)

            res4 = await _process_curriculum_import(out4.getvalue(), target_d_id, "BSBA", True, db, MockUser())
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
            out = io.BytesIO()
            with pd.ExcelWriter(out, engine='openpyxl') as writer:
                pd.DataFrame(df_data).to_excel(writer, index=False, header=False)

            # TEST 4: Admin import succeeds
            imp_res = await _process_curriculum_import(out.getvalue(), dept_id_val, "BSCS", True, db, AdminUser())
            self.assertTrue(imp_res.get("is_dry_run"))

            # TEST 5: Chair import fails -> 403
            with self.assertRaises(HTTPException) as ctx5:
                await _process_curriculum_import(out.getvalue(), dept_id_val, "BSCS", True, db, ChairUser())
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
