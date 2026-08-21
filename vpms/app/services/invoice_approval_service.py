import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.approval_delegation import ApprovalDelegation
from app.models.doa_matrix import DoaMatrix
from app.models.enums import ApprovalLevel, ApprovalStageStatus, InvoiceStatus, QueryStatus
from app.models.invoice import Invoice
from app.models.invoice_approval import InvoiceApproval
from app.models.invoice_query import InvoiceQuery
from app.models.user import User
from app.repositories import (
    agreement_repository,
    approval_delegation_repository,
    doa_matrix_repository,
    invoice_approval_repository,
    invoice_query_repository,
    invoice_repository,
    user_repository,
    vendor_repository,
)
from app.schemas.approval_delegation import DelegationCreate
from app.schemas.doa_matrix import DoaMatrixCreate

LEVEL_TO_STATUS = {
    ApprovalLevel.L1: InvoiceStatus.L1_VERIFICATION,
    ApprovalLevel.L2: InvoiceStatus.L2_REVIEW,
    ApprovalLevel.L3: InvoiceStatus.L3_APPROVAL,
    ApprovalLevel.L4: InvoiceStatus.L4_FINANCE_APPROVAL,
}
STATUS_TO_LEVEL = {v: k for k, v in LEVEL_TO_STATUS.items()}


class InvoiceNotFoundError(Exception):
    pass


class InvalidStateError(Exception):
    pass


class NoMatchingSlabError(Exception):
    pass


class DoaMatrixNotFoundError(Exception):
    pass


class ApprovalNotFoundError(Exception):
    pass


class StageNotActiveError(Exception):
    pass


class NotAuthorizedError(Exception):
    pass


class InvalidActionError(Exception):
    pass


class QueryNotFoundError(Exception):
    pass


class QueryAlreadyRespondedError(Exception):
    pass


class NotOwnVendorError(Exception):
    pass


def add_business_days(start: datetime, days: int) -> datetime:
    """Simple business-day adder (Mon-Fri) — no holiday calendar this phase (Section 5.6)."""
    current = start
    remaining = days
    while remaining > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            remaining -= 1
    return current


def _tat_days_for_level(slab: DoaMatrix, level: ApprovalLevel) -> int:
    return {
        ApprovalLevel.L1: slab.l1_tat_days,
        ApprovalLevel.L2: slab.l2_tat_days,
        ApprovalLevel.L3: slab.l3_tat_days,
        ApprovalLevel.L4: slab.l4_tat_days,
    }[level]


def _can_act_as_role(db: Session, assigned_role: str, current_user: User) -> bool:
    if current_user.role.name == assigned_role:
        return True
    delegations = approval_delegation_repository.list_active_for_delegate(db, current_user.id, date.today())
    for delegation in delegations:
        delegator = user_repository.get_by_id(db, delegation.delegator_user_id)
        if delegator is not None and delegator.role.name == assigned_role:
            return True
    return False


def _require_role_or_delegate(db: Session, assigned_role: str, current_user: User) -> None:
    if not _can_act_as_role(db, assigned_role, current_user):
        raise NotAuthorizedError(f"Only {assigned_role} (or an active delegate) may act on this stage")


# ---------- DoA Matrix ----------


def create_doa_matrix_row(db: Session, payload: DoaMatrixCreate) -> DoaMatrix:
    row = DoaMatrix(
        min_amount=payload.min_amount,
        max_amount=payload.max_amount,
        requires_l2=payload.requires_l2,
        requires_l3=payload.requires_l3,
        l1_role=payload.l1_role,
        l2_role=payload.l2_role,
        l3_role=payload.l3_role,
        l4_role=payload.l4_role,
        l1_tat_days=payload.l1_tat_days,
        l2_tat_days=payload.l2_tat_days,
        l3_tat_days=payload.l3_tat_days,
        l4_tat_days=payload.l4_tat_days,
    )
    return doa_matrix_repository.create(db, row)


