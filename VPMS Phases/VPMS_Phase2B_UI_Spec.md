# VPMS — Phase 2B (UI): Vendor Portal Screens

**Project:** Vendor Payment Management System (VPMS)
**Phase:** UI layer for Phase 2B (Vendor Onboarding & Self-Service Portal)
**Stack:** Plain HTML + CSS + vanilla JS, served as static files by FastAPI, calling the existing JSON API via `fetch()`.
**Builds on:** Phase 1 UI's `api.js` (JWT handling, error surfacing) — reuse and extend it, don't rewrite it.

This spec upgrades the visual bar from Phase 1's UI, which was intentionally bare. From here on, screens should look like real, considered software — not unstyled forms.

---

## 1. Objective

Build the vendor-facing screens (login with OTP, dashboard, KYC upload, bank change request) and the two internal review screens (KYC review queue, bank change approval queue) — with a coherent, professional design system applied consistently across all of them.

**Definition of Done:** A vendor can complete the full Phase 2B backend workflow through these screens, and an Accounts Executive/Partner can review and approve through matching internal screens — and it should look and feel like a cohesive product, not a stack of separately-styled forms.

---

## 2. Design System (apply consistently across every page — including retrofitting Phase 1's screens if time allows, though that's optional)

This is enterprise finance software — the design goal is **clarity and trustworthiness**, not flashiness. Restraint executed well, not decoration.

**Color palette** (define as CSS custom properties in a shared `tokens.css`, used everywhere — no inline hex values in individual pages):
- `--color-primary: #2B4570` (deep slate blue — primary actions, active nav)
- `--color-primary-hover: #1F3355`
- `--color-surface: #FFFFFF` (cards)
- `--color-background: #F5F7FA` (page background — soft neutral, not stark white)
- `--color-text: #1A2233`
- `--color-text-muted: #667085`
- `--color-border: #E2E6EC`
- `--color-success: #1B7F5C` / `--color-success-bg: #E6F4EF` (Verified, Approved)
- `--color-warning: #B7791F` / `--color-warning-bg: #FBF0DD` (Pending)
- `--color-danger: #B42318` / `--color-danger-bg: #FDECEA` (Rejected)

**Typography:**
- Headings: `Manrope` (weight 600–700) — has enough character to feel considered without being decorative
- Body/UI text: `Inter` — clean, highly legible at small sizes, standard for dense data UI
- Both loaded from Google Fonts or a CDN; define a type scale (e.g. 28/20/16/14/12px) as CSS variables, not ad-hoc sizes per page

**Layout:**
- Persistent left sidebar (nav) + top bar (user name/role, notification bell with unread count) + main content area, consistent across every authenticated page
- Content cards: white surface, 1px `--color-border`, 8px border-radius, subtle shadow (`0 1px 3px rgba(0,0,0,0.06)`) — this is the one repeated structural device, used for every distinct block of information
- 8px spacing scale (8/16/24/32/48) applied consistently — no arbitrary margins

**Signature element:** a circular progress ring showing KYC/profile completion percentage on the vendor dashboard — it's the one place worth a bit of visual craft, because it's the single most meaningful number on that screen (turns a checklist into an at-a-glance sense of "how close am I"). Keep every other element quiet by comparison.

**Status badges:** small pill shape, colored per status using the palette above (`Pending_Review`/`Pending_First_Approval` → warning, `Verified`/`Approved` → success, `Rejected` → danger) — reused identically across KYC documents, bank change requests, and any future status anywhere in the app.

**Interaction:** subtle hover states on buttons/rows (slight background shift, no heavy animation), visible keyboard focus outlines on all inputs/buttons, no unnecessary motion.

---

## 3. Pages

