from sqlalchemy.orm import Session

from app.models.item_code import ItemCode
from app.repositories import item_code_repository
from app.schemas.item_code import ItemCodeCreate


def create_item_code(db: Session, payload: ItemCodeCreate) -> ItemCode:
    item_code = ItemCode(
        category=payload.category,
        sub_category=payload.sub_category,
        description=payload.description,
        unit=payload.unit,
        default_rate=payload.default_rate,
        is_active=True,
    )
    return item_code_repository.create(db, item_code)


def list_item_codes(db: Session) -> list[ItemCode]:
    return item_code_repository.list_all(db)
