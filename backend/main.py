from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app import models
from app.routers import (
    auth_router, departments, subjects, rooms, 
    users, schedules, semesters, faculty, ai_scheduler, logs, ai_rules,
    notifications_router
)

# Create the database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ATLAS Backend API")

# Setup CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(departments.router)
app.include_router(subjects.router)
app.include_router(rooms.router)
app.include_router(users.router)
app.include_router(schedules.router)
app.include_router(semesters.router)
app.include_router(faculty.router)
app.include_router(ai_scheduler.router)
app.include_router(logs.router)
app.include_router(ai_rules.router)
app.include_router(notifications_router.router)

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
