import logging
from decimal import Decimal

from app.models.enums import VendorCategory

logger = logging.getLogger("vpms.stubs")

# Section 5.4: stubbed IFSC -> bank name/branch lookup. Not a real bank API.
IFSC_LOOKUP: dict[str, tuple[str, str]] = {
    "HDFC0001234": ("HDFC Bank", "Nariman Point"),
    "ICIC0001111": ("ICICI Bank", "Andheri East"),
    "SBIN0000300": ("State Bank of India", "Connaught Place"),
    "AXIS0000456": ("Axis Bank", "Bandra Kurla Complex"),
    "PUNB0222200": ("Punjab National Bank", "Karol Bagh"),
    "KKBK0000958": ("Kotak Mahindra Bank", "MG Road"),
}
_UNKNOWN_BANK = ("Bank Not Found (Stub)", "NA")


def lookup_bank_details(ifsc_code: str) -> tuple[str, str]:
    return IFSC_LOOKUP.get(ifsc_code.upper(), _UNKNOWN_BANK)


# Rough TDS section auto-suggestion by vendor category, per Section 3.2 note.
# Overridable at vendor creation time via tds_section_override + reason.
TDS_SECTION_BY_CATEGORY: dict[VendorCategory, str] = {
    VendorCategory.PROFESSIONAL: "194J",
    VendorCategory.SERVICE: "194C",
    VendorCategory.GOODS_SUPPLIER: "194Q",
    VendorCategory.RECURRING: "194C",
}


def suggest_tds_section(vendor_category: VendorCategory) -> str:
    return TDS_SECTION_BY_CATEGORY[vendor_category]


# Phase 4B, Section 5.3: default TDS rate by section. No real rate-table data source
# exists in this system, so this is a stub keyed by the same section codes used by
# TDS_SECTION_BY_CATEGORY above. Overridable per-payment via tds_section/tds_rate + reason.
TDS_RATE_BY_SECTION: dict[str, Decimal] = {
    "194C": Decimal("2.00"),
    "194J": Decimal("10.00"),
    "194Q": Decimal("0.10"),
}
_DEFAULT_TDS_RATE = Decimal("10.00")


def suggest_tds_rate(tds_section: str) -> Decimal:
    return TDS_RATE_BY_SECTION.get(tds_section, _DEFAULT_TDS_RATE)


def send_activation_notification(email: str, mobile_number: str, vendor_code: str) -> None:
    # Section 5.6: stub only, no real email/SMS gateway in this phase.
    logger.info(
        "Notification stub: vendor %s activated, would notify email=%s mobile=%s",
        vendor_code,
        email,
        mobile_number,
    )
