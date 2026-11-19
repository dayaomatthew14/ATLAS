# Automated Generation Protocols & Technical Specification

**ATLAS AI Scheduling Engine — Version 2.0 (Panelist Revision)**

This document details the operational protocols, mathematical constraints, subject teaching-hour conversion rules, faculty teaching workload caps per academic term, mandatory lunch breaks, laboratory vs. lecture handling rules, and conflict resolution handoffs for the **ATLAS AI-Driven Automated Schedule Generation Engine**.

---

## 1. Scope and Generation Flow

1. **Parameter Ingestion**: Program Chairs or Administrators select the target active semester and the set of faculty members (`faculty_ids`) for schedule generation.
2. **Pre-Generation Cleanup**: The engine automatically purges any existing **unlocked draft schedules** and unresolved conflict records for the selected faculty scope within the active semester and department.
3. **Execution**: The constraint-satisfaction heuristic algorithm (`backend/app/services/schedule_generator.py`) processes all assigned `SubjectOffering` records for the department.
4. **Output & Persistence**:
   - Valid schedule assignments are created as `Schedule` database entities with status `draft` and `is_locked = False`.
   - Placed classes strictly obey the **Mandatory 1-Hour Lunch Break** (Monday through Friday, 12:00 PM – 01:00 PM; Saturdays exempt).
   - Faculty teaching load is tracked in **actual weekly teaching hours** (derived from exact meeting minutes), keeping assigned hours (`SubjectOffering`) and plotted hours (`Schedule`) distinct as separate workload stages.
   - When a professor's teaching hours exceed their term limit, the engine flags the overload as requiring **Dean Approval** (`requires_dean_approval = True`) rather than hard-blocking generation.
   - Unscheduled courses are logged as pending conflicts in the `conflicts` database table for human administrative review.

---

## 2. Subject Teaching Hours & Exact-Minute Conversions

Teaching hours are calculated based on subject lecture and laboratory units for all courses with 13 or more students:

### Lecture (A)
- **1 unit** = 1 hour 20 minutes per week (80 minutes)
- **2 units** = 2 hours 40 minutes per week (160 minutes)
- **3 units** = 4 hours per week (240 minutes)

### Laboratory (B)
- **1 unit** = 4 hours per week (240 minutes)
- **2 units** = 8 hours per week (480 minutes)

### Combined Lecture/Laboratory (C)
- **3 units** = 4 hours per week (240 minutes)

> [!NOTE]
> - **Component Separation**: Separate Lecture (A) and Laboratory (B) components are calculated individually. A 2-unit Lecture (A) plus 1-unit Laboratory (B) requires 6 hours and 40 minutes weekly (160m + 240m = 400m), whereas a genuine 3-unit Combined (C) requires 4 hours weekly (240m).
> - **Enrollment Policy Limitation**: Panelist rules apply to courses with 13 or more students. Because ATLAS currently does not track class enrollment figures per section, regular conversion rules apply across all curriculum offerings. Classes with fewer than 13 students will use this policy until section-level enrollment tracking is introduced.

---

## 3. Faculty Teaching Load & Employment Classifications

Faculty workload is calculated and displayed in **actual teaching HOURS** rather than academic units. Weekly teaching-hour limits are determined automatically by faculty employment classification and active academic term:

| Faculty Classification | 1st Term Limit | 2nd Term Limit | 3rd Term Limit |
|---|---|---|---|
| **Full-Time Probationary** | 24 hours | 24 hours | 24 hours |
| **Full-Time Regular** | 24 hours | 20 hours | 20 hours |
| **Part-Time** | Max 20 hours | Max 20 hours | Max 20 hours |

### Overload & Dean Approval Workflow
- When a faculty member's assigned or plotted hours exceed the term limit, they are marked with an **OVERLOAD** status requiring Dean approval.
- The assignment or schedule placement is permitted to proceed.
- The College Dean can review and officially approve or revoke the overload via `PATCH /api/professors/{id}/overload-approval`.
- Overload records approved by the Dean display the status `OVERLOAD (DEAN APPROVED)`.

---

## 4. Mandatory Lunch Break

- **Designated Window**: Exactly 60 minutes per day from **12:00 PM to 01:00 PM (12:00 – 13:00)**, Monday through Friday.
- **Saturdays**: Exempt from the mandatory lunch break restriction.
- **Strict Enforcement**:
  - The automated schedule generator never assigns any lecture, laboratory, or combined class during the lunch break window.
  - Manual schedule creation, schedule relocation, and CSV/file imports validate against lunch break overlap (`is_lunch_break_conflict`).
  - Lunch breaks are excluded from faculty teaching-hour calculations.
- **Timetable Display**: Displayed as a continuous, clearly labeled **"LUNCH BREAK"** block on the Monday–Friday columns across all schedule views and exports.

---

## 5. Timeslot & Slot Allocation Matrix

### Lecture Timeslots (No Lunch Overlap)
- **80-minute Slots** (e.g., 1-unit or 2-unit splits):
  - `07:30 - 08:50`
  - `08:50 - 10:10`
  - `10:10 - 11:30`
  - `13:00 - 14:20`
  - `14:20 - 15:40`
  - `15:40 - 17:00`
  - `17:00 - 18:20`
- **120-minute Slots** (for 3-unit lectures, two 2-hour meetings per week):
  - `07:30 - 09:30`
  - `10:00 - 12:00`
  - `13:00 - 15:00`
  - `15:00 - 17:00`
  - `17:00 - 19:00`

### Laboratory Timeslots (2.0 to 4.0 Hours per session)
- **120-minute Lab Slots**:
  - `07:30 - 09:30`
  - `09:30 - 11:30`
  - `13:00 - 15:00`
  - `15:00 - 17:00`
  - `17:00 - 19:00`
- **240-minute Single-Day Blocks** (for Combined C or single-day Labs):
  - `07:30 - 11:30` (Morning block, finishes before lunch)
  - `13:00 - 17:00` (Afternoon block, starts after lunch)

---

## 6. Weekly Timetable Grid

The weekly schedule interface and exports feature:
1. **Monday through Saturday Columns**: Each day represented as an individual column.
2. **Single Shared Vertical Time Scale**: 07:30 to 19:30 continuous axis.
3. **Proportional Duration Sizing**: Each subject block height corresponds exactly to its class duration in minutes.
4. **Class Details**: Clearly displays Subject Code, Section, Room (`TBA` when unassigned), and Time Range.
5. **Visible Gaps & Lunch Break**: Empty periods remain visible as whitespace; the 12:00 PM – 01:00 PM lunch break is distinctly labeled Monday through Friday.
6. **Export Consistency**: PDF and Excel exports include room assignments, teaching duration hours, and a dedicated Timetable Grid worksheet.
