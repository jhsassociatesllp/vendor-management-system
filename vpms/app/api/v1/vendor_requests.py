import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import vendor_request_repository
from app.schemas.vendor_request import (
    AccountsReviewAction,
    PartnerDecisionAction,
    VendorRequestCreate,
    VendorRequestRead,
)
from app.services import audit_service, vendor_request_service

router = APIRouter(prefix="/api/v1/vendor-requests", tags=["vendor-requests"])


@router.post("", response_model=VendorRequestRead, status_code=status.HTTP_201_CREATED)
def create_vendor_request(
    payload: VendorRequestCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Dept. Manager", "Partner / VP", "System Admin")),
):
    try:
        result = vendor_request_service.create_request(db, payload, current_user)
    except vendor_request_service.DuplicateVendorError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="VendorRequest",
        record_reference=result.recommended_vendor_name,
        user=current_user,
        request=request,
    )
    return result


@router.get("", response_model=list[VendorRequestRead])
def list_vendor_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return vendor_request_service.list_visible_requests(db, current_user)


@router.get("/{request_id}", response_model=VendorRequestRead)
def get_vendor_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        vendor_request = vendor_request_service.get_visible_request(db, request_id, current_user)
    except vendor_request_service.NotVisibleError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    if vendor_request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor request not found")
    return vendor_request


@router.post("/{request_id}/accounts-review", response_model=VendorRequestRead)
def accounts_review(
    request_id: uuid.UUID,
    payload: AccountsReviewAction,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    before = audit_service.model_to_dict(vendor_request_repository.get_by_id(db, request_id))
    try:
        result = vendor_request_service.accounts_review(db, request_id, payload, current_user)
    except vendor_request_service.InvalidTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT if payload.action == "reject" else AuditAction.UPDATE,
        module="VendorRequest",
        record_reference=result.recommended_vendor_name,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{request_id}/partner-decision", response_model=VendorRequestRead)
def partner_decision(
    request_id: uuid.UUID,
    payload: PartnerDecisionAction,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(vendor_request_repository.get_by_id(db, request_id))
    try:
        result = vendor_request_service.partner_decision(db, request_id, payload, current_user)
    except vendor_request_service.InvalidTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT if payload.action == "reject" else AuditAction.APPROVE,
        module="VendorRequest",
        record_reference=result.recommended_vendor_name,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
