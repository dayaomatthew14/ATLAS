import re
from pydantic import BaseModel, EmailStr, ConfigDict, computed_field, field_validator, model_validator
from typing import Optional, List, Literal
from datetime import datetime, date, time

# Password policy. No upper bound on length beyond bcrypt's hard limit: capping
# password length caps its strength, and passphrases are the strongest option
# most users will actually remember.
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_BYTES = 72  # bcrypt rejects anything longer

# Human names, for a Philippine university.
#
# The rule was `^[A-Za-z\s.\-']+$`, which has no accented letters in it, so
# Peña and Muñoz -- among the most common surnames in the country -- could not
# be registered at all. The Latin-1 range below carries ñ/Ñ along with the
# accented vowels, and the lookahead requires at least one actual letter so a
# name cannot be punctuation alone.
#
# Must begin with a letter, so a name cannot be punctuation alone. Expressed as
# a leading character class rather than a lookahead because Pydantic v2 compiles
# patterns with the Rust regex engine, which has no look-around.
#
# Kept in step with NAME_PATTERN in frontend/src/pages/Login.jsx. The two
# drifted before: the form was the stricter of the two and rejected O'Brien,
# Dela Cruz-Santos and "Jr." while the server would have accepted all three.
NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ\s.\-']*$"


def normalize_email(value):
    """
    Lower-case and trim, so an address is one account however it was typed.

    Pydantic's EmailStr lower-cases the domain but preserves the local part, so
    registering as `Ann.Cruz@DLSAU.edu.ph` stored `Ann.Cruz@dlsau.edu.ph`. The
    sign-in form sends `email.trim().toLowerCase()`, which then matched nothing
    -- and the account could not be registered again either, because the
    address was taken. Anyone who typed a capital was locked out both ways.
    """
    if value is None:
        return value
    return str(value).strip().lower()


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


# Roles the system recognises in incoming payloads.
# The 2 active system roles are 'admin' (College Deans) and 'program_chair'.
VALID_ROLES = {'admin', 'dean', 'program_chair'}

# Roles a visitor may choose for themselves at /api/auth/register.
SELF_REGISTRATION_ROLES = {'program_chair'}


