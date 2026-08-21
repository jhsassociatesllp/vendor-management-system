const TOKEN_KEY = "vpms_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function goToLogin() {
  window.location.href = "/static/pages/login.html";
}

function logout() {
  clearToken();
  goToLogin();
}

function extractErrorMessage(data) {
  if (!data) return "Something went wrong. Please try again.";
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail
      .map((entry) => {
        const field = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : "";
        return field ? `${field}: ${entry.msg}` : entry.msg;
      })
      .join("; ");
  }
  return "Something went wrong. Please try again.";
}

function fieldErrorsFromDetail(data) {
  const map = {};
  if (data && Array.isArray(data.detail)) {
    for (const entry of data.detail) {
      const field = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : null;
      if (field) map[field] = entry.msg;
    }
  }
  return map;
}

// Friendly text for the generic 403 case per the UI spec, rather than surfacing
// whatever the API's detail string happens to say.
function friendlyMessage(error) {
  if (error && error.status === 403) return "You don't have permission for this action.";
  return (error && error.message) || "Something went wrong. Please try again.";
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, Object.assign({}, options, { headers }));

  if (response.status === 401) {
    clearToken();
    goToLogin();
    const error = new Error("Not authenticated.");
    error.status = 401;
    throw error;
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      data = null;
    }
  }

  if (!response.ok) {
    const error = new Error(extractErrorMessage(data));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Fetches an authenticated file endpoint (e.g. a KYC document) as a blob and opens it
// in a new tab. Needed because a plain <a href> can't carry the Authorization header.
async function openAuthenticatedFile(path) {
  const token = getToken();
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const error = new Error("Could not load the file.");
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  window.open(blobUrl, "_blank");
}

let cachedUser = null;

async function getCurrentUser() {
  if (cachedUser) return cachedUser;
  cachedUser = await apiFetch("/api/v1/users/me");
  return cachedUser;
}

// Which sidebar nav links each role sees, in one place for every authenticated page
// (Phase 0/1 pages and Phase 2B pages alike). Roles not listed here get none
// (dashboard shows "No actions available yet" instead of erroring).
const NAV_BY_ROLE = {
  "Dept. Manager": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "New Vendor Request", href: "/static/pages/vendor-request-form.html" },
    { label: "My Requests", href: "/static/pages/vendor-requests-list.html" },
    { label: "Purchase Orders", href: "/static/pages/po-list.html" },
    { label: "Invoices", href: "/static/pages/invoices-list.html" },
    { label: "My Approvals", href: "/static/pages/my-approval-queue.html" },
    { label: "Delegations", href: "/static/pages/delegation-setup.html" },
    { label: "Escalations", href: "/static/pages/escalations.html" },
  ],
  "Accounts Executive": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "Requests Pending Review", href: "/static/pages/vendor-requests-list.html" },
    { label: "Item Codes", href: "/static/pages/item-codes.html" },
    { label: "KYC Review Queue", href: "/static/pages/kyc-review-queue.html" },
    { label: "Bank Change Approvals", href: "/static/pages/bank-change-review.html" },
    { label: "Purchase Orders", href: "/static/pages/po-list.html" },
    { label: "Invoices", href: "/static/pages/invoices-list.html" },
    { label: "My Approvals", href: "/static/pages/my-approval-queue.html" },
    { label: "Delegations", href: "/static/pages/delegation-setup.html" },
    { label: "Escalations", href: "/static/pages/escalations.html" },
    { label: "Reports", href: "/static/pages/reports.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
  "Partner / VP": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "Requests Pending Approval", href: "/static/pages/vendor-requests-list.html" },
    { label: "PO Approvals", href: "/static/pages/po-list.html?status=Pending_Approval" },
    { label: "My Approvals", href: "/static/pages/my-approval-queue.html" },
    { label: "Delegations", href: "/static/pages/delegation-setup.html" },
    { label: "Escalations", href: "/static/pages/escalations.html" },
    { label: "MIS Dashboard", href: "/static/pages/mis-dashboard.html" },
    { label: "Reports", href: "/static/pages/reports.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
  "Budget Controller": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "Budget Heads", href: "/static/pages/budget-heads.html" },
    { label: "PO Approvals", href: "/static/pages/po-list.html?status=Pending_Approval" },
    { label: "Reports", href: "/static/pages/reports.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
  "Finance Team": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "Payment Queue", href: "/static/pages/payment-queue.html" },
    { label: "Confirm Payments", href: "/static/pages/payment-confirm-queue.html" },
    { label: "MSME Alerts", href: "/static/pages/msme-alerts.html" },
    { label: "My Approvals", href: "/static/pages/my-approval-queue.html" },
    { label: "Delegations", href: "/static/pages/delegation-setup.html" },
    { label: "Escalations", href: "/static/pages/escalations.html" },
    { label: "Invoices", href: "/static/pages/invoices-list.html" },
    { label: "MIS Dashboard", href: "/static/pages/mis-dashboard.html" },
    { label: "Reports", href: "/static/pages/reports.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
  "Compliance / Audit": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "Audit Trail", href: "/static/pages/audit-trail.html" },
    { label: "Reports", href: "/static/pages/reports.html" },
  ],
  "System Admin": [
    { label: "Dashboard", href: "/static/pages/dashboard.html" },
    { label: "New Vendor Request", href: "/static/pages/vendor-request-form.html" },
    { label: "Vendor Requests", href: "/static/pages/vendor-requests-list.html" },
    { label: "Item Codes", href: "/static/pages/item-codes.html" },
    { label: "KYC Review Queue", href: "/static/pages/kyc-review-queue.html" },
    { label: "Bank Change Approvals", href: "/static/pages/bank-change-review.html" },
    { label: "Budget Heads", href: "/static/pages/budget-heads.html" },
    { label: "Purchase Orders", href: "/static/pages/po-list.html" },
    { label: "PO Approvals", href: "/static/pages/po-list.html?status=Pending_Approval" },
    { label: "Invoices", href: "/static/pages/invoices-list.html" },
    { label: "My Approvals", href: "/static/pages/my-approval-queue.html" },
    { label: "Delegations", href: "/static/pages/delegation-setup.html" },
    { label: "DoA Matrix", href: "/static/pages/doa-matrix.html" },
    { label: "Escalations", href: "/static/pages/escalations.html" },
    { label: "Payment Queue", href: "/static/pages/payment-queue.html" },
    { label: "Confirm Payments", href: "/static/pages/payment-confirm-queue.html" },
    { label: "MSME Alerts", href: "/static/pages/msme-alerts.html" },
    { label: "MIS Dashboard", href: "/static/pages/mis-dashboard.html" },
    { label: "Reports", href: "/static/pages/reports.html" },
    { label: "Audit Trail", href: "/static/pages/audit-trail.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
  Vendor: [
    { label: "Dashboard", href: "/static/pages/vendor-dashboard.html" },
    { label: "Upload KYC Documents", href: "/static/pages/vendor-kyc-upload.html" },
    { label: "Bank Change Request", href: "/static/pages/vendor-bank-change.html" },
    { label: "My Purchase Orders", href: "/static/pages/vendor-po-list.html" },
    { label: "Submit Invoice", href: "/static/pages/vendor-invoice-submit.html" },
    { label: "My Invoices", href: "/static/pages/vendor-invoices-list.html" },
    { label: "Notifications", href: "/static/pages/vendor-notifications.html" },
  ],
};

function navLinksForRole(role) {
  return NAV_BY_ROLE[role] || [];
}

function formatDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  return date.toLocaleString();
}

// Renders the persistent sidebar + top bar into #sidebar-nav / #topbar, present on
// every authenticated page. `activeFile` is just the filename (e.g.
// "vendor-dashboard.html") used to highlight the current link.
function renderAppShell(user, activeFile) {
  const sidebarNav = document.getElementById("sidebar-nav");
  const topbar = document.getElementById("topbar");
  if (!sidebarNav || !topbar) return;

  const items = navLinksForRole(user.role);
  sidebarNav.innerHTML = items
    .map((item) => {
      const activeClass = item.href.endsWith(`/${activeFile}`) ? " is-active" : "";
      return `<a class="app-sidebar__link${activeClass}" href="${item.href}">${item.label}</a>`;
    })
    .join("");

  topbar.innerHTML = `
    <button type="button" class="app-topbar__bell" id="notification-bell" title="Notifications">
      &#128276;
      <span class="app-topbar__bell-count" id="notification-count" style="display: none;">0</span>
    </button>
    <div class="app-topbar__user">
      <div class="app-topbar__user-name">${user.name}</div>
      <div class="app-topbar__user-role">${user.role}</div>
    </div>
    <button type="button" class="app-topbar__logout" id="shell-logout-button">Log out</button>
  `;

  document.getElementById("shell-logout-button").addEventListener("click", logout);
  document.getElementById("notification-bell").addEventListener("click", () => {
    window.location.href = "/static/pages/vendor-notifications.html";
  });

  refreshUnreadNotificationCount();
}

