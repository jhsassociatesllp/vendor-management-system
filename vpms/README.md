# VPMS — Phase 0 (Auth + RBAC), Phase 1 (Vendor Shortlisting & Master), Phase 2A (Agreement & Rate Card), Phase 2B (Vendor Portal), Phase 3A (PO, Budget & GRN), Phase 3B (Invoice Submission), Phase 3 UI, Phase 4A (Approval Workflow)

Vendor Payment Management System. Phase 0 provides the project skeleton, database
connection, and JWT-based authentication with role-based access control (RBAC). Phase 1
adds the vendor lifecycle: a department raises a vendor request → Accounts reviews it →
Partner/VP gives final approval → Accounts Executive creates the Vendor Code. Phase 2A
adds Agreements against a Vendor with a Rate Card and formal rate-amendment change control
(propose → separate-authority approval). Phase 2B adds the vendor-facing self-service
portal: password + OTP 2FA login, single-session enforcement, KYC document upload/review,
profile completion status, and dual-authorized bank detail changes. Phase 2B UI gives that
backend a full set of screens (vendor login/dashboard/KYC/bank-change/notifications, plus
internal KYC and bank-change review queues) with a proper design system — sidebar/topbar
shell, tokens.css palette/type scale, status badges, and a progress-ring dashboard. Phase
3A (backend only) adds Purchase Orders with hard budget enforcement against a Budget Head,
a placeholder PO approval step, versioned amendments that force re-approval, vendor
acknowledgement, and GRN/SCN delivery tracking. Phase 3B (backend only) adds vendor
Invoice submission with full three-way matching (PO vs. GRN/SCN vs. Invoice) against
those Phase 3A records — hard-blocking on duplicate numbers, PO-balance/GRN-quantity
overruns, missing documents, expired POs/agreements, and GST miscalculation, while
soft-flagging rate variance and MSME status without blocking submission. Phase 3 UI gives
both backends real screens: budget heads with a utilization bar, PO creation/approval/
amendment/GRN, invoice review, and — on the vendor side — PO acknowledgement and a
5-step invoice submission form with live PO-balance and GST-mismatch feedback. Phase 4A
(backend only) adds the parameterised invoice approval workflow: a `Submitted` invoice
is routed through L1 (Accounts) → L2 (Dept. Manager) → L3 (Partner/VP) → L4 (Finance)
based on a configurable amount-slab matrix, with L2/L3 skipped below their slab
thresholds, query-raise/vendor-response that pauses and resumes at the same level (never
resetting to L1), return-to-vendor resubmission requiring fresh routing, delegated
authority within a validity window, and a TAT-breach escalation query.

## Stack

FastAPI, PostgreSQL, SQLAlchemy 2.0, Alembic.

## Setup

1. Start PostgreSQL:

   ```
   docker compose up -d
   ```

   This starts Postgres on `localhost:5434` and creates two databases: `vpms_v2` (dev)
   and `vpms_v2_test` (test, used by pytest).

2. Create a virtualenv and install dependencies:

   ```
   python -m venv .venv
   .venv/Scripts/pip install -r requirements.txt   # Windows
   ```

3. Copy the env file:

   ```
   cp .env.example .env
   ```

4. Run migrations:

   ```
   alembic upgrade head
   ```

5. Seed roles + test users:

   ```
   python -m app.seed
   ```

## Run

```
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for the Swagger UI, or `http://127.0.0.1:8000/` for the
web UI (login page).

## Test users

| Email | Password | Role |
|---|---|---|
| accounts@test.com | password123 | Accounts Executive |
| vendor@test.com | password123 | Vendor |
| deptmanager@test.com | password123 | Dept. Manager |
| partner@test.com | password123 | Partner / VP |
| admin@test.com | password123 | System Admin |
| budgetcontroller@test.com | password123 | Budget Controller |
| finance@test.com | password123 | Finance Team |

## Tests

```
pytest tests/ -v
```

Tests run against the `vpms_v2_test` database (tables are dropped/recreated each session).

## API

