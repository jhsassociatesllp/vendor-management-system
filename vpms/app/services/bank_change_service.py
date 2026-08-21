import uuid

from sqlalchemy.orm import Session

from app.models.bank_change_request import BankChangeRequest
from app.models.enums import BankChangeStatus
from app.models.notification import Notification
from app.models.user import User
from app.repositories import bank_change_request_repository, notification_repository, user_repository, vendor_repository
from app.schemas.bank_change_request import BankChangeCreate


class NotOwnVendorError(Exception):
    pass


class BankChangeRequestNotFoundError(Exception):
    pass


class RequestNotPendingError(Exception):
    pass


class SameApproverError(Exception):
    pass


def request_change(db: Session, current_user: User, payload: BankChangeCreate) -> BankChangeRequest:
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id is None:
        raise NotOwnVendorError("Only a vendor-portal user can request a bank detail change")

    bank_change_request = BankChangeRequest(
        vendor_id=current_user.linked_vendor_id,
        new_account_no=payload.new_account_no,
        new_ifsc_code=payload.new_ifsc_code,
        status=BankChangeStatus.PENDING_FIRST_APPROVAL,
        requested_by=current_user.id,
    )
    return bank_change_request_repository.create(db, bank_change_request)


def list_all(db: Session) -> list[BankChangeRequest]:
    return bank_change_request_repository.list_all(db)


def list_own(db: Session, current_user: User) -> list[BankChangeRequest]:
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id is None:
        raise NotOwnVendorError("Only a vendor-portal user has bank change requests to list")
    return bank_change_request_repository.list_for_vendor(db, current_user.linked_vendor_id)


def approve_step(db: Session, request_id: uuid.UUID, approver: User) -> BankChangeRequest:
    bank_change_request = bank_change_request_repository.get_by_id(db, request_id)
    if bank_change_request is None:
        raise BankChangeRequestNotFoundError("Bank change request not found")

    if bank_change_request.status == BankChangeStatus.PENDING_FIRST_APPROVAL:
        bank_change_request.first_approved_by = approver.id
        bank_change_request.status = BankChangeStatus.PENDING_SECOND_APPROVAL
        return bank_change_request_repository.save(db, bank_change_request)

    if bank_change_request.status == BankChangeStatus.PENDING_SECOND_APPROVAL:
        if approver.id == bank_change_request.first_approved_by:
            raise SameApproverError("A different approver must complete the second approval step")

        vendor = vendor_repository.get_by_id(db, bank_change_request.vendor_id)
        old_account_no, old_ifsc_code = vendor.bank_account_no, vendor.ifsc_code

        vendor.bank_account_no = bank_change_request.new_account_no
        vendor.ifsc_code = bank_change_request.new_ifsc_code
        vendor_repository.save(db, vendor)

        bank_change_request.second_approved_by = approver.id
        bank_change_request.status = BankChangeStatus.APPROVED

        vendor_user = user_repository.get_by_linked_vendor_id(db, vendor.id)
        if vendor_user is not None:
            notification_repository.create(
                db,
                Notification(
                    user_id=vendor_user.id,
                    message=f"Bank details change approved. Previous: {old_account_no} / {old_ifsc_code}",
                ),
            )
            notification_repository.create(
                db,
                Notification(
                    user_id=vendor_user.id,
                    message=f"Bank details change approved. New: {vendor.bank_account_no} / {vendor.ifsc_code}",
                ),
            )

        return bank_change_request_repository.save(db, bank_change_request)

    raise RequestNotPendingError(f"Bank change request is not pending (current status: {bank_change_request.status.value})")


def reject_step(db: Session, request_id: uuid.UUID, rejection_reason: str) -> BankChangeRequest:
    bank_change_request = bank_change_request_repository.get_by_id(db, request_id)
    if bank_change_request is None:
        raise BankChangeRequestNotFoundError("Bank change request not found")

    if bank_change_request.status not in (
        BankChangeStatus.PENDING_FIRST_APPROVAL,
        BankChangeStatus.PENDING_SECOND_APPROVAL,
    ):
        raise RequestNotPendingError(f"Bank change request is not pending (current status: {bank_change_request.status.value})")

    bank_change_request.status = BankChangeStatus.REJECTED
    bank_change_request.rejection_reason = rejection_reason
    return bank_change_request_repository.save(db, bank_change_request)
