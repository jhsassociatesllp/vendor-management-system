from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class POCodeSequence(Base):
    """Tracks the next PO-number sequence per year, mirroring VendorCodeSequence/
    AgreementCodeSequence so a cancelled/rejected PO never frees up its number."""

    __tablename__ = "po_code_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
