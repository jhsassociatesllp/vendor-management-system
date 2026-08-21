from sqlalchemy.orm import Session

from app.models.setting import Setting


def get_by_key(db: Session, key: str) -> Setting | None:
    return db.get(Setting, key)


def upsert(db: Session, key: str, value: str) -> Setting:
    row = db.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()
    db.refresh(row)
    return row
