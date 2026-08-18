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

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from backend.app import models, storage  # noqa: E402
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
            get_conflict_count(db=_RaisingDB(), current_user=_Admin())

    def test_list_raises_rather_than_reporting_clean(self):
        with self.assertRaises(RuntimeError):
            get_conflicts(skip=0, limit=100, db=_RaisingDB(), current_user=_Admin())

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

        res = get_conflicts(skip=0, limit=100, db=PartialDB(), current_user=_Admin())
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
        self.assertEqual(storage.UPLOAD_DIR, "uploads")
        self.assertEqual(storage.stored_path("x.png"), "uploads/profiles/x.png")


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
        self.db.query(models.User).first().session_version = 2  # password changed
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


if __name__ == "__main__":
    unittest.main()
