from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.approval_delegation import DelegationCreate, DelegationRead
from app.services import audit_service, invoice_approval_service

router = APIRouter(prefix="/api/v1/approval-delegations", tags=["approval-delegations"])

APPROVER_ROLES = ("Accounts Executive", "Dept. Manager", "Partner / VP", "Finance Team", "System Admin")


@router.post("", response_model=DelegationRead, status_code=status.HTTP_201_CREATED)
def create_delegation(
    payload: DelegationCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*APPROVER_ROLES)),
):
    result = invoice_approval_service.create_delegation(db, payload, current_user)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="ApprovalDelegation",
        record_reference=f"{result.delegator_user_id} -> {result.delegate_user_id}",
        user=current_user,
        request=request,
    )
    return result


@router.get("", response_model=list[DelegationRead])
def list_my_delegations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 4 UI's delegation-setup.html — the current user's own
    delegations, either direction (as delegator or as delegate)."""
    return invoice_approval_service.list_delegations_for_user(db, current_user.id)
