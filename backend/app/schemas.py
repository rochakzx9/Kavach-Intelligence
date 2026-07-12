from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# Auth Schemas
class UserLogin(BaseModel):
    email: Optional[str] = None
    badgeId: Optional[str] = None
    password: str

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    badgeId: Optional[str] = None
    role: str
    bureau: Optional[str] = None
    active: bool
    status: str
    rejection_reason: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    legal_id: Optional[str] = None

class UserSignup(BaseModel):
    email: str
    password: str
    name: str
    role: str
    badgeId: Optional[str] = None
    bureau: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    legal_id: Optional[str] = None

class UserUpdateProfile(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None

class CitizenReportCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    scam_platform: Optional[str] = None
    scam_platform_account: Optional[str] = None
    scam_platform_url: Optional[str] = None
    scam_type: Optional[str] = None
    scam_amount: Optional[int] = None
    scam_date: Optional[str] = None
    victim_name: Optional[str] = None
    victim_phone: Optional[str] = None
    victim_email: Optional[str] = None
    payment_method: Optional[str] = None

class CitizenReportResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    status: str
    rejection_reason: Optional[str] = None
    citizen_id: str
    reviewer_id: Optional[str] = None
    scam_platform: Optional[str] = None
    scam_platform_account: Optional[str] = None
    scam_platform_url: Optional[str] = None
    scam_type: Optional[str] = None
    scam_amount: Optional[int] = None
    scam_date: Optional[datetime] = None
    victim_name: Optional[str] = None
    victim_phone: Optional[str] = None
    victim_email: Optional[str] = None
    payment_method: Optional[str] = None
    created_at: datetime
    evidenceCount: int = 0

    class Config:
        from_attributes = True

class CitizenReportReview(BaseModel):
    status: str # approved, rejected
    rejection_reason: Optional[str] = None

class SuspensionRequestCreate(BaseModel):
    target_user_id: str
    reason: str

class SuspensionRequestResponse(BaseModel):
    id: int
    target_user_id: str
    target_user_name: Optional[str] = None
    reason: str
    requested_by_id: str
    requested_by_name: Optional[str] = None
    verified_by_id: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SignupRequestReview(BaseModel):
    action: str # approve, reject
    reason: Optional[str] = None

class LoginResponse(BaseModel):
    token: str
    user: UserProfile

class UserUpdateRole(BaseModel):
    userId: str
    role: str

class UserToggleActive(BaseModel):
    userId: str

# Case Schemas
class CaseCreate(BaseModel):
    id: Optional[str] = None
    title: str
    description: Optional[str] = ""
    priority: str = "medium"
    assignee: str = "P. Sharma"
    scam_platform: Optional[str] = None
    scam_platform_account: Optional[str] = None
    scam_platform_url: Optional[str] = None
    scam_type: Optional[str] = None
    scam_amount: Optional[int] = None
    scam_date: Optional[str] = None
    victim_name: Optional[str] = None
    victim_phone: Optional[str] = None
    victim_email: Optional[str] = None
    payment_method: Optional[str] = None

class CaseUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    scam_platform: Optional[str] = None
    scam_platform_account: Optional[str] = None
    scam_platform_url: Optional[str] = None
    scam_type: Optional[str] = None
    scam_amount: Optional[int] = None
    scam_date: Optional[str] = None
    victim_name: Optional[str] = None
    victim_phone: Optional[str] = None
    victim_email: Optional[str] = None
    payment_method: Optional[str] = None

class CaseResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    status: str
    priority: str
    assignee: str
    created_at: datetime
    updated_at: datetime
    evidenceCount: int
    scam_platform: Optional[str] = None
    scam_platform_account: Optional[str] = None
    scam_platform_url: Optional[str] = None
    scam_type: Optional[str] = None
    scam_amount: Optional[int] = None
    scam_date: Optional[datetime] = None
    victim_name: Optional[str] = None
    victim_phone: Optional[str] = None
    victim_email: Optional[str] = None
    payment_method: Optional[str] = None

    class Config:
        from_attributes = True

class CaseDetailResponse(CaseResponse):
    evidence: List[dict] = []
    correlations: List[dict] = []
    timeline: List[dict] = []
    related: List[dict] = []
    reports: List[dict] = []

# Evidence & OCR Schemas
class EvidenceResponse(BaseModel):
    id: str
    filename: str
    type: str
    sizeBytes: int
    uploadedAt: datetime
    ocrStatus: str
    caseId: str

class ExtractedEntityResponse(BaseModel):
    id: str
    entity_type: str
    raw_value: str
    normalized_value: str
    is_approved: bool
    is_edited: bool
    case_id: str
    evidence_id: str

class ExtractedEntityUpdate(BaseModel):
    normalized_value: str
    is_approved: bool

# Intelligence Alerts
class IntelAlertResponse(BaseModel):
    id: str
    type: str
    headline: str
    detail: str
    confidence: str
    caseIds: List[str]
    detectedAt: datetime

# Audit Logs
class AuditLogResponse(BaseModel):
    time: datetime
    user: str
    action: str
    category: str

# Reports
class ReportCreate(BaseModel):
    sections: List[str]
    notes: Optional[str] = ""

class ReportResponse(BaseModel):
    id: str
    caseId: str
    filename: str
    createdAt: datetime
    sections: List[str]
    notes: Optional[str] = ""

class ManualEntityCreate(BaseModel):
    phone: Optional[str] = None
    upi: Optional[str] = None
    url: Optional[str] = None

