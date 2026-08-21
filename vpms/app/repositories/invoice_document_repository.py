import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.invoice_document import InvoiceDocument


def get_by_id(db: Session, document_id: uuid.UUID) -> InvoiceDocument | None:
    return db.get(InvoiceDocument, document_id)


def list_for_invoice(db: Session, invoice_id: uuid.UUID) -> list[InvoiceDocument]:
    stmt = select(InvoiceDocument).where(InvoiceDocument.invoice_id == invoice_id)
    return list(db.scalars(stmt))


def create(db: Session, document: InvoiceDocument) -> InvoiceDocument:
    db.add(document)
    db.commit()
    db.refresh(document)
    return document
