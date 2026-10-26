# User Operational Guide & Manual — ATLAS

**Academic Timetabling System (De La Salle Araneta University - Tertiary Education)**

---

## 1. Overview & Authenticated System User Roles

ATLAS is designed around specialized administrative timetabling workflows for authorized academic user roles within De La Salle Araneta University.

### System User Roles & Responsibilities

| Role | Key Capabilities & Workflows |
| :--- | :--- |
| 👑 **Administrator / College Dean (`admin`)** | Institutional administration separated by academic department (`CAST`, `CBMA`, `COED`, `CVMAS`). Each Dean serves as the Administrator for their college with a dedicated sidebar navigation: <br>• **Overview**: College-specific enrollment statistics, curriculum status, and recent activity.<br>• **PEOPLE**: Manage college **Users** (Program Chairs and department staff), verify accounts, and trigger temporary password resets.<br>• **ACADEMIC STRUCTURE**: Manage **Colleges and Programs**, import and curate **Curriculum** blocks (`DRAFT`, `PUBLISHED`, `ARCHIVED`), and monitor **Academic Terms**.<br>• **OVERSIGHT**: Inspect college-scoped **Activity** audit logs. |
| 🎓 **User / Program Chair (`program_chair`)** | Departmental academic head & scheduling planner. Excel curriculum ingestion, faculty workload limits, room management, subject assignment, AI schedule generation, conflict resolution, and schedule exports. |

> [!NOTE]
> - **Pre-seeded Dean Admin Accounts**: Deans do not self-register. Official accounts for each college (`dean.cast@dlsau.edu.ph`, `dean.cbma@dlsau.edu.ph`, `dean.coed@dlsau.edu.ph`, `dean.cvmas@dlsau.edu.ph`) are pre-seeded on startup with initial password `DeanPassword123!`.
> - **Public Registration**: Self-registration is strictly restricted to **Users (Program Chairs)**. Attempts to register as an Administrator or Dean are blocked with HTTP 403 Forbidden.
> - **Faculty Records & Profiles**: Faculty members do not log into or access ATLAS. Faculty profiles are managed strictly as scheduling resource records by authorized Deans and Program Chairs to track teaching unit caps, subject qualifications, and unavailability schedules.

---

## 2. Navigating the Interface

### Header Bar & Top Navigation
- **Department Branding**: Dynamically displays your authenticated college/department workspace (e.g. `CAST Dashboard` or `System Administration`).
- **Active Semester Indicator**: Displays current academic year and term (e.g. `AY 2025-2026 - 1st Semester`).
- **Theme Switcher**: Instant toggle between Dark Mode and Light Mode with persistent local preferences.
- **User Profile Menu**: Access profile picture uploads, password changes, and account logout for authenticated users.

---

## 3. Step-by-Step System Workflows

### 3.1 Managing Academic Semesters (Admin Only)
1. Navigate to **Academic Semesters** (`/dashboard/semesters`).
2. Click **Add Semester**. Enter Academic Year (e.g. `2025-2026`) and select Term (`1st`, `2nd`, or `3rd semester`).
3. Click **Activate** on the target semester. Only one semester can be active at a time; activating a new term automatically updates the application context across all department dashboards.

---

### 3.2 Uploading & Ingesting Curriculums (Excel Ingestion)
1. Navigate to **Curriculum** (`/dashboard/curriculum`).
2. Click **Import Excel Curriculum**.
3. Select your department's official curriculum `.xlsx` file.
4. **Block Isolation Behavior**:
   - The engine automatically detects the **Program Name** and **Academic Year** from the header.
   - If a curriculum for that program and year already exists, a **Duplicate Warning Modal** appears.
   - Choose **Replace / Overwrite** to update the existing block or **Cancel** to abort.
5. Once imported, the curriculum block status defaults to `PUBLISHED`. You can view course codes, titles, lecture/lab unit split, and prerequisites in the structured table.

---

