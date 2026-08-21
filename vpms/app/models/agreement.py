import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Column, Date, ForeignKey, Integer, Numeric, String, Table, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy import DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AgreementStatus, BillingFrequency, PORequirement

agreement_item_codes = Table(
    "agreement_item_codes",
    Base.metadata,
    Column("agreement_id", UUID(as_uuid=True), ForeignKey("agreements.id"), primary_key=True),
    Column("item_code_id", UUID(as_uuid=True), ForeignKey("item_codes.id"), primary_key=True),
)


class Agreement(Base):
    __tablename__ = "agreements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    agreement_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), nullable=False)

    scope_of_work: Mapped[str] = mapped_column(Text, nullable=False)
    supporting_document_url: Mapped[str] = mapped_column(String, nullable=False)

    billing_frequency: Mapped[BillingFrequency] = mapped_column(
        SAEnum(BillingFrequency, name="billing_frequency"), nullable=False
    )
    agreement_start_date: Mapped[date] = mapped_column(Date, nullable=False)
    agreement_end_date: Mapped[date] = mapped_column(Date, nullable=False)
    auto_renewal_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    po_requirement: Mapped[PORequirement] = mapped_column(
        SAEnum(PORequirement, name="po_requirement"), nullable=False
    )
    credit_period_days: Mapped[int] = mapped_column(Integer, nullable=False)

    tds_section: Mapped[str] = mapped_column(String, nullable=False)
    tds_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    gst_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    reverse_charge_flag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    approved_by_designation: Mapped[str] = mapped_column(String, nullable=False)

    status: Mapped[AgreementStatus] = mapped_column(
        SAEnum(AgreementStatus, name="agreement_status"), nullable=False, default=AgreementStatus.ACTIVE
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    vendor: Mapped["Vendor"] = relationship()
    covered_item_codes: Mapped[list["ItemCode"]] = relationship(secondary=agreement_item_codes)
    rate_cards: Mapped[list["RateCard"]] = relationship(back_populates="agreement")
    milestones: Mapped[list["BillingMilestone"]] = relationship(back_populates="agreement")
