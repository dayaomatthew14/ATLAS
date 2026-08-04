# ATLAS: Academic Timetabling System

**De La Salle Araneta University (Tertiary Education)**

![ATLAS Banner](https://img.shields.io/badge/ATLAS-v1.4.0-emerald?style=for-the-badge)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI_0.100+-009688?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/Frontend-React_18-61DAFB?style=for-the-badge&logo=react)
![TailwindCSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwindcss)
![License](https://img.shields.io/badge/License-Proprietary_DLSAU-green?style=for-the-badge)

---

## 🌟 Overview

**ATLAS** (Academic Timetabling System) is an enterprise web application designed exclusively for **System Administrators**, **Program Chairs**, and **Department Coordinators** of **De La Salle Araneta University - Tertiary Education**.

ATLAS automates academic schedule generation and faculty resource management across four major college departments:
- **CAST** — College of Arts, Sciences, and Technology
- **CBMA** — College of Business Management and Accountancy
- **CVMAS** — College of Veterinary Medicine and Agricultural Sciences
- **COED** — College of Education

The platform combines automated Excel curriculum ingestion with block isolation, constraint-satisfaction scheduling heuristics, faculty workload management, interactive conflict detection and resolution, multi-department role-based access control (RBAC), and export functions (PDF/Excel).

---

## 👥 Authenticated System User Roles

ATLAS enforces strict Role-Based Access Control (RBAC) across three authenticated user roles:

1. 👑 **System Administrator (`admin`)**: Master system management, user account administration, active semester activation, system audit logs, and global configuration.
2. 🎓 **Program Chair (`program_chair`)**: Departmental workspace management (CAST, CBMA, CVMAS, COED), Excel curriculum ingestion, faculty workload limits, room management, subject assignments, AI schedule generation, and conflict resolution.
3. 📋 **Coordinator (`coordinator`)**: Departmental scheduling assistance, subject assignment, timetable reviews, conflict resolution, and schedule exports.

> [!NOTE]
> **Faculty Records & Resources**: Faculty members do not log into the system. Instead, faculty profiles are managed as teaching resource records by Program Chairs and Coordinators to track teaching unit caps, subject qualifications, and unavailability schedules.

---

## ✨ Key Features

- 📑 **Excel Curriculum Parser (v1.4)**: Upload `.xlsx` curriculum sheets with automatic program/AY block isolation, merged cell unmerging, and totals row filtering.
- ⚡ **Algorithmic AI Scheduler**: Automated timetable generation handling lecture (unassigned room) and lab (lab/computer room required) slots, faculty workload caps, and unavailability restrictions.
- 🛡️ **Multi-Tenant Department RBAC**: Secure separation between CAST, CBMA, CVMAS, and COED department workspaces.
- ⚠️ **Conflict Detection & Human Handoff**: Identifies schedule overlaps, room shortages, and faculty max unit violations with visual resolution options.
- 📅 **Dynamic Timetable Calendar Grid**: Filterable interactive visual grid for weekly schedules with dark and light UI theme modes.
- 📄 **Export Capabilities**: Generate publication-ready PDF and Excel timetable reports.
- 🔒 **Security & Session Invalidation**: OAuth2 password flow, JWT tokens, OTP email verification, and audit logging.

---

## 📁 Repository Structure

```
ATLAS/
├── backend/                  # FastAPI Python Backend
│   ├── app/
│   │   ├── routers/          # REST API Routers (auth, schedules, curriculum, rooms, etc.)
│   │   ├── services/         # Core Schedule Generator Engine
│   │   ├── models.py         # SQLAlchemy Database Schema
│   │   ├── schemas.py        # Pydantic Schemas & DTOs
│   │   ├── auth.py           # JWT Security & Passlib Hashing
│   │   └── database.py       # SessionLocal & Engine Configuration
│   ├── main.py               # Application Entry Point & DB Migrations
│   ├── seed.py               # Master Admin Seeder
│   └── requirements.txt      # Python Dependencies
├── frontend/                 # React 18 + Vite SPA
│   ├── src/
│   │   ├── pages/            # Views (Dashboard, Login, Schedules, Curriculum, etc.)
│   │   ├── components/       # Modals, Tables, Toast Notifications, Conflict Panel
│   │   ├── utils/            # Axios API client & Conflict detection helpers
│   │   ├── App.jsx           # React Router v6 & RBAC Protected Routes
│   │   └── index.css         # Custom CSS & Tailwind Directives
│   └── package.json          # Node Dependencies
├── docs/                     # Project Technical Documentation
│   ├── SYSTEM_DESIGN.md      # High-Level Architecture & Diagrams
│   ├── DATABASE.md           # ERD & Table Schemas
│   ├── API.md                # Complete REST API Reference
│   ├── USER_GUIDE.md         # Operational Manual per User Role
│   └── SETUP.md              # Installation & Deployment Guide
├── ROADMAP.md                # Sprint Milestones & Release Status
├── side.md                   # AI Scheduling Engine Protocols & Limits
├── ROADMAP_v1_4_PROMPT.md    # Excel Curriculum Parser Master Specification
├── CHANGELOG.md              # Release History
└── CONTRIBUTING.md           # Developer Guidelines
```

---

## 🚀 Quick Start Guide

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows: .\venv\Scripts\activate | On Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python seed.py
uvicorn main:app --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit **`http://localhost:5173`** in your browser. Default Admin Login: `admin@dlsau.edu.ph` / `Admin123!`.

Detailed setup and deployment instructions are available in [docs/SETUP.md](file:///c:/Users/mtthw/GitHub/ATLAS/docs/SETUP.md).

---

## 📚 Technical Documentation

For complete technical specifications, refer to the `docs/` suite:
- 🏗️ [System Architecture & Design](file:///c:/Users/mtthw/GitHub/ATLAS/docs/SYSTEM_DESIGN.md)
- 🗄️ [Database Schema & ERD](file:///c:/Users/mtthw/GitHub/ATLAS/docs/DATABASE.md)
- 🔌 [REST API Reference](file:///c:/Users/mtthw/GitHub/ATLAS/docs/API.md)
- 📖 [User Operational Manual](file:///c:/Users/mtthw/GitHub/ATLAS/docs/USER_GUIDE.md)
- ⚙️ [Setup & Deployment Guide](file:///c:/Users/mtthw/GitHub/ATLAS/docs/SETUP.md)
