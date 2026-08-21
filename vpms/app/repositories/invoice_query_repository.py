import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invoice_query import InvoiceQuery


def get_by_id(db: Session, query_id: uuid.UUID) -> InvoiceQuery | None:
    return db.get(InvoiceQuery, query_id)


def list_for_invoice(db: Session, invoice_id: uuid.UUID) -> list[InvoiceQuery]:
    stmt = select(InvoiceQuery).where(InvoiceQuery.invoice_id == invoice_id).order_by(InvoiceQuery.created_at.desc())
    return list(db.scalars(stmt))


def list_all(db: Session) -> list[InvoiceQuery]:
    return list(db.scalars(select(InvoiceQuery)))


def create(db: Session, query: InvoiceQuery) -> InvoiceQuery:
    db.add(query)
    db.flush()
    return query


def save(db: Session, query: InvoiceQuery) -> InvoiceQuery:
    db.add(query)
    db.flush()
    return query