def _validate_role(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    normalized = value.strip().lower()
    if normalized not in VALID_ROLES:
        raise ValueError(f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}")
    return normalized


def validate_human_name(value: Optional[str], label: str = "Name") -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{label} is required.")

    has_digits = bool(re.search(r"\d", trimmed))
    invalid_syms = re.findall(r"[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.\-']", trimmed)
    if has_digits and invalid_syms:
        sample = "".join(dict.fromkeys(invalid_syms))[:5]
        raise ValueError(
            f"{label} cannot contain numbers or special symbols (e.g., {sample}). "
            "Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only."
        )
    if has_digits:
        raise ValueError(
            f"{label} cannot contain numbers (0-9). "
            "Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only."
        )
    if invalid_syms:
        sample = "".join(dict.fromkeys(invalid_syms))[:5]
        raise ValueError(
            f"{label} cannot contain symbols like '{sample}'. "
            "Use letters, spaces, hyphens (-), apostrophes ('), or periods (.) only."
        )
    if not re.match(NAME_PATTERN, trimmed):
        raise ValueError(f"{label} must start with a letter.")
    return trimmed


def validate_ph_contact_number(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return ""
    compact = re.sub(r"[\s-]+", "", stripped)
    if re.search(r"[A-Za-z]", compact):
        raise ValueError(
            "Contact Number cannot contain letters. Enter digits only in 09XXXXXXXXX or +639XXXXXXXXX format."
        )
    if not re.match(r"^\+?\d+$", compact):
        raise ValueError(
            "Contact Number can only contain digits (and an optional leading +63), e.g., 09123456789 or +639123456789."
        )
    if not re.match(r"^(09\d{9}|\+639\d{9})$", compact):
        if compact.startswith("+") and not compact.startswith("+639"):
            raise ValueError("Philippine mobile numbers with + must start with +639 (e.g., +639123456789).")
        if compact.startswith("+639"):
            raise ValueError(
                "Invalid length: +63 mobile numbers must have 10 digits after +63 starting with 9 (e.g., +639123456789)."
            )
        if not compact.startswith("09"):
            raise ValueError("Philippine mobile number must start with 09 or +639 (e.g., 09123456789).")
        raise ValueError("Invalid length: mobile numbers starting with 09 must be 11 digits (e.g., 09123456789).")
    return compact


VALID_ROOM_TYPES = {"lecture", "lab", "computer_lab"}
VALID_FACULTY_TYPES = {"full_time", "part_time"}
VALID_LOAD_UNITS = {"units", "hrs"}
VALID_SEMESTER_TERMS = {"1st", "2nd", "3rd semester", "1st Semester", "2nd Semester", "3rd Semester"}
VALID_DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat"}
VALID_BLOCK_STATUSES = {"DRAFT", "PUBLISHED", "ARCHIVED"}
VALID_CURRICULUM_TYPES = {"lecture", "lab", "computer_lab", "lec/lab", "both"}


def _sample_chars(chars: List[str]) -> str:
    return "".join(dict.fromkeys(chars))[:5]


def validate_academic_year(
    value: Optional[str],
    label: str = "Academic Year",
    allow_ay_prefix: bool = True,
    allow_unknown: bool = False,
) -> Optional[str]:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        raise ValueError(f"{label} is required (e.g., 2026-2027).")
    if allow_unknown and raw == "Unknown AY":
        return raw

    working = raw
    if re.match(r"^ay\b", working, re.IGNORECASE):
        if not allow_ay_prefix:
            raise ValueError('Enter only the two years without the "AY" prefix (e.g., 2026-2027).')
        working = re.sub(r"^ay\s+", "", working, flags=re.IGNORECASE).strip()

    if re.search(r"[A-Za-z]", working):
        raise ValueError(f"{label} cannot contain letters. Use YYYY-YYYY format (e.g., 2026-2027).")
    invalid_syms = re.findall(r"[^0-9\-]", working)
    if invalid_syms:
        raise ValueError(
            f"{label} cannot contain '{_sample_chars(invalid_syms)}'. Use digits and one hyphen (-), e.g., 2026-2027."
        )
    if not re.match(r"^\d{4}-\d{4}$", working):
        raise ValueError(f"{label} must follow YYYY-YYYY format with two 4-digit years (e.g., 2026-2027).")

    from_yr, to_yr = (int(p) for p in working.split("-"))
    if from_yr < 2000 or from_yr > 2100:
        raise ValueError("Enter a valid start year between 2000 and 2100 (e.g., 2026-2027).")
    if to_yr != from_yr + 1:
        raise ValueError(
            f"The second year ({to_yr}) must follow the first year ({from_yr} + 1 = {from_yr + 1})."
        )
    return raw


def validate_entity_title(
    value: Optional[str],
    label: str = "Name",
    min_len: int = 2,
    max_len: int = 255,
    allow_digits_only: bool = False,
    example: str = "",
) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    ex = f" (e.g., {example})" if example else ""
    if not trimmed:
        raise ValueError(f"{label} is required{ex}.")

    unsupported = re.findall(r"[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s.\-_/,&()'+#:]", trimmed)
    if unsupported:
        raise ValueError(
            f"{label} cannot contain unsupported symbols like '{_sample_chars(unsupported)}'."
        )
    if not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ0-9]", trimmed):
        raise ValueError(f"{label} cannot contain punctuation or symbols only{ex}.")
    if not allow_digits_only and not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]", trimmed):
        raise ValueError(f"{label} must include letters, not only numbers or symbols{ex}.")
    if len(trimmed) < min_len:
        raise ValueError(f"{label} must be at least {min_len} characters{ex}.")
    if len(trimmed) > max_len:
        raise ValueError(f"{label} must be at most {max_len} characters.")
    return trimmed


def validate_course_code(value: Optional[str], label: str = "Course Code") -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        raise ValueError(f"{label} is required (e.g., CC101A/B).")
    unsupported = re.findall(r"[^A-Za-z0-9\s.\-_/]", trimmed)
    if unsupported:
        raise ValueError(
            f"{label} cannot contain symbols like '{_sample_chars(unsupported)}'. Use letters, numbers, spaces, '-', '_', '/', or '.' only."
        )
    if not re.match(r"^[A-Za-z]", trimmed):
        raise ValueError(f"{label} must start with a letter (e.g., CC101A/B).")
    if len(trimmed) < 2:
        raise ValueError(f"{label} must be at least 2 characters.")
    if len(trimmed) > 40:
        raise ValueError(f"{label} must be at most 40 characters.")
    return trimmed


