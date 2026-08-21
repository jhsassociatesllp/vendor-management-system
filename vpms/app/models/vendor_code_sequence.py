from sqlalchemy import Integer

from app.core.database import Base
from sqlalchemy.orm import Mapped, mapped_column


class VendorCodeSequence(Base):
    """Tracks the next vendor-code sequence number per year, independent of the
    `vendors` table so a deactivated vendor never frees up its sequence number."""

    __tablename__ = "vendor_code_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
