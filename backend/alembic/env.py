"""
Alembic environment.

The database URL is taken from the application rather than from alembic.ini.
`app.database` already resolves DATABASE_URL, rewrites the legacy `postgres://`
scheme SQLAlchemy no longer accepts, and appends `sslmode=require` for managed
Postgres. Duplicating any of that here is how a migration ends up run against a
different database than the one the app uses.
"""

import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# The backend package root, so `app.*` imports resolve when alembic is invoked
# from the backend directory.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import models          # noqa: E402  (imported for its metadata)
from app.database import SQLALCHEMY_DATABASE_URL  # noqa: E402

config = context.config

# A caller may set the URL explicitly -- the test suite does this to run
# migrations against a throwaway database. Otherwise use the application's,
# so a normal invocation cannot target anything but the real database.
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", SQLALCHEMY_DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = models.Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=SQLALCHEMY_DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            # SQLite cannot ALTER most things in place; batch mode rewrites the
            # table instead. Harmless on Postgres, essential for local work.
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