def validate_section_label(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    if not trimmed:
        return ""
    unsupported = re.findall(r"[^A-Za-z0-9\s.\-_]", trimmed)
    if unsupported:
        raise ValueError(
            f"Section cannot contain symbols like '{_sample_chars(unsupported)}'. Use letters, numbers, spaces, or hyphens (e.g., 1A, CS-3A)."
        )
    if not re.search(r"[A-Za-z0-9]", trimmed):
        raise ValueError("Section must include a letter or number (e.g., 1A, CS-3A).")
    if len(trimmed) > 30:
        raise ValueError("Section must be at most 30 characters.")
    return trimmed


def validate_int_bounds(value: Optional[int], label: str, min_val: int, max_val: int) -> Optional[int]:
    if value is None:
        return None
    if value < min_val:
        raise ValueError(f"{label} cannot be less than {min_val}. Enter a whole number from {min_val} to {max_val}.")
    if value > max_val:
        raise ValueError(f"{label} cannot exceed {max_val}. Enter a whole number from {min_val} to {max_val}.")
    return value


def validate_faculty_load_bounds(
    max_units: Optional[int],
    faculty_type: Optional[str],
    load_unit: Optional[str],
) -> Optional[int]:
    if max_units is None:
        return None
    effective_unit = (load_unit or "units").strip().lower()
    effective_type = (faculty_type or "full_time").strip().lower()
    if effective_unit == "hrs":
        upper = 20 if effective_type == "part_time" else 30
        label = "Maximum teaching hours"
    else:
        upper = 12 if effective_type == "part_time" else 18
        label = "Maximum subject units"
    return validate_int_bounds(max_units, label, 1, upper)


def validate_choice(value: Optional[str], allowed: set[str], label: str, case_sensitive: bool = False) -> Optional[str]:
    if value is None:
        return None
    trimmed = value.strip()
    lookup = trimmed if case_sensitive else trimmed.lower()
    valid_map = {v if case_sensitive else v.lower(): v for v in allowed}
    if lookup not in valid_map:
        raise ValueError(f"Invalid {label} '{trimmed}'. Allowed values: {', '.join(sorted(allowed))}.")
    return valid_map[lookup]


class UserBase(BaseModel):
    email: EmailStr
    first_name: str
    last_name: str
    contact_number: Optional[str] = None
    role: str
    department: Optional[str] = None
    sex: Optional[str] = None
    date_of_birth: Optional[date] = None
    profile_picture: Optional[str] = None

class UserCreate(UserBase):
    password: str

    @field_validator('email')
    @classmethod
    def normalize(cls, v):
        return normalize_email(v)

    @field_validator('first_name')
    @classmethod
    def check_first_name(cls, v):
        return validate_human_name(v, "First Name")

    @field_validator('last_name')
    @classmethod
    def check_last_name(cls, v):
        return validate_human_name(v, "Last Name")

    @field_validator('contact_number')
    @classmethod
    def check_contact_number(cls, v):
        return validate_ph_contact_number(v)

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

class VerificationChannels(BaseModel):
    email: bool = False
    sms: bool = False


class RegistrationResponse(UserResponse):
    """
    A new account, plus whether its verification code actually went anywhere.

    Declared as its own model rather than added to UserResponse: only
    registration has a delivery result to report, and the fields would be
    permanently null everywhere else UserResponse is returned. They must be
    declared somewhere, though -- an undeclared key is dropped by the response
    model without complaint, which is how the frontend came to be told a code
    had been sent regardless.
    """
    verification_sent: bool = False
    verification_channels: VerificationChannels = VerificationChannels()

class TokenData(BaseModel):
    email: Optional[str] = None

class VerifyOTP(BaseModel):
    email: str
    otp: str

class ForgotPassword(BaseModel):
    email: str


class ResendVerification(BaseModel):
    """
    A request for another verification code, optionally down a chosen channel.

    `channel` exists because "I never got the email" is the one problem the
    person hitting it can diagnose faster than the system can: they know
    whether it arrived, and the server only knows that a relay accepted it.
    Letting them pick SMS turns a dead end into a second attempt.
    """
    email: str
    channel: Literal["auto", "email", "sms"] = "auto"

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
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    contact_number: Optional[str] = None
    role: Optional[str] = None
    # Without this field Pydantic silently dropped `department` from every
    # update, so the admin UI's department control returned 200 and changed
    # nothing. Only administrators may set it -- see users.update_user.
    department: Optional[str] = None
    is_verified: Optional[bool] = None
    sex: Optional[str] = None
    date_of_birth: Optional[date] = None
    profile_picture: Optional[str] = None

    @field_validator('first_name')
    @classmethod
    def check_first_name(cls, v):
        return validate_human_name(v, "First Name")

    @field_validator('last_name')
    @classmethod
    def check_last_name(cls, v):
        return validate_human_name(v, "Last Name")

    @field_validator('contact_number')
    @classmethod
    def check_contact_number(cls, v):
        return validate_ph_contact_number(v)

    @field_validator('role')
    @classmethod
    def check_role(cls, v):
        return _validate_role(v)


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
    @field_validator("program_name")
    @classmethod
    def check_program_name(cls, v):
        return validate_entity_title(v, label="Program Name", min_len=2, max_len=255, example="BS Computer Science")

    @field_validator("academic_year")
    @classmethod
    def check_academic_year(cls, v):
        return validate_academic_year(v, label="Academic Year", allow_ay_prefix=True, allow_unknown=True)

    @field_validator("status")
    @classmethod
    def check_status(cls, v):
        return validate_choice(v, VALID_BLOCK_STATUSES, "curriculum status") if v is not None else v

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
    @field_validator("code")
    @classmethod
    def check_code(cls, v):
        return validate_course_code(v, label="Course Code")

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return validate_entity_title(v, label="Course Title", min_len=2, max_len=255, example="Introduction to Computing")

    @field_validator("units")
    @classmethod
    def check_units(cls, v):
        return validate_int_bounds(v, "Total units", 0, 24)

    @field_validator("lec_units")
    @classmethod
    def check_lec_units(cls, v):
        return validate_int_bounds(v, "Lecture units", 0, 12)

    @field_validator("lab_units")
    @classmethod
    def check_lab_units(cls, v):
        return validate_int_bounds(v, "Laboratory units", 0, 12)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_CURRICULUM_TYPES, "subject type")

    @field_validator("pre_requisite")
    @classmethod
    def check_prereq(cls, v):
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 100:
            raise ValueError("Prerequisite must be at most 100 characters.")
        return trimmed


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

    @field_validator("code")
    @classmethod
    def check_code(cls, v):
        return validate_course_code(v, label="Course Code")

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return validate_entity_title(v, label="Course Title", min_len=2, max_len=255, example="Introduction to Computing")

    @field_validator("units")
    @classmethod
    def check_units(cls, v):
        return validate_int_bounds(v, "Total units", 0, 24)

    @field_validator("lec_units")
    @classmethod
    def check_lec_units(cls, v):
        return validate_int_bounds(v, "Lecture units", 0, 12)

    @field_validator("lab_units")
    @classmethod
    def check_lab_units(cls, v):
        return validate_int_bounds(v, "Laboratory units", 0, 12)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_CURRICULUM_TYPES, "subject type")

    @field_validator("pre_requisite")
    @classmethod
    def check_prereq(cls, v):
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 100:
            raise ValueError("Prerequisite must be at most 100 characters.")
        return trimmed

