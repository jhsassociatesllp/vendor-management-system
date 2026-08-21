import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.enums import ApprovalLevel, ApprovalStageStatus
from app.models.invoice_approval import InvoiceApproval


def list_all(db: Session) -> list[InvoiceApproval]:
    return list(db.scalars(select(InvoiceApproval)))


def get_by_id(db: Session, approval_id: uuid.UUID) -> InvoiceApproval | None:
    return db.scalars(
        select(InvoiceApproval).options(joinedload(InvoiceApproval.invoice)).where(InvoiceApproval.id == approval_id)
    ).first()


def list_for_invoice(db: Session, invoice_id: uuid.UUID) -> list[InvoiceApproval]:
    stmt = (
        select(InvoiceApproval)
        .where(InvoiceApproval.invoice_id == invoice_id)
        .order_by(InvoiceApproval.level.asc())
    )
    return list(db.scalars(stmt))


def list_latest_for_invoice(db: Session, invoice_id: uuid.UUID) -> list[InvoiceApproval]:
    """One row per level — the most recently created one.

    A Return_To_Vendor -> vendor resubmit -> fresh route-for-approval cycle creates a
    brand new batch of 4 rows on top of the old (now-stale) ones rather than replacing
    them, since routing never deletes prior rows. For UI display purposes (the workflow
    timeline needs to reflect only the invoice's *current* live approval cycle), this
    dedupes down to the latest row per level.
    """
    rows = list_for_invoice(db, invoice_id)
    latest_by_level: dict[ApprovalLevel, InvoiceApproval] = {}
    for row in rows:
        existing = latest_by_level.get(row.level)
        if existing is None or row.created_at > existing.created_at:
            latest_by_level[row.level] = row
    return [latest_by_level[level] for level in (ApprovalLevel.L1, ApprovalLevel.L2, ApprovalLevel.L3, ApprovalLevel.L4) if level in latest_by_level]


def get_for_invoice_level(db: Session, invoice_id: uuid.UUID, level: ApprovalLevel) -> InvoiceApproval | None:
    stmt = select(InvoiceApproval).where(InvoiceApproval.invoice_id == invoice_id, InvoiceApproval.level == level)
    return db.scalars(stmt).first()


def list_pending_for_role(db: Session, role_name: str) -> list[InvoiceApproval]:
    stmt = (
        select(InvoiceApproval)
        .options(joinedload(InvoiceApproval.invoice))
        .where(InvoiceApproval.assigned_role == role_name, InvoiceApproval.status == ApprovalStageStatus.PENDING)
    )
    return list(db.scalars(stmt).unique())


def list_breached_tat(db: Session, now: datetime) -> list[InvoiceApproval]:
    stmt = (
        select(InvoiceApproval)
        .options(joinedload(InvoiceApproval.invoice))
        .where(
            InvoiceApproval.status == ApprovalStageStatus.PENDING,
            InvoiceApproval.tat_paused.is_(False),
            InvoiceApproval.tat_due_at < now,
        )
    )
    return list(db.scalars(stmt).unique())


def create(db: Session, approval: InvoiceApproval) -> InvoiceApproval:
    db.add(approval)
    db.flush()
    return approval


def save(db: Session, approval: InvoiceApproval) -> InvoiceApproval:
    db.add(approval)
    db.flush()
    return approval