async function refreshUnreadNotificationCount() {
  const countEl = document.getElementById("notification-count");
  if (!countEl) return;
  try {
    const notifications = await apiFetch("/api/v1/notifications");
    const unread = notifications.filter((n) => !n.read_at).length;
    if (unread > 0) {
      countEl.textContent = unread > 99 ? "99+" : String(unread);
      countEl.style.display = "flex";
    } else {
      countEl.style.display = "none";
    }
  } catch (err) {
    // Non-fatal: the bell just shows no count if this fails.
  }
}

// One status badge system (Section 2 of the Phase 2B UI spec) reused across every
// phase's statuses: warning/success/danger/neutral pill.
const STATUS_BADGE_VARIANT = {
  // Phase 1: vendor requests
  Submitted: "neutral",
  Accounts_Review: "warning",
  Pending_Partner_Approval: "warning",
  Approved: "success",
  Rejected: "danger",
  Archived: "neutral",
  // Phase 2A: agreements
  Active: "success",
  Expired: "neutral",
  Terminated: "danger",
  // Phase 2A: billing milestones / rate amendments
  Pending: "warning",
  Achieved: "success",
  Invoiced: "success",
  // Phase 2B: KYC documents / bank change requests
  Pending_Review: "warning",
  Pending_First_Approval: "warning",
  Pending_Second_Approval: "warning",
  Verified: "success",
  // Phase 3A: purchase orders / amendments / GRN-SCN
  Pending_Approval: "warning",
  Vendor_Acknowledged: "success",
  Cancelled: "danger",
  Lapsed: "neutral",
  Closed: "neutral",
  // Phase 3B: invoices
  Draft: "neutral",
  // Phase 4A: approval workflow
  L1_Verification: "warning",
  L2_Review: "warning",
  L3_Approval: "warning",
  L4_Finance_Approval: "warning",
  Approved_For_Payment: "success",
  Query_Raised: "warning",
  Returned_To_Vendor: "warning",
  On_Hold: "warning",
  Completed: "success",
  Returned: "warning",
  Skipped: "neutral",
  Open: "warning",
  Responded: "success",
  // Phase 4B: payment recording
  Paid: "success",
  Maker_Recorded: "warning",
  Checker_Confirmed: "success",
  // Phase 5: audit trail actions
  Create: "success",
  Update: "warning",
  Approve: "success",
  Reject: "danger",
  Delete: "danger",
  View: "neutral",
  Login: "success",
  Logout: "neutral",
  Login_Failed: "danger",
  Document_Upload: "neutral",
  System: "neutral",
};

function badgePillHtml(status) {
  const variant = STATUS_BADGE_VARIANT[status] || "neutral";
  const label = String(status).replace(/_/g, " ");
  return `<span class="badge badge-${variant}">${label}</span>`;
}

// Builds the Phase 3 UI budget utilization bar (Section 2 of the Phase 3 UI spec).
// `sanctioned`/`committed` are numbers (or numeric strings). Committed switches to
// warning past 85% of sanctioned, danger past 100% (shouldn't happen given the
// backend's hard block, but rendered defensively).
function buildBudgetBarHtml(sanctioned, committed) {
  const sanctionedNum = Number(sanctioned) || 0;
  const committedNum = Number(committed) || 0;
  const available = sanctionedNum - committedNum;
  const rawPercent = sanctionedNum > 0 ? (committedNum / sanctionedNum) * 100 : 0;
  const displayPercent = Math.max(0, Math.min(100, rawPercent));

  let fillClass = "";
  if (rawPercent > 100) fillClass = " is-danger";
  else if (rawPercent >= 85) fillClass = " is-warning";

  const money = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return `
    <div class="budget-bar">
      <div class="budget-bar__figures">
        <span class="budget-bar__committed-label">${money(committedNum)} committed</span>
        <span class="budget-bar__sanctioned-label">of ${money(sanctionedNum)} sanctioned</span>
      </div>
      <div class="budget-bar__track">
        <div class="budget-bar__fill${fillClass}" style="width: ${displayPercent}%"></div>
      </div>
      <div class="budget-bar__available">${money(available)} available</div>
    </div>
  `;
}