class CurriculumResponse(CurriculumBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class RoomBase(BaseModel):
    name: str
    building: str
    capacity: int
    type: str

class RoomCreate(RoomBase):
    # Administrators only. A chair's room is always filed under their own
    # college, derived from the token -- if this were honoured for them, a chair
    # could create a laboratory owned by a college they do not belong to.
    department_id: Optional[int] = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return validate_entity_title(v, label="Room Name", min_len=1, max_len=100, allow_digits_only=True, example="LSB-204")

    @field_validator("building")
    @classmethod
    def check_building(cls, v):
        return validate_entity_title(v, label="Building", min_len=2, max_len=100, example="LSB Building")

    @field_validator("capacity")
    @classmethod
    def check_capacity(cls, v):
        return validate_int_bounds(v, "Capacity", 1, 200)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_ROOM_TYPES, "room type")


class RoomUpdate(BaseModel):
    name: Optional[str] = None
    building: Optional[str] = None
    capacity: Optional[int] = None
    type: Optional[str] = None
    # Reassigning ownership is an administrator action; ignored for other roles.
    department_id: Optional[int] = None

    @field_validator("name")
    @classmethod
    def check_name(cls, v):
        return validate_entity_title(v, label="Room Name", min_len=1, max_len=100, allow_digits_only=True, example="LSB-204")

    @field_validator("building")
    @classmethod
    def check_building(cls, v):
        return validate_entity_title(v, label="Building", min_len=2, max_len=100, example="LSB Building")

    @field_validator("capacity")
    @classmethod
    def check_capacity(cls, v):
        return validate_int_bounds(v, "Capacity", 1, 200)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_ROOM_TYPES, "room type")

