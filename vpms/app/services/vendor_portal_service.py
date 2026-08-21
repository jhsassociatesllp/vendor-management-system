import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.models.enums import KycDocumentStatus, KycDocumentType, OtpPurpose, VendorCategory
from app.models.notification import Notification
from app.models.role import Role
from app.models.user import User
from app.models.vendor_otp_code import VendorOtpCode
from app.models.vendor_request import VendorRequest
from app.repositories import notification_repository, user_repository, vendor_kyc_document_repository, vendor_otp_code_repository, vendor_repository
from app.schemas.vendor_portal import ProfileStatusResponse
from app.services import auth_service

OTP_TTL_MINUTES = 5
PRE_AUTH_TOKEN_TTL_MINUTES = 10
ITR_THRESHOLD_ANNUAL_SPEND = 1_000_000
# Section 2 assumption: "auto-logout after 15 minutes of inactivity" is simplified to a
# fixed 15-minute JWT expiry for vendor-portal sessions specifically (not true idle
# tracking, and not applied to staff logins via /auth/login).
VENDOR_ACCESS_TOKEN_TTL_MINUTES = 15


class VendorNotFoundError(Exception):
    pass


class PortalAlreadyActivatedError(Exception):
    pass


class EmailAlreadyInUseError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class InvalidPreAuthTokenError(Exception):
    pass


class InvalidOtpError(Exception):
    pass


def _generate_temp_password() -> str:
    return secrets.token_urlsafe(9)


def _generate_otp_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def activate_portal(db: Session, vendor_id: uuid.UUID) -> tuple[User, str]:
    vendor = vendor_repository.get_by_id(db, vendor_id)
    if vendor is None:
        raise VendorNotFoundError("Vendor not found")

    if user_repository.get_by_linked_vendor_id(db, vendor_id) is not None:
        raise PortalAlreadyActivatedError("Portal access is already activated for this vendor")

    if user_repository.get_by_email(db, vendor.email) is not None:
        raise EmailAlreadyInUseError("A user with this vendor's email already exists")

    vendor_role = db.query(Role).filter(Role.name == "Vendor").first()
    temp_password = _generate_temp_password()

    new_user = User(
        name=vendor.vendor_name,
        email=vendor.email,
        hashed_password=hash_password(temp_password),
        role_id=vendor_role.id,
        is_active=True,
        linked_vendor_id=vendor.id,
        session_version=0,
    )
    new_user = user_repository.create(db, new_user)

    notification_repository.create(
        db,
        Notification(
            user_id=new_user.id,
            message="Your VPMS vendor portal credentials have been issued. Please log in and change your password.",
        ),
    )
    db.commit()

    return new_user, temp_password


def login_step1(db: Session, email: str, password: str) -> tuple[str, str, int]:
    user = user_repository.get_by_email(db, email)
    if (
        user is None
        or not user.is_active
        or user.role.name != "Vendor"
        or not verify_password(password, user.hashed_password)
    ):
        raise InvalidCredentialsError("Incorrect email or password")

    otp_code = _generate_otp_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES)
    otp = VendorOtpCode(
        user_id=user.id,
        code=otp_code,
        purpose=OtpPurpose.LOGIN,
        expires_at=expires_at,
        consumed=False,
    )
    vendor_otp_code_repository.create(db, otp)

    pre_auth_token = create_access_token(
        {"pre_auth_user_id": str(user.id), "type": "vendor_portal_pre_auth"},
        expire_minutes=PRE_AUTH_TOKEN_TTL_MINUTES,
    )

    return pre_auth_token, otp_code, OTP_TTL_MINUTES * 60


def verify_otp(db: Session, pre_auth_token: str, code: str) -> str:
    payload = decode_access_token(pre_auth_token)
    if payload is None or payload.get("type") != "vendor_portal_pre_auth":
        raise InvalidPreAuthTokenError("Invalid or expired pre-auth token")

    user_id_str = payload.get("pre_auth_user_id")
    if user_id_str is None:
        raise InvalidPreAuthTokenError("Invalid pre-auth token")

    user = user_repository.get_by_id(db, uuid.UUID(user_id_str))
    if user is None or not user.is_active:
        raise InvalidPreAuthTokenError("Invalid pre-auth token")

    otp = vendor_otp_code_repository.find_valid(db, user.id, code, OtpPurpose.LOGIN)
    if otp is None:
        raise InvalidOtpError("Invalid, expired, or already-used OTP")

    otp.consumed = True
    vendor_otp_code_repository.save(db, otp)

    user.session_version += 1
    user_repository.save(db, user)

    return auth_service.issue_token_for_user(user, expire_minutes=VENDOR_ACCESS_TOKEN_TTL_MINUTES)


def mandatory_document_types(db: Session, vendor) -> list[KycDocumentType]:
    mandatory = [
        KycDocumentType.PAN,
        KycDocumentType.BANK_PROOF,
        KycDocumentType.BENEFICIAL_OWNERSHIP,
    ]
    if vendor.gstin:
        mandatory.append(KycDocumentType.GST_CERTIFICATE)
    if vendor.msme_status:
        mandatory.append(KycDocumentType.MSME_CERTIFICATE)
    if vendor.vendor_category == VendorCategory.GOODS_SUPPLIER:
        mandatory.append(KycDocumentType.MOA_INCORPORATION)

    source_request = db.get(VendorRequest, vendor.source_request_id)
    if source_request is not None and source_request.estimated_annual_spend > ITR_THRESHOLD_ANNUAL_SPEND:
        mandatory.append(KycDocumentType.ITR_AUDITED_FINANCIALS)

    return mandatory


def get_profile_status(db: Session, vendor) -> ProfileStatusResponse:
    mandatory_types = mandatory_document_types(db, vendor)
    documents = vendor_kyc_document_repository.list_for_vendor(db, vendor.id)

    verified_types = {d.document_type for d in documents if d.status == KycDocumentStatus.VERIFIED}
    missing = [t.value for t in mandatory_types if t not in verified_types]

    return ProfileStatusResponse(
        vendor_id=vendor.id,
        complete=len(missing) == 0,
        mandatory_documents=[t.value for t in mandatory_types],
        verified_documents=[t.value for t in verified_types],
        missing_or_unverified=missing,
    )
