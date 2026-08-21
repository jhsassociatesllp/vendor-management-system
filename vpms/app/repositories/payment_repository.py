import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PaymentStatus
from app.models.payment import Payment


def get_by_id(db: Session, payment_id: uuid.UUID) -> Payment | None:
    return db.get(Payment, payment_id)


def list_confirmed_for_invoice(db: Session, invoice_id: uuid.UUID) -> list[Payment]:
    stmt = select(Payment).where(Payment.invoice_id == invoice_id, Payment.status == PaymentStatus.CHECKER_CONFIRMED)
    return list(db.scalars(stmt))


def get_confirmed_for_invoice(db: Session, invoice_id: uuid.UUID) -> Payment | None:
    stmt = select(Payment).where(Payment.invoice_id == invoice_id, Payment.status == PaymentStatus.CHECKER_CONFIRMED)
    return db.scalars(stmt).first()


def list_by_status(db: Session, status: PaymentStatus) -> list[Payment]:
    stmt = select(Payment).where(Payment.status == status).order_by(Payment.initiated_at.asc())
    return list(db.scalars(stmt))


def create(db: Session, payment: Payment) -> Payment:
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


def save(db: Session, payment: Payment) -> Payment:
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment
