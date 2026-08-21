import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.core.validators import validate_pan
from app.models.enums import ApprovalLevel, ApprovalStageStatus, InvoiceStatus, PaymentStatus
from app.repositories import (
    budget_commitment_repository,
    budget_head_repository,
    invoice_approval_repository,
    invoice_query_repository,
    invoice_repository,
    payment_repository,
    purchase_order_repository,
    vendor_repository,
)
from app.services import payment_service, vendor_portal_service
from app.services.stubs import IFSC_LOOKUP

TWO_PLACES = Decimal("0.01")
AGING_BUCKETS = ["0-30", "30-60", "60-90", "90+"]


def _d(value) -> Decimal:
    return Decimal(value) if value is not None else Decimal(0)


def _today() -> date:
    return date.today()


# ---------- Shared cross-report building blocks ----------


def _unpaid_approved_invoices(db: Session) -> list:
    return [inv for inv in invoice_repository.list_approved_for_payment(db) if inv.payment_due_date is not None]


def _department_for_invoice(invoice, pos_by_id: dict, heads_by_id: dict) -> str | None:
    po = pos_by_id.get(invoice.po_id) if invoice.po_id else None
    head = heads_by_id.get(po.budget_head_id) if po else None
    return head.department if head else None


def _filtered_unpaid_invoices(
    db: Session,
    vendor_id: uuid.UUID | None,
    department: str | None,
    category: str | None,
    date_from: date | None,
    date_to: date | None,
) -> list:
    """Shared by dashboard_summary/dashboard_aging so the KPI cards and the aging chart
    respond to the same filter panel as the spend-by-category chart (Phase 5 UI spec
    Section 3.1: "changing filters re-fetches and re-renders both charts and the KPI
    cards, not just one or the other") — the original endpoints took no filters at all."""
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    pos_by_id = {po.id: po for po in purchase_order_repository.list_all(db)}
    heads_by_id = {h.id: h for h in budget_head_repository.list_all(db)}

    result = []
    for inv in _unpaid_approved_invoices(db):
        if vendor_id is not None and inv.vendor_id != vendor_id:
            continue
        vendor = vendors_by_id.get(inv.vendor_id)
        if category is not None and (vendor is None or vendor.vendor_category.value != category):
            continue
        if department is not None and _department_for_invoice(inv, pos_by_id, heads_by_id) != department:
            continue
        if date_from is not None and inv.payment_due_date < date_from:
            continue
        if date_to is not None and inv.payment_due_date > date_to:
            continue
        result.append(inv)
    return result


def _estimate_net_payable(db: Session, invoice) -> Decimal:
    """No Payment row necessarily exists yet for an Approved_For_Payment invoice — if a
    maker has already recorded one (Maker_Recorded, not yet confirmed), use its actual
    net_payable_amount; otherwise estimate using the same default-TDS logic Phase 4B's
    payment_service applies at record time (Section 4's rule 4 doesn't specify which, so
    this is the closest available real number rather than a fabricated placeholder)."""
    maker_payments = [
        p
        for p in payment_repository.list_by_status(db, PaymentStatus.MAKER_RECORDED)
        if p.invoice_id == invoice.id
    ]
    if maker_payments:
        return _d(maker_payments[0].net_payable_amount)
    try:
        section, rate = payment_service.get_default_tds_for_invoice(db, invoice.id)
    except payment_service.InvoiceNotFoundError:
        return _d(invoice.total_invoice_amount)
    gross = _d(invoice.total_invoice_amount)
    tds = (gross * rate / Decimal(100)).quantize(TWO_PLACES)
    return gross - tds


def _aging_bucket(days: int) -> str:
    if days <= 30:
        return "0-30"
    if days <= 60:
        return "30-60"
    if days <= 90:
        return "60-90"
    return "90+"


# ---------- Dashboard ----------


