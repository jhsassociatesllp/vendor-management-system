import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import OtpPurpose
from app.models.vendor_otp_code import VendorOtpCode


def create(db: Session, otp: VendorOtpCode) -> VendorOtpCode:
    db.add(otp)
    db.commit()
    db.refresh(otp)
    return otp


def find_valid(db: Session, user_id: uuid.UUID, code: str, purpose: OtpPurpose) -> VendorOtpCode | None:
    stmt = select(VendorOtpCode).where(
        VendorOtpCode.user_id == user_id,
        VendorOtpCode.code == code,
        VendorOtpCode.purpose == purpose,
        VendorOtpCode.consumed.is_(False),
        VendorOtpCode.expires_at > datetime.now(timezone.utc),
    )
    return db.scalars(stmt).first()


def save(db: Session, otp: VendorOtpCode) -> VendorOtpCode:
    db.add(otp)
    db.commit()
    db.refresh(otp)
    return otp
