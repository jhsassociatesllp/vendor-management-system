# VPMS — Phase 3 (UI): PO Management, GRN & Invoice Submission Screens

**Project:** Vendor Payment Management System (VPMS)
**Phase:** UI layer for Phase 3A (PO/Budget/GRN) + Phase 3B (Invoice Submission)
**Stack:** Plain HTML + CSS + vanilla JS, static files served by FastAPI, `fetch()` against existing endpoints.
**Builds on:** Phase 2B UI's `tokens.css` and `api.js` — reuse both unchanged. Every new page must use the existing design tokens, not introduce new ones.

---

## 1. Objective

Give internal roles (Dept. Manager, Accounts Executive, Budget Controller, Partner/VP) real screens for creating and approving POs, recording GRN/SCN, and reviewing submitted invoices — and give vendors screens to acknowledge POs and submit invoices, including the live PO-balance and GST-mismatch feedback the backend validates.

**Definition of Done:** Every backend workflow from Phase 3A and 3B is reachable and completable through these screens by the correct role, with the same visual language as Phase 2B (colors, type, cards, badges) — plus the new budget utilization bar used consistently wherever budget figures appear.

---

## 2. Design System Addition: Budget Utilization Bar

New reusable component (add to a shared `components.css`, alongside the existing `tokens.css` — don't duplicate token values):

A horizontal segmented bar showing, left to right: **Committed** (POs) filling from zero, remaining space showing **Available**. Use `--color-primary` for committed, a light neutral for available track. When committed exceeds ~85% of sanctioned, switch the committed segment to `--color-warning`; if somehow over 100% (shouldn't happen given the hard block, but render defensively), use `--color-danger`. Show the numbers (₹ committed / ₹ sanctioned) as text above or beside the bar, not just the visual — the bar supports the number, it doesn't replace it.

This is the one new piece of visual craft this phase — everything else should read as a natural extension of Phase 2B's card/badge language, not a new style.

---

## 3. Pages — Internal

### 3.1 `budget-heads.html`
- List of budget heads, each as a card showing department/cost centre/period + the utilization bar (Section 2)
- "Create Budget Head" form (Budget Controller/Admin only)

### 3.2 `po-create.html`
- Vendor selection → item code selection (only show active vendor-item combos, per Phase 1) → agreement auto-resolves (show it, don't let it be hand-picked separately) → budget head selection, showing that head's utilization bar live so the creator can see headroom before submitting
- Quantity input, rate pre-filled from the active rate card (editable — if changed, a reason field appears, required)
- Live-calculated (client-side preview, but always re-verified server-side) taxable amount / GST / total, shown clearly before submit
- On submit, if the backend hard-blocks for insufficient budget, show that clearly with the option to check "request over-budget exception" (adds the justification field) and resubmit — don't silently retry

### 3.3 `po-list.html`
- Table: PO number, vendor, item, total value, status badge, budget head
- Filterable by status

### 3.4 `po-detail.html`
- Full PO details, version number, vendor acknowledgement status
- Action buttons shown conditionally by role + status (same conditional-button pattern as Phase 1/2B):
  - Budget Controller/Partner + `Pending_Approval` → Approve / Reject
  - Accounts Executive/Admin + not yet Cancelled → Cancel
  - Dept. Manager/Accounts Executive + Approved or later → "Propose Amendment" (opens a small form: new quantity/rate/date + reason)
  - Dept. Manager/Accounts Executive + Vendor_Acknowledged or later → "Record GRN/SCN" (quantity + description; show cumulative confirmed vs. PO quantity so the person can see remaining headroom before entering)
- Show the PO's amendment history and GRN/SCN entries as simple lists lower on the page, not hidden behind extra clicks

### 3.5 `invoices-list.html` (internal)
- Table: invoice number, vendor, PO reference, total amount, submitted date
- Status-style badges for `rate_variance_flag` (warning color, "Rate variance") and `msme_alert_triggered` (info-style badge, "MSME") shown as small tags next to the row — these aren't the main status badge, they're supplementary flags, so keep them visually secondary (smaller, outlined rather than filled)

### 3.6 `invoice-detail.html` (internal)
- Read-only full breakdown: amounts, GST breakup, period of service, linked PO/GRN, uploaded documents (list with type + a view/download link)
- No action buttons yet — approval actions are Phase 4

---

## 4. Pages — Vendor Portal (extends Phase 2B)

### 4.1 `vendor-po-list.html`
- List of POs for this vendor, status badge, an "Acknowledge" button on any `Approved`-but-not-yet-acknowledged PO
- Acknowledging should feel deliberate — a short confirm step ("You're confirming you'll fulfill this PO as specified"), not a single accidental click

### 4.2 `vendor-invoice-submit.html`
Build as a multi-step form (steps, not one long page — this form has a lot of fields and several live validations):
1. **Select PO** (only `Vendor_Acknowledged` POs with remaining balance shown) or Agreement for non-PO billing — show the live PO balance (value + quantity) prominently once selected, pulled from `/purchase-orders/{po_id}/balance`
2. **Amounts** — quantity, rate, auto-computed taxable amount; GST breakup entry with a live client-side check against the expected GST (quantity×rate×agreement's gst_rate) — if the vendor's entry differs by more than ₹1, show an inline warning *before* they try to submit, so they can self-correct rather than hitting a submit-time rejection
3. **Details** — invoice date, period of service, work description, billing milestone selector (only shown/required if the agreement is milestone-based)
4. **Documents** — upload the three mandatory types + optional ones, each with a clear required/optional label
5. **Review & Submit** — a clean summary of everything entered before the final `submit` call; this is the point of no return (invoice becomes read-only after), so make that clear in the UI copy

If submission is blocked by any hard-block rule, surface the specific reason(s) returned by the API clearly at the top of the relevant step — don't make the vendor guess which of the many possible checks failed.

### 4.3 `vendor-invoices-list.html`
- Table: invoice number, PO ref, amount, submitted date, the same rate-variance/MSME tag treatment as the internal list (Section 3.5)

---

## 5. Navigation Updates

Add to the internal `dashboard.html` nav (role-conditional, same pattern as before):
- Budget Controller/Admin: "Budget Heads"
- Dept. Manager/Accounts Executive/Admin: "Purchase Orders", "Invoices" (read view)
- Budget Controller/Partner/Admin: "PO Approvals" (can reuse `po-list.html` filtered to `Pending_Approval`, doesn't need a separate page)

Add to `vendor-dashboard.html` (from Phase 2B):
- "My Purchase Orders", "Submit Invoice", "My Invoices"

---

## 6. Manual Test Script

1. As Budget Controller, create a budget head, confirm the utilization bar shows 100% available.
2. As Dept. Manager, start a PO against a vendor/item with insufficient budget — confirm the live budget preview and the clear block-with-exception-option behavior.
3. Create a valid PO, submit — confirm it appears in `po-list.html` as Pending_Approval.
4. As Budget Controller, approve it from `po-detail.html` — confirm the budget head's utilization bar updates to reflect the commitment.
5. As the vendor, see the PO in `vendor-po-list.html`, acknowledge it (confirm the deliberate confirm step).
6. As Dept. Manager, record a GRN against it from `po-detail.html` — confirm cumulative-vs-PO-quantity is visible before you submit.
7. As the vendor, go through `vendor-invoice-submit.html` end to end — confirm the live PO balance, the live GST-mismatch warning (try entering a wrong GST breakup deliberately), and that the review step actually reflects everything entered.
8. Submit successfully, confirm it shows in both `vendor-invoices-list.html` and the internal `invoices-list.html`, with the correct flag tags if applicable (try a >5% rate variance on purpose to see the flag).
9. As Accounts Executive, open `invoice-detail.html`, confirm all fields and documents display correctly.
10. Do a visual consistency pass — confirm the new budget bar and flag tags feel like part of the same product as Phase 2B, not bolted on.

---

## 7. Explicitly Out of Scope for This UI Phase

No invoice approval actions (Phase 4 UI), no payment screens, no MIS dashboards/charts. No drag-and-drop or rich file preview for document uploads — a plain file input is fine.

---

## 8. Instructions for the Coding Agent

Build `components.css`'s budget bar first, verify it renders correctly with a couple of hardcoded test values before wiring it to real data. Build internal pages before vendor pages (Section 3 before Section 4), since the vendor invoice form depends on POs/GRNs existing to test against. Check visual consistency against Phase 2B's `tokens.css` continuously — flag if you find yourself wanting a new color or font that isn't already defined there, rather than adding one silently. Report which files were created/changed when done.
