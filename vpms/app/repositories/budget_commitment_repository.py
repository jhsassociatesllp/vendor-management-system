import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.budget_commitment import BudgetCommitment


def committed_total_for_head(db: Session, budget_head_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(BudgetCommitment.committed_amount), 0)).where(
            BudgetCommitment.budget_head_id == budget_head_id,
            BudgetCommitment.is_released.is_(False),
        )
    )
    return Decimal(total)


def get_active_for_po(db: Session, po_id: uuid.UUID) -> BudgetCommitment | None:
    return db.scalars(
        select(BudgetCommitment).where(
            BudgetCommitment.po_id == po_id,
            BudgetCommitment.is_released.is_(False),
        )
    ).first()


def create(db: Session, commitment: BudgetCommitment) -> BudgetCommitment:
    db.add(commitment)
    db.flush()
    return commitment


def save(db: Session, commitment: BudgetCommitment) -> BudgetCommitment:
    db.add(commitment)
    db.flush()
    return commitment
