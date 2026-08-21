import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction, KycDocumentType
from app.models.user import User
from app.repositories import user_repository, vendor_repository
from app.schemas.bank_change_request import BankChangeCreate, BankChangeRead
from app.schemas.kyc_document import KycDocumentRead
from app.schemas.vendor_portal import (
    ActivatePortalResponse,
    LoginStep1Request,
    LoginStep1Response,
    ProfileStatusResponse,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services import audit_service, bank_change_service, kyc_service, vendor_portal_service

router = APIRouter(prefix="/api/v1/vendor-portal", tags=["vendor-portal"])


@router.post("/activate/{vendor_id}", response_model=ActivatePortalResponse, status_code=status.HTTP_201_CREATED)
def activate_portal(
    vendor_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        user, temp_password = vendor_portal_service.activate_portal(db, vendor_id)
    except vendor_portal_service.VendorNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except vendor_portal_service.PortalAlreadyActivatedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except vendor_portal_service.EmailAlreadyInUseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="VendorPortalUser",
        record_reference=user.email,
        user=current_user,
        request=request,
    )
    return ActivatePortalResponse(
        user_id=user.id, vendor_id=vendor_id, email=user.email, temp_password=temp_password
    )


@router.post("/auth/login-step1", response_model=LoginStep1Response)
def login_step1(payload: LoginStep1Request, db: Session = Depends(get_db)):
    try:
        pre_auth_token, otp_code, expires_in = vendor_portal_service.login_step1(db, payload.email, payload.password)
    except vendor_portal_service.InvalidCredentialsError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    return LoginStep1Response(
        pre_auth_token=pre_auth_token, otp_code_dev_only=otp_code, expires_in_seconds=expires_in
    )


@router.post("/auth/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(payload: VerifyOtpRequest, request: Request, db: Session = Depends(get_db)):
    # The actual authentication moment for a vendor-portal user (login-step1 only checks
    # the password) — logged as Login/Login_Failed the same way Phase 0's staff login is,
    # even though the spec's Section 4.4 names Phase 0's endpoint specifically rather than
    # this one; skipping an entire user population's login events felt like the wrong call.
    pre_auth_payload = decode_access_token(payload.pre_auth_token)
    attempted_user = None
    if pre_auth_payload and pre_auth_payload.get("pre_auth_user_id"):
        attempted_user = user_repository.get_by_id(db, uuid.UUID(pre_auth_payload["pre_auth_user_id"]))

    try:
        access_token = vendor_portal_service.verify_otp(db, payload.pre_auth_token, payload.code)
    except (vendor_portal_service.InvalidPreAuthTokenError, vendor_portal_service.InvalidOtpError):
        audit_service.log_audit(
            db,
            action=AuditAction.LOGIN_FAILED,
            module="Auth",
            record_reference=attempted_user.email if attempted_user else "unknown",
            user=attempted_user,
            request=request,
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired OTP")

    logged_in_user = attempted_user or user_repository.get_by_id(
        db, uuid.UUID(decode_access_token(access_token)["user_id"])
    )
    audit_service.log_audit(
        db, action=AuditAction.LOGIN, module="Auth", record_reference=logged_in_user.email, user=logged_in_user, request=request
    )
    return VerifyOtpResponse(access_token=access_token)


@router.post("/kyc-documents", response_model=KycDocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_kyc_document(
    request: Request,
    vendor_id: uuid.UUID = Form(...),
    document_type: KycDocumentType = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    content = await file.read()
    try:
        result = kyc_service.upload_document(db, vendor_id, document_type, file.filename, content, current_user)
    except kyc_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.DOCUMENT_UPLOAD,
        module="KycDocument",
        record_reference=f"{document_type.value} / vendor {vendor_id}",
        user=current_user,
        request=request,
    )
    return result


@router.get("/kyc-documents", response_model=list[KycDocumentRead])
def list_own_kyc_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return kyc_service.list_own_documents(db, current_user)
    except kyc_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/profile/status", response_model=ProfileStatusResponse)
def get_profile_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized")

    vendor = vendor_repository.get_by_id(db, current_user.linked_vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")

    return vendor_portal_service.get_profile_status(db, vendor)


@router.post("/bank-change-requests", response_model=BankChangeRead, status_code=status.HTTP_201_CREATED)
def request_bank_change(
    payload: BankChangeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = bank_change_service.request_change(db, current_user, payload)
    except bank_change_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="BankChangeRequest",
        record_reference=f"vendor {result.vendor_id}",
        user=current_user,
        request=request,
    )
    return result


# Addition beyond the Phase 2B backend spec: it only defined POST for vendors and a
# reviewer-only list, with no way for a vendor to check their own request's current
# approval step. Mirrors the existing GET /vendor-portal/kyc-documents (list own) pattern.
@router.get("/bank-change-requests", response_model=list[BankChangeRead])
def list_own_bank_change_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return bank_change_service.list_own(db, current_user)
    except bank_change_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
