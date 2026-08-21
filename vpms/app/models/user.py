import uuid

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Phase 2B: set only for role=Vendor users, links the portal login to its vendor record.
    # use_alter=True: vendors -> vendor_requests -> users -> vendors would otherwise be an
    # unresolvable FK cycle for CREATE/DROP ordering, so this constraint is applied via a
    # separate ALTER TABLE instead of inline with CREATE TABLE.
    linked_vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vendors.id", use_alter=True, name="fk_users_linked_vendor_id"),
        nullable=True,
    )
    # Phase 2B: incremented on each successful vendor-portal login; embedded in JWTs to
    # enforce a single active session (any older token's embedded value stops matching).
    session_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    role: Mapped["Role"] = relationship(back_populates="users")
