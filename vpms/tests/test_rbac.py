def login(client, email, password="password123"):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    return response.json()["access_token"]


def test_rbac_allows_permitted_role(client):
    token = login(client, "accounts@test.com")
    response = client.get(
        "/api/v1/users/test-restricted",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_rbac_blocks_unpermitted_role(client):
    token = login(client, "vendor@test.com")
    response = client.get(
        "/api/v1/users/test-restricted",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
