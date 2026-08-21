import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.enums import InvoiceStatus, PaymentStatus
from app.models.invoice import Invoice
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.tds_override_log import TdsOverrideLog
from app.models.user import User
from app.repositories import (
    agreement_repository,
    invoice_repository,
    notification_repository,
    payment_repository,
    tds_override_log_repository,
    user_repository,
)
from app.schemas.payment import MsmeAlertRead, PaymentCreate
from app.services import setting_service
from app.services.stubs import suggest_tds_rate

TWO_PLACES = Decimal("0.01")
LATE_INTEREST_SPREAD_PCT = Decimal("3")
DAYS_PER_YEAR = Decimal("365")
AT_RISK_WINDOW_DAYS = 7


class InvoiceNotFoundError(Exception):
    pass


class InvoiceNotApprovedForPaymentError(Exception):
    pass


class DuplicateConfirmedPaymentError(Exception):
    pass


class TdsOverrideReasonRequiredError(Exception):
    pass


class PaymentNotFoundError(Exception):
    pass


class PaymentNotMakerRecordedError(Exception):
    pass


class MakerCannotBeCheckerError(Exception):
    pass


class NotOwnVendorError(Exception):
    pass


def _default_tds(agreement) -> tuple[str, Decimal]:
    section = agreement.tds_section
    return section, suggest_tds_rate(section)


def get_default_tds_for_invoice(db: Session, invoice_id: uuid.UUID) -> tuple[str, Decimal]:
    """Added for Phase 4 UI's payment-record-form.html — the maker needs to see the
    default TDS section/rate (and the live tds_amount/net_payable it implies) before
    submitting, not just find out what the default was after the fact."""
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    agreement = agreement_repository.get_by_id(db, invoice.agreement_id)
    return _default_tds(agreement)


