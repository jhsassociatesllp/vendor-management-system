from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.models.user import User
from app.repositories import user_repository


class InvalidCredentialsError(Exception):
    pass


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = user_repository.get_by_email(db, email)
    if not user or not user.is_active or not verify_password(password, user.hashed_password):
        raise InvalidCredentialsError("Incorrect email or password")
    return user


def issue_token_for_user(user: User, expire_minutes: int | None = None) -> str:
    # session_version is embedded so a vendor-portal re-login (which increments it)
    # invalidates any previously issued token for the same user.
    return create_access_token(
        {"user_id": str(user.id), "role": user.role.name, "session_version": user.session_version},
        expire_minutes=expire_minutes,
    )
