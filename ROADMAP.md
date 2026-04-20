# ATLAS Project Roadmap

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
* **Dashboard Shell**: Created a responsive layout for the main application (`Dashboard.jsx`) with role-aware navigation, a top navigation bar, and a preliminary calendar UI mockup for managing schedules.

---

## 📅 Upcoming Sprints & Milestones

### Sprint 1: Core Entity Management (CRUD Operations)
* **Objective**: Enable administrators and program chairs to manage fundamental data.
* **Backend (DE GUZMAN)**:
  * Implement RESTful API endpoints for Departments, Subjects, Rooms, and Users (Students & Faculty).
  * Add data validation and error handling using schemas.
* **Frontend (DAYAO)**:
  * Build data management interfaces (data tables, creation forms, edit modals) for Subjects, Sections, Rooms, Students, and Teachers.
  * Connect frontend CRUD interfaces to the backend APIs.

### Sprint 2: Scheduling Engine & Dashboard Integration
* **Objective**: Transition the schedule calendar from a UI mockup to a fully functional tool.
* **Backend (DE GUZMAN)**:
  * Develop endpoints to create, read, update, and delete class schedules.
  * Implement filtering by semester, faculty, room, and department.
* **Frontend (DAYAO)**:
  * Integrate the `Dashboard.jsx` calendar with real backend data.
  * Implement interactive schedule creation (e.g., modal forms accessible via the "Create New Schedule" button).

### Sprint 3: Conflict Detection & Resolution
* **Objective**: Ensure schedule integrity by preventing overlaps and resolving issues.
* **Backend (DE GUZMAN)**:
  * Develop algorithmic logic to detect schedule conflicts (e.g., room double-booking, faculty time overlaps).
  * Automatically populate the `conflicts` database table when issues arise.
* **Frontend (DAYAO)**:
  * Create a conflict resolution interface or dashboard notifications for schedule managers.
  * Highlight conflicting schedules visually on the calendar view.

### Sprint 4: Role-Based Access Control (RBAC) & UI Refinement
* **Objective**: Secure the application based on user roles and refine the user experience.
* **Backend (DE GUZMAN)**:
  * Enforce strict RBAC on all API endpoints (e.g., Students can only view their schedules, Admins can edit system data).
* **Frontend (DAYAO)**:
  * Tailor the dashboard UI based on the logged-in user's role (hiding/showing specific navigation items and actions).
  * Polish UI/UX, add loading states, toast notifications for success/errors, and handle edge cases.

### Sprint 5: Production Readiness & Deployment
* **Objective**: Prepare the application for real-world usage.
* **Backend (DE GUZMAN)**:
  * Migrate the database engine from SQLite to a production-ready relational database like PostgreSQL or MySQL.
  * Write unit and integration tests for critical backend logic, especially the conflict detection and scheduling algorithms.
  * Containerize the backend API and configure deployment pipelines (CI/CD).
* **Frontend (DAYAO)**:
  * Containerize the frontend application (optional) and configure deployment pipelines (CI/CD) to host the static assets.
