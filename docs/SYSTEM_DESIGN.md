# System Architecture & Technical Design — ATLAS

**Academic Timetabling System (De La Salle Araneta University - Tertiary Education)**

---

## 1. Executive Summary & System Overview

**ATLAS** (Academic Timetabling System) is a specialized, web-based automated class schedule generation and curriculum management platform developed specifically for De La Salle Araneta University (DLSAU) Tertiary Education. It caters strictly to two authorized user roles:
1. **Administrator / College Dean** (`admin`) — Institutional administrators separated by academic department (`CAST`, `CBMA`, `COED`, `CVMAS`)
2. **User / Program Chair** (`program_chair`) — Departmental academic head & scheduling planner

Across university academic departments:
- **CAST** (College of Arts, Sciences, and Technology)
- **CBMA** (College of Business Management and Accountancy)
- **CVMAS** (College of Veterinary Medicine and Agricultural Sciences)
- **COED** (College of Education)

> [!IMPORTANT]
> **User Scope & Governance**:
> - Only College Dean Administrators (`admin`) and Program Chairs (`program_chair`) are authenticated users who log into and interact with ATLAS.
> - Deans do not self-register; their accounts are pre-seeded on startup as department administrators (`dean.cast@dlsau.edu.ph`, `dean.cbma@dlsau.edu.ph`, `dean.coed@dlsau.edu.ph`, `dean.cvmas@dlsau.edu.ph` / `DeanPassword123!`).
> - Self-registration is strictly restricted to Program Chairs selecting their designated college.
> - Faculty members do not access or log into the system; faculty records are managed as scheduling resources (teaching unit limits, unavailability slots, subject qualifications) by authorized users.

ATLAS replaces manual, error-prone timetabling spreadsheets with an algorithmic constraint-satisfaction engine, dynamic visual schedule calendars, automated Excel curriculum ingestion with block isolation, multi-department role-based access control (RBAC), and publication export capabilities (PDF/Excel).

---

## 2. High-Level System Architecture

ATLAS follows a modern decoupled architecture comprising a single-page application (SPA) frontend, a high-performance RESTful Python backend, and a relational database layer supporting both SQLite (local development) and PostgreSQL (production).

```mermaid
graph TD
    User["User Browser (Dean Administrator / Program Chair)"]
    
    subgraph Frontend ["Frontend (Vite + React SPA)"]
        UI["React 18 Components & UI Pages"]
        Router["React Router v6"]
        APIClient["Axios API Client (api.js)"]
        Toast["ToastProvider Context"]
    end
    
    subgraph Backend ["Backend (FastAPI + Python 3.10+)"]
        Main["FastAPI Application (main.py)"]
        AuthMiddleware["JWT Auth & Security (auth.py)"]
        
        subgraph Routers ["API Routers (/api/*)"]
            AuthR["auth_router.py"]
            CurrR["curriculum.py"]
            SchedR["schedules.py"]
            AIR["ai_scheduler.py"]
            RoomR["rooms.py"]
            FacR["faculty.py"]
            UserR["users.py"]
            SemR["semesters.py"]
            ConfR["conflicts.py"]
            OffR["subject_offerings.py"]
            LogR["logs.py"]
        end
        
        subgraph Services ["Core Logic Engines"]
            ExcelParser["Curriculum Excel Parser v1.4"]
            GenEngine["Schedule Generator (schedule_generator.py)"]
        end
        
        ORM["SQLAlchemy ORM 2.0"]
    end

    subgraph Database ["Database Layer"]
        DB[(SQLite / PostgreSQL Database)]
    end

    User <-->|HTTP / HTTPS| UI
    UI --> Router
    UI --> APIClient
    APIClient <-->|REST APIs / JSON| Main
    Main --> AuthMiddleware
    AuthMiddleware --> Routers
    Routers --> Services
    Routers --> ORM
    Services --> ORM
    ORM <-->|SQL Queries / Transactions| DB
```

---

## 3. Technology Stack

### Frontend
- **Framework**: React 18 with Vite (Ultra-fast build system & HMR)
- **Styling**: Vanilla CSS + Tailwind CSS (Utility classes & custom dark/light theme variables)
- **Icons**: Lucide React (`lucide-react`)
- **HTTP Client**: Axios with request/response interceptors for automatic JWT bearer token handling
- **Routing**: React Router DOM (`react-router-dom` v6)
- **Export Engines**: HTML-to-Canvas (`html2canvas`) and `jspdf` for visual schedule PDF export

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **ASGI Server**: Uvicorn (`uvicorn`)
- **ORM & Database Toolkit**: SQLAlchemy 2.0 (`sqlalchemy`)
- **Excel Ingestion**: OpenPyXL (`openpyxl`)
- **Data Validation**: Pydantic v2 (`pydantic`)
- **Security & Hashing**: Passlib with Bcrypt (`passlib[bcrypt]`), PyJWT (`pyjwt`), Python-Multipart (`python-multipart`)
- **Environment Management**: `python-dotenv`

### Database
- **Local Development**: SQLite (`backend/atlas_v3.db`) with auto-migration scripts.
  `DATABASE_URL` is left unset, which is what selects SQLite.
- **Production**: Railway PostgreSQL, supplied to the service as `DATABASE_URL`.

---

## 4. Component Breakdown & Data Flow

### 4.1 Authentication & Session Handling Flow

ATLAS utilizes JSON Web Tokens (JWT) for stateless authentication of Dean Administrators and Program Chairs.

```mermaid
sequenceDiagram
    autonumber
    actor AuthorizedUser as Authorized User (Dean Admin / Program Chair)
    participant Frontend as React App (Login.jsx)
    participant API as FastAPI (auth_router.py)
    participant Auth as Auth Module (auth.py)
    participant DB as Database (User table)

    AuthorizedUser->>Frontend: Enter credentials & click Login
    Frontend->>API: POST /api/auth/login (Form Data: username, password)
    API->>DB: Query user by email
    DB-->>API: Return user record & password hash
    API->>Auth: verify_password(password, password_hash)
    
    alt Invalid Credentials / Unauthorized Role
        Auth-->>API: Password Match Failed or Invalid Role
        API-->>Frontend: 404/401 Unauthorized Response
        Frontend-->>AuthorizedUser: Display Toast Error
    else Valid Credentials & Authorized Role
        Auth-->>API: Password Validated
        API->>Auth: create_access_token(data={"sub": email, "role": role})
        Auth-->>API: Return Encoded JWT Token String
        API-->>Frontend: 200 OK { access_token, token_type, role, user }
        Frontend->>Frontend: Save atlas_token, atlas_role in localStorage
        Frontend->>Frontend: Redirect to /dashboard
    end
```

### 4.2 Curriculum Ingestion (v1.4 Block Isolation Engine)

Curriculum parsing ingests `.xlsx` files uploaded by Program Chairs or Admins.

```mermaid
flowchart TD
    A[Program Chair Uploads .xlsx File] --> B[POST /api/curriculum/upload]
    B --> C[OpenPyXL Loads Workbook]
    C --> D[Identify Sheet with University Logo & Name]
    D --> E[Extract Header: Program Name & Academic Year]
    E --> F{Block Exists in Database?}
    
    F -- Yes & Overwrite Not Confirmed --> G[Return 400 Duplicate Block Warning]
    F -- Yes & Overwrite Confirmed --> H[Purge Existing Block & Subjects]
    F -- No --> I[Create New CurriculumBlock Record]
    
    H --> I
    I --> J[Unmerge Cells & Fill Merge Ranges Only]
    J --> K[Scan Year/Term Zones Sequentially]
    K --> L[Detect Dynamic Columns per Zone Header]
    L --> M[Validate Subject Rows: Non-empty Code & Numeric Units]
    M --> N[Filter out Empty Rows, Totals Rows & Headers]
    N --> O[Save Curriculum Entities linked to block_id & department_id]
    O --> P[Return Ingestion Summary to Frontend]
```

### 4.3 Automated AI Schedule Generation Engine

The scheduling service (`schedule_generator.py`) operates via a constraint-satisfaction heuristic algorithm.

```mermaid
flowchart TD
    A[Program Chair clicks 'Generate Schedule'] --> B[POST /api/ai-scheduler/generate/{semester_id}]
    B --> C[Verify Active Semester & Dept Permission]
    C --> D[Purge Previous Unlocked Draft Schedules & Unresolved Conflicts for Selected Faculty Records]
    E --> F[Load Faculty Workload Limits & Faculty Unavailability Slots]
    D --> E[Fetch Subject Offerings for Department & Active Semester]
    F --> G[Load Rooms Grouped by Type: lecture vs lab/computer_lab]
    
    G --> H[Loop Through Subject Offerings]
    H --> I{Subject Type?}
    
    I -- Lecture --> J[Test Day Pairs: MW, TTh, FS across LECTURE_SLOTS]
    J --> K[Check Faculty Unavailability & Schedule Overlaps]
    K --> L{Valid Slot Found?}
    L -- Yes --> M[Create Draft Schedule Record: room_id = NULL]
    L -- No --> N[Record Conflict: unplaced_lecture]
    
    I -- Laboratory --> O[Test Day Pairs across LAB_SLOTS]
    O --> P[Filter Valid Lab Rooms: type in lab, computer_lab]
    P --> Q[Check Faculty Record & Room Conflicts]
    Q --> R{Valid Room + Slot Found?}
    R -- Yes --> S[Create Draft Schedule Record: room_id = Room.id]
    R -- No --> T[Record Conflict: unplaced_lab / no_lab_room_available]
    
    M --> U[Update Faculty Teaching Hours Used]
    S --> U
    N --> V[Commit Pending Schedules & Conflicts to DB]
    T --> V
    U --> V
    V --> W[Return Generation Summary & Workload Warnings]
```

---

## 5. Role-Based Access Control (RBAC) Matrix

ATLAS enforces RBAC both on the backend (FastAPI dependency injection via `Depends(auth.get_current_user)`) and on the frontend (React `ProtectedRoute` wrappers).

The system supports exactly **two authenticated user roles**:

| Feature / Navigation Rail | Dean Administrator (`admin`) | Program Chair (`program_chair`) |
| :--- | :---: | :---: |
| **Overview (`/dashboard/overview`)** | ✅ College Statistics & Feeds | ❌ (Redirects to Schedules) |
| **PEOPLE: Users (`/dashboard/users`)** | 🛡️ Manage Dept Program Chairs | ❌ Restricted |
| **ACADEMIC STRUCTURE: Colleges & Programs (`/dashboard/colleges`)** | ✅ Manage Dept Degree Programs | ❌ Restricted |
| **ACADEMIC STRUCTURE: Curriculum (`/dashboard/curriculum`)** | ✅ Curate Dept Curricula & Uploads | ✅ View & Review Curriculum |
| **ACADEMIC STRUCTURE: Academic Terms (`/dashboard/semesters`)** | 👁️ View Active Academic Term | 👁️ View Active Academic Term |
| **OVERSIGHT: Activity (`/dashboard/activity`)** | ✅ College-Scoped Audit Logs | ❌ Restricted |
| **TIMETABLE: Schedules (`/dashboard/schedules`)** | 👁️ View Dept Timetables | ✅ Full Planning & Editing |
| **TIMETABLE: AI Generator (`/dashboard/ai-scheduler`)** | ❌ (Chair Operational Tool) | ✅ Execute AI Generator Runs |
| **TIMETABLE: Conflicts (`/dashboard/conflicts`)** | ❌ (Chair Operational Tool) | ✅ Resolve Allocation Conflicts |
| **RESOURCES: Faculty (`/dashboard/teachers`)** | ❌ (Chair Operational Tool) | ✅ Manage Faculty Profiles & Slots |
| **RESOURCES: Rooms (`/dashboard/rooms`)** | ❌ (Chair Operational Tool) | ✅ View Campus Classrooms & Labs |
| **Export Schedules (PDF / Excel)** | ✅ Full | ✅ Full |

---

## 6. Error Handling & Security Architecture

1. **Global Exception Handler**: FastAPI traps unhandled runtime exceptions (`backend/main.py`), returning clean JSON responses with standard status codes (400, 401, 403, 404, 422, 500). In production (`ENV=production`), detailed exception tracebacks are suppressed from API responses to prevent information leakage.
2. **CORS Security**: Cross-Origin Resource Sharing is strictly constrained to configured origins (`ALLOWED_ORIGINS` environment variable) and standard localhost ports (`5173`, `5174`, `3000`), with wildcard regex matching for production Vercel previews (`https://.*\.vercel\.app`).
3. **Database Migration Safety**: The database initializer (`init_db()`) inspects table schemas on application startup using native database PRAGMA queries (SQLite) or `ALTER TABLE` DDL queries (PostgreSQL), safely adding missing columns without dropping data.