def list_doa_matrix(db: Session) -> list[DoaMatrix]:
    return doa_matrix_repository.list_all(db)


def update_doa_matrix_row(db: Session, matrix_id: uuid.UUID, payload: DoaMatrixCreate) -> DoaMatrix:
    """Added for Phase 4 UI's doa-matrix.html inline edit — Phase 4A only ever needed
    create + list."""
    row = doa_matrix_repository.get_by_id(db, matrix_id)
    if row is None:
        raise DoaMatrixNotFoundError("DoA matrix row not found")
    row.min_amount = payload.min_amount
    row.max_amount = payload.max_amount
    row.requires_l2 = payload.requires_l2
    row.requires_l3 = payload.requires_l3
    row.l1_role = payload.l1_role
    row.l2_role = payload.l2_role
    row.l3_role = payload.l3_role
    row.l4_role = payload.l4_role
    row.l1_tat_days = payload.l1_tat_days
    row.l2_tat_days = payload.l2_tat_days
    row.l3_tat_days = payload.l3_tat_days
    row.l4_tat_days = payload.l4_tat_days
    return doa_matrix_repository.save(db, row)


# ---------- Routing ----------


def route_for_approval(db: Session, invoice_id: uuid.UUID, current_user: User) -> Invoice:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if invoice.status != InvoiceStatus.SUBMITTED:
        raise InvalidStateError(
            f"Invoice must be Submitted to route for approval (current status: {invoice.status.value})"
        )

    slab = doa_matrix_repository.find_matching_slab(db, Decimal(invoice.total_invoice_amount))
    if slab is None:
        raise NoMatchingSlabError("No DoA matrix slab matches this invoice's total amount")

    now = datetime.now(timezone.utc)

    l1 = InvoiceApproval(
        invoice_id=invoice.id,
        level=ApprovalLevel.L1,
        assigned_role=slab.l1_role,
        status=ApprovalStageStatus.PENDING,
        tat_due_at=add_business_days(now, slab.l1_tat_days),
    )
    invoice_approval_repository.create(db, l1)

    l2_status = ApprovalStageStatus.PENDING if slab.requires_l2 else ApprovalStageStatus.SKIPPED
    l2 = InvoiceApproval(
        invoice_id=invoice.id,
        level=ApprovalLevel.L2,
        assigned_role=slab.l2_role or "",
        status=l2_status,
        tat_due_at=add_business_days(now, slab.l2_tat_days),
    )
    invoice_approval_repository.create(db, l2)

    l3_status = ApprovalStageStatus.PENDING if slab.requires_l3 else ApprovalStageStatus.SKIPPED
    l3 = InvoiceApproval(
        invoice_id=invoice.id,
        level=ApprovalLevel.L3,
        assigned_role=slab.l3_role or "",
        status=l3_status,
        tat_due_at=add_business_days(now, slab.l3_tat_days),
    )
    invoice_approval_repository.create(db, l3)

    l4 = InvoiceApproval(
        invoice_id=invoice.id,
        level=ApprovalLevel.L4,
        assigned_role=slab.l4_role,
        status=ApprovalStageStatus.PENDING,
        tat_due_at=add_business_days(now, slab.l4_tat_days),
    )
    invoice_approval_repository.create(db, l4)

    invoice.status = InvoiceStatus.L1_VERIFICATION
    invoice.doa_matrix_id = slab.id
    invoice_repository.save(db, invoice)
    return invoice


# ---------- Sequential approval actions ----------


def _mark(approval: InvoiceApproval, status: ApprovalStageStatus, current_user: User, comments: str | None) -> None:
    approval.status = status
    approval.action_taken_by = current_user.id
    approval.action_at = datetime.now(timezone.utc)
    approval.comments = comments


