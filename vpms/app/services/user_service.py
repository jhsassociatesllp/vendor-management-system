import uuid

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.role import Role
from app.models.user import User
from app.repositories import role_repository, user_repository

# "Vendor" users are provisioned only via vendor_portal_service.activate_portal (tied to
# a vendor record) — never directly through this admin-facing user management flow.
NON_ASSIGNABLE_ROLES = {"Vendor"}


class EmailAlreadyInUseError(Exception):
    pass


class RoleNotFoundError(Exception):
    pass


class UserNotFoundError(Exception):
    pass


class CannotDeactivateSelfError(Exception):
    pass


def list_assignable_roles(db: Session) -> list[Role]:
    return [r for r in role_repository.list_all(db) if r.name not in NON_ASSIGNABLE_ROLES]


def _resolve_assignable_role(db: Session, role_name: str) -> Role:
    if role_name in NON_ASSIGNABLE_ROLES:
        raise RoleNotFoundError(f"Role '{role_name}' is not assignable here")
    role = role_repository.get_by_name(db, role_name)
    if role is None:
        raise RoleNotFoundError(f"Role '{role_name}' does not exist")
    return role


def create_user(db: Session, *, name: str, email: str, password: str, role_name: str) -> User:
    role = _resolve_assignable_role(db, role_name)
    if user_repository.get_by_email(db, email) is not None:
        raise EmailAlreadyInUseError("A user with this email already exists")

    user = User(name=name, email=email, hashed_password=hash_password(password), role_id=role.id, is_active=True)
    return user_repository.create(db, user)


def update_user(
    db: Session,
    *,
    user_id: uuid.UUID,
    current_user: User,
    role_name: str | None,
    is_active: bool | None,
) -> User:
    user = user_repository.get_by_id(db, user_id)
    if user is None:
        raise UserNotFoundError("User not found")

    if is_active is False and user.id == current_user.id:
        raise CannotDeactivateSelfError("You cannot deactivate your own account")

    if role_name is not None:
        user.role_id = _resolve_assignable_role(db, role_name).id

    if is_active is not None:
        user.is_active = is_active

    return user_repository.save(db, user)


def reset_password(db: Session, *, user_id: uuid.UUID, new_password: str) -> User:
    user = user_repository.get_by_id(db, user_id)
    if user is None:
        raise UserNotFoundError("User not found")

    user.hashed_password = hash_password(new_password)
    # Invalidates any tokens already issued to this user (Section 5.2's session_version
    # check in rbac.get_current_user), same as a fresh login would.
    user.session_version += 1
    return user_repository.save(db, user)
