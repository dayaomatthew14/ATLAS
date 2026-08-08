# ATLAS — System Brief

**Academic Timetabling System · De La Salle Araneta University (Tertiary Education)**

A web application that turns a university's curriculum, faculty, and room inventory
into a conflict-free weekly class timetable, then publishes it as the official
schedule for a term.

---

## 1. What it is for

Four colleges each build their own timetable, but they draw on shared resources —
the same rooms, the same academic calendar. ATLAS exists to let each college plan
independently while an administrator governs the things that must stay common:
who may act, what may be taught, when, and where.

The core loop:

1. An administrator sets the **active academic term** and maintains the
   **curriculum** for each programme.
2. A **Program Chair** or **Coordinator** registers faculty, sets their unit caps
   and unavailable hours, and assigns subject offerings.
3. The scheduler **generates** a weekly timetable for that college.
4. Conflicts are **resolved one at a time**, each as a deliberate decision.
5. An administrator **publishes** the schedule, which makes it official.

---

## 2. Who uses it

Three roles. Faculty members do **not** log in — they are managed as teaching
resource records.

| Role | Owns |
|---|---|
| **System Administrator** | Institutional reference data: user accounts, colleges & programmes, curriculum, academic terms, rooms. Publishes schedules. |
| **Program Chair** | Their college's operations: faculty, subject offerings, schedule generation, conflict resolution. |
| **Coordinator** | Same as Program Chair, oriented toward General Education subjects. |

**The governing boundary:** the administrator sets the frame; chairs work inside
it. This follows the data model — `Room` has no owning college and is shared
campus infrastructure; `Faculty` belongs to a college. The administrator is
therefore absent from Faculty and schedule editing entirely, rather than being
shown controls that would refuse.

Publishing stays with the administrator deliberately: whoever builds a timetable
should not be the one who declares it official.

---

## 3. Academic taxonomy

Four colleges, twelve degree programmes, seeded as institutional records.

| College | Programmes |
|---|---|
| **CVMAS** — Veterinary Medicine & Agricultural Sciences | `DVM` Doctor of Veterinary Medicine · `BSFT` Food Technology · `BSAGR` Agriculture |
| **CBMA** — Business, Management & Accountancy | `BSAC` Accountancy · `BSBA` Business Administration · `BSHM` Hospitality Management · `BSTM` Tourism Management |
| **COED** — Education | `BEED` Elementary Education · `BSED` Secondary Education |
| **CAST** — Arts, Sciences & Technology | `ABPSY` Psychology · `BSCPE` Computer Engineering · `BSCS` Computer Science |

`BSAGR` and `BSAC` avoid the natural abbreviation `BSA`, which would otherwise
mean both Agriculture and Accountancy. Programme codes print on timetables where
there is no context to tell two identical codes apart.

---

## 4. Architecture

```
ATLAS/
├── backend/          FastAPI · SQLAlchemy · SQLite (dev) / PostgreSQL (prod)
│   ├── app/
│   │   ├── routers/          REST endpoints, one per resource
│   │   ├── services/         schedule_generator.py — the placement engine
│   │   ├── academics.py      the 4 colleges / 12 programmes, seeded at startup
│   │   ├── models.py         SQLAlchemy schema (14 tables)
│   │   └── auth.py           JWT, bcrypt, session versioning
│   └── main.py               entry point, schema sync, taxonomy seeding
└── frontend/         React 18 · Vite · React Router 6 · Tailwind CSS
    └── src/
        ├── components/ui/    design-system primitives
        ├── components/shell/ app shell: top bar, context bar, nav rail
        ├── pages/dashboard/  one screen per destination
        └── utils/session.js  roles and capabilities, single source of truth
```

**Auth.** OAuth2 password flow issuing JWTs, with email/SMS OTP verification on
registration. Tokens carry a `session_version`; changing a password increments it
and invalidates every existing session.

**Schema migration.** `main.py` reconciles model columns against the live table on
every start, so a column added to a model cannot be silently missing in the
database.

---

## 5. The scheduling engine

`backend/app/services/schedule_generator.py` places classes into fixed slots
across a six-day week (Mon–Sat, 07:30–19:30).

- **Lecture blocks** are 90 minutes; **laboratory blocks** are 120 minutes.
- Classes are placed on **day pairs** — Mon/Wed, Tue/Thu, or Fri/Sat — so a
  subject meets twice weekly.
- A subject with both lecture and lab components is split across two different
  day pairs.

Constraints honoured during placement:

- Faculty maximum teaching units (default 18 full-time, 12 part-time)
- Faculty unavailability, edited as a direct-manipulation week grid
- Room type must match the subject: lecture subjects need lecture rooms,
  laboratory subjects need a laboratory or computer laboratory
- No double-booking of a room, a faculty member, or a section

When no conflict-free slot exists, the subject is reported **unplaced with a
reason**. The engine does not force a placement — an earlier version did, which
could double-book an entire term and report success.

---

## 6. Curriculum ingestion

Curriculum is imported from Excel workbooks. The parser detects the correct
sheet by confidence score, handles multi-row headers and merged cells, filters
totals rows, and splits combined `SUBJ101A/B` codes into their lecture and
laboratory parts. Import runs as a **dry run first** — the parsed result is shown
for review and inline correction before anything is committed.

Curriculum is versioned per programme by academic year, and carries a status of
`DRAFT`, `PUBLISHED`, or `ARCHIVED`.

---

## 7. Design system

A token layer in `frontend/src/index.css` and `tailwind.config.js`, consumed
through shared primitives so the interface is recoloured from one place.

- **Palette** — institutional green (`#046A38` primary, `#05301F` chrome), gold
  used only as a seal on the darkest green, and three semantic colours for
  conflict, warning, and information. Every value carries its measured contrast
  ratio in a comment.
- **Typography** — Source Serif 4 for display, IBM Plex Sans for interface, IBM
  Plex Mono for data and identifiers, so figures align in columns.
- **Material** — a glassmorphism layer (`.glass`, `.glass-strong`, `.glass-dark`,
  `.glass-canvas`) with an ambient background wash. Panel fill sits at 72% rather
  than the more common 20–40%: body text sits on these surfaces, and a lighter
  fill lets the backdrop swing effective contrast.
- **Density** — a comfortable/compact toggle that rescales table rows and the
  timetable grid through CSS variables.

**Accessibility.** WCAG 2.1 AA is the target and is measured, not assumed:
composited text contrast is audited across screens in both rail states. The
glass layer degrades to opaque surfaces under `prefers-reduced-transparency` and
where `backdrop-filter` is unsupported. One focus-ring treatment is used
everywhere. The timetable grid is fully keyboard-operable. Schedules have a
dedicated print stylesheet, and unpublished ones print with a `DRAFT` watermark.

---

## 8. Notable safeguards

- **Last administrator cannot be deleted**, and no account can delete itself.
  There is no recovery path if the final administrator is removed — accounts come
  from self-registration and only an administrator can grant the role back.
- **Administrator-initiated password reset** issues a one-time temporary password
  shown once, for users who cannot reach the self-service email reset.
- **Destructive actions name their blast radius** and are refused with a reason
  rather than failing — deleting a term that still holds classes, or a programme
  that still holds curriculum, returns a count and an explanation.
- **Publishing is blocked while conflicts are unresolved.** Posting a timetable
  the system knows is broken is the failure this prevents.
- **Clearing or deleting schedules offers undo/restore.**

---

## 9. Current state

Working and verified:

- Four colleges and twelve programmes seeded; legacy per-user department
  workspaces migrated into them
- Role separation enforced at both the router and the API
- Curriculum import, schedule generation, conflict resolution, publishing
- CSV export and print-to-PDF
- Frontend lint and build clean; backend suite at 12/13

Known open items:

- `test_curriculum_rbac_admin_only_modifications_suite` fails — a Program Chair's
  Excel import is not being refused where the test expects it. Pre-existing.
- One curriculum block (`BS INFORMATION TECHNOLOGY`) belongs to no programme and
  surfaces under **Unassigned** on Colleges & Programmes, awaiting a decision to
  assign or delete.
- `backend/seed.py` resets the administrator password to a value committed in git
  history. It duplicates the hardened startup seeder in `main.py` and should be
  deleted.
- Notification preferences, security questions, and session-timeout settings were
  removed because no backend supported them. They can be rebuilt when endpoints
  exist.

---

## 10. Running it

```bash
# Backend — http://localhost:8000
cd backend && ./venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000

# Frontend — http://localhost:5173
cd frontend && npm install && npm run dev
```

The administrator account is seeded on first start with a generated password
printed once to the console, or taken from `ADMIN_SEED_PASSWORD`.

Further documentation lives in `docs/`: `SYSTEM_DESIGN.md`, `DATABASE.md`,
`API.md`, `USER_GUIDE.md`, and `SETUP.md`.
