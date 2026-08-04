# REST API Documentation — ATLAS

**Academic Timetabling System (De La Salle Araneta University - Tertiary Education)**

---

## 1. Overview & Standard Conventions

ATLAS exposes a RESTful API powered by FastAPI. All requests and responses use standard HTTP status codes and JSON payloads unless streaming binary files (PDF/Excel exports or static media).

> [!IMPORTANT]
> **Authorized System User Roles**:
> System access is strictly restricted to three authenticated user roles:
> 1. `admin` (System Administrator)
> 2. `program_chair` (Program Chair)
> 3. `coordinator` (Coordinator)

### Base URL
- **Local Development**: `http://localhost:8000`
- **Production API**: `https://<your-backend-domain>/`

### Global Response Headers & CORS
All API endpoints accept requests from trusted origins (`ALLOWED_ORIGINS` or `https://*.vercel.app`) with credentials enabled.

### Authentication Header
Protected endpoints require a standard OAuth2 Bearer token in the request header:
```http
Authorization: Bearer <access_token_jwt>
```

---

## 2. API Endpoints Reference

### 2.1 Authentication (`/api/auth`)

#### `POST /api/auth/login`
Authenticates a System Administrator, Program Chair, or Coordinator and issues a JWT token.
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body Parameters**:
  - `username` (string, required): User email address.
  - `password` (string, required): Account password.
  - `remember_me` (boolean, optional): Session duration extension flag.
