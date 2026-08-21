import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget_head import BudgetHead


def get_by_id(db: Session, budget_head_id: uuid.UUID) -> BudgetHead | None:
    return db.get(BudgetHead, budget_head_id)


def list_all(db: Session) -> list[BudgetHead]:
    return list(db.scalars(select(BudgetHead).order_by(BudgetHead.created_at.desc())))


def create(db: Session, budget_head: BudgetHead) -> BudgetHead:
    db.add(budget_head)
    db.commit()
    db.refresh(budget_head)
    return budget_head
