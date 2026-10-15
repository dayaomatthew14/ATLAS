# ATLAS Comprehensive Codebase Audit & Cleanup Plan

> **Status:** Phase 1 (Audit & Plan) — Awaiting User Approval  
> **Author:** Senior Engineering Codebase Audit  
> **Target:** ATLAS Timetable Management System (FastAPI + SQLAlchemy 2.0 / React 18 + Vite)

---

## Executive Summary

A comprehensive, read-only audit of the ATLAS codebase was conducted across backend Python services, REST routers, database migrations, dependencies, and the React frontend. 

The core architecture is sound: the database schema is strictly synchronized with 14 SQLAlchemy models, all 34 automated unit/regression tests pass, and critical security and RBAC scoping boundaries are properly enforced. However, iterative feature development has accumulated:
1. **Unused dependencies** (e.g. `passlib[bcrypt]` in `requirements.txt` where `bcrypt` is already used directly).
2. **Orphaned files and legacy components** (e.g. `backend/app/dependencies.py` and `frontend/src/components/Table.jsx`).
3. **Unused imports, variables, and deprecated Pydantic v1 patterns** (e.g. `class Config:` in `academics_router.py`).
4. **Leftover debug prints and raw `print()` statements** where structured logging is required.
5. **Overly long router files** containing large domain logic engines that belong in dedicated service modules (notably `curriculum.py` at 1,210 lines with a 700-line Excel parser, and `schedules.py` at 853 lines with 340 lines of PDF/Excel export routines).
6. **Frontend ESLint violations** in `AppShell.jsx` from unused props after recent layout adjustments.

---

## 1. Audit Findings by Category

### Category A: Backend Dependencies (`backend/requirements.txt`)

| Package | Status | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `passlib[bcrypt]==1.7.4` | **Unused** | **Low** | **Evidence:** `backend/app/auth.py` imports and uses `bcrypt` directly (`bcrypt.checkpw`, `bcrypt.hashpw`). Nowhere in the backend codebase is `passlib` imported or called. Moreover, `passlib 1.7.4` has a known incompatibility with modern `bcrypt` (`__about__` attribute error).<br>**Action:** Safely remove `passlib[bcrypt]` from `requirements.txt`. |
| `openpyxl==3.1.5` | **Active / Used** | **N/A** | **Evidence:** Heavily imported and used in `curriculum.py` (Excel ingestion) and `schedules.py` (schedule export/import). Retain. |
| `reportlab==5.0.0` | **Active / Used** | **N/A** | **Evidence:** Used in `backend/app/routers/schedules.py` for PDF timetable generation and export. Retain. |
| `psycopg2-binary==2.9.12`| **Active / Used** | **N/A** | **Evidence:** Required for PostgreSQL connectivity when running in production/Railway. Retain. |
| `python-jose[cryptography]==3.5.0` | **Active / Used** | **N/A** | **Evidence:** Used in `auth.py` for JWT signing and decoding. Retain. |
| `bcrypt==5.0.0` | **Active / Used** | **N/A** | **Evidence:** Directly imported and used in `auth.py` for salted password hashing. Retain. |
| `requests==2.34.2` | **Active / Used** | **N/A** | **Evidence:** Used in `notifications.py` for external SMS OTP delivery via TextBee. Retain. |

---

### Category B: Backend Dead Code, Unused Imports & Deprecations

