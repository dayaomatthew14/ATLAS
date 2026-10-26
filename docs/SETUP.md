# Installation, Configuration & Deployment Guide — ATLAS

**Academic Timetabling System (De La Salle Araneta University - Tertiary Education)**

---

## 1. Prerequisites

Ensure your development environment meets the following software requirements before setting up ATLAS:

- **Python**: Version `3.10` or higher (`3.11` recommended)
- **Node.js**: Version `18.x` or higher (`20.x` LTS recommended)
- **Package Manager**: `npm` (v9+) or `yarn` / `pnpm`
- **Git**: Latest version
- **Database (Optional)**: PostgreSQL (v14+) for production deployments. SQLite comes pre-configured for local development.

---

## 2. Local Environment Setup

### 2.1 Cloning the Repository
```bash
git clone https://github.com/dayaomatthew14/ATLAS.git
cd ATLAS
```

---

### 2.2 Backend Setup (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   - **Windows (PowerShell / CMD)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **Linux / macOS**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
3. Install backend dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create `.env` file in `backend/` — copy `backend/.env.example` and fill in
   `SECRET_KEY`:
   ```env
   SECRET_KEY=your_secure_random_secret_key_here
   ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
   ENV=development
   ```
   Leave `DATABASE_URL` out. Unset is what selects the local SQLite file; a
   value here is a live connection to whatever it names, and pointing a
   developer machine at a deployed database is how local work silently becomes
   production work.
5. Initialize and seed the Dean Administrator accounts (`dean.cast@dlsau.edu.ph`, etc.):
   ```bash
   python seed.py
   ```
6. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
   *The backend server will run on `http://127.0.0.1:8000` with interactive API docs available at `http://127.0.0.1:8000/docs`.*

---

### 2.3 Frontend Setup (Vite + React)

1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file in `frontend/`:
   ```env
   VITE_API_URL=http://127.0.0.1:8000/api
   ```
4. Launch the Vite development server:
   ```bash
   npm run dev
   ```
   *The React SPA will launch at `http://localhost:5173`.*

---

### 2.4 One-Click Launch (Windows Helper Scripts)
In the root directory, you can launch both services using batch files:
- **`start_atlas.bat`**: Launches backend Uvicorn server and frontend Vite server concurrently.
- **`backend/run_server.bat`**: Activates backend virtualenv and starts Uvicorn.
- **`backend/run_seed.bat`**: Activates backend virtualenv and seeds the Dean Administrator accounts.

The frontend has no batch wrapper: `npm run dev` in `frontend/` is the command,
and `start_atlas.bat` already runs it.

---

## 3. System User Accounts & Roles

ATLAS supports exactly two authenticated user roles:
1. `admin` (Administrator / College Dean — Department-Isolated)
2. `program_chair` (User / Program Chair — Department Scope)

### Pre-seeded College Dean Administrator Accounts
College Deans serve as the Administrators for their respective departments. Four official accounts are automatically seeded at backend startup:
- **CAST**: `dean.cast@dlsau.edu.ph`
- **CBMA**: `dean.cbma@dlsau.edu.ph`
- **COED**: `dean.coed@dlsau.edu.ph`
- **CVMAS**: `dean.cvmas@dlsau.edu.ph`
- **Initial Password**: `DeanPassword123!` (or configured via `DEAN_SEED_PASSWORD`)

### Program Chair Registration & Governance
- Public self-registration is strictly restricted to **Program Chairs** selecting their designated college. Attempts to register as an Administrator or Dean are rejected with HTTP 403.
- College Deans manage, verify, and issue temporary passwords for Program Chairs within their college from the **Users** page (`/dashboard/users`).

---

## 4. Environment Variables Reference

### Backend (`backend/.env`)

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `SECRET_KEY` | **Yes** | `<random-hex-string>` | Secret key for signing JWT tokens |
| `DATABASE_URL` | Optional | `sqlite:///./atlas_v3.db` | Database connection URI (PostgreSQL or SQLite) |
| `ALLOWED_ORIGINS` | Optional | `http://localhost:5173` | Comma-separated CORS allowed origin URLs |
| `ENV` | Optional | `development` | Environment mode (`development` | `production`) |
| `DEAN_SEED_PASSWORD` | Optional | `DeanPassword123!` | Initial password for pre-seeded Dean accounts |
| `TEXTBEE_API_KEY` | Optional | `<api-key>` | SMS OTP service integration key |
| `TEXTBEE_DEVICE_ID` | Optional | `<device-id>` | SMS device ID |

### Frontend (`frontend/.env`)

| Variable Name | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_API_URL` | **Yes** | `http://127.0.0.1:8000/api` | Base URL for FastAPI backend endpoints |

---

## 5. Docker Containerization & Production Deployment

### 5.1 Running via Docker
1. Build the backend Docker image:
   ```bash
   cd backend
   docker build -t atlas-backend .
   ```
2. Run the container:
   ```bash
   docker run -d -p 8000:8000 --env-file .env --name atlas-backend-container atlas-backend
   ```

### 5.2 Production Deployment Architecture

These are the services ATLAS actually runs on, not a list of options. Naming
one platform per role is deliberate: the previous version listed alternatives
for each, and a developer machine ended up pointed at a database on a platform
nobody was deploying to.

- **Frontend SPA**: Vercel (`frontend/vercel.json` included). `VITE_API_URL`
  must be set to the full backend URL at build time — Vite inlines it, so
  changing the variable has no effect until the frontend is rebuilt.
- **Backend Service**: Railway, from `backend/Dockerfile`.
- **Database**: Railway PostgreSQL. The service supplies `DATABASE_URL`; nothing
  else should set it.

Local development uses SQLite and leaves `DATABASE_URL` unset. Never point a
developer machine at the deployed database — see `backend/.env.example`.

---

## 6. Troubleshooting & FAQ

### 1. `Database is locked` Error (SQLite)
- **Cause**: SQLite single-writer lock when multiple concurrent requests write to database.
- **Solution**: Restart backend server or configure a PostgreSQL connection URI in `DATABASE_URL`.

### 2. CORS Policy Blocked
- **Cause**: Frontend origin not included in backend CORS whitelist.
- **Solution**: Add your frontend URL (e.g. `http://localhost:5173`) to `ALLOWED_ORIGINS` in `backend/.env`.

### 3. Invalid Token / 401 Unauthorized
- **Cause**: JWT token expired, unauthorized role, or invalid `SECRET_KEY`.
- **Solution**: Clear browser localStorage (`atlas_token`) and log in as an authorized user (`admin`, `program_chair`).
