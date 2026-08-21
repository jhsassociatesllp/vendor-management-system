import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DoaMatrix(Base):
    """Configurable amount-slab routing matrix (SRS §2.2's indicative table)."""

    __tablename__ = "doa_matrix"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    min_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    max_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    requires_l2: Mapped[bool] = mapped_column(Boolean, nullable=False)
    requires_l3: Mapped[bool] = mapped_column(Boolean, nullable=False)

    l1_role: Mapped[str] = mapped_column(String, nullable=False, default="Accounts Executive")
    l2_role: Mapped[str | None] = mapped_column(String, nullable=True)
    l3_role: Mapped[str | None] = mapped_column(String, nullable=True)
    l4_role: Mapped[str] = mapped_column(String, nullable=False)

    l1_tat_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    l2_tat_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    l3_tat_days: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    l4_tat_days: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
