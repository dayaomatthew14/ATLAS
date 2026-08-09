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
    role = Column(String(50), nullable=False, default='program_chair')
    department = Column(String(50), nullable=True)
    sex = Column(Enum('Male', 'Female', 'Other', name='user_sex_types'), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    profile_picture = Column(String(255), nullable=True)
    is_verified = Column(Boolean, default=False)
    verification_otp = Column(String(10), nullable=True)
    # A verification code used to have no expiry, so one issued months ago stayed
    # valid indefinitely -- an attacker guessing a six-digit code had unlimited
    # time as well as unlimited tries.
    verification_otp_expiry = Column(DateTime, nullable=True)
    reset_otp = Column(String(10), nullable=True)
    reset_otp_expiry = Column(DateTime, nullable=True)

    # Wrong guesses against the current code, verification or reset alike. A
    # six-digit code is only a secret while the number of attempts is bounded;
    # without this, the whole space is reachable by anyone willing to keep
    # asking. Reset to zero whenever a new code is issued or one is accepted.
    # Nullable rather than NOT NULL because the startup schema sync adds columns
    # without backfilling, so existing rows arrive NULL and must read as zero.
    otp_attempts = Column(Integer, default=0, nullable=True)

    # Consecutive failed sign-ins, and the moment the account becomes usable
    # again once they pass the threshold. Cleared on any successful sign-in.
    failed_login_attempts = Column(Integer, default=0, nullable=True)
    login_locked_until = Column(DateTime, nullable=True)

    # How often codes have been sent to this account. Sending is not free: every
    # code costs one message from a shared daily email allowance, so an
    # unbounded resend lets one address exhaust the pool for everybody, and lets
    # anyone who knows an email address bury its owner in codes.
    otp_sent_at = Column(DateTime, nullable=True)
    otp_sends_today = Column(Integer, default=0, nullable=True)
    otp_send_window_start = Column(DateTime, nullable=True)

    session_version = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Department(Base):
    """
    A college of the university.

    This table used to hold one private workspace per user account: registration
    minted `DEPT_{user_id}` and pointed the user at it, so three separate rows
    could all mean CAST and `users.department` referenced a code that existed
    nowhere. It now holds exactly the four institutional colleges, seeded at
    startup. The table name is unchanged because Curriculum, CurriculumBlock,
    Faculty and SystemLog all carry `department_id` foreign keys to it.

    `owner_id` is retained only so existing rows keep loading; a college is not
    owned by anyone and nothing sets it any more.
    """
    __tablename__ = "departments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=False, unique=True)
    description = Column(String(500), nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)

    curriculum_items = relationship("Curriculum", back_populates="department")
    faculty_members = relationship("Faculty", back_populates="department")
    blocks = relationship("CurriculumBlock", back_populates="department")
    programs = relationship("Program", back_populates="college", order_by="Program.name")

class Program(Base):
    """
    A degree programme offered by a college.

    Programmes were previously free text captured from an Excel filename during
    curriculum import, which is how a block came to be named
    "BACHELOR OF SCIENCE IN COMPUTER ENGINEERING AY" -- the stray "AY" is a
    parser artefact that became part of the programme's identity. They are now
    institutional records seeded at startup, and a curriculum block points at
    one.
    """
    __tablename__ = "programs"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(255), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=False)

    college = relationship("Department", back_populates="programs")
    blocks = relationship("CurriculumBlock", back_populates="program")

