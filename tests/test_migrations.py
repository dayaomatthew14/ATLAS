"""
Migrations must describe the models, and must apply to a database that predates
them.

The system previously had no migrations at all: `create_all()` built missing
tables and a startup helper added missing columns as nullable. Anything else --
a rename, a type change, a NOT NULL, a backfill -- silently never reached the
deployed database. That is how `conflicts.reason` and `conflicts.created_at`
went missing in production and broke schedule generation.

These tests guard the two ways that can come back:

  * a model changes and nobody writes the migration, so the migrations stop
    describing the schema the code expects;
  * the adoption path for an already-populated database regresses, so
    deploying migrations onto the live database would not be safe.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from backend.app import models  # noqa: E402


def _config(url):
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.path = Path(self.dir) / "t.db"
        self.url = f"sqlite:///{self.path.as_posix()}"
        self.engine = create_engine(self.url)

    def tearDown(self):
        self.engine.dispose()

    def test_migrations_produce_the_model_schema(self):
        """`alembic upgrade head` must leave nothing for autogenerate to add.

        This is the test that fails when someone edits models.py and forgets
        the migration -- the exact omission that used to reach production
        unnoticed.
        """
        command.upgrade(_config(self.url), "head")

        with self.engine.connect() as conn:
            ctx = MigrationContext.configure(
                conn, opts={"compare_type": True, "target_metadata": models.Base.metadata}
            )
            diff = compare_metadata(ctx, models.Base.metadata)

        # alembic reports the bookkeeping table as an extra; it is not a model.
        diff = [d for d in diff if "alembic_version" not in repr(d)]
        self.assertEqual(
            diff, [],
            "Models and migrations disagree. Run:\n"
            "  cd backend && python -m alembic revision --autogenerate -m 'describe the change'\n"
            f"Outstanding differences:\n{diff}",
        )

    def test_every_model_table_is_created(self):
        command.upgrade(_config(self.url), "head")
        tables = set(inspect(self.engine).get_table_names())
        missing = set(models.Base.metadata.tables) - tables
        self.assertEqual(missing, set(), f"migrations do not create: {sorted(missing)}")

    def test_adopts_a_populated_pre_migration_database(self):
        """The deployed database has tables and rows but no migration history.

        Stamping it must not touch the data.
        """
        models.Base.metadata.create_all(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO users (id, first_name, last_name, email, password_hash, role) "
                "VALUES (1, 'Existing', 'User', 'keep@me.ph', 'hash', 'admin')"
            ))

        with self.engine.connect() as conn:
            self.assertIsNone(MigrationContext.configure(conn).get_current_revision())

        command.stamp(_config(self.url), "head")

        with self.engine.connect() as conn:
            self.assertIsNotNone(MigrationContext.configure(conn).get_current_revision())
            self.assertEqual(
                conn.execute(text("SELECT email FROM users")).scalar(), "keep@me.ph",
                "adopting migrations must not disturb existing rows",
            )

    def test_baseline_downgrades_cleanly(self):
        """A migration that cannot be undone is one you cannot back out of."""
        cfg = _config(self.url)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        remaining = set(inspect(self.engine).get_table_names()) - {"alembic_version"}
        self.assertEqual(remaining, set(), f"downgrade left tables behind: {sorted(remaining)}")


if __name__ == "__main__":
    unittest.main()