def _handle_l1(db: Session, invoice: Invoice, approval: InvoiceApproval, action: str, comments, current_user: User) -> None:
    if action == "Verify":
        _mark(approval, ApprovalStageStatus.COMPLETED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        l2 = invoice_approval_repository.get_for_invoice_level(db, invoice.id, ApprovalLevel.L2)
        invoice.status = (
            InvoiceStatus.L4_FINANCE_APPROVAL if l2.status == ApprovalStageStatus.SKIPPED else InvoiceStatus.L2_REVIEW
        )
    elif action == "Return_To_Vendor":
        _mark(approval, ApprovalStageStatus.RETURNED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.RETURNED_TO_VENDOR
    elif action == "Reject":
        _mark(approval, ApprovalStageStatus.REJECTED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.REJECTED
    else:
        raise InvalidActionError(f"'{action}' is not a valid action at L1")


def _handle_l2(db: Session, invoice: Invoice, approval: InvoiceApproval, action: str, comments, current_user: User) -> None:
    if action == "Approve":
        _mark(approval, ApprovalStageStatus.COMPLETED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        l3 = invoice_approval_repository.get_for_invoice_level(db, invoice.id, ApprovalLevel.L3)
        invoice.status = (
            InvoiceStatus.L4_FINANCE_APPROVAL if l3.status == ApprovalStageStatus.SKIPPED else InvoiceStatus.L3_APPROVAL
        )
    elif action == "Return_To_Accounts":
        _mark(approval, ApprovalStageStatus.RETURNED, current_user, comments)
        invoice_approval_repository.save(db, approval)

        l1 = invoice_approval_repository.get_for_invoice_level(db, invoice.id, ApprovalLevel.L1)
        slab = doa_matrix_repository.get_by_id(db, invoice.doa_matrix_id)
        l1.status = ApprovalStageStatus.PENDING
        l1.action_taken_by = None
        l1.action_at = None
        l1.comments = None
        l1.tat_paused = False
        l1.tat_due_at = add_business_days(datetime.now(timezone.utc), slab.l1_tat_days)
        invoice_approval_repository.save(db, l1)

        invoice.status = InvoiceStatus.L1_VERIFICATION
    elif action == "Reject":
        _mark(approval, ApprovalStageStatus.REJECTED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.REJECTED
    else:
        raise InvalidActionError(f"'{action}' is not a valid action at L2")


def _handle_l3(db: Session, invoice: Invoice, approval: InvoiceApproval, action: str, comments, current_user: User) -> None:
    if action == "Approve":
        _mark(approval, ApprovalStageStatus.COMPLETED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.L4_FINANCE_APPROVAL
    elif action == "Reject":
        _mark(approval, ApprovalStageStatus.REJECTED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.REJECTED
    else:
        raise InvalidActionError(f"'{action}' is not a valid action at L3")


def _compute_payment_due_date(db: Session, invoice: Invoice) -> date:
    """Phase 4B, Section 5.5: MIN(invoice_date + agreement credit period, +45d from the
    moment this invoice reaches Approved_For_Payment) — the 45-day leg only applies for
    MSME vendors. Computed once, right here, at that exact status transition."""
    agreement = agreement_repository.get_by_id(db, invoice.agreement_id)
    credit_period_due = invoice.invoice_date + timedelta(days=agreement.credit_period_days)

    vendor = vendor_repository.get_by_id(db, invoice.vendor_id)
    if vendor.msme_status:
        msme_due = date.today() + timedelta(days=45)
        return min(credit_period_due, msme_due)
    return credit_period_due


def _handle_l4(db: Session, invoice: Invoice, approval: InvoiceApproval, action: str, comments, current_user: User) -> None:
    if action == "Approve_For_Payment":
        _mark(approval, ApprovalStageStatus.COMPLETED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.APPROVED_FOR_PAYMENT
        invoice.payment_due_date = _compute_payment_due_date(db, invoice)
    elif action == "Hold":
        # The L4 row's own status has no On_Hold value (Section 3.3) — it stays Pending
        # the whole time; only the invoice status reflects the hold.
        invoice.status = InvoiceStatus.ON_HOLD
    elif action == "Reject":
        _mark(approval, ApprovalStageStatus.REJECTED, current_user, comments)
        invoice_approval_repository.save(db, approval)
        invoice.status = InvoiceStatus.REJECTED
    else:
        raise InvalidActionError(f"'{action}' is not a valid action at L4")


_LEVEL_HANDLERS = {
    ApprovalLevel.L1: _handle_l1,
    ApprovalLevel.L2: _handle_l2,
    ApprovalLevel.L3: _handle_l3,
    ApprovalLevel.L4: _handle_l4,
}


def take_action(db: Session, approval_id: uuid.UUID, action: str, comments: str | None, current_user: User) -> InvoiceApproval:
    approval = invoice_approval_repository.get_by_id(db, approval_id)
    if approval is None:
        raise ApprovalNotFoundError("Approval stage not found")

    invoice = invoice_repository.get_by_id(db, approval.invoice_id)

    # L4 release from On_Hold: the row never left Pending, so it's exempt from the
    # active-stage check below — Hold/Release are pure invoice-status toggles.
    if approval.level == ApprovalLevel.L4 and invoice.status == InvoiceStatus.ON_HOLD and action == "Release":
        _require_role_or_delegate(db, approval.assigned_role, current_user)
        invoice.status = InvoiceStatus.L4_FINANCE_APPROVAL
        invoice_repository.save(db, invoice)
        db.refresh(approval)
        return approval

    if approval.status != ApprovalStageStatus.PENDING:
        raise StageNotActiveError(f"This stage is not Pending (current status: {approval.status.value})")
    if invoice.status != LEVEL_TO_STATUS.get(approval.level):
        raise StageNotActiveError("This stage is not currently active for this invoice")

    _require_role_or_delegate(db, approval.assigned_role, current_user)

    _LEVEL_HANDLERS[approval.level](db, invoice, approval, action, comments, current_user)

    invoice_repository.save(db, invoice)
    db.refresh(approval)
    return approval


def list_approvals_for_invoice(db: Session, invoice_id: uuid.UUID, current_user: User) -> list[InvoiceApproval]:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name == "Vendor" and current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to view this invoice's approvals")
    return invoice_approval_repository.list_latest_for_invoice(db, invoice_id)


def get_approval(db: Session, approval_id: uuid.UUID) -> InvoiceApproval:
    approval = invoice_approval_repository.get_by_id(db, approval_id)
    if approval is None:
        raise ApprovalNotFoundError("Approval stage not found")
    return approval


def get_my_queue(db: Session, current_user: User) -> list[InvoiceApproval]:
    roles = {current_user.role.name}
    delegations = approval_delegation_repository.list_active_for_delegate(db, current_user.id, date.today())
    for delegation in delegations:
        delegator = user_repository.get_by_id(db, delegation.delegator_user_id)
        if delegator is not None:
            roles.add(delegator.role.name)

    results = []
    seen_ids = set()
    for role_name in roles:
        for approval in invoice_approval_repository.list_pending_for_role(db, role_name):
            if approval.id in seen_ids:
                continue
            if approval.invoice is not None and approval.invoice.status == LEVEL_TO_STATUS.get(approval.level):
                results.append(approval)
                seen_ids.add(approval.id)
    return results


def list_escalations(db: Session) -> list[InvoiceApproval]:
    return invoice_approval_repository.list_breached_tat(db, datetime.now(timezone.utc))


# ---------- Query management ----------


def raise_query(db: Session, invoice_id: uuid.UUID, query_text: str, current_user: User) -> InvoiceQuery:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")

    level = STATUS_TO_LEVEL.get(invoice.status)
    if level is None:
        raise InvalidStateError(
            f"Invoice is not currently at an active approval stage (status: {invoice.status.value})"
        )

    approval = invoice_approval_repository.get_for_invoice_level(db, invoice_id, level)
    if approval is None or approval.status != ApprovalStageStatus.PENDING:
        raise StageNotActiveError("This stage is not currently active for this invoice")

    _require_role_or_delegate(db, approval.assigned_role, current_user)

    approval.status = ApprovalStageStatus.QUERY_RAISED
    approval.tat_paused = True
    invoice_approval_repository.save(db, approval)

    query = InvoiceQuery(
        invoice_id=invoice_id,
        raised_at_level=level,
        raised_by=current_user.id,
        query_text=query_text,
        status=QueryStatus.OPEN,
    )
    invoice_query_repository.create(db, query)

    invoice.status = InvoiceStatus.QUERY_RAISED
    invoice_repository.save(db, invoice)
    db.refresh(query)
    return query


def respond_to_query(
    db: Session, invoice_id: uuid.UUID, query_id: uuid.UUID, vendor_response: str, current_user: User
) -> InvoiceQuery:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to respond to this invoice's queries")

    query = invoice_query_repository.get_by_id(db, query_id)
    if query is None or query.invoice_id != invoice_id:
        raise QueryNotFoundError("Query not found")
    if query.status != QueryStatus.OPEN:
        raise QueryAlreadyRespondedError("This query has already been responded to")

    query.status = QueryStatus.RESPONDED
    query.vendor_response = vendor_response
    query.responded_at = datetime.now(timezone.utc)
    invoice_query_repository.save(db, query)

    level = query.raised_at_level
    approval = invoice_approval_repository.get_for_invoice_level(db, invoice_id, level)
    slab = doa_matrix_repository.get_by_id(db, invoice.doa_matrix_id)

    approval.status = ApprovalStageStatus.PENDING
    approval.tat_paused = False
    approval.tat_due_at = add_business_days(datetime.now(timezone.utc), _tat_days_for_level(slab, level))
    invoice_approval_repository.save(db, approval)

    invoice.status = LEVEL_TO_STATUS[level]
    invoice_repository.save(db, invoice)
    db.refresh(query)
    return query


def list_queries_for_invoice(db: Session, invoice_id: uuid.UUID, current_user: User) -> list[InvoiceQuery]:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name == "Vendor" and current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to view this invoice's queries")
    return invoice_query_repository.list_for_invoice(db, invoice_id)


# ---------- Return-to-vendor resubmission ----------


def resubmit(db: Session, invoice_id: uuid.UUID, current_user: User) -> Invoice:
    invoice = invoice_repository.get_by_id(db, invoice_id)
    if invoice is None:
        raise InvoiceNotFoundError("Invoice not found")
    if current_user.role.name != "Vendor" or current_user.linked_vendor_id != invoice.vendor_id:
        raise NotOwnVendorError("Not authorized to resubmit this invoice")
    if invoice.status != InvoiceStatus.RETURNED_TO_VENDOR:
        raise InvalidStateError(f"Invoice is not Returned_To_Vendor (current status: {invoice.status.value})")

    invoice.status = InvoiceStatus.SUBMITTED
    invoice_repository.save(db, invoice)
    return invoice


# ---------- Delegation ----------


def create_delegation(db: Session, payload: DelegationCreate, current_user: User) -> ApprovalDelegation:
    if current_user.role.name == "System Admin" and payload.delegator_user_id is not None:
        delegator_id = payload.delegator_user_id
    else:
        delegator_id = current_user.id

    delegation = ApprovalDelegation(
        delegator_user_id=delegator_id,
        delegate_user_id=payload.delegate_user_id,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        created_by=current_user.id,
    )
    return approval_delegation_repository.create(db, delegation)


def list_delegations_for_user(db: Session, user_id: uuid.UUID) -> list[ApprovalDelegation]:
    return approval_delegation_repository.list_for_user(db, user_id)
