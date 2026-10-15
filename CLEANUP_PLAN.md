# ATLAS Comprehensive Codebase Audit & Cleanup Plan

> **Status:** Stage 1 Approved & In Progress  
> **Author:** Senior Engineering Codebase Audit  
> **Target:** ATLAS Timetable Management System (FastAPI + SQLAlchemy 2.0 / React 18 + Vite)

---

## Baseline Verification Record (Pre-Cleanup)

Before applying any modifications, the entire test and lint suite was executed to establish an unambiguous baseline:

| Test / Check Suite | Command | Baseline Status | Details |
| :--- | :--- | :---: | :--- |
| **Python Unit & Regression Tests** | `python -m unittest discover -s tests -t .` | **PASS (34/34)** | All 34 tests pass in 4.46s. Emits 1 runtime warning: `PydanticDeprecatedSince20` at `academics_router.py:23`. |
| **Backend Flake8 Lint** | `flake8 backend/app --select=F401,F841` | **9 Violations** | Unused imports in `ai_scheduler.py` (3), `logs.py` (1), `notifications_router.py` (1), `schedules.py` (1), `users.py` (2); unused local variable in `curriculum.py:L764` (1). |
| **Frontend ESLint** | `npm run lint` | **2 Violations** | `AppShell.jsx`: `department` and `isPublished` are defined but never used (`no-unused-vars`). |
| **Frontend Production Build** | `npm run build` | **PASS (0 Errors)** | Vite v4.5.14 builds bundle cleanly (`dist/` generated). |

---

## 1. Audit Findings by Category

### Category A: Backend Dependencies (`backend/requirements.txt`)

| Package | Status | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `passlib[bcrypt]==1.7.4` | **Unused** | **Low** | **Evidence:** `backend/app/auth.py` imports and uses `bcrypt` directly (`bcrypt.checkpw`, `bcrypt.hashpw`). Nowhere in the backend codebase is `passlib` imported or called. Moreover, `passlib 1.7.4` has a known incompatibility with modern `bcrypt` (`__about__` attribute error).<br>**Action:** Remove `passlib[bcrypt]` from `requirements.txt`. Keep `bcrypt==5.0.0` pinned. |
| `bcrypt==5.0.0` | **Active / Used** | **N/A** | **Evidence:** Directly imported and used in `auth.py` for salted password hashing. Retain pinned. |
| `openpyxl==3.1.5` | **Active / Used** | **N/A** | **Evidence:** Heavily imported and used in `curriculum.py` (Excel ingestion) and `schedules.py` (schedule export/import). Retain pinned. |
| `reportlab==5.0.0` | **Active / Used** | **N/A** | **Evidence:** Used in `backend/app/routers/schedules.py` for PDF timetable generation and export. Retain pinned. |
| `psycopg2-binary==2.9.12`| **Active / Used** | **N/A** | **Evidence:** Required for PostgreSQL connectivity when running in production/Railway. Retain pinned. |
| `python-jose[cryptography]==3.5.0` | **Active / Used** | **N/A** | **Evidence:** Used in `auth.py` for JWT signing and decoding. Retain pinned. |
| `requests==2.34.2` | **Active / Used** | **N/A** | **Evidence:** Used in `notifications.py` for external SMS OTP delivery via TextBee. Retain pinned. |

---

### Category B: Frontend Dependencies (`frontend/package.json`)

| Package | Type | Status | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `react`, `react-dom` (^18.2.0) | Dependency | **Active / Used** | Core view layer. Retain. |
| `lucide-react` (^0.292.0) | Dependency | **Active / Used** | SVG icon primitives. Retain. |
| `react-router-dom` (^6.20.0) | Dependency | **Active / Used** | Client-side routing. Retain. |
| All 11 devDependencies | DevDependency | **Active / Used** | `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `autoprefixer`, `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `postcss`, `tailwindcss`, `vite` are all actively invoked by the build and lint pipeline.<br>**Verdict:** **Zero unused packages in package.json**. |

---

### Category C: Assets, Lucide Icons & Alembic Migrations

| Area | Audit Target | Status | Finding & Evidence |
| :--- | :--- | :---: | :--- |
| **Static Assets** | `frontend/public/` | **100% Active** | Only two assets exist: `atlas_logo.png` (medallion emblem) and `dlsau_bg.jpg` (atmospheric campus backdrop). Both are actively rendered across Landing, Login, and TopBar. Zero orphaned media. |
| **Lucide Icons** | All JSX/JS imports from `lucide-react` | **100% Active** | An exhaustive AST / regex scan across all 35 components and pages found **zero unused icon imports**. Every imported icon is rendered in the JSX. |
| **Alembic Migrations** | `backend/alembic/versions/` | **Clean & Valid** | Exactly one baseline migration exists: `80c986b8255f_baseline_schema.py`. It accurately models all 14 database tables. `tests/test_migrations.py` confirms clean bidirectional upgrade/downgrade and zero schema drift (`autogenerate` diff is empty). No redundant or stale migrations exist. |

---

### Category D: Operational Scripts & Database Files

| File / Script | Category | Verdict & Rationale |
| :--- | :--- | :--- |
| `start_atlas.bat` (Root) | Utility Script | **Retain.** Canonical one-click developer script to start both FastAPI backend and Vite frontend dev servers. |
| `backend/atlas_v3.db` | Development Database | **Retain (Local only).** Active SQLite development database defined as default fallback in `app/database.py:6`. Keep gitignored. |
| `backend/run_seed.bat` & `seed.py` | Seeder Utility | **Retain.** Required to initialize or reset master administrator credentials across fresh installations. |
| `backend/run_server.bat` | Convenience Starter | **Retain.** Secondary quick-start script for uvicorn inside the backend venv. |
| `backend/audit_departments.py` | Maintenance CLI | **Retain.** Critical maintenance tool for detecting, reassigning, or safely pruning orphaned legacy department rows in production. |
| `backend/reset_environment.py` | Testing Utility | **Retain.** Safe teardown utility to return staging or demo databases to clean states without deleting institutional taxonomy. |
| `backend/send_test_email.py` | Diagnostic CLI | **Retain.** Verifies SMTP / TextBee credentials and email deliverability without touching database state. |
| `backend/inspect_database.py` | Diagnostic CLI | **Retain.** Quick console inspection tool for reviewing registered users, departments, and verification states across SQLite and Railway. |

---

### Category E: Backend Dead Code, Unused Imports & Deprecations

