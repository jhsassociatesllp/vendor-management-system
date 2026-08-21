import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import VendorRequestStatus
from app.models.vendor import Vendor
from app.repositories import item_code_repository, vendor_repository, vendor_request_repository
from app.schemas.vendor import VendorCreate
from app.services.stubs import lookup_bank_details, send_activation_notification, suggest_tds_section


class RequestNotApprovedError(Exception):
    pass


class VendorAlreadyExistsError(Exception):
    pass


class ItemCodeNotFoundError(Exception):
    pass


class VendorNotFoundError(Exception):
    pass


class DuplicateVendorItemLinkError(Exception):
    pass


def list_vendors(db: Session) -> list[Vendor]:
    return vendor_repository.list_all(db)


def get_vendor(db: Session, vendor_id: uuid.UUID) -> Vendor | None:
    return vendor_repository.get_by_id(db, vendor_id)


def create_vendor_from_request(db: Session, request_id: uuid.UUID, payload: VendorCreate) -> Vendor:
    vendor_request = vendor_request_repository.get_by_id(db, request_id)
    if vendor_request is None:
        raise RequestNotApprovedError("Vendor request not found")

    if vendor_request.status != VendorRequestStatus.APPROVED:
        raise RequestNotApprovedError(
            f"Vendor request must be Approved before a vendor can be created (current status: {vendor_request.status.value})"
        )

    if vendor_repository.get_by_source_request_id(db, request_id) is not None:
        raise VendorAlreadyExistsError("A vendor has already been created from this request")

    bank_name, bank_branch = lookup_bank_details(payload.ifsc_code)

    if payload.tds_section_override:
        tds_section = payload.tds_section_override
        tds_section_overridden = True
    else:
        tds_section = suggest_tds_section(payload.vendor_category)
        tds_section_overridden = False

    vendor = Vendor(
        vendor_code=vendor_repository.next_vendor_code(db, datetime.now(timezone.utc).year),
        source_request_id=vendor_request.id,
        vendor_name=vendor_request.recommended_vendor_name,
        pan=vendor_request.recommended_pan,
        gstin=vendor_request.recommended_gstin,
        msme_status=payload.msme_status,
        udyam_number=payload.udyam_number,
        vendor_category=payload.vendor_category,
        tds_section=tds_section,
        tds_section_overridden=tds_section_overridden,
        tds_section_override_reason=payload.tds_section_override_reason,
        bank_account_no=payload.bank_account_no,
        ifsc_code=payload.ifsc_code,
        bank_name=bank_name,
        bank_branch=bank_branch,
        cancelled_cheque_doc_url=payload.cancelled_cheque_doc_url,
        address=payload.address,
        email=payload.email,
        mobile_number=payload.mobile_number,
        is_active=True,
    )
    vendor = vendor_repository.create(db, vendor)

    send_activation_notification(vendor.email, vendor.mobile_number, vendor.vendor_code)

    return vendor


def list_active_item_codes(db: Session, vendor_id: uuid.UUID):
    if vendor_repository.get_by_id(db, vendor_id) is None:
        raise VendorNotFoundError(f"Vendor {vendor_id} not found")
    return vendor_repository.list_active_item_codes_for_vendor(db, vendor_id)


def link_item_codes(db: Session, vendor_id: uuid.UUID, item_code_ids: list[uuid.UUID]) -> list:
    if vendor_repository.get_by_id(db, vendor_id) is None:
        raise VendorNotFoundError(f"Vendor {vendor_id} not found")

    # Validate every id before creating anything, so a bad id in the batch
    # can't leave a partial set of links flushed to the session.
    for item_code_id in item_code_ids:
        if item_code_repository.get_by_id(db, item_code_id) is None:
            raise ItemCodeNotFoundError(f"Item code {item_code_id} not found")
        if vendor_repository.get_link(db, vendor_id, item_code_id) is not None:
            raise DuplicateVendorItemLinkError(
                f"Vendor is already linked to item code {item_code_id}"
            )

    links = [vendor_repository.create_link(db, vendor_id, item_code_id) for item_code_id in item_code_ids]

    db.commit()
    for link in links:
        db.refresh(link)
    return links
