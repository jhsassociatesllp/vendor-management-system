from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.setting import BaseBankRateRead, BaseBankRateUpdate
from app.services import audit_service, setting_service

router = APIRouter(prefix="/api/v1/settings", tags=["settings"])


@router.get("/base-bank-rate", response_model=BaseBankRateRead)
def get_base_bank_rate(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return BaseBankRateRead(base_bank_rate=setting_service.get_base_bank_rate(db))


@router.post("/base-bank-rate", response_model=BaseBankRateRead)
def update_base_bank_rate(
    payload: BaseBankRateUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("System Admin")),
):
    before_value = str(setting_service.get_base_bank_rate(db))
    new_rate = setting_service.update_base_bank_rate(db, payload.base_bank_rate)
    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Setting",
        record_reference="base_bank_rate",
        user=current_user,
        field_changes=[{"field": "base_bank_rate", "old_value": before_value, "new_value": str(new_rate)}],
        request=request,
    )
    return BaseBankRateRead(base_bank_rate=new_rate)
