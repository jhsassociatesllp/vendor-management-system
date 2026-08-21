from tests.conftest import EXISTING_VENDOR_PAN


def make_request_payload(pan: str, **overrides) -> dict:
    payload = {
        "business_need": "Need a reliable supplier for office consumables",
        "category": "Office Supplies",
        "estimated_annual_spend": "500000.00",
        "recommended_vendor_name": "Acme Supplies Pvt Ltd",
        "recommended_pan": pan,
        "recommended_gstin": None,
        "financial_stability_ok": True,
        "technical_capability_ok": True,
        "compliance_status_ok": True,
        "blacklist_check_ok": True,
        "conflict_of_interest_declared": True,
        "references_provided": True,
        "msme_udyam_number": None,
    }
    payload.update(overrides)
    return payload


def create_request(client, login_as, pan: str, **overrides):
    headers = login_as("deptmanager@test.com")
    return client.post(
        "/api/v1/vendor-requests",
        json=make_request_payload(pan, **overrides),
        headers=headers,
    )


def test_create_vendor_request_success(client, login_as):
    response = create_request(client, login_as, "AAACC1111C")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "Submitted"


def test_create_vendor_request_blocked_for_vendor_role(client, login_as):
    headers = login_as("vendor@test.com")
    response = client.post(
        "/api/v1/vendor-requests",
        json=make_request_payload("AAACC1112C"),
        headers=headers,
    )
    assert response.status_code == 403


def test_duplicate_pan_blocked(client, login_as):
    response = create_request(client, login_as, EXISTING_VENDOR_PAN)
    assert response.status_code in (400, 409)


def test_invalid_pan_format_rejected(client, login_as):
    response = create_request(client, login_as, "not-a-pan")
    assert response.status_code == 422


def test_accounts_review_advances_status(client, login_as):
    created = create_request(client, login_as, "AAACC2222C")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    response = client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review",
        json={"action": "advance"},
        headers=accounts_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "Pending_Partner_Approval"


def test_accounts_review_blocked_for_dept_manager(client, login_as):
    dept_headers = login_as("deptmanager@test.com")
    response = client.post(
        "/api/v1/vendor-requests/00000000-0000-0000-0000-000000000000/accounts-review",
        json={"action": "advance"},
        headers=dept_headers,
    )
    assert response.status_code == 403


def test_partner_approval_sets_approved(client, login_as):
    created = create_request(client, login_as, "AAACC4444C")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review",
        json={"action": "advance"},
        headers=accounts_headers,
    )

    partner_headers = login_as("partner@test.com")
    response = client.post(
        f"/api/v1/vendor-requests/{request_id}/partner-decision",
        json={"action": "approve"},
        headers=partner_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "Approved"


def test_partner_rejection_requires_reason(client, login_as):
    created = create_request(client, login_as, "AAACC5555C")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review",
        json={"action": "advance"},
        headers=accounts_headers,
    )

    partner_headers = login_as("partner@test.com")
    response = client.post(
        f"/api/v1/vendor-requests/{request_id}/partner-decision",
        json={"action": "reject"},
        headers=partner_headers,
    )
    assert response.status_code == 422


def test_rejected_request_moves_to_archived(client, login_as):
    created = create_request(client, login_as, "AAACC6666C")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    client.post(
        f"/api/v1/vendor-requests/{request_id}/accounts-review",
        json={"action": "advance"},
        headers=accounts_headers,
    )

    partner_headers = login_as("partner@test.com")
    response = client.post(
        f"/api/v1/vendor-requests/{request_id}/partner-decision",
        json={"action": "reject", "rejection_reason": "Failed compliance check"},
        headers=partner_headers,
    )
    assert response.status_code == 200
    assert response.json()["status"] == "Archived"
