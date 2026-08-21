import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import VendorCategory


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    vendor_code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    source_request_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendor_requests.id"), unique=True, nullable=False
    )

    vendor_name: Mapped[str] = mapped_column(String, nullable=False)
    pan: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)

    msme_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    udyam_number: Mapped[str | None] = mapped_column(String, nullable=True)

    vendor_category: Mapped[VendorCategory] = mapped_column(
        SAEnum(VendorCategory, name="vendor_category"), nullable=False
    )
    tds_section: Mapped[str] = mapped_column(String, nullable=False)
    tds_section_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tds_section_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    bank_account_no: Mapped[str] = mapped_column(String, nullable=False)
    ifsc_code: Mapped[str] = mapped_column(String(11), nullable=False)
    bank_name: Mapped[str] = mapped_column(String, nullable=False)
    bank_branch: Mapped[str] = mapped_column(String, nullable=False)

    cancelled_cheque_doc_url: Mapped[str] = mapped_column(String, nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(String, nullable=False)
    mobile_number: Mapped[str] = mapped_column(String(10), nullable=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    source_request: Mapped["VendorRequest"] = relationship(back_populates="vendor")
    item_code_links: Mapped[list["VendorItemCode"]] = relationship(back_populates="vendor")
