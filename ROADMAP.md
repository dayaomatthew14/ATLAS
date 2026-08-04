# ATLAS: Academic Timetabling System — Product Roadmap

**De La Salle Araneta University - Tertiary Education**

---

## 🎯 Target Audience & Core Constraints
- **Target Users**: System Administrators, Program Chairs (CAST, CBMA, CVMAS, COED), and Coordinators.
- **Scope**: Tertiary Education Academic Scheduling, Curriculum Ingestion, Faculty Workload Management, Timetables, and Conflict Resolution.

---

## 🏆 Completed Release Milestones (v1.4.0 Live)

### Phase 1 — Project Initialization & Architecture [COMPLETED]
- [x] **Frontend Architecture**: Initialized React 18 SPA with Vite, Tailwind CSS, Lucide React icons, and custom light/dark theme switcher.
- [x] **Backend Architecture**: Built Python FastAPI REST API with structured routers (`routers/`), services (`services/`), database connection handlers (`database.py`), and model definitions (`models.py`).
- [x] **Database ORM**: Implemented SQLAlchemy 2.0 ORM supporting both SQLite (`atlas_v3.db`) for rapid development and PostgreSQL for production deployments.

### Phase 2 — Database Modeling & Auth [COMPLETED]
- [x] **Relational Schema**: Models for `User`, `Department`, `CurriculumBlock`, `Curriculum`, `Room`, `Faculty`, `FacultyUnavailability`, `Semester`, `SubjectOffering`, `Schedule`, `Conflict`, `SystemLog`, and `AIRule`.
- [x] **Security & Authentication**: Implemented OAuth2 password hashing with Bcrypt, JWT bearer token issuance, OTP email verification flow, session invalidation, and role management for official system users (`admin`, `program_chair`, `coordinator`).

### Phase 3 — Curriculum Excel Parser v1.4 [COMPLETED]
- [x] **Curriculum Block Isolation**: Ingests `.xlsx` files treating each file as a self-contained curriculum block identified by `Program Name + Academic Year`.
- [x] **Merge & Dynamic Header Parsing**: Unmerges cell ranges properly, dynamically detects columns per year/term block, and discards empty/totals noise rows.
- [x] **Duplicate Block Detection**: Prompts users when uploading duplicate blocks with overwrite option.

### Phase 4 — AI Scheduling Engine & Constraint Satisfaction [COMPLETED]
- [x] **Heuristic Generator**: Algorithmic schedule generator (`schedule_generator.py`) supporting lecture (room set to `NULL`) vs laboratory (requires `lab`/`computer_lab` rooms) scheduling.
- [x] **Faculty Workload Limit Checking**: Enforces max allowable teaching units per faculty member (`full_time` default 18 units, `part_time` customized). Emits `bumped_warnings` and `max_units_exceeded` conflicts when caps are violated.
- [x] **Unavailability Slots**: Integrates `FacultyUnavailability` day/time restrictions managed by Program Chairs to block schedule assignments.
- [x] **Conflict Panel & Resolution**: Interactive frontend drawer for reviewing unresolved conflicts with one-click automated solver handoff (`/api/ai-scheduler/solve-conflict`).

### Phase 5 — Multi-Department RBAC, UI Refinement & Export [COMPLETED]
- [x] **Department RBAC Isolation**: Enforces department filtering (`CAST`, `CBMA`, `CVMAS`, `COED`) across backend APIs and frontend dashboard views for authenticated roles.
- [x] **Timetable Grid & PDF/Excel Export**: Interactive weekly calendar grid with export triggers (`/api/schedules/export/pdf`, `/api/schedules/export/excel`).
- [x] **Audit Logging**: Comprehensive activity logging recorded in `system_logs` table for administrative oversight.
