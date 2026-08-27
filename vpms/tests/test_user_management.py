def login(client, email, password="password123"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return response.json()["access_token"]


def auth_headers(client, email, password="password123"):
    return {"Authorization": f"Bearer {login(client, email, password)}"}


def test_system_admin_can_create_user(client):
    headers = auth_headers(client, "admin@test.com")
    response = client.post(
        "/api/v1/users",
        json={
            "name": "New Hire",
            "email": "new-hire@test.com",
            "password": "password123",
            "role": "Accounts Executive",
        },
        headers=headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new-hire@test.com"
    assert body["role"] == "Accounts Executive"
    assert body["is_active"] is True

    # The new user can actually log in with the password that was set.
    login_response = client.post(
        "/api/v1/auth/login", json={"email": "new-hire@test.com", "password": "password123"}
    )
    assert login_response.status_code == 200


def test_non_admin_cannot_create_user(client):
    headers = auth_headers(client, "accounts@test.com")
    response = client.post(
        "/api/v1/users",
        json={"name": "Nope", "email": "nope@test.com", "password": "password123", "role": "Accounts Executive"},
        headers=headers,
    )
    assert response.status_code == 403


def test_cannot_create_user_with_duplicate_email(client):
    headers = auth_headers(client, "admin@test.com")
    response = client.post(
        "/api/v1/users",
        json={
            "name": "Duplicate",
            "email": "accounts@test.com",
            "password": "password123",
            "role": "Accounts Executive",
        },
        headers=headers,
    )
    assert response.status_code == 400


def test_cannot_create_user_with_vendor_role(client):
    headers = auth_headers(client, "admin@test.com")
    response = client.post(
        "/api/v1/users",
        json={"name": "Not A Vendor Portal User", "email": "not-vendor@test.com", "password": "password123", "role": "Vendor"},
        headers=headers,
    )
    assert response.status_code == 400


def test_roles_endpoint_excludes_vendor(client):
    headers = auth_headers(client, "admin@test.com")
    response = client.get("/api/v1/users/roles", headers=headers)
    assert response.status_code == 200
    assert "Vendor" not in response.json()
    assert "System Admin" in response.json()


def test_admin_can_deactivate_and_reactivate_user(client):
    headers = auth_headers(client, "admin@test.com")
    create_response = client.post(
        "/api/v1/users",
        json={"name": "Toggle Me", "email": "toggle@test.com", "password": "password123", "role": "Finance Team"},
        headers=headers,
    )
    user_id = create_response.json()["id"]

    deactivate_response = client.patch(f"/api/v1/users/{user_id}", json={"is_active": False}, headers=headers)
    assert deactivate_response.status_code == 200
    assert deactivate_response.json()["is_active"] is False

    login_response = client.post("/api/v1/auth/login", json={"email": "toggle@test.com", "password": "password123"})
    assert login_response.status_code == 401

    reactivate_response = client.patch(f"/api/v1/users/{user_id}", json={"is_active": True}, headers=headers)
    assert reactivate_response.status_code == 200
    assert reactivate_response.json()["is_active"] is True


def test_admin_cannot_deactivate_own_account(client):
    headers = auth_headers(client, "admin@test.com")
    me_response = client.get("/api/v1/users/me", headers=headers)
    own_id = me_response.json()["id"]

    response = client.patch(f"/api/v1/users/{own_id}", json={"is_active": False}, headers=headers)
    assert response.status_code == 400


def test_admin_can_reset_password_and_it_invalidates_old_sessions(client):
    headers = auth_headers(client, "admin@test.com")
    create_response = client.post(
        "/api/v1/users",
        json={"name": "Reset Me", "email": "reset@test.com", "password": "password123", "role": "Finance Team"},
        headers=headers,
    )
    user_id = create_response.json()["id"]
    old_token = login(client, "reset@test.com")

    reset_response = client.post(
        f"/api/v1/users/{user_id}/reset-password", json={"new_password": "newpassword456"}, headers=headers
    )
    assert reset_response.status_code == 204

    # The old token was issued before the reset bumped session_version, so it's dead now.
    old_session_response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {old_token}"})
    assert old_session_response.status_code == 401

    new_login_response = client.post(
        "/api/v1/auth/login", json={"email": "reset@test.com", "password": "newpassword456"}
    )
    assert new_login_response.status_code == 200