class RoomResponse(RoomBase):
    id: int
    department_id: Optional[int] = None
    # Read from the Room.department_code property, so every consumer gets the
    # owning college without a second request.
    department_code: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class FacultyBase(BaseModel):
    first_name: str
    last_name: str
    email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    max_units: int = 18
    load_unit: Optional[str] = 'units'
    type: str = 'full_time'
    department_id: Optional[int] = None

class FacultyCreate(FacultyBase):
    @field_validator("first_name")
    @classmethod
    def check_first_name(cls, v):
        return validate_human_name(v, "First Name")

    @field_validator("last_name")
    @classmethod
    def check_last_name(cls, v):
        return validate_human_name(v, "Last Name")

    @field_validator("contact_number")
    @classmethod
    def check_contact_number(cls, v):
        return validate_ph_contact_number(v)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_FACULTY_TYPES, "employment type")

    @field_validator("load_unit")
    @classmethod
    def check_load_unit(cls, v):
        return validate_choice(v, VALID_LOAD_UNITS, "load unit") if v is not None else "units"

    @model_validator(mode="after")
    def check_load_bounds(self):
        if "max_units" not in self.model_fields_set:
            if self.load_unit == "hrs":
                self.max_units = 16 if self.type == "part_time" else 24
            else:
                self.max_units = 12 if self.type == "part_time" else 18
        else:
            validate_faculty_load_bounds(self.max_units, self.type, self.load_unit)
        return self


class FacultyUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    max_units: Optional[int] = None
    load_unit: Optional[str] = None
    type: Optional[str] = None
    department_id: Optional[int] = None

    @field_validator("first_name")
    @classmethod
    def check_first_name(cls, v):
        return validate_human_name(v, "First Name")

    @field_validator("last_name")
    @classmethod
    def check_last_name(cls, v):
        return validate_human_name(v, "Last Name")

    @field_validator("contact_number")
    @classmethod
    def check_contact_number(cls, v):
        return validate_ph_contact_number(v)

    @field_validator("type")
    @classmethod
    def check_type(cls, v):
        return validate_choice(v, VALID_FACULTY_TYPES, "employment type")

    @field_validator("load_unit")
    @classmethod
    def check_load_unit(cls, v):
        return validate_choice(v, VALID_LOAD_UNITS, "load unit")

    @model_validator(mode="after")
    def check_load_bounds(self):
        if self.max_units is not None:
            if self.type is not None and self.load_unit is not None:
                validate_faculty_load_bounds(self.max_units, self.type, self.load_unit)
            else:
                validate_int_bounds(self.max_units, "Maximum load", 1, 30)
        return self

class FacultyWorkWeek(BaseModel):
    """The Full-Time 40-hour duty week for a term. Absent for Part-Time."""
    term: str
    teaching_hours: float
    off_campus_hours: float
    consultation_hours: float
    office_hours: float
    total_hours: float


class FacultyResponse(FacultyBase):
    id: int
    # Teaching load, in hours per week, from the plotted schedule. This is the
    # institution's actual basis for load; the *_units fields below are academic
    # information only and are not what a chair is judged against.
    reg_hours: float = 0.0
    # None when no target applies: every Part-Time member (their figures are
    # unconfirmed) and any unrecognised term. Must not be rendered as 0.
    required_hours: Optional[float] = None
    load_status: Optional[str] = None  # UNDERLOAD | REGULAR | OVERLOAD
    # Exactly one of these is set, and only when a target exists.
    overload_hours: Optional[float] = None
    remaining_hours: Optional[float] = None
    part_time_ceiling_hours: Optional[float] = None
    exceeds_part_time_ceiling: bool = False
    work_week: Optional[FacultyWorkWeek] = None
    current_units: Optional[int] = 0
    remaining_units: Optional[int] = 18
    unavailability: Optional[List["FacultyUnavailabilityResponse"]] = []
    model_config = ConfigDict(from_attributes=True)

class SemesterBase(BaseModel):
    academic_year: str
    term: str
    is_active: bool = False

class SemesterCreate(SemesterBase):
    @field_validator("academic_year")
    @classmethod
    def check_academic_year(cls, v):
        return validate_academic_year(v, label="Academic Year", allow_ay_prefix=False)

    @field_validator("term")
    @classmethod
    def check_term(cls, v):
        return validate_choice(v, VALID_SEMESTER_TERMS, "term")


class SemesterUpdate(BaseModel):
    academic_year: Optional[str] = None
    term: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("academic_year")
    @classmethod
    def check_academic_year(cls, v):
        return validate_academic_year(v, label="Academic Year", allow_ay_prefix=False)

    @field_validator("term")
    @classmethod
    def check_term(cls, v):
        return validate_choice(v, VALID_SEMESTER_TERMS, "term")


class SemesterResponse(SemesterBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


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
    @field_validator("day_of_week")
    @classmethod
    def check_day(cls, v):
        return validate_choice(v, VALID_DAYS, "day of week")

    @field_validator("section")
    @classmethod
    def check_section(cls, v):
        return validate_section_label(v)

    @model_validator(mode="after")
    def check_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError(
                f"Schedule end time ({self.end_time.strftime('%I:%M %p')}) must be after start time ({self.start_time.strftime('%I:%M %p')})."
            )
        return self


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

    @field_validator("day_of_week")
    @classmethod
    def check_day(cls, v):
        return validate_choice(v, VALID_DAYS, "day of week")

    @field_validator("section")
    @classmethod
    def check_section(cls, v):
        return validate_section_label(v)

    @model_validator(mode="after")
    def check_time_order(self):
        if self.start_time is not None and self.end_time is not None and self.end_time <= self.start_time:
            raise ValueError(
                f"Schedule end time ({self.end_time.strftime('%I:%M %p')}) must be after start time ({self.start_time.strftime('%I:%M %p')})."
            )
        return self

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

    @field_validator("day_of_week")
    @classmethod
    def check_day(cls, v):
        return validate_choice(v, VALID_DAYS, "day of week")

    @model_validator(mode="after")
    def check_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError(f"Unavailability on {self.day_of_week} must end after it starts.")
        return self

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

    @field_validator("program_name")
    @classmethod
    def check_program_name(cls, v):
        return validate_entity_title(v, label="Program Name", min_len=2, max_len=255, example="BS Computer Science")

    @field_validator("academic_year")
    @classmethod
    def check_academic_year(cls, v):
        return validate_academic_year(v, label="Academic Year", allow_ay_prefix=True, allow_unknown=True)

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
    curriculum_id: Optional[int] = None
    room_id: Optional[int] = None
    faculty_id: Optional[int] = None
    section: Optional[str] = None
    ignore_schedule_id: Optional[int] = None

    @field_validator("day_of_week")
    @classmethod
    def check_day(cls, v):
        return validate_choice(v, VALID_DAYS, "day of week")

    @field_validator("section")
    @classmethod
    def check_section(cls, v):
        return validate_section_label(v)

    @model_validator(mode="after")
    def check_time_order(self):
        if self.end_time <= self.start_time:
            raise ValueError(
                f"Schedule end time ({self.end_time.strftime('%I:%M %p')}) must be after start time ({self.start_time.strftime('%I:%M %p')})."
            )
        return self

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
