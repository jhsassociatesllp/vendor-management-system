import hashlib
import json
from datetime import datetime, timezone
from enum import Enum

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.enums import AuditAction
from app.models.user import User
from app.repositories import audit_log_repository
from app.schemas.audit_log import IntegrityCheckBreak, IntegrityCheckResult

GENESIS_HASH = "0" * 64


def _row_content(
    timestamp: datetime,
    user_id,
    user_name_snapshot: str | None,
    role_snapshot: str | None,
    ip_address: str | None,
    action,
    module: str,
    record_reference: str,
    field_changes: list[dict] | None,
    session_id: str | None,
) -> str:
    action_value = action.value if isinstance(action, AuditAction) else str(action)
    return "|".join(
        [
            timestamp.isoformat(),
            str(user_id) if user_id else "",
            user_name_snapshot or "",
            role_snapshot or "",
            ip_address or "",
            action_value,
            module,
            record_reference,
            json.dumps(field_changes, sort_keys=True, default=str) if field_changes else "",
            session_id or "",
        ]
    )


def _compute_hash(content: str, previous_hash: str) -> str:
    return hashlib.sha256((content + previous_hash).encode("utf-8")).hexdigest()


def log_audit(
    db: Session,
    *,
    action: AuditAction,
    module: str,
    record_reference: str,
    user: User | None = None,
    user_name_snapshot: str | None = None,
    role_snapshot: str | None = None,
    field_changes: list[dict] | None = None,
    request: Request | None = None,
    session_id: str | None = None,
) -> AuditLog:
    """The one shared entry point for writing an audit_logs row (Section 4.1 of the
    Phase 5 spec). Every retrofitted write endpoint calls this exactly once."""
    now = datetime.now(timezone.utc)
    resolved_user_id = user.id if user is not None else None
    resolved_name = user_name_snapshot if user_name_snapshot is not None else (user.name if user is not None else None)
    resolved_role = role_snapshot if role_snapshot is not None else (user.role.name if user is not None else None)
    ip_address = request.client.host if request is not None and request.client is not None else None

    previous = audit_log_repository.get_latest(db)
    previous_hash = previous.record_hash if previous is not None else GENESIS_HASH
    next_sequence = (previous.sequence + 1) if previous is not None else 1

    content = _row_content(
        now, resolved_user_id, resolved_name, resolved_role, ip_address, action, module, record_reference, field_changes, session_id
    )
    record_hash = _compute_hash(content, previous_hash)

    log = AuditLog(
        sequence=next_sequence,
        timestamp=now,
        user_id=resolved_user_id,
        user_name_snapshot=resolved_name,
        role_snapshot=resolved_role,
        ip_address=ip_address,
        action=action,
        module=module,
        record_reference=record_reference,
        field_changes=field_changes,
        session_id=session_id,
        previous_hash=previous_hash,
        record_hash=record_hash,
    )
    return audit_log_repository.create(db, log)


def model_to_dict(obj) -> dict:
    """Flat dict of an ORM instance's column values — used to snapshot a record before
    and after a service call so `diff_fields` can build the Update field_changes list
    without every retrofit site hand-picking which fields to compare."""
    if obj is None:
        return {}
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def _stringify(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, Enum):
        return value.value
    return str(value)


def diff_fields(before: dict, after: dict) -> list[dict]:
    changes = []
    for key in sorted(set(before.keys()) | set(after.keys())):
        old_value = _stringify(before.get(key))
        new_value = _stringify(after.get(key))
        if old_value != new_value:
            changes.append({"field": key, "old_value": old_value, "new_value": new_value})
    return changes


def list_logs(
    db: Session,
    user_id=None,
    module: str | None = None,
    action: AuditAction | None = None,
    record_reference: str | None = None,
    date_from=None,
    date_to=None,
) -> list[AuditLog]:
    return audit_log_repository.list_filtered(
        db,
        user_id=user_id,
        module=module,
        action=action,
        record_reference=record_reference,
        date_from=date_from,
        date_to=date_to,
    )


class AuditLogNotFoundError(Exception):
    pass


def get_log(db: Session, log_id) -> AuditLog:
    log = audit_log_repository.get_by_id(db, log_id)
    if log is None:
        raise AuditLogNotFoundError("Audit log entry not found")
    return log


def check_integrity(db: Session) -> IntegrityCheckResult:
    rows = audit_log_repository.list_all_ordered(db)
    breaks: list[IntegrityCheckBreak] = []
    previous_hash = GENESIS_HASH

    for row in rows:
        content = _row_content(
            row.timestamp,
            row.user_id,
            row.user_name_snapshot,
            row.role_snapshot,
            row.ip_address,
            row.action,
            row.module,
            row.record_reference,
            row.field_changes,
            row.session_id,
        )
        expected_hash = _compute_hash(content, previous_hash)
        if expected_hash != row.record_hash or row.previous_hash != previous_hash:
            breaks.append(
                IntegrityCheckBreak(id=row.id, sequence=row.sequence, expected_hash=expected_hash, stored_hash=row.record_hash)
            )
        # Chain continuity for the *next* row is carried via this row's own stored hash
        # (not the freshly recomputed one) — that way a single tampered row is pinpointed
        # exactly, instead of cascading a false "broken" flag onto every row after it.
        previous_hash = row.record_hash

    return IntegrityCheckResult(rows_checked=len(rows), clean=len(breaks) == 0, breaks=breaks)