def record_payment(db: Session, payload: PaymentCreate, current_user: User) -> Payment:
    invoice = invoice_repository.get_by_id(db, payload.invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if invoice.status != InvoiceStatus.APPROVED_FOR_PAYMENT:
        raise InvoiceNotApprovedForPaymentError(
            f"Invoice must be Approved_For_Payment to record a payment (current status: {invoice.status.value})"
        )
    if payment_repository.list_confirmed_for_invoice(db, invoice.id):
        raise DuplicateConfirmedPaymentError("This invoice already has a confirmed payment")

    agreement = agreement_repository.get_by_id(db, invoice.agreement_id)
    default_section, default_rate = _default_tds(agreement)

    final_section = payload.tds_section or default_section
    final_rate = payload.tds_rate if payload.tds_rate is not None else suggest_tds_rate(final_section)

    overridden = final_section != default_section or final_rate != default_rate
    if overridden and not payload.tds_override_reason:
        raise TdsOverrideReasonRequiredError("A reason is required when overriding the default TDS section/rate")

    gross_amount = Decimal(invoice.total_invoice_amount)
    tds_amount = (gross_amount * final_rate / Decimal(100)).quantize(TWO_PLACES)
    net_payable_amount = gross_amount - tds_amount

    payment = Payment(
        invoice_id=invoice.id,
        gross_amount=gross_amount,
        tds_section=final_section,
        tds_rate=final_rate,
        tds_amount=tds_amount,
        net_payable_amount=net_payable_amount,
        payment_mode=payload.payment_mode,
        company_bank_account=payload.company_bank_account,
        payment_date=payload.payment_date,
        utr_reference=payload.utr_reference,
        itc_eligible=payload.itc_eligible,
        status=PaymentStatus.MAKER_RECORDED,
        initiated_by=current_user.id,
        initiated_at=datetime.now(timezone.utc),
    )

    if invoice.payment_due_date is not None and payload.payment_date > invoice.payment_due_date:
        days_late = (payload.payment_date - invoice.payment_due_date).days
        base_rate = setting_service.get_base_bank_rate(db)
        annual_rate = (base_rate + LATE_INTEREST_SPREAD_PCT) / Decimal(100)
        payment.late_payment_interest_amount = (
            net_payable_amount * annual_rate * Decimal(days_late) / DAYS_PER_YEAR
        ).quantize(TWO_PLACES)
        payment.is_late = True

    payment_repository.create(db, payment)

    if overridden:
        tds_override_log_repository.create(
            db,
            TdsOverrideLog(
                payment_id=payment.id,
                original_section=default_section,
                original_rate=default_rate,
                new_section=final_section,
                new_rate=final_rate,
                reason=payload.tds_override_reason,
                changed_by=current_user.id,
            ),
        )

    return payment


def confirm_payment(db: Session, payment_id: uuid.UUID, current_user: User) -> Payment:
    payment = payment_repository.get_by_id(db, payment_id)
    if payment is None:
        raise PaymentNotFoundError("Payment not found")
    if payment.status != PaymentStatus.MAKER_RECORDED:
        raise PaymentNotMakerRecordedError(
            f"Payment is not awaiting confirmation (current status: {payment.status.value})"
        )
    if current_user.id == payment.initiated_by:
        raise MakerCannotBeCheckerError("The checker must be a different user than the maker")

    payment.status = PaymentStatus.CHECKER_CONFIRMED
    payment.confirmed_by = current_user.id
    payment.confirmed_at = datetime.now(timezone.utc)
    payment_repository.save(db, payment)

    invoice = invoice_repository.get_by_id(db, payment.invoice_id)
    invoice.status = InvoiceStatus.PAID
    invoice_repository.save(db, invoice)

    vendor_user = user_repository.get_by_linked_vendor_id(db, invoice.vendor_id)
    if vendor_user is not None:
        notification_repository.create(
            db,
            Notification(
                user_id=vendor_user.id,
                message=(
                    f"Payment advice: invoice {invoice.invoice_number} has been paid "
                    f"(UTR {payment.utr_reference}, net amount Rs.{payment.net_payable_amount})."
                ),
            ),
        )
        db.commit()

    db.refresh(payment)
    return payment


def reject_payment(db: Session, payment_id: uuid.UUID, reason: str, current_user: User) -> Payment:
    payment = payment_repository.get_by_id(db, payment_id)
    if payment is None:
        raise PaymentNotFoundError("Payment not found")
    if payment.status != PaymentStatus.MAKER_RECORDED:
        raise PaymentNotMakerRecordedError(
            f"Payment is not awaiting confirmation (current status: {payment.status.value})"
        )
    if current_user.id == payment.initiated_by:
        raise MakerCannotBeCheckerError("The checker must be a different user than the maker")

    payment.status = PaymentStatus.REJECTED
    payment.confirmed_by = current_user.id
    payment.confirmed_at = datetime.now(timezone.utc)
    payment.rejection_reason = reason
    payment_repository.save(db, payment)
    return payment


def get_confirmed_payment_for_invoice(db: Session, invoice_id: uuid.UUID, current_user: User) -> Payment:
    """Added for Phase 4 UI's vendor-invoice-track.html — once an invoice is Paid,
    there was no way to look up its payment record from the invoice id alone (only
    GET /payments/{id} by payment id existed)."""
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name == "Vendor" and current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to view this invoice's payment")

    payment = payment_repository.get_confirmed_for_invoice(db, invoice_id)
    if payment is None:
        raise PaymentNotFoundError("No confirmed payment exists for this invoice")
    return payment


def get_payment(db: Session, payment_id: uuid.UUID, current_user: User) -> Payment:
    payment = payment_repository.get_by_id(db, payment_id)
    if payment is None:
        raise PaymentNotFoundError("Payment not found")
    if current_user.role.name == "Vendor":
        invoice = invoice_repository.get_by_id(db, payment.invoice_id)
        if invoice is None or current_user.linked_vendor_id != invoice.vendor_id:
            raise NotOwnVendorError("Not authorized to view this payment")
    return payment


def get_queue(db: Session) -> list[Invoice]:
    return invoice_repository.list_approved_for_payment(db)


def list_pending_confirmation(db: Session) -> list[Payment]:
    """Added for Phase 4 UI's payment-confirm-queue.html — Section 6's endpoint list
    didn't include a way to list Maker_Recorded payments awaiting a checker."""
    return payment_repository.list_by_status(db, PaymentStatus.MAKER_RECORDED)


def get_msme_alerts(db: Session) -> list[MsmeAlertRead]:
    today = date.today()
    alerts: list[MsmeAlertRead] = []
    for invoice in invoice_repository.list_msme_unpaid(db):
        if invoice.payment_due_date is None:
            continue
        days_until_due = (invoice.payment_due_date - today).days
        if days_until_due < 0:
            alert_type = "Overdue"
        elif days_until_due <= AT_RISK_WINDOW_DAYS:
            alert_type = "At_Risk"
        else:
            continue
        alerts.append(
            MsmeAlertRead(
                invoice_id=invoice.id,
                invoice_number=invoice.invoice_number,
                vendor_id=invoice.vendor_id,
                payment_due_date=invoice.payment_due_date,
                alert_type=alert_type,
                days_until_due=days_until_due,
            )
        )
    return alerts
