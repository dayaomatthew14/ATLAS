from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import secrets
from fastapi.staticfiles import StaticFiles

load_dotenv()

from contextlib import asynccontextmanager
from app import database, models, auth
from app.database import engine
from app import storage
from app.routers import (
    auth_router, curriculum, rooms, 
    users, schedules, semesters, ai_scheduler, logs, ai_rules,
    notifications_router, conflicts, subject_offerings, professors,
    academics_router
)

from sqlalchemy import text, inspect
from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

def sync_missing_columns(conn):
    """
    Add any column that exists on a model but not yet on its live table.

    create_all() only creates missing *tables*; it never alters existing ones, so
    columns added to models after a table was first created stay missing until
    something inserts one and fails at runtime. That is exactly how
    conflicts.reason and conflicts.created_at went missing and silently broke
    schedule generation. Reconciling the whole metadata generically means a new
    model column can no longer be forgotten here.

    New columns are always added as NULLable: ALTER TABLE ... ADD COLUMN NOT NULL
    is rejected on a table that already has rows. Backfilling a value and
    tightening the constraint is a job for a real migration.
    """
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())
    added = []

    for table in models.Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all() just made it, so it is already current
        live_columns = {c["name"] for c in inspector.get_columns(table.name)}

        for column in table.columns:
            if column.name in live_columns:
                continue
            try:
                col_type = column.type.compile(dialect=conn.dialect)
            except Exception:
                print(f"  ! cannot render type for {table.name}.{column.name}; skipping")
                continue

            ddl = f'ALTER TABLE {table.name} ADD COLUMN {column.name} {col_type}'
            try:
                conn.execute(text(ddl))
                added.append(f"{table.name}.{column.name}")
            except Exception as e:
                print(f"  ! failed to add {table.name}.{column.name}: {e}")

    return added

def _alembic_config():
    """Alembic configuration resolved relative to this file, not the cwd."""
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = Config(os.path.join(here, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(here, "alembic"))
    return cfg


def init_db():
    """
    Bring the database to the schema this code expects, then verify it.

    Three cases, distinguished by whether alembic has ever stamped this
    database:

      * No `alembic_version` table. Either a brand-new database or one created
        before migrations existed -- which includes the deployed one. Build
        anything missing the way it was always built, then stamp the baseline
        so the next change can be a migration rather than a guess.
      * Stamped. Run the migrations, so the schema follows the code
        automatically instead of depending on someone remembering.

    `sync_missing_columns` still runs afterwards, but its role has changed. It
    used to be the only mechanism, which is why a renamed or retyped column
    could never be applied at all and a missing one was repaired in silence.
    Now it is a check: anything it finds is a column that reached the models
    without a migration, and it says so loudly instead of quietly patching and
    moving on.
    """
    try:
        with engine.connect() as conn:
            stamped = MigrationContext.configure(conn).get_current_revision()

        if stamped is None:
            print("Schema: no migration history found; adopting the baseline.")
            models.Base.metadata.create_all(bind=engine)
            command.stamp(_alembic_config(), "head")
            print("Schema: stamped at head. Future changes come from alembic/versions.")
        else:
            command.upgrade(_alembic_config(), "head")
            print(f"Schema: migrations applied (was at {stamped}).")

        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            if "postgresql" in engine.url.drivername:
                # Legacy fixup: role was originally an ENUM and must be widened
                # before the generic column check can rely on it.
                try:
                    conn.execute(text("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::VARCHAR;"))
                except Exception as e:
                    print(f"  (users.role already VARCHAR or not alterable: {e})")

            added = sync_missing_columns(conn)
            if added:
                print("=" * 72)
                print(f"  SCHEMA DRIFT: {len(added)} column(s) existed on the models but not in")
                print(f"  the database, and were added as nullable: {', '.join(added)}")
                print("  A migration is missing. Generate one so the next deployment does not")
                print("  depend on this fallback:  alembic revision --autogenerate -m '...'")
                print("=" * 72)
            else:
                print("Schema: database matches the models.")
    except Exception as e:
        print(f"Database initialization warning: {e}")

def seed_academic_taxonomy(db):
    """
    Make the four colleges and twelve programmes real records, then fold the
    per-user `DEPT_{id}` workspaces into them.

    Idempotent: safe to run on every start. Existing curriculum is repointed,
    never deleted -- a block whose name matches no seeded programme keeps its
    rows and surfaces in the Unassigned group instead.
    """
    from app.academics import COLLEGES, match_program_code

    # 1. Colleges.
    by_code = {}
    for spec in COLLEGES:
        college = db.query(models.Department).filter(models.Department.code == spec["code"]).first()
        if not college:
            college = models.Department(code=spec["code"], name=spec["name"], description=spec["name"])
            db.add(college)
            db.flush()
        else:
            college.name = spec["name"]
        by_code[spec["code"]] = college

    # 2. Programmes.
    programs_by_code = {}
    for spec in COLLEGES:
        for code, name in spec["programs"]:
            program = db.query(models.Program).filter(models.Program.code == code).first()
            if not program:
                program = models.Program(code=code, name=name, department_id=by_code[spec["code"]].id)
                db.add(program)
                db.flush()
            else:
                program.name = name
                program.department_id = by_code[spec["code"]].id
            programs_by_code[code] = program
    db.commit()

    # 3. Fold the legacy per-user workspaces into real colleges. Their `name`
    #    is the only clue to what they were meant to be ("CAST", "CAST -
    #    Computer Engineering & Computer Science"), so match on that.
    legacy = db.query(models.Department).filter(
        ~models.Department.code.in_(list(by_code.keys()))
    ).all()

    remap = {}
    for old in legacy:
        target = None
        haystack = (old.name or "").upper()
        for code in by_code:
            if haystack.startswith(code) or f" {code}" in haystack or haystack == code:
                target = by_code[code]
                break
        remap[old.id] = target  # None => nothing sensible to map onto

    for old_id, target in remap.items():
        if target is None:
            continue
        for model in (models.CurriculumBlock, models.Curriculum, models.Faculty, models.SystemLog):
            db.query(model).filter(model.department_id == old_id).update(
                {model.department_id: target.id}, synchronize_session=False
            )
    db.commit()

    # 4. Users pointed at a legacy code now point at the college it became.
    legacy_by_code = {d.code: remap.get(d.id) for d in legacy}
    for user in db.query(models.User).all():
        current = (user.department or "").strip()
        if not current or current in by_code:
            continue
        target = legacy_by_code.get(current)
        # A user may also carry a bare college name rather than a code.
        if target is None:
            target = by_code.get(current.upper())
        user.department = target.code if target is not None else None
    db.commit()

    # 5. Delete the emptied legacy workspaces. Anything that could not be
    #    mapped is left alone rather than dropped with its curriculum.
    for old in legacy:
        if remap.get(old.id) is None:
            continue
        db.delete(old)
    db.commit()

    # 6. Attach curriculum blocks to programmes by name.
    unmatched = 0
    for block in db.query(models.CurriculumBlock).all():
        if block.program_id:
            continue
        code = match_program_code(block.program_name)
        if code and code in programs_by_code:
            program = programs_by_code[code]
            block.program_id = program.id
            block.department_id = program.department_id
        else:
            unmatched += 1
    db.commit()

    print(f"Academic taxonomy: {len(by_code)} colleges, {len(programs_by_code)} programmes ready.")
    if unmatched:
        print(f"  {unmatched} curriculum block(s) match no programme; shown under Unassigned.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        with database.SessionLocal() as db:
            seed_academic_taxonomy(db)
    except Exception as e:
        print(f"Academic taxonomy seeding result: {e}")
    try:
        with database.SessionLocal() as db:
            admin_user = db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
            if not admin_user:
                # The seed password used to be the constant "Admin123!", which is
                # readable by anyone with the source and was live in production.
                # Take it from the environment, or mint a random one and print it
                # once so it never becomes a known default.
                seed_password = os.getenv("ADMIN_SEED_PASSWORD")
                generated = False
                if not seed_password:
                    seed_password = secrets.token_urlsafe(18)
                    generated = True

                hashed_pw = auth.get_password_hash(seed_password)
                new_admin = models.User(
                    first_name="ATLAS",
                    last_name="Administrator",
                    email="admin@dlsau.edu.ph",
                    password_hash=str(hashed_pw),
                    role="admin",
                    department="DLSAU IT / System Administration",
                    is_verified=True
                )
                db.add(new_admin)
                db.commit()
                print("Successfully seeded master System Administrator account: admin@dlsau.edu.ph")
                if generated:
                    print("=" * 72)
                    print("  Generated administrator password (shown once, not stored anywhere):")
                    print(f"    {seed_password}")
                    print("  Sign in and change it, or set ADMIN_SEED_PASSWORD before first start.")
                    print("=" * 72)
            else:
                setattr(admin_user, 'role', 'admin')
                setattr(admin_user, 'is_verified', True)
                db.commit()
    except Exception as e:
        print(f"Startup admin seeder result: {e}")
    yield

app = FastAPI(title="ATLAS Backend API", redirect_slashes=False, lifespan=lifespan)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

# Mount static directory for uploads. The URL stays /uploads; where those
# files actually sit is UPLOAD_DIR, which a deployment points at a mounted
# volume so a redeploy stops wiping every profile photo. See app/storage.py.
os.makedirs(storage.profiles_dir(), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=storage.UPLOAD_DIR), name="uploads")

origins = [
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://atlas-chi-blue.vercel.app",
]
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    for origin in allowed_origins_env.split(","):
        clean_origin = origin.strip().rstrip('/')
        if clean_origin and clean_origin not in origins:
            origins.append(clean_origin)

# No wildcard subdomain regex here. `https://.*\.vercel\.app` combined with
# allow_credentials=True let *any* Vercel deployment -- including one belonging
# to someone else -- make authenticated cross-origin calls to this API. Preview
# deployments should be added explicitly via the ALLOWED_ORIGINS env var.
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(curriculum.router)
app.include_router(rooms.router)
app.include_router(users.router)
app.include_router(schedules.router)
app.include_router(semesters.router)
app.include_router(ai_scheduler.router)
app.include_router(logs.router)
app.include_router(ai_rules.router)
app.include_router(notifications_router.router)
app.include_router(conflicts.router)
app.include_router(subject_offerings.router)
app.include_router(professors.router)
app.include_router(academics_router.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    is_prod = os.getenv("ENV") == "production"
    print(f"[INTERNAL EXCEPTION] {type(exc).__name__}: {str(exc)}")
    detail_msg = "Internal server error" if is_prod else str(exc)

    # Only echo the Origin back if it is one we actually trust. Reflecting an
    # arbitrary Origin alongside Allow-Credentials let any site read the body
    # of a 500 response, which in non-production carries the exception text.
    headers = {}
    origin = request.headers.get("origin")
    if origin and origin.rstrip('/') in origins:
        headers = {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }

    return JSONResponse(status_code=500, content={"detail": detail_msg}, headers=headers)
