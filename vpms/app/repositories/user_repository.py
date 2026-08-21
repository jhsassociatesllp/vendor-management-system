import uuid

from sqlalchemy.orm import Session, joinedload

from app.models.role import Role
from app.models.user import User


def get_by_email(db: Session, email: str) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.email == email)
        .first()
    )


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.id == user_id)
        .first()
    )


def get_by_linked_vendor_id(db: Session, vendor_id: uuid.UUID) -> User | None:
    return (
        db.query(User)
        .options(joinedload(User.role))
        .filter(User.linked_vendor_id == vendor_id)
        .first()
    )


def list_all(db: Session) -> list[User]:
    return db.query(User).options(joinedload(User.role)).filter(User.is_active.is_(True)).all()


def list_by_role_name(db: Session, role_name: str) -> list[User]:
    return (
        db.query(User)
        .join(Role, User.role_id == Role.id)
        .filter(Role.name == role_name, User.is_active.is_(True))
        .all()
    )


def create(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def save(db: Session, user: User) -> User:
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
