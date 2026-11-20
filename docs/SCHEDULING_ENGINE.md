# Automated Generation Protocols & Technical Specification

**ATLAS AI Scheduling Engine — Version 2.0 (Panelist Revision)**

This document details the operational protocols, mathematical constraints, subject teaching-hour conversion rules, faculty teaching workload caps per academic term, flexible midday scheduling, laboratory vs. lecture handling rules, and conflict resolution handoffs for the **ATLAS AI-Driven Automated Schedule Generation Engine**.

---

## 1. Scope and Generation Flow

1. **Parameter Ingestion**: Program Chairs or Administrators select the target active semester and the set of faculty members (`faculty_ids`) for schedule generation.
2. **Pre-Generation Cleanup**: The engine automatically purges any existing **unlocked draft schedules** and unresolved conflict records for the selected faculty scope within the active semester and department.
3. **Execution**: The constraint-satisfaction heuristic algorithm (`backend/app/services/schedule_generator.py`) processes all assigned `SubjectOffering` records for the department.
4. **Output & Persistence**:
   - Valid schedule assignments are created as `Schedule` database entities with status `draft` and `is_locked = False`.
   - Placed classes can span midday flexibly (e.g., 11:30 AM – 01:30 PM labs, 10:50 AM – 12:10 PM courses) without a rigid 12:00 PM – 01:00 PM lock.
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
> - **Converted Tutorial (CT) & Small Class Sizes**: For courses with under 13 students, ATLAS supports the DLSAU Converted Tutorial policy tiered by enrollment: 9–12 students, 5–8 students, and 1–4 students. Program Chairs and Deans can specify `enrolled_students` or apply an explicit `credited_hours_override` directly on the subject offering.

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

## 4. Flexible Midday Scheduling & Academic Periods

- **Midday Flexibility**: Lunch and midday breaks are flexible rather than hard-locked to 12:00 PM – 01:00 PM.
- **Realistic Curriculum Alignment**: Classes can span midday as required by degree programmes (e.g., 2-hour laboratory sessions from `11:30 AM – 01:30 PM`, 80-minute lecture blocks from `10:50 AM – 12:10 PM`).
- **No Conflict Blocking**: Midday placement is permitted without throwing `lunch_break` conflict errors during generation, manual editing, or Excel schedule importing.
- **Accurate Workload Calculation**: Meeting duration is calculated from exact start and end times; no midday hours are deducted.
- **Timetable Usability**: All 30-minute intervals across 07:30 AM to 07:30 PM are interactive and available for quick-add scheduling.

---

## 5. Timeslot & Slot Allocation Matrix

### Lecture Timeslots
- **80-minute Slots** (e.g., 1-unit or 2-unit splits):
  - `07:30 - 08:50`, `08:50 - 10:10`, `10:10 - 11:30`
  - `10:40 - 12:00`, `10:50 - 12:10`, `11:30 - 12:50`, `12:00 - 13:20`
  - `13:00 - 14:20`, `14:20 - 15:40`, `15:40 - 17:00`, `17:00 - 18:20`, `18:10 - 19:30`
- **120-minute Slots** (for 3-unit lectures, two 2-hour meetings per week):
  - `07:30 - 09:30`, `08:00 - 10:00`, `09:30 - 11:30`, `10:00 - 12:00`
  - `11:00 - 13:00`, `11:30 - 13:30`, `12:00 - 14:00`
  - `13:00 - 15:00`, `13:30 - 15:30`, `15:00 - 17:00`, `15:30 - 17:30`, `17:00 - 19:00`, `17:30 - 19:30`

### Laboratory Timeslots (2.0 to 4.0 Hours per session)
- **120-minute Lab Slots**:
  - `07:30 - 09:30`, `08:50 - 10:50`, `09:30 - 11:30`, `10:00 - 12:00`
  - `11:00 - 13:00`, `11:30 - 13:30`, `12:00 - 14:00`
  - `13:00 - 15:00`, `13:30 - 15:30`, `14:20 - 16:20`, `15:00 - 17:00`, `15:30 - 17:30`, `17:00 - 19:00`, `17:30 - 19:30`
- **240-minute Single-Day Blocks** (for Combined C or 2-unit Labs):
  - `07:30 - 11:30`, `08:00 - 12:00`, `10:00 - 14:00`, `11:00 - 15:00`, `12:00 - 16:00`, `13:00 - 17:00`, `13:30 - 17:30`, `15:00 - 19:00`, `15:30 - 19:30`

---

## 6. Weekly Timetable Grid

The weekly schedule interface and exports feature:
1. **Monday through Saturday Columns**: Each day represented as an individual column.
2. **Single Shared Vertical Time Scale**: 07:30 to 19:30 continuous axis.
3. **Proportional Duration Sizing**: Each subject block height corresponds exactly to its class duration in minutes.
4. **Class Details**: Clearly displays Subject Code, Section, Room (`TBA` when unassigned), and Time Range.
5. **Full Timetable Usability**: Empty periods remain visible as whitespace; all 30-minute intervals are interactive and available for quick-add placement.
6. **Export Consistency**: PDF and Excel exports include room assignments, teaching duration hours, and a dedicated Timetable Grid worksheet.
