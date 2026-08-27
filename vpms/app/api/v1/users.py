import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user import PasswordReset, UserCreate, UserRead, UserUpdate
from app.services import audit_service, user_service

router = APIRouter(prefix="/api/v1/users", tags=["users"])


def _to_user_read(user: User) -> UserRead:
    return UserRead(id=user.id, name=user.name, email=user.email, role=user.role.name, is_active=user.is_active)


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    return _to_user_read(current_user)


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 4 UI — name lookups (approvers, makers/checkers, delegate
    selection) and delegation-setup.html's delegate dropdown need every active staff
    user, mirroring GET /vendors' existing any-authenticated-user visibility."""
    return [_to_user_read(u) for u in user_repository.list_all(db)]


@router.get("/all", response_model=list[UserRead])
def list_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    """Includes inactive users, unlike GET '' above — powers the User Management screen."""
    return [_to_user_read(u) for u in user_repository.list_all_including_inactive(db)]


@router.get("/roles", response_model=list[str])
def list_assignable_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    return [r.name for r in user_service.list_assignable_roles(db)]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    try:
        user = user_service.create_user(
            db, name=payload.name, email=payload.email, password=payload.password, role_name=payload.role
        )
    except user_service.EmailAlreadyInUseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except user_service.RoleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.CREATE, module="User", record_reference=user.email, user=current_user, request=request
    )
    return _to_user_read(user)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    try:
        user = user_service.update_user(
            db, user_id=user_id, current_user=current_user, role_name=payload.role, is_active=payload.is_active
        )
    except user_service.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except user_service.RoleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except user_service.CannotDeactivateSelfError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.UPDATE, module="User", record_reference=user.email, user=current_user, request=request
    )
    return _to_user_read(user)


@router.post("/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: uuid.UUID,
    payload: PasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    try:
        user = user_service.reset_password(db, user_id=user_id, new_password=payload.new_password)
    except user_service.UserNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="User",
        record_reference=user.email,
        user=current_user,
        request=request,
        field_changes=[{"field": "password", "old_value": None, "new_value": "reset by admin"}],
    )


@router.get("/test-restricted")
def test_restricted(
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    return {"message": f"Access granted for {current_user.email}"}
