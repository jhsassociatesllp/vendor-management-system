import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.approval_delegation import ApprovalDelegation


def list_active_for_delegate(db: Session, delegate_user_id: uuid.UUID, today: date) -> list[ApprovalDelegation]:
    stmt = select(ApprovalDelegation).where(
        ApprovalDelegation.delegate_user_id == delegate_user_id,
        ApprovalDelegation.valid_from <= today,
        ApprovalDelegation.valid_to >= today,
    )
    return list(db.scalars(stmt))


def list_for_user(db: Session, user_id: uuid.UUID) -> list[ApprovalDelegation]:
    stmt = (
        select(ApprovalDelegation)
        .where(
            (ApprovalDelegation.delegator_user_id == user_id) | (ApprovalDelegation.delegate_user_id == user_id)
        )
        .order_by(ApprovalDelegation.valid_from.desc())
    )
    return list(db.scalars(stmt))


def create(db: Session, delegation: ApprovalDelegation) -> ApprovalDelegation:
    db.add(delegation)
    db.commit()
    db.refresh(delegation)
    return delegation