| Item / Location | Category | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/dependencies.py` | Orphaned File | **Low** | **Evidence:** Defines `require_admin` and `require_program_chair`. Zero files in the entire project import `dependencies.py` (routers use inline checks or `_require_admin` in `academics_router.py`).<br>**Action:** Safely delete orphaned file. |
| `backend/app/schemas.py`<br>`Token` (L130) | Unused Schema | **Low** | **Evidence:** `auth_router.py` returns dictionary payloads directly (`{"access_token": ...}`) and never binds `response_model=schemas.Token`.<br>**Action:** Remove unused schema. |
| `backend/app/schemas.py`<br>`DepartmentCreate`, `DepartmentUpdate`, `DepartmentResponse` (L202–212) | Unused Schemas | **Low** | **Evidence:** Obsolete legacy schemas superseded by `CollegeOut`, `ProgramOut` in `academics_router.py`. Zero references across backend.<br>**Action:** Remove unused schemas. |
| `backend/app/routers/academics_router.py`<br>L31–32 | Pydantic Deprecation | **Low** | **Evidence:** Uses Pydantic v1 `class Config: from_attributes = True`, raising `PydanticDeprecatedSince20` on every test run and startup.<br>**Action:** Update to Pydantic v2 `model_config = ConfigDict(from_attributes=True)`. |
| `backend/app/routers/ai_scheduler.py`<br>L4, L7 | Unused Imports | **Low** | **Evidence:** Flake8 flag `F401`: `datetime.time`, module-level `TIMESLOTS`, and `DAYS` are imported but never used at module scope.<br>**Action:** Remove unused imports. |
| `backend/app/routers/curriculum.py`<br>L764 | Unused Variable | **Low** | **Evidence:** Flake8 flag `F841`: Local variable `looking_for_headers` is assigned but never evaluated.<br>**Action:** Remove unused variable. |
| `backend/app/routers/logs.py`<br>L1 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `fastapi.Query` is imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/notifications_router.py`<br>L3 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `typing.List` is imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/schedules.py`<br>L10 | Unused Import | **Low** | **Evidence:** Flake8 flag `F401`: `reportlab.pdfgen.canvas` imported but never used.<br>**Action:** Remove unused import. |
| `backend/app/routers/users.py`<br>L2, L7 | Unused Imports | **Low** | **Evidence:** Flake8 flag `F401`: `shutil` and `typing.List` imported but never used.<br>**Action:** Remove unused imports. |

---

### Category F: Backend Leftover Debugging & Logging Quality

| Location | Issue | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/routers/auth_router.py`<br>L255 | Leftover Debug Print | **Low** | **Evidence:** `print(f"DEBUG AUTH: Setting atlas_token cookie for user {user.email} (is_prod={is_prod})")`.<br>**Action:** Remove debug print statement. |
| `backend/app/routers/curriculum.py`<br>L73 | Raw Print | **Low** | **Evidence:** `print(f"Fallback handling status query error in get_curriculum_blocks: {e}")`.<br>**Action:** Replace with `logger.warning(...)`. |
| `backend/app/routers/ai_scheduler.py`<br>L207 | Raw Print | **Low** | **Evidence:** `print(f"[conflicts] row {getattr(c, 'id', '?')} could not be rendered: ...")`.<br>**Action:** Replace with `logger.warning(...)`. |
| `backend/app/notifications.py` | 25+ Raw Prints | **Low** | **Evidence:** Uses raw `print()` for `[SUCCESS]`, `[ERROR]`, `[TEXTBEE]`, and OTP logging throughout email/SMS dispatches.<br>**Action:** Standardize to Python `logging.getLogger(__name__)`. |

---

### Category G: Backend Architecture & File Length Refactoring

| Component | Issue | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `backend/app/routers/curriculum.py`<br>(1,210 lines) | Overly Long Router / Embedded Parser Engine | **Medium** | **Evidence:** Function `_process_curriculum_import` (lines 396–1092) spans nearly **700 lines** of complex openpyxl parsing inside an HTTP router file.<br>**Action:** Extract Excel curriculum parsing engine into a dedicated service `backend/app/services/curriculum_parser.py`. Keep route handler concise. |
| `backend/app/routers/schedules.py`<br>(853 lines) | Overly Long Router / Embedded Exporters | **Medium** | **Evidence:** Functions `export_pdf` (139 lines), `export_excel` (77 lines), and `import_excel_schedule` (120 lines) account for ~340 lines of raw file generation inside the router.<br>**Action:** Extract PDF and Excel rendering to `backend/app/services/schedule_io.py`. |
| `backend/app/services/schedule_generator.py`<br>(489 lines) | Monolithic Heuristic Function | **Medium** | **Evidence:** `generate_schedules` spans 373 continuous lines mixing draft purging, room grouping, overload computation, lecture placement, and laboratory multi-pass placement.<br>**Action:** Precede with a characterization test on fixed inputs, then decompose into clean internal helpers (`_calculate_workload_warnings`, `_place_lecture_slot`, `_place_lab_slot`) verifying identical output. |
| `backend/app/routers/schedules.py`<br>L461–469 | Duplicate Timeslot Definitions | **Low** | **Evidence:** Redefines `TIMESLOTS` and `DAYS` locally inside `get_schedule_suggestions`, duplicating `schedule_generator.py`.<br>**Action:** Import canonical `TIMESLOTS` and `DAYS` from `schedule_generator.py`. |

---

### Category H: Frontend Dead Code, Components & Style Hygiene

