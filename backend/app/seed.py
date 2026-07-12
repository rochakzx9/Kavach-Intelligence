import json
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import User, Case, EvidenceItem, ExtractedEntity, IntelligenceAlert, AuditLog
from .database import engine, Base
from .security import hash_password

logger = logging.getLogger("kavach")

def seed_db(db: Session):
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    # Check if we already have users
    if db.query(User).count() > 0:
        return
    
    # 1. Seed Users
    users = [
        User(id="usr-001", email="investigator@cyber.gov", password=hash_password("demo123"), name="Priya Sharma", badge_id="INV-2847", role="investigator", bureau="Cyber Crime Unit — Zone 4", active=True, status="approved"),
        User(id="usr-002", email="amit@cyber.gov", password=hash_password("demo123"), name="Amit Khan", badge_id="INV-2848", role="investigator", bureau="Financial Fraud Command", active=True, status="approved"),
        User(id="usr-003", email="supervisor@cyber.gov", password=hash_password("demo123"), name="Neha Murthy", badge_id="SUP-9012", role="supervisor", bureau="Threat Intelligence Section", active=True, status="approved"),
        User(id="usr-004", email="admin@cyber.gov", password=hash_password("demo123"), name="System Administrator", badge_id="ADM-2947", role="admin", bureau="Security Operations Command", active=True, status="approved"),
        # Pending supervisor for signup request testing
        User(id="usr-005", email="pending_supervisor@cyber.gov", password=hash_password("demo123"), name="Pending Supervisor", badge_id="SUP-9999", role="supervisor", bureau="Intelligence Division", active=False, status="pending")
    ]

    for u in users:
        db.add(u)
       # 2. Seed Cases (Skipped - start clean)
    
    # 3. Seed Evidence (Skipped - start clean)
        
    # 4. Seed Extracted Entities (Skipped - start clean)

    # 5. Seed Intelligence Alerts (Skipped - start clean)

    # 6. Seed Audit Logs
    logs = [
        AuditLog(time=datetime.utcnow(), user="System", action="Security logging engine initialized clean.", category="case"),
        AuditLog(time=datetime.utcnow(), user="System", action="Active cyber threat pattern scanner loaded.", category="case"),
    ]
    for l in logs:
        db.add(l)

    db.commit()
    logger.info("Database seed completed successfully.")

