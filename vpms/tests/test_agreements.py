import re
from datetime import date, timedelta

AGREEMENT_NUMBER_PATTERN = re.compile(r"^AGR-\d{4}-\d{4}$")


def make_agreement_payload(vendor_id, item_code_ids, **overrides):
    payload = {
        "vendor_id": vendor_id,
        "scope_of_work": "Provide monthly consulting services",
        "supporting_document_url": "/stub/agreement.pdf",
        "billing_frequency": "Monthly",
        "agreement_start_date": "2026-01-01",
        "agreement_end_date": "2026-12-31",
        "auto_renewal_flag": False,
        "po_requirement": "Optional",
        "credit_period_days": 30,
        "tds_section": None,
        "tds_override_reason": None,
        "gst_rate": "18.00",
        "reverse_charge_flag": False,
        "approved_by_designation": "VP Finance",
        "item_code_ids": item_code_ids,
    }
    payload.update(overrides)
    return payload


def test_create_agreement_success(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    payload = make_agreement_payload(existing_vendor_id, [existing_item_code_id])
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "Active"
    assert AGREEMENT_NUMBER_PATTERN.match(body["agreement_number"])


def test_agreement_requires_item_coverage(client, login_as, existing_vendor_id):
    headers = login_as("accounts@test.com")
    payload = make_agreement_payload(existing_vendor_id, [])
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code in (400, 422)


def test_agreement_end_before_start_rejected(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    payload = make_agreement_payload(
        existing_vendor_id,
        [existing_item_code_id],
        agreement_start_date="2026-12-31",
        agreement_end_date="2026-01-01",
    )
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 422


def test_agreement_number_format(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    payload = make_agreement_payload(existing_vendor_id, [existing_item_code_id])
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 201
    assert AGREEMENT_NUMBER_PATTERN.match(response.json()["agreement_number"])


def test_create_agreement_blocked_for_dept_manager(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("deptmanager@test.com")
    payload = make_agreement_payload(existing_vendor_id, [existing_item_code_id])
    response = client.post("/api/v1/agreements", json=payload, headers=headers)
    assert response.status_code == 403


def test_expiring_agreements_query(client, login_as, existing_vendor_id, existing_item_code_id):
    headers = login_as("accounts@test.com")
    today = date.today()

    def create(scope_marker, end_offset_days):
        payload = make_agreement_payload(
            existing_vendor_id,
            [existing_item_code_id],
            scope_of_work=scope_marker,
            agreement_start_date=(today - timedelta(days=300)).isoformat(),
            agreement_end_date=(today + timedelta(days=end_offset_days)).isoformat(),
        )
        resp = client.post("/api/v1/agreements", json=payload, headers=headers)
        assert resp.status_code == 201
        return resp.json()["agreement_number"]

    expiring_soon_number = create("EXPIRING_SOON_MARKER", 10)
    expiring_later_number = create("EXPIRING_LATER_MARKER", 40)
    not_expiring_number = create("NOT_EXPIRING_MARKER", 200)

    response = client.get("/api/v1/agreements/expiring?days=30", headers=headers)
    assert response.status_code == 200
    numbers = [a["agreement_number"] for a in response.json()]

    assert expiring_soon_number in numbers
    assert expiring_later_number not in numbers
    assert not_expiring_number not in numbers
