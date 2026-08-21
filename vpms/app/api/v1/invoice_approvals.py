import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import invoice_approval_repository
from app.schemas.invoice_approval import ApprovalActionRequest, InvoiceApprovalRead
from app.services import audit_service, invoice_approval_service

router = APIRouter(prefix="/api/v1/invoice-approvals", tags=["invoice-approvals"])

# Which AuditAction each level-specific action string maps to — Verify/Approve/
# Approve_For_Payment are all decisions to move forward (Approve); Return_To_Vendor/
# Return_To_Accounts/Hold/Release are state toggles that aren't a final yes/no (Update).
_ACTION_TO_AUDIT_ACTION = {
    "Verify": AuditAction.APPROVE,
    "Approve": AuditAction.APPROVE,
    "Approve_For_Payment": AuditAction.APPROVE,
    "Reject": AuditAction.REJECT,
    "Return_To_Vendor": AuditAction.UPDATE,
    "Return_To_Accounts": AuditAction.UPDATE,
    "Hold": AuditAction.UPDATE,
    "Release": AuditAction.UPDATE,
}


@router.get("/my-queue", response_model=list[InvoiceApprovalRead])
def get_my_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return invoice_approval_service.get_my_queue(db, current_user)


@router.get("/escalations", response_model=list[InvoiceApprovalRead])
def list_escalations(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role("Accounts Executive", "Partner / VP", "Finance Team", "System Admin")
    ),
):
    return invoice_approval_service.list_escalations(db)


@router.get("/{approval_id}", response_model=InvoiceApprovalRead)
def get_approval(
    approval_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return invoice_approval_service.get_approval(db, approval_id)
    except invoice_approval_service.ApprovalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{approval_id}/action", response_model=InvoiceApprovalRead)
def take_action(
    approval_id: uuid.UUID,
    payload: ApprovalActionRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    before = audit_service.model_to_dict(invoice_approval_repository.get_by_id(db, approval_id))
    try:
        result = invoice_approval_service.take_action(db, approval_id, payload.action, payload.comments, current_user)
    except invoice_approval_service.ApprovalNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except invoice_approval_service.StageNotActiveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except invoice_approval_service.NotAuthorizedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except invoice_approval_service.InvalidActionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    invoice = result.invoice
    audit_service.log_audit(
        db,
        action=_ACTION_TO_AUDIT_ACTION.get(payload.action, AuditAction.UPDATE),
        module="InvoiceApproval",
        record_reference=f"{invoice.invoice_number if invoice else result.invoice_id} / {result.level.value}",
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
