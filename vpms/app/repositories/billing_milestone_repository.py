import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.billing_milestone import BillingMilestone


def get_by_id(db: Session, milestone_id: uuid.UUID) -> BillingMilestone | None:
    return db.get(BillingMilestone, milestone_id)


def list_for_agreement(db: Session, agreement_id: uuid.UUID) -> list[BillingMilestone]:
    stmt = select(BillingMilestone).where(BillingMilestone.agreement_id == agreement_id)
    return list(db.scalars(stmt))


def total_percentage_for_agreement(db: Session, agreement_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(BillingMilestone.percentage_of_contract_value), 0)).where(
            BillingMilestone.agreement_id == agreement_id
        )
    )
    return Decimal(total)


def create(db: Session, milestone: BillingMilestone) -> BillingMilestone:
    db.add(milestone)
    db.commit()
    db.refresh(milestone)
    return milestone
