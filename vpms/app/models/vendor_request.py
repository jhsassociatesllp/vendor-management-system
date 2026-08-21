import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import VendorRequestStatus


class VendorRequest(Base):
    __tablename__ = "vendor_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    business_need: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String, nullable=False)
    estimated_annual_spend: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    recommended_vendor_name: Mapped[str] = mapped_column(String, nullable=False)
    recommended_pan: Mapped[str] = mapped_column(String(10), nullable=False)
    recommended_gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)

    financial_stability_ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    technical_capability_ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    compliance_status_ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    blacklist_check_ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    conflict_of_interest_declared: Mapped[bool] = mapped_column(Boolean, nullable=False)
    references_provided: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    msme_udyam_number: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[VendorRequestStatus] = mapped_column(
        SAEnum(VendorRequestStatus, name="vendor_request_status"),
        nullable=False,
        default=VendorRequestStatus.SUBMITTED,
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    accounts_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    accounts_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    partner_decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    partner_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    requester: Mapped["User"] = relationship(foreign_keys=[requested_by])
    vendor: Mapped["Vendor | None"] = relationship(back_populates="source_request", uselist=False)
