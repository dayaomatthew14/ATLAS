"""
Guards for the defects fixed during the full-system audit.

Each test here corresponds to something that was actually wrong and would be
easy to reintroduce, because in every case the broken behaviour looked like
success: a conflict check that reported "none" after crashing, a second faculty
router whose rules had drifted from the first, an upload path that moved and
took existing rows with it.
"""

import os
import sys
import unittest
from datetime import timedelta
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("SECRET_KEY", "test-secret-for-audit-regressions")

import re
from typing import cast
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker, Session  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from backend.app import models, schemas, storage  # noqa: E402
from backend.app.routers.conflicts import get_conflict_count  # noqa: E402
from backend.app.routers.ai_scheduler import get_conflicts  # noqa: E402


class _RaisingDB:
    """A session whose every query fails -- e.g. a column dropped from under it."""

    def query(self, *a, **k):
        raise RuntimeError("column conflicts.reason does not exist")


class _Admin:
    role = "admin"
    department = None
    id = 1


class ConflictReportingTests(unittest.TestCase):
    """
    A conflict check that fails must not answer "no conflicts".

    Zero is rendered as a green all-clear, so a crashed query used to be
    indistinguishable from a clean timetable -- the one wrong answer a
    scheduling system must never give.
    """

    def test_count_raises_rather_than_reporting_clean(self):
        with self.assertRaises(RuntimeError):
            get_conflict_count(db=cast(Session, _RaisingDB()), current_user=_Admin())

    def test_list_raises_rather_than_reporting_clean(self):
        with self.assertRaises(RuntimeError):
            get_conflicts(skip=0, limit=100, db=cast(Session, _RaisingDB()), current_user=_Admin())

    def test_legitimate_zero_is_still_zero(self):
        """An unprivileged caller genuinely has no conflicts; that is not a failure."""
        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()

        class Viewer:
            role = "viewer"
            department = None
            id = 2

        self.assertEqual(get_conflict_count(db=db, current_user=Viewer()), {"count": 0})
        self.assertEqual(get_conflicts(skip=0, limit=100, db=db, current_user=Viewer()), [])

    def test_unreadable_row_is_surfaced_not_dropped(self):
        """One bad row must not shrink the list; that reads as fewer problems."""

        class Row:
            id = 42
            conflict_type = "room_overlap"
            reason = "Room double-booked"
            curriculum_id = 7
            faculty_id = None
            schedule_id_1 = None
            schedule_id_2 = None

        class Chain:
            def filter(self, *a, **k):
                return self

            def offset(self, *a):
                return self

            def limit(self, *a):
                return self

            def all(self):
                return [Row()]

        class PartialDB:
            def __init__(self):
                self.n = 0

            def query(self, *a, **k):
                self.n += 1
                if self.n == 1:
                    return Chain()
                raise RuntimeError("curriculum lookup failed")

        res = get_conflicts(skip=0, limit=100, db=cast(Session, PartialDB()), current_user=_Admin())
        self.assertEqual(len(res), 1, "the conflict must still appear in the list")
        self.assertTrue(res[0]["degraded"])
        self.assertEqual(res[0]["id"], 42)


class RouterSurfaceTests(unittest.TestCase):
    """
    `/api/faculty` duplicated `/api/professors` over the same table, and its
    rules had drifted: it let administrators create faculty, which the other
    route forbids, and skipped the full-time unit-cap default. It must not
    come back.
    """

    @classmethod
    def setUpClass(cls):
        import importlib

        cls.paths = set(importlib.import_module("main").app.openapi()["paths"])

    def test_no_duplicate_faculty_router(self):
        self.assertEqual(
            [p for p in self.paths if p.startswith("/api/faculty")],
            [],
            "/api/faculty is back; it duplicates /api/professors over models.Faculty",
        )

    def test_professors_router_still_registered(self):
        self.assertTrue([p for p in self.paths if p.startswith("/api/professors")])


