import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import VendorRequestStatus
from app.models.user import User
from app.models.vendor_request import VendorRequest
from app.repositories import vendor_repository, vendor_request_repository
from app.schemas.vendor_request import AccountsReviewAction, PartnerDecisionAction, VendorRequestCreate

DEPT_MANAGER_OR_HIGHER = ("Dept. Manager", "Partner / VP", "System Admin")


class DuplicateVendorError(Exception):
    pass


class InvalidTransitionError(Exception):
    pass


class NotVisibleError(Exception):
    pass


def create_request(db: Session, payload: VendorRequestCreate, requester: User) -> VendorRequest:
    existing_vendor = vendor_repository.find_active_by_pan_or_gstin(
        db, payload.recommended_pan, payload.recommended_gstin
    )
    if existing_vendor is not None:
        raise DuplicateVendorError("An active vendor already exists with this PAN/GSTIN")

    existing_request = vendor_request_repository.find_open_by_pan_or_gstin(
        db, payload.recommended_pan, payload.recommended_gstin
    )
    if existing_request is not None:
        raise DuplicateVendorError("A vendor request with this PAN/GSTIN is already in progress")

    vendor_request = VendorRequest(
        requested_by=requester.id,
        business_need=payload.business_need,
        category=payload.category,
        estimated_annual_spend=payload.estimated_annual_spend,
        recommended_vendor_name=payload.recommended_vendor_name,
        recommended_pan=payload.recommended_pan,
        recommended_gstin=payload.recommended_gstin,
        financial_stability_ok=payload.financial_stability_ok,
        technical_capability_ok=payload.technical_capability_ok,
        compliance_status_ok=payload.compliance_status_ok,
        blacklist_check_ok=payload.blacklist_check_ok,
        conflict_of_interest_declared=payload.conflict_of_interest_declared,
        references_provided=payload.references_provided,
        msme_udyam_number=payload.msme_udyam_number,
        status=VendorRequestStatus.SUBMITTED,
    )
    return vendor_request_repository.create(db, vendor_request)


def list_visible_requests(db: Session, user: User) -> list[VendorRequest]:
    if user.role.name == "Dept. Manager":
        return vendor_request_repository.list_for_requester(db, user.id)
    return vendor_request_repository.list_all(db)


def get_visible_request(db: Session, request_id: uuid.UUID, user: User) -> VendorRequest | None:
    vendor_request = vendor_request_repository.get_by_id(db, request_id)
    if vendor_request is None:
        return None
    if user.role.name == "Dept. Manager" and vendor_request.requested_by != user.id:
        raise NotVisibleError("Not authorized to view this request")
    return vendor_request


def accounts_review(db: Session, request_id: uuid.UUID, payload: AccountsReviewAction, reviewer: User) -> VendorRequest:
    vendor_request = vendor_request_repository.get_by_id(db, request_id)
    if vendor_request is None:
        raise InvalidTransitionError("Vendor request not found")

    if vendor_request.status not in (VendorRequestStatus.SUBMITTED, VendorRequestStatus.ACCOUNTS_REVIEW):
        raise InvalidTransitionError(
            f"Cannot accounts-review a request in status {vendor_request.status.value}"
        )

    now = datetime.now(timezone.utc)
    vendor_request.accounts_reviewed_by = reviewer.id
    vendor_request.accounts_reviewed_at = now

    if payload.action == "advance":
        vendor_request.status = VendorRequestStatus.PENDING_PARTNER_APPROVAL
    else:
        vendor_request.status = VendorRequestStatus.ARCHIVED
        vendor_request.rejection_reason = payload.rejection_reason

    return vendor_request_repository.save(db, vendor_request)


def partner_decision(db: Session, request_id: uuid.UUID, payload: PartnerDecisionAction, decider: User) -> VendorRequest:
    vendor_request = vendor_request_repository.get_by_id(db, request_id)
    if vendor_request is None:
        raise InvalidTransitionError("Vendor request not found")

    if vendor_request.status != VendorRequestStatus.PENDING_PARTNER_APPROVAL:
        raise InvalidTransitionError(
            f"Cannot record a partner decision on a request in status {vendor_request.status.value}"
        )

    now = datetime.now(timezone.utc)
    vendor_request.partner_decided_by = decider.id
    vendor_request.partner_decided_at = now

    if payload.action == "approve":
        vendor_request.status = VendorRequestStatus.APPROVED
    else:
        vendor_request.status = VendorRequestStatus.ARCHIVED
        vendor_request.rejection_reason = payload.rejection_reason

    return vendor_request_repository.save(db, vendor_request)
