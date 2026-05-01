# ATLAS: Academic Timetabling System (DLSAU Edition)
**Strictly for Program Chairs of De La Salle Araneta University - Tertiary Education**

### Core Constraints
- **Target Users**: Strictly Program Chairs (CAST, CBMA, CVMAS, COED).
- **Scope**: Tertiary Education Academic Scheduling.

## 🚀 Achievements to Date (Completed)

### 1. Project Initialization & Architecture
* **Frontend**: Initialized a React SPA using Vite, configured with Tailwind CSS for styling and Lucide React for UI icons.
* **Backend**: Set up a Python backend with a clear directory structure for routing, models, schemas, and database configuration.
* **Database**: Configured SQLAlchemy ORM with a SQLite database (`atlas.db`) for rapid development and defined the initial schema.

### 2. Database Schema & Modeling
* Designed and implemented comprehensive relational models (`models.py`):
  * **Users & Roles**: Support for Admin, Program Chair, Faculty, and Student roles.
  * **Academic Entities**: Models for Departments, Subjects (Lecture/Lab), and Rooms.
  * **Scheduling Entities**: Semesters, Schedules, and Conflict tracking models.

### 3. Authentication & Security
* Implemented user authentication flow on the backend (`auth.py`, `auth_router.py`).
* Created a functional Login page on the frontend (`Login.jsx`).
* Basic token management and role retrieval integrated into the frontend workflow.

### 4. User Interface Foundation
* **Landing Page**: Built an introductory landing page (`Landing.jsx`).
* **Dashboard Shell**: Created a responsive layout for the main application (`Dashboard.jsx`) with role-aware navigation and functional nested routing.

### 5. Core Entity Management (Frontend)
* **CRUD Interfaces**: Built data management tables and modals for Subjects, Rooms, Students, and Teachers.
* **API Utility**: Implemented a centralized API client with JWT handling and automatic session management.

### 6. Scheduling Engine & AI Simulation (Frontend)
* **Dynamic Calendar**: Developed a date-driven calendar with month navigation and dynamic grid rendering.
* **AI Generation UI**: Built the complete configuration dashboard and simulation sequence for automated scheduling.
* **Conflict Panel**: Implemented an interactive sidebar for detecting and resolving overlapping class schedules.

### 7. Departmental Branding & RBAC (Frontend)
* **University Branding**: Tailored the system for De La Salle Araneta University - Tertiary Education.
* **Role Enforcement**: Implemented dynamic UI filtering for Program Chairs vs Faculty vs Admins.
* **Data Integration**: Successfully decoupled mock data to prepare for production API consumption.
  * **Full System Interactivity**: Verified and wired every single button, toggle, and form to its respective backend endpoint for a 100% functional experience.

---

## 📅 Upcoming Sprints & Milestones

### Sprint 1 & 2: Core Data APIs & Department Dashboards
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Fully transition from mock data to real database interactions, separated securely into 4 department workspaces (CAST, CBMA, CVMAS, COED).*

* **Backend Track (DE GUZMAN) [COMPLETED]**:
  * ✅ Create `department_data.py` router.
  * ✅ Implement RESTful API endpoints for Subjects, Rooms, Teachers, and Schedules.
  * ✅ **Critical:** Enforce Department Filtering. Ensure APIs strictly return data matching the authenticated user's department.
  * ✅ Add robust data validation and error handling.

* **Frontend Track (DAYAO) [COMPLETED]**:
  * ✅ Update `Dashboard.jsx` top navigation to proudly display the user's Department (e.g., "CAST Dashboard").
  * ✅ Remove temporary "mock data" placeholders from `Schedules.jsx` and other dashboard views.
  * ✅ Wire up all frontend tables and calendars to the new backend endpoints to display real, department-specific data.

### Sprint 3: AI-Driven Schedule Generation & Conflict Resolution
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Fully automate the creation of optimal class schedules while dynamically preventing overlaps and constraints.*

* **Backend Track (DE GUZMAN) [COMPLETED]**:
  * ✅ **Automated Generation Engine (AI)**: Develop an algorithmic/AI logic that ingests available faculty, rooms, subjects, and generates an optimal schedule.
  * ✅ Develop heuristic logic to detect schedule conflicts (e.g., room double-booking, faculty time overlaps).
  * ✅ Enable the algorithm to attempt self-correction via backtracking; populate the `conflicts` database table for issues requiring human intervention.