### 3.3 Managing Faculty Records & Unavailability Slots
1. Navigate to **Teachers / Faculty** (`/dashboard/teachers`).
2. Click **Add Faculty**.
3. Enter First Name, Last Name, Email, Employment Type (`Full-Time` vs `Part-Time`), and **Max Units** (default `18` for full-time).
4. **Setting Unavailability Slots**:
   - Click the **Unavailability Calendar** icon next to a faculty record.
   - Mark specific day/time slots (e.g. `Monday 08:00 - 12:00`) when the professor is unavailable due to administrative duties or outside commitments.
   - The AI scheduler strictly respects these slots during generation.

---

### 3.4 Assigning Subject Offerings (Faculty Records to Subjects)
1. Navigate to **Assigned Subjects** (`/dashboard/assigned-subjects`) or **Teachers** (`/dashboard/teachers`).
2. **Major & General Education Subjects**:
   - Both Major subjects and General Education (Gen Ed) subjects for the active term appear for assignment.
   - You can filter by Category (**Major Subjects** vs. **General Education (Gen Ed)**) or by assignment status.
3. **Assigning & Overriding Subjects**:
   - Select a subject and click **Assign** or **Change** to select a professor from your faculty roster.
   - **Gen Ed Assignment Confirmation**: If the subject being assigned is not a major subject (General Education), the system prompts for confirmation before the assignment is committed or overridden.
   - If a Gen Ed subject is already assigned to a professor, the dialog explicitly warns you that assigning a new professor will override the current assignment.
4. Click **Confirm & Override** or **Save Assignment** to commit the change.

---

### 3.5 Running the AI Schedule Generator
1. Navigate to **Schedules** (`/dashboard/schedules`).
2. Click **Generate AI Schedule**.
3. Select the faculty members/records to include in this scheduling run.
4. Click **Start Schedule Generation**.
5. The algorithm executes constraint satisfaction logic:
   - Lecture subjects are placed in lecture slots without room locks (`room_id = NULL`).
   - Laboratory subjects are matched against available lab / computer lab rooms.
   - Workload caps are enforced against faculty max units.
6. **Reviewing Results**:
   - The system displays total schedules generated, skipped general education courses, and any **Workload Cap Warnings** or **Unplaced Conflict Items**.

---

### 3.6 Resolving Schedule Conflicts
1. If unplaced courses occur (e.g., lack of lab rooms or professor unavailability overlaps), open the **Conflict Resolution Panel** on the Schedules view.
2. Inspect the conflict detail card (e.g., `CS301 - No laboratory room available`).
3. Click **Solve Conflict** to attempt auto-re-allocation, or manually adjust the faculty assignment or room allocation in the schedule table.

---

### 3.7 Locking, Publishing & Exporting Schedules
1. **Locking Schedules**: Click the **Lock Icon** on any individual schedule row. Locked items are preserved in their exact time slot during future AI regeneration runs.
2. **Publishing**: When satisfied with draft timetables, click **Publish Schedule**. This transitions schedule status from `draft` to `published` for official department use and exports.
3. **Exporting**: Click **Export PDF** or **Export Excel** to download clean, publication-ready timetable documents.

### 3.8 College Dean Administration (Dean Admin Only)
1. **Overview & Metrics**: Deans navigate to **Overview** (`/dashboard/overview`) to view college-specific program counts, user totals, and recent activity logs.
2. **Managing College Users**: Deans navigate to **Users** (`/dashboard/users`) to review registered chairs strictly within their college, verify new registrations, and issue temporary passwords when requested.
3. **Colleges & Programs Review**: Deans navigate to **Colleges and Programs** (`/dashboard/colleges`) to view and update academic degree programs belonging exclusively to their college.
4. **Curriculum Oversight**: Deans navigate to **Curriculum** (`/dashboard/curriculum`) to review, import, draft, publish, or archive curriculum blocks for their department without cross-college exposure.
5. **Academic Terms & Activity**: Deans inspect **Academic Terms** (`/dashboard/semesters`) to view the active term context, and check **Activity** (`/dashboard/activity`) for department-isolated audit trails.
