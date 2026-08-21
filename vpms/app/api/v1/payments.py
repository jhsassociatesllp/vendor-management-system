import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import payment_repository
from app.schemas.invoice import InvoiceRead
from app.schemas.payment import MsmeAlertRead, PaymentCreate, PaymentRead, PaymentRejectRequest, TdsDefaultRead
from app.services import audit_service, payment_service

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.get("/queue", response_model=list[InvoiceRead])
def get_queue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    return payment_service.get_queue(db)


@router.get("/pending-confirmation", response_model=list[PaymentRead])
def get_pending_confirmation(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    return payment_service.list_pending_confirmation(db)


@router.get("/msme-alerts", response_model=list[MsmeAlertRead])
def get_msme_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    return payment_service.get_msme_alerts(db)


@router.get("/tds-default/{invoice_id}", response_model=TdsDefaultRead)
def get_tds_default(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    try:
        section, rate = payment_service.get_default_tds_for_invoice(db, invoice_id)
        return TdsDefaultRead(tds_section=section, tds_rate=rate)
    except payment_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def record_payment(
    payload: PaymentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    try:
        result = payment_service.record_payment(db, payload, current_user)
    except payment_service.InvoiceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except payment_service.InvoiceNotApprovedForPaymentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except payment_service.DuplicateConfirmedPaymentError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except payment_service.TdsOverrideReasonRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.CREATE, module="Payment", record_reference=result.utr_reference, user=current_user, request=request
    )
    return result


@router.get("/{payment_id}", response_model=PaymentRead)
def get_payment(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return payment_service.get_payment(db, payment_id, current_user)
    except payment_service.PaymentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except payment_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/{payment_id}/confirm", response_model=PaymentRead)
def confirm_payment(
    payment_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    before = audit_service.model_to_dict(payment_repository.get_by_id(db, payment_id))
    try:
        result = payment_service.confirm_payment(db, payment_id, current_user)
    except payment_service.PaymentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except payment_service.PaymentNotMakerRecordedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except payment_service.MakerCannotBeCheckerError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE,
        module="Payment",
        record_reference=result.utr_reference,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{payment_id}/reject", response_model=PaymentRead)
def reject_payment(
    payment_id: uuid.UUID,
    payload: PaymentRejectRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Finance Team", "System Admin")),
):
    before = audit_service.model_to_dict(payment_repository.get_by_id(db, payment_id))
    try:
        result = payment_service.reject_payment(db, payment_id, payload.reason, current_user)
    except payment_service.PaymentNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except payment_service.PaymentNotMakerRecordedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except payment_service.MakerCannotBeCheckerError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT,
        module="Payment",
        record_reference=result.utr_reference,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result
