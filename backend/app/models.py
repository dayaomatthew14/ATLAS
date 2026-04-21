from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Enum, Time, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(255), nullable=False)
    last_name = Column(String(255), nullable=False)
    contact_number = Column(String(20), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(Enum('admin', 'program_chair', 'faculty', 'student', name='user_roles'), nullable=False)
    is_verified = Column(Boolean, default=False)
    verification_otp = Column(String(10), nullable=True)
    reset_otp = Column(String(10), nullable=True)
    reset_otp_expiry = Column(DateTime, nullable=True)
    session_version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(String(500), nullable=True)

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    units = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))
    type = Column(Enum('lecture', 'lab', name='subject_types'), nullable=False)

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    building = Column(String(100), nullable=False)
    capacity = Column(Integer, nullable=False)
    type = Column(Enum('lecture', 'lab', 'computer_lab', name='room_types'), nullable=False)

class Faculty(Base):
    __tablename__ = "faculty"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    max_units = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))

class Semester(Base):
    __tablename__ = "semesters"
    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String(20), nullable=False)
    term = Column(Enum('1st', '2nd', 'summer', name='semester_terms'), nullable=False)
    is_active = Column(Boolean, default=False)

class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"), index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), index=True)
    day_of_week = Column(Enum('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', name='days'), index=True)
    start_time = Column(Time, index=True)
    end_time = Column(Time, index=True)
    section = Column(String(20))
    status = Column(Enum('draft', 'published', name='schedule_status'), default='draft')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Conflict(Base):
    __tablename__ = "conflicts"
    id = Column(Integer, primary_key=True, index=True)
    schedule_id_1 = Column(Integer, ForeignKey("schedules.id"))
    schedule_id_2 = Column(Integer, ForeignKey("schedules.id"))
    conflict_type = Column(String(50))
    resolved_at = Column(DateTime, nullable=True)
