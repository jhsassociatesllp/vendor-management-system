from tests.test_bank_change_requests import request_bank_change
from tests.test_vendor_portal import auth_header, create_and_activate_vendor, full_vendor_login


def test_notifications_list_and_mark_read(client, login_as):
    vendor = create_and_activate_vendor(client, login_as, "NNNNN1111N")
    token = full_vendor_login(client, vendor["email"], vendor["temp_password"])

    # Activation alone logs a "credentials issued" notification.
    initial = client.get("/api/v1/notifications", headers=auth_header(token))
    assert initial.status_code == 200
    assert len(initial.json()) >= 1

    # A completed bank-change approval logs two more (old + new bank details).
    created = request_bank_change(client, token, new_account_no="222333444555", new_ifsc_code="AXIS0000456")
    request_id = created.json()["id"]

    accounts_headers = login_as("accounts@test.com")
    admin_headers = login_as("admin@test.com")
    client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=accounts_headers)
    client.post(f"/api/v1/bank-change-requests/{request_id}/approve", headers=admin_headers)

    after = client.get("/api/v1/notifications", headers=auth_header(token))
    assert after.status_code == 200
    notifications = after.json()
    assert len(notifications) >= len(initial.json()) + 2

    unread = next(n for n in notifications if n["read_at"] is None)
    mark = client.post(f"/api/v1/notifications/{unread['id']}/read", headers=auth_header(token))
    assert mark.status_code == 200
    assert mark.json()["read_at"] is not None