def dashboard_summary(
    db: Session,
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    today = _today()
    unpaid = _filtered_unpaid_invoices(db, vendor_id, department, category, date_from, date_to)

    total_payables = sum((_estimate_net_payable(db, inv) for inv in unpaid), Decimal(0))
    overdue_count = sum(1 for inv in unpaid if inv.payment_due_date < today)

    # MSME alerts filtered the same way as the payables set above, on the dimensions
    # MsmeAlertRead actually carries (vendor, due date) — category/department require a
    # vendor/PO lookup, done here rather than in payment_service since this filtering is
    # dashboard-specific, not part of the alert list's own contract.
    filtered_invoice_ids = {inv.id for inv in unpaid}
    all_msme_alerts = payment_service.get_msme_alerts(db)
    if vendor_id is None and department is None and category is None and date_from is None and date_to is None:
        msme_risk_count = len(all_msme_alerts)
    else:
        msme_risk_count = sum(1 for a in all_msme_alerts if a.invoice_id in filtered_invoice_ids)

    # Budget utilization is a per-head snapshot (sanctioned vs. committed+paid), not tied
    # to individual invoices — only "department" maps onto it (a budget head's own field);
    # vendor/category/date-range filters don't have a meaningful budget-head equivalent,
    # so they're left applied to the payables/aging side only.
    heads = budget_head_repository.list_all(db)
    if department is not None:
        heads = [h for h in heads if h.department == department]
    sanctioned_total = Decimal(0)
    committed_paid_total = Decimal(0)
    for head in heads:
        sanctioned_total += _d(head.sanctioned_amount)
        committed_paid_total += budget_commitment_repository.committed_total_for_head(db, head.id)
        committed_paid_total += _paid_amount_for_budget_head(db, head.id)
    utilization_pct = float((committed_paid_total / sanctioned_total * 100).quantize(TWO_PLACES)) if sanctioned_total else 0.0

    return {
        "total_payables": float(total_payables.quantize(TWO_PLACES)),
        "overdue_invoice_count": overdue_count,
        "msme_risk_count": msme_risk_count,
        "budget_utilization_pct": utilization_pct,
    }


def dashboard_aging(
    db: Session,
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict[str, Any]]:
    today = _today()
    buckets = {b: {"bucket": b, "count": 0, "amount": Decimal(0)} for b in AGING_BUCKETS}
    for inv in _filtered_unpaid_invoices(db, vendor_id, department, category, date_from, date_to):
        days = max(0, (today - inv.payment_due_date).days)
        bucket = _aging_bucket(days)
        buckets[bucket]["count"] += 1
        buckets[bucket]["amount"] += _estimate_net_payable(db, inv)

    result = []
    for b in AGING_BUCKETS:
        row = buckets[b]
        result.append({"bucket": row["bucket"], "count": row["count"], "amount": float(row["amount"].quantize(TWO_PLACES))})
    return result


def dashboard_spend_by_category(
    db: Session,
    vendor_id: uuid.UUID | None = None,
    department: str | None = None,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict[str, Any]]:
    """Category = the paying vendor's vendor_category (no separate 'spend category'
    concept exists elsewhere in this system). 'department' filters via the invoice's PO's
    budget head department, when the invoice is PO-linked. Period comparison: 'current'
    is the date_from/date_to window (defaults to the current calendar month if omitted),
    'previous' is the immediately preceding window of the same length."""
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    pos_by_id = {po.id: po for po in purchase_order_repository.list_all(db)}
    heads_by_id = {h.id: h for h in budget_head_repository.list_all(db)}

    if date_to is None:
        date_to = _today()
    if date_from is None:
        date_from = date_to.replace(day=1)
    window_days = (date_to - date_from).days + 1
    prev_date_to = date_from - timedelta(days=1)
    prev_date_from = prev_date_to - timedelta(days=window_days - 1)

    confirmed_payments = payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED)
    invoices_by_id = {inv.id: inv for inv in invoice_repository.list_all(db)}

    current_totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    previous_totals: dict[str, Decimal] = defaultdict(lambda: Decimal(0))

    for payment in confirmed_payments:
        invoice = invoices_by_id.get(payment.invoice_id)
        if invoice is None:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        if vendor is None:
            continue
        if vendor_id is not None and vendor.id != vendor_id:
            continue
        if category is not None and vendor.vendor_category.value != category:
            continue
        if department is not None:
            po = pos_by_id.get(invoice.po_id) if invoice.po_id else None
            head = heads_by_id.get(po.budget_head_id) if po else None
            if head is None or head.department != department:
                continue

        pay_date = payment.payment_date
        cat = vendor.vendor_category.value
        if date_from <= pay_date <= date_to:
            current_totals[cat] += _d(payment.net_payable_amount)
        elif prev_date_from <= pay_date <= prev_date_to:
            previous_totals[cat] += _d(payment.net_payable_amount)

    categories = sorted(set(current_totals.keys()) | set(previous_totals.keys()))
    return [
        {
            "category": cat,
            "current_period_amount": float(current_totals[cat].quantize(TWO_PLACES)),
            "previous_period_amount": float(previous_totals[cat].quantize(TWO_PLACES)),
        }
        for cat in categories
    ]


