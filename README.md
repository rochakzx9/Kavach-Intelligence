<div align="center">

# 🛡️ KAVACH INTELLIGENCE

### *AI-Assisted Cybercrime Investigation & Cross-Case Correlation Platform*

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![SQLite](https://img.shields.io/badge/SQLite-SQLAlchemy-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![HTML5](https://img.shields.io/badge/Frontend-HTML5%20%2B%20Vanilla%20JS-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/Guide/HTML/HTML5)
[![License](https://img.shields.io/badge/License-Government%20Bureau%20IP-blueviolet?style=for-the-badge)](#license)

<br/>

> **"Kavach"** (कवच) means *Shield* or *Armour* in Sanskrit.  
> This platform is an assistive toolkit for digital forensics cells and cyber crime bureaus — correlating fragmented evidence, surfacing criminal infrastructure patterns, and producing court-ready investigation reports.

<br/>

</div>

---

## 📖 Table of Contents

| # | Section |
|---|---------|
| 1 | [🔍 What is Kavach Intelligence?](#-what-is-kavach-intelligence) |
| 2 | [✨ Platform Features](#-platform-features) |
| 3 | [🗺️ User Roles & Access Matrix](#️-user-roles--access-matrix) |
| 4 | [🏗️ System Architecture](#️-system-architecture) |
| 5 | [🗄️ Database Schema](#️-database-schema) |
| 6 | [📁 Project Structure](#-project-structure) |
| 7 | [🚀 Quick Start](#-quick-start) |
| 8 | [🔌 API Reference](#-api-reference) |
| 9 | [👥 Demo Credentials](#-demo-credentials) |
| 10 | [🧭 Walkthrough by Role](#-walkthrough-by-role) |
| 11 | [🔒 Security Design](#-security-design) |
| 12 | [📈 Scalability Roadmap](#-scalability-roadmap) |
| 13 | [🤝 Contributing](#-contributing) |

---

## 🔍 What is Kavach Intelligence?

Kavach Intelligence is an **enterprise-grade cybercrime investigation management system** purpose-built for digital forensics cells, police cyber crime bureaus, and financial compliance supervisors.

The platform is built around a **strict assistive, human-in-the-loop paradigm**:
- ✅ It **surfaces indicators**, runs **cross-case heuristics**, and **suggests linkages**
- ✅ All AI recommendations **require analyst confirmation** before being written to active investigations
- ❌ It never autonomously accuses individuals or creates facts not present in uploaded evidence

### Problem Statement

Cyber crime investigations suffer from a fundamental fragmentation problem: the same phone number, Payment handle, or fraudulent domain may appear across dozens of separate cases in different bureaus — yet investigators lack a shared correlation layer. Kavach Intelligence solves this by:

1. **Ingesting digital evidence** (screenshots, transaction records, chat logs, PDFs)
2. **Parsing indicators** (phone numbers, Payment IDs, URLs, email addresses) from uploaded files
3. **Running cross-case correlation** to detect shared criminal infrastructure
4. **Surfacing threat clusters** on a real-time intelligence feed
5. **Generating court-ready investigation reports** with full chain-of-custody logging

---

## ✨ Platform Features

### 🏠 Landing Page & Authentication (`index.html`, `login.html`)
- Glassmorphism-styled marketing landing page with feature showcase
- Secure role-authenticated login portal with JWT session tokens
- Account signup with supervisor approval workflow before access is granted
- Role-based redirect post-login (investigators → dashboard, supervisors → supervisor portal, admins → admin panel)

---

### 📊 Investigator Dashboard (`dashboard.html`)
- **Operational KPI Cards**: Live counts of open cases, high-priority files, pending OCR extractions, and active intelligence alerts
- **Activity Feed**: Real-time case-state changes from colleagues on the same bureau
- **Quick-Access Panel**: Jump directly to active case workspaces or intelligence search
- **Critical Alert Banner**: Highlighted notifications when a new correlation alert affects one of your active cases

---

### 📂 Case Roster & Intake (`cases.html`)
- **Filterable Case Table**: Search and filter by status (`active`, `pending`, `review`, `closed`), priority, and date
- **Structured Intake Form**: Standardized digital crime report with fields for:
  - Scam type, platform, account handle, URL, fraud amount
  - Victim contact details (name, phone, email)
  - Payment method and incident date
- **Evidence Attachments**: Attach up to multiple files (PNG, JPG, PDF, TXT) at case creation
- **Automated ID Assignment**: Cases receive structured IDs (e.g. `CYB-2026-0142`) for chain-of-custody tracking

---

### 🔬 Case Workspace (`case-workspace.html`)
The centrepiece multi-tab workspace for active investigations:

| Tab | Description |
|-----|-------------|
| **Overview** | KPI snapshot — evidence count, extractions, linked alerts, case age |
| **Evidence** | Full file roster with upload date, type badge, and OCR status indicator |
| **Extractions** | Parsed indicators table (phones, UPI, URLs) with per-entity approve/edit/dismiss controls |
| **Correlations** | Cross-case alert feed specific to this case — confirm or dismiss with audit trail |
| **Timeline** | Chronological event log of all case actions with timestamps and actor identity |
| **Related Cases** | Linked cases sharing confirmed indicators — shows link strength score |
| **Report** | Generate a downloadable court-ready investigation brief (TXT format) |

**SVG Relationship Graph**: A live-rendered force-directed node map visualizing entity clusters connecting this case to others sharing confirmed indicators.

---

### 🌐 Intelligence Feed (`intelligence.html`)
- **Category Filter Tabs**: Domain threats | UPI clusters | Phone number rings
- **Indicator Spotlight Table**: High-frequency indicators with occurrence counts across all active bureau cases
- **Threat Card Feed**: Each correlation alert shows — indicator value, confidence level, case IDs affected, timestamp
- **Confirm / Dismiss Actions**: Analyst triage directly from the feed with all decisions audit-logged

---

### 🔎 Federated Search (`intelligence-search.html`)
- Simultaneous query across case titles, case descriptions, and the global intelligence indicator database
- Real-time category filtering (All, Domains, UPI, Phones, Cases)
- Results include match source labelling (which case, which extraction record)
- Recent searches are persisted in the session for quick re-query

---

### 🧑‍⚖️ Supervisor Portal (`supervisor.html`)
- **Gated Role Access**: Automatically renders an access-restricted screen for non-supervisor sessions
- **Review Queue**: Cases submitted by investigators for supervisor sign-off appear in paginated queue
- **Action Panel**: Supervisors can Sign Off (close case), Request Revision (return to investigator), or Escalate
- **Signup Request Management**: Approve or reject pending officer account registrations with optional reason
- **Suspension Workflow**: Forward and verify suspension requests on flagged accounts

---

### 🛠️ Admin Command Centre (`admin.html`)
- **Active Directory Panel**: Live list of all registered users with role, status, bureau, and badge ID
- **Role Cycling**: Promote or demote any account (Investigator → Supervisor → Admin) with single-click
- **Account Activation**: Toggle account active/suspended status with confirmation prompt
- **Audit Log Viewer**: Full searchable log of every platform action — filterable by category (`case`, `login`, `intel`)
- **Signup Request Queue**: Admin-level approval for registration requests

---

### 👮 Moderator Portal (`moderator.html`)
- **Citizen Report Review**: Triage public cybercrime complaints submitted via the citizen portal
- **Approve-to-Case Pipeline**: Convert approved citizen reports directly into formal investigation cases
- **Intelligence Cross-Check**: Run submitted report details against the global indicator database before approving
- **Suspension Requests**: Initiate and track account suspension workflows

---

### 👤 Profile Centre (`profile.html`)
- Investigator identity card with badge ID, bureau, role, and account status
- Editable contact details (phone, address)
- Session and recent activity summary

---

## 🗺️ User Roles & Access Matrix

| Feature / Portal | 👤 Citizen | 🔎 Investigator | 👮 Moderator | 🧑‍⚖️ Supervisor | 🛠️ Admin |
|-----------------|:---------:|:---------------:|:------------:|:---------------:|:--------:|
| Submit crime report | ✅ | — | — | — | — |
| View own cases | — | ✅ | — | — | ✅ |
| Create new case | — | ✅ | ✅* | — | ✅ |
| Upload evidence | — | ✅ | — | — | ✅ |
| Approve extractions | — | ✅ | — | — | ✅ |
| Intelligence feed | — | ✅ | ✅ | ✅ | ✅ |
| Federated search | — | ✅ | ✅ | ✅ | ✅ |
| Confirm correlations | — | ✅ | — | ✅ | ✅ |
| Review citizen reports | — | — | ✅ | — | ✅ |
| Supervisor queue | — | — | — | ✅ | ✅ |
| Sign off cases | — | — | — | ✅ | ✅ |
| User directory | — | — | — | — | ✅ |
| Role management | — | — | — | — | ✅ |
| Audit log access | — | — | — | — | ✅ |

*Moderators convert approved citizen reports into cases

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser Client                        │
│          (Vanilla HTML5 + ES6 JS + CSS3)                │
│                                                         │
│  index.html  →  login.html  →  dashboard.html           │
│  cases.html  →  case-workspace.html                     │
│  intelligence.html  →  intelligence-search.html         │
│  supervisor.html  →  admin.html  →  moderator.html      │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTP/REST (fetch API)
                           │  POST/GET/PATCH requests
                           ▼
┌─────────────────────────────────────────────────────────┐
│               FastAPI Application Server                 │
│              (Uvicorn ASGI — Port 5500)                 │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │   Auth   │  │  Cases   │  │Evidence  │  │ Intel  │ │
│  │  Module  │  │  Module  │  │  Module  │  │ Module │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │Correlat- │  │Supervisor│  │  Admin   │  │ Audit  │ │
│  │  ions    │  │  Module  │  │  Module  │  │ Logger │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                         │
│  app.mount("/", StaticFiles(frontend/))                 │
│  app.mount("/uploads", StaticFiles(uploads/))           │
└──────────────────────────┬──────────────────────────────┘
                           │  SQLAlchemy ORM
                           ▼
┌─────────────────────────────────────────────────────────┐
│                  SQLite Database                         │
│                   (kavach.db)                           │
│                                                         │
│  users │ cases │ evidence_items │ extracted_entities    │
│  intelligence_alerts │ audit_logs │ reports             │
│  citizen_reports │ suspension_requests                  │
└─────────────────────────────────────────────────────────┘
                           │
                    /uploads/ directory
              (Evidence files on local disk)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Zero-build pipeline** | Static frontend mounted inside FastAPI | No Node/npm required for dev. Single server handles both API and UI. |
| **Database** | SQLite via SQLAlchemy | Zero-config for hackathon/demo. Drop-in replaceable with PostgreSQL via `DATABASE_URL` env var. |
| **Auth** | Session token in `localStorage` | Stateless. Token carries role + user ID. Role-gating enforced on both client nav and API endpoints. |
| **Evidence storage** | Local `/uploads` directory | Simple for demo. Designed for S3/R2/MinIO swap via `STORAGE_BACKEND` config in production. |
| **Correlation engine** | Rule-based normalized-value matching | Explainable, no ML black-box for law enforcement use. Phones normalized to E.164, UPI to lowercase. |
| **AI stance** | Assistive only | Extractions and correlations flagged as `suggested` until an investigator explicitly approves them. |

---

## 🗄️ Database Schema

```
┌──────────────────┐     ┌───────────────────────┐
│      users       │     │        cases           │
├──────────────────┤     ├───────────────────────┤
│ id (PK)          │     │ id (PK) e.g CYB-2026  │
│ email            │     │ title                  │
│ password         │     │ description            │
│ name             │     │ status                 │
│ badge_id         │     │ priority               │
│ role             │     │ assignee               │
│ bureau           │     │ creator_id → users.id  │
│ active           │     │ scam_type              │
│ status           │     │ scam_platform          │
│ address / phone  │     │ victim_name / phone    │
└──────────────────┘     │ scam_amount            │
                         └────────────┬──────────┘
                                      │ 1:N
                    ┌─────────────────┴────────────────────┐
                    │                                       │
          ┌─────────▼──────────┐             ┌─────────────▼──────────┐
          │   evidence_items   │             │   extracted_entities    │
          ├────────────────────┤             ├────────────────────────┤
          │ id (PK)            │             │ id (PK)                │
          │ filename           │             │ entity_type            │
          │ filepath           │             │ raw_value              │
          │ type               │  1:N        │ normalized_value       │
          │ ocr_status         ├────────────►│ is_approved            │
          │ case_id → cases.id │             │ is_edited              │
          └────────────────────┘             │ case_id → cases.id     │
                                             │ evidence_id → ev.id    │
                                             └────────────────────────┘

┌────────────────────────┐    ┌───────────────┐    ┌─────────────────────┐
│  intelligence_alerts   │    │  audit_logs   │    │      reports        │
├────────────────────────┤    ├───────────────┤    ├─────────────────────┤
│ id (PK)                │    │ id (PK, auto) │    │ id (PK)             │
│ type (domain/upi/phone)│    │ time          │    │ case_id → cases.id  │
│ headline               │    │ user          │    │ filename            │
│ detail                 │    │ action        │    │ sections_json       │
│ confidence             │    │ category      │    │ notes               │
│ case_ids_json          │    └───────────────┘    └─────────────────────┘
│ detected_at            │
└────────────────────────┘
```

---

## 📁 Project Structure

```
Kavach Intillegence/
│
├── 📄 README.md                      # This file
│
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py               # SQLAlchemy engine, session factory
│   │   ├── main.py                   # All FastAPI routes + static file mounts
│   │   ├── models.py                 # ORM table definitions
│   │   ├── schemas.py                # Pydantic request/response models
│   │   └── seed.py                   # Initial DB seeder (users + audit logs)
│   ├── kavach.db                     # SQLite database file (auto-created)
│   ├── requirements.txt              # Python dependencies
│   └── uploads/                      # Evidence file storage (auto-created)
│
├── frontend/
│   ├── index.html                    # Marketing landing page
│   ├── login.html                    # Authentication portal
│   ├── signup.html                   # Officer registration (pending approval)
│   ├── dashboard.html                # Investigator home KPI panel
│   ├── cases.html                    # Case roster + new case intake
│   ├── case-workspace.html           # 7-tab investigator workspace
│   ├── intelligence.html             # Cross-case intelligence feed
│   ├── intelligence-search.html      # Global federated search
│   ├── supervisor.html               # Supervisor sign-off queue
│   ├── admin.html                    # Admin command centre
│   ├── moderator.html                # Citizen report moderator portal
│   ├── profile.html                  # User profile & identity card
│   │
│   ├── css/
│   │   ├── variables.css             # Design system tokens (colours, fonts, spacing)
│   │   ├── base.css                  # CSS reset and typographic defaults
│   │   ├── layout.css                # Sidebar, topbar, page grid
│   │   ├── components.css            # Cards, buttons, tables, badges, modals
│   │   ├── landing.css               # Landing page-specific styles
│   │   └── responsive.css            # Media queries for tablet/mobile breakpoints
│   │
│   ├── js/
│   │   ├── main.js                   # Landing page interactions
│   │   ├── auth.js                   # Login / logout / session validation
│   │   ├── signup.js                 # Registration form handler
│   │   ├── dashboard.js              # Dashboard KPI fetcher and feed renderer
│   │   ├── cases-page.js             # Case roster, filtering, intake form
│   │   ├── case-workspace.js         # All 7 workspace tabs + SVG graph + report gen
│   │   ├── intelligence.js           # Intelligence feed + confirm/dismiss handlers
│   │   ├── intelligence-search.js    # Federated search and result rendering
│   │   ├── supervisor.js             # Supervisor queue + action handlers
│   │   ├── admin.js                  # Admin user management + audit log viewer
│   │   ├── moderator.js              # Citizen report review + suspend workflow
│   │   └── profile.js                # Profile display and edit handlers
│   │
│   └── assets/                       # Static images and icons
│
└── docs/
    ├── ARCHITECTURE_PLAN.md           # Full system design (ERD, API contracts, modules)
    ├── FRONTEND_PLAN.md               # UI design tokens, layout specs, component library
    └── IMPLEMENTATION_STATUS.md       # Development milestone tracker
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.9+** — [Download](https://python.org/downloads)
- A modern web browser (Chrome, Firefox, Edge)
- No Node.js, Docker, or external databases required

### Step 1 — Clone the repository
```bash
git clone https://github.com/your-username/kavach-intelligence.git
cd "kavach-intelligence"
```

### Step 2 — Set up Python virtual environment
```bash
cd backend

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt
```

### Step 3 — Start the server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 5500
```

The server will:
1. Auto-create the `kavach.db` SQLite database
2. Run the database seeder to create demo users
3. Mount the `/frontend` folder on the root path
4. Mount the `/uploads` folder for evidence file serving

### Step 4 — Open the application
```
http://localhost:5500
```

> **Note**: Always use the FastAPI backend server (Step 3), **not** a simple static file server like `python -m http.server`. The backend handles all API calls. Running only a static server will cause `Unexpected token '<'` JSON parse errors when the frontend tries to call API endpoints.

---

## 🔌 API Reference

### Interactive Docs
When the server is running, full auto-generated Swagger UI is available at:
```
http://localhost:5500/docs
```

### Endpoint Groups

#### 🔐 Authentication
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/login` | Login with email + password, returns session token |
| `POST` | `/api/v1/auth/signup` | Submit registration request (pending approval) |
| `GET` | `/api/v1/auth/me` | Return current user profile from session token |

#### 📊 Dashboard
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/dashboard/summary` | Live KPIs: open cases, pending extractions, active alerts |

#### 📂 Cases
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/cases` | Paginated case list with optional status/priority filters |
| `POST` | `/api/v1/cases` | Create new case (multipart form with evidence files) |
| `GET` | `/api/v1/cases/{case_id}` | Full case detail with all related entities |
| `PATCH` | `/api/v1/cases/{case_id}` | Update case status, priority, or notes |
| `DELETE` | `/api/v1/cases/{case_id}` | Soft-delete case (admin only) |

#### 🔬 Evidence & Extraction
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/cases/{case_id}/evidence` | Upload evidence file, triggers OCR pipeline |
| `GET` | `/api/v1/cases/{case_id}/extractions` | List all parsed indicators for a case |
| `PATCH` | `/api/v1/extractions/{extraction_id}` | Approve, edit, or dismiss an extracted entity |

#### 🌐 Intelligence & Correlations
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/intel/feed` | Paginated intelligence alert feed |
| `GET` | `/api/v1/intel/spotlight` | Top high-frequency indicators across all cases |
| `GET` | `/api/v1/intel/stats` | Alert count statistics by indicator type |
| `GET` | `/api/v1/correlations/{case_id}` | Cross-case alerts relevant to a specific case |
| `POST` | `/api/v1/correlations/{alert_id}/confirm` | Investigator confirms a correlation is valid |
| `POST` | `/api/v1/correlations/{alert_id}/dismiss` | Investigator dismisses a false positive |

#### 🔎 Search
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/search` | Full-text search across cases + intelligence indicators |

#### 🧑‍⚖️ Supervisor
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/supervisor/queue` | Cases in `review` status awaiting sign-off |
| `PATCH` | `/api/v1/cases/{case_id}` | Sign off (close) or return case for revision |
| `GET` | `/api/v1/supervisor/signup-requests` | Pending officer registration requests |
| `POST` | `/api/v1/supervisor/signup-requests/{user_id}/action` | Approve or reject signup |
| `GET` | `/api/v1/supervisor/suspensions` | Suspension requests forwarded for verification |
| `POST` | `/api/v1/supervisor/suspensions/{id}/verify` | Verify or reject a suspension request |

#### 🛠️ Admin
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/users` | Full user directory |
| `PATCH` | `/api/v1/admin/users/{user_id}/role` | Promote or demote user role |
| `PATCH` | `/api/v1/admin/users/{user_id}/toggle-active` | Activate or suspend an account |
| `GET` | `/api/v1/admin/signup-requests` | Admin-level signup request queue |
| `POST` | `/api/v1/admin/signup-requests/{user_id}/action` | Admin approve/reject registration |
| `GET` | `/api/v1/admin/suspensions` | All suspension requests across bureaus |
| `POST` | `/api/v1/admin/suspensions/{id}/action` | Final admin action on suspension |
| `GET` | `/api/v1/audit` | System audit log with category filter |

#### 👮 Moderator & Citizens
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/citizen/reports` | All submitted citizen crime reports |
| `POST` | `/api/v1/citizen/reports/{id}/review` | Approve or reject a citizen report |
| `POST` | `/api/v1/moderator/suspensions` | Initiate a suspension request |

---

## 👥 Demo Credentials

The database is automatically seeded on first run with the following test accounts. **All passwords are `demo123`.**

| Role | Email | Name | Badge |
|------|-------|------|-------|
| 🔎 Investigator | `investigator@cyber.gov` | Priya Sharma | INV-2847 |
| 🔎 Investigator | `amit@cyber.gov` | Amit Khan | INV-2848 |
| 🧑‍⚖️ Supervisor | `supervisor@cyber.gov` | Neha Murthy | SUP-9012 |
| 🛠️ Admin | `admin@cyber.gov` | System Administrator | ADM-2947 |
| ⏳ Pending | `pending_supervisor@cyber.gov` | Pending Supervisor | SUP-9999 |

---

## 🧭 Walkthrough by Role

### 🔎 Investigator Flow

```
Login (investigator@cyber.gov / demo123)
   │
   ├─▶  Dashboard  ─────────────────────────────────────┐
   │      View KPIs: open cases, pending alerts          │
   │                                                     │
   ├─▶  Cases  ──────────────────────────────────────────┤
   │      Click "New Case"                               │
   │      Fill: title, scam type, victim details         │
   │      Attach evidence file (PNG/PDF/TXT)             │
   │      Submit → case created with ID CYB-2026-XXXX   │
   │                                                     │
   ├─▶  Case Workspace (click case in roster)           │
   │      Tab: Evidence → see uploaded file             │
   │      Tab: Extractions → review parsed indicators   │
   │             Approve ✅ | Edit ✏️ | Dismiss ❌       │
   │      Tab: Correlations → cross-case alerts         │
   │             Confirm ✅ | Dismiss ❌                 │
   │      Tab: Report → Generate & Download brief       │
   │                                                     │
   └─▶  Intelligence Feed                               │
          See global indicator alerts from all bureaus  │
          Confirm or dismiss correlations from here too ┘
```

### 🧑‍⚖️ Supervisor Flow

```
Login (supervisor@cyber.gov / demo123)
   │
   └─▶  Supervisor Portal
          Supervisor Queue → cases submitted for review
          Sign Off → case status set to "closed"
          Request Revision → returned to investigator
          Signup Requests → approve/reject new officers
```

### 🛠️ Admin Flow

```
Login (admin@cyber.gov / demo123)
   │
   └─▶  Admin Panel
          User Directory → all registered users
          Toggle Role → promote/demote clearance level
          Toggle Active → suspend or re-activate
          Audit Log → full system event trail
          Signup Requests → admin-level final approval
```

---

## 🔒 Security Design

| Layer | Implementation |
|-------|---------------|
| **Authentication** | Token-based session stored in `localStorage`. Tokens carry `user_id` + `role` |
| **Role Enforcement** | Every protected API endpoint validates the `?token=` or `user_name=` parameter; client-side nav gates are secondary |
| **Evidence Access** | Files served from `/uploads/` — in production, should be served via signed URLs only |
| **Audit Trail** | Every mutation (case update, role change, correlation confirm/dismiss) writes an `AuditLog` row |
| **Chain of Custody** | Extraction approvals and correlation decisions record the acting analyst's name and timestamp |
| **Input Validation** | Pydantic schemas enforce types on all request bodies; SQLAlchemy ORM prevents raw SQL injection |

> **Production Hardening Notes (not yet in MVP)**: Password hashing (bcrypt), HTTPS enforcement, rate limiting on auth endpoints, `HttpOnly` cookie token storage, and row-level permissions per bureau.

---

## 📈 Scalability Roadmap

| Stage | Trigger | Action |
|-------|---------|--------|
| **1** | > 50 concurrent users | Swap SQLite → PostgreSQL via `DATABASE_URL` env var (zero code changes needed — SQLAlchemy ORM handles it) |
| **2** | Heavy evidence volume | Move file storage to S3-compatible object store (R2, MinIO) with pre-signed upload URLs |
| **3** | Slow OCR | Move extraction pipeline to async Celery/RQ background workers |
| **4** | Large graph queries | Materialise correlation tables; add pagination and indexed lookups |
| **5** | Semantic search | Add `pgvector` extension + sentence transformer embeddings for similarity search |
| **6** | Multi-bureau isolation | Add `organization_id` foreign key to all tenant tables |

---

## 🤝 Contributing

This project was developed for a government cyber bureau hackathon and is structured for future institutional adoption. If you are extending this platform:

1. **Fork** the repository
2. Create a feature branch: `git checkout -b feat/your-module-name`
3. Follow the module structure in `docs/ARCHITECTURE_PLAN.md`
4. Ensure all new API routes write to `AuditLog`
5. Submit a Pull Request with a description mapping to a requirement ID (e.g. `FR-06`)

### Code Standards
- **Backend**: PEP 8, type hints on all route parameters, Pydantic schemas for all I/O
- **Frontend**: ES6 modules, no global namespace pollution, IIFE pattern per-page
- **Commits**: Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

---

<div align="center">

**Built with 🛡️ for digital forensics cells and cyber crime bureaus.**

*Kavach Intelligence — Correlate. Investigate. Protect.*

</div>
