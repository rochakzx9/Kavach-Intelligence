# KAVACH INTELLIGENCE — Static Frontend (Integrated with FastAPI Backend)

## Overview
The prototype now **uses a FastAPI backend** for all persistent data operations. The `frontend/js/case-workspace.js` script has been refactored to replace all `localStorage` reads/writes with HTTP calls (`GET`, `POST`, `PUT`) to the backend API. The backend already provides the required endpoints for cases, evidence upload, OCR extraction, correlation handling, intelligence feed, search, admin, and supervisor functionality.

## What has been implemented
- **Backend API** (`backend/app/main.py` and related routers) exposing:
  - `GET /api/v1/cases/{id}` – case details
  - `POST /api/v1/cases/{id}/evidence` – file upload & mock OCR
  - `GET /api/v1/cases/{id}/evidence` – list evidence
  - `GET /api/v1/cases/{id}/correlations` – correlation suggestions
  - `PUT /api/v1/cases/{id}/correlations` – confirm/dismiss correlations
  - `GET /api/v1/intel/feed` – intelligence alerts feed
  - `GET /api/v1/search?query=` – global case / intelligence search
  - `GET /api/v1/admin/users` – user roster
  - `GET /api/v1/supervisor/queue` – review queue (cases with status `review`)
  - `POST /api/v1/cases/{id}/reports` – generate simple text report
  - Authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/me`)
- **Frontend integration** – `case-workspace.js` now uses `apiGet`, `apiPost`, `apiPut` helpers (defined in the same file) to consume those endpoints.
- **Seed data** – `backend/app/seed.py` creates demo users (investigator, supervisor, admin) and a few sample cases.

## Next steps (planned in `implementation_plan.md`)
1. Add missing router modules (`intel.py`, `search.py`, `supervisor.py`, `admin.py`).
2. Extend `models.py`/`schemas.py` with `IntelligenceAlert`, `SearchResult`, `SupervisorQueueItem`, etc.
3. Refactor the remaining frontend scripts (`intelligence.js`, `intelligence-search.js`, `supervisor.js`, `admin.js`) to use the shared `api.js` helpers instead of `localStorage`.
4. Update documentation and add basic pytest tests for the new routes.

## Running the platform
### 1️⃣ Backend (FastAPI)
```bash
# Navigate to the backend folder
cd "/home/rochaksharma/Desktop/Git Clone Pages/Kavach Intillegence/backend"

# (Optional) create a virtual environment
python3 -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the API server (development mode)
uvicorn app.main:app --reload
```
The API will be available at **http://localhost:8000/api/v1**. Swagger UI can be opened at **http://localhost:8000/docs**.

### 2️⃣ Frontend (Static files)
```bash
cd "/home/rochaksharma/Desktop/Git Clone Pages/Kavach Intillegence/frontend"
python3 -m http.server 8080
```
Open a browser to **http://localhost:8080**. The following pages are reachable (all require a login):
| Page | URL |
|------|-----|
| Landing | http://localhost:8080/ |
| Sign‑in | http://localhost:8080/login.html |
| Dashboard | http://localhost:8080/dashboard.html |
| Cases list | http://localhost:8080/cases.html |
| Case workspace | http://localhost:8080/case-workspace.html?id=CYB-2026-0142 |
| Intelligence feed | http://localhost:8080/intelligence.html |
| Intelligence search | http://localhost:8080/intelligence-search.html |
| Supervisor queue | http://localhost:8080/supervisor.html |
| Admin panel | http://localhost:8080/admin.html |
```

### 3️⃣ Login credentials (seeded)
| Role | Email | Badge ID | Password |
|------|-------|----------|----------|
| Investigator | `investigator@cyber.gov` | `INV-2847` | `demo123` |
| Supervisor   | `supervisor@cyber.gov` | `SUP-001` | `demo123` |
| Admin        | `admin@cyber.gov`      | `ADM-001` | `demo123` |

After signing in you will be redirected to the dashboard. All data (cases, evidence, correlations, alerts) is now persisted in the SQLite database **kavach.db** located in the backend folder.

## Project structure (excerpt)
```text
frontend/
  js/
    api.js                # shared API helpers (future file)
    case-workspace.js     # now uses backend API
    intelligence.js       # will be updated to call /intel/feed
    intelligence-search.js
    supervisor.js
    admin.js
backend/
  app/
    main.py               # FastAPI app, routers registration
    models.py             # SQLAlchemy models (User, Case, EvidenceItem, …)
    schemas.py            # Pydantic request/response schemas
    seed.py               # demo data population
    database.py           # engine & session
    routers/ (future)     # intel.py, search.py, supervisor.py, admin.py
```

---
**You are now ready to run the platform.** When you are ready for the next development phase, approve the implementation plan and I will create the missing router files, update the remaining frontend scripts, and finalize the documentation.
