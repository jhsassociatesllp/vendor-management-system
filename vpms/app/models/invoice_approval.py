import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ApprovalLevel, ApprovalStageStatus


class InvoiceApproval(Base):
    __tablename__ = "invoice_approvals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)
    level: Mapped[ApprovalLevel] = mapped_column(SAEnum(ApprovalLevel, name="approval_level"), nullable=False)
    assigned_role: Mapped[str] = mapped_column(String, nullable=False)

    status: Mapped[ApprovalStageStatus] = mapped_column(
        SAEnum(ApprovalStageStatus, name="approval_stage_status"),
        nullable=False,
        default=ApprovalStageStatus.PENDING,
    )

    action_taken_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)

    tat_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tat_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice: Mapped["Invoice"] = relationship()
