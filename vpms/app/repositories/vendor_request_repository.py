import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import VendorRequestStatus
from app.models.vendor_request import VendorRequest

OPEN_STATUSES = (
    VendorRequestStatus.SUBMITTED,
    VendorRequestStatus.ACCOUNTS_REVIEW,
    VendorRequestStatus.PENDING_PARTNER_APPROVAL,
)


def create(db: Session, vendor_request: VendorRequest) -> VendorRequest:
    db.add(vendor_request)
    db.commit()
    db.refresh(vendor_request)
    return vendor_request


def get_by_id(db: Session, request_id: uuid.UUID) -> VendorRequest | None:
    return db.get(VendorRequest, request_id)


def list_all(db: Session) -> list[VendorRequest]:
    return list(db.scalars(select(VendorRequest).order_by(VendorRequest.created_at.desc())))


def list_for_requester(db: Session, requester_id: uuid.UUID) -> list[VendorRequest]:
    return list(
        db.scalars(
            select(VendorRequest)
            .where(VendorRequest.requested_by == requester_id)
            .order_by(VendorRequest.created_at.desc())
        )
    )


def find_open_by_pan_or_gstin(db: Session, pan: str, gstin: str | None) -> VendorRequest | None:
    match_condition = VendorRequest.recommended_pan == pan
    if gstin:
        match_condition = match_condition | (VendorRequest.recommended_gstin == gstin)

    stmt = select(VendorRequest).where(VendorRequest.status.in_(OPEN_STATUSES), match_condition)
    return db.scalars(stmt).first()


def save(db: Session, vendor_request: VendorRequest) -> VendorRequest:
    db.add(vendor_request)
    db.commit()
    db.refresh(vendor_request)
    return vendor_request