// Small outlined tags shown next to a PO/invoice row for rate_variance_flag /
// msme_alert_triggered — supplementary to the main status badge, per Section 3.5.
function flagTagsHtml(invoice) {
  let html = "";
  if (invoice.rate_variance_flag) {
    html += `<span class="flag-tag flag-tag--variance">Rate variance</span>`;
  }
  if (invoice.msme_alert_triggered) {
    html += `<span class="flag-tag flag-tag--msme">MSME</span>`;
  }
  return html;
}

// Phase 4 UI, Section 2: the workflow timeline. `approvals` is the array returned by
// GET /invoices/{id}/approvals (one row per L1-L4, already deduped to the latest routing
// cycle server-side); `invoiceStatus` is the invoice's own `status` field. Renders 5
// steps: L1, L2, L3, L4, Payment.
const LEVEL_TO_INVOICE_STATUS = {
  L1: "L1_Verification",
  L2: "L2_Review",
  L3: "L3_Approval",
  L4: "L4_Finance_Approval",
};

function workflowStepHtml(label, stateClass, sublabel) {
  return `
    <div class="workflow-step ${stateClass}">
      <div class="workflow-step__dot"></div>
      <div class="workflow-step__label">${label}</div>
      ${sublabel ? `<div class="workflow-step__sublabel">${sublabel}</div>` : ""}
    </div>
  `;
}

function buildWorkflowTimelineHtml(approvals, invoiceStatus) {
  const byLevel = Object.fromEntries((approvals || []).map((a) => [a.level, a]));
  const levels = ["L1", "L2", "L3", "L4"];
  const steps = [];
  let terminal = false; // once a Rejected stage is hit, nothing after it is "still coming"

  for (const level of levels) {
    const approval = byLevel[level];
    if (!approval || terminal) {
      steps.push(workflowStepHtml(level, "is-na"));
      continue;
    }

    let stateClass;
    let sublabel = "";
    switch (approval.status) {
      case "Skipped":
        stateClass = "is-skipped";
        sublabel = "Skipped";
        break;
      case "Completed":
        stateClass = "is-complete";
        break;
      case "Rejected":
        stateClass = "is-rejected";
        sublabel = "Rejected";
        terminal = true;
        break;
      case "Query_Raised":
        stateClass = "is-query";
        sublabel = "Query raised";
        break;
      case "Returned":
        stateClass = "is-returned";
        sublabel = "Returned";
        break;
      default: // Pending
        stateClass = invoiceStatus === LEVEL_TO_INVOICE_STATUS[level] ? "is-current" : "is-pending";
    }
    steps.push(workflowStepHtml(level, stateClass, sublabel));
  }

  let paymentClass = "is-na";
  let paymentSublabel = "";
  if (!terminal) {
    if (invoiceStatus === "Paid") {
      paymentClass = "is-complete";
    } else if (invoiceStatus === "Approved_For_Payment") {
      paymentClass = "is-current";
    } else if (invoiceStatus === "On_Hold") {
      paymentClass = "is-query";
      paymentSublabel = "On hold";
    } else if (invoiceStatus === "Returned_To_Vendor" || invoiceStatus === "Query_Raised") {
      paymentClass = "is-na";
    } else {
      paymentClass = "is-pending";
    }
  }
  steps.push(workflowStepHtml("Payment", paymentClass, paymentSublabel));

  return `<div class="workflow-timeline">${steps.join('<div class="workflow-timeline__connector"></div>')}</div>`;
}

