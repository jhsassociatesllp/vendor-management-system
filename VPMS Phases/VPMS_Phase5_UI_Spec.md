# VPMS — Phase 5 (UI): MIS Dashboard, Reports & Audit Trail Screens

**Project:** Vendor Payment Management System (VPMS)
**Phase:** UI layer for Phase 5 (final UI phase)
**Stack:** Plain HTML + CSS + vanilla JS, static files served by FastAPI, `fetch()` against existing endpoints. For charts only, use **Chart.js via CDN** (`<script src="https://cdn.jsdelivr.net/npm/chart.js">`) — this is the one exception to "no external libraries" in this project, since hand-rolling chart rendering in raw SVG/canvas isn't a good use of time for a management dashboard.
**Builds on:** All prior UI phases' `tokens.css`/`components.css` — reuse unchanged.

---

## 1. Objective

Give Management/Finance a real dashboard with the KPIs and aging/spend charts from Phase 5's backend, give every role a way to pull and export the standard reports relevant to them, and give Compliance/Audit a read-only audit trail viewer.

**Definition of Done:** The dashboard renders correctly against real data with working drill-down filters, all 11 reports are viewable and exportable through one consistent screen pattern, and the audit trail viewer has no write/edit controls anywhere on it — visually reinforcing that it's tamper-evident, not just technically enforced.

---

## 2. Design Notes (no new design system needed — reuse everything)

- KPI cards: same card component used everywhere else (Phase 2B's card style), just with a large number and label — this is a natural extension, not a new pattern.
- Charts: keep Chart.js styled with the existing token colors (`--color-primary`, `--color-warning`, `--color-danger`, etc.) rather than Chart.js's defaults — pull the CSS variable values into the chart config so it doesn't look like a bolted-on library.
- Audit trail table: intentionally spare — no action column at all. If you find yourself adding a button to this page, stop; there shouldn't be one anywhere on it.

---

## 3. Pages

### 3.1 `mis-dashboard.html`
- Top row: KPI cards — Total Payables, Overdue Invoices, MSME Risk Count, Budget Utilization %
- Aging chart: bar chart, the four SRS buckets (0–30/30–60/60–90/90+)
- Spend-by-category chart: bar or line, with a period-comparison toggle (e.g. this month vs. last month)
- Filter panel above the charts: vendor, department, category, date range — changing filters re-fetches and re-renders both charts and the KPI cards, not just one or the other
- Drill-down: clicking an aging bucket or a category bar should apply that as a filter (e.g. clicking "90+" filters the page to just those invoices) rather than just being decorative

### 3.2 `reports.html`
- A simple grid/list of the 11 reports as cards (name + short description + frequency label from the SRS, shown as metadata not as a schedule that's actually running — see Phase 5 backend's Section 10), each linking to `report-viewer.html?type={report_type}`

### 3.3 `report-viewer.html` (generic — one page for all 11 report types)
- Reads `type` from the URL, fetches the matching endpoint
- Filter panel: show only the filters relevant to that report type (date range/vendor/department as applicable — don't show a "vendor" filter on a report that isn't vendor-scoped)
- Data table with the report's actual columns (don't force every report into one fixed column set — read the response and render its fields)
- "Export CSV" button that calls the same endpoint with `?format=csv` and triggers a browser download

### 3.4 `audit-trail.html`
- Filter panel: user, module, action, date range, record reference
- Table: timestamp, user, role, action, module, record reference — row expands to show full field-level `field_changes` detail
- A small "Run Integrity Check" button IS allowed here (it's a read/verify action, not a write) — showing a clear pass/fail result, ideally with the specific row flagged if it fails
- Explicitly: no edit, no delete, no "correct this entry" affordance anywhere on this page

---

## 4. Navigation Updates

Internal `dashboard.html`, role-conditional:
- Partner/VP, Finance Head, System Admin: "MIS Dashboard"
- Accounts Executive, Finance, Partner/VP, Budget Controller, System Admin: "Reports" (the reports grid itself can further hide/show individual report cards by role if you want to be precise, but a single shared "Reports" nav entry is fine)
- Compliance/Audit, System Admin: "Audit Trail"

---

## 5. Manual Test Script

1. Open `mis-dashboard.html` as Partner/VP — confirm KPI cards and both charts render against real seeded data from earlier phases' testing.
2. Change the department/date-range filters — confirm both charts and the KPI cards update together, not just one.
3. Click into an aging bucket — confirm it drills down (filters) rather than doing nothing.
4. Open `reports.html`, pick three different reports (e.g. Vendor Master, Payment Register, Budget Utilisation), confirm each renders its own correct columns, and export one as CSV — open the file and confirm it matches what's on screen.
5. Open `audit-trail.html`, filter to a specific module (e.g. "Invoice") and confirm entries from your Phase 3B/4A/4B testing actually show up with correct old/new values on an update-type entry.
6. Run the integrity check — confirm it reports clean.
7. Confirm, by actually looking, that there is no edit/delete/write control anywhere on the audit trail page.

---

## 6. Explicitly Out of Scope for This UI Phase

No scheduled/emailed report delivery UI (reports are on-demand pulls, per the backend spec). No PDF certificate download for Form 16A (data-only per the backend spec — if you want to show the data on screen, a simple table is fine, no need to fake a PDF viewer).

---

## 7. Instructions for the Coding Agent

Build `report-viewer.html` as a genuinely generic component driven by the `type` param and the shape of whatever the API returns — resist the temptation to hardcode column lists for all 11 reports in the frontend; read them from the response instead, so a report's column set can change on the backend without needing a matching frontend change. Build the dashboard charts against real data from earlier phases' testing (not fabricated placeholder numbers) so the KPIs are actually meaningful to check in the manual script. Report which files were created/changed when done.

---

## 8. This Is the Last Phase

Once this UI is built and the manual script above passes, every phase in the original roadmap (0 through 5, backend and UI) is complete. Worth doing a final full walkthrough of the entire application end-to-end at that point — vendor onboarding through payment through reporting — rather than only re-checking this phase in isolation.
