import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.audit_log import AuditLogRead, IntegrityCheckResult
from app.services import audit_service

router = APIRouter(prefix="/api/v1/audit-logs", tags=["audit-logs"])

AUDIT_ROLES = ("Compliance / Audit", "System Admin")


@router.get("", response_model=list[AuditLogRead])
def list_audit_logs(
    user_id: uuid.UUID | None = None,
    module: str | None = None,
    action: AuditAction | None = None,
    record_reference: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*AUDIT_ROLES)),
):
    return audit_service.list_logs(
        db,
        user_id=user_id,
        module=module,
        action=action,
        record_reference=record_reference,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/integrity-check", response_model=IntegrityCheckResult)
def integrity_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*AUDIT_ROLES)),
):
    return audit_service.check_integrity(db)


@router.get("/{log_id}", response_model=AuditLogRead)
def get_audit_log(
    log_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*AUDIT_ROLES)),
):
    try:
        return audit_service.get_log(db, log_id)
    except audit_service.AuditLogNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
