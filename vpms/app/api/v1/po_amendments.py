import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import po_amendment_repository
from app.schemas.po_amendment import POAmendmentRead
from app.services import audit_service, purchase_order_service

router = APIRouter(prefix="/api/v1/po-amendments", tags=["po-amendments"])


@router.post("/{amendment_id}/approve", response_model=POAmendmentRead)
def approve_po_amendment(
    amendment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Budget Controller", "Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(po_amendment_repository.get_by_id(db, amendment_id))
    try:
        result = purchase_order_service.approve_amendment(db, amendment_id, current_user)
    except purchase_order_service.AmendmentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.AmendmentStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE,
        module="POAmendment",
        record_reference=f"PO {result.po_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{amendment_id}/reject", response_model=POAmendmentRead)
def reject_po_amendment(
    amendment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Budget Controller", "Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(po_amendment_repository.get_by_id(db, amendment_id))
    try:
        result = purchase_order_service.reject_amendment(db, amendment_id, current_user)
    except purchase_order_service.AmendmentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.AmendmentStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT,
        module="POAmendment",
        record_reference=f"PO {result.po_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
