import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import InvoiceStatus


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    invoice_number: Mapped[str] = mapped_column(Text, nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)
    po_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("purchase_orders.id"), nullable=True)
    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agreements.id"), nullable=False)
    item_code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("item_codes.id"), nullable=False)

    invoice_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    taxable_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    cgst_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    sgst_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    igst_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_gst_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    total_invoice_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    period_service_from: Mapped[date] = mapped_column(Date, nullable=False)
    period_service_to: Mapped[date] = mapped_column(Date, nullable=False)

    billing_milestone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("billing_milestones.id"), nullable=True
    )
    work_description: Mapped[str] = mapped_column(Text, nullable=False)

    rate_variance_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    gst_mismatch_delta: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    msme_alert_triggered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    status: Mapped[InvoiceStatus] = mapped_column(
        SAEnum(InvoiceStatus, name="invoice_status"), nullable=False, default=InvoiceStatus.DRAFT
    )

    # Phase 4A: set once the invoice is routed into the approval workflow.
    doa_matrix_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("doa_matrix.id"), nullable=True
    )

    # Phase 4B: computed once, when status becomes Approved_For_Payment (Section 5.5).
    payment_due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor: Mapped["Vendor"] = relationship()
    purchase_order: Mapped["PurchaseOrder"] = relationship()
    agreement: Mapped["Agreement"] = relationship()
    item_code: Mapped["ItemCode"] = relationship()
    billing_milestone: Mapped["BillingMilestone"] = relationship()
