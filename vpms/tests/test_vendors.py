import re

from tests.test_vendor_requests import make_request_payload

VENDOR_CODE_PATTERN = re.compile(r"^VND-\d{4}-\d{4}$")


def create_approved_request(client, login_as, pan: str, **request_overrides) -> str:
    dept_headers = login_as("deptmanager@test.com")
    created = client.post(
        "/api/v1/vendor-requests",
        json=make_request_payload(pan, **request_overrides),
        headers=dept_headers,
    )
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review",
        json={"action": "advance"},
        headers=accounts_headers,
    )

    partner_headers = login_as("partner@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/partner-decision",
        json={"action": "approve"},
        headers=partner_headers,
    )
    return request_id


def make_vendor_payload(**overrides) -> dict:
    payload = {
        "vendor_category": "Service",
        "msme_status": False,
        "udyam_number": None,
        "bank_account_no": "123456789012",
        "ifsc_code": "HDFC0001234",
        "cancelled_cheque_doc_url": "/stub/cheque.pdf",
        "address": "456 Vendor Avenue",
        "email": "newvendor@test.com",
        "mobile_number": "9123456789",
    }
    payload.update(overrides)
    return payload


def test_vendor_code_creation_generates_correct_format(client, login_as):
    request_id = create_approved_request(client, login_as, "AAACC7777C")

    accounts_headers = login_as("accounts@test.com")
    response = client.post(
        f"/api/v1/vendors/from-request/{request_id}",
        json=make_vendor_payload(),
        headers=accounts_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert VENDOR_CODE_PATTERN.match(body["vendor_code"])


def test_vendor_code_creation_blocked_if_not_approved(client, login_as):
    dept_headers = login_as("deptmanager@test.com")
    created = client.post(
        "/api/v1/vendor-requests",
        json=make_request_payload("AAACC8888C"),
        headers=dept_headers,
    )
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    response = client.post(
        f"/api/v1/vendors/from-request/{request_id}",
        json=make_vendor_payload(email="another@test.com"),
        headers=accounts_headers,
    )
    assert response.status_code == 400


def test_vendor_code_creation_blocked_for_dept_manager(client, login_as):
    dept_headers = login_as("deptmanager@test.com")
    response = client.post(
        "/api/v1/vendors/from-request/00000000-0000-0000-0000-000000000000",
        json=make_vendor_payload(),
        headers=dept_headers,
    )
    assert response.status_code == 403


def test_vendor_item_code_link_unique(client, login_as):
    request_id = create_approved_request(client, login_as, "AAACC9999C")

    accounts_headers = login_as("accounts@test.com")
    vendor_response = client.post(
        f"/api/v1/vendors/from-request/{request_id}",
        json=make_vendor_payload(email="linktest@test.com", mobile_number="9988776655"),
        headers=accounts_headers,
    )
    vendor_id = vendor_response.json()["id"]

    item_code_response = client.post(
        "/api/v1/item-codes",
        json={
            "category": "Stationery",
            "sub_category": "Paper",
            "description": "A4 sheets",
            "unit": "ream",
            "default_rate": "250.00",
        },
        headers=accounts_headers,
    )
    item_code_id = item_code_response.json()["id"]

    first_link = client.post(
        f"/api/v1/vendors/{vendor_id}/item-codes",
        json={"item_code_ids": [item_code_id]},
        headers=accounts_headers,
    )
    assert first_link.status_code == 201

    second_link = client.post(
        f"/api/v1/vendors/{vendor_id}/item-codes",
        json={"item_code_ids": [item_code_id]},
        headers=accounts_headers,
    )
    assert second_link.status_code in (400, 409)
