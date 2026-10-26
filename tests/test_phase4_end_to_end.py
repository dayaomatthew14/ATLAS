import os
import sys
import unittest
from datetime import timedelta
from pathlib import Path
from typing import cast, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from unittest.mock import MagicMock
from fastapi import Response
from backend.app import models, schemas, auth
from backend.main import seed_dean_accounts
from backend.app.routers.auth_router import login_for_access_token, register_user
from backend.app.routers.academics_router import list_colleges
from backend.app.routers.users import (
    get_users, create_user, toggle_user_verification, admin_reset_password
)
from backend.app.routers.curriculum import (
    get_curriculum_blocks, _require_admin_or_dept_dean
)

class Phase4EndToEndSmokeTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed 4 official departments
        self.dept_cast = models.Department(id=1, code="CAST", name="College of Accountancy and Science Technology")
        self.dept_cbma = models.Department(id=2, code="CBMA", name="College of Business Management and Accountancy")
        self.dept_coed = models.Department(id=3, code="COED", name="College of Education")
        self.dept_cvmas = models.Department(id=4, code="CVMAS", name="College of Veterinary Medicine and Agricultural Sciences")
        self.db.add_all([self.dept_cast, self.dept_cbma, self.dept_coed, self.dept_cvmas])
        self.db.commit()

        # Seed Dean accounts
        seed_dean_accounts(self.db)

        # Seed Master Admin
        self.admin = models.User(
            id=10,
            first_name="System",
            last_name="Administrator",
            email="admin@dlsau.edu.ph",
            role="admin",
            department=None,
            is_verified=True,
            password_hash=auth.get_password_hash("Password123!")
        )
        # Seed Program Chairs
        self.chair_cast = models.User(
            id=11,
            first_name="Chair",
            last_name="CAST",
            email="chair.cast@dlsau.edu.ph",
            role="program_chair",
            department="CAST",
            is_verified=False,
            password_hash=auth.get_password_hash("Chair123!")
        )
        self.chair_cbma = models.User(
            id=12,
            first_name="Chair",
            last_name="CBMA",
            email="chair.cbma@dlsau.edu.ph",
            role="program_chair",
            department="CBMA",
            is_verified=False,
            password_hash=auth.get_password_hash("Chair123!")
        )
        self.db.add_all([self.admin, self.chair_cast, self.chair_cbma])
        self.db.commit()

        # Fetch seeded deans
        self.dean_cast = self.db.query(models.User).filter(models.User.email == "dean.cast@dlsau.edu.ph").first()
        self.dean_cbma = self.db.query(models.User).filter(models.User.email == "dean.cbma@dlsau.edu.ph").first()
        self.dean_coed = self.db.query(models.User).filter(models.User.email == "dean.coed@dlsau.edu.ph").first()
        self.dean_cvmas = self.db.query(models.User).filter(models.User.email == "dean.cvmas@dlsau.edu.ph").first()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_01_all_four_deans_authenticate_cleanly(self):
        for dean_email, expected_dept in [
            ("dean.cast@dlsau.edu.ph", "CAST"),
            ("dean.cbma@dlsau.edu.ph", "CBMA"),
            ("dean.coed@dlsau.edu.ph", "COED"),
            ("dean.cvmas@dlsau.edu.ph", "CVMAS"),
        ]:
            res = login_for_access_token(
                response=Response(),
                db=self.db,
                username=dean_email,
                password="DeanPassword123!"
            )
            self.assertIn("access_token", res)
            self.assertEqual(res["role"], "admin")
            self.assertEqual(res["department"], expected_dept)

    def test_02_registration_lockdown_prevents_dean_and_admin(self):
        # 1. Self-registering as dean is forbidden
        with self.assertRaises(HTTPException) as ctx:
            register_user(
                request=MagicMock(),
                user=schemas.UserCreate(
                    email="hacker.dean@dlsau.edu.ph",
                    first_name="Hacker",
                    last_name="Dean",
                    password="Password123!45",
                    role="dean",
                    department="CAST"
                ),
                db=self.db
            )
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Self-registration is limited to Program Chair accounts", ctx.exception.detail)

        # 2. Self-registering as admin is forbidden
        with self.assertRaises(HTTPException) as ctx2:
            register_user(
                request=MagicMock(),
                user=schemas.UserCreate(
                    email="hacker.admin@dlsau.edu.ph",
                    first_name="Hacker",
                    last_name="Admin",
                    password="Password123!45",
                    role="admin",
                    department="CAST"
                ),
                db=self.db
            )
        self.assertEqual(ctx2.exception.status_code, 403)

        # 3. Self-registering as program chair succeeds
        register_user(
            request=MagicMock(),
            user=schemas.UserCreate(
                email="legit.chair@dlsau.edu.ph",
                first_name="Legit",
                last_name="Chair",
                password="Password123!45",
                role="program_chair",
                department="COED"
            ),
            db=self.db
        )
        created = self.db.query(models.User).filter(models.User.email == "legit.chair@dlsau.edu.ph").first()
        self.assertIsNotNone(created)
        assert created is not None
        self.assertEqual(created.role, "program_chair")
        self.assertEqual(created.department, "COED")

    def test_03_college_scoping_strict_isolation(self):
        # Admin gets all 4 colleges
        admin_colleges = list_colleges(self.db, self.admin)
        self.assertEqual(len(admin_colleges), 4)

        # Dean CAST gets ONLY CAST
        cast_colleges = list_colleges(self.db, self.dean_cast)
        self.assertEqual(len(cast_colleges), 1)
        self.assertEqual(cast_colleges[0].code, "CAST")

        # Dean CBMA gets ONLY CBMA
        cbma_colleges = list_colleges(self.db, self.dean_cbma)
        self.assertEqual(len(cbma_colleges), 1)
        self.assertEqual(cbma_colleges[0].code, "CBMA")

        # Dean COED gets ONLY COED
        coed_colleges = list_colleges(self.db, self.dean_coed)
        self.assertEqual(len(coed_colleges), 1)
        self.assertEqual(coed_colleges[0].code, "COED")

        # Dean CVMAS gets ONLY CVMAS
        cvmas_colleges = list_colleges(self.db, self.dean_cvmas)
        self.assertEqual(len(cvmas_colleges), 1)
        self.assertEqual(cvmas_colleges[0].code, "CVMAS")

    def test_04_user_scoping_and_department_management(self):
        # Dean CAST listing users only sees CAST users
        users_cast = get_users(db=self.db, current_user=self.dean_cast)
        depts = {u["department"] for u in users_cast}
        self.assertEqual(depts, {"CAST"})
        emails = {u["email"] for u in users_cast}
        self.assertIn("dean.cast@dlsau.edu.ph", emails)
        self.assertIn("chair.cast@dlsau.edu.ph", emails)
        self.assertNotIn("chair.cbma@dlsau.edu.ph", emails)

        # Dean CAST cannot create user in CBMA
        with self.assertRaises(HTTPException) as ctx:
            create_user(schemas.UserCreate(
                email="new.cbma.chair@dlsau.edu.ph",
                first_name="New",
                last_name="Chair",
                role="program_chair",
                department="CBMA",
                password="Password123!45"
            ), self.db, self.dean_cast)
        self.assertEqual(ctx.exception.status_code, 403)

        # Dean CAST can create user in CAST
        new_chair = create_user(schemas.UserCreate(
            email="new.cast.chair@dlsau.edu.ph",
            first_name="New",
            last_name="Chair",
            role="program_chair",
            department="CAST",
            password="Password123!45"
        ), self.db, self.dean_cast)
        self.assertEqual(new_chair.department, "CAST")
        self.assertTrue(new_chair.is_verified)

    def test_05_verification_and_password_reset_scoping(self):
        # Dean CAST verifying Chair CAST -> Success
        res = toggle_user_verification(getattr(self.chair_cast, "id"), self.db, self.dean_cast)
        self.assertTrue(res["is_verified"])

        # Dean CAST verifying Chair CBMA -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            toggle_user_verification(getattr(self.chair_cbma, "id"), self.db, self.dean_cast)
        self.assertEqual(ctx.exception.status_code, 403)

        # Dean CAST reset Chair CAST -> Success
        reset_res = admin_reset_password(getattr(self.chair_cast, "id"), self.db, self.dean_cast)
        self.assertIn("temporary_password", reset_res)

        # Dean CAST reset Chair CBMA -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx2:
            admin_reset_password(getattr(self.chair_cbma, "id"), self.db, self.dean_cast)
        self.assertEqual(ctx2.exception.status_code, 403)

    def test_06_curriculum_scoping(self):
        # Seed blocks for CAST and CBMA
        block_cast = models.CurriculumBlock(
            program_name="BSCS", academic_year="2026-2027", department_id=1, status="PUBLISHED"
        )
        block_cbma = models.CurriculumBlock(
            program_name="BSA", academic_year="2026-2027", department_id=2, status="PUBLISHED"
        )
        self.db.add_all([block_cast, block_cbma])
        self.db.commit()

        # Dean CAST querying blocks only sees CAST
        blocks = get_curriculum_blocks(self.db, self.dean_cast)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0]["program_name"], "BSCS")

        # Dean CAST managing CAST -> Allowed
        _require_admin_or_dept_dean(self.dean_cast, 1, self.db)

        # Dean CAST managing CBMA -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            _require_admin_or_dept_dean(self.dean_cast, 2, self.db)
        self.assertEqual(ctx.exception.status_code, 403)

if __name__ == "__main__":
    unittest.main()
