import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.repositories import notification_repository


class NotificationNotFoundError(Exception):
    pass


class NotOwnNotificationError(Exception):
    pass


def list_for_user(db: Session, user: User) -> list[Notification]:
    return notification_repository.list_for_user(db, user.id)


def mark_read(db: Session, notification_id: uuid.UUID, user: User) -> Notification:
    notification = notification_repository.get_by_id(db, notification_id)
    if notification is None:
        raise NotificationNotFoundError("Notification not found")

    if notification.user_id != user.id:
        raise NotOwnNotificationError("Not authorized to modify this notification")

    notification.read_at = datetime.now(timezone.utc)
    return notification_repository.save(db, notification)
