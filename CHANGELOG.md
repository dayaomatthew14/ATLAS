# Changelog — ATLAS

All notable changes to the ATLAS Academic Timetabling System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-11-20

### Added
- **Flexible Midday Scheduling & Academic Periods**:
  - Removed the rigid 12:00 PM – 01:00 PM mandatory lunch break lock across the scheduler, conflict detector, timetable grid, and export generators.
  - Expanded generator and manual slot grids across all categories (80m, 120m, 240m, and CT 60m/90m/180m) to naturally support midday placements (e.g. 11:30 AM – 01:30 PM labs, 10:50 AM – 12:10 PM lectures).
  - Unlocked the 12:00 PM and 12:30 PM slot intervals on the interactive timetable grid so Program Chairs can click to quick-add classes at any time of day.
  - Reclassified Period 4 as a standard academic period (12:00 PM – 01:00 PM) on the timetable matrix.
  - Stopped deducting midday overlap minutes in teaching hours and schedule duration calculations (an 11:30–13:30 lab counts as 2.0 full teaching hours).
- **Converted Tutorial (CT) Matrix & Credited Hours Overrides**:
  - Added support for DLSAU Converted Tutorial load calculations based on `enrolled_students` tiers (Regular 13+, 9–12, 5–8, 1–4 students) and optional administrative `credited_hours_override`.
  - Added CT visual badges and accurate credited hours calculations in subject assignment modals.
- **Published Schedule Locks**:
  - Protected official published term schedules against accidental modification, regeneration, clearing, restoration, or Excel importing (`_assert_term_not_published`).
  - Added a `Published (Locked)` badge and disabled mutation buttons on the Schedules dashboard for published terms.
- **Multi-Tenant College Isolation & Privilege Safeguards**:
  - Prevented role escalation by Program Chairs; restricted user updates to the caller's college.
  - Scoped audit log clearing so College Deans only purge logs belonging to their own college.
  - Scoped term publishing conflict checks so unresolved conflicts in another department never block a college from publishing its timetable.

### Changed
- Calibrated Full-Time Probationary work-week duty breakdown to exactly 40.0 hours (24h teaching + 2.5h off-campus + 6.0h consultation + 7.5h office) across all terms.
- Simplified Assigned Subjects action controls by removing the delete button, focusing actions on assigning and reassigning professors safely.
- Auto-linked imported curriculum blocks to registered degree programs using program code matching.
- Updated Excel timetable export to split midday hours into regular 30-minute rows.

### Fixed
- Fixed phantom session-order conflicts when comparing multi-part single-row curriculum items.
- Fixed cross-term overlap comparisons in conflict detection by enforcing semester-id scoping.
- Fixed cascade deletion in SQLAlchemy models so removing a curriculum course cascades to its schedule entries.
- Fixed user password change and logout-all to re-issue valid session cookies for the active client device.

---

## [1.5.0] - 2026-10-26

### Added
- **Dean Institutional Administration (Deans as Admins)**:
  - Standardized the system on exactly **two roles**: `admin` (College Deans) and `program_chair` (Users / Program Chairs).
  - Pre-seeded dedicated Dean Administrator accounts for all 4 tertiary colleges at backend startup (`dean.cast@dlsau.edu.ph`, `dean.cbma@dlsau.edu.ph`, `dean.coed@dlsau.edu.ph`, `dean.cvmas@dlsau.edu.ph`) with password `DeanPassword123!`.
  - Configured environment variable `DEAN_SEED_PASSWORD` for initial credential customization.
  - Department-isolated user governance: Deans administer and verify Program Chair accounts and issue temporary password resets exclusively within their college.
  - Realigned the Dean Admin sidebar navigation to:
    - **Overview**: College-specific statistics and operational summaries.
    - **PEOPLE**: College `Users` administration.
    - **ACADEMIC STRUCTURE**: `Colleges and Programs`, `Curriculum`, and `Academic Terms`.
    - **OVERSIGHT**: College-scoped `Activity` audit logs.
- **Public Self-Registration Lockdown**:
  - Locked public user registration on `/api/auth/register` strictly to `program_chair` selecting their department.
  - Enforced HTTP 403 Forbidden rejection when attempting to self-register as an administrator.

- **General Education Subject Assignment & Override Confirmation**:
  - Permitted users (`program_chair` and `admin`) to assign General Education (non-major) subjects in both `Assigned Subjects` and Faculty management.
  - Added interactive confirmation modals in `AssignedSubjects.jsx` and `Teachers.jsx` that prompt for confirmation before any non-major subject assignment is overridden or committed.
  - Handled automatic assignment override in backend `POST /api/subject-offerings` when reassigning a curriculum subject to a different professor.
  - Added category filtering (`Major Subjects` vs `General Education (Gen Ed)`) and visual badges on the Assigned Subjects screen.
- **Scheduling Workflow & UI Enhancements**:
  - Allowed AI schedule generation to proceed even when there are unassigned subjects.
  - Fixed "Clear all" in Schedules weekly matrix to immediately clear active professor cards without requiring a page reload.
  - Streamlined the Weekly Timetable Matrix view by removing the redundant `Period / Time` column.

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
