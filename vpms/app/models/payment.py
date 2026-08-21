import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PaymentMode, PaymentStatus


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id"), nullable=False)

    gross_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tds_section: Mapped[str] = mapped_column(String, nullable=False)
    tds_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    tds_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    net_payable_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    payment_mode: Mapped[PaymentMode] = mapped_column(SAEnum(PaymentMode, name="payment_mode"), nullable=False)
    company_bank_account: Mapped[str] = mapped_column(String, nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    utr_reference: Mapped[str] = mapped_column(String, nullable=False)
    itc_eligible: Mapped[bool] = mapped_column(Boolean, nullable=False)

    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"), nullable=False, default=PaymentStatus.MAKER_RECORDED
    )

    initiated_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    initiated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    confirmed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Section 5.8: calculated flag only, not an automatic deduction/payment action.
    late_payment_interest_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_late: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    invoice: Mapped["Invoice"] = relationship()
