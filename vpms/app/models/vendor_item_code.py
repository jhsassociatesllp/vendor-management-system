import uuid

from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class VendorItemCode(Base):
    __tablename__ = "vendor_item_codes"

    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id"), primary_key=True)
    item_code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("item_codes.id"), primary_key=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    vendor: Mapped["Vendor"] = relationship(back_populates="item_code_links")
    item_code: Mapped["ItemCode"] = relationship(back_populates="vendor_links")
