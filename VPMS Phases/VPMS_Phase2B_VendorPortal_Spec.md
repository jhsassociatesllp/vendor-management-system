# VPMS — Phase 2B: Vendor Onboarding & Self-Service Portal (Backend)

**Project:** Vendor Payment Management System (VPMS)
**Phase:** 2B of 6 — Contracts, backend only (SRS Module 4)
**Builds on:** Phase 0 (Auth/RBAC), Phase 1 (Vendor Master), Phase 2A (Agreements). Reuse existing models — do not modify them.
**Rule for this phase: build ONLY what is listed below. No Invoice submission, no Payment history, no Payment query — those are later phases even though the SRS lists them as portal dashboard features.**

---

## 1. Objective

Give an onboarded vendor a secure way to log into their own account, complete KYC document upload, and manage their profile — with the specific security controls the SRS requires (OTP 2FA, single session, dual-authorized bank changes). This is the vendor-facing counterpart to Phase 1's internal vendor creation.

**Definition of Done:** A vendor (created via Phase 1) can be activated for portal access, log in with password + OTP, upload KYC documents that get reviewed by Accounts, see their profile completion status, request a bank detail change that requires two different approvers, and receive basic notifications. All tests in Section 7 pass.

---

## 2. Assumptions Added Beyond the SRS (confirm with your manager if these matter)

- **MOA/Incorporation Certificate requirement**: assumed mandatory only when `vendor_category = "Goods Supplier"` or a new `is_company` flag is true — the SRS doesn't define how the system knows a vendor is "a company" vs. an individual/proprietor. Flagged for a real decision; built as a simple boolean flag for now.
- **ITR/Audited Financials threshold**: SRS says "for vendors above ₹10L annual spend threshold" — assumed to mean the `estimated_annual_spend` captured on the originating Phase 1 vendor request. Confirm this is the right field to check against.
- **"Auto-logout after 15 minutes of inactivity"**: implemented as a fixed 15-minute JWT expiry (re-login required after), not true sliding/idle-based expiry — true idle tracking needs a more involved session-heartbeat mechanism that's out of scope for this phase. Flagging this simplification explicitly.
- **Dual-authorization for bank changes**: assumed to mean two different users holding Accounts Executive or higher approve the same request — SRS doesn't specify which two roles exactly.

---

## 3. Data Model

### 3.1 Extend `users` (from Phase 0) — add these fields if not already present
| Field | Type | Notes |
|---|---|---|
| linked_vendor_id | FK → vendors, nullable | set only for role=Vendor users |
| session_version | integer | default 0; incremented on each new login, embedded in JWT to enforce single active session |

### 3.2 `vendor_otp_codes`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| user_id | FK → users | |
| code | string | 6-digit, stub-generated |
| purpose | enum | `login` |
| expires_at | timestamp | short expiry, e.g. 5 minutes |
| consumed | boolean | default false |
| created_at | timestamp | |

### 3.3 `vendor_kyc_documents`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| vendor_id | FK → vendors | |
| document_type | enum | `PAN`, `GST_Certificate`, `MSME_Certificate`, `Bank_Proof`, `MOA_Incorporation`, `Beneficial_Ownership`, `ITR_Audited_Financials` |
| file_url | string | stub local path |
| file_hash | string | SHA-256 of the uploaded file — compute this for real, don't stub it |
| status | enum | `Pending_Review`, `Verified`, `Rejected` |
| rejection_reason | text, nullable | required if Rejected |
| reviewed_by | FK → users, nullable | |
| reviewed_at | timestamp, nullable | |
| uploaded_at | timestamp | |

### 3.4 `bank_change_requests`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| vendor_id | FK → vendors | |
| new_account_no | string | mandatory |
| new_ifsc_code | string | mandatory, format-validated (reuse Phase 1's regex) |
| status | enum | `Pending_First_Approval`, `Pending_Second_Approval`, `Approved`, `Rejected` |
| requested_by | FK → users | the vendor user |
| first_approved_by | FK → users, nullable | |
| second_approved_by | FK → users, nullable | must differ from `first_approved_by` |
| rejection_reason | text, nullable | |
| created_at | timestamp | |

### 3.5 `notifications`
| Field | Type | Notes |
|---|---|---|
| id | PK | |
| user_id | FK → users | recipient |
| message | string | |
| read_at | timestamp, nullable | |
| created_at | timestamp | |

---

## 4. Workflows

### 4.1 Portal Activation → First Login
```
Accounts Executive activates portal access for a Vendor
   → creates a `users` row (role=Vendor, linked_vendor_id set), generates temp password
   → logs a notification ("credentials issued") — stub, same pattern as Phase 1's activation stub
Vendor logs in with email + temp password → request-otp → verify-otp → JWT issued
First login: portal should indicate profile/KYC is incomplete (see 4.3) before allowing further action
```

### 4.2 Login with OTP (2FA)
```
POST /vendor-portal/auth/login-step1 (email + password)
   → if valid: generate OTP row, "send" it (stub = return it in the response body, clearly marked as dev-only)
   → returns a short-lived pre-auth token (not a full access token)
POST /vendor-portal/auth/verify-otp (pre-auth token + code)
   → if correct and not expired/consumed: issue full JWT (with current session_version), increment user's session_version
   → any previously issued JWT for that user is now invalid because its embedded session_version no longer matches
```

### 4.3 KYC Document Review
```
Vendor uploads a document → status Pending_Review
Accounts Executive reviews → Verified or Rejected (reason required if Rejected)
Profile is "complete" only when all applicable mandatory documents (per Section 5.2) are Verified
```

### 4.4 Bank Detail Change (dual authorization)
```
Vendor requests change → Pending_First_Approval
First Accounts Executive/Admin approves → Pending_Second_Approval
A DIFFERENT Accounts Executive/Admin approves → Approved → vendors.bank_account_no/ifsc_code updated
                                                          → notification logged for old AND new... 
                                                            (email is stubbed; just log both notification rows)
Either approval step can instead Reject → status Rejected, original bank details untouched
```

---

## 5. Business Rules

1. **OTP**: 6-digit code, expires in 5 minutes, single use (`consumed` flips to true on successful verify), max reasonable attempts not required for this phase (don't over-build — just correctness of the happy path and expiry/reuse rejection).
2. **Single session enforcement**: a JWT is valid only if its embedded `session_version` matches the user's current `users.session_version`. Logging in again anywhere invalidates the previous token.
3. **Mandatory KYC documents** — determined per vendor:
   - `PAN`: always mandatory
   - `GST_Certificate`: mandatory if `vendors.gstin` is set
   - `MSME_Certificate`: mandatory if `vendors.msme_status = true`
   - `Bank_Proof`: always mandatory
   - `Beneficial_Ownership`: always mandatory
   - `MOA_Incorporation`: mandatory per the assumption in Section 2
   - `ITR_Audited_Financials`: mandatory per the threshold assumption in Section 2
4. **Profile completion** = all applicable mandatory documents above are `Verified` (not just uploaded).
5. **Bank change dual authorization**: `first_approved_by` and `second_approved_by` must be different users; both must hold Accounts Executive or higher.
6. **File hash**: compute and store SHA-256 of every uploaded KYC document for real (this is cheap and useful even without a real document-integrity pipeline).

---

## 6. API Endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | `/api/v1/vendor-portal/activate/{vendor_id}` | Create portal login for a vendor | Accounts Executive, System Admin |
| POST | `/api/v1/vendor-portal/auth/login-step1` | Password check, triggers OTP | Public |
| POST | `/api/v1/vendor-portal/auth/verify-otp` | OTP check, issues JWT | Public (with valid pre-auth token) |
| POST | `/api/v1/vendor-portal/kyc-documents` | Upload a KYC document | Vendor (own account only) |
| GET | `/api/v1/vendor-portal/kyc-documents` | List own documents | Vendor |
| GET | `/api/v1/kyc-documents/pending` | List documents awaiting review | Accounts Executive, System Admin |
| POST | `/api/v1/kyc-documents/{id}/review` | Verify or reject a document | Accounts Executive, System Admin |
| GET | `/api/v1/vendor-portal/profile/status` | Is profile/KYC complete? | Vendor (own) |
| POST | `/api/v1/vendor-portal/bank-change-requests` | Request a bank detail change | Vendor (own) |
| POST | `/api/v1/bank-change-requests/{id}/approve` | Approve one authorization step | Accounts Executive, System Admin |
| POST | `/api/v1/bank-change-requests/{id}/reject` | Reject the request | Accounts Executive, System Admin |
| GET | `/api/v1/notifications` | List own notifications | Any authenticated |
| POST | `/api/v1/notifications/{id}/read` | Mark as read | Any authenticated (own only) |

---

## 7. Required Tests (automated, pytest + httpx)

1. `test_activate_portal_creates_vendor_user` — activation creates a `users` row with role Vendor, linked to the vendor
2. `test_login_step1_valid_credentials_issues_otp` — correct email/password → OTP generated, pre-auth token returned
3. `test_verify_otp_success_issues_jwt` — correct OTP → full JWT returned
4. `test_verify_otp_expired_rejected` — expired OTP → 401
5. `test_verify_otp_reused_rejected` — using the same OTP twice → 401
6. `test_login_invalidates_previous_session` — logging in a second time makes the first JWT's requests fail (401) due to session_version mismatch
7. `test_vendor_cannot_upload_document_for_other_vendor` — vendor A attempting to upload against vendor B's id → 403
8. `test_kyc_review_verified_updates_status` — Accounts Executive verifies a document → status Verified
9. `test_kyc_review_rejected_requires_reason` — rejecting without reason → 422
10. `test_profile_status_incomplete_until_all_verified` — profile status reports incomplete while any mandatory doc is missing/unverified, complete once all are Verified
11. `test_bank_change_requires_two_different_approvers` — same user approving both steps → 403 on the second attempt
12. `test_bank_change_approved_updates_vendor_bank_details` — after both approvals, `vendors.bank_account_no`/`ifsc_code` actually change
13. `test_bank_change_rejection_leaves_original_details` — rejecting at either step leaves vendor bank details unchanged
14. `test_notifications_list_and_mark_read` — notifications created by the above flows appear and can be marked read

Run with: `pytest tests/ -v`. **All 14 must pass.**

---

## 8. Manual Verification

1. As Accounts Executive, activate portal access for a Phase 1 vendor — note the returned temp password.
2. Log in as that vendor via `login-step1`, grab the dev-mode OTP from the response, verify it, get a JWT.
3. Upload the mandatory KYC documents (use small dummy files) — confirm they show `Pending_Review`.
4. As Accounts Executive, review and Verify each — confirm `/profile/status` now reports complete.
5. As the vendor, request a bank detail change.
6. As Accounts Executive #1, approve it — confirm status is `Pending_Second_Approval`.
7. Try approving again as the same user — confirm it's blocked.
8. Log in as a different Accounts Executive (or Admin), approve — confirm vendor's bank details updated and both are logged as approvers.
9. Check `/notifications` as the vendor — confirm relevant entries appear.
10. Log in as the vendor a second time (new OTP flow) and confirm the original JWT from step 2 no longer works.

---

## 9. Explicitly Out of Scope for This Phase

No Invoice submission/tracking, no Payment history, no Payment query/dispute — even though the SRS lists these as portal dashboard features, they depend on modules not built yet (Invoice = Phase 3, Payment = Phase 4). Real OTP delivery via SMS gateway is stubbed (returned in the response, not actually sent) — real gateway integration is a later infrastructure task, not part of any phase spec yet. Real GSTIN-active-status API check is not implemented — GSTIN format validation only (same as Phase 1).

---

## 10. Instructions for the Coding Agent

Build in order: Section 3 (models, including the `users` table extension) → Section 4 (workflows) → Section 5 (business rules) → Section 6 (endpoints), testing continuously per Section 7. If the Section 2 assumptions conflict with anything already built, flag rather than silently resolving. Report which files were created/changed when done.
