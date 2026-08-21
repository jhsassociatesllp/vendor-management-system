import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.agreement import Agreement, agreement_item_codes
from app.models.agreement_code_sequence import AgreementCodeSequence
from app.models.enums import AgreementStatus
from app.models.item_code import ItemCode


def get_by_id(db: Session, agreement_id: uuid.UUID) -> Agreement | None:
    return db.scalars(
        select(Agreement)
        .options(joinedload(Agreement.covered_item_codes))
        .where(Agreement.id == agreement_id)
    ).unique().first()


def list_all(db: Session) -> list[Agreement]:
    return list(
        db.scalars(
            select(Agreement).options(joinedload(Agreement.covered_item_codes)).order_by(Agreement.created_at.desc())
        ).unique()
    )


def list_expiring_within(db: Session, days: int) -> list[Agreement]:
    today = date.today()
    horizon = today + timedelta(days=days)
    stmt = (
        select(Agreement)
        .options(joinedload(Agreement.covered_item_codes))
        .where(
            Agreement.status != AgreementStatus.TERMINATED,
            Agreement.agreement_end_date >= today,
            Agreement.agreement_end_date <= horizon,
        )
        .order_by(Agreement.agreement_end_date.asc())
    )
    return list(db.scalars(stmt).unique())


def create(db: Session, agreement: Agreement, item_code_ids: list[uuid.UUID]) -> Agreement:
    db.add(agreement)
    db.flush()

    for item_code_id in item_code_ids:
        db.execute(
            agreement_item_codes.insert().values(agreement_id=agreement.id, item_code_id=item_code_id)
        )

    db.commit()
    db.refresh(agreement)
    return get_by_id(db, agreement.id)


def save(db: Session, agreement: Agreement) -> Agreement:
    db.add(agreement)
    db.commit()
    db.refresh(agreement)
    return agreement


def next_agreement_number(db: Session, year: int) -> str:
    sequence_row = db.get(AgreementCodeSequence, year, with_for_update=True)
    if sequence_row is None:
        sequence_row = AgreementCodeSequence(year=year, last_sequence=0)
        db.add(sequence_row)
        db.flush()

    sequence_row.last_sequence += 1
    db.flush()
    return f"AGR-{year}-{sequence_row.last_sequence:04d}"


def item_codes_exist(db: Session, item_code_ids: list[uuid.UUID]) -> bool:
    found = db.scalars(select(ItemCode.id).where(ItemCode.id.in_(item_code_ids))).all()
    return len(set(found)) == len(set(item_code_ids))
