# VPMS — Phase 0: Foundation (Auth + RBAC)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 0 of 6 — Foundation
**Stack:** FastAPI, PostgreSQL, SQLAlchemy, Alembic
**Rule for this phase: build ONLY what is listed below. Do not create Vendor, PO, Invoice, or any other business tables yet — they belong to later phases.**

---

## 1. Objective

Stand up the project skeleton, database connection, and a working authentication + role-based access control (RBAC) layer. This phase produces no business functionality — it produces the foundation every later module will be built on top of.

**Definition of Done:** Two seeded users, each with a different role, can log in and receive a JWT. A protected test endpoint allows one role and rejects the other with a 403. All automated tests in Section 6 pass.

---

## 2. Folder Structure

Create exactly this structure:

```
vpms/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── database.py
│   ├── models/
│   │   ├── user.py
│   │   ├── role.py
│   │   └── permission.py
│   ├── schemas/
│   │   ├── user.py
│   │   └── auth.py
│   ├── repositories/
│   │   └── user_repository.py
│   ├── services/
│   │   └── auth_service.py
│   ├── api/
│   │   └── v1/
│   │       ├── auth.py
│   │       └── users.py
│   └── dependencies/
│       └── rbac.py
├── alembic/
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   └── test_rbac.py
├── .env.example
├── requirements.txt
└── README.md
```

Layering rule (applies to every future phase too):
- `repositories/` — raw DB queries only, no business logic
- `services/` — business rules and orchestration
- `api/` — HTTP layer only, calls services, no direct DB access

---

## 3. Data Model

### 3.1 Role (seed data — hardcode these 8, do not build an admin UI for roles yet)

| Role Name |
|---|
| Vendor |
| Accounts Executive |
| Budget Controller |
| Dept. Manager |
| Partner / VP |
| Finance Team |
| Compliance / Audit |
| System Admin |

### 3.2 Tables

**`roles`**
| Field | Type | Notes |
|---|---|---|
| id | UUID/int PK | |
| name | string, unique | one of the 8 above |

**`permissions`**
| Field | Type | Notes |
|---|---|---|
| id | UUID/int PK | |
| code | string, unique | e.g. `test.read` — only need 1–2 dummy codes for this phase |

**`role_permissions`** (join table)
| Field | Type |
|---|---|
| role_id | FK → roles |
| permission_id | FK → permissions |

**`users`**
| Field | Type | Notes |
|---|---|---|
| id | UUID/int PK | |
| name | string | |
| email | string, unique | |
| hashed_password | string | bcrypt via passlib |
| role_id | FK → roles | one role per user for this phase |
| is_active | boolean | default true |

---

## 4. API Endpoints (this phase only)

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/auth/login` | Accepts email + password, returns JWT (payload includes `user_id`, `role`) | Public |
| GET | `/api/v1/users/me` | Returns the logged-in user's own profile | Any authenticated user |
| GET | `/api/v1/users/test-restricted` | Dummy endpoint used only to prove RBAC works | Only `Accounts Executive` and `System Admin` |

`test-restricted` is throwaway — its only job is to be the thing the tests in Section 6 check against. Delete or repurpose it once Phase 1 begins.

---

## 5. RBAC Dependency

Implement a reusable FastAPI dependency, e.g.:

```python
def require_role(*allowed_roles: str):
    def checker(current_user = Depends(get_current_user)):
        if current_user.role.name not in allowed_roles:
            raise HTTPException(status_code=403, detail="Not authorized")
        return current_user
    return checker
```

Used on the test-restricted endpoint as:
`Depends(require_role("Accounts Executive", "System Admin"))`

This exact pattern will be reused, unchanged, in every later phase — get it right here.

---

## 6. Required Tests (automated, pytest + httpx)

Seed exactly these two users before running tests:

| Email | Role |
|---|---|
| accounts@test.com | Accounts Executive |
| vendor@test.com | Vendor |

Write and pass these test cases:

1. **`test_login_success`** — valid credentials return 200 and a JWT.
2. **`test_login_invalid_password`** — wrong password returns 401.
3. **`test_login_unknown_user`** — non-existent email returns 401 (not 404 — don't reveal whether the email exists).
4. **`test_me_requires_auth`** — calling `/users/me` with no token returns 401.
5. **`test_me_returns_correct_user`** — calling `/users/me` with a valid token returns that user's own email/role.
6. **`test_rbac_allows_permitted_role`** — logging in as `accounts@test.com` and calling `/users/test-restricted` returns 200.
7. **`test_rbac_blocks_unpermitted_role`** — logging in as `vendor@test.com` and calling `/users/test-restricted` returns 403.

Run with: `pytest tests/ -v`
**All 7 must pass before this phase is considered complete.**

---

## 7. Manual Verification (for the human to do after automated tests pass)

1. Run `uvicorn app.main:app --reload` and open `/docs` (FastAPI's auto Swagger UI).
2. Log in via `/auth/login` as `accounts@test.com` — copy the returned token.
3. Authorize in Swagger UI with that token, call `/users/test-restricted` — confirm 200.
4. Log out, log in as `vendor@test.com`, repeat step 3 — confirm 403.
5. Confirm the database has exactly the tables listed in Section 3 — no extra tables.

---

## 8. Explicitly Out of Scope for This Phase

Do not build: Vendor Master, Agreement, PO, Invoice, Approval workflow, Payment, MIS/reports, or any admin UI for managing roles/permissions. These are Phase 1 onward and will be specified in separate documents once this phase is verified working.

---

## 9. Instructions for the Coding Agent

Build this phase in the order of Sections 2 → 3 → 4 → 5, running the tests in Section 6 continuously as you go — not all at the end. Stop once all 7 tests pass and report which files were created/changed. Do not proceed to any functionality outside Section 8's boundary without being given a new spec document.
