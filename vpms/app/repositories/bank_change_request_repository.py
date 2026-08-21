import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.bank_change_request import BankChangeRequest


def get_by_id(db: Session, request_id: uuid.UUID) -> BankChangeRequest | None:
    return db.get(BankChangeRequest, request_id)


def list_all(db: Session) -> list[BankChangeRequest]:
    stmt = select(BankChangeRequest).order_by(BankChangeRequest.created_at.desc())
    return list(db.scalars(stmt))


def list_for_vendor(db: Session, vendor_id: uuid.UUID) -> list[BankChangeRequest]:
    stmt = (
        select(BankChangeRequest)
        .where(BankChangeRequest.vendor_id == vendor_id)
        .order_by(BankChangeRequest.created_at.desc())
    )
    return list(db.scalars(stmt))


def create(db: Session, bank_change_request: BankChangeRequest) -> BankChangeRequest:
    db.add(bank_change_request)
    db.commit()
    db.refresh(bank_change_request)
    return bank_change_request


def save(db: Session, bank_change_request: BankChangeRequest) -> BankChangeRequest:
    db.add(bank_change_request)
    db.commit()
    db.refresh(bank_change_request)
    return bank_change_request
