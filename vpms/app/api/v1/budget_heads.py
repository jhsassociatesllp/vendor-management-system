import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.budget_head import BudgetAvailabilityRead, BudgetHeadCreate, BudgetHeadRead
from app.services import audit_service, budget_service

router = APIRouter(prefix="/api/v1/budget-heads", tags=["budget-heads"])


@router.post("", response_model=BudgetHeadRead, status_code=status.HTTP_201_CREATED)
def create_budget_head(
    payload: BudgetHeadCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Budget Controller", "System Admin")),
):
    result = budget_service.create_budget_head(db, payload)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="BudgetHead",
        record_reference=f"{result.department} / {result.cost_centre}",
        user=current_user,
        request=request,
    )
    return result


@router.get("", response_model=list[BudgetHeadRead])
def list_budget_heads(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return budget_service.list_budget_heads(db)


@router.get("/{budget_head_id}/availability", response_model=BudgetAvailabilityRead)
def get_budget_availability(
    budget_head_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    budget_head = budget_service.get_budget_head(db, budget_head_id)
    if budget_head is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget head not found")

    committed = budget_service.committed_amount(db, budget_head_id)
    return BudgetAvailabilityRead(
        budget_head_id=budget_head.id,
        sanctioned_amount=budget_head.sanctioned_amount,
        committed_amount=committed,
        available_amount=budget_head.sanctioned_amount - committed,
    )