| Item / Location | Category | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/dependencies.py` | Orphaned File | **Low** | **Evidence:** Defines `require_admin` and `require_program_chair`. Zero files in the entire project import `dependencies.py` (routers use inline checks or `_require_admin` in `academics_router.py`).<br>**Action:** Delete orphaned file or consolidate role dependencies. |
| `backend/app/schemas.py`<br>`Token` (L130) | Unused Schema | **Low** | **Evidence:** `auth_router.py` returns dictionary payloads directly (`{"access_token": ...}`) and never binds `response_model=schemas.Token`.<br>**Action:** Remove or bind to endpoint response models. |
| `backend/app/schemas.py`<br>`DepartmentCreate`, `DepartmentUpdate`, `DepartmentResponse` (L202–212) | Unused Schemas | **Low** | **Evidence:** Obsolete legacy schemas superseded by `CollegeOut`, `ProgramOut` in `academics_router.py`. Zero references across backend.<br>**Action:** Remove unused schemas. |
| `backend/app/routers/academics_router.py`<br>L31–32 | Pydantic Deprecation | **Low** | **Evidence:** Uses Pydantic v1 `class Config: from_attributes = True`, raising `PydanticDeprecatedSince20` on every test run and startup.<br>**Action:** Update to Pydantic v2 `model_config = ConfigDict(from_attributes=True)`. |
| `backend/app/routers/ai_scheduler.py`<br>L4, L7 | Unused Imports | **Low** | **Evidence:** Flake8 flag `F401`: `datetime.time`, module-level `TIMESLOTS`, and `DAYS` are imported but never used at module scope.<br>**Action:** Remove unused imports. |
| `backend/app/routers/curriculum.py`<br>L764 | Unused Variable | **Low** | **Evidence:** Flake8 flag `F841`: Local variable `looking_for_headers` is assigned but never evaluated.<br>**Action:** Remove unused variable. |
| `backend/app/routers/logs.py`<br>L1 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `fastapi.Query` is imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/notifications_router.py`<br>L3 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `typing.List` is imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/schedules.py`<br>L10 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `reportlab.pdfgen.canvas` imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/users.py`<br>L2, L7 | Unused Imports | **Low** | **Evidence:** Flake8 flag `F401`: `shutil` and `typing.List` imported but never used.<br>**Action:** Remove unused imports. |

---

### Category C: Backend Leftover Debugging & Logging Quality

| Location | Issue | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/routers/auth_router.py`<br>L255 | Leftover Debug Print | **Low** | **Evidence:** `print(f"DEBUG AUTH: Setting atlas_token cookie for user {user.email} (is_prod={is_prod})")`.<br>**Action:** Remove debug print statement. |
| `backend/app/routers/curriculum.py`<br>L73 | Raw Print | **Low** | **Evidence:** `print(f"Fallback handling status query error in get_curriculum_blocks: {e}")`.<br>**Action:** Replace with `logger.warning(...)`. |
| `backend/app/routers/ai_scheduler.py`<br>L207 | Raw Print | **Low** | **Evidence:** `print(f"[conflicts] row {getattr(c, 'id', '?')} could not be rendered: ...")`.<br>**Action:** Replace with `logger.warning(...)`. |
| `backend/app/notifications.py` | 25+ Raw Prints | **Low** | **Evidence:** Uses raw `print()` for `[SUCCESS]`, `[ERROR]`, `[TEXTBEE]`, and OTP logging throughout email/SMS dispatches.<br>**Action:** Standardize to Python `logging.getLogger(__name__)`. |

---

### Category D: Backend Architecture & File Length Refactoring

| Component | Issue | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/routers/curriculum.py`<br>(1,210 lines) | Overly Long Router / Embedded Parser Engine | **Medium** | **Evidence:** Function `_process_curriculum_import` (lines 396–1092) spans nearly **700 lines** of complex openpyxl parsing, zone detection, and cell unmerging inside an HTTP router file.<br>**Action:** Extract Excel curriculum parsing engine into a dedicated service `backend/app/services/curriculum_parser.py`. Keep route handler concise. |
| `backend/app/routers/schedules.py`<br>(853 lines) | Overly Long Router / Embedded Exporters | **Medium** | **Evidence:** Functions `export_pdf` (139 lines), `export_excel` (77 lines), and `import_excel_schedule` (120 lines) account for ~340 lines of raw file generation inside the router.<br>**Action:** Extract PDF and Excel rendering to `backend/app/services/schedule_io.py`. |
| `backend/app/services/schedule_generator.py`<br>(489 lines) | Monolithic Heuristic Function | **Medium** | **Evidence:** `generate_schedules` spans 373 continuous lines mixing draft purging, room grouping, overload computation, lecture placement, and laboratory multi-pass placement.<br>**Action:** Decompose into clean internal helper functions (`_calculate_workload_warnings`, `_place_lecture_slot`, `_place_lab_slot`) without changing any heuristics or database interactions. |
| `backend/app/routers/schedules.py`<br>L461–469 | Duplicate Timeslot Definitions | **Low** | **Evidence:** Redefines `TIMESLOTS` and `DAYS` locally inside `get_schedule_suggestions`, duplicating `schedule_generator.py`.<br>**Action:** Import canonical `TIMESLOTS` and `DAYS` from `schedule_generator.py`. |

