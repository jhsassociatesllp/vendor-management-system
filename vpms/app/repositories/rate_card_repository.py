import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.rate_card import RateCard


def get_by_id(db: Session, rate_card_id: uuid.UUID) -> RateCard | None:
    return db.get(RateCard, rate_card_id)


def list_for_agreement(db: Session, agreement_id: uuid.UUID) -> list[RateCard]:
    stmt = select(RateCard).where(RateCard.agreement_id == agreement_id).order_by(RateCard.created_at.desc())
    return list(db.scalars(stmt))


def get_active_for_agreement_item(db: Session, agreement_id: uuid.UUID, item_code_id: uuid.UUID) -> RateCard | None:
    stmt = (
        select(RateCard)
        .where(
            RateCard.agreement_id == agreement_id,
            RateCard.item_code_id == item_code_id,
            RateCard.is_active.is_(True),
        )
        .order_by(RateCard.created_at.desc())
    )
    return db.scalars(stmt).first()


def create(db: Session, rate_card: RateCard) -> RateCard:
    db.add(rate_card)
    db.commit()
    db.refresh(rate_card)
    return rate_card


def save(db: Session, rate_card: RateCard) -> RateCard:
    db.add(rate_card)
    db.commit()
    db.refresh(rate_card)
    return rate_card
