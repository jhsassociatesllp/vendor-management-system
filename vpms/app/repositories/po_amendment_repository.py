import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.po_amendment import POAmendment


def get_by_id(db: Session, amendment_id: uuid.UUID) -> POAmendment | None:
    return db.get(POAmendment, amendment_id)


def list_for_po(db: Session, po_id: uuid.UUID) -> list[POAmendment]:
    stmt = select(POAmendment).where(POAmendment.po_id == po_id).order_by(POAmendment.created_at.desc())
    return list(db.scalars(stmt))


def create(db: Session, amendment: POAmendment) -> POAmendment:
    db.add(amendment)
    db.commit()
    db.refresh(amendment)
    return amendment


def save(db: Session, amendment: POAmendment) -> POAmendment:
    """Flushes only — approving/rejecting an amendment updates the PO (and sometimes a
    budget_commitment) in the same transaction, so the service layer owns the commit."""
    db.add(amendment)
    db.flush()
    return amendment
