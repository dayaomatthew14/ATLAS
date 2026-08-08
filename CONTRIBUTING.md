# Contributing to ATLAS

Thank you for contributing to **ATLAS** (Academic Timetabling System for De La Salle Araneta University).

---

## 1. Important Policies & Rules

> [!IMPORTANT]
> **Commit & Redeploy Policy**: Do not automatically commit or push code changes to remote repositories unless explicitly requested by the project lead.

> [!IMPORTANT]
> **System User Roles**: ATLAS strictly supports three authenticated system user roles: System Administrator (`admin`), Program Chair (`program_chair`), and Coordinator (`coordinator`). Faculty members are teaching staff records managed by authorized users, not system user accounts.

---

## 2. Code Standards & Guidelines

### Backend (Python / FastAPI)
- **Code Style**: Follow PEP 8 guidelines.
- **Type Annotations**: Use Python type hints on function signatures and FastAPI routes.
- **ORM Transactions**: Always handle SQLAlchemy database sessions cleanly (`db.commit()`, `db.rollback()`, `try/except`).
- **Dependencies**: Keep `requirements.txt` updated whenever new packages are added.

### Frontend (React / Vite)
- **Components**: Write functional React components using hooks. Keep component files modular inside `src/pages/` and `src/components/`.
- **Styling**: Utilize Tailwind CSS classes and global CSS variables for dark/light themes (`index.css`).
- **API Interactions**: Centralize REST API calls inside `src/utils/api.js` to ensure consistent JWT Bearer authorization headers.

---

## 3. Development & Testing Workflow

1. Create a feature branch off `main`:
   ```bash
   git clone https://github.com/dayaomatthew14/ATLAS.git
   git checkout -b feature/your-feature-name
   ```
2. Test backend changes using Pytest (if available) or manual endpoint tests via Swagger UI (`http://localhost:8000/docs`).
3. Test frontend changes using `npm run dev` and ensure no console errors occur.
4. Verify all updated or new features against the system documentation in `docs/`.