| Method | Path | Access |
|---|---|---|
| POST | `/api/v1/auth/login` | Public |
| GET | `/api/v1/users/me` | Any authenticated user |
| GET | `/api/v1/users/test-restricted` | `Accounts Executive`, `System Admin` only |
| POST | `/api/v1/vendor-requests` | Dept. Manager, Partner/VP, System Admin |
| GET | `/api/v1/vendor-requests` | Any authenticated (own-only for Dept. Manager) |
| GET | `/api/v1/vendor-requests/{id}` | Any authenticated, same visibility rule |
| POST | `/api/v1/vendor-requests/{id}/accounts-review` | Accounts Executive, System Admin |
| POST | `/api/v1/vendor-requests/{id}/partner-decision` | Partner/VP, System Admin |
| POST | `/api/v1/vendors/from-request/{request_id}` | Accounts Executive, System Admin |
| GET | `/api/v1/vendors` | Any authenticated |
| GET | `/api/v1/vendors/{id}` | Any authenticated |
| POST | `/api/v1/item-codes` | Accounts Executive, System Admin |
| GET | `/api/v1/item-codes` | Any authenticated |
| GET | `/api/v1/vendors/{vendor_id}/item-codes` | Any authenticated — **added for Phase 3 UI** |
| POST | `/api/v1/vendors/{vendor_id}/item-codes` | Accounts Executive, System Admin |
| POST | `/api/v1/agreements` | Accounts Executive, System Admin |
| GET | `/api/v1/agreements` | Any authenticated |
| GET | `/api/v1/agreements/{id}` | Any authenticated |
| GET | `/api/v1/agreements/expiring?days={n}` | Accounts Executive, Partner/VP, System Admin |
| POST | `/api/v1/agreements/{id}/terminate` | Accounts Executive, System Admin |
| POST | `/api/v1/agreements/{id}/rate-cards` | Accounts Executive, System Admin |
| GET | `/api/v1/agreements/{id}/rate-cards` | Any authenticated |
| POST | `/api/v1/agreements/{id}/milestones` | Accounts Executive, System Admin |
| POST | `/api/v1/rate-cards/{id}/amendments` | Accounts Executive, System Admin |
| POST | `/api/v1/rate-card-amendments/{id}/approve` | Partner/VP, System Admin |
| POST | `/api/v1/rate-card-amendments/{id}/reject` | Partner/VP, System Admin |
| POST | `/api/v1/vendor-portal/activate/{vendor_id}` | Accounts Executive, System Admin |
| POST | `/api/v1/vendor-portal/auth/login-step1` | Public |
| POST | `/api/v1/vendor-portal/auth/verify-otp` | Public (valid pre-auth token required) |
| POST | `/api/v1/vendor-portal/kyc-documents` | Vendor (own account only) |
| GET | `/api/v1/vendor-portal/kyc-documents` | Vendor (own) |
| GET | `/api/v1/kyc-documents/pending` | Accounts Executive, System Admin |
| POST | `/api/v1/kyc-documents/{id}/review` | Accounts Executive, System Admin |
| GET | `/api/v1/kyc-documents/{id}/file` | Owning vendor, or Accounts Executive/System Admin — **added post-UAT** |
| GET | `/api/v1/vendor-portal/profile/status` | Vendor (own) |
| POST | `/api/v1/vendor-portal/bank-change-requests` | Vendor (own) |
| GET | `/api/v1/vendor-portal/bank-change-requests` | Vendor (own) — **added for Phase 2B UI** |
| GET | `/api/v1/bank-change-requests` | Accounts Executive, System Admin — **added for Phase 2B UI** |
| POST | `/api/v1/bank-change-requests/{id}/approve` | Accounts Executive, System Admin |
| POST | `/api/v1/bank-change-requests/{id}/reject` | Accounts Executive, System Admin |
| GET | `/api/v1/notifications` | Any authenticated (own) |
| POST | `/api/v1/notifications/{id}/read` | Any authenticated (own only) |
| POST | `/api/v1/budget-heads` | Budget Controller, System Admin |
| GET | `/api/v1/budget-heads` | Any authenticated |
| GET | `/api/v1/budget-heads/{id}/availability` | Any authenticated |
| POST | `/api/v1/purchase-orders` | Dept. Manager, Accounts Executive, System Admin |
| GET | `/api/v1/purchase-orders` | Any authenticated |
| GET | `/api/v1/purchase-orders/{id}` | Any authenticated |
| POST | `/api/v1/purchase-orders/{id}/approve` | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/purchase-orders/{id}/reject` | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/purchase-orders/{id}/cancel` | Accounts Executive, System Admin |
| POST | `/api/v1/purchase-orders/{id}/amend` | Dept. Manager, Accounts Executive, System Admin |
| POST | `/api/v1/purchase-orders/{id}/vendor-acknowledge` | Vendor (own only) |
| POST | `/api/v1/purchase-orders/{id}/grn` | Dept. Manager, Accounts Executive, System Admin |
| GET | `/api/v1/purchase-orders/{id}/grn` | Any authenticated |
| GET | `/api/v1/purchase-orders/{id}/amendments` | Any authenticated — **added for Phase 3 UI** |
| POST | `/api/v1/po-amendments/{id}/approve` | Budget Controller, Partner/VP, System Admin |
| POST | `/api/v1/po-amendments/{id}/reject` | Budget Controller, Partner/VP, System Admin — **added, see flagged notes** |
| POST | `/api/v1/invoices` | Vendor (own vendor only) |
| POST | `/api/v1/invoices/{id}/documents` | Vendor (own only) |
| GET | `/api/v1/invoices/{id}/documents` | Any authenticated with invoice's visibility rule — **added for Phase 3 UI** |
| GET | `/api/v1/invoices/documents/{document_id}/file` | Owning vendor, or any internal role — **added for Phase 3 UI** |
| POST | `/api/v1/invoices/{id}/submit` | Vendor (own only) |
| GET | `/api/v1/invoices` | Any authenticated (own for Vendor, all for internal roles) |
| GET | `/api/v1/invoices/{id}` | Any authenticated with the same visibility rule |
| GET | `/api/v1/purchase-orders/{id}/balance` | Any authenticated |
| POST | `/api/v1/doa-matrix` | System Admin |
| GET | `/api/v1/doa-matrix` | Any authenticated |
| POST | `/api/v1/invoices/{id}/route-for-approval` | Accounts Executive, System Admin |
| GET | `/api/v1/invoice-approvals/my-queue` | Any authenticated (returns own role's + delegated pending stages) |
| GET | `/api/v1/invoice-approvals/escalations` | Accounts Executive, Partner/VP, Finance Team, System Admin |
| GET | `/api/v1/invoice-approvals/{id}` | Any authenticated |
| POST | `/api/v1/invoice-approvals/{id}/action` | Role matching the stage (or active delegate) |
| POST | `/api/v1/invoices/{id}/queries` | Role matching the current active stage (or delegate) |
| POST | `/api/v1/invoices/{id}/queries/{query_id}/respond` | Vendor (own invoice only) |
| POST | `/api/v1/invoices/{id}/resubmit` | Vendor (own only) |
| POST | `/api/v1/approval-delegations` | Accounts Executive, Dept. Manager, Partner/VP, Finance Team (self), or System Admin (emergency) |

`test-restricted` (Phase 0) is still a throwaway endpoint — see the flagged note below on
why it hasn't been removed yet.

## Phase 1 notes / flagged decisions

- **`msme_udyam_number` on `vendor_requests`**: the spec says it's "required only if
  vendor claims MSME status," but `vendor_requests` has no MSME-status boolean field —
  only `vendors` does. Implemented as fully optional at the request stage; MSME
  enforcement (udyam number required when `msme_status=true`) only happens at vendor
  creation, where the boolean actually exists.
- **`tds_section` override**: the spec's table only lists a `tds_section` column but the
  prose says it's "overridable with a reason field." Added `tds_section_overridden`
  (bool) and `tds_section_override_reason` (text) columns on `vendors` to make that
  concrete.
- **Rejected → Archived collapsed into one step**: the workflow diagram shows `Rejected`
  and `Archived` as separate states, but Section 6 has no endpoint to move something from
  Rejected to Archived. Since there's nowhere else for a rejected request to go, rejection
  (at either accounts-review or partner-decision) sets status straight to `Archived`,
  with `rejection_reason` preserved.
- **Vendor identity fields on creation**: `/vendors/from-request/{id}` does not re-collect
  `vendor_name`/`pan`/`gstin` — they're copied from the already-vetted
  `recommended_vendor_name`/`recommended_pan`/`recommended_gstin` on the source request.
  Only the fields that don't exist yet at request stage (banking, MSME/Udyam, category,
  address, contact) are collected in the vendor-creation body.
- **`test-restricted` (Phase 0)** was flagged for removal "once Phase 1 begins," but
  Phase 0's own required tests (`test_rbac_allows_permitted_role` /
  `test_rbac_blocks_unpermitted_role`) exercise it directly. Left in place rather than
  breaking passing tests without being asked; flagging here for a decision.

## Phase 1 UI

Plain HTML/CSS/vanilla JS under `static/`, served by FastAPI itself (`/static/...`, with
`/` serving `static/pages/login.html`). No build step — just open the app.

- `static/js/api.js` — shared `apiFetch()` (attaches the JWT, handles 401/403/422),
  `getCurrentUser()`, `renderNav()` (role-based top nav), and small shared helpers
  (`statusBadgeHtml`, `formatDate`).
- Pages: `login`, `dashboard`, `vendor-request-form`, `vendor-requests-list`,
  `request-detail`, `item-codes` — one HTML file + driving JS file each, per the UI spec.

### UI notes / flagged decisions

- **Absolute paths, not relative**: the spec's example implies relative links between
  pages, but since `login.html` is served at `/` while every other page lives under
  `/static/pages/...`, all inter-page navigation and asset links use absolute
  `/static/...` paths so they resolve correctly regardless of which page loaded them.
- **Extra file — `request-detail.js`**: the spec's file list has `accounts-review.js` and
  `partner-approval.js` but no generic driver for `request-detail.html`. Split as: those
  two files each hold one thin action function (`submitAccountsReview`,
  `submitPartnerDecision`); `request-detail.js` (not in the original list) does the actual
  page orchestration — fetching the request, rendering read-only fields, deciding which
  action UI to show, and the vendor-creation + item-code-linking sections.
- **Vendor-creation form had to be invented**: Section 4.5 describes "Create Vendor Code"
  as a single button, but the underlying endpoint requires a full `VendorCreate` body
  (bank details, IFSC, category, MSME status, address, contact). Added an inline form that
  appears in the Approved-status action area to collect these before calling the endpoint.
- **No "currently linked item codes" list**: the backend has no `GET` endpoint to list a
  vendor's linked item codes (only `POST` to create a link), and the instructions say not
  to modify the tested Phase 1 API. The linking UI lets you select and link item codes and
  confirms success, but doesn't show a persistent "already linked" list. Say the word if
  you want a `GET /vendors/{vendor_id}/item-codes` endpoint added for this.
- **Reviewer identity not shown**: `accounts_reviewed_by`/`partner_decided_by` are user
  UUIDs with no endpoint to resolve them to a name/email, so the detail page shows the
  review/decision *timestamps* but not *who* — flagging in case that's wanted later.
- **Item Codes page is fully gated to Accounts Executive/System Admin** (list included),
  per Section 4.6's "Accounts Executive/Admin only," even though the backend's `GET
  /item-codes` actually allows any authenticated user. Deliberate per the UI spec; say the
  word if other roles should be able to view (not edit) the list.

## Phase 2A notes / flagged decisions

- **Agreement `status`**: `Active`/`Expired` are computed from today's date vs.
  `agreement_end_date` every time an agreement is read (not stored/updated by a background
  job); `Terminated` is the one persisted, manually-set value and always wins once set.
  `agreement_code_sequences` mirrors Phase 1's `vendor_code_sequences` pattern so a
  terminated agreement never frees up its number.
- **Volume_Tiered rate cards**: accepted as a `pricing_type` value with `rate` optional
  (same as `Milestone`), per Section 2's explicit note that tier logic isn't implemented
  this phase — there's nowhere else to store per-tier rates yet.
- **Bug caught during Section 8 manual verification, now fixed**: the initial
  implementation let you add a rate card (and milestone) to a `Terminated` agreement — step
  7 of Section 8 explicitly calls this out as something that must be blocked. Added an
  `AgreementTerminatedError` check (400) to both `create_rate_card` and `create_milestone`
  in `rate_card_service.py`, plus a regression test
  (`test_rate_card_blocked_after_termination`) since it wasn't one of the 14 numbered
  Section 7 tests.
- **Self-rejection blocked too**: Section 5.8 only requires `requested_by` ≠ `approved_by`
  for *approval*, but the same separation-of-duties principle was applied to rejection as
  well (the proposer can't reject their own amendment either) — this wasn't explicitly
  required but seemed like an oversight to leave open, since it'd otherwise let a proposer
  unilaterally kill their own proposal without anyone else looking at it.
- **New test user**: added `admin@test.com` (System Admin) — needed to test self-approval
  blocking, since `Accounts Executive` can't call the approve endpoint at all (RBAC blocks
  it before the self-check even runs), so a role that can do both propose *and* approve was
  required to exercise that specific rule.

## Phase 2B notes / flagged decisions

- **`is_company` flag — genuine conflict, resolved conservatively**: Section 2's assumption
  proposes MOA/Incorporation is mandatory when `vendor_category = "Goods Supplier"` *or* "a
  new `is_company` flag is true." But the phase's own rule says to reuse existing models —
  Section 3.1 only authorizes extending `users`, not `vendors`. Adding `is_company` would
  mean modifying the `Vendor` model, which isn't authorized. Per Section 10's instruction to
  flag rather than silently resolve conflicting assumptions: **implemented only the
  `vendor_category == "Goods Supplier"` condition**, no `is_company` column was added. If
  you want the flag, say so and I'll add a migration for it.
- **ITR/Audited Financials threshold**: resolved without a model change — checked against
  `estimated_annual_spend` on the vendor's *originating* `vendor_request` (via
  `vendors.source_request_id`), which already exists from Phase 1. Threshold used: ₹10,00,000.
- **15-minute vendor session expiry — initially missed, now fixed**: Section 2 explicitly
  says "auto-logout after 15 minutes" should be "a fixed 15-minute JWT expiry." My first pass
  only used the existing global 60-minute expiry (Phase 0's setting) for every login,
  including vendor-portal ones. Fixed: `auth_service.issue_token_for_user` now takes an
  optional `expire_minutes` override, and `vendor_portal_service.verify_otp` passes 15 —
  staff logins via `/auth/login` are unaffected (still 60 minutes).
- **Single-session enforcement generalized to everyone, not just vendors**: Section 3.1 adds
  `session_version` to `users` generally (not vendor-specific), and Section 5.2's check
  ("a JWT is valid only if its embedded session_version matches") reads as a property of the
  auth system, not something scoped to the vendor portal. So `session_version` is now
  embedded in *every* JWT (staff included) and checked in `get_current_user`. This is a
  no-op for staff today since nothing else increments their `session_version` yet — but if
  a future phase adds "log out everywhere" for staff, this is already wired up.
- **FK cycle from `users.linked_vendor_id` → `vendors.id`**: `vendors.source_request_id` →
  `vendor_requests.id` → `vendor_requests.requested_by` → `users.id` → (new)
  `users.linked_vendor_id` → `vendors.id` closes a real cycle that Postgres/SQLAlchemy can't
  topologically order for `CREATE`/`DROP`. Fixed with `use_alter=True` on the new FK
  (applied via a separate `ALTER TABLE` instead of inline) — this is a schema-level
  necessity, not a design choice, and is worth knowing about if you extend `users` further.
- **Bank-change notification wording — spec sentence was cut off**: Section 4.4 says
  "notification logged for old AND new... (email is stubbed; just log both notification
  rows)" — the sentence trails off mid-thought. Interpreted as: on approval, log two
  notification rows to the vendor's portal user, one stating the previous bank
  details and one stating the new ones. Flagging in case a different pairing (e.g.
  notifying two different people) was intended.
- **KYC upload takes `vendor_id` as a form field, not a path param**: the endpoint table
  lists `POST /vendor-portal/kyc-documents` with no `{vendor_id}` in the path, but Section
  7's test 7 requires proving "vendor A uploading against vendor B's id" is blocked — which
  only makes sense if the client can specify a (possibly wrong) vendor_id. Implemented as a
  multipart form field (`vendor_id`, `document_type`, `file`), checked server-side against
  `current_user.linked_vendor_id`.
- **Real file storage, not just a stub path**: Section 5.6 asks for a real SHA-256 hash "for
  real," so uploads are actually written to `uploads/kyc/{vendor_id}/{uuid}_{filename}` under
  the project root (git-ignored) rather than only faking a path string — the hash is
  computed over real bytes, and the stored file backs it up.
- **New repository functions added to existing Phase 1/0 files**: `vendor_repository.save()`
  (Phase 1, needed to persist bank-detail updates) and `user_repository.create()` /
  `.save()` / `.get_by_linked_vendor_id()` (Phase 0, needed for portal activation and
  session-version updates). These are additive functions, not changes to existing behavior.

## Phase 2B UI

Plain HTML/CSS/vanilla JS under `static/`, extending Phase 1's `api.js` rather than
rewriting it, per the spec. New pages: `vendor-login`, `vendor-dashboard`,
`vendor-kyc-upload`, `vendor-bank-change`, `vendor-notifications`, `kyc-review-queue`
(internal), `bank-change-review` (internal) — all sharing a persistent sidebar+topbar
app shell (`renderAppShell()` in `api.js`) built on `tokens.css` (colors, type scale, 8px
spacing scale) and `app-shell.css` (cards, badges, forms, tables, the progress ring).
**All six Phase 0/1 pages (`login`, `dashboard`, `vendor-request-form`,
`vendor-requests-list`, `request-detail`, `item-codes`) were later retrofitted onto this
same app shell too** — see "Post-UAT fixes" below; there is now a single design system
across every page, not two.

### Backend additions made for this UI phase

The UI spec explicitly authorized adding a list endpoint if the backend was missing one,
and asked to report it — three were needed in the end:

1. **`GET /api/v1/bank-change-requests`** (Accounts Executive/Partner/Admin) — the
   internal review queue page had no way to see all requests; Phase 2B's backend spec
   only defined per-request approve/reject.
2. **`GET /api/v1/vendor-portal/bank-change-requests`** (Vendor, own) — discovered while
   building `vendor-bank-change.html`: the backend spec gave vendors a way to *create* a
   request but no way to check its current approval stage afterward. Mirrors the existing
   `GET /vendor-portal/kyc-documents` (list own) pattern.
3. **`vendor_id` added to `ProfileStatusResponse`** — discovered while building the KYC
   upload page: the upload endpoint requires a `vendor_id` form field, but nothing
   returned it for a vendor with zero documents uploaded yet (the only prior source was
   the documents list, which is empty on a first visit). `profile/status` already has the
   vendor loaded server-side, so it now returns `vendor_id` too.

### Other flagged decisions

- **Bank-change approve/reject RBAC — expanded to Partner/VP, then reverted back to
  Accounts Executive/System Admin only after user testing**: the backend spec restricts
  these endpoints to Accounts Executive/System Admin; mid-build this was briefly expanded
  to also include Partner/VP (asked and confirmed with the user, on the theory that the
  UI's "Bank Change Approvals" nav item and business rule 5.5's "Accounts Executive or
  higher" implied Partner/VP should do the second approval). After manual UAT, the user
  explicitly reversed this: **"limit to accounts team only, partner will not approve bank
  change details."** `approve`/`reject`/the list endpoint, and the client-side role gate in
  `bank-change-review.js`, are back to Accounts Executive/System Admin only. The test that
  had verified Partner-can-approve was rewritten into
  `test_bank_change_approval_blocked_for_partner`.
- **Screenshot verification unavailable this session**: the Browser pane wouldn't
  composite frames for pixel screenshots in this environment, so every page was verified
  functionally instead — accessibility-tree structure, network requests, and actual
  data returned after real actions (login, upload, verify, approve, reject) — rather than
  visually. The design-system rules that *are* mechanically checkable (no raw hex outside
  `tokens.css`, consistent class usage) were verified directly against the source.

## Post-UAT fixes

After Phase 2B UI, the user manually tested the app and reported five issues. All five
are fixed, plus two more bugs found during my own verification pass:

1. **Accounts couldn't view uploaded KYC documents.** There was no way to fetch the
   actual file — only metadata. KYC documents are sensitive PII (PAN, bank proof), so
   rather than a public `/uploads` static mount, added an authenticated
   `GET /api/v1/kyc-documents/{id}/file` endpoint (`kyc_service.get_document_file`) that
   checks the caller is either the owning vendor or a reviewer role, resolves the stored
   `file_url` back to a path with traversal protection
   (`storage.resolve_upload_path`/`UPLOADS_ROOT`), and streams it back. The frontend can't
   set an `Authorization` header on a plain `<a href>`, so `kyc-review-queue.html`'s "View
   Document" button uses a new `openAuthenticatedFile()` helper in `api.js` that fetches
   with the JWT and opens the result as a blob URL.
2. **Login page still showed the old style.** `login.html` predated `tokens.css`/
   `app-shell.css` and had never been retrofitted. Rebuilt onto the shared design system.
3. **Staff dashboard still showed the old style.** Same issue as #2 — `dashboard.html`
   retrofitted onto the app shell.
4. **Old pages only looked "updated" after clicking into a sub-page.** Root cause of #2
   and #3: only `dashboard.html`'s *nav links* had been updated for Phase 2B roles, not
   its visuals, and `login.html` hadn't been touched at all — so the entry points to the
   app looked stale even though pages reached via nav (which were already Phase 2B-style)
   looked right. Fixed by retrofitting **all six** Phase 0/1 pages (`login`, `dashboard`,
   `vendor-request-form`, `vendor-requests-list`, `request-detail`, `item-codes`) onto
   `tokens.css`/`app-shell.css`, so navigating anywhere in the app now looks consistent
   from the first screen. `main.css` (the old stylesheet) and the old `renderNav()`/
   `statusBadgeHtml()` JS were deleted once nothing referenced them; navigation and status
   badges across the whole app now go through one shared `renderAppShell()` /
   `badgePillHtml()` in `api.js`.
5. **Bank-change approvals should be Accounts-only, not Partner/VP** — see the RBAC bullet
   above.

**Bugs found during my own verification, not user-reported:**

- **Vendor-role staff accounts saw portal-only nav links on the wrong dashboard.**
  `/auth/login` (the staff login, as opposed to the vendor-portal's OTP flow) doesn't
  check role, so a plain `Vendor`-role account with no `linked_vendor_id` (e.g. Phase 0's
  seeded `vendor@test.com`) could land on the staff `dashboard.html`. Once `NAV_BY_ROLE`
  gained a `Vendor` entry (needed for `vendor-dashboard.html`'s sidebar), that same entry
  started leaking portal links (Upload KYC Documents, Bank Change Request) onto the staff
  dashboard too, where they'd fail since the account isn't portal-activated.
  `dashboard.js` now special-cases `user.role === "Vendor"` to always show "No actions
  available yet" on this page specifically, per Phase 1's original spec for roles with no
  Phase 1 involvement.
- **Browser was serving stale JS/CSS after edits.** Static files were being cached
  aggressively client-side, so a corrected file on disk (confirmed via direct `curl`)
  could still execute as the old version inside a page that had loaded it before. Added
  `NoCacheStaticFiles` (`app/main.py`) — a `StaticFiles` subclass forcing
  `Cache-Control: no-cache` on everything under `/static/*`. Worth keeping even outside
  development: without it, real users would keep running stale JS/CSS after any future
  deploy until they hard-refresh.

Full regression: all 52 pytest tests pass after these changes.

## Phase 3A — Purchase Order Management, Budget Control & GRN/SCN

Backend only (SRS Module 5). A PO can only be created when an active vendor-item
combination (Phase 1), an active covering agreement (Phase 2A), and sufficient budget all
exist. Budget is committed on PO approval and released on cancellation. Amendments
(qty/rate/delivery-date changes) are versioned and force a fresh PO approval. Vendor
acknowledgement and partial GRN/SCN delivery tracking round out the workflow — this is the
foundation Phase 3B's Invoice submission will three-way-match against.

New tables: `budget_heads`, `purchase_orders`, `po_amendments`, `budget_commitments`,
`grn_scn`, `po_code_sequences` (PO-number sequence, mirrors `vendor_code_sequences`/
`agreement_code_sequences`). All 14 required tests pass
(`tests/test_purchase_orders.py`); full manual walkthrough of Section 8's script (budget
head → hard-blocked over-budget PO → valid PO → approve → cancel/release → amend → fresh
approval → vendor acknowledge → two partial GRNs → third GRN blocked) confirmed against a
live server.

### Phase 3A notes / flagged decisions

- **PO approval is a placeholder, per Section 2**: `Budget Controller` or `Partner / VP`
  approves every PO; this will be replaced by the real DoA engine in Phase 4. Not treated
  as final business logic.
- **`PurchaseOrderStatus.REJECTED` and `PurchaseOrder.rejection_reason` added, beyond
  Section 3.2's listed status values**: Section 4.1 requires a rejected PO to reach "a
  terminal rejected state... clearly distinguishable from Cancelled" but doesn't add
  `Rejected` to the model table. Added it (mirroring the `Rejected` pattern already used by
  vendor requests, KYC documents, and bank-change requests), with a mandatory
  `rejection_reason` captured on reject — consistent with every other reject flow in this
  codebase.
- **`POST /api/v1/po-amendments/{id}/reject` added — not listed in Section 6's table.**
  Section 4.3's workflow explicitly requires a reject path ("→ rejects → amendment
  Rejected, PO unchanged") but only an `approve` endpoint is listed. Added the mirror
  `reject` endpoint with the same RBAC (Budget Controller, Partner/VP, System Admin),
  following the same "flag backend additions" pattern established in Phase 2B UI.
- **Rate card's unit — Section 3.2 says PO's `unit` comes "from rate card's unit," but
  `RateCard` has no `unit` column** (only `ItemCode` does). Resolved by pulling `unit` from
  the PO's `item_code` instead, since a rate card always points at exactly one item code.
- **Agreement must belong to the same vendor as the PO** — not explicitly stated in Section
  5's business rules, but implied by "active agreement covering that item": an `Agreement`
  is already scoped to one `vendor_id` in the Phase 2A model, so a PO whose `agreement_id`
  points at a different vendor's agreement is rejected as if the agreement weren't active/
  covering, rather than silently allowed.
- **Cancellable states — "Approved or earlier" (Section 4.4) interpreted as `Pending_
  Approval` or `Approved` only.** `Vendor_Acknowledged` is treated as a later lifecycle
  stage and is not cancellable in this phase (no endpoint currently un-acknowledges a PO
  that far along). Flagging in case cancellation after vendor acknowledgement turns out to
  be needed later.
- **Amendment approval releases the PO's existing budget commitment.** Section 4.3 has the
  PO revert to `Pending_Approval` after an amendment is approved, but Section 9 doesn't say
  what happens to the budget already committed against the *old* total. Since the PO is no
  longer in an Approved state, its old commitment is marked `is_released=true` at amendment-
  approval time; a fresh commitment is created at the *new* total the next time
  `/purchase-orders/{id}/approve` is called. This avoids double-counting budget against a PO
  that isn't currently approved for anything. No self-approval block was added for PO
  amendments (unlike Phase 2A's rate-card amendments) since Section 5 doesn't require one for
  this phase — flagging in case that's an intentional omission worth closing.
- **Budget head `sanctioned_amount` is never decremented directly** — only tracked via
  `budget_commitments` rows (created on PO approval, released on cancellation/re-amendment),
  per Section 3.4's model. `GET /budget-heads/{id}/availability` computes
  `sanctioned - sum(active commitments)` on every read rather than storing a running balance,
  same pattern as Phase 2A's `Agreement.status` being computed rather than stored.
- **Test-layer repository convention shift**: `purchase_order_repository`,
  `po_amendment_repository`, and `budget_commitment_repository`'s `save`/`create` functions
  flush without committing (rather than committing internally like earlier phases'
  repositories) — Phase 3A's workflows routinely touch 2-3 tables in one operation (e.g.
  amendment approval updates the amendment, the PO, and a budget commitment together), so the
  service layer owns the transaction boundary and issues one `db.commit()` per operation.
  `budget_head_repository` and `grn_scn_repository` keep the old commit-inside-repository
  pattern since those are always single-table writes.

## Phase 3B — Invoice Submission Portal

Backend only (SRS Module 6). A vendor submits an invoice against a PO (or an Agreement
directly, for non-PO billing) and the system runs full three-way matching (PO vs.
GRN/SCN vs. Invoice) at submission time — hard-blocking, must-correct, or soft-flagging
per Section 5's severity table. Invoice status in this phase is binary: `Draft` (created,
documents attachable) or `Submitted` (validations passed, read-only from then on); nothing
in between is persisted — a failed submission leaves the invoice `Draft` and saves none of
the flag/status changes.

New tables: `invoices`, `invoice_documents`. All 16 required tests pass
(`tests/test_invoices.py`); full manual walkthrough of Section 8's script (incomplete-KYC
block → complete KYC/acknowledge/GRN → successful submission → same-vendor duplicate
blocked / cross-vendor duplicate allowed → rate variance flagged not blocked → bad GST
breakup blocked → PO balance decreasing correctly → MSME alert notification) confirmed
against a live server.

