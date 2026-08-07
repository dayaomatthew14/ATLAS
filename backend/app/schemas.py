from pydantic import BaseModel, EmailStr, Field, ConfigDict, computed_field, field_validator
from typing import Optional, List
from datetime import datetime, date

# Password policy. No upper bound on length beyond bcrypt's hard limit: capping
# password length caps its strength, and passphrases are the strongest option
# most users will actually remember.
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_BYTES = 72  # bcrypt rejects anything longer


def validate_password(value: str) -> str:
    if value is None:
        raise ValueError("Password is required")
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters long")
    if len(value.encode('utf-8')) > MAX_PASSWORD_BYTES:
        raise ValueError(f"Password must be at most {MAX_PASSWORD_BYTES} bytes long")
    if value != value.strip():
        raise ValueError("Password cannot start or end with a space")
    return value


# Roles the system recognises. 'admin' is privileged and must never be settable
# from a public endpoint -- see SELF_REGISTRATION_ROLES below.
VALID_ROLES = {'admin', 'program_chair', 'coordinator'}

# Roles a visitor may choose for themselves at /api/auth/register.
SELF_REGISTRATION_ROLES = {'program_chair', 'coordinator'}


def _validate_role(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    normalized = str(value).strip().lower()
    if normalized not in VALID_ROLES:
        raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")
    return normalized


class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(pattern=r"^[A-Za-z\s.\-']+$")
    last_name: str = Field(pattern=r"^[A-Za-z\s.\-']+$")
    contact_number: Optional[str] = Field(None, pattern=r"^(|09\d{9}|\+639\d{9})$")
    role: str
    department: Optional[str] = None
    sex: Optional[str] = None
    date_of_birth: Optional[date] = None
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str

    @field_validator('role')
    @classmethod
    def check_role(cls, v):
        return _validate_role(v)

    @field_validator('password')
    @classmethod
    def check_password(cls, v):
        return validate_password(v)

class UserResponse(UserBase):
    id: int
    created_at: datetime
    # `department` carries the college code; this is the readable name that goes
    # with it. Without declaring it here the response_model silently drops it.
    department_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    name: str

class TokenData(BaseModel):
    email: Optional[str] = None

class VerifyOTP(BaseModel):
    email: str
    otp: str

class ForgotPassword(BaseModel):
    email: str

class ResetPassword(BaseModel):
    email: str
    otp: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def check_password(cls, v):
        return validate_password(v)

class ChangePassword(BaseModel):
    old_password: str
    new_password: str

    @field_validator('new_password')
    @classmethod
    def check_password(cls, v):
        return validate_password(v)

class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, pattern=r"^[A-Za-z\s.\-']+$")
    last_name: Optional[str] = Field(None, pattern=r"^[A-Za-z\s.\-']+$")
    contact_number: Optional[str] = Field(None, pattern=r"^(|09\d{9}|\+639\d{9})$")
    role: Optional[str] = None
    # Without this field Pydantic silently dropped `department` from every
    # update, so the admin UI's department control returned 200 and changed
    # nothing. Only administrators may set it -- see users.update_user.
    department: Optional[str] = None
    is_verified: Optional[bool] = None
    sex: Optional[str] = None
    date_of_birth: Optional[date] = None
    profile_picture: Optional[str] = None

    @field_validator('role')
    @classmethod
    def check_role(cls, v):
        return _validate_role(v)

class DepartmentBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None

class DepartmentCreate(DepartmentBase):
    pass

class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None

