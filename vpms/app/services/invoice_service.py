import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.storage import InvalidStoredPathError, resolve_upload_path, save_invoice_document_and_hash
from app.core.validators import validate_gstin
from app.models.enums import AgreementStatus, BillingFrequency, InvoiceDocumentType, InvoiceStatus, PurchaseOrderStatus
from app.models.invoice import Invoice
from app.models.invoice_document import InvoiceDocument
from app.models.notification import Notification
from app.models.user import User
from app.repositories import (
    agreement_repository,
    billing_milestone_repository,
    grn_scn_repository,
    invoice_document_repository,
    invoice_repository,
    notification_repository,
    purchase_order_repository,
    rate_card_repository,
    user_repository,
    vendor_repository,
)
from app.schemas.invoice import InvoiceCreate
from app.services import agreement_service, vendor_portal_service

TWO_PLACES = Decimal("0.01")
MANDATORY_DOCUMENT_TYPES = (
    InvoiceDocumentType.INVOICE_PDF,
    InvoiceDocumentType.GRN_SCN_ACK,
    InvoiceDocumentType.WORK_COMPLETION_PROOF,
)
RATE_VARIANCE_THRESHOLD_PCT = Decimal(5)
GST_MISMATCH_TOLERANCE = Decimal(1)
TOTAL_AMOUNT_TOLERANCE = Decimal(1)


class NotOwnVendorError(Exception):
    pass


class InvoiceNotFoundError(Exception):
    pass


class AgreementNotFoundError(Exception):
    pass


class PONotFoundError(Exception):
    pass


class ItemMismatchError(Exception):
    pass


class MilestoneMismatchError(Exception):
    pass


class TotalAmountMismatchError(Exception):
    pass


class AlreadySubmittedError(Exception):
    pass


class InvoiceDocumentNotFoundError(Exception):
    pass


class FileUnavailableError(Exception):
    pass


class InvoiceValidationError(Exception):
    """Covers every hard-block / must-correct check in Section 5 — each raise carries its
    own message so the API layer can return the specific failed check, per Section 4's
    "422 with the specific failed check(s) named"."""

    pass


def _require_vendor_portal_user(current_user: User) -> None:
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id is None:
        raise NotOwnVendorError("Only a vendor-portal user can act on invoices")


def create_invoice(db: Session, payload: InvoiceCreate, current_user: User) -> Invoice:
    _require_vendor_portal_user(current_user)
    vendor_id = current_user.linked_vendor_id

    agreement = agreement_repository.get_by_id(db, payload.agreement_id)
    if agreement is None or agreement.vendor_id != vendor_id:
        raise AgreementNotFoundError("Agreement not found for this vendor")

    po = None
    if payload.po_id is not None:
        po = purchase_order_repository.get_by_id(db, payload.po_id)
        if po is None or po.vendor_id != vendor_id:
            raise PONotFoundError("Purchase order not found for this vendor")
        if po.agreement_id != payload.agreement_id:
            raise ItemMismatchError("agreement_id does not match this PO's agreement")
        if po.item_code_id != payload.item_code_id:
            raise ItemMismatchError("item_code_id does not match this PO's item")
    else:
        covered_ids = {item.id for item in agreement.covered_item_codes}
        if payload.item_code_id not in covered_ids:
            raise ItemMismatchError("item_code_id is not covered by this agreement")

    if payload.billing_milestone_id is not None:
        milestone = billing_milestone_repository.get_by_id(db, payload.billing_milestone_id)
        if milestone is None or milestone.agreement_id != payload.agreement_id:
            raise MilestoneMismatchError("billing_milestone_id must belong to this invoice's agreement")

    taxable_amount = (Decimal(payload.quantity) * Decimal(payload.rate)).quantize(TWO_PLACES)
    total_gst_amount = (Decimal(payload.cgst_amount) + Decimal(payload.sgst_amount) + Decimal(payload.igst_amount)).quantize(
        TWO_PLACES
    )
    expected_total = taxable_amount + total_gst_amount
    if abs(Decimal(payload.total_invoice_amount) - expected_total) > TOTAL_AMOUNT_TOLERANCE:
        raise TotalAmountMismatchError(
            f"total_invoice_amount ({payload.total_invoice_amount}) does not match "
            f"taxable_amount + total_gst_amount ({expected_total})"
        )

    invoice = Invoice(
        invoice_number=payload.invoice_number,
        vendor_id=vendor_id,
        po_id=payload.po_id,
        agreement_id=payload.agreement_id,
        item_code_id=payload.item_code_id,
        invoice_date=payload.invoice_date,
        quantity=payload.quantity,
        rate=payload.rate,
        taxable_amount=taxable_amount,
        cgst_amount=payload.cgst_amount,
        sgst_amount=payload.sgst_amount,
        igst_amount=payload.igst_amount,
        total_gst_amount=total_gst_amount,
        total_invoice_amount=payload.total_invoice_amount,
        period_service_from=payload.period_service_from,
        period_service_to=payload.period_service_to,
        billing_milestone_id=payload.billing_milestone_id,
        work_description=payload.work_description,
        status=InvoiceStatus.DRAFT,
    )
    return invoice_repository.create(db, invoice)


def list_invoices(db: Session, current_user: User) -> list[Invoice]:
    if current_user.role.name == "Vendor":
        if current_user.linked_vendor_id is None:
            return []
        return invoice_repository.list_for_vendor(db, current_user.linked_vendor_id)
    return invoice_repository.list_all(db)


def get_invoice(db: Session, invoice_id: uuid.UUID, current_user: User) -> Invoice:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name == "Vendor" and current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to view this invoice")
    return invoice


def upload_document(
    db: Session,
    invoice_id: uuid.UUID,
    document_type: InvoiceDocumentType,
    filename: str,
    content: bytes,
    current_user: User,
) -> InvoiceDocument:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to upload documents for this invoice")
    if invoice.status == InvoiceStatus.SUBMITTED:
        raise AlreadySubmittedError("Invoice has already been submitted and is read-only")

    file_url, file_hash = save_invoice_document_and_hash(invoice_id, filename, content)

    document = InvoiceDocument(
        invoice_id=invoice_id,
        document_type=document_type,
        is_mandatory=document_type in MANDATORY_DOCUMENT_TYPES,
        file_url=file_url,
        file_hash=file_hash,
    )
    return invoice_document_repository.create(db, document)


def list_documents(db: Session, invoice_id: uuid.UUID, current_user: User) -> list[InvoiceDocument]:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name == "Vendor" and current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to view this invoice's documents")
    return invoice_document_repository.list_for_invoice(db, invoice_id)


def get_document_file(db: Session, document_id: uuid.UUID, current_user: User) -> tuple[InvoiceDocument, Path]:
    document = invoice_document_repository.get_by_id(db, document_id)
    if document is None:
        raise InvoiceDocumentNotFoundError("Invoice document not found")

    invoice = invoice_repository.get_by_id(db, document.invoice_id)
    is_owning_vendor = current_user.role.name == "Vendor" and current_user.linked_vendor_id == invoice.vendor_id
    if current_user.role.name == "Vendor" and not is_owning_vendor:
        raise NotOwnVendorError("Not authorized to view this document")

    try:
        path = resolve_upload_path(document.file_url)
    except InvalidStoredPathError as exc:
        raise FileUnavailableError(str(exc))

    return document, path