class UploadPathTests(unittest.TestCase):
    """Uploads must be relocatable without invalidating stored rows."""

    def test_stored_path_is_stable_and_disk_path_follows_upload_dir(self):
        import importlib

        os.environ["UPLOAD_DIR"] = os.path.join("mnt", "volume")
        importlib.reload(storage)
        try:
            stored = storage.stored_path("user_1_ab.png")
            self.assertEqual(
                stored,
                "uploads/profiles/user_1_ab.png",
                "the stored value and the URL must not change with UPLOAD_DIR",
            )
            expected_root = os.path.join("mnt", "volume")
            self.assertTrue(storage.disk_path(stored).startswith(expected_root))
            # Rows written before UPLOAD_DIR existed, with and without a leading slash.
            self.assertTrue(storage.disk_path("uploads/profiles/old.png").startswith(expected_root))
            self.assertTrue(storage.disk_path("/uploads/profiles/old.png").startswith(expected_root))
        finally:
            del os.environ["UPLOAD_DIR"]
            importlib.reload(storage)

    def test_default_matches_the_historical_layout(self):
        """
        The default still puts files in a directory called `uploads`, and the
        stored path -- the thing rows and URLs contain -- is unchanged.

        It is anchored to the backend package rather than to the working
        directory now. As a bare relative "uploads" it resolved against wherever
        the process started, so running this suite from the repository root
        created a second empty `uploads/` beside the source tree, and a server
        started from a different directory could not see photos written by
        another. What must not drift is the stored form, which is asserted
        below and is what makes UPLOAD_DIR repointable without rewriting rows.
        """
        self.assertEqual(os.path.basename(storage.UPLOAD_DIR), "uploads")
        self.assertTrue(
            os.path.isabs(storage.UPLOAD_DIR),
            "the default must not depend on the working directory",
        )
        self.assertEqual(
            os.path.basename(os.path.dirname(storage.UPLOAD_DIR)),
            "backend",
            "the default belongs beside the application, not wherever it was launched",
        )
        self.assertEqual(storage.stored_path("x.png"), "uploads/profiles/x.png")


class RegistrationInputTests(unittest.TestCase):
    """
    What the sign-up form is allowed to accept, and what it must not reject.
    """

    def test_email_is_normalised_so_capitals_do_not_create_a_dead_account(self):
        """
        Pydantic lower-cases an address's domain but keeps the local part as
        typed, so `Ann.Cruz@DLSAU.edu.ph` was stored with its capitals. Sign-in
        sends `email.trim().toLowerCase()`, which matched nothing -- and the
        address could not be registered again either, because it was taken.
        Anyone who typed a capital was locked out in both directions.
        """
        user = schemas.UserCreate(
            email="  Ann.Cruz@DLSAU.edu.ph  ",
            first_name="Ann", last_name="Cruz",
            contact_number="09171234567", role="program_chair",
            department="CAST", password="CorrectHorse12",
        )
        self.assertEqual(user.email, "ann.cruz@dlsau.edu.ph")

    def test_lookup_finds_accounts_however_they_were_capitalised(self):
        """
        Rows written before normalisation still hold mixed case, so the lookup
        has to reach them too -- normalising new writes alone would leave the
        already-locked-out accounts locked out.
        """
        from backend.app.routers.auth_router import user_by_email

        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(engine)
        db = sessionmaker(bind=engine)()
        db.add(models.User(
            email="Ann.Cruz@dlsau.edu.ph", first_name="Ann", last_name="Cruz",
            role="program_chair", password_hash="x",
        ))
        db.commit()

        for typed in ("ann.cruz@dlsau.edu.ph", "Ann.Cruz@DLSAU.edu.ph", "  ANN.CRUZ@dlsau.edu.ph  "):
            self.assertIsNotNone(user_by_email(db, typed), f"{typed!r} should find the account")

        self.assertIsNone(user_by_email(db, "nobody@dlsau.edu.ph"))
        self.assertIsNone(user_by_email(db, ""))
        self.assertIsNone(user_by_email(db, None))

    def test_names_used_in_the_philippines_are_accepted(self):
        """
        The rule carried no accented letters, so Peña and Muñoz -- among the
        most common surnames in the country -- could not be registered at all.
        """
        pattern = re.compile(schemas.NAME_PATTERN)
        for name in ["Dela Cruz", "O'Brien", "Peña", "Muñoz", "Peña-Reyes", "Jr.", "Ma. Teresa"]:
            self.assertTrue(pattern.match(name), f"{name!r} is a real name and must be accepted")

    def test_a_name_still_has_to_be_a_name(self):
        pattern = re.compile(schemas.NAME_PATTERN)
        for junk in ["...", "123", "", "-'-", "  ", "9Lives"]:
            self.assertFalse(pattern.match(junk), f"{junk!r} must not pass as a name")