class DepartmentResponse(DepartmentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CurriculumBlockBase(BaseModel):
    program_name: str
    academic_year: str
    filename: Optional[str] = None
    # Optional so an imported block with no matching programme can still be
    # created and surface under Unassigned rather than being rejected.
    program_id: Optional[int] = None
    department_id: int
    status: Optional[str] = 'PUBLISHED'

class CurriculumBlockCreate(CurriculumBlockBase):
    pass

class CurriculumBlockResponse(CurriculumBlockBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class CurriculumBlockWithCount(CurriculumBlockResponse):
    subject_count: int
    total_units: int

class CurriculumBase(BaseModel):
    block_id: Optional[int] = None
    code: str
    name: str
    units: int
    department_id: Optional[int] = 1
    type: str
    program_code: Optional[str] = None
    year_level: Optional[str] = None
    semester_term: Optional[str] = None
    lec_units: int = 0
    lab_units: int = 0
    pre_requisite: Optional[str] = None
    is_major: bool = True

class CurriculumCreate(CurriculumBase):
    pass

class CurriculumUpdate(BaseModel):
    block_id: Optional[int] = None
    code: Optional[str] = None
    name: Optional[str] = None
    units: Optional[int] = None
    department_id: Optional[int] = None
    type: Optional[str] = None
    program_code: Optional[str] = None
    year_level: Optional[str] = None
    semester_term: Optional[str] = None
    lec_units: Optional[int] = None
    lab_units: Optional[int] = None
    pre_requisite: Optional[str] = None
    is_major: Optional[bool] = None

class CurriculumResponse(CurriculumBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class RoomBase(BaseModel):
    name: str
    building: str
    capacity: int
    type: str

class RoomCreate(RoomBase):
    pass

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    building: Optional[str] = None
    capacity: Optional[int] = None
    type: Optional[str] = None

class RoomResponse(RoomBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class FacultyBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    max_units: int = 18
    type: str = 'full_time'
    department_id: Optional[int] = None

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    max_units: Optional[int] = None
    type: Optional[str] = None
    department_id: Optional[int] = None

class FacultyResponse(FacultyBase):
    id: int
    current_units: Optional[int] = 0
    remaining_units: Optional[int] = 18
    unavailability: Optional[List["FacultyUnavailabilityResponse"]] = []
    model_config = ConfigDict(from_attributes=True)

class SemesterBase(BaseModel):
    academic_year: str
    term: str
    is_active: bool = False

class SemesterCreate(SemesterBase):
    pass

class SemesterUpdate(BaseModel):
    academic_year: Optional[str] = None
    term: Optional[str] = None
    is_active: Optional[bool] = None

class SemesterResponse(SemesterBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

from datetime import time

class ScheduleBase(BaseModel):
    semester_id: int
    curriculum_id: int
    faculty_id: Optional[int] = None
    room_id: Optional[int] = None
    day_of_week: str
    start_time: time
    end_time: time
    section: Optional[str] = ""
    status: str = 'draft'
    is_locked: bool = False

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleUpdate(BaseModel):
    semester_id: Optional[int] = None
    curriculum_id: Optional[int] = None
    faculty_id: Optional[int] = None
    room_id: Optional[int] = None
    day_of_week: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    section: Optional[str] = None
    status: Optional[str] = None
    is_locked: Optional[bool] = None

class ScheduleResponse(ScheduleBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    # Relationships for UI display
    curriculum: Optional[CurriculumResponse] = None
    room: Optional[RoomResponse] = None
    
    @computed_field
    @property
    def subject(self) -> str:
        return self.curriculum.name if self.curriculum else "Unknown"
        
    @computed_field
    @property
    def startTime(self) -> str:
        return self.start_time.strftime("%H:%M") if self.start_time else "00:00"
        
    @computed_field
    @property
    def endTime(self) -> str:
        return self.end_time.strftime("%H:%M") if self.end_time else "00:00"

    model_config = ConfigDict(from_attributes=True)

class SystemLogBase(BaseModel):
    action: str
    details: Optional[str] = None
    status: str = 'success'

class SystemLogCreate(SystemLogBase):
    user_id: Optional[int] = None
    department_id: Optional[int] = None

class SystemLogResponse(SystemLogBase):
    id: int
    user_id: Optional[int]
    department_id: Optional[int]
    timestamp: datetime
    
    @computed_field
    @property
    def message(self) -> str:
        return self.action
        
    @computed_field
    @property
    def time(self) -> str:
        return self.timestamp.strftime("%Y-%m-%d %H:%M")
        
    @computed_field
    @property
    def type(self) -> str:
        return "USER_ACTIVITY" # Default type for UI mapping

    model_config = ConfigDict(from_attributes=True)

class AIRuleBase(BaseModel):
    department_id: int
    faculty_id: Optional[int] = None
    rule_type: str
    rule_value: str
    is_active: bool = True

class AIRuleCreate(AIRuleBase):
    pass

class AIRuleUpdate(BaseModel):
    faculty_id: Optional[int] = None
    rule_type: Optional[str] = None
    rule_value: Optional[str] = None
    is_active: Optional[bool] = None

class AIRuleResponse(AIRuleBase):
    id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Faculty Unavailability ---
class FacultyUnavailabilityCreate(BaseModel):
    day_of_week: str
    start_time: time
    end_time: time

class FacultyUnavailabilityResponse(BaseModel):
    id: int
    faculty_id: int
    day_of_week: str
    start_time: time
    end_time: time
    model_config = ConfigDict(from_attributes=True)



class BulkImportRequest(BaseModel):
    block_id: Optional[int] = None
    program_name: str
    academic_year: str
    department_id: int
    items: List[CurriculumCreate]

class ImportSummary(BaseModel):
    program_name: Optional[str] = None
    academic_year: Optional[str] = None
    total_rows: int
    valid_new_items: int
    duplicates_skipped: int
    issues_found: int
    unit_validation: Optional[str] = None
    excel_total: Optional[float] = None
    parser_total: Optional[float] = None
    summary_details: Optional[list] = None

    # The importer had been building these for a while, but they were not
    # declared here so Pydantic dropped them on the way out -- the sheet it
    # chose and why were computed and then discarded before reaching the UI.
    selected_sheet: Optional[str] = None
    available_sheets: Optional[List[str]] = None
    sheet_auto_selected: Optional[bool] = None
    selected_sheet_reason: Optional[str] = None
    scanned_rows: Optional[int] = None
    detected_subjects: Optional[int] = None
    created_subjects: Optional[int] = None
    skipped_rows: Optional[int] = None
    warnings_count: Optional[int] = None
    errors_count: Optional[int] = None

class ImportResponse(BaseModel):
    is_dry_run: bool
    message: str
    summary: ImportSummary
    zones: Optional[list] = None
    report: Optional[list] = None
    errors: Optional[list] = None
    course: Optional[str] = None

# --- Conflict Validation ---
class ConflictValidate(BaseModel):
    semester_id: int
    day_of_week: str
    start_time: time
    end_time: time
    room_id: Optional[int] = None
    faculty_id: Optional[int] = None
    section: Optional[str] = None
    ignore_schedule_id: Optional[int] = None

class ConflictDetail(BaseModel):
    type: str # 'room', 'faculty', 'section'
    existing_schedule: Optional[ScheduleResponse] = None
    message: str

class SubjectOfferingCreate(BaseModel):
    faculty_id: int
    curriculum_id: int
    semester_id: int

class SubjectOfferingResponse(BaseModel):
    id: int
    faculty_id: int
    curriculum_id: int
    semester_id: int
    model_config = ConfigDict(from_attributes=True)
