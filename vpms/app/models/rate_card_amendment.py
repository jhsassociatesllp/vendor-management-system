import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AmendmentStatus


class RateCardAmendment(Base):
    __tablename__ = "rate_card_amendments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    rate_card_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("rate_cards.id"), nullable=False)
    proposed_rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[AmendmentStatus] = mapped_column(
        SAEnum(AmendmentStatus, name="amendment_status"), nullable=False, default=AmendmentStatus.PENDING
    )

    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    rate_card: Mapped["RateCard"] = relationship()
