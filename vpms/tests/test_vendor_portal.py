import uuid
from datetime import datetime, timedelta, timezone

from app.models.user import User
from app.models.vendor_otp_code import VendorOtpCode
from tests.conftest import TestingSessionLocal
from tests.test_vendors import create_approved_request, make_vendor_payload


def create_and_activate_vendor(client, login_as, pan: str, request_overrides=None, vendor_overrides=None) -> dict:
    request_overrides = request_overrides or {}
    vendor_overrides = dict(vendor_overrides or {})

    request_id = create_approved_request(client, login_as, pan, **request_overrides)

    accounts_headers = login_as("accounts@test.com")
    vendor_overrides.setdefault("email", f"vendor-{pan.lower()}@test.com")
    vendor_resp = client.post(
        f"/api/v1/vendors/from-request/{request_id}",
        json=make_vendor_payload(**vendor_overrides),
        headers=accounts_headers,
    )
    assert vendor_resp.status_code == 201
    vendor = vendor_resp.json()

    activation = client.post(f"/api/v1/vendor-portal/activate/{vendor['id']}", headers=accounts_headers)
    assert activation.status_code == 201
    activation_body = activation.json()

    return {
        "vendor_id": vendor["id"],
        "vendor": vendor,
        "email": activation_body["email"],
        "temp_password": activation_body["temp_password"],
        "user_id": activation_body["user_id"],
    }


def login_step1(client, email: str, password: str):
    return client.post("/api/v1/vendor-portal/auth/login-step1", json={"email": email, "password": password})


def verify_otp(client, pre_auth_token: str, code: str):
    return client.post(
        "/api/v1/vendor-portal/auth/verify-otp", json={"pre_auth_token": pre_auth_token, "code": code}
    )


def full_vendor_login(client, email: str, password: str) -> str:
    step1 = login_step1(client, email, password)
    assert step1.status_code == 200
    body = step1.json()
    result = verify_otp(client, body["pre_auth_token"], body["otp_code_dev_only"])
    assert result.status_code == 200
    return result.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_activate_portal_creates_vendor_user(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP1111P")

    db = TestingSessionLocal()
    try:
        user_row = db.get(User, uuid.UUID(vendor["user_id"]))
        assert user_row is not None
        assert user_row.role.name == "Vendor"
        assert str(user_row.linked_vendor_id) == vendor["vendor_id"]
    finally:
        db.close()


def test_login_step1_valid_credentials_issues_otp(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP2222P")

    response = login_step1(client, vendor["email"], vendor["temp_password"])
    assert response.status_code == 200
    body = response.json()
    assert "pre_auth_token" in body and body["pre_auth_token"]
    assert len(body["otp_code_dev_only"]) == 6


def test_verify_otp_success_issues_jwt(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP3333P")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    me = client.get("/api/v1/users/me", headers=auth_header(token))
    assert me.status_code == 200
    assert me.json()["role"] == "Vendor"


def test_verify_otp_expired_rejected(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP4444P")
    step1 = login_step1(client, vendor["email"], vendor["temp_password"])
    body = step1.json()

    db = TestingSessionLocal()
    try:
        otp = (
            db.query(VendorOtpCode)
            .filter(VendorOtpCode.user_id == uuid.UUID(vendor["user_id"]))
            .order_by(VendorOtpCode.created_at.desc())
            .first()
        )
        otp.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(otp)
        db.commit()
    finally:
        db.close()

    result = verify_otp(client, body["pre_auth_token"], body["otp_code_dev_only"])
    assert result.status_code == 401


def test_verify_otp_reused_rejected(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP5555P")
    step1 = login_step1(client, vendor["email"], vendor["temp_password"])
    body = step1.json()

    first = verify_otp(client, body["pre_auth_token"], body["otp_code_dev_only"])
    assert first.status_code == 200

    second = verify_otp(client, body["pre_auth_token"], body["otp_code_dev_only"])
    assert second.status_code == 401


def test_login_invalidates_previous_session(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "PPPPP6666P")

    token_a = full_vendor_login(client, vendor["email"], vendor["temp_password"])
    token_b = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    response_a = client.get("/api/v1/users/me", headers=auth_header(token_a))
    assert response_a.status_code == 401

    response_b = client.get("/api/v1/users/me", headers=auth_header(token_b))
    assert response_b.status_code == 200


def test_vendor_cannot_upload_document_for_other_vendor(client, login_as):
    vendor_a = create_and_activate_vendor(client, login_as, "PPPPP7777P")
    vendor_b = create_and_activate_vendor(client, login_as, "PPPPP8888P")

    token_a = full_vendor_login(client, vendor_a["email"], vendor_a["temp_password"])

    response = client.post(
        "/api/v1/vendor-portal/kyc-documents",
        data={"vendor_id": vendor_b["vendor_id"], "document_type": "PAN"},
        files={"file": ("pan.pdf", b"dummy pan content", "application/pdf")},
        headers=auth_header(token_a),
    )
    assert response.status_code == 403
