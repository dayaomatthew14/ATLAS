from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

import os
# Use SQLite for local development
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./atlas_v3.db")

# Fix for postgres:// protocol which is common in Render database URLs but not supported directly by SQLAlchemy 1.4+
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
