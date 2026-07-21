from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
from fastapi.staticfiles import StaticFiles

load_dotenv()

from app.database import engine
from app import models
from app.routers import (
    auth_router, curriculum, rooms, 
    users, schedules, semesters, faculty, ai_scheduler, logs, ai_rules,
    notifications_router, conflicts, subject_offerings, professors
)

# Create the database tables
models.Base.metadata.create_all(bind=engine)

from sqlalchemy import text
with engine.begin() as conn:
    try:
        driver = engine.url.drivername
        if "postgresql" in driver:
            conn.execute(text("ALTER TABLE departments ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
            print("Successfully verified/added owner_id column to departments in production PostgreSQL.")
        else:
            res = conn.execute(text("PRAGMA table_info(departments)")).fetchall()
            columns = [r[1] for r in res]
            if "owner_id" not in columns:
                conn.execute(text("ALTER TABLE departments ADD COLUMN owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE"))
                print("Successfully added owner_id column to departments in SQLite.")
    except Exception as e:
        print(f"Database migration pre-check result: {e}")



app = FastAPI(title="ATLAS Backend API")

# Mount static directory for uploads
os.makedirs("uploads/profiles", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Setup CORS for frontend communication
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
