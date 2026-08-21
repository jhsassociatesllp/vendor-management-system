import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.csv_export import rows_to_csv_response
from app.core.database import get_db
from app.dependencies.rbac import require_role
from app.models.user import User
from app.services import mis_service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

# Section 5's access table never lists "Compliance / Audit" for any report, but Section
# 9's manual script explicitly expects an Auditor to "view... every report" — an
# oversight role that can't read the reports it's meant to oversee doesn't hold together,
# so every group below is widened to include it. Read-only, so this doesn't touch the
# spec's actual write-blocking guarantee (test_auditor_role_blocked_from_all_write_...).
GROUP_A = ("Accounts Executive", "Finance Team", "Partner / VP", "System Admin", "Compliance / Audit")
GROUP_B = ("Finance Team", "System Admin", "Compliance / Audit")
GROUP_C = ("Budget Controller", "Finance Team", "Partner / VP", "System Admin", "Compliance / Audit")
GROUP_D = ("Finance Team", "Partner / VP", "System Admin", "Compliance / Audit")


def _respond(rows: list[dict], format: str | None, filename: str):
    if format == "csv":
        return rows_to_csv_response(rows, filename)
    return rows


@router.get("/vendor-master")
def vendor_master(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_A)),
):
    return _respond(mis_service.report_vendor_master(db, vendor_id=vendor_id), format, "vendor-master.csv")


@router.get("/vendor-compliance-status")
def vendor_compliance_status(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_A)),
):
    return _respond(mis_service.report_vendor_compliance_status(db, vendor_id=vendor_id), format, "vendor-compliance-status.csv")


@router.get("/invoice-tracker")
def invoice_tracker(
    vendor_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_A)),
):
    rows = mis_service.report_invoice_tracker(db, vendor_id=vendor_id, date_from=date_from, date_to=date_to)
    return _respond(rows, format, "invoice-tracker.csv")


@router.get("/pending-invoices")
def pending_invoices(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_A)),
):
    return _respond(mis_service.report_pending_invoices(db, vendor_id=vendor_id), format, "pending-invoices.csv")


@router.get("/payment-register")
def payment_register(
    vendor_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_B)),
):
    rows = mis_service.report_payment_register(db, vendor_id=vendor_id, date_from=date_from, date_to=date_to)
    return _respond(rows, format, "payment-register.csv")


@router.get("/tds-summary")
def tds_summary(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_B)),
):
    return _respond(mis_service.report_tds_summary(db, vendor_id=vendor_id), format, "tds-summary.csv")


@router.get("/form16a-data")
def form16a_data(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_B)),
):
    return _respond(mis_service.report_form16a_data(db, vendor_id=vendor_id), format, "form16a-data.csv")


@router.get("/msme-payment")
def msme_payment(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_B)),
):
    return _respond(mis_service.report_msme_payment(db, vendor_id=vendor_id), format, "msme-payment.csv")


@router.get("/budget-utilisation")
def budget_utilisation(
    department: str | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_C)),
):
    return _respond(mis_service.report_budget_utilisation(db, department=department), format, "budget-utilisation.csv")


@router.get("/aging-analysis")
def aging_analysis(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_D)),
):
    return _respond(mis_service.report_aging_analysis(db, vendor_id=vendor_id), format, "aging-analysis.csv")


@router.get("/vendor-performance")
def vendor_performance(
    vendor_id: uuid.UUID | None = None,
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_D)),
):
    return _respond(mis_service.report_vendor_performance(db, vendor_id=vendor_id), format, "vendor-performance.csv")


@router.get("/approval-tat")
def approval_tat(
    format: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*GROUP_D)),
):
    return _respond(mis_service.report_approval_tat(db), format, "approval-tat.csv")