def _paid_amount_for_budget_head(db: Session, budget_head_id: uuid.UUID) -> Decimal:
    pos = [po for po in purchase_order_repository.list_all(db) if po.budget_head_id == budget_head_id]
    po_ids = {po.id for po in pos}
    if not po_ids:
        return Decimal(0)
    invoices = [inv for inv in invoice_repository.list_all(db) if inv.po_id in po_ids]
    invoice_ids = {inv.id for inv in invoices}
    confirmed = payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED)
    return sum((_d(p.net_payable_amount) for p in confirmed if p.invoice_id in invoice_ids), Decimal(0))


# ---------- Reports ----------


def report_vendor_master(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    rows = []
    for vendor in vendor_repository.list_all(db):
        if vendor_id is not None and vendor.id != vendor_id:
            continue
        profile = vendor_portal_service.get_profile_status(db, vendor)
        rows.append(
            {
                "vendor_code": vendor.vendor_code,
                "vendor_name": vendor.vendor_name,
                "vendor_category": vendor.vendor_category.value,
                "msme_status": vendor.msme_status,
                "kyc_status": "Complete" if profile.complete else "Incomplete",
                "tds_section": vendor.tds_section,
            }
        )
    return rows


def report_vendor_compliance_status(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    rows = []
    for vendor in vendor_repository.list_all(db):
        if vendor_id is not None and vendor.id != vendor_id:
            continue
        try:
            validate_pan(vendor.pan)
            pan_status = "Valid"
        except ValueError:
            pan_status = "Invalid"
        profile = vendor_portal_service.get_profile_status(db, vendor)
        rows.append(
            {
                "vendor_code": vendor.vendor_code,
                "vendor_name": vendor.vendor_name,
                "gstin_status": "Present" if vendor.gstin else "Missing",
                "pan_status": pan_status,
                "bank_verified": vendor.ifsc_code.upper() in IFSC_LOOKUP,
                "kyc_status": "Complete" if profile.complete else "Incomplete",
                # No document-expiry field exists anywhere in this system (Phase 2B never
                # captured one) — reported as N/A rather than fabricated.
                "document_expiry": "N/A",
            }
        )
    return rows


def report_invoice_tracker(
    db: Session, vendor_id: uuid.UUID | None = None, date_from: date | None = None, date_to: date | None = None
) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    approvals = invoice_approval_repository.list_all(db)
    approvals_by_invoice: dict[uuid.UUID, list] = defaultdict(list)
    for a in approvals:
        approvals_by_invoice[a.invoice_id].append(a)
    confirmed_by_invoice = {p.invoice_id: p for p in payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED)}

    rows = []
    for invoice in invoice_repository.list_all(db):
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        if date_from is not None and invoice.invoice_date < date_from:
            continue
        if date_to is not None and invoice.invoice_date > date_to:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        stage_times = {ApprovalLevel.L1: None, ApprovalLevel.L2: None, ApprovalLevel.L3: None, ApprovalLevel.L4: None}
        for a in approvals_by_invoice.get(invoice.id, []):
            if a.status == ApprovalStageStatus.COMPLETED and a.action_at is not None:
                stage_times[a.level] = a.action_at
        payment = confirmed_by_invoice.get(invoice.id)
        rows.append(
            {
                "invoice_number": invoice.invoice_number,
                "vendor_name": vendor.vendor_name if vendor else str(invoice.vendor_id),
                "status": invoice.status.value,
                "submitted_at": invoice.created_at.isoformat() if invoice.status != InvoiceStatus.DRAFT else None,
                "l1_completed_at": stage_times[ApprovalLevel.L1].isoformat() if stage_times[ApprovalLevel.L1] else None,
                "l2_completed_at": stage_times[ApprovalLevel.L2].isoformat() if stage_times[ApprovalLevel.L2] else None,
                "l3_completed_at": stage_times[ApprovalLevel.L3].isoformat() if stage_times[ApprovalLevel.L3] else None,
                "l4_completed_at": stage_times[ApprovalLevel.L4].isoformat() if stage_times[ApprovalLevel.L4] else None,
                "paid_at": payment.confirmed_at.isoformat() if payment and payment.confirmed_at else None,
            }
        )
    return rows


_ACTIVE_APPROVAL_STATUSES = {
    InvoiceStatus.L1_VERIFICATION: "L1",
    InvoiceStatus.L2_REVIEW: "L2",
    InvoiceStatus.L3_APPROVAL: "L3",
    InvoiceStatus.L4_FINANCE_APPROVAL: "L4",
}


def report_pending_invoices(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    now = datetime.now(timezone.utc)
    rows = []
    for invoice in invoice_repository.list_all(db):
        if invoice.status in (InvoiceStatus.DRAFT, InvoiceStatus.PAID, InvoiceStatus.REJECTED):
            continue
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        current_stage = _ACTIVE_APPROVAL_STATUSES.get(invoice.status, invoice.status.value)
        days_pending = (now - invoice.created_at).days
        rows.append(
            {
                "invoice_number": invoice.invoice_number,
                "vendor_name": vendor.vendor_name if vendor else str(invoice.vendor_id),
                "amount": float(_d(invoice.total_invoice_amount)),
                "current_stage": current_stage,
                "days_pending": days_pending,
            }
        )
    return rows


def report_payment_register(
    db: Session, vendor_id: uuid.UUID | None = None, date_from: date | None = None, date_to: date | None = None
) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    invoices_by_id = {inv.id: inv for inv in invoice_repository.list_all(db)}
    rows = []
    for payment in payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED):
        invoice = invoices_by_id.get(payment.invoice_id)
        if invoice is None:
            continue
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        if date_from is not None and payment.payment_date < date_from:
            continue
        if date_to is not None and payment.payment_date > date_to:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        rows.append(
            {
                "payment_date": payment.payment_date.isoformat(),
                "vendor_name": vendor.vendor_name if vendor else str(invoice.vendor_id),
                "invoice_number": invoice.invoice_number,
                "gross_amount": float(_d(payment.gross_amount)),
                "tds_amount": float(_d(payment.tds_amount)),
                "net_paid": float(_d(payment.net_payable_amount)),
                "utr_reference": payment.utr_reference,
            }
        )
    return rows


def report_tds_summary(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    invoices_by_id = {inv.id: inv for inv in invoice_repository.list_all(db)}
    totals: dict[tuple, dict[str, Any]] = {}
    for payment in payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED):
        invoice = invoices_by_id.get(payment.invoice_id)
        if invoice is None:
            continue
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        if vendor is None:
            continue
        key = (vendor.id, payment.tds_section)
        if key not in totals:
            totals[key] = {
                "vendor_name": vendor.vendor_name,
                "pan": vendor.pan,
                "tds_section": payment.tds_section,
                "gross_amount": Decimal(0),
                "tds_amount": Decimal(0),
            }
        totals[key]["gross_amount"] += _d(payment.gross_amount)
        totals[key]["tds_amount"] += _d(payment.tds_amount)

    rows = []
    for row in totals.values():
        rows.append(
            {
                "vendor_name": row["vendor_name"],
                "pan": row["pan"],
                "tds_section": row["tds_section"],
                "gross_amount": float(row["gross_amount"].quantize(TWO_PLACES)),
                "tds_amount": float(row["tds_amount"].quantize(TWO_PLACES)),
            }
        )
    return rows


def _calendar_quarter_label(d: date) -> str:
    # Stub simplification (Section 2's "data-only" carve-out for Form 26Q/16A): a
    # calendar quarter, not the Indian FY quarter a real Form 16A would use.
    q = (d.month - 1) // 3 + 1
    return f"Q{q}-{d.year}"


def report_form16a_data(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    invoices_by_id = {inv.id: inv for inv in invoice_repository.list_all(db)}
    totals: dict[tuple, dict[str, Any]] = {}
    for payment in payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED):
        invoice = invoices_by_id.get(payment.invoice_id)
        if invoice is None:
            continue
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        if vendor is None:
            continue
        quarter = _calendar_quarter_label(payment.payment_date)
        key = (vendor.id, quarter)
        if key not in totals:
            totals[key] = {
                "vendor_name": vendor.vendor_name,
                "pan": vendor.pan,
                "quarter": quarter,
                "gross_amount": Decimal(0),
                "tds_amount": Decimal(0),
            }
        totals[key]["gross_amount"] += _d(payment.gross_amount)
        totals[key]["tds_amount"] += _d(payment.tds_amount)

    return [
        {
            "vendor_name": row["vendor_name"],
            "pan": row["pan"],
            "quarter": row["quarter"],
            "gross_amount": float(row["gross_amount"].quantize(TWO_PLACES)),
            "tds_amount": float(row["tds_amount"].quantize(TWO_PLACES)),
        }
        for row in totals.values()
    ]


def report_msme_payment(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    approvals = invoice_approval_repository.list_all(db)
    l4_completed_by_invoice = {}
    for a in approvals:
        if a.level == ApprovalLevel.L4 and a.status == ApprovalStageStatus.COMPLETED and a.action_at is not None:
            l4_completed_by_invoice[a.invoice_id] = a.action_at
    confirmed_by_invoice = {p.invoice_id: p for p in payment_repository.list_by_status(db, PaymentStatus.CHECKER_CONFIRMED)}

    today = _today()
    rows = []
    for invoice in invoice_repository.list_all(db):
        vendor = vendors_by_id.get(invoice.vendor_id)
        if vendor is None or not vendor.msme_status or invoice.payment_due_date is None:
            continue
        if vendor_id is not None and vendor.id != vendor_id:
            continue
        payment = confirmed_by_invoice.get(invoice.id)
        acceptance_dt = l4_completed_by_invoice.get(invoice.id)
        if payment is not None:
            delay = max(0, (payment.payment_date - invoice.payment_due_date).days)
            payment_date_str = payment.payment_date.isoformat()
        elif invoice.payment_due_date < today:
            delay = (today - invoice.payment_due_date).days
            payment_date_str = None
        else:
            delay = 0
            payment_date_str = None

        rows.append(
            {
                "vendor_name": vendor.vendor_name,
                "invoice_date": invoice.invoice_date.isoformat(),
                "acceptance_date": acceptance_dt.date().isoformat() if acceptance_dt else None,
                "due_date": invoice.payment_due_date.isoformat(),
                "payment_date": payment_date_str,
                "delay_days": delay,
            }
        )
    return rows


def report_budget_utilisation(db: Session, department: str | None = None) -> list[dict[str, Any]]:
    rows = []
    for head in budget_head_repository.list_all(db):
        if department is not None and head.department != department:
            continue
        committed = budget_commitment_repository.committed_total_for_head(db, head.id)
        paid = _paid_amount_for_budget_head(db, head.id)
        sanctioned = _d(head.sanctioned_amount)
        rows.append(
            {
                "department": head.department,
                "cost_centre": head.cost_centre,
                "sanctioned": float(sanctioned.quantize(TWO_PLACES)),
                "committed": float(committed.quantize(TWO_PLACES)),
                "paid": float(paid.quantize(TWO_PLACES)),
                "available": float((sanctioned - committed - paid).quantize(TWO_PLACES)),
            }
        )
    return rows


def report_aging_analysis(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    vendors_by_id = {v.id: v for v in vendor_repository.list_all(db)}
    today = _today()
    rows = []
    for invoice in _unpaid_approved_invoices(db):
        if vendor_id is not None and invoice.vendor_id != vendor_id:
            continue
        vendor = vendors_by_id.get(invoice.vendor_id)
        overdue_days = max(0, (today - invoice.payment_due_date).days)
        rows.append(
            {
                "vendor_name": vendor.vendor_name if vendor else str(invoice.vendor_id),
                "invoice_number": invoice.invoice_number,
                "amount": float(_d(invoice.total_invoice_amount)),
                "invoice_date": invoice.invoice_date.isoformat(),
                "aging_bucket": _aging_bucket(overdue_days),
                "overdue_days": overdue_days,
            }
        )
    return rows


def report_vendor_performance(db: Session, vendor_id: uuid.UUID | None = None) -> list[dict[str, Any]]:
    approvals = invoice_approval_repository.list_all(db)
    approvals_by_invoice: dict[uuid.UUID, list] = defaultdict(list)
    for a in approvals:
        approvals_by_invoice[a.invoice_id].append(a)
    queries = invoice_query_repository.list_all(db)
    queries_by_invoice: dict[uuid.UUID, int] = defaultdict(int)
    for q in queries:
        queries_by_invoice[q.invoice_id] += 1

    invoices_by_vendor: dict[uuid.UUID, list] = defaultdict(list)
    for invoice in invoice_repository.list_all(db):
        if invoice.status == InvoiceStatus.DRAFT:
            continue
        invoices_by_vendor[invoice.vendor_id].append(invoice)

    rows = []
    for vendor in vendor_repository.list_all(db):
        if vendor_id is not None and vendor.id != vendor_id:
            continue
        vendor_invoices = invoices_by_vendor.get(vendor.id, [])
        if not vendor_invoices:
            continue

        clean = sum(1 for inv in vendor_invoices if inv.status not in (InvoiceStatus.RETURNED_TO_VENDOR, InvoiceStatus.REJECTED))
        submission_accuracy_pct = round(clean / len(vendor_invoices) * 100, 2)

        completed_stages = 0
        on_time_stages = 0
        for inv in vendor_invoices:
            for a in approvals_by_invoice.get(inv.id, []):
                if a.status == ApprovalStageStatus.COMPLETED and a.action_at is not None:
                    completed_stages += 1
                    if a.action_at <= a.tat_due_at:
                        on_time_stages += 1
        tat_compliance_pct = round(on_time_stages / completed_stages * 100, 2) if completed_stages else None

        total_queries = sum(queries_by_invoice.get(inv.id, 0) for inv in vendor_invoices)
        query_frequency = round(total_queries / len(vendor_invoices), 2)

        rows.append(
            {
                "vendor_name": vendor.vendor_name,
                "submission_accuracy_pct": submission_accuracy_pct,
                "tat_compliance_pct": tat_compliance_pct,
                "query_frequency": query_frequency,
            }
        )
    return rows


def report_approval_tat(db: Session) -> list[dict[str, Any]]:
    approvals = invoice_approval_repository.list_all(db)
    now = datetime.now(timezone.utc)
    by_level: dict[ApprovalLevel, dict[str, Any]] = {
        level: {"total_hours": 0.0, "completed_count": 0, "breach_count": 0, "escalation_count": 0, "roles": set()}
        for level in ApprovalLevel
    }

    for a in approvals:
        if a.status == ApprovalStageStatus.SKIPPED:
            continue
        bucket = by_level[a.level]
        bucket["roles"].add(a.assigned_role)
        if a.status == ApprovalStageStatus.COMPLETED and a.action_at is not None:
            hours = (a.action_at - a.created_at).total_seconds() / 3600
            bucket["total_hours"] += hours
            bucket["completed_count"] += 1
            if a.action_at > a.tat_due_at:
                bucket["breach_count"] += 1
        elif a.status == ApprovalStageStatus.PENDING and not a.tat_paused and a.tat_due_at < now:
            bucket["escalation_count"] += 1

    rows = []
    for level in ApprovalLevel:
        bucket = by_level[level]
        avg_hours = round(bucket["total_hours"] / bucket["completed_count"], 2) if bucket["completed_count"] else None
        rows.append(
            {
                "level": level.value,
                "approver_role": ", ".join(sorted(bucket["roles"])) or None,
                "avg_tat_hours": avg_hours,
                "breach_count": bucket["breach_count"],
                "escalation_count": bucket["escalation_count"],
            }
        )
    return rows