class SessionInvalidationTests(unittest.TestCase):
    """
    A token must stop working once its session_version is superseded -- that is
    what makes changing a password end sessions on other devices.
    """

    def setUp(self):
        from backend.app import auth

        self.auth = auth
        self.engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(
            models.User(
                id=1, first_name="A", last_name="B", email="u@x.ph",
                password_hash="h", role="admin", session_version=1, is_verified=True,
            )
        )
        self.db.commit()

    def _request(self, token):
        from starlette.requests import Request

        req = Request({
            "type": "http", "method": "GET", "path": "/", "headers": [],
            "query_string": b"", "client": ("127.0.0.1", 0), "scheme": "http",
            "server": ("test", 80), "root_path": "",
        })
        req._cookies = {"atlas_token": token}
        return req

    def _token(self, sv, minutes=5):
        return self.auth.create_access_token(
            {"sub": "u@x.ph", "sv": sv}, expires_delta=timedelta(minutes=minutes)
        )

    def test_current_version_is_accepted(self):
        user = self.auth.get_current_user(self._request(self._token(1)), db=self.db)
        self.assertEqual(user.email, "u@x.ph")

    def test_superseded_version_is_rejected(self):
        token = self._token(1)
        u = self.db.query(models.User).first()
        if u:
            setattr(u, "session_version", 2)  # password changed
            self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.auth.get_current_user(self._request(token), db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_expired_token_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self.auth.get_current_user(self._request(self._token(1, minutes=-1)), db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_missing_token_is_rejected(self):
        from starlette.requests import Request

        req = Request({
            "type": "http", "method": "GET", "path": "/", "headers": [],
            "query_string": b"", "client": ("127.0.0.1", 0), "scheme": "http",
            "server": ("test", 80), "root_path": "",
        })
        req._cookies = {}
        with self.assertRaises(HTTPException) as ctx:
            self.auth.get_current_user(req, db=self.db)
        self.assertEqual(ctx.exception.status_code, 401)


class DeanAccountAndRoleSeedingTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def test_dean_seeder_creates_four_institutional_deans(self):
        from backend.main import seed_dean_accounts
        seed_dean_accounts(self.db)
        deans = self.db.query(models.User).filter(models.User.email.startswith("dean.")).all()
        self.assertEqual(len(deans), 4)
        dept_codes = sorted([d.department for d in deans])
        self.assertEqual(dept_codes, ["CAST", "CBMA", "COED", "CVMAS"])
        for d in deans:
            self.assertEqual(d.role, "admin")
            self.assertTrue(d.is_verified)
            self.assertTrue(d.email.startswith("dean."))

    def test_self_registration_roles_strictly_program_chair(self):
        self.assertEqual(schemas.SELF_REGISTRATION_ROLES, {"program_chair"})
        self.assertNotIn("admin", schemas.SELF_REGISTRATION_ROLES)
        self.assertNotIn("coordinator", schemas.VALID_ROLES)
        self.assertIn("admin", schemas.VALID_ROLES)


class DeanDepartmentScopedPermissionsTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:")
        models.Base.metadata.create_all(bind=engine)
        self.Session = sessionmaker(bind=engine)
        self.db = self.Session()

        # Seed departments
        self.dept_cast = models.Department(code="CAST", name="College of Arts, Sciences, and Technology")
        self.dept_cbma = models.Department(code="CBMA", name="College of Business and Accountancy")
        self.db.add_all([self.dept_cast, self.dept_cbma])
        self.db.commit()

        # Dean CAST (Administrator of CAST)
        self.dean_cast = models.User(
            first_name="Dean", last_name="CAST", email="dean.cast@dlsau.edu.ph",
            role="admin", department="CAST", is_verified=True, password_hash="hashed"
        )
        # Chair CAST
        self.chair_cast = models.User(
            first_name="Chair", last_name="CAST", email="chair.cast@dlsau.edu.ph",
            role="program_chair", department="CAST", is_verified=False, password_hash="hashed"
        )
        # Chair CBMA
        self.chair_cbma = models.User(
            first_name="Chair", last_name="CBMA", email="chair.cbma@dlsau.edu.ph",
            role="program_chair", department="CBMA", is_verified=False, password_hash="hashed"
        )
        self.db.add_all([self.dean_cast, self.chair_cast, self.chair_cbma])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_dean_can_verify_department_chair_but_not_other_departments(self):
        from backend.app.routers.users import toggle_user_verification

        # Dean CAST verifying Chair CAST -> Success
        res = toggle_user_verification(getattr(self.chair_cast, "id"), self.db, self.dean_cast)
        self.assertTrue(res["is_verified"])

        # Dean CAST verifying Chair CBMA -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            toggle_user_verification(getattr(self.chair_cbma, "id"), self.db, self.dean_cast)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_dean_can_reset_password_for_department_chair_only(self):
        from backend.app.routers.users import admin_reset_password

        # Dean CAST reset Chair CAST -> Success
        res = admin_reset_password(getattr(self.chair_cast, "id"), self.db, self.dean_cast)
        self.assertIn("temporary_password", res)

        # Dean CAST reset Chair CBMA -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            admin_reset_password(getattr(self.chair_cbma, "id"), self.db, self.dean_cast)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_dean_curriculum_scoping(self):
        from backend.app.routers.curriculum import _require_admin_or_dept_dean

        # Dean CAST managing CAST dept -> Allowed (no exception)
        _require_admin_or_dept_dean(self.dean_cast, getattr(self.dept_cast, "id"), self.db)

        # Dean CAST managing CBMA dept -> 403 Forbidden
        with self.assertRaises(HTTPException) as ctx:
            _require_admin_or_dept_dean(self.dean_cast, getattr(self.dept_cbma, "id"), self.db)
        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