// Phase 4 UI, Section 2: urgency chip. `dueDateIso` (date-only ISO string) compared
// against today; `thresholdDays` is 3 for TAT due dates, 7 for MSME payment due dates.
function buildUrgencyChipHtml(dueDateIso, thresholdDays) {
  if (!dueDateIso) return "";
  const due = new Date(dueDateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((due - today) / (1000 * 60 * 60 * 24));

  let variant;
  let label;
  if (daysLeft < 0) {
    variant = "is-danger";
    label = `Overdue by ${Math.abs(daysLeft)}d`;
  } else if (daysLeft <= thresholdDays) {
    variant = "is-warning";
    label = daysLeft === 0 ? "Due today" : `Due in ${daysLeft}d`;
  } else {
    variant = "is-ok";
    label = `Due in ${daysLeft}d`;
  }

  return `<span class="urgency-chip ${variant}">${label}</span>`;
}

// Builds an inline SVG circular progress ring. `percent` is 0-100.
function buildProgressRingSvg(percent, options = {}) {
  const size = options.size || 140;
  const strokeWidth = options.strokeWidth || 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circumference * (1 - clamped / 100);
  const center = size / 2;
  const completeClass = clamped >= 100 ? " is-complete" : "";

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <g transform="rotate(-90 ${center} ${center})">
        <circle class="progress-ring__track" cx="${center}" cy="${center}" r="${radius}" />
        <circle class="progress-ring__value${completeClass}" cx="${center}" cy="${center}" r="${radius}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
      </g>
      <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="middle" class="progress-ring-label">${Math.round(clamped)}%</text>
    </svg>
  `;
}

// Phase 5 UI: pulls the live CSS custom property values so Chart.js is styled with this
// app's own palette instead of its own defaults.
function chartColors() {
  const styles = getComputedStyle(document.documentElement);
  const get = (name) => styles.getPropertyValue(name).trim();
  return {
    primary: get("--color-primary"),
    success: get("--color-success"),
    warning: get("--color-warning"),
    danger: get("--color-danger"),
    textMuted: get("--color-text-muted"),
    border: get("--color-border"),
  };
}

// Phase 5 UI: metadata for every report endpoint Phase 5's backend implements. The
// backend spec's prose says "11 standard reports" but its own endpoint table lists 12 —
// built (and listed here) all 12, matching the table. Drives both reports.html's grid and
// report-viewer.html's generic renderer + filter panel — deliberately not a fixed column
// list per report, the viewer reads whatever fields the response actually contains.
const REPORT_DEFINITIONS = {
  "vendor-master": {
    label: "Vendor Master",
    description: "Vendor code, name, category, MSME status, KYC status, TDS section.",
    frequency: "As needed",
    filters: ["vendor_id"],
  },
  "vendor-compliance-status": {
    label: "Vendor Compliance Status",
    description: "GSTIN/PAN status, bank verification, document expiry.",
    frequency: "Monthly",
    filters: ["vendor_id"],
  },
  "invoice-tracker": {
    label: "Invoice Tracker",
    description: "Full lifecycle timestamps per invoice.",
    frequency: "Daily",
    filters: ["vendor_id", "date_from", "date_to"],
  },
  "pending-invoices": {
    label: "Pending Invoices",
    description: "Invoice, vendor, amount, current stage, days pending.",
    frequency: "Daily",
    filters: ["vendor_id"],
  },
  "payment-register": {
    label: "Payment Register",
    description: "Date, vendor, gross, TDS, net paid, UTR.",
    frequency: "Daily",
    filters: ["vendor_id", "date_from", "date_to"],
  },
  "tds-summary": {
    label: "TDS Summary",
    description: "Vendor PAN, section, gross, TDS.",
    frequency: "Monthly",
    filters: ["vendor_id"],
  },
  "form16a-data": {
    label: "Form 16A Data",
    description: "TDS certificate data per vendor per quarter (data only — no PDF).",
    frequency: "Quarterly",
    filters: ["vendor_id"],
  },
  "msme-payment": {
    label: "MSME Payment Compliance",
    description: "Vendor, invoice date, acceptance date, due date, payment date, delay.",
    frequency: "Monthly",
    filters: ["vendor_id"],
  },
  "budget-utilisation": {
    label: "Budget Utilisation",
    description: "Budget head, sanctioned, committed, paid, available.",
    frequency: "Monthly",
    filters: ["department"],
  },
  "aging-analysis": {
    label: "Aging Analysis",
    description: "Vendor, amount, invoice date, aging bucket, overdue days.",
    frequency: "Weekly",
    filters: ["vendor_id"],
  },
  "vendor-performance": {
    label: "Vendor Performance",
    description: "Submission accuracy, TAT compliance, query frequency.",
    frequency: "Monthly",
    filters: ["vendor_id"],
  },
  "approval-tat": {
    label: "Approval TAT",
    description: "Stage, approver, average TAT, breaches, escalations.",
    frequency: "Monthly",
    filters: [],
  },
};
