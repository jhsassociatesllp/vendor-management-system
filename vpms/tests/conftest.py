import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models.doa_matrix import DoaMatrix
from app.models.enums import VendorCategory, VendorRequestStatus
from app.models.item_code import ItemCode
from app.models.role import Role
from app.models.user import User
from app.models.vendor import Vendor
from app.models.vendor_request import VendorRequest

TEST_DATABASE_URL = settings.database_url.rsplit("/", 1)[0] + "/vpms_v2_test"

engine = create_engine(TEST_DATABASE_URL)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

ROLE_NAMES = [
    "Vendor",
    "Accounts Executive",
    "Budget Controller",
    "Dept. Manager",
    "Partner / VP",
    "Finance Team",
    "Compliance / Audit",
    "System Admin",
]

SEED_USERS = [
    {"name": "Accounts User", "email": "accounts@test.com", "password": "password123", "role": "Accounts Executive"},
    {"name": "Vendor User", "email": "vendor@test.com", "password": "password123", "role": "Vendor"},
    {"name": "Dept Manager User", "email": "deptmanager@test.com", "password": "password123", "role": "Dept. Manager"},
    {"name": "Partner User", "email": "partner@test.com", "password": "password123", "role": "Partner / VP"},
    {"name": "Admin User", "email": "admin@test.com", "password": "password123", "role": "System Admin"},
    {
        "name": "Budget Controller User",
        "email": "budgetcontroller@test.com",
        "password": "password123",
        "role": "Budget Controller",
    },
    {"name": "Finance User", "email": "finance@test.com", "password": "password123", "role": "Finance Team"},
    {"name": "Finance User 2", "email": "finance2@test.com", "password": "password123", "role": "Finance Team"},
    {"name": "Auditor User", "email": "auditor@test.com", "password": "password123", "role": "Compliance / Audit"},
]

# SRS §2.2's four indicative amount slabs. l4_role uses "Finance Team" throughout since
# that's the only Finance-ish role actually seeded (see README's Phase 4A flagged notes).
DOA_MATRIX_SEED = [
    {
        "min_amount": "0.00",
        "max_amount": "50000.00",
        "requires_l2": False,
        "requires_l3": False,
        "l2_role": None,
        "l3_role": None,
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "50000.01",
        "max_amount": "200000.00",
        "requires_l2": True,
        "requires_l3": False,
        "l2_role": "Dept. Manager",
        "l3_role": None,
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "200000.01",
        "max_amount": "1000000.00",
        "requires_l2": True,
        "requires_l3": True,
        "l2_role": "Dept. Manager",
        "l3_role": "Partner / VP",
        "l4_role": "Finance Team",
    },
    {
        "min_amount": "1000000.01",
        "max_amount": None,
        "requires_l2": True,
        "requires_l3": True,
        "l2_role": "Dept. Manager",
        "l3_role": "Partner / VP",
        "l4_role": "Finance Team",
    },
]

