import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice
from app.models.vendor import Vendor


def get_by_id(db: Session, invoice_id: uuid.UUID) -> Invoice | None:
    return db.get(Invoice, invoice_id)


def list_all(db: Session) -> list[Invoice]:
    return list(db.scalars(select(Invoice).order_by(Invoice.created_at.desc())))


def list_for_vendor(db: Session, vendor_id: uuid.UUID) -> list[Invoice]:
    stmt = select(Invoice).where(Invoice.vendor_id == vendor_id).order_by(Invoice.created_at.desc())
    return list(db.scalars(stmt))


def find_by_vendor_and_number(
    db: Session, vendor_id: uuid.UUID, invoice_number: str, exclude_id: uuid.UUID | None = None
) -> Invoice | None:
    stmt = select(Invoice).where(Invoice.vendor_id == vendor_id, Invoice.invoice_number == invoice_number)
    if exclude_id is not None:
        stmt = stmt.where(Invoice.id != exclude_id)
    return db.scalars(stmt).first()


def submitted_amount_total_for_po(db: Session, po_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(Invoice.total_invoice_amount), 0)).where(
            Invoice.po_id == po_id, Invoice.status == InvoiceStatus.SUBMITTED
        )
    )
    return Decimal(total)


def submitted_quantity_total_for_po(db: Session, po_id: uuid.UUID) -> Decimal:
    total = db.scalar(
        select(func.coalesce(func.sum(Invoice.quantity), 0)).where(
            Invoice.po_id == po_id, Invoice.status == InvoiceStatus.SUBMITTED
        )
    )
    return Decimal(total)


def list_approved_for_payment(db: Session) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .where(Invoice.status == InvoiceStatus.APPROVED_FOR_PAYMENT)
        .order_by(Invoice.payment_due_date.asc().nulls_last())
    )
    return list(db.scalars(stmt))


def list_msme_unpaid(db: Session) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .join(Vendor, Invoice.vendor_id == Vendor.id)
        .where(Invoice.status == InvoiceStatus.APPROVED_FOR_PAYMENT, Vendor.msme_status.is_(True))
    )
    return list(db.scalars(stmt))


def create(db: Session, invoice: Invoice) -> Invoice:
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


def save(db: Session, invoice: Invoice) -> Invoice:
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice
