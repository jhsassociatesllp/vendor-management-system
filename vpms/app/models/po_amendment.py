import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import POAmendmentStatus


class POAmendment(Base):
    __tablename__ = "po_amendments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    po_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=False)

    previous_quantity: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    previous_rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    previous_delivery_date: Mapped[date] = mapped_column(Date, nullable=False)

    new_quantity: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    new_rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    new_delivery_date: Mapped[date] = mapped_column(Date, nullable=False)

    reason: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[POAmendmentStatus] = mapped_column(
        SAEnum(POAmendmentStatus, name="po_amendment_status"),
        nullable=False,
        default=POAmendmentStatus.PENDING_APPROVAL,
    )

    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    purchase_order: Mapped["PurchaseOrder"] = relationship()
