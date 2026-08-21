import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.rate_card_amendment import AmendmentCreate, AmendmentRead
from app.services import audit_service, rate_card_service

router = APIRouter(prefix="/api/v1/rate-cards", tags=["rate-cards"])


@router.post("/{rate_card_id}/amendments", response_model=AmendmentRead, status_code=status.HTTP_201_CREATED)
def propose_amendment(
    rate_card_id: uuid.UUID,
    payload: AmendmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        result = rate_card_service.propose_amendment(db, rate_card_id, payload, current_user)
    except rate_card_service.RateCardNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="RateCardAmendment",
        record_reference=f"RateCard {rate_card_id}",
        user=current_user,
        request=request,
    )
    return result
