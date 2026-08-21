import uuid

from sqlalchemy.orm import Session

from app.models.rate_card_amendment import RateCardAmendment


def get_by_id(db: Session, amendment_id: uuid.UUID) -> RateCardAmendment | None:
    return db.get(RateCardAmendment, amendment_id)


def create(db: Session, amendment: RateCardAmendment) -> RateCardAmendment:
    db.add(amendment)
    db.commit()
    db.refresh(amendment)
    return amendment


def save(db: Session, amendment: RateCardAmendment) -> RateCardAmendment:
    db.add(amendment)
    db.commit()
    db.refresh(amendment)
    return amendment