EXISTING_VENDOR_PAN = "AAAAA1111A"
EXISTING_VENDOR_GSTIN = "27AAAAA1111A1Z5"
SECOND_VENDOR_PAN = "BBBBB2222B"


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()

    roles_by_name = {}
    for role_name in ROLE_NAMES:
        role = Role(name=role_name)
        db.add(role)
        db.flush()
        roles_by_name[role_name] = role

    users_by_email = {}
    for entry in SEED_USERS:
        user = User(
            name=entry["name"],
            email=entry["email"],
            hashed_password=hash_password(entry["password"]),
            role_id=roles_by_name[entry["role"]].id,
            is_active=True,
        )
        db.add(user)
        db.flush()
        users_by_email[entry["email"]] = user

    # A pre-existing active vendor, used to exercise the duplicate PAN/GSTIN check.
    existing_request = VendorRequest(
        requested_by=users_by_email["deptmanager@test.com"].id,
        business_need="Pre-existing vendor for duplicate-check tests",
        category="Supply",
        estimated_annual_spend=100000,
        recommended_vendor_name="Existing Vendor Co",
        recommended_pan=EXISTING_VENDOR_PAN,
        recommended_gstin=EXISTING_VENDOR_GSTIN,
        financial_stability_ok=True,
        technical_capability_ok=True,
        compliance_status_ok=True,
        blacklist_check_ok=True,
        conflict_of_interest_declared=True,
        references_provided=True,
        status=VendorRequestStatus.APPROVED,
    )
    db.add(existing_request)
    db.flush()

    existing_vendor = Vendor(
        vendor_code="VND-2000-9999",
        source_request_id=existing_request.id,
        vendor_name="Existing Vendor Co",
        pan=EXISTING_VENDOR_PAN,
        gstin=EXISTING_VENDOR_GSTIN,
        msme_status=False,
        vendor_category=VendorCategory.SERVICE,
        tds_section="194C",
        tds_section_overridden=False,
        bank_account_no="000111222333",
        ifsc_code="HDFC0001234",
        bank_name="HDFC Bank",
        bank_branch="Nariman Point",
        cancelled_cheque_doc_url="/stub/cheque.pdf",
        address="123 Test Street",
        email="existing-vendor@test.com",
        mobile_number="9000000000",
        is_active=True,
    )
    db.add(existing_vendor)
    db.flush()

    # A second pre-existing active vendor, used for the "vendor A can't act on vendor B"
    # cross-vendor authorization checks in Phase 2B.
    second_request = VendorRequest(
        requested_by=users_by_email["deptmanager@test.com"].id,
        business_need="Second pre-existing vendor for cross-vendor checks",
        category="Supply",
        estimated_annual_spend=50000,
        recommended_vendor_name="Second Vendor Co",
        recommended_pan=SECOND_VENDOR_PAN,
        financial_stability_ok=True,
        technical_capability_ok=True,
        compliance_status_ok=True,
        blacklist_check_ok=True,
        conflict_of_interest_declared=True,
        references_provided=True,
        status=VendorRequestStatus.APPROVED,
    )
    db.add(second_request)
    db.flush()

    second_vendor = Vendor(
        vendor_code="VND-2000-9998",
        source_request_id=second_request.id,
        vendor_name="Second Vendor Co",
        pan=SECOND_VENDOR_PAN,
        gstin=None,
        msme_status=False,
        vendor_category=VendorCategory.SERVICE,
        tds_section="194C",
        tds_section_overridden=False,
        bank_account_no="000444555666",
        ifsc_code="ICIC0001111",
        bank_name="ICICI Bank",
        bank_branch="Andheri East",
        cancelled_cheque_doc_url="/stub/cheque2.pdf",
        address="456 Test Avenue",
        email="second-vendor@test.com",
        mobile_number="9000000001",
        is_active=True,
    )
    db.add(second_vendor)
    db.flush()

    existing_item_code = ItemCode(
        category="Consulting",
        sub_category="Advisory",
        description="Strategy advisory",
        unit="hour",
        default_rate=1000,
        is_active=True,
    )
    db.add(existing_item_code)

    for row in DOA_MATRIX_SEED:
        db.add(DoaMatrix(l1_role="Accounts Executive", l1_tat_days=1, l2_tat_days=2, l3_tat_days=2, l4_tat_days=1, **row))

    db.commit()
    db.close()

    yield

    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def login_as(client):
    def _login(email: str, password: str = "password123") -> dict[str, str]:
        response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
        token = response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _login


@pytest.fixture()
def existing_vendor_id() -> str:
    db = TestingSessionLocal()
    try:
        vendor = db.query(Vendor).filter(Vendor.pan == EXISTING_VENDOR_PAN).one()
        return str(vendor.id)
    finally:
        db.close()


@pytest.fixture()
def second_vendor_id() -> str:
    db = TestingSessionLocal()
    try:
        vendor = db.query(Vendor).filter(Vendor.pan == SECOND_VENDOR_PAN).one()
        return str(vendor.id)
    finally:
        db.close()


@pytest.fixture()
def existing_item_code_id() -> str:
    db = TestingSessionLocal()
    try:
        item_code = db.query(ItemCode).filter(ItemCode.description == "Strategy advisory").one()
        return str(item_code.id)
    finally:
        db.close()