### Phase 3B notes / flagged decisions

- **`InvoiceStatus.DRAFT` added, beyond Section 3.1's "only value this phase produces:
  Submitted."** Section 4's workflow explicitly has the vendor create a row via
  `POST /invoices` *before* uploading documents or submitting — that row needs a status
  distinct from `Submitted` to exist in between. Read the spec's note as being about what
  `/submit` *produces*, not as forbidding an unsubmitted state; `Draft` fills that gap the
  same way Phase 3A's `PurchaseOrderStatus.REJECTED` filled an analogous gap.
- **Two separate "does the math add up" checks, split by when they run**: Section 2 frames
  "`total_invoice_amount` must match the uploaded PDF total" as stubbed down to "matches
  `taxable_amount + total_gst_amount`," and Section 5.8 separately checks the vendor's GST
  breakup against the *rate-derived* expected GST. These are different comparisons, so they're
  implemented separately: the taxable+GST arithmetic check runs at `POST /invoices` (creation
  time, since it only needs the payload's own fields — a structural 422 on malformed input);
  the rate-derived GST check is Section 5.8 itself, running at `/submit` per Section 4's
  workflow and populating `gst_mismatch_delta`.
- **A single `InvoiceValidationError` covers every Section 5 hard-block / must-correct check
  at submit time**, rather than ~13 distinct exception classes — each `raise` carries its own
  message, satisfying Section 4's "422 with the specific failed check(s) named" without an
  explosion of near-identical exception types for checks that all map to the same HTTP status.
  `NotOwnVendorError` / `InvoiceNotFoundError` / `AlreadySubmittedError` stay separate since
  those map to 403/404/400 respectively, not 422.
- **`item_code_id` consistency validated at creation, not at submit**: Section 3.1 says
  `item_code_id` "must match the PO's/agreement's item," but this isn't one of Section 5's
  numbered severity-graded checks — it's closer to Phase 3A's "agreement must belong to the
  same vendor" structural check. Enforced when the invoice is created: if PO-based, must match
  the PO's own `item_code_id` (and the PO's `agreement_id` must match the supplied one); if
  Agreement-only, must be one of the agreement's covered item codes.
- **Rate card's `unit` field doesn't exist, again**: same Phase 3A gap (Section 3.2's `unit`
  note pointed at `RateCard`, which has no `unit` column). Not applicable here since Phase 3B's
  `invoices` table has no `unit` field of its own — noting only because the same underlying
  rate-card/item-code relationship is reused for the Rule 7 variance check.
- **PO cancellable-states decision from Phase 3A matters here too**: since cancellation is only
  reachable from `Pending_Approval`/`Approved` (not `Vendor_Acknowledged`), a PO that's already
  reached the state Rule 10 requires for invoicing can no longer be cancelled out from under an
  in-flight invoice — this wasn't a deliberate Phase 3B design choice, just a consequence of the
  earlier Phase 3A decision worth knowing about.
- **GSTIN "active" stub reuses `core.validators.validate_gstin`** (format-check only, per
  Section 2) rather than adding a new validator — a vendor with no GSTIN, or one that fails the
  standard GSTIN regex, is treated as "inactive" for Rule 5's purposes.
- **MSME notification goes to every active `Accounts Executive` user**, not a single fixed
  recipient — added `user_repository.list_by_role_name()` since nothing already listed users by
  role. Mirrors how Phase 2B's bank-change notifications target the vendor's own portal user,
  just fanned out to a role instead of one person.

## Phase 3 UI — PO Management, GRN & Invoice Submission Screens

UI layer for Phase 3A + 3B, built on Phase 2B's `tokens.css`/`api.js` unchanged, plus a new
`components.css` for the budget utilization bar and the rate-variance/MSME flag tags.
New pages: `budget-heads`, `po-create`, `po-list`, `po-detail`, `invoices-list`,
`invoice-detail` (internal); `vendor-po-list`, `vendor-invoice-submit` (5-step form),
`vendor-invoices-list` (vendor portal). Every workflow in the manual test script (Section
6) was walked end to end against a live server — budget head creation, an over-budget PO
block with the exception path, approval updating the utilization bar live, vendor
acknowledgement's deliberate confirm step, GRN recording with cumulative-vs-quantity
visibility, the live PO-balance and GST-mismatch feedback on the invoice form, successful
submission appearing in both invoice lists with the correct flag tags, and internal
invoice-detail review with working document downloads.

### Backend additions made for this UI phase

Per the established "add and report" pattern (Phase 2B UI), four endpoints were missing
that this UI genuinely needs and had no other way to get:

1. **`GET /api/v1/vendors/{vendor_id}/item-codes`** — `po-create.html` needs to offer only
   a vendor's *active* vendor-item combinations; only a `POST` (create link) existed.
2. **`GET /api/v1/purchase-orders/{po_id}/amendments`** — `po-detail.html` needs to show
   amendment history; only single-amendment `approve`/`reject` existed, no list.
3. **`GET /api/v1/invoices/{invoice_id}/documents`** — `invoice-detail.html` needs to list
   an invoice's documents; only the upload `POST` existed.
4. **`GET /api/v1/invoices/documents/{document_id}/file`** — `invoice-detail.html`'s
   document view/download links need an authenticated file endpoint; none existed for
   invoice documents (KYC documents got one post-UAT in Phase 2B, invoices never did).
   Mirrors `kyc_documents.download_document_file`'s pattern exactly — owning vendor or any
   internal role, path resolved through the same `storage.resolve_upload_path` guard.

### Flagged decisions

- **No distinct "info" color exists in `tokens.css`** for the MSME flag tag (Section 3.5
  calls it "info-style"). Rather than adding one silently, the MSME tag reuses
  `--color-primary` outlined; the rate-variance tag uses `--color-warning` outlined as the
  spec explicitly names. Flagging per Section 8's explicit instruction to flag rather than
  invent a new token.
