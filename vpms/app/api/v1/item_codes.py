from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.item_code import ItemCodeCreate, ItemCodeRead
from app.services import audit_service, item_code_service

router = APIRouter(prefix="/api/v1/item-codes", tags=["item-codes"])


@router.post("", response_model=ItemCodeRead, status_code=status.HTTP_201_CREATED)
def create_item_code(
    payload: ItemCodeCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    result = item_code_service.create_item_code(db, payload)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="ItemCode",
        record_reference=f"{result.category} / {result.sub_category}",
        user=current_user,
        request=request,
    )
    return result


@router.get("", response_model=list[ItemCodeRead])
def list_item_codes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return item_code_service.list_item_codes(db)
