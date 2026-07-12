import json
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)  # In practice hashed, mock credentials check for demo
    name = Column(String)
    badge_id = Column(String, nullable=True)
    role = Column(String)  # citizen, moderator, investigator, supervisor, admin
    bureau = Column(String, nullable=True)
    active = Column(Boolean, default=True)

    # New RBAC fields
    status = Column(String, default="pending")  # pending, approved, rejected
    rejection_reason = Column(String, nullable=True)
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    legal_id = Column(String, nullable=True)

class Case(Base):
    __tablename__ = "cases"
    
    id = Column(String, primary_key=True, index=True)  # e.g. CYB-2026-0142
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default="active")  # active, pending, review, closed
    priority = Column(String, default="medium")  # low, medium, high
    assignee = Column(String, default="P. Sharma")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)
    
    # New creator field
    creator_id = Column(String, nullable=True)  # will store User.id of creator

    scam_platform = Column(String, nullable=True)
    scam_platform_account = Column(String, nullable=True)
    scam_platform_url = Column(String, nullable=True)
    scam_type = Column(String, nullable=True)
    scam_amount = Column(Integer, nullable=True)
    scam_date = Column(DateTime, nullable=True)
    victim_name = Column(String, nullable=True)
    victim_phone = Column(String, nullable=True)
    victim_email = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)

    evidence_items = relationship("EvidenceItem", back_populates="case", cascade="all, delete-orphan")
    extracted_entities = relationship("ExtractedEntity", back_populates="case", cascade="all, delete-orphan")

class CitizenReport(Base):
    __tablename__ = "citizen_reports"
    
    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending")  # pending, approved, rejected
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    citizen_id = Column(String, ForeignKey("users.id"))
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=True)
    
    scam_platform = Column(String, nullable=True)
    scam_platform_account = Column(String, nullable=True)
    scam_platform_url = Column(String, nullable=True)
    scam_type = Column(String, nullable=True)
    scam_amount = Column(Integer, nullable=True)
    scam_date = Column(DateTime, nullable=True)
    victim_name = Column(String, nullable=True)
    victim_phone = Column(String, nullable=True)
    victim_email = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    
    evidence_items = relationship("EvidenceItem", back_populates="citizen_report", cascade="all, delete-orphan")

class EvidenceItem(Base):
    __tablename__ = "evidence_items"
    
    id = Column(String, primary_key=True, index=True)
    filename = Column(String)
    filepath = Column(String)
    type = Column(String)  # screenshot, chat, document, transaction_record
    size_bytes = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    ocr_status = Column(String, default="pending")  # pending, processing, completed
    case_id = Column(String, ForeignKey("cases.id"), nullable=True)
    citizen_report_id = Column(String, ForeignKey("citizen_reports.id"), nullable=True)
    
    case = relationship("Case", back_populates="evidence_items")
    citizen_report = relationship("CitizenReport", back_populates="evidence_items")
    extracted_entities = relationship("ExtractedEntity", back_populates="evidence_item", cascade="all, delete-orphan")

class ExtractedEntity(Base):
    __tablename__ = "extracted_entities"
    
    id = Column(String, primary_key=True, index=True)
    entity_type = Column(String)  # phone, upi, url, domain, email
    raw_value = Column(String)
    normalized_value = Column(String)
    is_approved = Column(Boolean, default=False)
    is_edited = Column(Boolean, default=False)
    
    case_id = Column(String, ForeignKey("cases.id"))
    evidence_id = Column(String, ForeignKey("evidence_items.id"))
    
    case = relationship("Case", back_populates="extracted_entities")
    evidence_item = relationship("EvidenceItem", back_populates="extracted_entities")

class IntelligenceAlert(Base):
    __tablename__ = "intelligence_alerts"
    
    id = Column(String, primary_key=True, index=True)
    type = Column(String)  # domain, upi, phone
    headline = Column(String)
    detail = Column(String)
    confidence = Column(String, default="suggested")  # suggested, confirmed
    case_ids_json = Column(String, default="[]")  # stored as JSON array string
    detected_at = Column(DateTime, default=datetime.utcnow)

    @property
    def case_ids(self):
        return json.loads(self.case_ids_json)

    @case_ids.setter
    def case_ids(self, val):
        self.case_ids_json = json.dumps(val)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    time = Column(DateTime, default=datetime.utcnow)
    user = Column(String)
    action = Column(String)
    category = Column(String)  # case, login, intel

class Report(Base):
    __tablename__ = "reports"
    
    id = Column(String, primary_key=True, index=True)
    case_id = Column(String, ForeignKey("cases.id"))
    filename = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    sections_json = Column(String, default="[]")
    notes = Column(Text, nullable=True)

class SuspensionRequest(Base):
    __tablename__ = "suspension_requests"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    target_user_id = Column(String, ForeignKey("users.id"))
    reason = Column(String)
    requested_by_id = Column(String, ForeignKey("users.id"))
    verified_by_id = Column(String, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="reported")  # reported, forwarded, approved, rejected
    rejection_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    target_user = relationship("User", foreign_keys=[target_user_id])
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    verified_by = relationship("User", foreign_keys=[verified_by_id])
