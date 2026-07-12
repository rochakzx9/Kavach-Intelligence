import os
import json
import uuid
import re
import logging
from urllib.parse import urlparse
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from .database import engine, Base, get_db
from .models import (
    User, Case, EvidenceItem, ExtractedEntity,
    IntelligenceAlert, AuditLog, Report,
    CitizenReport, SuspensionRequest
)

from .schemas import (
    UserLogin, LoginResponse, UserProfile,
    CaseCreate, CaseResponse, CaseDetailResponse, CaseUpdate,
    EvidenceResponse, ExtractedEntityResponse, ExtractedEntityUpdate,
    IntelAlertResponse, AuditLogResponse, ReportCreate, ReportResponse,
    UserUpdateRole, ManualEntityCreate,
    UserSignup, UserUpdateProfile,
    CitizenReportCreate, CitizenReportResponse, CitizenReportReview,
    SuspensionRequestCreate, SuspensionRequestResponse, SignupRequestReview
)

from .seed import seed_db
from .security import hash_password, verify_password, create_access_token, verify_access_token

# Configure standard Python logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("kavach")

# Configure dynamically loaded environment variables
UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", "uploads")
APP_ENV = os.getenv("APP_ENV", "development")
BASE_URL = os.getenv("BASE_URL", "")

app = FastAPI(title="Kavach Intelligence API", version="1.0")

# Enable CORS for local static frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For local development / multi-origin API access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Secure HTTP Headers Middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; "
        "style-src 'self' 'unsafe-inline' https:; "
        "img-src 'self' data: http: https:; "
        "connect-src 'self' ws: wss: http: https:;"
    )
    return response

# Global Exception Handlers - prevent stack traces leaking in production
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

from fastapi.exceptions import RequestValidationError
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    logger.warning(f"Validation error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=422,
        content={"detail": str(exc)}
    )

# Create tables & Seed Database on Startup
@app.on_event("startup")
def startup_event():
    # Log which DB engine URL is being used
    from .database import engine
    logger.info(f"FastAPI starting up. Using DB URL: {engine.url}")
    db = next(get_db())
    seed_db(db)
    # Ensure upload directory exists
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    logger.info(f"Upload directory '{UPLOAD_FOLDER}' verified/created.")

# Helper function to sanitize uploaded filenames
def sanitize_filename(filename: str) -> str:
    name = os.path.basename(filename)
    name = re.sub(r'[^a-zA-Z0-9_\.\-]', '', name)
    if not name or name.startswith('.'):
        name = f"upload_{uuid.uuid4().hex[:8]}_{name.lstrip('.') or 'file'}"
    return name

# Helper function to validate file uploads (extension & size)
def validate_uploaded_file(file: UploadFile, contents: bytes):
    MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB
    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail="File exceeds maximum allowed size of 25MB."
        )
    ext = file.filename.split(".")[-1].lower()
    allowed_extensions = {
        "png", "jpg", "jpeg", "pdf", "csv", "xlsx", "txt", "json", "log", "xml", "tsv"
    }
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '.{ext}' is not allowed."
        )

# Helper function to validate session tokens
def validate_token_and_get_user_id(token: str) -> str:
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid session token")
    return payload.get("sub")

# Helper function to add audit logs
def log_audit(db: Session, user: str, action: str, category: str = "case"):
    audit = AuditLog(user=user, action=action, category=category)
    db.add(audit)
    db.commit()


