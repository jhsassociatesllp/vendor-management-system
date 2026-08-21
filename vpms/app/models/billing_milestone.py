import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Numeric, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import MilestoneStatus


class BillingMilestone(Base):
    __tablename__ = "billing_milestones"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    agreement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agreements.id"), nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    percentage_of_contract_value: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    expected_date: Mapped[date] = mapped_column(Date, nullable=False)
    deliverables: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[MilestoneStatus] = mapped_column(
        SAEnum(MilestoneStatus, name="milestone_status"), nullable=False, default=MilestoneStatus.PENDING
    )

    agreement: Mapped["Agreement"] = relationship(back_populates="milestones")
