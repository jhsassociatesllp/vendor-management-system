import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Numeric, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import PricingType


class RateCard(Base):
    __tablename__ = "rate_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agreements.id"), nullable=False)
    item_code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("item_codes.id"), nullable=False)

    pricing_type: Mapped[PricingType] = mapped_column(SAEnum(PricingType, name="pricing_type"), nullable=False)
    rate: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    agreement: Mapped["Agreement"] = relationship(back_populates="rate_cards")
    item_code: Mapped["ItemCode"] = relationship()
