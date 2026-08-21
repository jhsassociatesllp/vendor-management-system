from tests.test_vendor_portal import auth_header, create_and_activate_vendor, full_vendor_login


def request_bank_change(client, token, new_account_no="999888777666", new_ifsc_code="SBIN0000300"):
    return client.post(
        "/api/v1/vendor-portal/bank-change-requests",
        json={"new_account_no": new_account_no, "new_ifsc_code": new_ifsc_code},
        headers=auth_header(token),
    )


def test_bank_change_requires_two_different_approvers(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "BBBBB1111B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    created = request_bank_change(client, token)
    assert created.status_code == 201
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    first = client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=accounts_headers)
    assert first.status_code == 200
    assert first.json()["status"] == "Pending_Second_Approval"

    second_same_user = client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=accounts_headers)
    assert second_same_user.status_code == 403


def test_bank_change_approved_updates_vendor_bank_details(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "BBBBB9999B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    created = request_bank_change(client, token, new_account_no="111222333444", new_ifsc_code="KKBK0000958")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    admin_headers = login_as("admin@test.com")

    first = client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=accounts_headers)
    assert first.status_code == 200

    second = client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=admin_headers)
    assert second.status_code == 200
    assert second.json()["status"] == "Approved"

    vendor_check = client.get(f"/api/v1/vendors/{vendor['vendor_id']}", headers=accounts_headers)
    assert vendor_check.status_code == 200
    assert vendor_check.json()["bank_account_no"] == "111222333444"
    assert vendor_check.json()["ifsc_code"] == "KKBK0000958"


def test_bank_change_rejection_leaves_original_details(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "BBBBB3333B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    original_account_no = vendor["vendor"]["bank_account_no"]
    original_ifsc_code = vendor["vendor"]["ifsc_code"]

    created = request_bank_change(client, token, new_account_no="000000000000", new_ifsc_code="PUNB0222200")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    reject = client.post(
        f"/api/v1/bank-change-requests/{request_id}/reject",
        json={"rejection_reason": "Could not verify new account ownership"},
        headers=accounts_headers,
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "Rejected"

    vendor_check = client.get(f"/api/v1/vendors/{vendor['vendor_id']}", headers=accounts_headers)
    assert vendor_check.json()["bank_account_no"] == original_account_no
    assert vendor_check.json()["ifsc_code"] == original_ifsc_code


def test_bank_change_list_endpoint_returns_created_request(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "BBBBB4444B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    created = request_bank_change(client, token, new_account_no="777888999000", new_ifsc_code="AXIS0000456")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    listing = client.get("/api/v1/bank-change-requests", headers=accounts_headers)
    assert listing.status_code == 200
    assert any(r["id"] == request_id for r in listing.json())


def test_bank_change_approval_blocked_for_partner(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "BBBBB5555B")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    created = request_bank_change(client, token, new_account_no="123123123123", new_ifsc_code="PUNB0222200")
    request_id = created.json()["id"]

    partner_headers = login_as("partner@test.com")

    # Bank-change approval is restricted to the Accounts team (Accounts Executive/System
    # Admin) only — Partner/VP has no access to this endpoint, at either approval step.
    first_attempt = client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=partner_headers)
    assert first_attempt.status_code == 403

    list_attempt = client.get("/api/v1/bank-change-requests", headers=partner_headers)
    assert list_attempt.status_code == 403