### 3.1 `vendor-login.html`
Two-step form on one page (step 2 only appears after step 1 succeeds, don't navigate to a separate page):
- Step 1: email + password → `POST /vendor-portal/auth/login-step1`
- Step 2: 6-digit OTP input (large, spaced digit-style input is a nice touch but a plain text input is acceptable) → `POST /vendor-portal/auth/verify-otp`
- Dev-mode note: since OTP delivery is stubbed, display the returned OTP on-screen in a clearly-labeled "Dev mode: your OTP is..." banner — remove or hide this before any real deployment, but keep it for now since there's no real SMS gateway
- On success: store JWT, redirect to `vendor-dashboard.html`

### 3.2 `vendor-dashboard.html`
- Top: greeting with vendor name, the KYC completion progress ring (signature element from Section 2)
- Card: KYC document checklist — each mandatory document type (fetched from profile/status) shown as a row with a status badge; a document not yet uploaded shows an "Upload" button inline
- Card: recent notifications (last 5, link to full notifications page)
- Card: quick links — "Upload Documents", "Request Bank Change"

### 3.3 `vendor-kyc-upload.html`
- One section per required document type (only the ones applicable to this vendor, per the backend's mandatory-doc logic — don't hardcode all 7 types blindly)
- File input + upload button per section, status badge showing current state, rejection reason shown inline (in the danger color) if applicable, with a re-upload option
- Calls `POST /vendor-portal/kyc-documents`

### 3.4 `vendor-bank-change.html`
- Simple form: new account number, new IFSC code
- On submit, show a clear "Pending approval" state with the current step (first/second approval) once status is fetchable
- Calls `POST /vendor-portal/bank-change-requests`

### 3.5 `vendor-notifications.html`
- List of notifications, unread visually distinguished (bold text + small dot), "mark read" on click
- Calls `GET /notifications`, `POST /notifications/{id}/read`

### 3.6 `kyc-review-queue.html` (internal — Accounts Executive/Admin)
- Table: vendor name, document type, uploaded date, status
- Row expands or links to a detail view showing the document (or its stub path/filename) with Verify/Reject buttons; Reject opens a reason field (required)
- Calls `GET /kyc-documents/pending`, `POST /kyc-documents/{id}/review`

### 3.7 `bank-change-review.html` (internal — Accounts Executive/Partner/Admin)
- Table: vendor name, requested change, current approval stage
- Approve/Reject buttons — if the logged-in user already approved step 1 of a given request, disable the button for step 2 on that same request with a short inline explanation ("You already approved this — a different approver is required"), rather than letting them hit the API and get a 403
- Calls `GET`/`POST` against the bank-change-requests endpoints (add a `GET` list endpoint here if the backend spec didn't include one — flag this as a small addition needed)

---

## 4. Update to Internal Dashboard (from Phase 1's `dashboard.html`)
Add nav links, shown only for the correct roles:
- Accounts Executive/Admin: "KYC Review Queue", "Bank Change Approvals"
- Partner/VP/Admin: "Bank Change Approvals" (second-step approval)

---

## 5. Manual Test Script

1. As Accounts Executive, activate portal access for a vendor (via Swagger or a small internal page if one exists), note credentials.
2. Open `vendor-login.html`, log in with email/password, see the dev-mode OTP banner, enter it, land on the dashboard.
3. Confirm the progress ring shows 0% (or the correct partial value) and the KYC checklist lists only the applicable document types for that vendor.
4. Upload each required document from `vendor-kyc-upload.html` — confirm each shows a Pending badge.
5. Log in as Accounts Executive, open `kyc-review-queue.html`, verify each document — confirm they disappear from the queue (or show Verified).
6. Back on the vendor dashboard, confirm the progress ring now shows 100% and checklist rows show Verified.
7. From `vendor-bank-change.html`, submit a bank change request.
8. As Accounts Executive #1, open `bank-change-review.html`, approve it.
9. Try approving the same request again as the same user — confirm the button is disabled/explained rather than silently failing.
10. Log in as a different Accounts Executive or Partner/VP, approve the second step — confirm it moves to Approved.
11. Check `vendor-notifications.html` as the vendor — confirm entries appear and can be marked read.
12. Do a quick visual pass across all pages — confirm the color palette, typography, spacing, and status badges are actually consistent, not just present on one page.

---

## 6. Explicitly Out of Scope for This UI Phase

No invoice, payment, or MIS screens. No mobile-specific layout pass (though basic responsiveness/no horizontal scroll at common widths is expected as a baseline, not a stretch goal). No animation beyond subtle hover/focus states.

---

## 7. Instructions for the Coding Agent

Build `tokens.css` first and get it right before touching any page — every subsequent page should only ever reference the variables in it, never a raw hex value. Build pages in the order: vendor-login → vendor-dashboard → vendor-kyc-upload → vendor-bank-change → vendor-notifications → kyc-review-queue → bank-change-review, checking visual consistency against Section 2 as you go. If the bank-change-review page needs a list endpoint that Phase 2B's backend spec didn't include, add a simple `GET /api/v1/bank-change-requests` (filtered appropriately by role) and report that you added it rather than silently working around its absence.
