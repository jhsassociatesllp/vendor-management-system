import uuid
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import BudgetPeriodType


class BudgetHead(Base):
    __tablename__ = "budget_heads"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    department: Mapped[str] = mapped_column(String, nullable=False)
    cost_centre: Mapped[str] = mapped_column(String, nullable=False)
    period_type: Mapped[BudgetPeriodType] = mapped_column(
        SAEnum(BudgetPeriodType, name="budget_period_type"), nullable=False
    )
    period_label: Mapped[str] = mapped_column(String, nullable=False)
    sanctioned_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
