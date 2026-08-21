import uuid
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.doa_matrix import DoaMatrix


def get_by_id(db: Session, matrix_id: uuid.UUID) -> DoaMatrix | None:
    return db.get(DoaMatrix, matrix_id)


def list_all(db: Session) -> list[DoaMatrix]:
    return list(db.scalars(select(DoaMatrix).order_by(DoaMatrix.min_amount.asc())))


def find_matching_slab(db: Session, amount: Decimal) -> DoaMatrix | None:
    stmt = select(DoaMatrix).where(
        DoaMatrix.min_amount <= amount,
        or_(DoaMatrix.max_amount.is_(None), DoaMatrix.max_amount >= amount),
    )
    return db.scalars(stmt).first()


def create(db: Session, matrix: DoaMatrix) -> DoaMatrix:
    db.add(matrix)
    db.commit()
    db.refresh(matrix)
    return matrix


def save(db: Session, matrix: DoaMatrix) -> DoaMatrix:
    db.add(matrix)
    db.commit()
    db.refresh(matrix)
    return matrix