class CurriculumBlock(Base):
    __tablename__ = "curriculum_blocks"
    id = Column(Integer, primary_key=True, index=True)
    program_name = Column(String(255), nullable=False)
    academic_year = Column(String(50), nullable=False)
    filename = Column(String(255), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"))
    # Nullable on purpose: a block that matches no seeded programme stays
    # visible in the Unassigned group rather than being hidden or deleted.
    program_id = Column(Integer, ForeignKey("programs.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default='PUBLISHED') # DRAFT, PUBLISHED, ARCHIVED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    department = relationship("Department", back_populates="blocks")
    program = relationship("Program", back_populates="blocks")
    curriculum_items = relationship("Curriculum", back_populates="block")

class Curriculum(Base):
    __tablename__ = "curriculum"
    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(Integer, ForeignKey("curriculum_blocks.id", ondelete="CASCADE"), nullable=True)
    code = Column(String(50), nullable=False)
    name = Column(String(255), nullable=False)
    units = Column(Integer, nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"))
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
    """
    A teachable space.

    `department_id` is the owning college, and it is nullable on purpose --
    the two values mean genuinely different things:

      NULL  -- a shared campus room. Lecture halls, and any laboratory the
               Registrar assigns centrally. Nobody's department owns it, so only
               an administrator may alter it.
      set   -- a laboratory the named college runs itself, and may create,
               rename and retire without asking anyone.

    Departments are not required to own any. A college whose laboratories are
    all Registrar-assigned simply has no rows here, which is why this is
    nullable rather than a required owner with a "shared" sentinel college.
    Registrar assignment itself is not modelled: those rooms arrive as ordinary
    shared rooms.
    """
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    building = Column(String(100), nullable=False)
    capacity = Column(Integer, nullable=False)
    type = Column(Enum('lecture', 'lab', 'computer_lab', name='room_types'), nullable=False)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True)

    department = relationship("Department")
    schedules = relationship("Schedule", back_populates="room")

    @property
    def department_code(self):
        """
        The owning college's code, or None for a shared room.

        Serialised alongside `department_id` because the frontend only knows the
        signed-in user's college as a code (`atlas_department`), and comparing a
        code to an id is how a screen ends up showing the wrong owner.
        """
        return self.department.code if self.department else None

class Faculty(Base):
    __tablename__ = "faculty"
    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String(255), nullable=False, default='')
    last_name = Column(String(255), nullable=False, default='')
    email = Column(String(255), nullable=True)
    contact_number = Column(String(20), nullable=True)
    max_units = Column(Integer, nullable=False, default=18)
    type = Column(Enum('full_time', 'part_time', name='faculty_types'), nullable=False, default='full_time')
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"))

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
    curriculum_id = Column(Integer, ForeignKey("curriculum.id", ondelete="CASCADE"))
    faculty_id = Column(Integer, ForeignKey("faculty.id", ondelete="CASCADE"), index=True)
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
    schedule_id_1 = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=True)
    schedule_id_2 = Column(Integer, ForeignKey("schedules.id", ondelete="CASCADE"), nullable=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id", ondelete="CASCADE"), nullable=True)
    curriculum_id = Column(Integer, ForeignKey("curriculum.id", ondelete="CASCADE"), nullable=True)
    conflict_type = Column(String(50), nullable=True)
    reason = Column(String(500), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class SystemLog(Base):
    __tablename__ = "system_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    action = Column(String(255), nullable=False)
    details = Column(String(1000), nullable=True)
    status = Column(Enum('success', 'warning', 'error', name='log_status'), default='success')
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class AIRule(Base):
    __tablename__ = "ai_rules"
    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"))
    faculty_id = Column(Integer, ForeignKey("faculty.id", ondelete="CASCADE"), nullable=True)
    rule_type = Column(String(100), nullable=False) # e.g., 'preferred_time', 'max_consecutive_hours'
    rule_value = Column(String(500), nullable=False) # JSON or simple value
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class FacultyUnavailability(Base):
    __tablename__ = "faculty_unavailability"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id", ondelete="CASCADE"), nullable=False, index=True)
    day_of_week = Column(Enum('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', name='unavail_days'), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    faculty = relationship("Faculty", back_populates="unavailabilities")



class SubjectOffering(Base):
    __tablename__ = "subject_offerings"
    id = Column(Integer, primary_key=True, index=True)
    faculty_id = Column(Integer, ForeignKey("faculty.id", ondelete="CASCADE"), nullable=False)
    curriculum_id = Column(Integer, ForeignKey("curriculum.id", ondelete="CASCADE"), nullable=False)
    semester_id = Column(Integer, ForeignKey("semesters.id", ondelete="CASCADE"), nullable=False)
    assigned_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