| Item / Location | Category | Risk Level | Evidence & Recommendation |
| :--- | :--- | :---: | :--- |
| `frontend/src/components/Table.jsx` | Orphaned Component | **Low** | **Evidence:** 89 lines. Zero imports anywhere in `frontend/src`. Uses legacy unstyled gray Tailwind markup. All active tables use `components/ui/DataTable.jsx`.<br>**Action:** Safely delete orphaned file. |
| `frontend/src/components/shell/ContextBar.jsx` | Orphaned Component | **Low** | **Evidence:** 75 lines. Unused across the application following the removal of the sub-header context bar from `AppShell.jsx`.<br>**Action:** Safely delete orphaned file. |
| `frontend/src/components/shell/AppShell.jsx`<br>L21, L23 | ESLint Violations (`no-unused-vars`) | **Low** | **Evidence:** `department` and `isPublished` are declared in props signature but never referenced after removing `ContextBar`. Causes `npm run lint` failure.<br>**Action:** Clean up unused prop parameters. |
| `frontend/src/index.css`<br>L19–25 | Unused CSS Classes | **Low** | **Evidence:** `.scrollbar-hide` is defined but never used across any component.<br>**Action:** Remove dead CSS rule. |
| `frontend/src/index.css`<br>L987–990 | Unused CSS Classes | **Low** | **Evidence:** `.lens-rules-dimmed` is defined but never used in `ConflictLens.jsx`.<br>**Action:** Remove dead CSS rule. |
| `frontend/src/index.css`<br>L799 | Unused CSS Classes | **Low** | **Evidence:** `.auth-enter` is superseded by `.auth-stagger` and `.auth-card-in`.<br>**Action:** Remove unused animation class. |

---

## 2. Invariant Guardrails

1. **Database Schema & Migrations Invariant:**
   - **No schema modifications:** Model fields, table names, and foreign key relationships will not be altered.
   - **Alembic migration history:** The baseline migration `80c986b8255f_baseline_schema.py` and `alembic_version` state remain untouched.
2. **Auth, RBAC & Department Scoping Invariant:**
   - Token validation, session versioning, role scoping (`admin`, `program_chair`, `coordinator`), and college isolation (`CAST`, `CBMA`, `CVMAS`, `COED`) are strictly preserved.
3. **Core Import Integrity:**
   - No imports in `main.py`, `models.py`, or `__init__.py` files will be modified without verifying side-effect neutrality.

---

## 3. Staged Implementation Plan (One Commit per Group)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Backend Dependencies & Dead Code / Imports / Schemas (CURRENT) │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 2: Backend Logging Standardization & Debug Prints Cleanup        │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 3a: Schedule Generator Characterization Test & Refactor          │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 3b: Curriculum Parser Service Extraction (curriculum_parser.py)  │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 3c: Schedule Exporter Service Extraction (schedule_io.py)        │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 4: Frontend Linting, Dead Components & CSS Token Hygiene         │
├────────────────────────────────────────────────────────────────────────┤
│ Stage 5: Final End-to-End Verification & Audit Report                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Stage 1: Backend Dependencies, Unused Schemas & Imports (CURRENT STAGE)
- **Modifications:**
  - `backend/requirements.txt`: Remove `passlib[bcrypt]==1.7.4`. Keep `bcrypt==5.0.0` pinned.
  - `backend/app/schemas.py`: Remove unused `Token`, `DepartmentCreate`, `DepartmentUpdate`, `DepartmentResponse`.
  - `backend/app/dependencies.py`: Delete orphaned file.
  - `backend/app/routers/academics_router.py`: Migrate to Pydantic v2 `ConfigDict(from_attributes=True)`.
  - Clean up unused imports in:
    - `backend/app/routers/ai_scheduler.py` (unused `datetime.time`, module-level `TIMESLOTS`, `DAYS`).
    - `backend/app/routers/curriculum.py` (unused variable `looking_for_headers` at L764).
    - `backend/app/routers/logs.py` (unused `fastapi.Query`).
    - `backend/app/routers/notifications_router.py` (unused `typing.List`).
    - `backend/app/routers/schedules.py` (unused `reportlab.pdfgen.canvas`).
    - `backend/app/routers/users.py` (unused `shutil`, `typing.List`).
- **Commit:** `refactor(backend): remove unused dependencies, schemas, and dead imports (Stage 1)`

### Stage 2: Backend Logging Standardization & Debug Cleanup
- **Modifications:**
  - `backend/app/routers/auth_router.py`: Remove line 255 debug print.
  - `backend/app/routers/curriculum.py`: Replace raw print at line 73 with logger.
  - `backend/app/routers/ai_scheduler.py`: Replace raw print at line 207 with logger.
  - `backend/app/notifications.py`: Replace raw `print()` statements with structured logger calls.
- **Commit:** `refactor(backend): standardize logging and remove debug prints (Stage 2)`

### Stage 3: Backend Architectural Modularization (3 Separate Commits)
- **Commit 3a (`schedule_generator.py`):**
  - Add characterization test `tests/test_schedule_generator_characterization.py` executing `generate_schedules` with a seeded dataset and recording exact deterministic slot placement output.
  - Decompose monolithic `generate_schedules` in `schedule_generator.py` into cohesive internal sub-functions (`_calculate_workload_warnings`, `_place_lecture_slot`, `_place_lab_slot`).
  - Run characterization test to prove 100% byte-for-byte identical output.
  - Commit message: `refactor(backend): add characterization test and modularize schedule generator (Stage 3a)`
- **Commit 3b (`curriculum_parser.py`):**
  - Extract Excel curriculum parsing logic from `backend/app/routers/curriculum.py` into `backend/app/services/curriculum_parser.py`.
  - Commit message: `refactor(backend): extract curriculum Excel parser to service module (Stage 3b)`
- **Commit 3c (`schedule_io.py`):**
  - Extract PDF and Excel timetable export routines from `backend/app/routers/schedules.py` into `backend/app/services/schedule_io.py`.
  - Unify `TIMESLOTS` and `DAYS` imports.
  - Commit message: `refactor(backend): extract schedule export routines to service module (Stage 3c)`

### Stage 4: Frontend Linting, Dead Components & CSS Hygiene
- **Modifications:**
  - Remove orphaned `frontend/src/components/Table.jsx`.
  - Remove orphaned `frontend/src/components/shell/ContextBar.jsx`.
  - Clean up unused props (`department`, `isPublished`) in `AppShell.jsx` to resolve ESLint errors.
  - Clean up unused CSS classes in `frontend/src/index.css` (`.scrollbar-hide`, `.lens-rules-dimmed`, `.auth-enter`).
- **Commit:** `refactor(frontend): clean up orphaned components, unused props, and dead CSS (Stage 4)`

### Stage 5: Final End-to-End Verification & Audit Report
- Run all unit and regression tests, linter, production build, and generate final audit report.

---

## 4. Manual Verification Checklist for Non-Automated Areas

| Area | Verification Steps | Expected Result |
| :--- | :--- | :--- |
| **Authentication Flow** | 1. Navigate to `http://localhost:5173/login`<br>2. Sign in with admin credentials<br>3. Verify redirection to `/dashboard` | Session cookie `atlas_token` set; user lands on admin overview. |
| **Curriculum Ingestion** | 1. Go to `/dashboard/curriculum`<br>2. Open Curriculum Import Wizard<br>3. Upload test curriculum `.xlsx` | Parser detects blocks, subjects, and units accurately without server error. |
| **Schedule Generation** | 1. Go to `/dashboard/schedules`<br>2. Click "Generate Schedule"<br>3. Select active term and faculty<br>4. Run generation | Timetable slots populate; room/faculty/workload conflict heuristics execute cleanly. |
| **PDF Timetable Export** | 1. On `/dashboard/schedules`, click "Export PDF"<br>2. Download generated document | Valid landscape PDF opens with institutional header and formatted timetable table. |
| **Excel Timetable Export**| 1. On `/dashboard/schedules`, click "Export Excel"<br>2. Download generated spreadsheet | Valid `.xlsx` workbook opens with styled schedule cells. |
