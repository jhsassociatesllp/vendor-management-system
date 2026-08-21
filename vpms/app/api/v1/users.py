from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.user import User
from app.repositories import user_repository
from app.schemas.user import UserRead

router = APIRouter(prefix="/api/v1/users", tags=["users"])


@router.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(get_current_user)):
    return UserRead(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role.name,
        is_active=current_user.is_active,
    )


@router.get("", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 4 UI — name lookups (approvers, makers/checkers, delegate
    selection) and delegation-setup.html's delegate dropdown need every active staff
    user, mirroring GET /vendors' existing any-authenticated-user visibility."""
    return [
        UserRead(id=u.id, name=u.name, email=u.email, role=u.role.name, is_active=u.is_active)
        for u in user_repository.list_all(db)
    ]


@router.get("/test-restricted")
def test_restricted(
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    return {"message": f"Access granted for {current_user.email}"}
