# Automated Generation Protocols (Sprint 3)

This document outlines the operational protocols, limits, and "What-If" scenarios for the ATLAS AI-Driven Automated Schedule Generation Engine.

## General Scope and Generation Flow

1. **Initialization (Start)**: A Program Chair or authorized Faculty member inputs the foundational parameters (available professors, subjects, student populations, available rooms, maximum units per faculty).
2. **Trigger**: The user presses the "Generate Schedule" trigger. 
3. **Execution**: The backend AI algorithm analyzes the parameters, applying constraint-satisfaction logic to organize the timetables.
4. **Resolution (End)**: The system outputs a complete academic schedule mapped out across the week, optimizing for zero conflicts.

## Scope & Limitations
- **Hard Constraints (Strict)**: 
  - A professor cannot be assigned to two classes simultaneously.
  - A room cannot be double-booked during the same time slot.
  - Room capacity must handle the enrolled class size.
  - Faculty cannot exceed their maximum allowable teaching units.
  *If a schedule mathematically cannot satisfy these hard constraints due to a lack of resources, the algorithm must halt that specific branch of generation.*
- **Soft Constraints (Flexible)**: 
  - Faculty preferred time blocks (e.g., morning vs. evening preferences).
  - Minimizing gap hours between a professor's classes.
  *The algorithm attempts to optimize for soft constraints but will override them if necessary to satisfy hard constraints and fulfill the full course load.*
- **Limitation**: The AI does not predict spontaneous absences or handle mid-semester emergency re-assignments. It optimizes static, upfront data configured prior to a semester.

## Handling Multiple Generation Requests
**What if multiple Program Chairs click "Generate" at the identical moment?**
- **Concurrency & Queuing**: The generation process is highly CPU-intensive. If executed synchronously, multiple requests will crash or halt the FastAPI application thread.
- **Protocol**: 
  - All generation requests are decoupled from the main HTTP thread and dispatched to a Background Task Queue.
  - Requests are processed serially to prevent server overload.
  - A "Task ID" is immediately returned to the frontend.
  - The UI will display an asynchronous loading state ("Generation in progress... Please wait"), occasionally polling the backend (or awaiting WebSockets) to check the task status without freezing the UI.
- **Locking Mechanism**: A Database lock will be enforced per "Department" or "Semester" so that two admins do not generate schedules for the exact same subset simultaneously, which would cause database overwrite chaos.

## Handling Unresolvable Conflicts
**What if the algorithm hits a bottleneck it cannot solve automatically?**
- **Self-Correction (Backtracking)**: The system first utilizes algorithmic backtracking. If placing Subject A causes a conflict for Subject B, the AI attempts to shuffle previously placed subjects to clear a functional path.
- **Partial Generation Protocol**: If a mathematical impossibility is reached (e.g., 50 classes need to be scheduled, but only 5 rooms exist), the AI **does not** fail silently or infinitely loop. 
  - It schedules the maximum possible number of classes securely.
  - It sets the remainder of unscheduled items in a `pending` state.
  - It logs the unresolved obstacles strictly into the `conflicts` database table.
- **Human Handoff**: The frontend dashboard will display a distinct notification: *"Generation Complete with Pending Conflicts"*. Human administrators can review the dashboard, manually override constraints (e.g., forced room sharing, ignoring limits), and patch the remaining holes.

---

## Technical Prognosis: AI Integration & API Suitability

When building the automated sequence for the FastAPI backend, we must choose the correct calculation engine. Below is a prognosis of possible AI approaches and how they interact with our current system architecture.

### 1. Generative LLM APIs (OpenAI GPT-4o, Google Gemini)
- **Concept**: Sending all subjects, rooms, and faculty to an LLM via REST API and asking it to return a formatted JSON schedule.
- **Usability Prognosis**: **POOR**. Large Language Models are probabilistic, not deterministic. They notoriously "hallucinate" logical constraints and struggle with rigid mathematical sudoku-style puzzles (like school scheduling). They are highly prone to accidentally double-booking rooms or ignoring soft constraints. 
- **Cost/Latency**: High latency (10-30+ seconds per generation request) and expensive at scale due to massive token payloads.

### 2. Constraint Programming Solvers (Google OR-Tools, Timefold/OptaPlanner)
- **Concept**: Utilizing heavily optimized native solver libraries (like Google OR-Tools) or dedicated cloud constraint APIs. The backend models the scheduling problems mathematically (Variables, Domains, constraints).
- **Usability Prognosis**: **EXCELLENT**. These solvers are algorithmic logic engines. If a schedule is mathematically possible, they will find it. If it is impossible, they can be programmed to halt or drop specific variables gracefully. They guarantee 0% hallucination and strict adherence to Hard Constraints.
- **Cost/Latency**: Milliseconds to seconds. Native libraries (like OR-Tools) execute entirely backend-side and require zero third-party API keys or subscription costs.

### Current Infrastructure Constraints (ATLAS v1)

If integrating Google OR-Tools or a similar local scheduling engine into our current FastAPI infrastructure, we face several immediate constraints that must be handled structurally:

1. **The Event Loop Bottleneck (Synchronous Execution)**:
   - **Constraint**: Finding an optimal schedule configuration across 500+ classes is computationally heavy. If run directly inside a standard FastAPI route, it will block the Python Event Loop. Every other user trying to load the website or fetch data during that period will experience endless hanging requests.
   - **Protocol Fix**: We must utilize `fastapi.BackgroundTasks` or integrate `Celery/Redis`. The user hits `/api/generate`, receives a `202 Accepted` immediately, and the heavy matrix multiplication runs silently in the background.

2. **SQLite Concurrent Write Locking**:
   - **Constraint**: The project currently runs on SQLite (`atlas.db`). SQLite locks the entire database when writing. If the Schedule AI finishes executing and attempts to rapidly bulk-insert 500 schedule rows while a student is simultaneously trying to update their profile, the database will throw a `database is locked` runtime error.
   - **Protocol Fix**: The AI must extract all necessary data into memory *before* solving. Once solved, it must commit the final schedule using a singular, quick bulk transaction (`session.bulk_save_objects`) rather than inserting them row-by-row. If the project scales, a migration to PostgreSQL is absolutely necessary.

3. **Memory Limits (RAM Exertion)**:
   - **Constraint**: Pure backtracking algorithms have an exponential time/memory complexity ($O(n!)$). If not carefully bounded by timeout constraints, the server could exhaust its RAM attempting to find the "perfect" schedule for a massive academic department.
   - **Protocol Fix**: The AI must be capped with an explicit time boundary (e.g., *halt search and return best-possible schedule after 30 seconds*).
