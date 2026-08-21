import re

PAN_PATTERN = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$")
MOBILE_PATTERN = re.compile(r"^[0-9]{10}$")
IFSC_PATTERN = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")


def validate_pan(value: str) -> str:
    if not PAN_PATTERN.match(value):
        raise ValueError("Invalid PAN format, expected e.g. ABCDE1234F")
    return value


def validate_gstin(value: str) -> str:
    if not GSTIN_PATTERN.match(value):
        raise ValueError("Invalid GSTIN format")
    return value


def validate_mobile(value: str) -> str:
    if not MOBILE_PATTERN.match(value):
        raise ValueError("Mobile number must be exactly 10 digits")
    return value


def validate_ifsc(value: str) -> str:
    if not IFSC_PATTERN.match(value):
        raise ValueError("Invalid IFSC format, expected e.g. HDFC0001234")
    return value
