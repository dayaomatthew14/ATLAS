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
* **Dashboard Shell**: Created a responsive layout for the main application (`Dashboard.jsx`) with role-aware navigation and functional nested routing.

### 5. Core Entity Management (Frontend)
* **CRUD Interfaces**: Built data management tables and modals for Subjects, Rooms, Students, and Teachers.
* **API Utility**: Implemented a centralized API client with JWT handling and automatic session management.

### 6. Scheduling Engine (Frontend)
* **Dynamic Calendar**: Developed a date-driven calendar with month navigation and dynamic grid rendering.
* **Schedule Creation**: Implemented the "Create New Schedule" flow with dynamic dropdowns and calendar mapping.

---

## 📅 Upcoming Sprints & Milestones

### Sprint 1 & 2: Backend Development (In Progress)
* **Backend (DE GUZMAN)**:
  * Implement RESTful API endpoints for Departments, Subjects, Rooms, Users, and Schedules.
  * Add data validation, error handling, and filtering.

### Sprint 3: AI-Driven Schedule Generation & Conflict Resolution
* **Objective**: Fully automate the creation of optimal class schedules while dynamically preventing overlaps and constraints.
* **Backend (DE GUZMAN)**:
  * **Automated Generation Engine (AI)**: Develop an algorithmic/AI logic that ingests programmatic inputs (available faculty, rooms, subjects, units) and automatically generates an optimal schedule.
  * Develop heuristic logic to detect schedule conflicts (e.g., room double-booking, faculty time overlaps).
  * Enable the algorithm to attempt self-correction via backtracking; populate the `conflicts` database table for issues requiring human intervention.
* **Frontend (DAYAO)**:
  * Build the "Generate Schedule" dashboard where parameters are reviewed, and the automated AI sequence is triggered asynchronously.
  * Create a conflict resolution interface or dashboard notifications for schedule managers to review what the AI couldn't self-resolve.
  * Highlight generated and conflicting schedules visually on the calendar view.

### Sprint 4: Role-Based Access Control (RBAC) & UI Refinement
* **Objective**: Secure the application based on user roles and refine the user experience.
* **Backend (DE GUZMAN)**:
  * Enforce strict RBAC on all API endpoints.
* **Frontend (DAYAO)**:
  * Tailor the dashboard UI based on the logged-in user's role.
  * Polish UI/UX, add loading states, and handle edge cases.

### Sprint 5: Production Readiness & Deployment
* **Objective**: Prepare the application for real-world usage.
* **Backend (DE GUZMAN)**:
  * Database migration and integration testing.
  * Containerization and CI/CD setup.
* **Frontend (DAYAO)**:
  * Final UI testing and deployment configuration.

