import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import Notification


def get_by_id(db: Session, notification_id: uuid.UUID) -> Notification | None:
    return db.get(Notification, notification_id)


def list_for_user(db: Session, user_id: uuid.UUID) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id).order_by(Notification.created_at.desc())
    return list(db.scalars(stmt))


def create(db: Session, notification: Notification) -> Notification:
    db.add(notification)
    db.flush()
    return notification


def save(db: Session, notification: Notification) -> Notification:
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification
