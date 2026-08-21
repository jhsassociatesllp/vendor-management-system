import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.budget_commitment import BudgetCommitment
from app.models.enums import AgreementStatus, POAmendmentStatus, PurchaseOrderStatus
from app.models.grn_scn import GrnScn
from app.models.po_amendment import POAmendment
from app.models.purchase_order import PurchaseOrder
from app.models.user import User
from app.repositories import (
    agreement_repository,
    budget_commitment_repository,
    budget_head_repository,
    grn_scn_repository,
    invoice_repository,
    item_code_repository,
    po_amendment_repository,
    purchase_order_repository,
    rate_card_repository,
    vendor_repository,
)
from app.schemas.grn_scn import GrnScnCreate
from app.schemas.invoice import PurchaseOrderBalanceRead
from app.schemas.po_amendment import POAmendmentCreate
from app.schemas.purchase_order import PurchaseOrderCreate
from app.services import agreement_service, budget_service

TWO_PLACES = Decimal("0.01")


class VendorItemComboNotActiveError(Exception):
    pass


class AgreementNotActiveError(Exception):
    pass


class RateNotAvailableError(Exception):
    pass


class RateOverrideReasonRequiredError(Exception):
    pass


class BudgetInsufficientError(Exception):
    pass


class PONotFoundError(Exception):
    pass


class POStatusError(Exception):
    pass


class AmendmentNotFoundError(Exception):
    pass


class AmendmentStatusError(Exception):
    pass


class NotOwnVendorError(Exception):
    pass


class GrnQuantityExceededError(Exception):
    pass