- **Success Response (200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "role": "program_chair",
    "user": {
      "id": 1,
      "email": "chair@dlsau.edu.ph",
      "first_name": "Maria",
      "last_name": "Santos",
      "department": "CAST",
      "role": "program_chair"
    }
  }
  ```
- **Error Responses**: `404 Not Found` (User not found), `401 Unauthorized` (Invalid credentials or unauthorized role).

#### `POST /api/auth/register`
Registers a new authorized user account.
- **Auth**: None (Public / Seeding)
- **Body (JSON)**: `first_name`, `last_name`, `email`, `password`, `role` (`admin` | `program_chair` | `coordinator`), `department`, `contact_number`.

#### `GET /api/auth/me`
Retrieves currently authenticated user profile.
- **Auth**: Bearer Token required
- **Success Response (200 OK)**: Full user entity details.

#### `POST /api/auth/upload-profile-picture`
Uploads a user avatar image (`.png`, `.jpg`, `.jpeg`).
- **Content-Type**: `multipart/form-data`

---

### 2.2 Curriculum Management (`/api/curriculum`)

#### `POST /api/curriculum/upload`
Uploads and parses an `.xlsx` curriculum file using the v1.4 Block Isolation parser.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Content-Type**: `multipart/form-data`
- **Form Parameters**:
  - `file` (UploadFile, required): The `.xlsx` curriculum file.
  - `confirm_replace` (boolean, optional, default `False`): If true, overwrites existing block matching program + academic year.
- **Success Response (200 OK)**:
  ```json
  {
    "message": "Curriculum imported successfully",
    "block_id": 4,
    "program_name": "BACHELOR OF SCIENCE IN COMPUTER SCIENCE",
    "academic_year": "AY 2026",
    "imported_count": 42
  }
  ```
- **Error Response (400 Bad Request)**:
  ```json
  {
    "detail": "DUPLICATE_BLOCK: Block for 'BACHELOR OF SCIENCE IN COMPUTER SCIENCE (AY 2026)' already exists."
  }
  ```

#### `GET /api/curriculum/blocks`
Retrieves curriculum blocks filtered by department.
- **Query Parameters**: `department_id` (int, optional).

#### `PUT /api/curriculum/blocks/{block_id}/status`
Updates status of a curriculum block (`DRAFT`, `PUBLISHED`, `ARCHIVED`).

---

### 2.3 Room Management (`/api/rooms`)

#### `GET /api/rooms/`
Lists all physical rooms in the system.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Response**: Array of Room objects (`id`, `name`, `building`, `capacity`, `type`).

#### `POST /api/rooms/`
Creates a new room entity.
- **Body (JSON)**:
  ```json
  {
    "name": "CLab 1",
    "building": "Jose Rizal Hall",
    "capacity": 40,
    "type": "computer_lab"
  }
  ```

#### `PUT /api/rooms/{room_id}` & `DELETE /api/rooms/{room_id}`
Updates or deletes a specific room record.

---

### 2.4 Faculty Record Management (`/api/faculty`)

> [!NOTE]
> Endpoints under `/api/faculty` manage teaching staff resource profiles (workload limits, unavailability slots), which are configured by Program Chairs and Coordinators. Faculty members do not log into these endpoints.

#### `GET /api/faculty/`
Lists faculty resource records for the user's department.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Response**: Array of Faculty objects with department and unavailability relationships.

#### `POST /api/faculty/`
Creates a new faculty record.
- **Body (JSON)**: `first_name`, `last_name`, `email`, `contact_number`, `max_units`, `type` (`full_time` | `part_time`), `department_id`.

#### `GET /api/faculty/{id}/unavailability` & `POST /api/faculty/{id}/unavailability`
Manages faculty time slots when a faculty member is unavailable for teaching (`day_of_week`, `start_time`, `end_time`).

---

### 2.5 Subject Offerings (`/api/subject-offerings`)

#### `GET /api/subject-offerings/`
Lists faculty-to-curriculum subject assignments for a given semester.
- **Query Parameters**: `semester_id` (int), `faculty_id` (int, optional).

#### `POST /api/subject-offerings/assign-bulk`
Bulk assigns faculty members to curriculum subjects for an active semester.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Body (JSON)**:
  ```json
  {
    "semester_id": 1,
    "assignments": [
      { "faculty_id": 3, "curriculum_id": 12 },
      { "faculty_id": 3, "curriculum_id": 15 }
    ]
  }
  ```

---

### 2.6 AI Schedule Generator (`/api/ai-scheduler`)

#### `POST /api/ai-scheduler/generate/{semester_id}`
Triggers the algorithmic constraint-satisfaction schedule generator.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Path Parameter**: `semester_id` (int)
- **Body (JSON)**:
  ```json
  {
    "faculty_ids": [1, 2, 3, 5],
    "auto_bump_units": false
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "msg": "Schedule generation completed",
    "generated": 14,
    "unplaced_count": 1,
    "unplaced_items": [
      {
        "faculty": 5,
        "curriculum_id": 22,
        "subject": "CS301",
        "part_type": "lab",
        "reason": "CS301 could not be scheduled because no laboratory room was available.",
        "conflict_id": 8
      }
    ],
    "skipped_gened": 0,
    "workload_warnings": []
  }
  ```

#### `GET /api/ai-scheduler/conflicts`
Fetches unresolved conflict items generated by the scheduling engine.

---

### 2.7 Schedules Management (`/api/schedules`)

#### `GET /api/schedules/`
Retrieves schedules with filters.
- **Auth**: Bearer Token required (`admin`, `program_chair`, `coordinator`)
- **Query Parameters**: `semester_id` (int), `department_id` (int), `faculty_id` (int), `room_id` (int), `status` (`draft` | `published`).

#### `GET /api/schedules/grid`
Returns weekly matrix calendar grid representation of active schedules.

#### `PUT /api/schedules/lock/{id}`
Locks a schedule item to prevent deletion during future AI regenerations.

#### `POST /api/schedules/publish`
Publishes draft schedules for the specified semester for official departmental use.

#### `GET /api/schedules/export/pdf` & `GET /api/schedules/export/excel`
Generates and downloads printable PDF or Excel timetable reports.

---

### 2.8 Semesters (`/api/semesters`)

#### `GET /api/semesters/` & `POST /api/semesters/`
Retrieves or creates academic semester terms.

#### `PUT /api/semesters/{id}/activate`
Sets the specified semester as the system's active semester (`admin` only).

---

### 2.9 User Management (`/api/users`)

#### `GET /api/users/`, `POST /api/users/`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`
Admin-only endpoints for managing system user accounts (`admin`, `program_chair`, `coordinator`) and department assignments.

---

### 2.10 System Audit Logs (`/api/logs`)

#### `GET /api/logs/`
Retrieves audit logs tracking operational actions (schedule generation, file uploads, user account management, conflict resolutions).
