# VPMS — Phase 1 (UI): Login + Vendor Module Screens

**Project:** Vendor Payment Management System (VPMS)
**Phase:** UI layer for Phase 0 (Auth) + Phase 1 (Vendor Shortlisting & Master)
**Stack:** Plain HTML + CSS + vanilla JS, served as static files by FastAPI, calling the existing JSON API via `fetch()`. No frontend framework, no build tooling.
**Builds on:** The already-built and tested Phase 0 (`/api/v1/auth/login`) and Phase 1 (`/api/v1/vendor-requests`, `/api/v1/vendors`, `/api/v1/item-codes`) APIs. Do not modify those endpoints — the UI only consumes them.

---

## 1. Objective

Give each role a real screen to do their job instead of using Swagger: log in, submit a vendor request, review it, approve/reject it, and see the resulting Vendor Code — matching the workflow diagram and form mockup in the Visual Reference document (Module 1 & 2 sections).

**Definition of Done:** A person can complete the entire Phase 1 workflow (request → accounts review → partner approval → vendor code creation) using only the browser UI, with each screen only visible/usable by the correct role, and validation errors from the API shown clearly on the page.

---

## 2. Folder Structure (add to existing project)

```
vpms/
├── static/
│   ├── css/
│   │   └── main.css
│   ├── js/
│   │   ├── api.js              # shared fetch wrapper, attaches JWT, handles errors
│   │   ├── auth.js              # login page logic
│   │   ├── dashboard.js
│   │   ├── vendor-request-form.js
│   │   ├── vendor-requests-list.js
│   │   ├── accounts-review.js
│   │   ├── partner-approval.js
│   │   └── item-codes.js
│   └── pages/
│       ├── login.html
│       ├── dashboard.html
│       ├── vendor-request-form.html
│       ├── vendor-requests-list.html
│       ├── request-detail.html      # shared detail view, buttons shown conditionally by role
│       └── item-codes.html
```

FastAPI should mount `/static` and serve `login.html` at the root path `/`.

---

## 3. Shared Behavior (`api.js`)

- Store JWT in `localStorage` after login under a single key, e.g. `vpms_token`.
- A shared `apiFetch(path, options)` function that:
  - Attaches `Authorization: Bearer <token>` automatically
  - On `401`, clears the token and redirects to `login.html`
  - On `403`, shows an inline "You don't have permission for this action" message rather than a blank failure
  - On `422`/`400`, surfaces the API's validation error text directly near the relevant field, not just a generic alert
- A shared `getCurrentUser()` that calls `/api/v1/users/me` once per page load and is used to decide which nav links/buttons to show.

---

## 4. Pages

### 4.1 `login.html`
- Email + password fields, calls `/api/v1/auth/login`
- On success: store token, redirect to `dashboard.html`
- On failure: show "Invalid email or password" (don't reveal which was wrong)

### 4.2 `dashboard.html`
- Fetches current user via `getCurrentUser()`
- Shows role-appropriate nav links only:
  - Dept. Manager: "New Vendor Request", "My Requests"
  - Accounts Executive: "Requests Pending Review", "Item Codes"
  - Partner / VP: "Requests Pending Approval"
  - System Admin: everything
- Vendor role and any role without Phase 1 involvement just sees a simple "No actions available yet" message — don't error

### 4.3 `vendor-request-form.html`
Fields matching the Visual Reference mockup and the Phase 1 data model:
- Business need (textarea)
- Category (dropdown)
- Estimated annual spend (number)
- Recommended vendor name, PAN, GSTIN
- Evaluation checklist: 6 checkboxes (financial stability, technical capability, compliance status, blacklist check, conflict of interest declared, references provided)
- MSME/Udyam number (only enabled/shown if a "Is MSME?" checkbox is ticked)
- Submit → `POST /api/v1/vendor-requests`
- On the duplicate-PAN error from the API, show it clearly next to the PAN field, don't just show a generic failure

### 4.4 `vendor-requests-list.html`
- Table: request id, recommended vendor name, category, status, created date
- Dept. Manager sees only their own requests; Accounts Executive/Partner/Admin see all
- Each row links to `request-detail.html?id={id}`

### 4.5 `request-detail.html`
- Shows all fields of the request read-only
- Buttons shown conditionally based on current user's role AND the request's current status:
  - Accounts Executive + status `Submitted`/`Accounts_Review` → "Advance to Partner Approval" / "Reject" buttons, calling the accounts-review endpoint
  - Partner/VP + status `Pending_Partner_Approval` → "Approve" / "Reject" buttons, calling the partner-decision endpoint
  - Accounts Executive + status `Approved` (and no vendor created yet) → "Create Vendor Code" button, calling the from-request endpoint — on success, display the returned `vendor_code` prominently
  - Reject actions open a small reason field (required) before submitting
- If the current user's role/status combination allows no action, just show the read-only view with current status and no buttons

### 4.6 `item-codes.html`
- Simple list + "add new" form (category, sub-category, description, unit, default rate)
- Accounts Executive/Admin only
- From the vendor detail view (or a small section on `request-detail.html` once a vendor exists), allow linking existing item codes to that vendor

---

## 5. Styling (`main.css`)

Keep it simple and clean for now — this is not the polish pass:
- A basic top nav bar, a content container with reasonable max-width and padding
- Consistent form styling (labels above inputs, clear error text in a distinct color)
- A simple status badge style (e.g. colored pill) for request status — reused across list and detail views
- No need for a component library or animations at this stage

---

## 6. Manual Test Script (walk through in the browser, not pytest — UI testing here is manual)

1. Open `/`, log in as Dept. Manager → redirected to dashboard, only "New Vendor Request"/"My Requests" visible.
2. Submit a vendor request with all fields → appears in "My Requests" with status `Submitted`.
3. Try submitting a second request with the same PAN → see the duplicate error inline on the form.
4. Log out, log in as Accounts Executive → see the pending request in "Requests Pending Review".
5. Open it, click "Advance to Partner Approval" → status updates to `Pending_Partner_Approval`.
6. Log out, log in as Partner/VP → see it in their queue, click "Approve".
7. Log out, log in as Accounts Executive again → open the now-Approved request, click "Create Vendor Code" → confirm a `VND-YYYY-NNNN` code is displayed.
8. Log in as Dept. Manager again, confirm they can see the request is Approved but have no action buttons.
9. Repeat the reject path once (Accounts Executive or Partner rejects with a reason) → confirm status becomes `Rejected` then `Archived`, and reason is visible on the detail page.
10. As Accounts Executive, add an item code and link it to the new vendor from the vendor detail area.

---

## 7. Explicitly Out of Scope for This UI Phase

No Vendor self-service portal login screen (that's Phase 2 UI, once the Vendor Portal backend exists), no Agreement/PO/Invoice screens, no dashboards/charts (MIS phase), no responsive/mobile polish, no design system — functional and clear is the bar for now.

---

## 8. Instructions for the Coding Agent

Build `api.js` first and verify token attachment/401 handling works against the existing tested Phase 0 login before building any other page. Then build pages in the order: login → dashboard → vendor-request-form → vendor-requests-list → request-detail → item-codes, checking each against the corresponding step(s) in Section 6 as you go rather than building all pages before testing any of them. Report which files were created/changed when done.
