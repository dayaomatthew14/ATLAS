
# ATLAS: Academic Timetabling System (DLSAU Edition)
**Strictly for Program Chairs of De La Salle Araneta University - Tertiary Education**

### Core Constraints
- **Target Users**: Strictly Program Chairs (CAST, CBMA, CVMAS, COED).
- **Scope**: Tertiary Education Academic Scheduling.

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

### 6. Scheduling Engine (Frontend)
* **Dynamic Calendar**: Developed a date-driven calendar with month navigation and dynamic grid rendering.
* **Schedule Creation**: Implemented the "Create New Schedule" flow with dynamic dropdowns and calendar mapping.

---

## 📅 Upcoming Sprints & Milestones

### Sprint 1 & 2: Core Data APIs & Department Dashboards (In Progress)
*Objective: Fully transition from mock data to real database interactions, separated securely into 4 department workspaces (CAST, CBMA, CVMAS, COED).*

* **Backend Track (DE GUZMAN)**:
  * Create `department_data.py` router.
  * Implement RESTful API endpoints for Subjects, Rooms, Teachers, and Schedules.
  * **Critical:** Enforce Department Filtering. Ensure APIs strictly return data matching the authenticated user's department.
  * Add robust data validation and error handling.

* **Frontend Track (DAYAO)**:
  * Update `Dashboard.jsx` top navigation to proudly display the user's Department (e.g., "CAST Dashboard").
  * Remove temporary "mock data" placeholders from `Schedules.jsx` and other dashboard views.
  * Wire up all frontend tables and calendars to the new backend endpoints to display real, department-specific data.

### Sprint 3: AI-Driven Schedule Generation & Conflict Resolution
*Objective: Fully automate the creation of optimal class schedules while dynamically preventing overlaps and constraints.*

* **Backend Track (DE GUZMAN)**:
  * **Automated Generation Engine (AI)**: Develop an algorithmic/AI logic that ingests available faculty, rooms, subjects, and generates an optimal schedule.
  * Develop heuristic logic to detect schedule conflicts (e.g., room double-booking, faculty time overlaps).
  * Enable the algorithm to attempt self-correction via backtracking; populate the `conflicts` database table for issues requiring human intervention.

* **Frontend Track (DAYAO)**:
  * Build the "Generate Schedule" dashboard where parameters are reviewed, and the automated AI sequence is triggered asynchronously.
  * Create a conflict resolution interface or dashboard notifications for schedule managers to review what the AI couldn't self-resolve.
  * Highlight generated and conflicting schedules visually on the calendar view.

### Sprint 4: Role-Based Access Control (RBAC) & UI Refinement
*Objective: Secure the application based on user roles and polish the user experience.*

* **Backend Track (DE GUZMAN)**:
  * Enforce strict RBAC on all API endpoints (Admin vs Program Chair vs Faculty).

* **Frontend Track (DAYAO)**:
  * Tailor the dashboard UI based on the logged-in user's specific role.
  * Polish UI/UX, add global loading states, and handle edge cases gracefully.

### Sprint 5: Production Readiness & Deployment
*Objective: Prepare the application for real-world usage.*

* **Backend Track (DE GUZMAN)**:
  * Finalize database migrations and write integration tests.
  * Set up Docker containerization and CI/CD pipelines.

* **Frontend Track (DAYAO)**:
  * Conduct final UI testing across devices.
  * Configure Vite deployment builds and environment variables for production.