---

### Category E: Frontend Dead Code, Components & Style Hygiene

| Item / Location | Category | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `frontend/src/components/Table.jsx` | Orphaned Component | **Low** | **Evidence:** 89 lines. Zero imports anywhere in `frontend/src`. Uses legacy unstyled gray Tailwind markup. All active tables use `components/ui/DataTable.jsx`.<br>**Action:** Safely delete orphaned file. |
| `frontend/src/components/shell/ContextBar.jsx` | Orphaned Component | **Low** | **Evidence:** 75 lines. Unused across the application following the removal of the sub-header context bar from `AppShell.jsx`.<br>**Action:** Remove or retain only if intentional future reuse is requested. |
| `frontend/src/components/shell/AppShell.jsx`<br>L21, L23 | ESLint Violations (`no-unused-vars`) | **Low** | **Evidence:** `department` and `isPublished` are declared in props signature but never referenced after removing `ContextBar`. Causes `npm run lint` failure.<br>**Action:** Clean up unused prop parameters. |
| `frontend/src/index.css`<br>L19–25 | Unused CSS Classes | **Low** | **Evidence:** `.scrollbar-hide` is defined but never used across any component.<br>**Action:** Remove dead CSS rule. |
| `frontend/src/index.css`<br>L987–990 | Unused CSS Classes | **Low** | **Evidence:** `.lens-rules-dimmed` is defined but never used in `ConflictLens.jsx`.<br>**Action:** Remove dead CSS rule. |
| `frontend/src/index.css`<br>L799 | Unused CSS Classes | **Low** | **Evidence:** `.auth-enter` is superseded by `.auth-stagger` and `.auth-card-in`.<br>**Action:** Remove unused animation class. |

---

## 2. Risk Assessment & Invariant Guardrails

1. **Database Schema & Migrations Invariant:**
   - **No schema modifications:** Model fields, table names, and foreign key relationships will not be altered.
   - **Alembic migration history:** The baseline migration `80c986b8255f_baseline_schema.py` and `alembic_version` state remain untouched.
2. **Auth, RBAC & Department Scoping Invariant:**
   - Token validation, session versioning, role scoping (`admin`, `program_chair`, `coordinator`), and college isolation (`CAST`, `CBMA`, `CVMAS`, `COED`) are strictly preserved.
3. **Behavioral Invariant:**
   - Timetable constraint satisfaction, schedule generation results, PDF formatting, and Excel curriculum ingestion logic will yield identical outputs.

---

## 3. Staged Implementation Plan

Execution will proceed in distinct, isolated stages. Each stage will be executed, verified, and committed individually with zero cross-contamination.

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: Backend Dependencies & Unused Imports/Schemas      │
├─────────────────────────────────────────────────────────────┤
│ Stage 2: Backend Logging Standardization & Debug Prints     │
├─────────────────────────────────────────────────────────────┤
│ Stage 3: Backend Architectural Modularization (Services)     │
├─────────────────────────────────────────────────────────────┤
│ Stage 4: Frontend Linting, Orphaned Components & Dead CSS   │
├─────────────────────────────────────────────────────────────┤
│ Stage 5: Full Automated Regression Suite & Verification     │
└─────────────────────────────────────────────────────────────┘
```

### Stage 1: Backend Dependencies, Unused Schemas & Imports (Low Risk)
- **Modifications:**
  - `backend/requirements.txt`: Remove `passlib[bcrypt]==1.7.4`.
  - `backend/app/schemas.py`: Remove unused `Token`, `DepartmentCreate`, `DepartmentUpdate`, `DepartmentResponse`.
  - `backend/app/dependencies.py`: Remove orphaned file.
  - `backend/app/routers/academics_router.py`: Migrate to Pydantic v2 `ConfigDict`.
  - Clean up unused imports in `ai_scheduler.py`, `logs.py`, `notifications_router.py`, `schedules.py`, `users.py`, and `curriculum.py` (L764 unused var).
- **Verification:**
  - Run flake8: `flake8 backend/app --select=F401,F841` (0 warnings).
  - Run full test suite: `python -m unittest discover -s tests -t .` (34/34 passing).
  - Verify Pydantic deprecation warning is resolved.

### Stage 2: Backend Logging Standardization & Debug Cleanup (Low Risk)
- **Modifications:**
  - `backend/app/routers/auth_router.py`: Remove line 255 debug print.
  - `backend/app/routers/curriculum.py`: Replace raw print at line 73 with logger.
  - `backend/app/routers/ai_scheduler.py`: Replace raw print at line 207 with logger.
  - `backend/app/notifications.py`: Replace raw `print()` statements with structured logger calls.
- **Verification:**
  - Run test suite: `python -m unittest discover -s tests -t .`.
  - Trigger login / test notification via API to verify log formatting.

### Stage 3: Backend Architectural Modularization (Medium Risk)
- **Modifications:**
  - Extract curriculum Excel parsing logic from `backend/app/routers/curriculum.py` into `backend/app/services/curriculum_parser.py`.
  - Extract PDF/Excel export routines from `backend/app/routers/schedules.py` into `backend/app/services/schedule_io.py`.
  - Decompose monolithic `generate_schedules` in `schedule_generator.py` into cohesive internal sub-functions (`_calculate_workload_warnings`, `_place_lecture_slot`, `_place_lab_slot`).
  - Unify `TIMESLOTS` and `DAYS` imported in `schedules.py`.
- **Verification:**
  - Run test suite: `python -m unittest discover -s tests -t .`.
  - Verify Schedule Generator runs without errors.
  - Verify Excel curriculum parsing and PDF/Excel timetable exports produce identical bytes/structures.

### Stage 4: Frontend Linting, Dead Components & CSS Hygiene (Low Risk)
- **Modifications:**
  - Remove orphaned `frontend/src/components/Table.jsx`.
  - Remove unused `ContextBar.jsx` (or preserve under archive if preferred).
  - Remove unused props (`department`, `isPublished`) from `AppShell.jsx`.
  - Remove unused CSS classes in `frontend/src/index.css` (`.scrollbar-hide`, `.lens-rules-dimmed`, `.auth-enter`).
- **Verification:**
  - Run ESLint: `npm run lint` (0 errors, 0 warnings).
  - Run Vite production build: `npm run build` (0 build errors).

### Stage 5: Final End-to-End Verification & Audit Report
- Run all 34 backend unit/regression tests.
- Verify live frontend and backend endpoints:
  - Authentication (Login / Register / Session check).
  - Schedule generation execution.
  - PDF & Excel export generation.
- Prepare post-cleanup verification summary.

---

## 4. Manual Verification Checklist for Non-Automated Areas

For areas where automated tests do not exercise the UI directly:

| Area | Verification Steps | Expected Result |
| :--- | :--- | :--- |
| **Authentication Flow** | 1. Navigate to `http://localhost:5173/login`<br>2. Sign in with admin credentials<br>3. Verify redirection to `/dashboard` | Session cookie `atlas_token` set; user lands on admin overview. |
| **Curriculum Ingestion** | 1. Go to `/dashboard/curriculum`<br>2. Open Curriculum Import Wizard<br>3. Upload test curriculum `.xlsx` | Parser detects blocks, subjects, and units accurately without server error. |
| **Schedule Generation** | 1. Go to `/dashboard/schedules`<br>2. Click "Generate Schedule"<br>3. Select active term and faculty<br>4. Run generation | Timetable slots populate; room/faculty/workload conflict heuristics execute cleanly. |
| **PDF Timetable Export** | 1. On `/dashboard/schedules`, click "Export PDF"<br>2. Download generated document | Valid landscape PDF opens with institutional header and formatted timetable table. |
| **Excel Timetable Export**| 1. On `/dashboard/schedules`, click "Export Excel"<br>2. Download generated spreadsheet | Valid `.xlsx` workbook opens with styled schedule cells. |
