import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PurchaseOrderStatus


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    po_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    item_code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("item_codes.id"), nullable=False)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agreements.id"), nullable=False)

    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String, nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    rate_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    po_value_excl_gst: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    gst_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_po_value_incl_gst: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    budget_head_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("budget_heads.id"), nullable=False)

    delivery_completion_date: Mapped[date] = mapped_column(Date, nullable=False)
    po_validity_date: Mapped[date] = mapped_column(Date, nullable=False)
    po_date: Mapped[date] = mapped_column(Date, nullable=False)

    status: Mapped[PurchaseOrderStatus] = mapped_column(
        SAEnum(PurchaseOrderStatus, name="purchase_order_status"),
        nullable=False,
        default=PurchaseOrderStatus.PENDING_APPROVAL,
    )
    vendor_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    over_budget_justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor: Mapped["Vendor"] = relationship()
    item_code: Mapped["ItemCode"] = relationship()
    agreement: Mapped["Agreement"] = relationship()
    budget_head: Mapped["BudgetHead"] = relationship()
