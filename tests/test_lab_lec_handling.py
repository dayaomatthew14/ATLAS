import unittest
import re
import io
import pandas as pd
from typing import List, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.app import models
from backend.app.services.schedule_generator import generate_schedules, is_room_conflict
from backend.app.routers.curriculum import _process_curriculum_import

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
            lec_units = r["lec"]
            lab_units = r["lab"]
            code = r["code"]
            name = r["name"]

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

            # Department Layout 1: DVM (Already separated A/B)
            df1_data = [
                ["DE LA SALLE ARANETA UNIVERSITY", "", "", "", "", ""],
                ["DOCTOR OF VETERINARY MEDICINE", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["1ST YEAR 1ST SEMESTER", "", "", "", "", ""],
                ["Course Code", "Course Title", "Lec", "Lab", "Units", "Prerequisite"],
                ["CHEF102A", "Organic Chemistry Lec", 2, 0, 2, "NONE"],
                ["CHEF102B", "Organic Chemistry Lab", 0, 1, 1, "NONE"]
            ]
            out1 = io.BytesIO()
            with pd.ExcelWriter(out1, engine='openpyxl') as writer:
                pd.DataFrame(df1_data).to_excel(writer, index=False, header=False)
            
            res1 = await _process_curriculum_import(out1.getvalue(), dept.id, "DVM", True, db, MockUser())
            report1 = res1.get("report", [])
            self.assertEqual(len(report1), 2)
            codes1 = [r["code"] for r in report1]
            self.assertIn("CHEF102A", codes1)
            self.assertIn("CHEF102B", codes1)

            # Department Layout 2: BSCS (Combined A/B)
            df2_data = [
                ["BACHELOR OF SCIENCE IN COMPUTER SCIENCE", "", "", "", "", ""],
                ["AY 2026-2027", "", "", "", "", ""],
                ["FIRST YEAR", "", "", "", "", ""],
                ["FIRST SEMESTER", "", "", "", "", ""],
                ["Subject Code", "Subject Name", "Lec Units", "Lab Units", "Units", "Pre-req"],
                ["CC101A/B", "Introduction to Computing Lec/Lab", 2, 1, 3, "NONE"]
            ]
            out2 = io.BytesIO()
            with pd.ExcelWriter(out2, engine='openpyxl') as writer:
                pd.DataFrame(df2_data).to_excel(writer, index=False, header=False)

            res2 = await _process_curriculum_import(out2.getvalue(), dept.id, "BSCS", True, db, MockUser())
            report2 = res2.get("report", [])
            self.assertEqual(len(report2), 2)
            codes2 = [r["code"] for r in report2]
            self.assertIn("CC101A", codes2)
            self.assertIn("CC101B", codes2)

        asyncio.run(run_async_tests())

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
