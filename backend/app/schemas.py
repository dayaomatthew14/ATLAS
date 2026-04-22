from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    first_name: str = Field(pattern=r'^[A-Za-z\s]+$')
    last_name: str = Field(pattern=r'^[A-Za-z\s]+$')
    contact_number: Optional[str] = Field(None, pattern=r'^(09\d{9}|\+639\d{9})$')
    role: str

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

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

class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, pattern=r'^[A-Za-z\s]+$')
    last_name: Optional[str] = Field(None, pattern=r'^[A-Za-z\s]+$')
    contact_number: Optional[str] = Field(None, pattern=r'^(09\d{9}|\+639\d{9})$')
    role: Optional[str] = None
    is_verified: Optional[bool] = None

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

    class Config:
        from_attributes = True

class SubjectBase(BaseModel):
    code: str
    name: str
    units: int
    department_id: int
    type: str

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    units: Optional[int] = None
    department_id: Optional[int] = None
    type: Optional[str] = None

class SubjectResponse(SubjectBase):
    id: int

    class Config:
        from_attributes = True

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

    class Config:
        from_attributes = True

class FacultyBase(BaseModel):
    user_id: int
    max_units: int
    department_id: int

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(BaseModel):
    max_units: Optional[int] = None
    department_id: Optional[int] = None

class FacultyResponse(FacultyBase):
    id: int

    class Config:
        from_attributes = True

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

    class Config:
        from_attributes = True

from datetime import time

class ScheduleBase(BaseModel):
    semester_id: int
    subject_id: int
    faculty_id: int
    room_id: int
    day_of_week: str
    start_time: time
    end_time: time
    section: str
    status: str = 'draft'

class ScheduleCreate(ScheduleBase):
    pass

class ScheduleUpdate(BaseModel):
    semester_id: Optional[int] = None
    subject_id: Optional[int] = None
    faculty_id: Optional[int] = None
    room_id: Optional[int] = None
    day_of_week: Optional[str] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    section: Optional[str] = None
    status: Optional[str] = None

class ScheduleResponse(ScheduleBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
