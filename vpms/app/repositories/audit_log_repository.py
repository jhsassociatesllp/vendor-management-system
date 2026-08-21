import uuid
from datetime import date, datetime, time, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction


def get_by_id(db: Session, log_id: uuid.UUID) -> AuditLog | None:
    return db.get(AuditLog, log_id)


def get_latest(db: Session) -> AuditLog | None:
    stmt = select(AuditLog).order_by(AuditLog.sequence.desc()).limit(1)
    return db.scalars(stmt).first()


def list_all_ordered(db: Session) -> list[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.sequence.asc())
    return list(db.scalars(stmt))


def list_filtered(
    db: Session,
    user_id: uuid.UUID | None = None,
    module: str | None = None,
    action: AuditAction | None = None,
    record_reference: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[AuditLog]:
    stmt = select(AuditLog)
    if user_id is not None:
        stmt = stmt.where(AuditLog.user_id == user_id)
    if module is not None:
        stmt = stmt.where(AuditLog.module == module)
    if action is not None:
        stmt = stmt.where(AuditLog.action == action)
    if record_reference is not None:
        stmt = stmt.where(AuditLog.record_reference.ilike(f"%{record_reference}%"))
    if date_from is not None:
        stmt = stmt.where(AuditLog.timestamp >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to is not None:
        stmt = stmt.where(AuditLog.timestamp <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    stmt = stmt.order_by(AuditLog.sequence.desc())
    return list(db.scalars(stmt))


def create(db: Session, log: AuditLog) -> AuditLog:
    db.add(log)
    db.commit()
    db.refresh(log)
    return log