- **Cancel button gated to `Pending_Approval`/`Approved`, not "not yet Cancelled" as
  literally written** (Section 3.4): the backend only permits cancellation from those two
  statuses (a Phase 3A decision, not new here). Showing the button on
  `Vendor_Acknowledged`+ POs would just produce a guaranteed-to-fail click, so it's hidden
  instead — consistent with every other conditional-action pattern in this codebase (e.g.
  Phase 1's request-detail action gating).
- **PO amendment approve/reject surfaced on `po-detail.html`, not a separate page**: Section
  3.4 only lists "Propose Amendment" as a page-level action but the workflow isn't
  completable without somewhere to *approve* one, and Section 3's page list has no dedicated
  amendments page. Approve/Reject buttons appear inline on a `Pending_Approval` amendment's
  entry in the amendment history list, visible only to Budget Controller/Partner/Admin — a
  necessary addition to keep the workflow completable, not an explicit spec line item.
- **Invoice number is vendor-entered, not auto-generated**: Section 4.2's step list doesn't
  mention an "invoice number" field anywhere across its 5 steps, but the backend's
  `invoice_number` is mandatory and is literally what Rule 1's duplicate check keys off.
  Added an explicit "Your Invoice Number" field to Step 3 (Details) rather than generating a
  meaningless timestamp-based value that would defeat the vendor's own numbering and make
  the duplicate-detection demo (manual test script point 4 from the Phase 3B round)
  meaningless in this UI.
- **`total_invoice_amount` is auto-computed and read-only in the vendor form**, not a
  separate vendor-entered field, even though the backend schema accepts it as one. Since
  Phase 3B's own design treats the taxable+GST-vs-total check as a stub for real PDF
  verification (Section 2), computing it live from taxable + entered GST removes an entire
  class of avoidable rejection before it can happen, and nothing in Section 4.2 says the
  vendor must type it manually.
- **"PO Approvals" nav links carry a `?status=Pending_Approval` query string**, reusing
  `po-list.html` per Section 5's explicit instruction — but `renderAppShell()`'s active-link
  highlighting compares only the bare filename, so that sidebar item won't show as
  "active" while sitting on its own target page. Cosmetic only; not fixed, to avoid
  reworking the shared active-link logic for one query-string case.
- **Screenshot verification unavailable again this session** (same Browser-pane compositing
  limitation noted in Phase 2B UI): every page and interaction was verified functionally
  instead — DOM text extraction, live API calls via the actual page JS, and console-error
  checks — after confirming mechanically (via `grep`) that no new colors were introduced
  outside `tokens.css`.

## Phase 4A — Parameterised Invoice Approval Workflow

Backend only (SRS Module 7 + the DoA matrix from SRS §2.2). A `Submitted` invoice is
routed via `POST /invoices/{id}/route-for-approval` into a 4-stage sequence — L1
(Accounts Executive) → L2 (Dept. Manager) → L3 (Partner/VP) → L4 (Finance Team) — chosen
by matching the invoice's total against a configurable `doa_matrix` amount-slab table.
L2/L3 are skipped entirely (never `Pending`) when the matched slab doesn't require them.
Any approver at the currently-active stage can raise a query, which pauses that stage
(`tat_paused=true`) and sets the invoice to `Query_Raised` without losing its place; the
vendor's response re-enters the *same* level, never L1. A `Returned_To_Vendor` invoice
requires the vendor to resubmit and Accounts to re-route it — routing is never automatic.
Delegation lets one user act on another's pending items for a bounded date range without
requiring the delegate to hold the same role. An escalations endpoint lists any `Pending`,
non-paused stage whose TAT has passed (no background job — a live query, per Section 2).

New tables: `doa_matrix`, `invoice_approvals`, `invoice_queries`, `approval_delegations`;
`invoices` gained a `doa_matrix_id` FK and 9 new status values. All 16 required tests pass
(`tests/test_invoice_approvals.py`); full manual walkthrough of Section 8's script
(small-invoice routing with L2/L3 Skipped → L1 verify skipping straight to L4 → large-
invoice routing with L2/L3 both Pending → full L1→L2→L3→L4 walk with wrong-role 403s at
every stage → query raised at L2 → vendor response re-entering L2_Review not L1 →
delegation letting a non-Dept.-Manager act on a Dept. Manager's pending L2 item →
escalations surfacing a manually-backdated `tat_due_at`) confirmed against a live server.

### A real bug this walkthrough caught (that the test suite didn't)

Routing a live invoice on the dev server failed with `invalid input value for enum
invoice_status: "L1_VERIFICATION"` — a genuine bug, not a test artifact. This codebase's
enum columns (built via plain `SAEnum(SomeEnum, name="...")`, no `values_callable`
anywhere) store the Python enum **member name** as the native Postgres label, not
`.value` — confirmed by checking `purchase_order_status`, which stores `PENDING_APPROVAL`,
not `Pending_Approval`. The Phase 4A migration's hand-written `ALTER TYPE invoice_status
ADD VALUE` statements (needed because Alembic autogenerate doesn't detect added Postgres
enum labels) used `.value`-style strings (`'L1_Verification'`) instead of following that
established `.name`-style convention (`'L1_VERIFICATION'`), so the native type had the
wrong labels for every one of Phase 4A's 9 new statuses.

**Why the automated tests never caught this**: `tests/conftest.py` builds the test
database from scratch via `Base.metadata.create_all()` on every run, which generates a
fresh, internally-consistent enum type straight from the current Python class — it never
goes through the (broken) hand-written migration path at all. Only a real migration
against a persistent database exercises that code, which is exactly what live manual
verification is for and automated tests structurally cannot catch on their own.

**Fix**: corrected the migration file to use `.name`-style labels, and applied the
corrected `ALTER TYPE ... ADD VALUE` statements directly to the dev database (Postgres has
no `DROP VALUE`, so the original mixed-case labels are still present as harmless, unused
leftovers — rebuilding the type to remove them wasn't worth the risk for a local dev DB).
A fresh database created from `alembic upgrade head` from now on gets the correct labels
the first time.

### Other flagged decisions

- **`l4_role` seeded as `"Finance Team"` for every slab**, not `"Finance Head"` as Section
  3.1 suggests for some slabs. Only `Finance Team` is an actually-seeded role usable for
  RBAC (`require_role()` checks against real role names) — `Finance Head` doesn't exist
  anywhere else in this system, so using it would create an unreachable stage. Flagging in
  case a distinct `Finance Head` role is wanted later, matching the same pattern as Phase
  2B's `is_company` and Phase 3A's CFO co-approval flags.
- **L4's `Hold`/`Release` never changes the `invoice_approvals` row's own `status`** —
  Section 3.3's enum for that column has no `On_Hold` value, only `invoice.status` does.
  The L4 row stays `Pending` throughout a hold; `Release` (a same-endpoint action, per
  Section 4.2's "released back... via the same action endpoint") is handled as a special
  case in `take_action` that bypasses the normal "stage must match the invoice's current
  active level" check, since Hold/Release are pure invoice-status toggles that never touch
  the row.
- **"Active stage" is enforced by comparing `invoice.status` to the approval row's level**,
  not by the row's own `status` field alone. Section 4.1 creates the L4 row as `Pending`
  immediately at routing time, "but only becomes actionable once L1-L3 complete" — since
  Pending alone can't distinguish "L4 pending but not yet reached" from "L4 pending and
  ready to act," `take_action`/`raise_query` additionally require `invoice.status` to equal
  that level's status constant (e.g. `L2_Review` for an L2 row) before allowing any action.
- **No `GET /invoices/{id}/approvals` list endpoint was added**, even though tests needed
  a way to find each stage's id after routing. Section 6 doesn't list one, and — unlike
  Phase 3 UI's additions — nothing in *this* phase's own required tests or manual script
  needs it through the API; tests fetch `invoice_approvals` rows directly via a test-only
  DB session, mirroring how `existing_vendor_id` and similar fixtures already do direct
  DB lookups elsewhere in this suite. Worth adding once a Phase 4 UI needs it.
- **Business-day TAT adder has no holiday calendar**, per Section 5.6's explicit "doesn't
  need to account for holidays in this phase" — `add_business_days()` only skips
  Saturday/Sunday.
- **Query response always recomputes `tat_due_at` from "now"** rather than resuming a
  paused countdown, per Section 4.3's "recompute... or simply reset it; pick one and be
  consistent" — reset was chosen since it's simpler and the spec explicitly allows either.

## Phase 4B — Payment Status Recording

Backend only (SRS Module 8, scope-corrected per the spec's Section 1 — VPMS records that
a payment already happened outside the system; it never executes a transfer). An
`Approved_For_Payment` invoice gets a `payment_due_date` computed once, at the exact
moment it reaches that status (added to Phase 4A's existing `_handle_l4` L4-approve
branch, additively — all 16 Phase 4A tests still pass unchanged), as
`MIN(invoice_date + agreement.credit_period_days, Approved_For_Payment date + 45 days)`,
with the 45-day leg only considered for MSME vendors. Finance (maker) records a payment
via `POST /payments` — TDS section/rate default from the invoice's agreement, are
server-computed for `tds_amount`/`net_payable_amount`, and any override away from the
default requires a mandatory reason, logged to `tds_override_log`. A *different* Finance
user (checker) then confirms (→ invoice `Paid`, UTR permanently on the payment record) or
rejects (→ invoice stays `Approved_For_Payment`, maker must record a fresh row — no
edit-in-place, per Section 2). Late-payment interest (`(base_bank_rate + 3%) × days late /
365`) is computed and stored as a flag at recording time if `payment_date` is after
`payment_due_date` — informational only, never an automatic deduction.

New tables: `payments`, `tds_override_log`, `settings`; `invoices` gained a
`payment_due_date` column and a `Paid` status. All 14 required tests pass
(`tests/test_payments.py`); full manual walkthrough of Section 8's script (MSME invoice
with an earlier due date sorting above larger non-MSME invoices in the queue → TDS
override with reason recalculating `net_payable_amount` and logging the override → same-
user confirm blocked with 403 → different-user confirm flipping the invoice to `Paid` with
the UTR visible via `GET /payments/{id}` → a second payment attempt against the now-`Paid`
invoice blocked → an MSME invoice patched to 3 days from its due date appearing in
`/payments/msme-alerts` as `At_Risk` → a payment recorded 12 days after its due date
showing a non-zero `late_payment_interest_amount`) confirmed against a live server, reusing
Phase 4A's already-`Approved_For_Payment`/near-payable dev invoices rather than rebuilding
vendor onboarding from scratch each time.

### Flagged decisions

- **"Acceptance date" for the MSME 45-day rule is the moment the invoice reaches
  `Approved_For_Payment`**, i.e. `date.today()` at that exact `_handle_l4` transition —
  Section 2 explicitly flags this as undefined in the SRS and says to confirm; going with
  the phase's own end (Approved_For_Payment) rather than GRN date or submission date,
  since that's the point this system actually treats the invoice as payable.
- **TDS section defaults from the invoice's `agreement.tds_section`, not the vendor's**
  — both exist (vendor's is a category-level suggestion, agreement's is the actual
  effective section for that specific engagement, itself defaulted from the vendor's at
  agreement-creation time with its own override+reason mechanism). The agreement's is the
  more specific, already-negotiated value, so it's the correct default to override *again*
  from at payment time.
- **TDS rate-by-section is a new stub (`TDS_RATE_BY_SECTION` in `app/services/stubs.py`)**
  — no rate-table data source exists anywhere in this codebase (Phase 1 only ever stored
  the *section* string, never a rate). Seeded with the standard 194C/194J/194Q percentages
  and a 10% fallback for anything else, mirroring the existing `TDS_SECTION_BY_CATEGORY`
  stub's shape and its "overridable with a mandatory reason" pattern.
- **`base_bank_rate` defaults to 6.50%** (`setting_service.DEFAULT_BASE_BANK_RATE`) when no
  `settings` row exists yet, rather than requiring one to be seeded first — keeps a fresh
  database and the test suite deterministic without a migration-time data seed being load-
  bearing. `app/seed.py` still seeds an explicit row for the dev database so
  `GET /settings/base-bank-rate` reflects something an Admin has actually set.
- **API access lists use `Finance Team` + `System Admin` only, dropping `Finance Head`**
  from Section 6's access column — same substitution Phase 4A's DoA matrix already made
  for `l4_role`, since `Finance Head` isn't a real seeded role anywhere in this system.
  Section 5.7's "alert Finance Head/CFO-equivalent" is likewise read as "the same
  substituted audience."
- **The UTR isn't duplicated onto the `invoices` table.** Section 3.1 lists only
  `payment_due_date` and the `Paid` status as invoice-level additions ("build ONLY what is
  listed"), so "the UTR is visible on the invoice" (Section 8, point 4) is satisfied via
  `GET /payments/{id}` — the payment id is already known to whoever just recorded or
  confirmed it — rather than by adding a column the spec's own data-model section doesn't
  ask for.
- **Section 5.7's "overdue 7+ days" notification is not a side effect of
  `GET /payments/msme-alerts`.** Turning a read endpoint into one that writes
  `notifications` rows on every poll would spam duplicates with no dedup field specified,
  and there's no background scheduler anywhere in this system to drive it independently —
  the same reasoning Phase 4A's `list_escalations` already applied to its own "flag
  breached TAT" endpoint. The alert is fully visible in the response payload
  (`alert_type: "Overdue"`); a real notification write would need a dedup strategy this
  phase doesn't specify.
- **Rule 9's "block a second `Checker_Confirmed` payment" check is effectively a defensive
  backstop, not the primary gate.** Because confirming a payment also flips
  `invoice.status` to `Paid` in the same transaction, a second `POST /payments` against
  that invoice is normally caught earlier by the "must be `Approved_For_Payment`" check
  (Rule 1) — both return the same 400. The dedicated duplicate-confirmed check stays in
  `payment_service.py` as an explicit invariant per Section 5.9, in case a future change
  ever lets a confirmed payment coexist with a non-`Paid` invoice status.

## Phase 5 — MIS Dashboard, Standard Reports & Audit Trail (Backend)

The final backend phase, and by far the widest: a tamper-evident audit trail retrofitted
into every write endpoint from Phase 0 through 4B, plus a real-time MIS dashboard and the
11 SRS-standard reports, all reading from every prior phase's data.

**Audit trail.** `audit_logs` is a hash-chained, append-only table — `record_hash =
SHA256(row content + previous_hash)`, where `previous_hash` is the immediately preceding
row's `record_hash` (or 64 zeros for the very first row). `GET /audit-logs/integrity-check`
walks the whole table in insertion order, recomputes each row's hash from its stored
content, and reports the specific row id/sequence of any mismatch — critically, it
continues the chain using each row's *stored* hash (not the freshly recomputed one), so
tampering with one row flags exactly that row rather than cascading a false "broken" flag
onto every row created after it. **No update or delete route exists anywhere for this
table** — enforced by simply never building one, per the spec's explicit instruction.

A single shared utility, `audit_service.log_audit(...)`, is called once from every write
endpoint across the entire application (47 endpoints across 19 route files, from Phase 0's
login through Phase 4B's payment confirmation). Two small generic helpers made this
tractable without hand-picking fields at every call site: `model_to_dict(obj)` flattens any
SQLAlchemy model instance into a plain dict of its column values, and `diff_fields(before,
after)` compares two such dicts and returns only the fields that actually changed — so an
`Update`-type log call is just "snapshot before, call the existing service function
unchanged, snapshot after, diff." Every retrofit was additive only: no existing endpoint's
response body, status code, validation, or business logic was touched, and every previous
phase's full test suite was re-run after each phase's retrofit (not just once at the end)
to catch breakage immediately rather than needing to bisect it later. Final combined run:
**127/127 passing** (112 carried over + this phase's own 15).

### Flagged decisions

- **A `sequence` column drives hash-chain ordering, not `timestamp`.** The spec's field
  list doesn't mention one, but `timestamp` alone can tie at second-level precision under
  concurrent writes, which would make "the immediately preceding row" ambiguous — `log_audit`
  assigns `sequence = previous_row.sequence + 1` using the same "fetch the latest row"
  lookup the hash chain already needs, so this added no extra query.
- **Vendor-portal OTP verification (`POST /vendor-portal/auth/verify-otp`) also logs
  Login/Login_Failed**, even though Section 4.4 names only Phase 0's staff login
  endpoint. Login-step1 only checks a password (no session is issued), so the actual
  authentication moment for the vendor population is verify-otp — leaving an entire user
  population's logins unaudited felt like a bigger gap than the spec's wording strictly
  required. No corresponding "Logout" event exists anywhere: this app's logout is a
  client-side token discard with no server round-trip, so there's nothing to hook.
- **`Notification.mark_as_read` is not audit-logged.** It's a personal, low-value UI state
  toggle on a per-user read receipt, not a business-record mutation — logging every
  notification-bell click would add noise without oversight value. Every other write
  endpoint in the app (47 of them) is covered; this is the one deliberate exclusion,
  consistent with Section 2's "meaningful" qualifier.
- **KYC document review and bank-change approval/rejection log as `Approve`/`Reject`**,
  not generic `Update` — matches the PO/rate-card-amendment/invoice-approval precedent
  already established by the retrofit, and is more useful for an auditor scanning by
  action type than a wall of undifferentiated `Update` rows.
- **Section 5's report-access table never lists `Compliance / Audit` for any of the 11
  reports** — only System Admin plus various business roles. But Section 9's own manual
  verification script says to log in as an Auditor and confirm you can "view... every
  report." An oversight role that's blocked from the reports it exists to oversee doesn't
  hold together, so every report's (and the dashboard's — same reasoning) allowed-role list
  was widened to include `Compliance / Audit`. Purely additive and read-only, so it doesn't
  touch the "no write access anywhere" guarantee `test_auditor_role_blocked_from_all_write_...`
  checks.
- **`Finance Head` is substituted with `Finance Team`** in the dashboard/report access
  lists, same substitution as every prior phase's DoA matrix and payment endpoints —
  `Finance Head` isn't a real seeded role anywhere in this system.
- **Total payables / aging amounts are estimates, not always a real number.** Rule 4 says
  "sum of `net_payable_amount` for unpaid `Approved_For_Payment` invoices," but
  `net_payable_amount` only exists once a payment has actually been *recorded* — most
  Approved_For_Payment invoices don't have one yet. `_estimate_net_payable` uses a real
  Maker_Recorded payment's actual net amount if one exists, otherwise estimates using the
  same default-TDS logic Phase 4B's `payment_service` applies at record time — the closest
  real number available rather than a fabricated placeholder.
- **Aging buckets have no separate "not yet due" bucket.** The SRS's four ranges are all
  "days overdue," but plenty of Approved_For_Payment invoices aren't due yet. `max(0, days
  overdue)` folds every not-yet-due invoice into the `0-30` bucket alongside genuinely
  0-30-days-overdue ones, rather than inventing a fifth bucket the spec doesn't define.
- **Vendor category stands in for "spend category"** in the spend-by-category dashboard
  endpoint — no other categorization concept exists anywhere in this system's data model.
- **Form 16A's "quarter" is a calendar quarter (Jan-Mar, Apr-Jun, …), not the Indian
  financial-year quarter** a real Form 16A would use (Apr-Jun, Jul-Sep, …). Consistent with
  Section 2's "data-only" carve-out for this report — the underlying gross/TDS numbers are
  real, the quarter label is a stub simplification.
- **`vendor-compliance-status`'s `document_expiry` is always `"N/A"`.** No document-expiry
  field was ever captured anywhere in Phase 2B's KYC model — reported honestly as
  unavailable rather than fabricated.
- **`bank_verified` reuses Phase 1's `IFSC_LOOKUP` stub** (the same stub that auto-fills
  bank name/branch at vendor creation) as a proxy for "this account's IFSC is known-good" —
  there's no separate bank-verification concept anywhere else in the system.
- **Report endpoints return `list[dict]`, not 11 dedicated Pydantic response schemas.**
  Deliberate: Phase 5 UI's spec explicitly asks for a *generic* report viewer driven by
  whatever fields the response actually contains, and hand-writing 11 rigid schemas would
  work against that. CSV export reuses the exact same list-of-dicts each report's JSON
  handler builds (`core/csv_export.py`, one shared formatter), so the two formats can never
  silently diverge for the same filters.

## Phase 5 UI — MIS Dashboard, Reports Grid, Report Viewer & Audit Trail Screens

Four new pages, all reusing the existing `app-shell`/`card`/`card-grid`/table components —
Chart.js (CDN) is the one deliberate exception to "no external libraries," per the spec's
own carve-out for charting.

- `static/pages/mis-dashboard.html` + `static/js/mis-dashboard.js` — four KPI cards (total
  payables, overdue invoices, MSME risk count, budget utilization) from
  `GET /mis/dashboard/summary`; an aging bar chart from `GET /mis/dashboard/aging` whose
  bars are clickable — a click re-fetches `GET /reports/aging-analysis` and renders the
  matching invoices in a table underneath, so the drill-down is real filtering, not
  decorative; and a spend-by-category chart from `GET /mis/dashboard/spend-by-category`
  with its own filter panel (vendor, department, date range — the only three params that
  endpoint actually accepts) plus "This Month"/"Last Month" quick-preset buttons, and a
  click-to-isolate interaction on individual category bars.
- `static/pages/reports.html` + `static/js/reports.js` — a card grid built entirely from
  `api.js`'s `REPORT_DEFINITIONS` (added earlier alongside the backend), each card linking
  to `report-viewer.html?type={slug}`.
- `static/pages/report-viewer.html` + `static/js/report-viewer.js` — one generic viewer for
  all 12 reports. The filter panel is built dynamically from `REPORT_DEFINITIONS[type].filters`
  (only `vendor_id`/`department`/`date_from`/`date_to` ever appear, so those four are the
  only filter widgets implemented), and the results table reads its columns from
  `Object.keys(rows[0])` rather than a hardcoded column list per report — deliberately, so
  it stays generic as reports evolve. "Export CSV" re-requests the same endpoint with
  `?format=csv` and forces a download via a blob-backed anchor click (a plain
  `window.open(blobUrl)` doesn't reliably honor the server's `Content-Disposition:
  attachment` header once the response has been converted to a blob).
- `static/pages/audit-trail.html` + `static/js/audit-trail.js` — filter panel (user, module,
  action, record reference, date range); user and module dropdown options are populated by
  reading the actual data (`GET /users` for users, distinct `module` values from an initial
  unfiltered `GET /audit-logs` call) rather than a hardcoded list, since no "list distinct
  modules" endpoint exists. Rows expand in place on click to show session/IP, the
  field-change diff (via the `.audit-field-change` CSS classes already added to
  `components.css`), and the row's own `record_hash`. "Run Integrity Check" calls
  `GET /audit-logs/integrity-check` and renders any breaks in a table (sequence / expected
  hash / stored hash). Intentionally zero write, edit, or delete controls anywhere on the
  page, per the spec.

### Flagged decisions

- **The dashboard's filter panel only drives the spend-by-category chart, not the KPI cards
  or the aging chart.** The backend's `GET /mis/dashboard/summary` and `GET
  /mis/dashboard/aging` (built in the Phase 5 backend work) take no query parameters at
  all — only `GET /mis/dashboard/spend-by-category` accepts `vendor_id`/`department`/
  `category`/`date_from`/`date_to`. Rather than fake a global filter that silently does
  nothing to two of the three widgets, the filter panel is scoped to (and visually attached
  to) the one chart it actually affects.
- **CSV export downloads via a `download`-attribute anchor click on a blob, not
  `window.open`.** `openAuthenticatedFile` (the existing helper other pages use for viewing
  KYC documents) opens the blob in a new tab, which is correct for viewing a PDF/image but
  wrong for a CSV that should save to disk with a real filename — blob URLs don't carry the
  server's `Content-Disposition` header, so a fresh `<a download="...">` click was used
  instead.
- **Audit trail's "Module" and "User" filter options are derived from real data on load**,
  not hardcoded — no endpoint enumerates the distinct `module` strings the retrofit's 19
  route files actually log, so an initial unfiltered `GET /audit-logs` call seeds the
  dropdown once at page load.