def _compute_totals(quantity: Decimal, rate: Decimal, gst_rate: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    po_value_excl_gst = (Decimal(quantity) * Decimal(rate)).quantize(TWO_PLACES)
    gst_amount = (po_value_excl_gst * Decimal(gst_rate) / Decimal(100)).quantize(TWO_PLACES)
    return po_value_excl_gst, gst_amount, po_value_excl_gst + gst_amount


def create_po(db: Session, payload: PurchaseOrderCreate, current_user: User) -> PurchaseOrder:
    link = vendor_repository.get_link(db, payload.vendor_id, payload.item_code_id)
    if link is None or not link.is_active:
        raise VendorItemComboNotActiveError("No active vendor-item combination for this vendor and item code")

    agreement = agreement_repository.get_by_id(db, payload.agreement_id)
    if agreement is None or agreement.vendor_id != payload.vendor_id:
        raise AgreementNotActiveError("Agreement not found for this vendor")
    if agreement_service.compute_effective_status(agreement) != AgreementStatus.ACTIVE:
        raise AgreementNotActiveError("Agreement is not Active")
    if payload.item_code_id not in {item.id for item in agreement.covered_item_codes}:
        raise AgreementNotActiveError("Agreement does not cover this item code")

    budget_head = budget_head_repository.get_by_id(db, payload.budget_head_id)
    if budget_head is None:
        raise budget_service.BudgetHeadNotFoundError("Budget head not found")

    rate_card = rate_card_repository.get_active_for_agreement_item(db, payload.agreement_id, payload.item_code_id)
    if rate_card is None:
        raise RateNotAvailableError("No active rate card for this vendor/item/agreement combination")

    default_rate = Decimal(rate_card.rate) if rate_card.rate is not None else None
    if payload.rate is not None:
        final_rate = payload.rate
        if default_rate is None or final_rate != default_rate:
            if not payload.rate_override_reason:
                raise RateOverrideReasonRequiredError(
                    "rate_override_reason is required when the supplied rate differs from the active rate card"
                )
    else:
        if default_rate is None:
            raise RateNotAvailableError(
                "Rate card has no fixed rate; a rate and rate_override_reason must be supplied"
            )
        final_rate = default_rate

    item_code = item_code_repository.get_by_id(db, payload.item_code_id)

    po_value_excl_gst, gst_amount, total = _compute_totals(payload.quantity, final_rate, agreement.gst_rate)

    available = budget_service.available_amount(db, budget_head)
    if total > available and not payload.over_budget_justification:
        raise BudgetInsufficientError(f"Insufficient budget: available {available}, required {total}")

    po_number = purchase_order_repository.next_po_number(db, date.today().year)

    po = PurchaseOrder(
        po_number=po_number,
        version=1,
        vendor_id=payload.vendor_id,
        item_code_id=payload.item_code_id,
        agreement_id=payload.agreement_id,
        description=payload.description,
        quantity=payload.quantity,
        unit=item_code.unit,
        rate=final_rate,
        rate_override_reason=payload.rate_override_reason,
        po_value_excl_gst=po_value_excl_gst,
        gst_amount=gst_amount,
        total_po_value_incl_gst=total,
        budget_head_id=payload.budget_head_id,
        delivery_completion_date=payload.delivery_completion_date,
        po_validity_date=payload.po_validity_date,
        po_date=date.today(),
        status=PurchaseOrderStatus.PENDING_APPROVAL,
        over_budget_justification=payload.over_budget_justification,
    )
    purchase_order_repository.create(db, po)
    db.commit()
    db.refresh(po)
    return po


def list_pos(db: Session) -> list[PurchaseOrder]:
    return purchase_order_repository.list_all(db)


def get_po(db: Session, po_id: uuid.UUID) -> PurchaseOrder | None:
    return purchase_order_repository.get_by_id(db, po_id)


def approve_po(db: Session, po_id: uuid.UUID) -> PurchaseOrder:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")
    if po.status != PurchaseOrderStatus.PENDING_APPROVAL:
        raise POStatusError(f"PO is not Pending_Approval (current status: {po.status.value})")

    commitment = BudgetCommitment(
        budget_head_id=po.budget_head_id,
        po_id=po.id,
        committed_amount=po.total_po_value_incl_gst,
        is_released=False,
    )
    budget_commitment_repository.create(db, commitment)

    po.status = PurchaseOrderStatus.APPROVED
    purchase_order_repository.save(db, po)

    db.commit()
    db.refresh(po)
    return po


def reject_po(db: Session, po_id: uuid.UUID, rejection_reason: str) -> PurchaseOrder:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")
    if po.status != PurchaseOrderStatus.PENDING_APPROVAL:
        raise POStatusError(f"PO is not Pending_Approval (current status: {po.status.value})")

    po.status = PurchaseOrderStatus.REJECTED
    po.rejection_reason = rejection_reason
    purchase_order_repository.save(db, po)

    db.commit()
    db.refresh(po)
    return po


def cancel_po(db: Session, po_id: uuid.UUID) -> PurchaseOrder:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")
    if po.status not in (PurchaseOrderStatus.PENDING_APPROVAL, PurchaseOrderStatus.APPROVED):
        raise POStatusError(
            f"Only a Pending_Approval or Approved PO can be cancelled (current status: {po.status.value})"
        )

    commitment = budget_commitment_repository.get_active_for_po(db, po.id)
    if commitment is not None:
        commitment.is_released = True
        budget_commitment_repository.save(db, commitment)

    po.status = PurchaseOrderStatus.CANCELLED
    purchase_order_repository.save(db, po)

    db.commit()
    db.refresh(po)
    return po


def vendor_acknowledge(db: Session, po_id: uuid.UUID, current_user: User) -> PurchaseOrder:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != po.vendor_id:
        raise NotOwnVendorError("You can only acknowledge your own purchase orders")
    if po.status != PurchaseOrderStatus.APPROVED:
        raise POStatusError(f"PO must be Approved to be acknowledged (current status: {po.status.value})")

    po.status = PurchaseOrderStatus.VENDOR_ACKNOWLEDGED
    po.vendor_acknowledged_at = datetime.now(timezone.utc)
    purchase_order_repository.save(db, po)

    db.commit()
    db.refresh(po)
    return po


def propose_amendment(db: Session, po_id: uuid.UUID, payload: POAmendmentCreate, requester: User) -> POAmendment:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")

    amendment = POAmendment(
        po_id=po.id,
        previous_quantity=po.quantity,
        previous_rate=po.rate,
        previous_delivery_date=po.delivery_completion_date,
        new_quantity=payload.new_quantity,
        new_rate=payload.new_rate,
        new_delivery_date=payload.new_delivery_date,
        reason=payload.reason,
        status=POAmendmentStatus.PENDING_APPROVAL,
        requested_by=requester.id,
    )
    return po_amendment_repository.create(db, amendment)


def approve_amendment(db: Session, amendment_id: uuid.UUID, approver: User) -> POAmendment:
    amendment = po_amendment_repository.get_by_id(db, amendment_id)
    if amendment is None:
        raise AmendmentNotFoundError("Amendment not found")
    if amendment.status != POAmendmentStatus.PENDING_APPROVAL:
        raise AmendmentStatusError(f"Amendment is not Pending_Approval (current status: {amendment.status.value})")

    po = purchase_order_repository.get_by_id(db, amendment.po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")

    # Approving an amendment changes the PO's committed total, so any existing
    # commitment against the old total is released here; the PO reverts to
    # Pending_Approval (per spec 4.3) and a fresh commitment is created the next
    # time /purchase-orders/{id}/approve is called with the amended figures.
    existing_commitment = budget_commitment_repository.get_active_for_po(db, po.id)
    if existing_commitment is not None:
        existing_commitment.is_released = True
        budget_commitment_repository.save(db, existing_commitment)

    po.quantity = amendment.new_quantity
    po.rate = amendment.new_rate
    po.delivery_completion_date = amendment.new_delivery_date

    agreement = agreement_repository.get_by_id(db, po.agreement_id)
    po.po_value_excl_gst, po.gst_amount, po.total_po_value_incl_gst = _compute_totals(
        po.quantity, po.rate, agreement.gst_rate
    )
    po.version += 1
    po.status = PurchaseOrderStatus.PENDING_APPROVAL
    purchase_order_repository.save(db, po)

    amendment.status = POAmendmentStatus.APPROVED
    amendment.approved_by = approver.id
    po_amendment_repository.save(db, amendment)

    db.commit()
    db.refresh(amendment)
    return amendment


def reject_amendment(db: Session, amendment_id: uuid.UUID, approver: User) -> POAmendment:
    amendment = po_amendment_repository.get_by_id(db, amendment_id)
    if amendment is None:
        raise AmendmentNotFoundError("Amendment not found")
    if amendment.status != POAmendmentStatus.PENDING_APPROVAL:
        raise AmendmentStatusError(f"Amendment is not Pending_Approval (current status: {amendment.status.value})")

    amendment.status = POAmendmentStatus.REJECTED
    amendment.approved_by = approver.id
    po_amendment_repository.save(db, amendment)

    db.commit()
    db.refresh(amendment)
    return amendment


def record_grn(db: Session, po_id: uuid.UUID, payload: GrnScnCreate, current_user: User) -> GrnScn:
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")

    already_confirmed = grn_scn_repository.confirmed_total_for_po(db, po_id)
    prospective_total = already_confirmed + payload.quantity_confirmed
    if prospective_total > Decimal(po.quantity):
        raise GrnQuantityExceededError(
            f"Cumulative GRN/SCN quantity ({prospective_total}) would exceed PO quantity ({po.quantity})"
        )

    entry = GrnScn(
        po_id=po_id,
        type=payload.type,
        quantity_confirmed=payload.quantity_confirmed,
        description=payload.description,
        created_by=current_user.id,
    )
    return grn_scn_repository.create(db, entry)


def list_grn(db: Session, po_id: uuid.UUID) -> list[GrnScn]:
    return grn_scn_repository.list_for_po(db, po_id)


def list_amendments(db: Session, po_id: uuid.UUID) -> list[POAmendment]:
    """Added for Phase 3 UI's po-detail.html, which needs to show amendment history —
    no such list endpoint existed before (only single-amendment approve/reject)."""
    return po_amendment_repository.list_for_po(db, po_id)


def get_po_balance(db: Session, po_id: uuid.UUID) -> PurchaseOrderBalanceRead:
    """Remaining PO value/quantity after Submitted invoices — backs Phase 3B's
    GET /purchase-orders/{po_id}/balance, and is the same math Rules 2-3 of invoice
    submission enforce."""
    po = purchase_order_repository.get_by_id(db, po_id)
    if po is None:
        raise PONotFoundError("Purchase order not found")

    invoiced_amount = invoice_repository.submitted_amount_total_for_po(db, po_id)
    invoiced_quantity = invoice_repository.submitted_quantity_total_for_po(db, po_id)
    grn_confirmed_quantity = grn_scn_repository.confirmed_total_for_po(db, po_id)

    return PurchaseOrderBalanceRead(
        po_id=po.id,
        total_po_value_incl_gst=po.total_po_value_incl_gst,
        invoiced_amount=invoiced_amount,
        remaining_value=Decimal(po.total_po_value_incl_gst) - invoiced_amount,
        po_quantity=po.quantity,
        grn_confirmed_quantity=grn_confirmed_quantity,
        invoiced_quantity=invoiced_quantity,
        remaining_quantity=grn_confirmed_quantity - invoiced_quantity,
    )
