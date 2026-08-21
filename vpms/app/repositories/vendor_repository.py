import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.item_code import ItemCode
from app.models.vendor import Vendor
from app.models.vendor_code_sequence import VendorCodeSequence
from app.models.vendor_item_code import VendorItemCode


def get_by_id(db: Session, vendor_id: uuid.UUID) -> Vendor | None:
    return db.get(Vendor, vendor_id)


def get_by_source_request_id(db: Session, source_request_id: uuid.UUID) -> Vendor | None:
    return db.scalars(select(Vendor).where(Vendor.source_request_id == source_request_id)).first()


def find_active_by_pan_or_gstin(db: Session, pan: str, gstin: str | None) -> Vendor | None:
    match_condition = Vendor.pan == pan
    if gstin:
        match_condition = match_condition | (Vendor.gstin == gstin)

    stmt = select(Vendor).where(Vendor.is_active.is_(True), match_condition)
    return db.scalars(stmt).first()


def list_all(db: Session) -> list[Vendor]:
    return list(db.scalars(select(Vendor).order_by(Vendor.created_at.desc())))


def create(db: Session, vendor: Vendor) -> Vendor:
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


def save(db: Session, vendor: Vendor) -> Vendor:
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


def next_vendor_code(db: Session, year: int) -> str:
    """Atomically increments and returns the next vendor code for `year`.
    Backed by its own table so a deactivated vendor never frees up a sequence number."""
    sequence_row = db.get(VendorCodeSequence, year, with_for_update=True)
    if sequence_row is None:
        sequence_row = VendorCodeSequence(year=year, last_sequence=0)
        db.add(sequence_row)
        db.flush()

    sequence_row.last_sequence += 1
    db.flush()
    return f"VND-{year}-{sequence_row.last_sequence:04d}"


def get_link(db: Session, vendor_id: uuid.UUID, item_code_id: uuid.UUID) -> VendorItemCode | None:
    return db.get(VendorItemCode, {"vendor_id": vendor_id, "item_code_id": item_code_id})


def create_link(db: Session, vendor_id: uuid.UUID, item_code_id: uuid.UUID) -> VendorItemCode:
    link = VendorItemCode(vendor_id=vendor_id, item_code_id=item_code_id, is_active=True)
    db.add(link)
    db.flush()
    return link


def list_links_for_vendor(db: Session, vendor_id: uuid.UUID) -> list[VendorItemCode]:
    stmt = select(VendorItemCode).where(VendorItemCode.vendor_id == vendor_id)
    return list(db.scalars(stmt))


def list_active_item_codes_for_vendor(db: Session, vendor_id: uuid.UUID) -> list[ItemCode]:
    stmt = (
        select(ItemCode)
        .join(VendorItemCode, VendorItemCode.item_code_id == ItemCode.id)
        .where(VendorItemCode.vendor_id == vendor_id, VendorItemCode.is_active.is_(True))
    )
    return list(db.scalars(stmt))
