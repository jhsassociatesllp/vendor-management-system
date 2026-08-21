import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AuditAction


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Purely an internal ordering key for the hash chain (row N's previous_hash must be
    # row N-1's record_hash) — timestamps alone can tie at second-level precision, so this
    # sequence is the actual source of chain order. Not part of the spec's field list but
    # required to implement it correctly. Assigned explicitly by audit_service.log_audit
    # (previous.sequence + 1) rather than a DB identity column, since it must be derived
    # from the same "latest row" lookup already needed for the hash chain anyway.
    sequence: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    user_name_snapshot: Mapped[str | None] = mapped_column(String, nullable=True)
    role_snapshot: Mapped[str | None] = mapped_column(String, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)

    action: Mapped[AuditAction] = mapped_column(SAEnum(AuditAction, name="audit_action"), nullable=False)
    module: Mapped[str] = mapped_column(String, nullable=False)
    record_reference: Mapped[str] = mapped_column(String, nullable=False)
    field_changes: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)

    previous_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    record_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    user: Mapped["User"] = relationship()
