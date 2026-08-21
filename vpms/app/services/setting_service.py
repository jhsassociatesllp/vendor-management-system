from decimal import Decimal

from sqlalchemy.orm import Session

from app.repositories import setting_repository

# Section 2: "bank rate" has no real external feed — a single Admin-editable value.
BASE_BANK_RATE_KEY = "base_bank_rate"
DEFAULT_BASE_BANK_RATE = Decimal("6.50")


def get_base_bank_rate(db: Session) -> Decimal:
    row = setting_repository.get_by_key(db, BASE_BANK_RATE_KEY)
    if row is None:
        return DEFAULT_BASE_BANK_RATE
    return Decimal(row.value)


def update_base_bank_rate(db: Session, value: Decimal) -> Decimal:
    row = setting_repository.upsert(db, BASE_BANK_RATE_KEY, str(value))
    return Decimal(row.value)
