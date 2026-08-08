# Changelog — ATLAS

All notable changes to the ATLAS Academic Timetabling System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.0] - 2026-08-02

### Added
- **Official User Roles Standardization**:
  - Enforced Role-Based Access Control (RBAC) across three authenticated user roles: System Administrator (`admin`), Program Chair (`program_chair`), and Coordinator (`coordinator`).
  - Clarified Faculty profiles as scheduling resource records managed by authorized users.
- **Curriculum Excel Parser v1.4**:
  - Implemented Block Isolation (`Program Name + Academic Year` key) ensuring uploaded curriculum files remain completely self-contained.
  - Added Duplicate Block Detection UI modal prompting users to replace or cancel duplicate curriculum imports.
  - Precise cell unmerging algorithm avoiding illegal forward-filling.
- **AI Scheduler Engine Enhancements**:
  - Lecture vs. Laboratory scheduling distinction: Lecture courses scheduled with unassigned rooms (`room_id = NULL`), while laboratory courses mandate lab/computer lab room availability.
  - Enforced strict faculty workload caps (`max_units`) with automatic emission of `bumped_warnings` and conflict logging.
  - One-click automated conflict solver endpoint (`/api/ai-scheduler/solve-conflict`).
- **Export & Timetable Features**:
  - Export weekly schedules to PDF (`jspdf` + `html2canvas`) and Excel (`openpyxl`).
  - Interactive Conflict Resolution Panel drawer in React frontend.
  - Lock schedule feature (`is_locked = True`) protecting draft rows from AI regenerations.
- **Technical Documentation Suite**:
  - Added comprehensive `docs/SYSTEM_DESIGN.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/USER_GUIDE.md`, and `docs/SETUP.md`.

### Changed
- Refactored `schedule_generator.py` to use expanded 1.5-hour lecture slots and 2.0-hour lab slots across MW, TTh, and FS day pairs.
- Upgraded authentication flow with session version invalidations and auto-healing role assignments (`admin`, `program_chair`, `coordinator`).

### Fixed
- Fixed database column migration warnings for SQLite and PostgreSQL in `backend/main.py`.
- Fixed CORS wildcard regex matching for Vercel preview environments.

---

## [1.0.0] - 2026-05-15

### Added
- Initial release of ATLAS Academic Timetabling System.
- Basic CRUD operations for Subjects, Rooms, Faculty Records, Semesters, and Schedules.
- FastAPI backend setup with SQLAlchemy ORM and SQLite.
- React 18 SPA with Tailwind CSS and Lucide React.
