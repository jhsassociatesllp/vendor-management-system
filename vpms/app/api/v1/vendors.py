import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies.rbac import get_current_user, require_role
from app.models.enums import AuditAction
from app.models.user import User
from app.schemas.item_code import ItemCodeRead
from app.schemas.vendor import VendorCreate, VendorItemCodeLinkCreate, VendorItemCodeLinkRead, VendorRead
from app.services import audit_service, vendor_service

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])


@router.post("/from-request/{request_id}", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
def create_vendor_from_request(
    request_id: uuid.UUID,
    payload: VendorCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        result = vendor_service.create_vendor_from_request(db, request_id, payload)
    except vendor_service.RequestNotApprovedError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except vendor_service.VendorAlreadyExistsError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    audit_service.log_audit(
        db, action=AuditAction.CREATE, module="Vendor", record_reference=result.vendor_code, user=current_user, request=request
    )
    return result


@router.get("", response_model=list[VendorRead])
def list_vendors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return vendor_service.list_vendors(db)


@router.get("/{vendor_id}", response_model=VendorRead)
def get_vendor(
    vendor_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vendor = vendor_service.get_vendor(db, vendor_id)
    if vendor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vendor not found")
    return vendor


@router.get("/{vendor_id}/item-codes", response_model=list[ItemCodeRead])
def list_vendor_item_codes(
    vendor_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Added for Phase 3 UI's po-create.html, which needs to offer only a vendor's
    active vendor-item combinations — no such list endpoint existed before."""
    try:
        return vendor_service.list_active_item_codes(db, vendor_id)
    except vendor_service.VendorNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/{vendor_id}/item-codes", response_model=list[VendorItemCodeLinkRead], status_code=status.HTTP_201_CREATED)
def link_vendor_item_codes(
    vendor_id: uuid.UUID,
    payload: VendorItemCodeLinkCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("Accounts Executive", "System Admin")),
):
    try:
        result = vendor_service.link_item_codes(db, vendor_id, payload.item_code_ids)
    except vendor_service.VendorNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except vendor_service.ItemCodeNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except vendor_service.DuplicateVendorItemLinkError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    vendor = vendor_service.get_vendor(db, vendor_id)
    audit_service.log_audit(
        db,
        action=AuditAction.UPDATE,
        module="Vendor",
        record_reference=vendor.vendor_code if vendor else str(vendor_id),
        user=current_user,
        field_changes=[
            {"field": "item_code_ids", "old_value": None, "new_value": ",".join(str(i) for i in payload.item_code_ids)}
        ],
        request=request,
    )
    return result
