import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.po_code_sequence import POCodeSequence
from app.models.purchase_order import PurchaseOrder


def get_by_id(db: Session, po_id: uuid.UUID) -> PurchaseOrder | None:
    return db.get(PurchaseOrder, po_id)


def list_all(db: Session) -> list[PurchaseOrder]:
    return list(db.scalars(select(PurchaseOrder).order_by(PurchaseOrder.created_at.desc())))


def create(db: Session, po: PurchaseOrder) -> PurchaseOrder:
    db.add(po)
    db.flush()
    return po


def save(db: Session, po: PurchaseOrder) -> PurchaseOrder:
    db.add(po)
    db.flush()
    return po


def next_po_number(db: Session, year: int) -> str:
    """Atomically increments and returns the next PO number for `year`, mirroring
    vendor_repository.next_vendor_code / agreement_repository.next_agreement_number."""
    sequence_row = db.get(POCodeSequence, year, with_for_update=True)
    if sequence_row is None:
        sequence_row = POCodeSequence(year=year, last_sequence=0)
        db.add(sequence_row)
        db.flush()

    sequence_row.last_sequence += 1
    db.flush()
    return f"PO-{year}-{sequence_row.last_sequence:04d}"
