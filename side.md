# Automated Generation Protocols & Technical Specification

**ATLAS AI Scheduling Engine — Version 1.4**

This document details the operational protocols, mathematical constraints, laboratory vs. lecture handling rules, and conflict resolution handoffs for the **ATLAS AI-Driven Automated Schedule Generation Engine**.

---

## 1. Scope and Generation Flow

1. **Parameter Ingestion**: Program Chairs or Administrators select the target active semester and the set of faculty members (`faculty_ids`) for schedule generation.
2. **Pre-Generation Cleanup**: The engine automatically purges any existing **unlocked draft schedules** and unresolved conflict records for the selected faculty scope within the active semester and department.
3. **Execution**: The constraint-satisfaction heuristic algorithm (`backend/app/services/schedule_generator.py`) processes all assigned `SubjectOffering` records for the department.
4. **Output & Persistence**:
   - Valid schedule assignments are created as `Schedule` database entities with status `draft` and `is_locked = False`.
   - Teaching load is checked in hours per week against the term's required load; passing it emits `bumped_warnings` and logs an `overload` conflict record (or `part_time_ceiling` for a Part-Time member at 20 hrs/week). The class is still placed — the chair decides.
   - Unscheduled courses are logged as pending conflicts in the `conflicts` database table for human administrative review.

---

## 2. Hard & Soft Constraint Engine Rules

### Hard Constraints (Strict Enforced Rules)

1. **Faculty Workload Limits**:
   - Faculty members cannot exceed their assigned `max_units` (e.g. 18 units for full-time faculty, customized caps for part-time faculty).
   - If assigning a course would breach the limit: `proposed_hours + current_hours > max_units`, the engine halts placement for that course, emits a workload warning, and logs a conflict (`max_units_exceeded`).

2. **Professor Availability & Overlaps**:
   - A professor cannot be assigned to two classes simultaneously (`check_overlap`).
   - Scheduling respects `FacultyUnavailability` entries; no class will be placed during a professor's blacklisted timeslots (`is_prof_unavail`).

3. **Room Allocation & Laboratory Requirements**:
   - **Lecture Subjects** (`c.type == 'lecture'` or `c.lec_units > 0`): Lecture courses are scheduled across standard 1.5-hour timeslot pairs (MW, TTh, FS). **`room_id` is set to `NULL`** because general lecture classrooms are managed globally outside room locking.
   - **Laboratory Subjects** (`c.type == 'lab'` or `c.lab_units > 0`): Laboratory courses require a designated room (`room_id`) belonging to room types `'lab'` or `'computer_lab'`. No room double-booking is permitted (`is_room_conflict`).

### Soft Constraints (Optimization Heuristics)

1. **Preferred Timeslot Pairs**:
   - Primary preference: Monday/Wednesday (`MW_PAIR`), Tuesday/Thursday (`TTH_PAIR`), Friday/Saturday (`FS_PAIR`).
2. **Consecutive Hours Minimization**:
   - Classes are placed in standard structured slots to avoid random gap hours in faculty teaching schedules.

---

## 3. Timeslots & Duration Matrix

### Lecture Timeslots (1.5 Hours per session)
- Slot 1: `07:30 - 09:00`
- Slot 2: `09:00 - 10:30`
- Slot 3: `10:30 - 12:00`
- Slot 4: `13:00 - 14:30`
- Slot 5: `14:30 - 16:00`
- Slot 6: `16:00 - 17:30`
- Slot 7: `17:30 - 19:00`

### Laboratory Timeslots (2.0 Hours per session)
- Slot 1: `07:30 - 09:30`
- Slot 2: `09:30 - 11:30`
- Slot 3: `11:30 - 13:30`
- Slot 4: `13:30 - 15:30`
- Slot 5: `15:30 - 17:30`
- Slot 6: `17:30 - 19:30`

---

## 4. Conflict Handling & Human Handoff Protocol

When mathematical impossibility or resource shortage prevents 100% schedule placement:
1. **Self-Correction**: The engine attempts iterative slot shuffling across day pairs and room options.
2. **Partial Generation**: The engine commits all successfully scheduled classes cleanly.
3. **Conflict Logging**: Unplaced courses are recorded in the `conflicts` table with detailed rationale strings:
   - `max_units_exceeded`: *"Faculty Workload limit exceeded for [Faculty Name] (Full-Time): 18.0 + 3.0 > 18.0 max units"*
   - `no_lab_room_available`: *"[Course Code] could not be scheduled because no laboratory room was available."*
   - `unplaced_lecture`: *"[Course Code] could not be scheduled due to faculty availability or schedule conflict."*
4. **Frontend Conflict Drawer**: The React frontend displays the **Conflict Resolution Panel**, highlighting pending conflicts with single-click manual resolution handoffs (`/api/ai-scheduler/solve-conflict`).
