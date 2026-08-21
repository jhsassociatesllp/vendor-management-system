import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.item_code import ItemCode


def get_by_id(db: Session, item_code_id: uuid.UUID) -> ItemCode | None:
    return db.get(ItemCode, item_code_id)


def list_all(db: Session) -> list[ItemCode]:
    return list(db.scalars(select(ItemCode).order_by(ItemCode.category, ItemCode.sub_category)))


def create(db: Session, item_code: ItemCode) -> ItemCode:
    db.add(item_code)
    db.commit()
    db.refresh(item_code)
    return item_code
