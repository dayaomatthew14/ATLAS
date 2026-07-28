from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from fastapi.staticfiles import StaticFiles

load_dotenv()

from contextlib import asynccontextmanager
from app import database, models, auth
from app.database import engine
from app.routers import (
    auth_router, curriculum, rooms, 
    users, schedules, semesters, faculty, ai_scheduler, logs, ai_rules,
    notifications_router, conflicts, subject_offerings, professors
)

from sqlalchemy import text
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

def init_db():
    try:
        models.Base.metadata.create_all(bind=engine)
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            driver = engine.url.drivername
            if "postgresql" in driver:
                conn.execute(text("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::VARCHAR;"))
                conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                conn.execute(text("ALTER TABLE conflicts ADD COLUMN IF NOT EXISTS faculty_id INTEGER REFERENCES faculty(id) ON DELETE CASCADE"))
                conn.execute(text("ALTER TABLE conflicts ADD COLUMN IF NOT EXISTS curriculum_id INTEGER REFERENCES curriculum(id) ON DELETE CASCADE"))
                print("Successfully converted users.role to VARCHAR(50) and updated database columns in production PostgreSQL.")
            else:
                res = conn.execute(text("PRAGMA table_info(departments)")).fetchall()
                columns = [r[1] for r in res]
                if "owner_id" not in columns:
                    conn.execute(text("ALTER TABLE departments ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                
                res_c = conn.execute(text("PRAGMA table_info(conflicts)")).fetchall()
                cols_c = [r[1] for r in res_c]
                if "faculty_id" not in cols_c:
                    conn.execute(text("ALTER TABLE conflicts ADD COLUMN faculty_id INTEGER REFERENCES faculty(id) ON DELETE CASCADE"))
                if "curriculum_id" not in cols_c:
                    conn.execute(text("ALTER TABLE conflicts ADD COLUMN curriculum_id INTEGER REFERENCES curriculum(id) ON DELETE CASCADE"))
                print("Successfully migrated conflicts columns in SQLite.")
    except Exception as e:
        print(f"Database initialization warning: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:
        with database.SessionLocal() as db:
            admin_user = db.query(models.User).filter(models.User.email == "admin@dlsau.edu.ph").first()
            if not admin_user:
                hashed_pw = auth.get_password_hash("Admin123!")
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
            else:
                setattr(admin_user, 'role', 'admin')
                setattr(admin_user, 'is_verified', True)
                db.commit()
    except Exception as e:
        print(f"Startup admin seeder result: {e}")
    yield

app = FastAPI(title="ATLAS Backend API", redirect_slashes=False, lifespan=lifespan)
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=["*"])

# Mount static directory for uploads
os.makedirs("uploads/profiles", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

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
    origins.extend([origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_origin_regex=r"https://.*\.vercel\.app",
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
app.include_router(faculty.router)
app.include_router(ai_scheduler.router)
app.include_router(logs.router)
app.include_router(ai_rules.router)
app.include_router(notifications_router.router)
app.include_router(conflicts.router)
app.include_router(subject_offerings.router)
app.include_router(professors.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "*")
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
    )