def submit_invoice(db: Session, invoice_id: uuid.UUID, current_user: User) -> Invoice:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to submit this invoice")
    if invoice.status == InvoiceStatus.SUBMITTED:
        raise AlreadySubmittedError("Invoice has already been submitted")

    vendor = vendor_repository.get_by_id(db, invoice.vendor_id)
    agreement = agreement_repository.get_by_id(db, invoice.agreement_id)

    # Section 5.10 — preconditions, checked before any of the other rules.
    if not vendor.is_active:
        raise InvoiceValidationError("Vendor is not active")

    profile_status = vendor_portal_service.get_profile_status(db, vendor)
    if not profile_status.complete:
        raise InvoiceValidationError("Vendor KYC profile is not complete")

    po = None
    if invoice.po_id is not None:
        po = purchase_order_repository.get_by_id(db, invoice.po_id)
        if po.status != PurchaseOrderStatus.VENDOR_ACKNOWLEDGED:
            raise InvoiceValidationError(
                f"PO must be Vendor_Acknowledged before invoicing (current status: {po.status.value})"
            )
        if not grn_scn_repository.list_for_po(db, po.id):
            raise InvoiceValidationError("At least one GRN/SCN entry must exist for this PO before invoicing")

    # Rule 1 — duplicate invoice number, same vendor.
    if invoice_repository.find_by_vendor_and_number(db, invoice.vendor_id, invoice.invoice_number, invoice.id):
        raise InvoiceValidationError(f"Duplicate invoice number for this vendor: {invoice.invoice_number}")

    # Rule 2 — invoice amount vs. remaining PO balance.
    if po is not None:
        already_invoiced = invoice_repository.submitted_amount_total_for_po(db, po.id)
        balance = Decimal(po.total_po_value_incl_gst) - already_invoiced
        if Decimal(invoice.total_invoice_amount) > balance:
            raise InvoiceValidationError(
                f"Invoice amount ({invoice.total_invoice_amount}) exceeds remaining PO balance ({balance})"
            )

    # Rule 3 — invoice quantity vs. available GRN-confirmed, not-yet-invoiced quantity.
    if po is not None:
        grn_total = grn_scn_repository.confirmed_total_for_po(db, po.id)
        already_invoiced_qty = invoice_repository.submitted_quantity_total_for_po(db, po.id)
        available_qty = grn_total - already_invoiced_qty
        if Decimal(invoice.quantity) > available_qty:
            raise InvoiceValidationError(
                f"Invoice quantity ({invoice.quantity}) exceeds available GRN-confirmed quantity ({available_qty})"
            )

    # Rule 4 — mandatory supporting documents.
    docs = invoice_document_repository.list_for_invoice(db, invoice.id)
    present_types = {d.document_type for d in docs}
    missing = [t.value for t in MANDATORY_DOCUMENT_TYPES if t not in present_types]
    if missing:
        raise InvoiceValidationError(f"Missing mandatory documents: {', '.join(missing)}")

    # Rule 5 — vendor GSTIN "active" (stub: format-valid + present).
    try:
        if not vendor.gstin:
            raise ValueError("missing")
        validate_gstin(vendor.gstin)
    except ValueError:
        raise InvoiceValidationError("Vendor GSTIN is missing or invalid (stub active-check)")

    # Rule 6 — PO / Agreement expired.
    if po is not None and po.po_validity_date < date.today():
        raise InvoiceValidationError(f"PO validity date has passed ({po.po_validity_date})")

    if agreement_service.compute_effective_status(agreement) != AgreementStatus.ACTIVE:
        raise InvoiceValidationError("Agreement is not Active")
    if not (agreement.agreement_start_date <= invoice.invoice_date <= agreement.agreement_end_date):
        raise InvoiceValidationError("invoice_date falls outside the agreement's active period")

    # Rule 11 — invoice date validation.
    if invoice.invoice_date > date.today():
        raise InvoiceValidationError("invoice_date cannot be in the future")
    if po is not None and invoice.invoice_date < po.po_date:
        raise InvoiceValidationError(f"invoice_date cannot predate the PO's po_date ({po.po_date})")

    # Rule 12 — period of service within the agreement's active period.
    if not (agreement.agreement_start_date <= invoice.period_service_from <= agreement.agreement_end_date) or not (
        agreement.agreement_start_date <= invoice.period_service_to <= agreement.agreement_end_date
    ):
        raise InvoiceValidationError("period_service_from/to must fall within the agreement's active period")

    # Rule 13 — billing milestone linkage.
    if agreement.billing_frequency == BillingFrequency.MILESTONE:
        if invoice.billing_milestone_id is None:
            raise InvoiceValidationError("billing_milestone_id is mandatory when billing_frequency is Milestone")
        milestone = billing_milestone_repository.get_by_id(db, invoice.billing_milestone_id)
        if milestone is None or milestone.agreement_id != agreement.id:
            raise InvoiceValidationError("billing_milestone_id must belong to this invoice's agreement")

    # Rule 8 — GST calculation mismatch (>₹1 blocks; correction required).
    expected_gst = (Decimal(invoice.taxable_amount) * Decimal(agreement.gst_rate) / Decimal(100)).quantize(TWO_PLACES)
    actual_gst = Decimal(invoice.total_gst_amount)
    gst_delta = abs(actual_gst - expected_gst)
    if gst_delta > GST_MISMATCH_TOLERANCE:
        raise InvoiceValidationError(
            f"GST breakup (₹{actual_gst}) differs from the expected GST (₹{expected_gst}) by more than "
            f"₹1 — please correct the CGST/SGST/IGST breakup"
        )

    # Rule 7 — rate variance >5% from the active rate card. Soft flag, does not block.
    rate_variance_flag = False
    rate_card = rate_card_repository.get_active_for_agreement_item(db, agreement.id, invoice.item_code_id)
    if rate_card is not None and rate_card.rate is not None and Decimal(rate_card.rate) != 0:
        variance_pct = abs(Decimal(invoice.rate) - Decimal(rate_card.rate)) / Decimal(rate_card.rate) * 100
        if variance_pct > RATE_VARIANCE_THRESHOLD_PCT:
            rate_variance_flag = True

    # Rule 9 — MSME alert. Soft flag + notification, does not block.
    msme_alert_triggered = bool(vendor.msme_status)

    invoice.status = InvoiceStatus.SUBMITTED
    invoice.rate_variance_flag = rate_variance_flag
    invoice.gst_mismatch_delta = gst_delta
    invoice.msme_alert_triggered = msme_alert_triggered
    invoice_repository.save(db, invoice)

    if msme_alert_triggered:
        for ap_user in user_repository.list_by_role_name(db, "Accounts Executive"):
            notification_repository.create(
                db,
                Notification(
                    user_id=ap_user.id,
                    message=(
                        f"MSME vendor invoice submitted: {invoice.invoice_number} "
                        f"(vendor {vendor.vendor_name}) — MSME payment timeline applies."
                    ),
                ),
            )
        db.commit()

    return invoice
