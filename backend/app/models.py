from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Enum, Time, DateTime, Date
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
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
    department = Column(String(50), nullable=True)
    sex = Column(Enum('Male', 'Female', 'Other', name='user_sex_types'), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    profile_picture = Column(String(255), nullable=True)
    is_verified = Column(Boolean, default=False)
    verification_otp = Column(String(10), nullable=True)
    reset_otp = Column(String(10), nullable=True)
    reset_otp_expiry = Column(DateTime, nullable=True)
    session_version = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Department(Base):
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(String(500), nullable=True)

    curriculum_items = relationship("Curriculum", back_populates="department")
    faculty_members = relationship("Faculty", back_populates="department")
    blocks = relationship("CurriculumBlock", back_populates="department")

class CurriculumBlock(Base):
    __tablename__ = "curriculum_blocks"
    id = Column(Integer, primary_key=True, index=True)
    program_name = Column(String(255), nullable=False)
    academic_year = Column(String(50), nullable=False)
    filename = Column(String(255), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"))
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    department = relationship("Department", back_populates="blocks")
    curriculum_items = relationship("Curriculum", back_populates="block")

class Curriculum(Base):
    __tablename__ = "curriculum"
    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("curriculum_blocks.id"), nullable=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    units = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id"))
    type = Column(Enum('lecture', 'lab', name='subject_types'), nullable=False)
    program_code = Column(String(50), nullable=True)
    year_level = Column(String(20), nullable=True)
    semester_term = Column(String(20), nullable=True)
    lec_units = Column(Integer, default=0)
    lab_units = Column(Integer, default=0)
    pre_requisite = Column(String(100), nullable=True)
    is_major = Column(Boolean, default=True)

    department = relationship("Department", back_populates="curriculum_items")
    block = relationship("CurriculumBlock", back_populates="curriculum_items")
    schedules = relationship("Schedule", back_populates="curriculum")

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    building = Column(String(100), nullable=False)
    capacity = Column(Integer, nullable=False)
    type = Column(Enum('lecture', 'lab', 'computer_lab', name='room_types'), nullable=False)

    schedules = relationship("Schedule", back_populates="room")

class Faculty(Base):
    __tablename__ = "faculty"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(255), nullable=False, default='')
    last_name = Column(String(255), nullable=False, default='')
    email = Column(String(255), nullable=True)
    contact_number = Column(String(20), nullable=True)
    max_units = Column(Integer, nullable=False, default=18)
    type = Column(Enum('full_time', 'part_time', name='faculty_types'), nullable=False, default='full_time')
    department_id = Column(Integer, ForeignKey("departments.id"))

    department = relationship("Department", back_populates="faculty_members")
    schedules = relationship("Schedule", back_populates="faculty")
    unavailabilities = relationship("FacultyUnavailability", back_populates="faculty")

class Semester(Base):
    __tablename__ = "semesters"
    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String(20), nullable=False)
    term = Column(Enum('1st', '2nd', '3rd semester', name='semester_terms'), nullable=False)
    is_active = Column(Boolean, default=False)

    schedules = relationship("Schedule", back_populates="semester")

class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    semester_id = Column(Integer, ForeignKey("semesters.id"), index=True)
    curriculum_id = Column(Integer, ForeignKey("curriculum.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"), index=True)
    room_id = Column(Integer, ForeignKey("rooms.id"), index=True)
    day_of_week = Column(Enum('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', name='days'), index=True)
    start_time = Column(Time, index=True)
    end_time = Column(Time, index=True)
    section = Column(String(20))
    status = Column(Enum('draft', 'published', name='schedule_status'), default='draft')
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    semester = relationship("Semester", back_populates="schedules")
    curriculum = relationship("Curriculum", back_populates="schedules")
    faculty = relationship("Faculty", back_populates="schedules")
    room = relationship("Room", back_populates="schedules")

class Conflict(Base):
    __tablename__ = "conflicts"
    id = Column(Integer, primary_key=True, index=True)
    schedule_id_1 = Column(Integer, ForeignKey("schedules.id"))
    schedule_id_2 = Column(Integer, ForeignKey("schedules.id"))
    conflict_type = Column(String(50))
    resolved_at = Column(DateTime, nullable=True)

class SystemLog(Base):
    __tablename__ = "system_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    action = Column(String(255), nullable=False)
    details = Column(String(1000), nullable=True)
    status = Column(Enum('success', 'warning', 'error', name='log_status'), default='success')
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AIRule(Base):
    __tablename__ = "ai_rules"
    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"))
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=True)
    rule_type = Column(String(100), nullable=False) # e.g., 'preferred_time', 'max_consecutive_hours'
    rule_value = Column(String(500), nullable=False) # JSON or simple value
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class FacultyUnavailability(Base):
    __tablename__ = "faculty_unavailability"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False, index=True)
    day_of_week = Column(Enum('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', name='unavail_days'), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    faculty = relationship("Faculty", back_populates="unavailabilities")



class SubjectOffering(Base):
    __tablename__ = "subject_offerings"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id"), nullable=False)
    curriculum_id = Column(Integer, ForeignKey("curriculum.id"), nullable=False)
    semester_id = Column(Integer, ForeignKey("semesters.id"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
