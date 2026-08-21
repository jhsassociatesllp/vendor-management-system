import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.agreement import AgreementCreate, AgreementRead
from app.schemas.billing_milestone import MilestoneCreate, MilestoneRead
from app.schemas.rate_card import RateCardCreate, RateCardRead
from app.services import agreement_service, audit_service, rate_card_service

router = APIRouter(prefix="/api/v1/agreements", tags=["agreements"])


@router.post("", response_model=AgreementRead, status_code=status.HTTP_201_CREATED)
def create_agreement(
    payload: AgreementCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        agreement = agreement_service.create_agreement(db, payload, current_user)
    except agreement_service.VendorNotActiveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except agreement_service.ItemCodeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except agreement_service.TdsOverrideReasonRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="Agreement",
        record_reference=agreement.agreement_number,
        user=current_user,
        request=request,
    )
    return agreement_service.to_agreement_read(agreement)


@router.get("", response_model=list[AgreementRead])
def list_agreements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return [agreement_service.to_agreement_read(a) for a in agreement_service.list_agreements(db)]


@router.get("/expiring", response_model=list[AgreementRead])
def list_expiring_agreements(
    days: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "Partner / VP", "System Admin")),
):
    return [agreement_service.to_agreement_read(a) for a in agreement_service.list_expiring(db, days)]


@router.get("/{agreement_id}", response_model=AgreementRead)
def get_agreement(
    agreement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    agreement = agreement_service.get_agreement(db, agreement_id)
    if agreement is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agreement not found")
    return agreement_service.to_agreement_read(agreement)


@router.post("/{agreement_id}/terminate", response_model=AgreementRead)
def terminate_agreement(
    agreement_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    before = audit_service.model_to_dict(agreement_service.get_agreement(db, agreement_id))
    try:
        agreement = agreement_service.terminate_agreement(db, agreement_id)
    except agreement_service.AgreementNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Agreement",
        record_reference=agreement.agreement_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(agreement)),
        request=request,
    )
    return agreement_service.to_agreement_read(agreement)


@router.post("/{agreement_id}/rate-cards", response_model=RateCardRead, status_code=status.HTTP_201_CREATED)
def create_rate_card(
    agreement_id: uuid.UUID,
    payload: RateCardCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        result = rate_card_service.create_rate_card(db, agreement_id, payload)
    except rate_card_service.AgreementNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except rate_card_service.AgreementTerminatedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except rate_card_service.ItemNotCoveredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except rate_card_service.DatesOutOfRangeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    agreement = agreement_service.get_agreement(db, agreement_id)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="RateCard",
        record_reference=f"{agreement.agreement_number} rate card" if agreement else str(agreement_id),
        user=current_user,
        request=request,
    )
    return result


@router.get("/{agreement_id}/rate-cards", response_model=list[RateCardRead])
def list_rate_cards(
    agreement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return rate_card_service.list_rate_cards(db, agreement_id)


@router.post("/{agreement_id}/milestones", response_model=MilestoneRead, status_code=status.HTTP_201_CREATED)
def create_milestone(
    agreement_id: uuid.UUID,
    payload: MilestoneCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        result = rate_card_service.create_milestone(db, agreement_id, payload)
    except rate_card_service.AgreementNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except rate_card_service.AgreementTerminatedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except rate_card_service.MilestoneTotalExceededError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    agreement = agreement_service.get_agreement(db, agreement_id)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="BillingMilestone",
        record_reference=f"{agreement.agreement_number} / {result.description}" if agreement else result.description,
        user=current_user,
        request=request,
    )
    return result