* **Frontend Track (DAYAO) [COMPLETED]**:
  * ✅ Build the "Generate Schedule" dashboard where parameters are reviewed, and the automated AI sequence is triggered asynchronously.
  * ✅ Create a conflict resolution interface or dashboard notifications for schedule managers to review what the AI couldn't self-resolve.
  * ✅ Highlight generated and conflicting schedules visually on the calendar view.

### Sprint 4: Role-Based Access Control (RBAC) & UI Refinement
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Secure the application based on user roles and polish the user experience.*

* **Backend Track (DE GUZMAN) [COMPLETED]**:
  * ✅ Enforce strict RBAC on all API endpoints (Admin vs Program Chair vs Faculty).

* **Frontend Track (DAYAO) [COMPLETED]**:
  * ✅ Tailor the dashboard UI based on the logged-in user's specific role (Admin vs Program Chair vs Faculty).
  * ✅ Polish UI/UX, add global loading states, and handle edge cases gracefully.

### Sprint 5: Production Readiness & Deployment
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Prepare the application for real-world usage.*

* **Backend Track (DE GUZMAN) [COMPLETED]**:
  * ✅ Finalize database migrations and write integration tests.
  * ✅ Set up Docker containerization and CI/CD pipelines.

* **Frontend Track (DAYAO) [COMPLETED]**:
  * ✅ Conduct final UI testing across devices.
  * ✅ Configure Vite deployment builds and environment variables for production.


---

### Sprint 6: Advanced Management & AI Operations
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Transition high-fidelity UI actions into fully functional backend services.*

* **Backend Track (DE GUZMAN)**:
  * ✅ **System Logs API**: Implement `GET /logs` endpoint with filtering support (Success, Warning, Error) to populate the new System Logs page.
  * ✅ **AI Conflict Auto-Resolver**: Develop an endpoint that takes a list of conflicts and automatically attempts to relocate them to the nearest available room/time slot.
  * ✅ **Official PDF Export**: Integrate a PDF generation library to convert digital schedules into university-standard printable documents.
  * ✅ **Faculty Notification System**: Build a notification dispatcher (Email/Internal) for the "Notify All Faculty" action.
  * ✅ **Excel Processing Engine**: Implement an upload handler for the "Import from Excel" feature, including data validation for bulk schedule insertion.
  * ✅ **AI Rule Persistence**: Create a schema and API to store and retrieve "AI Scheduling Rules" (e.g., specific faculty time preferences).

* **Frontend Track (DAYAO) [COMPLETED]**:
  * ✅ Upgraded Typography & Readability across all management modules (Big Fonts).
  * ✅ Designed and linked the System Logs monitoring interface.
  * ✅ **Functional Quick Actions**: Implemented backend integration for Auto-Resolve, PDF Export, and Faculty Notifications.
  * ✅ **Dynamic Data Integration**: Enabled functional Excel Import and AI Rule configuration buttons.
  * ✅ Cleaned up navigation by removing redundant "Colleges/Sync" modules.

---

### Sprint 7: Intelligent Scheduling Engine Upgrade
*Status: Frontend [COMPLETED] | Backend [COMPLETED]*
*Objective: Apply proven scheduling logic to ATLAS — introducing faculty unavailability constraints, smart AI suggestions, live conflict tracking, proper section management, and a fully corrected schedule generation engine.*

* **Backend Track (DE GUZMAN)**:
  * ✅ **Bug Fix — Generator Return Key**: Fix the `conflicts_found` key mismatch in `ai_scheduler.py` (generator returns `conflicts` list, not `conflicts_found` integer). This is a critical runtime crash.
  * ✅ **Faculty Unavailability Model**: Add a `FacultyUnavailability` table to store per-faculty blocked time windows (day + start/end time). Add full CRUD endpoints under `/api/faculty/{id}/unavailability`.
  * ✅ **Generator Upgrade — Respect Unavailability**: Update `schedule_generator.py` to check `FacultyUnavailability` records inside `is_overlap()` so the AI never assigns a faculty to a blocked time slot.
  * ✅ **Generator Upgrade — Proper Conflict Saving**: Fix the `pass` placeholder in the generator so unresolvable conflicts are correctly written to the `conflicts` table.
  * ✅ **AI Suggestions Endpoint**: Implement `GET /api/schedules/suggestions` that returns a list of valid, conflict-free assignment options (faculty + room + time slot) for a given subject and semester.
  * ✅ **Live Conflict Count Endpoint**: Implement `GET /api/conflicts/count` that returns the total number of unresolved conflicts for the active semester — scoped to the Program Chair's department.
  * ✅ **Section as Proper Entity**: Add a `Section` model (`name`, `year_level`, `number_of_students`, `department_id`, `curriculum`) and full CRUD endpoints under `/api/sections`. Keep backward compatibility with the existing `schedule.section` string field.

