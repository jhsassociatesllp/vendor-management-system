# VPMS — Phase 4 (UI): Approval Workflow & Payment Recording Screens

**Project:** Vendor Payment Management System (VPMS)
**Phase:** UI layer for Phase 4A (Approval Workflow) + Phase 4B (Payment Recording)
**Stack:** Plain HTML + CSS + vanilla JS, static files served by FastAPI, `fetch()` against existing endpoints.
**Builds on:** Phase 2B/3 UI's `tokens.css` and `components.css` (budget bar, status badges) — reuse unchanged, extend the same files rather than starting new ones.

---

## 1. Objective

Give every approval-chain role (Accounts Executive, Dept. Manager, Partner/VP, Finance) a real queue and action screen, give vendors visibility into where their invoice is stuck and any open queries, and give Finance the payment-recording (maker) and confirmation (checker) screens.

**Definition of Done:** Every Phase 4A/4B backend workflow is completable through these screens by the correct role, the workflow timeline correctly reflects an invoice's real state (including skipped/query/returned states), and TAT/MSME urgency is visible at a glance via color, not just text.

---

## 2. Design System Addition: Workflow Timeline + Urgency Chips

**Workflow timeline** (add to `components.css`): a horizontal step sequence — L1, L2, L3, L4, Payment — each step shown as a small circle/label. States map to the existing badge colors: completed = `--color-success`, current/pending = `--color-primary`, skipped = a muted/greyed-out style (still visible, clearly de-emphasized, not hidden), query-raised = `--color-warning`, rejected = `--color-danger` (and the timeline stops there — don't show later steps as if they're still coming). This is the one place worth real visual care this phase — it's the single element that answers "where is this invoice right now," which is the most common question anyone using this app will have.

**Urgency chip** (small, reused wherever a due date matters — TAT due dates, MSME payment due dates): green if comfortably on time, amber if due within 3 days (TAT) or 7 days (MSME payment), red if overdue. Same three-color logic as the budget bar from Phase 3 UI — don't invent a fourth color for this.

---

## 3. Pages — Internal (Approval Chain)

### 3.1 `my-approval-queue.html`
- List of items from `/invoice-approvals/my-queue`: invoice number, vendor, amount, level, urgency chip for TAT
- Click through to `invoice-approval-detail.html`

### 3.2 `invoice-approval-detail.html`
- Reuse Phase 3 UI's `invoice-detail.html` layout for the invoice's own fields, extended with:
  - The workflow timeline (Section 2) at the top, showing full progress including skipped levels
  - Action panel, shown only if the current user's role matches the currently-pending stage (or they're an active delegate): action buttons appropriate to that level (Verify/Approve/Reject/Return/Raise Query/Approve for Payment/Hold, per Phase 4A's level-specific actions), each requiring a comments field where the backend expects one
  - If a query is currently open on this invoice, show it clearly (query text, who raised it) instead of the action panel — nothing to approve until the vendor responds

### 3.3 `delegation-setup.html`
- Simple form: delegate user, valid-from/valid-to dates
- List of the current user's active/past delegations

### 3.4 `doa-matrix.html` (System Admin only)
- Table of current slab rows (min/max amount, which levels required, TAT days) with inline edit
- Keep this functional and plain — it's a rarely-used config screen, not worth extra visual investment

### 3.5 `escalations.html`
- List from `/invoice-approvals/escalations`, red urgency chips throughout (everything here is by definition overdue)

---

## 4. Pages — Payment (Finance)

### 4.1 `payment-queue.html`
- List from `/payments/queue`, sorted by due date (already sorted server-side — don't re-sort client-side), urgency chip per row, MSME vendors visually tagged (reuse the small secondary tag style from Phase 3 UI's rate-variance/MSME tags)
- Row click → `payment-record-form.html`

### 4.2 `payment-record-form.html`
- Invoice summary at top (read-only)
- TDS section/rate pre-filled from default, editable — if changed, a reason field appears (required), matching the pattern used for rate overrides in Phase 3
- Live-computed `tds_amount` / `net_payable_amount` shown before submit
- Payment mode, company bank account, payment date, UTR reference — all required
- Submit → `POST /payments`

### 4.3 `payment-confirm-queue.html`
- List of `Maker_Recorded` payments awaiting confirmation
- If the current logged-in user is the same as the payment's maker, show Confirm/Reject as disabled with a short explanation, same disabled-with-explanation pattern used for bank-change dual-approval in Phase 2B UI — don't let them discover the 403 by clicking
- Reject opens a reason field (required)

### 4.4 `msme-alerts.html`
- List from `/payments/msme-alerts`, urgency chips, split visually into "At Risk" (amber) and "Overdue" (red) sections rather than one flat list

---

## 5. Vendor Portal Additions

### 5.1 Extend `vendor-invoices-list.html` / add `vendor-invoice-track.html`
- Add the workflow timeline (Section 2, read-only) to each invoice's detail view, so a vendor can see exactly where their invoice is stuck
- If a query is open, show it prominently with a respond form (textarea + submit) — calls `POST /invoices/{id}/queries/{query_id}/respond`
- Once `Paid`, show payment date and UTR (not the internal TDS breakdown detail unless you want to surface it — keep this simple, just confirmation the payment landed)

---

## 6. Navigation Updates

Internal `dashboard.html`, role-conditional:
- Accounts Executive/Dept. Manager/Partner/Finance (whichever roles are approvers): "My Approvals", "Delegations", "Escalations"
- System Admin: "DoA Matrix"
- Finance Team/Finance Head: "Payment Queue", "Record Payment" (can be the same page as the queue, linking into the form), "Confirm Payments", "MSME Alerts"

Vendor `dashboard.html`: ensure "My Invoices" links through to the tracking view with the timeline, not just a flat status badge.

---

## 7. Manual Test Script

1. Route a large invoice through Phase 4A's L1→L4 chain using these screens instead of Swagger — confirm the workflow timeline updates correctly at each step, including showing L2/L3 as genuinely skipped for a small invoice tested separately.
2. Raise a query at L2, confirm the vendor sees it on their tracking page and can respond; confirm it returns to L2 (not L1) on the internal side, matching the timeline.
3. Set up a delegation, log in as the delegate, confirm you can act on the delegator's pending item from `my-approval-queue.html`.
4. Check `escalations.html` with a deliberately overdue test item — confirm the red urgency chip.
5. As Finance, open `payment-queue.html`, confirm an MSME invoice sorts appropriately, record a payment with a TDS override — confirm the live calculation updates.
6. As the same user, try confirming your own payment from `payment-confirm-queue.html` — confirm the disabled-with-explanation state.
7. As a different Finance user, confirm it — confirm the invoice's workflow timeline (both internal and vendor-facing) now shows "Paid" as the final state.
8. Check `msme-alerts.html` reflects at-risk/overdue correctly against seeded data.

---

## 8. Explicitly Out of Scope for This UI Phase

No MIS dashboards/charts, no report exports, no audit trail viewer — all Phase 5. No bulk actions (approve multiple at once) — one-at-a-time only for now.

---

## 9. Instructions for the Coding Agent

Build the workflow timeline component first and test it against a few hardcoded state combinations (including skipped and query-raised) before wiring it to real data — it's reused in three places (approval detail, vendor tracking, and implicitly in the queue urgency logic) so getting its states right early avoids rework. Build internal approval screens before payment screens, since payment recording depends on invoices actually reaching `Approved_For_Payment` through the approval screens first. Report which files were created/changed when done.
