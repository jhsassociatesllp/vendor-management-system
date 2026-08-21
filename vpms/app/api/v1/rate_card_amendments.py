import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import rate_card_amendment_repository
from app.schemas.rate_card_amendment import AmendmentRead
from app.services import audit_service, rate_card_service

router = APIRouter(prefix="/api/v1/rate-card-amendments", tags=["rate-card-amendments"])


@router.post("/{amendment_id}/approve", response_model=AmendmentRead)
def approve_amendment(
    amendment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(rate_card_amendment_repository.get_by_id(db, amendment_id))
    try:
        result = rate_card_service.approve_amendment(db, amendment_id, current_user)
    except rate_card_service.AmendmentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except rate_card_service.AmendmentNotPendingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except rate_card_service.AmendmentSelfApprovalError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE,
        module="RateCardAmendment",
        record_reference=f"RateCard {result.rate_card_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{amendment_id}/reject", response_model=AmendmentRead)
def reject_amendment(
    amendment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(rate_card_amendment_repository.get_by_id(db, amendment_id))
    try:
        result = rate_card_service.reject_amendment(db, amendment_id, current_user)
    except rate_card_service.AmendmentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except rate_card_service.AmendmentNotPendingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except rate_card_service.AmendmentSelfApprovalError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT,
        module="RateCardAmendment",
        record_reference=f"RateCard {result.rate_card_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
