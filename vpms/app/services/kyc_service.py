import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.storage import InvalidStoredPathError, resolve_upload_path, save_upload_and_hash
from app.models.enums import KycDocumentStatus, KycDocumentType
from app.models.user import User
from app.models.vendor_kyc_document import VendorKycDocument
from app.repositories import vendor_kyc_document_repository

REVIEWER_ROLES = ("Accounts Executive", "System Admin")


class NotOwnVendorError(Exception):
    pass


class DocumentNotFoundError(Exception):
    pass


class FileUnavailableError(Exception):
    pass


def _require_own_vendor(current_user: User, vendor_id: uuid.UUID) -> None:
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != vendor_id:
        raise NotOwnVendorError("Not authorized to act on this vendor's KYC documents")


def upload_document(
    db: Session,
    vendor_id: uuid.UUID,
    document_type: KycDocumentType,
    filename: str,
    content: bytes,
    current_user: User,
) -> VendorKycDocument:
    _require_own_vendor(current_user, vendor_id)

    file_url, file_hash = save_upload_and_hash(vendor_id, filename, content)

    document = VendorKycDocument(
        vendor_id=vendor_id,
        document_type=document_type,
        file_url=file_url,
        file_hash=file_hash,
        status=KycDocumentStatus.PENDING_REVIEW,
    )
    return vendor_kyc_document_repository.create(db, document)


def list_own_documents(db: Session, current_user: User) -> list[VendorKycDocument]:
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id is None:
        raise NotOwnVendorError("Only a vendor-portal user has KYC documents to list")
    return vendor_kyc_document_repository.list_for_vendor(db, current_user.linked_vendor_id)


def list_pending_documents(db: Session) -> list[VendorKycDocument]:
    return vendor_kyc_document_repository.list_pending(db)


def review_document(
    db: Session, document_id: uuid.UUID, decision: str, rejection_reason: str | None, reviewer: User
) -> VendorKycDocument:
    document = vendor_kyc_document_repository.get_by_id(db, document_id)
    if document is None:
        raise DocumentNotFoundError("KYC document not found")

    document.status = KycDocumentStatus.VERIFIED if decision == "verify" else KycDocumentStatus.REJECTED
    document.rejection_reason = rejection_reason if decision == "reject" else None
    document.reviewed_by = reviewer.id
    document.reviewed_at = datetime.now(timezone.utc)

    return vendor_kyc_document_repository.save(db, document)


def get_document_file(db: Session, document_id: uuid.UUID, current_user: User) -> tuple[VendorKycDocument, Path]:
    document = vendor_kyc_document_repository.get_by_id(db, document_id)
    if document is None:
        raise DocumentNotFoundError("KYC document not found")

    is_reviewer = current_user.role.name in REVIEWER_ROLES
    is_owning_vendor = current_user.role.name == "Vendor" and current_user.linked_vendor_id == document.vendor_id
    if not is_reviewer and not is_owning_vendor:
        raise NotOwnVendorError("Not authorized to view this document")

    try:
        path = resolve_upload_path(document.file_url)
    except InvalidStoredPathError as exc:
        raise FileUnavailableError(str(exc))

    return document, path
