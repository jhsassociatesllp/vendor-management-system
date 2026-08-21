from sqlalchemy import Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AgreementCodeSequence(Base):
    """Tracks the next agreement-number sequence per year, mirroring VendorCodeSequence
    so a terminated/expired agreement never frees up its sequence number."""

    __tablename__ = "agreement_code_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
