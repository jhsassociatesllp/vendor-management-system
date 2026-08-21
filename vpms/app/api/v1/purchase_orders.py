import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import po_amendment_repository, purchase_order_repository
from app.schemas.grn_scn import GrnScnCreate, GrnScnRead
from app.schemas.invoice import PurchaseOrderBalanceRead
from app.schemas.po_amendment import POAmendmentCreate, POAmendmentRead
from app.schemas.purchase_order import PORejectRequest, PurchaseOrderCreate, PurchaseOrderRead
from app.services import audit_service, budget_service, purchase_order_service

router = APIRouter(prefix="/api/v1/purchase-orders", tags=["purchase-orders"])


@router.post("", response_model=PurchaseOrderRead, status_code=status.HTTP_201_CREATED)
def create_purchase_order(
    payload: PurchaseOrderCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Dept. Manager", "Accounts Executive", "System Admin")),
):
    try:
        result = purchase_order_service.create_po(db, payload, current_user)
    except purchase_order_service.VendorItemComboNotActiveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except purchase_order_service.AgreementNotActiveError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except budget_service.BudgetHeadNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.RateNotAvailableError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except purchase_order_service.RateOverrideReasonRequiredError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except purchase_order_service.BudgetInsufficientError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.CREATE, module="PurchaseOrder", record_reference=result.po_number, user=current_user, request=request
    )
    return result


@router.get("", response_model=list[PurchaseOrderRead])
def list_purchase_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return purchase_order_service.list_pos(db)


@router.get("/{po_id}", response_model=PurchaseOrderRead)
def get_purchase_order(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    po = purchase_order_service.get_po(db, po_id)
    if po is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return po


@router.post("/{po_id}/approve", response_model=PurchaseOrderRead)
def approve_purchase_order(
    po_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Budget Controller", "Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(purchase_order_repository.get_by_id(db, po_id))
    try:
        result = purchase_order_service.approve_po(db, po_id)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.POStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.APPROVE,
        module="PurchaseOrder",
        record_reference=result.po_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{po_id}/reject", response_model=PurchaseOrderRead)
def reject_purchase_order(
    po_id: uuid.UUID,
    payload: PORejectRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Budget Controller", "Partner / VP", "System Admin")),
):
    before = audit_service.model_to_dict(purchase_order_repository.get_by_id(db, po_id))
    try:
        result = purchase_order_service.reject_po(db, po_id, payload.rejection_reason)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.POStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.REJECT,
        module="PurchaseOrder",
        record_reference=result.po_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{po_id}/cancel", response_model=PurchaseOrderRead)
def cancel_purchase_order(
    po_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    before = audit_service.model_to_dict(purchase_order_repository.get_by_id(db, po_id))
    try:
        result = purchase_order_service.cancel_po(db, po_id)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.POStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="PurchaseOrder",
        record_reference=result.po_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{po_id}/amend", response_model=POAmendmentRead, status_code=status.HTTP_201_CREATED)
def amend_purchase_order(
    po_id: uuid.UUID,
    payload: POAmendmentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Dept. Manager", "Accounts Executive", "System Admin")),
):
    try:
        result = purchase_order_service.propose_amendment(db, po_id, payload, current_user)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))

    po = purchase_order_repository.get_by_id(db, po_id)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="POAmendment",
        record_reference=po.po_number if po else str(po_id),
        user=current_user,
        request=request,
    )
    return result


@router.post("/{po_id}/vendor-acknowledge", response_model=PurchaseOrderRead)
def vendor_acknowledge_purchase_order(
    po_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Vendor")),
):
    before = audit_service.model_to_dict(purchase_order_repository.get_by_id(db, po_id))
    try:
        result = purchase_order_service.vendor_acknowledge(db, po_id, current_user)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.NotOwnVendorError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except purchase_order_service.POStatusError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="PurchaseOrder",
        record_reference=result.po_number,
        user=current_user,
        field_changes=audit_service.diff_fields(before, audit_service.model_to_dict(result)),
        request=request,
    )
    return result


@router.post("/{po_id}/grn", response_model=GrnScnRead, status_code=status.HTTP_201_CREATED)
def record_grn(
    po_id: uuid.UUID,
    payload: GrnScnCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Dept. Manager", "Accounts Executive", "System Admin")),
):
    try:
        result = purchase_order_service.record_grn(db, po_id, payload, current_user)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except purchase_order_service.GrnQuantityExceededError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    po = purchase_order_repository.get_by_id(db, po_id)
    audit_service.log_audit(
        db,
        action=AuditAction.CREATE,
        module="GrnScn",
        record_reference=po.po_number if po else str(po_id),
        user=current_user,
        request=request,
    )
    return result


@router.get("/{po_id}/grn", response_model=list[GrnScnRead])
def list_grn(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return purchase_order_service.list_grn(db, po_id)


@router.get("/{po_id}/amendments", response_model=list[POAmendmentRead])
def list_po_amendments(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return purchase_order_service.list_amendments(db, po_id)


@router.get("/{po_id}/balance", response_model=PurchaseOrderBalanceRead)
def get_po_balance(
    po_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return purchase_order_service.get_po_balance(db, po_id)
    except purchase_order_service.PONotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
