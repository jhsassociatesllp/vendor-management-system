import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.grn_scn import GrnScn


def list_for_po(db: Session, po_id: uuid.UUID) -> list[GrnScn]:
    return list(db.scalars(select(GrnScn).where(GrnScn.po_id == po_id).order_by(GrnScn.created_at.asc())))


def confirmed_total_for_po(db: Session, po_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(GrnScn.quantity_confirmed), 0)).where(GrnScn.po_id == po_id)
    )
    return Decimal(total)


def create(db: Session, entry: GrnScn) -> GrnScn:
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
