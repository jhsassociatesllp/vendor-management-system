import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import KycDocumentStatus
from app.models.vendor_kyc_document import VendorKycDocument


def get_by_id(db: Session, document_id: uuid.UUID) -> VendorKycDocument | None:
    return db.get(VendorKycDocument, document_id)


def list_for_vendor(db: Session, vendor_id: uuid.UUID) -> list[VendorKycDocument]:
    stmt = select(VendorKycDocument).where(VendorKycDocument.vendor_id == vendor_id)
    return list(db.scalars(stmt))


def list_pending(db: Session) -> list[VendorKycDocument]:
    stmt = select(VendorKycDocument).where(VendorKycDocument.status == KycDocumentStatus.PENDING_REVIEW)
    return list(db.scalars(stmt))


def create(db: Session, document: VendorKycDocument) -> VendorKycDocument:
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def save(db: Session, document: VendorKycDocument) -> VendorKycDocument:
    db.add(document)
    db.commit()
    db.refresh(document)
    return document