* **Frontend Track (DAYAO)**:
  * ✅ **Faculty Unavailability UI**: Add a "Blocked Times" panel inside the Faculty/Teachers management page. Allow Program Chairs to add, view, and remove unavailability windows per faculty member.
  * ✅ **AI Suggestions Sidebar**: When assigning a subject to a schedule slot, show a suggestions panel that lists only valid, conflict-free options — mirroring the "Possible Assignments" sidebar seen in best-practice scheduling systems.
  * ✅ **Live Conflict Counter Badge**: Display a real-time conflict count badge on the Dashboard and Schedules page header, pulling from `GET /api/conflicts/count`.
  * ✅ **Faculty Load Tracker**: Add a visual load indicator per faculty member (current units vs. max units) on the Teachers page — highlight overloaded faculty in a warning state.

---

### Sprint 8: High-Fidelity UI Harmonization
*Status: In Progress*
*Objective: Propagate the "ATLAS Premium" design language across all management modules and stabilize core administrative CRUD operations.*

* **Backend Track (DE GUZMAN)**:
  * ✅ **CRUD Stability Audit**: Finalize and verify delete/edit logic for Rooms, Sections, and Teachers to ensure cascading integrity.
  * ✅ **Departmental Metadata**: Enhance the Login/Auth response to include more granular departmental info for UI personalization.
  * ✅ **Log Enrichment**: Expand activity logging to capture detailed state changes (old value vs. new value).

* **Frontend Track (DAYAO)**:
  * ✅ **Premium Design Propagation**: Apply the glassmorphic, high-contrast UI style from the Dashboard to the Sections, Rooms, and Professors pages.
  * ✅ **Layout Maximization**: (COMPLETED) Overhaul the header and page containers to support ultra-wide displays and improved spacing.
  * ✅ **Enhanced Feedback System**: Standardize toast notifications and loading states across all bulk operations.

---

### Sprint 9: Curriculum Precision & Data Stabilization
*Status: COMPLETED*
*Objective: Ensure 100% accuracy in curriculum imports and provide a high-fidelity visual representation of academic flowcharts.*

* **Backend Track (DE GUZMAN)**:
  * ✅ **Robust Excel Parsing Engine**: (COMPLETED) Overhauled heuristic parser with context-aware tracking for year/semester and robust numeric handling (parentheses, symbols).
  * ✅ **Import Validation & "Dry Run" API**: (COMPLETED) Implemented `/import?dry_run=true` to return a structured validation report before saving.
  * ✅ **Structured Prerequisite Mapper**: (COMPLETED) Improved parsing and normalization of prerequisite strings for future relational use.

* **Frontend Track (DAYAO)**:
  * ✅ **Multi-Step Import Wizard**: (COMPLETED) Implemented a premium review modal (Upload -> Review Grid -> Commit) to allow data verification before database entry.
  * ✅ **Flowchart Visual Accuracy**: (COMPLETED) Updated UI to reflect precise year/semester groupings based on new context-aware parsing results.
  * ✅ **Data Integrity Flags**: (COMPLETED) Integrated visual warning indicators for missing units or duplicate subjects within the import review grid.
  * **Prerequisite Flow Visualization**: (PLANNED) Visual highlighting of prerequisite paths on subject hover.
 
 
### Sprint 10: Advanced Zonal Parsing & Structural Integrity
*Status: COMPLETED*
*Objective: Implement the definitive Backend Logic v1.4 to achieve absolute precision in curriculum extraction across heterogeneous department formats.*
 
* **Backend Track (DE GUZMAN)**:
  * ✅ **Curriculum Block Isolation (Step 0)**: (COMPLETED) Implemented strict one-file-one-block logic with automated Program Name + AY identity detection.
  * ✅ **Strict Zonal Parser v1.4**: (COMPLETED) Implemented surgical merged-cell handling using openpyxl metadata to eliminate "None" hallucinations.
  * ✅ **Scoped Deduplication Engine**: (COMPLETED) Added consecutive-only deduplication to collapse artifacts while preserving legitimate repeats across academic terms.
  * ✅ **Grand Total Cross-Validation**: (COMPLETED) Automated comparison between parsed subject totals and Excel Summary tables with explicit discrepancy reporting.
  * ✅ **Diagnostic Hardening**: (COMPLETED) Integrated real-time row-level logging for structural transparency and rapid troubleshooting.
 
