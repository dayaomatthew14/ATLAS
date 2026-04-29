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
*Status: In Progress (Backend Complete)*
*Objective: Ensure 100% accuracy in curriculum imports and provide a high-fidelity visual representation of academic flowcharts.*

* **Backend Track (DE GUZMAN)**:
  * ✅ **Robust Excel Parsing Engine**: (COMPLETED) Support for merged cells (ffill), non-standard header positions, and multi-sheet detection.
  * ✅ **Import Validation & "Review Report"**: (COMPLETED) Checks for missing units, internal duplicates, and circular prerequisites. Returns a comprehensive validation report.
  * ✅ **Header Extraction & Sample Service**: (COMPLETED) New `/headers` endpoint to allow frontend preview and manual column mapping.
  * ✅ **Bulk Commit & Conflict Safety API**: (COMPLETED) New `/bulk` endpoint for saving reviewed data with final integrity checks.
  * ✅ **Structured Prerequisite Normalization**: (COMPLETED) Improved parsing of complex prerequisite strings into a relational-ready format.

* **Frontend Track (DAYAO)**:
  * **Multi-Step Import Wizard**: Replace the "instant upload" with a guided workflow:
    1. **Upload & Parse**: Initial file processing.
    2. **Review & Edit**: Display a "Data Review Grid" where users can visually verify and manually correct parsed data before saving.
    3. **Commit**: Final bulk insertion into the database.
  * **Flowchart Visual Accuracy**: Refine the `Curriculum` page to correctly group subjects by Year/Semester and accurately reflect Lecture vs. Lab unit splits.
  * **Prerequisite Flow Visualization**: Implement a visual highlighting system that shows prerequisite "paths" when a subject is hovered or selected.
  * **Data Integrity Flags**: Add visual "Warning" icons in the curriculum table for subjects missing critical metadata (e.g., year level or units).
