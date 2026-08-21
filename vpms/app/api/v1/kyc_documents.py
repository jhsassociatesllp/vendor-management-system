import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import vendor_kyc_document_repository
from app.schemas.kyc_document import KycDocumentRead, KycReviewRequest
from app.services import audit_service, kyc_service

router = APIRouter(prefix="/api/v1/kyc-documents", tags=["kyc-documents"])


@router.get("/pending", response_model=list[KycDocumentRead])
def list_pending_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    return kyc_service.list_pending_documents(db)


@router.post("/{document_id}/review", response_model=KycDocumentRead)
def review_document(
    document_id: uuid.UUID,
    payload: KycReviewRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    before = audit_service.model_to_dict(vendor_kyc_document_repository.get_by_id(db, document_id))
    try:
        result = kyc_service.review_document(db, document_id, payload.decision, payload.rejection_reason, current_user)
    except kyc_service.DocumentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE if payload.decision == "verify" else AuditAction.REJECT,
        module="KycDocument",
        record_reference=f"{result.document_type.value} / vendor {result.vendor_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


# Not a public /uploads static mount, deliberately: KYC documents are sensitive PII
# (PAN, bank proof, etc.), so this requires the caller to be either a reviewer or the
# vendor who owns the document, same as every other authenticated resource in the app.
@router.get("/{document_id}/file")
def download_document_file(
    document_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        document, path = kyc_service.get_document_file(db, document_id, current_user)
    except kyc_service.DocumentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except kyc_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except kyc_service.FileUnavailableError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    # Section 2 of the Phase 5 spec: viewing a KYC document is a sensitive-view exception
    # to the "don't log every GET" rule.
    audit_service.log_audit(
        db,
        action=AuditAction.VIEW,
        module="KycDocument",
        record_reference=f"{document.document_type.value} / vendor {document.vendor_id}",
        user=current_user,
        request=request,
    )

    filename = path.name.split("_", 1)[-1] if "_" in path.name else path.name
    return FileResponse(path, filename=filename)