* **Integration Track (DE GUZMAN & DAYAO)**:
  * ✅ **Zero-Conflict Handshake**: (COMPLETED) Aliased backend field keys (pre_requisites, year, semester) to match frontend state perfectly.
  * ✅ **Schema-Perfect Reporting**: (COMPLETED) Expanded ImportSummary model to surface categorical unit breakdowns in the Review UI.
 
 
### Sprint 11: Intelligent Scheduling & Conflict Automation
*Status: COMPLETED*
*Objective: Stabilize the automated scheduling engine and provide high-fidelity interactive controls for conflict resolution.*
 
* **Backend Track (DE GUZMAN)**:
  * ✅ **Real-time Conflict API**: (COMPLETED) Implemented a high-performance POST endpoint for live overlap detection across faculty, rooms, and sections.
  * ✅ **Intelligent Auto-Resolver**: (COMPLETED) Enhanced the recommendation engine with multi-strategy resolution (relocation, room-swapping, and faculty validation).
  * ✅ **Schedule Snapshot & Locking**: (COMPLETED) Implemented an is_locked state for schedules with strict API enforcement to prevent accidental edits.
  * ✅ **Official Schedule Export**: (COMPLETED) Developed university-standard PDF and Excel export endpoints for finalized class programs.
 
* **Frontend Track (DAYAO)**:
  * ✅ **Interactive Calendar Drag-and-Drop**: (COMPLETED) Enabled fluid manual adjustments directly on the schedule grid with instant conflict validation.
  * ✅ **Conflict Resolution Sidebar**: (COMPLETED) Built a dedicated workspace for addressing overlapping slots with AI-assisted move suggestions.
  * ✅ **Official Schedule Export UI**: (COMPLETED) Integrated high-fidelity PDF/Excel download controls into the Schedules dashboard.
 
 
### Sprint 11: Intelligent Scheduling & Conflict Automation
*Status: COMPLETED*
*Objective: Stabilize the automated scheduling engine and provide high-fidelity interactive controls for conflict resolution.*
 
* **Backend Track (DE GUZMAN)**:
  * ✅ **Real-time Conflict API**: (COMPLETED) Implemented a high-performance POST endpoint for live overlap detection across faculty, rooms, and sections.
  * ✅ **Intelligent Auto-Resolver**: (COMPLETED) Enhanced the recommendation engine with multi-strategy resolution (relocation, room-swapping, and faculty validation).
  * ✅ **Schedule Snapshot & Locking**: (COMPLETED) Implemented an is_locked state for schedules with strict API enforcement to prevent accidental edits.
  * ✅ **Official Schedule Export**: (COMPLETED) Developed university-standard PDF and Excel export endpoints for finalized class programs.
 
* **Frontend Track (DAYAO)**:
  * ✅ **Interactive Calendar Drag-and-Drop**: (COMPLETED) Enabled fluid manual adjustments directly on the schedule grid with instant conflict validation.
  * ✅ **Conflict Resolution Sidebar**: (COMPLETED) Built a dedicated workspace for addressing overlapping slots with AI-assisted move suggestions.
  * ✅ **Official Schedule Export UI**: (COMPLETED) Integrated high-fidelity PDF/Excel download controls into the Schedules dashboard.

### Sprint 12: Faculty Management Enhancements
*Status: COMPLETED*
*Objective: Streamline faculty onboarding and availability management with a high-fidelity integrated interface.*

* **Frontend Track (DAYAO)**:
  * ✅ **Integrated "Add Faculty" Modal**: (COMPLETED) Implemented a comprehensive modal combining profile creation with integrated availability management.
  * ✅ **Dynamic Availability Controls**: (COMPLETED) Developed multi-day toggles, custom time-range panels, and live summary chips for conflict prevention.
  * ✅ **Faculty Type Integration**: (COMPLETED) Added support for Full-time/Part-time designation with an aligned 2x2 grid layout.
  * ✅ **UI/UX Refinement**: (COMPLETED) Standardized the "ATLAS Premium" footer design and adopted surgical typography for all faculty actions.

* **Backend Track (DE GUZMAN)**:
  * ✅ **Faculty Model Extension**: (COMPLETED) Added `type` Enum and associated persistence logic to the Faculty database model.
  * 🔄 **Bulk Availability Persistence**: (IN PROGRESS) Optimizing the user creation endpoint to handle atomic multi-window unavailability commits.