# --- Auth Router ---
@app.post("/api/v1/auth/signup", response_model=LoginResponse)
def signup(payload: UserSignup, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    role = payload.role.strip().lower()
    
    if role == "citizen":
        if not email.endswith("@citizen.ki"):
            raise HTTPException(status_code=400, detail="Citizen email must end with @citizen.ki")
        status_val = "approved"
    elif role == "moderator":
        if not email.endswith("@moderator.ki"):
            raise HTTPException(status_code=400, detail="Moderator email must end with @moderator.ki")
        status_val = "pending"
    elif role == "investigator":
        if not email.endswith("@investigator.ki"):
            raise HTTPException(status_code=400, detail="Investigator email must end with @investigator.ki")
        status_val = "pending"
    elif role == "supervisor":
        if not email.endswith("@supervisor.ki"):
            raise HTTPException(status_code=400, detail="Supervisor email must end with @supervisor.ki")
        status_val = "pending"
    else:
        raise HTTPException(status_code=400, detail="Invalid role specified")

    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email/Username is already registered")

    new_id = f"usr-{uuid.uuid4().hex[:8]}"
    new_user = User(
        id=new_id,
        email=email,
        password=hash_password(payload.password),
        name=payload.name,
        badge_id=payload.badgeId,
        role=role,
        bureau=payload.bureau,
        active=True,
        status=status_val,
        address=payload.address,
        phone=payload.phone,
        legal_id=payload.legal_id
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    log_audit(db, new_user.name, f"User signup: role={role}, status={status_val}", "login")
    
    token = create_access_token(new_user.id, new_user.role) if status_val == "approved" else ""
    profile = UserProfile(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        badgeId=new_user.badge_id,
        role=new_user.role,
        bureau=new_user.bureau,
        active=new_user.active,
        status=new_user.status,
        rejection_reason=new_user.rejection_reason,
        address=new_user.address,
        phone=new_user.phone,
        legal_id=new_user.legal_id
    )
    return LoginResponse(token=token, user=profile)

@app.post("/api/v1/auth/login", response_model=LoginResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = None
    if payload.email:
        user = db.query(User).filter(User.email == payload.email).first()
    elif payload.badgeId:
        user = db.query(User).filter(User.badge_id == payload.badgeId).first()
        
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not verify_password(payload.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    # Check registration request status
    if user.status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your signup request is pending approval by a supervisor/admin."
        )
    if user.status == "rejected":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your signup request was rejected. Reason: {user.rejection_reason or 'No reason provided.'}"
        )
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended."
        )
        
    log_audit(db, user.name, f"Session validated for role: {user.role}", "login")
    
    token = create_access_token(user.id, user.role)
    profile = UserProfile(
        id=user.id,
        email=user.email,
        name=user.name,
        badgeId=user.badge_id,
        role=user.role,
        bureau=user.bureau,
        active=user.active,
        status=user.status,
        rejection_reason=user.rejection_reason,
        address=user.address,
        phone=user.phone,
        legal_id=user.legal_id
    )
    return LoginResponse(token=token, user=profile)

@app.get("/api/v1/auth/me", response_model=UserProfile)
def get_me(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.active:
        raise HTTPException(status_code=403, detail="User account is suspended")
    return UserProfile(
        id=user.id,
        email=user.email,

        name=user.name,
        badgeId=user.badge_id,
        role=user.role,
        bureau=user.bureau,
        active=user.active,
        status=user.status,
        rejection_reason=user.rejection_reason,
        address=user.address,
        phone=user.phone,
        legal_id=user.legal_id
    )

@app.patch("/api/v1/users/me", response_model=UserProfile)
def update_profile(payload: UserUpdateProfile, token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.active:
        raise HTTPException(status_code=403, detail="User account is suspended")
        
    if payload.name is not None:
        user.name = payload.name
    if payload.address is not None:
        user.address = payload.address
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.password is not None:
        user.password = hash_password(payload.password)
        
    db.commit()
    db.refresh(user)
    log_audit(db, user.name, "Profile updated by user", "login")
    return UserProfile(
        id=user.id,
        email=user.email,
        name=user.name,
        badgeId=user.badge_id,
        role=user.role,
        bureau=user.bureau,
        active=user.active,
        status=user.status,
        rejection_reason=user.rejection_reason,
        address=user.address,
        phone=user.phone,
        legal_id=user.legal_id
    )

@app.delete("/api/v1/users/me")
def delete_profile(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(user)
    db.commit()
    return {"detail": "Account deleted successfully"}


# --- Dashboard Router ---
@app.get("/api/v1/dashboard/summary")
def get_dashboard_summary(db: Session = Depends(get_db)):
    all_cases = db.query(Case).all()
    open_count = len([c for c in all_cases if c.status in ["active", "pending", "review"]])
    pending_review = len([c for c in all_cases if c.status == "review"])
    
    # Alerts count (confidence suggested)
    alert_count = db.query(IntelligenceAlert).filter(IntelligenceAlert.confidence == "suggested").count()
    
    # High priority count
    high_priority = len([c for c in all_cases if c.priority == "high" and c.status != "closed"])
    
    # Recent cases
    sorted_cases = sorted(all_cases, key=lambda x: x.updated_at, reverse=True)[:5]
    recent_list = []
    for c in sorted_cases:
        ev_count = db.query(EvidenceItem).filter(EvidenceItem.case_id == c.id).count()
        recent_list.append({
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
            "assignee": c.assignee,
            "updatedAt": c.updated_at.isoformat() + "Z",
            "evidenceCount": ev_count
        })
        
    return {
        "stats": [
            {"id": "open-cases", "label": "Open Cases", "value": open_count, "hint": "+2 this week", "trend": "up", "icon": "cases"},
            {"id": "pending-review", "label": "Pending Review", "value": pending_review, "hint": "OCR & correlations", "trend": "neutral", "icon": "review"},
            {"id": "correlation-alerts", "label": "Correlation Alerts", "value": alert_count, "hint": "Require action", "trend": "up", "icon": "alert"},
            {"id": "high-priority", "label": "High Priority", "value": high_priority, "hint": "Due within 48h", "trend": "critical", "icon": "priority"},
        ],
        "recentCases": recent_list
    }

# --- Citizen Public Cases Router ---
@app.get("/api/v1/citizen/cases")
def get_citizen_public_cases(db: Session = Depends(get_db)):
    # Citizens can see cases but only with basic info (id, description, scam_platform, created_at, status)
    cases = db.query(Case).all()
    res = []
    for c in cases:
        res.append({
            "id": c.id,
            "title": c.title,
            "description": c.description, # Short summary of scam
            "scam_platform": c.scam_platform,
            "status": c.status,
            "created_at": c.created_at
        })
    return res

# --- Citizen Reports Router ---
@app.post("/api/v1/citizen/reports", response_model=CitizenReportResponse)
def create_citizen_report(
    payload: CitizenReportCreate,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "citizen":
        raise HTTPException(status_code=403, detail="Only citizens can submit scam reports.")
    if not user.active:
        raise HTTPException(status_code=403, detail="Your account is suspended.")

    existing_count = db.query(CitizenReport).count()
    report_id = f"REP-2026-{1000 + existing_count + 1}"


    scam_dt = None
    if payload.scam_date:
        try:
            scam_dt = datetime.strptime(payload.scam_date, "%Y-%m-%d")
        except ValueError:
            try:
                scam_dt = datetime.fromisoformat(payload.scam_date.rstrip('Z'))
            except Exception:
                scam_dt = None

    new_report = CitizenReport(
        id=report_id,
        title=payload.title,
        description=payload.description,
        status="pending",
        citizen_id=user.id,
        scam_platform=payload.scam_platform,
        scam_platform_account=payload.scam_platform_account,
        scam_platform_url=payload.scam_platform_url,
        scam_type=payload.scam_type,
        scam_amount=payload.scam_amount,
        scam_date=scam_dt,
        victim_name=payload.victim_name,
        victim_phone=payload.victim_phone,
        victim_email=payload.victim_email,
        payment_method=payload.payment_method,
        created_at=datetime.utcnow()
    )
    db.add(new_report)
    db.commit()
    db.refresh(new_report)

    log_audit(db, user.name, f"Citizen scam report {report_id} filed.", "case")

    return CitizenReportResponse(
        id=new_report.id,
        title=new_report.title,
        description=new_report.description,
        status=new_report.status,
        rejection_reason=new_report.rejection_reason,
        citizen_id=new_report.citizen_id,
        reviewer_id=new_report.reviewer_id,
        scam_platform=new_report.scam_platform,
        scam_platform_account=new_report.scam_platform_account,
        scam_platform_url=new_report.scam_platform_url,
        scam_type=new_report.scam_type,
        scam_amount=new_report.scam_amount,
        scam_date=new_report.scam_date,
        victim_name=new_report.victim_name,
        victim_phone=new_report.victim_phone,
        victim_email=new_report.victim_email,
        payment_method=new_report.payment_method,
        created_at=new_report.created_at,
        evidenceCount=0
    )

@app.post("/api/v1/citizen/reports/{report_id}/evidence")
async def upload_report_evidence(
    report_id: str,
    file: UploadFile = File(...),
    token: str = Query(...),
    phone: Optional[str] = Query(None),
    upi: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user session")
    
    report = db.query(CitizenReport).filter(CitizenReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Citizen report not found")
        
    contents = await file.read()
    validate_uploaded_file(file, contents)
    
    sanitized_name = sanitize_filename(file.filename)
    filepath = os.path.join(UPLOAD_FOLDER, sanitized_name)
    with open(filepath, "wb") as f:
        f.write(contents)
        
    ev_id = f"ev-{uuid.uuid4().hex[:8]}"
    ext = sanitized_name.split(".")[-1].lower()
    ev_type = "document"
    if ext in ["png", "jpg", "jpeg"]:
        ev_type = "screenshot"
    elif ext in ["pdf"]:
        ev_type = "document"
    elif ext in ["csv", "xlsx"]:
        ev_type = "transaction_record"
        
    new_evidence = EvidenceItem(
        id=ev_id,
        filename=sanitized_name,
        filepath=filepath,
        type=ev_type,
        size_bytes=len(contents),
        uploaded_at=datetime.utcnow(),
        ocr_status="pending",
        citizen_report_id=report_id
    )
    db.add(new_evidence)
    db.commit()
    
    log_audit(db, user.name, f"Evidence file {sanitized_name} uploaded for citizen report {report_id}.", "case")

    
    # Check overrides
    if phone or upi or url:
        entities = []
        if phone:
            cleaned_phone = ''.join(c for c in phone if c.isdigit())
            norm_phone = "+91" + cleaned_phone if len(cleaned_phone) in [9, 10] else cleaned_phone
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="phone",
                raw_value=phone,
                normalized_value=norm_phone,
                is_approved=True,
                case_id=None,
                evidence_id=ev_id
            ))
        if upi:
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="upi",
                raw_value=upi,
                normalized_value=upi.lower(),
                is_approved=True,
                case_id=None,
                evidence_id=ev_id
            ))
        if url:
            if not url.startswith(('http://', 'https://')):
                parsed = urlparse("http://" + url)
            else:
                parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if ':' in netloc:
                netloc = netloc.split(':')[0]
            if netloc.startswith("www."):
                netloc = netloc[4:]
            norm_url = netloc or url.lower()
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="url",
                raw_value=url,
                normalized_value=norm_url,
                is_approved=True,
                case_id=None,
                evidence_id=ev_id
            ))
        for ent in entities:
            db.add(ent)
        new_evidence.ocr_status = "completed"
        db.commit()
    else:
        simulated_ocr_extract(db, new_evidence)
        
    return {
        "status": "success",
        "evidenceId": ev_id,
        "name": file.filename,
        "type": ev_type,
        "sizeKb": int(len(contents) / 1024)
    }

@app.get("/api/v1/citizen/reports", response_model=List[CitizenReportResponse])
def get_citizen_reports(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.role == "citizen":
        reports = db.query(CitizenReport).filter(CitizenReport.citizen_id == user.id).all()
    else:
        reports = db.query(CitizenReport).all()
        
    response = []
    for r in reports:
        ev_count = db.query(EvidenceItem).filter(EvidenceItem.citizen_report_id == r.id).count()
        response.append(CitizenReportResponse(
            id=r.id,
            title=r.title,
            description=r.description,
            status=r.status,
            rejection_reason=r.rejection_reason,
            citizen_id=r.citizen_id,
            reviewer_id=r.reviewer_id,
            scam_platform=r.scam_platform,
            scam_platform_account=r.scam_platform_account,
            scam_platform_url=r.scam_platform_url,
            scam_type=r.scam_type,
            scam_amount=r.scam_amount,
            scam_date=r.scam_date,
            victim_name=r.victim_name,
            victim_phone=r.victim_phone,
            victim_email=r.victim_email,
            payment_method=r.payment_method,
            created_at=r.created_at,
                evidenceCount=ev_count
        ))
    return response

@app.post("/api/v1/citizen/reports/{report_id}/review")
def review_citizen_report(
    report_id: str,
    payload: CitizenReportReview,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    try:
        # Validate token
        user_id = validate_token_and_get_user_id(token)
        user = db.query(User).filter(User.id == user_id).first()
        if not user or user.role not in ["moderator", "supervisor", "admin"]:
            raise HTTPException(status_code=403, detail="Unauthorized to review citizen reports.")


        report = db.query(CitizenReport).filter(CitizenReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Citizen report not found")

        if report.status != "pending":
            raise HTTPException(status_code=400, detail="This report has already been reviewed.")

        if payload.status == "approved":
            report.status = "approved"
            report.reviewer_id = user.id

            # Promote report to Case!
            existing_cases = db.query(Case).count()
            case_id = f"CYB-2026-{100 + existing_cases + 1}"

            new_case = Case(
                id=case_id,
                title=report.title,
                description=report.description,
                status="active",
                priority="medium",
                assignee="P. Sharma",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                scam_platform=report.scam_platform,
                scam_platform_account=report.scam_platform_account,
                scam_platform_url=report.scam_platform_url,
                scam_type=report.scam_type,
                scam_amount=report.scam_amount,
                scam_date=report.scam_date,
                victim_name=report.victim_name,
                victim_phone=report.victim_phone,
                victim_email=report.victim_email,
                payment_method=report.payment_method
            )
            db.add(new_case)
            db.commit()

            # Move associated evidence files to Case!
            evidence_items = db.query(EvidenceItem).filter(EvidenceItem.citizen_report_id == report.id).all()
            for ev in evidence_items:
                ev.case_id = case_id
                entities = db.query(ExtractedEntity).filter(ExtractedEntity.evidence_id == ev.id).all()
                for ent in entities:
                    ent.case_id = case_id

            db.commit()

            # Sync metadata entities for the promoted case
            sync_case_metadata_entities(db, new_case, user.name)

            # Run global correlation checks on all evidence-derived entities as well now that they have case_id
            for ev in evidence_items:
                entities = db.query(ExtractedEntity).filter(ExtractedEntity.evidence_id == ev.id).all()
                for ent in entities:
                    check_global_correlations(db, ent, user.name)

            log_audit(db, user.name, f"Approved scam report {report.id} and promoted to case {case_id}.", "case")
            return JSONResponse(content={"status": "approved", "caseId": case_id})

        elif payload.status == "rejected":
            report.status = "rejected"
            report.rejection_reason = payload.rejection_reason or "No reason provided."
            report.reviewer_id = user.id
            db.commit()

            log_audit(db, user.name, f"Rejected scam report {report.id}. Reason: {report.rejection_reason}", "case")
            return JSONResponse(content={"status": "rejected"})
        else:
            raise HTTPException(status_code=400, detail="Invalid review status.")
    except HTTPException as http_err:
        # FastAPI will automatically convert HTTPException to JSON, re‑raise
        raise http_err
    except Exception as exc:
        # Log unexpected errors and return a clean JSON error response
        log_audit(db, "system", f"Error reviewing citizen report {report_id}: {str(exc)}", "error")
        raise HTTPException(status_code=500, detail="Internal server error while reviewing report.")

# --- Supervisor & Admin Signup Approval Router ---
@app.get("/api/v1/supervisor/signup-requests", response_model=List[UserProfile])
def get_supervisor_signup_requests(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Only supervisors can view signup requests.")

    # Supervisors approve Moderator and Investigator requests
    requests = db.query(User).filter(
        User.role.in_(["moderator", "investigator"]),
        User.status == "pending"
    ).all()
    
    return [
        UserProfile(
            id=r.id,
            email=r.email,
            name=r.name,
            badgeId=r.badge_id,
            role=r.role,
            bureau=r.bureau,
            active=r.active,
            status=r.status,
            rejection_reason=r.rejection_reason,
            address=r.address,
            phone=r.phone,
            legal_id=r.legal_id
        ) for r in requests
    ]

@app.post("/api/v1/supervisor/signup-requests/{req_user_id}/action")
def supervisor_signup_action(
    req_user_id: str,
    payload: SignupRequestReview,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")

        
    target = db.query(User).filter(User.id == req_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User request not found")
        
    if target.role not in ["moderator", "investigator"]:
        raise HTTPException(status_code=400, detail="Supervisors can only approve moderators and investigators.")
        
    if payload.action == "approve":
        target.status = "approved"
        target.active = True
        log_audit(db, user.name, f"Approved registration for {target.email} as {target.role}.", "login")
    elif payload.action == "reject":
        target.status = "rejected"
        target.rejection_reason = payload.reason or "Requirements not met."
        log_audit(db, user.name, f"Rejected registration for {target.email}. Reason: {target.rejection_reason}", "login")
    else:
        raise HTTPException(status_code=400, detail="Invalid action.")
        
    db.commit()
    return {"status": "success"}

@app.get("/api/v1/admin/signup-requests", response_model=List[UserProfile])
def get_admin_signup_requests(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Admins can view supervisor signup requests.")
        
    # Admin approves Supervisor requests
    requests = db.query(User).filter(
        User.role.in_(["supervisor", "moderator"]),
        User.status == "pending"
    ).all()
    
    return [
        UserProfile(
            id=r.id,
            email=r.email,
            name=r.name,
            badgeId=r.badge_id,
            role=r.role,
            bureau=r.bureau,
            active=r.active,
            status=r.status,
            rejection_reason=r.rejection_reason,
            address=r.address,
            phone=r.phone,
            legal_id=r.legal_id
        ) for r in requests
    ]

@app.post("/api/v1/admin/signup-requests/{req_user_id}/action")
def admin_signup_action(
    req_user_id: str,
    payload: SignupRequestReview,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Admins can perform this action.")
        
    target = db.query(User).filter(User.id == req_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User request not found")
        
    if target.role != "supervisor":
        raise HTTPException(status_code=400, detail="Admins can only action supervisor signups here.")
        
    if payload.action == "approve":
        target.status = "approved"
        target.active = True
        log_audit(db, user.name, f"Approved registration for {target.email} as Supervisor.", "login")
    elif payload.action == "reject":
        target.status = "rejected"
        target.rejection_reason = payload.reason or "Credentials verification failed."
        log_audit(db, user.name, f"Rejected supervisor registration for {target.email}. Reason: {target.rejection_reason}", "login")
    else:
        raise HTTPException(status_code=400, detail="Invalid action.")
        
    db.commit()
    return {"status": "success"}

# --- Suspensions Router ---
@app.post("/api/v1/moderator/suspensions", response_model=SuspensionRequestResponse)
def moderator_request_suspension(
    payload: SuspensionRequestCreate,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ["moderator", "supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized to request suspensions.")
        
    target = db.query(User).filter(User.id == payload.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    new_req = SuspensionRequest(
        target_user_id=target.id,
        reason=payload.reason,
        requested_by_id=user.id,
        status="reported",
        created_at=datetime.utcnow()
    )
    db.add(new_req)
    db.commit()
    db.refresh(new_req)
    
    log_audit(db, user.name, f"Requested suspension of user {target.email}.", "login")
    
    return SuspensionRequestResponse(
        id=new_req.id,
        target_user_id=new_req.target_user_id,
        target_user_name=target.name,
        reason=new_req.reason,
        requested_by_id=new_req.requested_by_id,
        requested_by_name=user.name,
        status=new_req.status,
        rejection_reason=new_req.rejection_reason,
        created_at=new_req.created_at
    )

@app.get("/api/v1/supervisor/suspensions", response_model=List[SuspensionRequestResponse])
def get_supervisor_suspensions(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")
        
    requests = db.query(SuspensionRequest).filter(SuspensionRequest.status == "reported").all()
    
    res = []
    for r in requests:
        target_u = db.query(User).filter(User.id == r.target_user_id).first()
        req_u = db.query(User).filter(User.id == r.requested_by_id).first()
        res.append(SuspensionRequestResponse(
            id=r.id,
            target_user_id=r.target_user_id,
            target_user_name=target_u.name if target_u else "Unknown",
            reason=r.reason,
            requested_by_id=r.requested_by_id,
            requested_by_name=req_u.name if req_u else "Unknown",
            verified_by_id=r.verified_by_id,
            status=r.status,
            rejection_reason=r.rejection_reason,
            created_at=r.created_at
        ))
    return res

@app.post("/api/v1/supervisor/suspensions/{req_id}/verify")
def supervisor_verify_suspension(
    req_id: int,
    action: str = Query(...), # forward, reject
    reason: Optional[str] = Query(None),
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ["supervisor", "admin"]:
        raise HTTPException(status_code=403, detail="Unauthorized.")
        
    req = db.query(SuspensionRequest).filter(SuspensionRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Suspension request not found")
        
    if action == "forward":
        req.status = "forwarded"
        req.verified_by_id = user.id
        log_audit(db, user.name, f"Verified and forwarded suspension request for target user ID {req.target_user_id} to Admin.", "login")
    elif action == "reject":
        req.status = "rejected"
        req.rejection_reason = reason or "No evidence of violation."
        log_audit(db, user.name, f"Rejected suspension request for target user ID {req.target_user_id}. Reason: {req.rejection_reason}", "login")
    else:
        raise HTTPException(status_code=400, detail="Invalid action.")
        
    db.commit()
    return {"status": "success"}

@app.get("/api/v1/admin/suspensions", response_model=List[SuspensionRequestResponse])
def get_admin_suspensions(token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Admin can view forwarded suspensions.")
        
    requests = db.query(SuspensionRequest).filter(SuspensionRequest.status == "forwarded").all()
    
    res = []
    for r in requests:
        target_u = db.query(User).filter(User.id == r.target_user_id).first()
        req_u = db.query(User).filter(User.id == r.requested_by_id).first()
        res.append(SuspensionRequestResponse(
            id=r.id,
            target_user_id=r.target_user_id,
            target_user_name=target_u.name if target_u else "Unknown",
            reason=r.reason,
            requested_by_id=r.requested_by_id,
            requested_by_name=req_u.name if req_u else "Unknown",
            verified_by_id=r.verified_by_id,
            status=r.status,
            rejection_reason=r.rejection_reason,
            created_at=r.created_at
        ))
    return res

@app.post("/api/v1/admin/suspensions/{req_id}/action")
def admin_suspension_action(
    req_id: int,
    action: str = Query(...), # approve, reject
    reason: Optional[str] = Query(None),
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Admin can action suspensions.")
        
    req = db.query(SuspensionRequest).filter(SuspensionRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Suspension request not found")
        
    target = db.query(User).filter(User.id == req.target_user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
        
    if action == "approve":
        req.status = "approved"
        target.active = False # Suspend user
        target.status = "suspended"
        log_audit(db, user.name, f"Approved suspension for user {target.email}.", "login")
    elif action == "reject":
        req.status = "rejected"
        req.rejection_reason = reason or "Declined by Administrator."
        log_audit(db, user.name, f"Rejected suspension for user {target.email}. Reason: {req.rejection_reason}", "login")
    else:
        raise HTTPException(status_code=400, detail="Invalid action.")
        
    db.commit()
    return {"status": "success"}

# --- Cases Router ---
def sync_case_metadata_entities(db: Session, case_obj: Case, user_name: str = "System"):
    # Delete existing metadata-derived entities (where evidence_id is None)
    db.query(ExtractedEntity).filter(
        ExtractedEntity.case_id == case_obj.id,
        ExtractedEntity.evidence_id == None
    ).delete()
    
    entities = []
    
    # Platform
    if case_obj.scam_platform and case_obj.scam_platform.strip():
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="scam_platform",
            raw_value=case_obj.scam_platform.strip(),
            normalized_value=case_obj.scam_platform.strip().lower(),
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Account
    if case_obj.scam_platform_account and case_obj.scam_platform_account.strip():
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="scam_platform_account",
            raw_value=case_obj.scam_platform_account.strip(),
            normalized_value=case_obj.scam_platform_account.strip().lower(),
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Platform URL
    if case_obj.scam_platform_url and case_obj.scam_platform_url.strip():
        url = case_obj.scam_platform_url.strip()
        if not url.startswith(('http://', 'https://')):
            parsed = urlparse("http://" + url)
        else:
            parsed = urlparse(url)
        netloc = parsed.netloc.lower()
        if ':' in netloc:
            netloc = netloc.split(':')[0]
        if netloc.startswith("www."):
            netloc = netloc[4:]
        path = parsed.path.lower().rstrip('/')
        norm_url = (netloc + path) if netloc else url.lower()
        
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="scam_platform_url",
            raw_value=case_obj.scam_platform_url.strip(),
            normalized_value=norm_url,
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Scam Type
    if case_obj.scam_type and case_obj.scam_type.strip():
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="scam_type",
            raw_value=case_obj.scam_type.strip(),
            normalized_value=case_obj.scam_type.strip().lower(),
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Payment Method
    if case_obj.payment_method and case_obj.payment_method.strip():
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="payment_method",
            raw_value=case_obj.payment_method.strip(),
            normalized_value=case_obj.payment_method.strip().lower(),
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Victim Email
    if case_obj.victim_email and case_obj.victim_email.strip():
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="victim_email",
            raw_value=case_obj.victim_email.strip(),
            normalized_value=case_obj.victim_email.strip().lower(),
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Victim Phone
    if case_obj.victim_phone and case_obj.victim_phone.strip():
        cleaned_phone = ''.join(c for c in case_obj.victim_phone if c.isdigit())
        if len(cleaned_phone) in [9, 10]:
            norm_phone = "+91" + cleaned_phone
        else:
            norm_phone = "+" + cleaned_phone if case_obj.victim_phone.startswith('+') else cleaned_phone
            
        entities.append(ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="victim_phone",
            raw_value=case_obj.victim_phone.strip(),
            normalized_value=norm_phone,
            is_approved=True,
            case_id=case_obj.id,
            evidence_id=None
        ))
        
    # Scam Pattern Keywords (from short summary)
    if case_obj.description and case_obj.description.strip():
        words = re.findall(r'\b\w{4,}\b', case_obj.description.lower())
        stop_words = {
            "there", "about", "would", "their", "after", "before", "scam", "fraud",
            "which", "these", "those", "other", "where", "while", "during", "should",
            "could", "through", "people", "money", "person", "account", "platform",
            "called", "using", "under", "again", "first", "second", "three", "about",
            "online", "amount", "offered", "stated", "details", "number", "victim",
            "pretending", "offering"
        }
        keywords = [w for w in words if w not in stop_words]
        unique_keywords = list(set(keywords))
        for kw in unique_keywords:
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="scam_pattern",
                raw_value=kw,
                normalized_value=kw,
                is_approved=True,
                case_id=case_obj.id,
                evidence_id=None
            ))
            
    for ent in entities:
        db.add(ent)
    db.commit()
    
    # Run global correlation checks for all these newly added entities
    for ent in entities:
        check_global_correlations(db, ent, user_name)

@app.get("/api/v1/cases", response_model=List[CaseResponse])
def get_cases(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Case)
    if status:
        query = query.filter(Case.status == status)
    cases = query.all()
    
    response = []
    for c in cases:
        ev_count = db.query(EvidenceItem).filter(EvidenceItem.case_id == c.id).count()
        response.append(CaseResponse(
            id=c.id,
            title=c.title,
            description=c.description,
            status=c.status,
            priority=c.priority,
            assignee=c.assignee,
            created_at=c.created_at,
            updated_at=c.updated_at,
            evidenceCount=ev_count,
            scam_platform=c.scam_platform,
            scam_platform_account=c.scam_platform_account,
            scam_platform_url=c.scam_platform_url,
            scam_type=c.scam_type,
            scam_amount=c.scam_amount,
            scam_date=c.scam_date,
            victim_name=c.victim_name,
            victim_phone=c.victim_phone,
            victim_email=c.victim_email,
            payment_method=c.payment_method
        ))
    return response

@app.post("/api/v1/cases", response_model=CaseResponse)
def create_case(payload: CaseCreate, token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.active:
        raise HTTPException(status_code=403, detail="User account is suspended")
    
    # Generate Case ID CYB-2026-XXXX
    if payload.id:
        case_id = payload.id
    else:
        existing_count = db.query(Case).count()
        case_id = f"CYB-2026-{100 + existing_count + 1}"
        
    scam_dt = None
    if payload.scam_date:
        try:
            scam_dt = datetime.strptime(payload.scam_date, "%Y-%m-%d")
        except ValueError:
            try:
                scam_dt = datetime.fromisoformat(payload.scam_date.rstrip('Z'))
            except Exception:
                scam_dt = None

    new_case = Case(
        id=case_id,
        creator_id=user.id,
        title=payload.title,
        description=payload.description,
        status="active",
        priority=payload.priority,
        assignee=payload.assignee,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        scam_platform=payload.scam_platform,
        scam_platform_account=payload.scam_platform_account,
        scam_platform_url=payload.scam_platform_url,
        scam_type=payload.scam_type,
        scam_amount=payload.scam_amount,
        scam_date=scam_dt,
        victim_name=payload.victim_name,
        victim_phone=payload.victim_phone,
        victim_email=payload.victim_email,
        payment_method=payload.payment_method
    )
    db.add(new_case)
    db.commit()
    
    sync_case_metadata_entities(db, new_case, user.name)
    
    log_audit(db, user.name, f"Intake record {case_id} created.", "case")
    
    return CaseResponse(
        id=new_case.id,
        title=new_case.title,
        description=new_case.description,
        status=new_case.status,
        priority=new_case.priority,
        assignee=new_case.assignee,
        created_at=new_case.created_at,
        updated_at=new_case.updated_at,
        evidenceCount=0,
        scam_platform=new_case.scam_platform,
        scam_platform_account=new_case.scam_platform_account,
        scam_platform_url=new_case.scam_platform_url,
        scam_type=new_case.scam_type,
        scam_amount=new_case.scam_amount,
        scam_date=new_case.scam_date,
        victim_name=new_case.victim_name,
        victim_phone=new_case.victim_phone,
        victim_email=new_case.victim_email,
        payment_method=new_case.payment_method
    )

@app.get("/api/v1/cases/{case_id}")
def get_case_detail(case_id: str, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    ev_count = db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).count()
    evidence_items = db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).all()
    correlations = db.query(ExtractedEntity).filter(ExtractedEntity.case_id == case_id).all()
    
    # Formatting evidence
    evidence_list = [{
        "id": ev.id,
        "name": ev.filename,
        "type": ev.type,
        "sizeKb": int(ev.size_bytes / 1024),
        "uploadedAt": ev.uploaded_at.isoformat() + "Z",
        "ocrStatus": ev.ocr_status
    } for ev in evidence_items]

    # Generate correlation list
    # Query matching entities across cases
    correlation_list = []
    for ent in correlations:
        # Check overlaps in other cases
        overlaps = db.query(ExtractedEntity).filter(
            ExtractedEntity.normalized_value == ent.normalized_value,
            ExtractedEntity.case_id != case_id
        ).all()
        
        if overlaps:
            other_cases = list(set([o.case_id for o in overlaps]))
            status_map = "confirmed" if ent.is_approved else "suggested"
            correlation_list.append({
                "id": ent.id,
                "type": ent.entity_type,
                "title": f"Overlap: Shared {ent.entity_type}",
                "detail": f"{ent.raw_value} appears in {', '.join(other_cases)}",
                "confidence": "0.85" if ent.is_approved else "0.75",
                "status": status_map
            })
            
    # Default timeline
    timeline_events = [
        {"action": "Case created", "details": f"{c.id} intake recorded."},
        {"action": "Status updated", "details": f"Case set to {c.status}."}
    ]
    # Add audit log case events
    logs = db.query(AuditLog).filter(AuditLog.action.contains(case_id)).all()
    for l in logs:
        timeline_events.append({"action": "Audit Event", "details": l.action})
        
    related_cases = []
    # If correlations exist, suggest related cases
    if correlation_list:
        linked_ids = set()
        for corr in correlation_list:
            for piece in corr["detail"].split(" "):
                if "CYB-2026-" in piece:
                    linked_ids.add(piece.strip(",").strip("."))
        for lid in linked_ids:
            rc = db.query(Case).filter(Case.id == lid).first()
            if rc:
                related_cases.append({"id": rc.id, "title": rc.title, "status": rc.status})
                
    # Fallback to general list if empty
    if not related_cases:
        r_cases = db.query(Case).filter(Case.id != case_id).limit(3).all()
        related_cases = [{"id": rc.id, "title": rc.title, "status": rc.status} for rc in r_cases]
        
    reports = db.query(Report).filter(Report.case_id == case_id).all()
    report_list = [{
        "id": r.id,
        "fileName": r.filename,
        "createdAt": r.created_at.isoformat() + "Z"
    } for r in reports]

    return {
        "id": c.id,
        "title": c.title,
        "description": c.description,
        "status": c.status,
        "priority": c.priority,
        "assignee": c.assignee,
        "created_at": c.created_at.isoformat() + "Z",
        "updated_at": c.updated_at.isoformat() + "Z",
        "evidenceCount": ev_count,
        "evidence": evidence_list,
        "correlations": correlation_list,
        "timeline": timeline_events,
        "related": related_cases,
        "reports": report_list,
        "scam_platform": c.scam_platform,
        "scam_platform_account": c.scam_platform_account,
        "scam_platform_url": c.scam_platform_url,
        "scam_type": c.scam_type,
        "scam_amount": c.scam_amount,
        "scam_date": c.scam_date.isoformat() + "Z" if c.scam_date else None,
        "victim_name": c.victim_name,
        "victim_phone": c.victim_phone,
        "victim_email": c.victim_email,
        "payment_method": c.payment_method
    }

@app.patch("/api/v1/cases/{case_id}")
def update_case(
    case_id: str,
    payload: CaseUpdate,
    token: str = Query(...),
    db: Session = Depends(get_db)
):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.active:
        raise HTTPException(status_code=403, detail="User account is suspended")
        
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    # Enforce that only the creator of the case can edit it
    if c.creator_id and user.id != c.creator_id:
        raise HTTPException(status_code=403, detail="You can only edit cases you have created.")
        
    user_name = user.name
    if payload.status is not None:
        old_status = c.status
        new_status = payload.status
        
        if new_status == "closed":
            if user.role not in ["supervisor", "admin"]:
                raise HTTPException(status_code=403, detail="Only supervisors or admins can sign off and close cases.")
        elif new_status == "review":
            if user.role not in ["investigator", "supervisor", "admin"]:
                raise HTTPException(status_code=403, detail="Only investigators can submit cases for review.")
                
        c.status = new_status
        log_audit(db, user_name, f"Case {case_id} status updated from {old_status} to {new_status}.", "case")
        
    # Other edits
    if any(val is not None for val in [
        payload.priority, payload.assignee, payload.title, payload.description,
        payload.scam_platform, payload.scam_platform_account, payload.scam_platform_url,
        payload.scam_type, payload.scam_amount, payload.scam_date,
        payload.victim_name, payload.victim_phone, payload.victim_email, payload.payment_method
    ]):
        if user.role not in ["investigator", "supervisor", "admin"]:
            raise HTTPException(status_code=403, detail="You do not have permissions to edit case details.")
            
        if payload.priority is not None:
            c.priority = payload.priority
        if payload.assignee is not None:
            c.assignee = payload.assignee
        if payload.title is not None:
            c.title = payload.title
        if payload.description is not None:
            c.description = payload.description
        if payload.scam_platform is not None:
            c.scam_platform = payload.scam_platform
        if payload.scam_platform_account is not None:
            c.scam_platform_account = payload.scam_platform_account
        if payload.scam_platform_url is not None:
            c.scam_platform_url = payload.scam_platform_url
        if payload.scam_type is not None:
            c.scam_type = payload.scam_type
        if payload.scam_amount is not None:
            c.scam_amount = payload.scam_amount
        if payload.scam_date is not None:
            scam_dt = None
            if payload.scam_date:
                try:
                    scam_dt = datetime.strptime(payload.scam_date, "%Y-%m-%d")
                except ValueError:
                    try:
                        scam_dt = datetime.fromisoformat(payload.scam_date.rstrip('Z'))
                    except Exception:
                        scam_dt = None
            c.scam_date = scam_dt
        if payload.victim_name is not None:
            c.victim_name = payload.victim_name
        if payload.victim_phone is not None:
            c.victim_phone = payload.victim_phone
        if payload.victim_email is not None:
            c.victim_email = payload.victim_email
        if payload.payment_method is not None:
            c.payment_method = payload.payment_method
            
    c.updated_at = datetime.utcnow()
    db.commit()
    
    sync_case_metadata_entities(db, c, user_name)
    
    return {"status": "success", "caseId": c.id}

@app.delete("/api/v1/cases/{case_id}")
def delete_case(case_id: str, token: str = Query(...), db: Session = Depends(get_db)):
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role != "admin":
        raise HTTPException(status_code=403, detail="Only Admins can delete cases.")
        
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    db.delete(c)
    db.commit()
    
    log_audit(db, user.name, f"Deleted case {case_id}.", "case")
    return {"status": "success", "detail": f"Case {case_id} deleted successfully."}

# --- Evidence & OCR Endpoints ---
@app.post("/api/v1/cases/{case_id}/evidence")
async def upload_evidence(
    case_id: str,
    file: UploadFile = File(...),
    user_name: str = Query("System"),
    phone: Optional[str] = Query(None),
    upi: Optional[str] = Query(None),
    url: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    ev_id = f"ev-{uuid.uuid4().hex[:8]}"
    safe_name = sanitize_filename(file.filename)
    contents = await file.read()
    validate_uploaded_file(file, contents)
    filepath = os.path.join(UPLOAD_FOLDER, safe_name)
    with open(filepath, "wb") as f:
        f.write(contents)
        
    ext = file.filename.split(".")[-1].lower()
    ev_type = "document"
    if ext in ["png", "jpg", "jpeg"]:
        ev_type = "screenshot"
    elif ext in ["pdf"]:
        ev_type = "document"
    elif ext in ["csv", "xlsx"]:
        ev_type = "transaction_record"
        
    new_evidence = EvidenceItem(
        id=ev_id,
        filename=file.filename,
        filepath=filepath,
        type=ev_type,
        size_bytes=len(contents),
        uploaded_at=datetime.utcnow(),
        ocr_status="pending",
        case_id=case_id
    )
    db.add(new_evidence)
    db.commit()
    
    log_audit(db, user_name, f"Evidence file {file.filename} uploaded to {case_id}.", "case")
    
    # Check if overrides are provided
    if phone or upi or url:
        entities = []
        if phone:
            cleaned_phone = ''.join(c for c in phone if c.isdigit())
            if len(cleaned_phone) in [9, 10]:
                norm_phone = "+91" + cleaned_phone
            else:
                norm_phone = "+" + cleaned_phone if phone.startswith('+') else cleaned_phone
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="phone",
                raw_value=phone,
                normalized_value=norm_phone,
                is_approved=True,
                case_id=case_id,
                evidence_id=ev_id
            ))
        if upi:
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="upi",
                raw_value=upi,
                normalized_value=upi.lower(),
                is_approved=True,
                case_id=case_id,
                evidence_id=ev_id
            ))
        if url:
            if not url.startswith(('http://', 'https://')):
                parsed = urlparse("http://" + url)
            else:
                parsed = urlparse(url)
            netloc = parsed.netloc.lower()
            if ':' in netloc:
                netloc = netloc.split(':')[0]
            if netloc.startswith("www."):
                netloc = netloc[4:]
            norm_url = netloc or url.lower()
            entities.append(ExtractedEntity(
                id=f"ent-{uuid.uuid4().hex[:8]}",
                entity_type="url",
                raw_value=url,
                normalized_value=norm_url,
                is_approved=True,
                case_id=case_id,
                evidence_id=ev_id
            ))
        for ent in entities:
            db.add(ent)
        new_evidence.ocr_status = "completed"
        db.commit()
        for ent in entities:
            check_global_correlations(db, ent, user_name)
    else:
        simulated_ocr_extract(db, new_evidence)
        
    return {
        "status": "success",
        "evidenceId": ev_id,
        "name": file.filename,
        "type": ev_type,
        "sizeKb": int(len(contents) / 1024)
    }

def simulated_ocr_extract(db: Session, ev: EvidenceItem):
    ext = ev.filename.split(".")[-1].lower()
    entities = []
    
    if ext in ["txt", "csv", "json", "log", "xml", "tsv"]:
        try:
            with open(ev.filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            
            phone_pattern = r'\b(?:\+?91[-.\s]?)?[6-9]\d{8,11}\b'
            upi_pattern = r'\b[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+\b'
            url_pattern = r'\b(?:https?://)?(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}(?:/[^\s]*)?\b'
            
            phones = re.findall(phone_pattern, content)
            all_upis_and_emails = re.findall(upi_pattern, content)
            urls = re.findall(url_pattern, content)
            
            upis = []
            for item in all_upis_and_emails:
                domain = item.split('@')[-1].lower()
                if domain not in ['cyber.gov', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'example.com']:
                    upis.append(item)
            
            filtered_urls = []
            for url in urls:
                if '@' in url:
                    continue
                filtered_urls.append(url)
                
            for phone in set(phones):
                cleaned_phone = ''.join(c for c in phone if c.isdigit())
                if len(cleaned_phone) in [9, 10]:
                    norm_phone = "+91" + cleaned_phone
                else:
                    norm_phone = "+" + cleaned_phone if phone.startswith('+') else cleaned_phone
                
                entities.append(ExtractedEntity(
                    id=f"ent-{uuid.uuid4().hex[:8]}",
                    entity_type="phone",
                    raw_value=phone,
                    normalized_value=norm_phone,
                    is_approved=True,
                    case_id=ev.case_id,
                    evidence_id=ev.id
                ))
                
            for upi in set(upis):
                entities.append(ExtractedEntity(
                    id=f"ent-{uuid.uuid4().hex[:8]}",
                    entity_type="upi",
                    raw_value=upi,
                    normalized_value=upi.lower(),
                    is_approved=True,
                    case_id=ev.case_id,
                    evidence_id=ev.id
                ))
                
            for url in set(filtered_urls):
                if not url.startswith(('http://', 'https://')):
                    parsed = urlparse("http://" + url)
                else:
                    parsed = urlparse(url)
                netloc = parsed.netloc.lower()
                if ':' in netloc:
                    netloc = netloc.split(':')[0]
                if netloc.startswith("www."):
                    netloc = netloc[4:]
                norm_url = netloc or url.lower()
                
                entities.append(ExtractedEntity(
                    id=f"ent-{uuid.uuid4().hex[:8]}",
                    entity_type="url",
                    raw_value=url,
                    normalized_value=norm_url,
                    is_approved=True,
                    case_id=ev.case_id,
                    evidence_id=ev.id
                ))
                
            if entities:
                for ent in entities:
                    db.add(ent)
                ev.ocr_status = "completed"
            else:
                ev.ocr_status = "no_text_found"
        except Exception as e:
            logger.error(f"Failed to read evidence file: {e}")
            ev.ocr_status = "failed"
    else:
        ev.ocr_status = "no_text_found"
        
    db.commit()
    
    for ent in entities:
        if ent.is_approved:
            check_global_correlations(db, ent)

@app.post("/api/v1/cases/{case_id}/entities")
def add_manual_entities(
    case_id: str,
    payload: ManualEntityCreate,
    user_name: str = Query("System"),
    db: Session = Depends(get_db)
):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    ev = db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).first()
    ev_id = ev.id if ev else None
    
    entities_added = []
    
    if payload.phone:
        cleaned_phone = ''.join(c for c in payload.phone if c.isdigit())
        if len(cleaned_phone) in [9, 10]:
            norm_phone = "+91" + cleaned_phone
        else:
            norm_phone = "+" + cleaned_phone if payload.phone.startswith('+') else cleaned_phone
            
        ent = ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="phone",
            raw_value=payload.phone,
            normalized_value=norm_phone,
            is_approved=True,
            case_id=case_id,
            evidence_id=ev_id
        )
        db.add(ent)
        entities_added.append(ent)
        
    if payload.upi:
        ent = ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="upi",
            raw_value=payload.upi,
            normalized_value=payload.upi.lower(),
            is_approved=True,
            case_id=case_id,
            evidence_id=ev_id
        )
        db.add(ent)
        entities_added.append(ent)
        
    if payload.url:
        if not payload.url.startswith(('http://', 'https://')):
            parsed = urlparse("http://" + payload.url)
        else:
            parsed = urlparse(payload.url)
        netloc = parsed.netloc.lower()
        if ':' in netloc:
            netloc = netloc.split(':')[0]
        if netloc.startswith("www."):
            netloc = netloc[4:]
        norm_url = netloc or payload.url.lower()
        
        ent = ExtractedEntity(
            id=f"ent-{uuid.uuid4().hex[:8]}",
            entity_type="url",
            raw_value=payload.url,
            normalized_value=norm_url,
            is_approved=True,
            case_id=case_id,
            evidence_id=ev_id
        )
        db.add(ent)
        entities_added.append(ent)
        
    db.commit()
    
    for ent in entities_added:
        check_global_correlations(db, ent, user_name)
        
    return {"status": "success", "count": len(entities_added)}


@app.get("/api/v1/evidence/{evidence_id}/extractions")
def get_ocr_extractions(evidence_id: str, db: Session = Depends(get_db)):
    extractions = db.query(ExtractedEntity).filter(ExtractedEntity.evidence_id == evidence_id).all()
    return [{
        "id": ext.id,
        "entity_type": ext.entity_type,
        "raw_value": ext.raw_value,
        "normalized_value": ext.normalized_value,
        "is_approved": ext.is_approved,
        "is_edited": ext.is_edited
    } for ext in extractions]

@app.patch("/api/v1/extractions/{extraction_id}")
def update_extraction(extraction_id: str, payload: ExtractedEntityUpdate, user_name: str = Query("System"), db: Session = Depends(get_db)):
    ent = db.query(ExtractedEntity).filter(ExtractedEntity.id == extraction_id).first()
    if not ent:
        raise HTTPException(status_code=404, detail="Extraction entity not found")
        
    ent.normalized_value = payload.normalized_value
    ent.is_approved = payload.is_approved
    ent.is_edited = True
    db.commit()
    
    if payload.is_approved:
        log_audit(db, user_name, f"OCR {ent.entity_type} cluster extract approved for case {ent.case_id}.", "case")
        
        # Trigger intelligence alert generation on correlation overlap
        check_global_correlations(db, ent)
        
    return {"status": "success"}

def check_global_correlations(db: Session, ent: ExtractedEntity, user_name: str = "System"):
    """Detect shared normalized values across cases and create or update an IntelligenceAlert."""
    if not ent.case_id:
        return
    # Find matching approved entities in other cases
    matches = db.query(ExtractedEntity).filter(
        ExtractedEntity.normalized_value == ent.normalized_value,
        ExtractedEntity.case_id != ent.case_id,
        ExtractedEntity.is_approved == True
    ).all()

    # Gather all involved case IDs (current + matches)
    all_cases = {ent.case_id}
    for m in matches:
        all_cases.add(m.case_id)

    # Try to locate an existing alert that already mentions this value
    existing = db.query(IntelligenceAlert).filter(
        IntelligenceAlert.detail.contains(ent.normalized_value)
    ).first()

    if existing:
        # Update case list (dedupe + sort) and optionally bump confidence
        current_ids = set(existing.case_ids)
        updated_ids = sorted(list(current_ids.union(all_cases)))
        existing.case_ids = updated_ids
        # Optionally, you could raise confidence if many cases share it
        if len(updated_ids) > len(current_ids):
            existing.confidence = "suggested"
        db.commit()
        log_audit(db, user_name, f"Alert {existing.id} linked to new case(s) {', '.join(all_cases)}.", "intel")
    else:
        # Create a brand new alert
        alert_id = f"corr-{uuid.uuid4().hex[:4]}"
        headline = f"Shared {ent.entity_type} across {len(all_cases)} cases"
        detail = f"{ent.normalized_value} linked to {', '.join(sorted(all_cases))}"
        alert = IntelligenceAlert(
            id=alert_id,
            type=ent.entity_type,
            headline=headline,
            detail=detail,
            confidence="suggested",
            case_ids_json=json.dumps(sorted(list(all_cases))),
            detected_at=datetime.utcnow()
        )
        db.add(alert)
        db.commit()
        log_audit(db, user_name, f"Created alert {alert_id} for shared value {ent.normalized_value}.", "intel")
    return
# --- Relationship Graph Service ---
@app.get("/api/v1/cases/{case_id}/graph")
def get_case_graph(case_id: str, db: Session = Depends(get_db)):
    # Render nodes and edges for React Flow / SVG render
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    nodes = [{"id": case_id, "label": case_id, "type": "case", "status": c.status}]
    edges = []
    
    # Query approved entities
    approved_entities = db.query(ExtractedEntity).filter(
        ExtractedEntity.case_id == case_id,
        ExtractedEntity.is_approved == True
    ).all()
    
    for ent in approved_entities:
        ent_node_id = f"node-{ent.id}"
        nodes.append({
            "id": ent_node_id,
            "label": ent.normalized_value,
            "type": ent.entity_type,
            "raw": ent.raw_value
        })
        
        edges.append({
            "id": f"edge-{case_id}-{ent.id}",
            "source": case_id,
            "target": ent_node_id,
            "label": "extracted"
        })
        
        # Query overlap cases
        overlaps = db.query(ExtractedEntity).filter(
            ExtractedEntity.normalized_value == ent.normalized_value,
            ExtractedEntity.case_id != case_id,
            ExtractedEntity.is_approved == True
        ).all()
        
        for ov in overlaps:
            # Check if overlap case node exists
            if not any(n["id"] == ov.case_id for n in nodes):
                nodes.append({
                    "id": ov.case_id,
                    "label": ov.case_id,
                    "type": "related_case",
                    "title": db.query(Case).filter(Case.id == ov.case_id).first().title
                })
            
            edges.append({
                "id": f"edge-{ent_node_id}-{ov.case_id}",
                "source": ent_node_id,
                "target": ov.case_id,
                "label": "shared"
            })
            
    return {"nodes": nodes, "edges": edges}

# --- Intelligence Alerts Router ---
@app.get("/api/v1/intel/feed")
def get_intel_feed(db: Session = Depends(get_db)):
    alerts = db.query(IntelligenceAlert).all()
    return {"alerts": [
        {
            "id": a.id,
            "type": a.type,
            "headline": a.headline,
            "detail": a.detail,
            "confidence": a.confidence,
            "caseIds": a.case_ids,
            "detectedAt": a.detected_at.isoformat() + "Z"
        } for a in alerts
    ]}

@app.get("/api/v1/intel/spotlight")
def get_spotlight(db: Session = Depends(get_db)):
    agg = db.query(
        ExtractedEntity.entity_type,
        ExtractedEntity.normalized_value,
        func.count().label('cnt')
    ).group_by(
        ExtractedEntity.entity_type,
        ExtractedEntity.normalized_value
    ).order_by(desc('cnt')).limit(5).all()
    return {"indicators": [
        {"type": row[0], "value": row[1], "count": row[2]} for row in agg
    ]}

# --- Intelligence Stats Router ---
@app.get("/api/v1/intel/stats")
def get_intel_stats(db: Session = Depends(get_db)):
    # Total cases
    total_cases = db.query(func.count(Case.id)).scalar() or 0
    # Tracked indicators: count of IntelligenceAlert records
    tracked_indicators = db.query(func.count(IntelligenceAlert.id)).scalar() or 0
    # Active clusters: distinct types among alerts
    active_clusters = db.query(func.count(func.distinct(IntelligenceAlert.type))).scalar() or 0
    # Requires active review: cases with status "review"
    requires_active_review = db.query(func.count(Case.id)).filter(Case.status == "review").scalar() or 0
    # High severity: cases with priority "high"
    high_severity = db.query(func.count(Case.id)).filter(Case.priority == "high").scalar() or 0
    # Confirmed threat links: alerts with confidence "confirmed"
    confirmed_threat_links = db.query(func.count(IntelligenceAlert.id)).filter(IntelligenceAlert.confidence == "confirmed").scalar() or 0
    # Linkage ratio (percentage of cases with a confirmed link)
    linkage_ratio = 0
    if total_cases > 0:
        linkage_ratio = int((confirmed_threat_links / total_cases) * 100)
    # Cross‑case pattern matches: distinct entity types across extracted entities
    cross_case_pattern_matches = db.query(func.count(func.distinct(ExtractedEntity.entity_type))).scalar() or 0
    return {
        "trackedIndicators": tracked_indicators,
        "activeClusters": active_clusters,
        "requiresActiveReview": requires_active_review,
        "highSeverity": high_severity,
        "confirmedThreatLinks": confirmed_threat_links,
        "linkageRatio": f"{linkage_ratio}%",
        "crossCasePatternMatches": cross_case_pattern_matches,
    }


@app.post("/api/v1/correlations/{alert_id}/confirm")
def confirm_correlation(alert_id: str, user_name: str = Query("System"), db: Session = Depends(get_db)):
    alert = db.query(IntelligenceAlert).filter(IntelligenceAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    alert.confidence = "confirmed"
    alert.headline = alert.headline.replace("Suggested", "Confirmed")
    
    # Audit log
    log_audit(db, user_name, f"Indicator linkage {alert_id} confirmed by supervisor.", "intel")
    
    db.commit()
    return {"status": "success"}

@app.post("/api/v1/correlations/{alert_id}/dismiss")
def dismiss_correlation(alert_id: str, user_name: str = Query("System"), db: Session = Depends(get_db)):
    alert = db.query(IntelligenceAlert).filter(IntelligenceAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    db.delete(alert)
    db.commit()
    
    log_audit(db, user_name, f"Indicator correlation {alert_id} dismissed.", "intel")
    
    return {"status": "success"}

# --- Reports Router ---
@app.post("/api/v1/cases/{case_id}/reports")
def create_report(case_id: str, payload: ReportCreate, db: Session = Depends(get_db)):
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
        
    report_id = f"rpt-{uuid.uuid4().hex[:8]}"
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    filename = f"{case_id}-report-{date_str}.txt"
    
    report = Report(
        id=report_id,
        case_id=case_id,
        filename=filename,
        created_at=datetime.utcnow(),
        sections_json=json.dumps(payload.sections),
        notes=payload.notes
    )
    db.add(report)
    db.commit()
    
    log_audit(db, c.assignee, f"Generated case report {filename}.", "case")
    
    # Build complete report content
    evidence_items = db.query(EvidenceItem).filter(EvidenceItem.case_id == case_id).all()
    extractions = db.query(ExtractedEntity).filter(ExtractedEntity.case_id == case_id, ExtractedEntity.is_approved == True).all()
    
    lines = [
        "================================================",
        "KAVACH INTELLIGENCE - CYBERCRIME REPORT",
        "================================================",
        f"Generated At: {datetime.utcnow().isoformat()}Z",
        f"Case ID:      {c.id}",
        f"Title:        {c.title}",
        f"Status:       {c.status.upper()}",
        f"Assignee:     {c.assignee}",
        f"Priority:     {c.priority.upper()}",
        "------------------------------------------------",
        "ANALYST NOTES:",
        payload.notes or "No analyst notes provided.",
        "------------------------------------------------",
        f"EVIDENCE INDEX ({len(evidence_items)} items):"
    ]
    for ev in evidence_items:
        lines.append(f"- [{ev.type.upper()}] {ev.filename} ({int(ev.size_bytes/1024)} KB)")
        
    lines.append("------------------------------------------------")
    lines.append(f"EXTRACTED ENTITIES ({len(extractions)} approved):")
    for ext in extractions:
        lines.append(f"- [{ext.entity_type.upper()}] {ext.normalized_value} (Raw: {ext.raw_value})")
        
    lines.append("================================================")
    
    # Write report text file
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    with open(filepath, "w") as f:
        f.write("\n".join(lines))
        
    return {
        "status": "success",
        "reportId": report_id,
        "fileName": filename,
        "content": "\n".join(lines)
    }

# --- Search Router ---
@app.get("/api/v1/search")
def execute_global_search(q: str = Query(...), page: int = Query(1, ge=1), size: int = Query(10, ge=1), db: Session = Depends(get_db)):
    term = q.lower().strip()
    if not term:
        return {"total": 0, "page": page, "size": size, "cases": [], "intel": []}
    # Search Cases
    case_query = db.query(Case).filter(
        Case.id.ilike(f"%{term}%") |
        Case.title.ilike(f"%{term}%") |
        Case.assignee.ilike(f"%{term}%") |
        Case.status.ilike(f"%{term}%")
    )
    total_cases = case_query.count()
    cases = case_query.offset((page - 1) * size).limit(size).all()
    cases_result = []
    for c in cases:
        ev_count = db.query(EvidenceItem).filter(EvidenceItem.case_id == c.id).count()
        cases_result.append({
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
            "assignee": c.assignee,
            "evidenceCount": ev_count
        })
    # Search Intelligence Alerts
    alert_query = db.query(IntelligenceAlert).filter(
        IntelligenceAlert.headline.ilike(f"%{term}%") |
        IntelligenceAlert.detail.ilike(f"%{term}%") |
        IntelligenceAlert.type.ilike(f"%{term}%")
    )
    total_intel = alert_query.count()
    alerts = alert_query.offset((page - 1) * size).limit(size).all()
    intel_result = []
    for a in alerts:
        intel_result.append({
            "id": a.id,
            "type": a.type,
            "headline": a.headline,
            "detail": a.detail,
            "confidence": a.confidence,
            "caseIds": a.case_ids,
            "detectedAt": a.detected_at.isoformat() + "Z"
        })
    return {"totalCases": total_cases, "totalIntel": total_intel, "page": page, "size": size, "cases": cases_result, "intel": intel_result}

# --- Admin Panel Endpoints ---
@app.get("/api/v1/admin/users")
def get_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [{
        "id": u.id,
        "name": u.name,
        "bureau": u.bureau,
        "role": u.role,
        "active": u.active
    } for u in users]

@app.patch("/api/v1/admin/users/{user_id}/role")
def cycle_user_role(user_id: str, payload: UserUpdateRole, user_name: str = Query("Admin"), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
        
    old_role = u.role
    u.role = payload.role
    db.commit()
    
    log_audit(db, user_name, f"User {u.name} role changed from {old_role} to {payload.role}.", "case")
    return {"status": "success"}

@app.post("/api/v1/admin/users/{user_id}/toggle-active")
def toggle_user_active(user_id: str, user_name: str = Query("Admin"), db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
        
    u.active = not u.active
    db.commit()
    
    status_label = "Enabled" if u.active else "Disabled"
    log_audit(db, user_name, f"User status toggled: {u.name} ({status_label}).", "case")
    return {"status": "success"}

@app.get("/api/v1/admin/users/stats")
def get_user_stats(db: Session = Depends(get_db)):
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.active == True).count()
    return {"totalUsers": total_users, "activeUsers": active_users}

@app.post("/api/v1/admin/clear_all")
def clear_all_data(token: str = Query(...), db: Session = Depends(get_db)):
    # Validate token and admin role
    user_id = validate_token_and_get_user_id(token)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    # Delete all data from tables
    db.query(SuspensionRequest).delete()
    db.query(Report).delete()
    db.query(IntelligenceAlert).delete()
    db.query(AuditLog).delete()
    db.query(ExtractedEntity).delete()
    db.query(EvidenceItem).delete()
    db.query(Case).delete()
    db.query(CitizenReport).delete()
    db.commit()
    log_audit(db, user.name, "All data cleared by admin.", "admin")
    return {"status": "success", "detail": "All data cleared"}

@app.get("/api/v1/audit")
def get_audit_logs(category: str = "all", q: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(AuditLog)
    if category != "all":
        query = query.filter(AuditLog.category == category)
        
    logs = query.order_by(AuditLog.time.desc()).all()
    
    if q:
        term = q.lower().strip()
        logs = [l for l in logs if term in l.action.lower() or term in l.user.lower()]
        
    return [{
        "time": l.time.isoformat() + "Z",
        "user": l.user,
        "action": l.action,
        "category": l.category
    } for l in logs]

# --- Supervisor Router ---
@app.get("/api/v1/supervisor/queue")
def get_supervisor_queue(status: Optional[str] = Query(None), page: int = Query(1, ge=1), size: int = Query(10, ge=1), db: Session = Depends(get_db)):
    query = db.query(Case).filter(Case.status == "review")
    if status:
        query = query.filter(Case.status == status)
    total = query.count()
    cases = query.offset((page - 1) * size).limit(size).all()
    response = []
    for c in cases:
        response.append({
            "id": c.id,
            "title": c.title,
            "status": c.status,
            "priority": c.priority,
            "assignee": c.assignee,
            "updatedAt": c.updated_at.isoformat() + "Z"
        })
    return {"total": total, "page": page, "size": size, "queue": response}

# Serve uploads statically (for reports downloading)
app.mount("/uploads", StaticFiles(directory=UPLOAD_FOLDER), name="uploads")

# Serve static frontend files
frontend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend"))
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
