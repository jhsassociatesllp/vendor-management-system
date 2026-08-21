import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.budget_head import BudgetHead
from app.repositories import budget_commitment_repository, budget_head_repository
from app.schemas.budget_head import BudgetHeadCreate


class BudgetHeadNotFoundError(Exception):
    pass


def create_budget_head(db: Session, payload: BudgetHeadCreate) -> BudgetHead:
    budget_head = BudgetHead(
        department=payload.department,
        cost_centre=payload.cost_centre,
        period_type=payload.period_type,
        period_label=payload.period_label,
        sanctioned_amount=payload.sanctioned_amount,
    )
    return budget_head_repository.create(db, budget_head)


def list_budget_heads(db: Session) -> list[BudgetHead]:
    return budget_head_repository.list_all(db)


def get_budget_head(db: Session, budget_head_id: uuid.UUID) -> BudgetHead | None:
    return budget_head_repository.get_by_id(db, budget_head_id)


def committed_amount(db: Session, budget_head_id: uuid.UUID) -> Decimal:
    return budget_commitment_repository.committed_total_for_head(db, budget_head_id)


def available_amount(db: Session, budget_head: BudgetHead) -> Decimal:
    """Section 2's flagged formula for this phase: sanctioned - committed (active POs).
    Does not subtract paid invoice actuals — that arrives in Phase 4 with Payment."""
    return Decimal(budget_head.sanctioned_amount) - committed_amount(db, budget_head.id)
