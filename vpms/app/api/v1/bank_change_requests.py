import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import bank_change_request_repository
from app.schemas.bank_change_request import BankChangeRead, BankChangeRejectRequest
from app.services import audit_service, bank_change_service

router = APIRouter(prefix="/api/v1/bank-change-requests", tags=["bank-change-requests"])

# Matches the Phase 2B backend spec's endpoint table literally: Accounts Executive,
# System Admin only. (Briefly widened to include Partner/VP per the UI spec's Section
# 3.7/4 wording, but reverted after manual testing — the user decided to keep bank-change
# approval restricted to the Accounts team only.)
APPROVER_ROLES = ("Accounts Executive", "System Admin")


@router.get("", response_model=list[BankChangeRead])
def list_bank_change_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*APPROVER_ROLES)),
):
    return bank_change_service.list_all(db)


@router.post("/{request_id}/approve", response_model=BankChangeRead)
def approve_bank_change(
    request_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*APPROVER_ROLES)),
):
    before = audit_service.model_to_dict(bank_change_request_repository.get_by_id(db, request_id))
    try:
        result = bank_change_service.approve_step(db, request_id, current_user)
    except bank_change_service.BankChangeRequestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except bank_change_service.SameApproverError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except bank_change_service.RequestNotPendingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE,
        module="BankChangeRequest",
        record_reference=f"vendor {result.vendor_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{request_id}/reject", response_model=BankChangeRead)
def reject_bank_change(
    request_id: uuid.UUID,
    payload: BankChangeRejectRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*APPROVER_ROLES)),
):
    before = audit_service.model_to_dict(bank_change_request_repository.get_by_id(db, request_id))
    try:
        result = bank_change_service.reject_step(db, request_id, payload.rejection_reason)
    except bank_change_service.BankChangeRequestNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except bank_change_service.RequestNotPendingError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT,
        module="BankChangeRequest",
        record_reference=f"vendor {result.vendor_id}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
