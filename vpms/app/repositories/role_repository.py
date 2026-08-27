from sqlalchemy.orm import Session

from app.models.role import Role


def list_all(db: Session) -> list[Role]:
    return db.query(Role).order_by(Role.name).all()


def get_by_name(db: Session, name: str) -> Role | None:
    return db.query(Role).filter(Role.name == name).first()
