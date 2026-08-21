const FILTER_LABELS = {
  vendor_id: "Vendor",
  department: "Department",
  date_from: "Date From",
  date_to: "Date To",
};

function getReportType() {
  return new URLSearchParams(window.location.search).get("type");
}

function showError(message) {
  const banner = document.getElementById("banner-error");
  banner.textContent = message;
  banner.style.display = "block";
}

async function buildFilterPanel(def) {
  const panel = document.getElementById("filter-panel");
  panel.innerHTML = "";
  if (def.filters.length === 0) {
    panel.innerHTML = `<p class="hint">This report has no filters.</p>`;
    return;
  }

  let vendors = [];
  let departments = [];
  if (def.filters.includes("vendor_id")) {
    vendors = await apiFetch("/api/v1/vendors");
  }
  if (def.filters.includes("department")) {
    const budgetHeads = await apiFetch("/api/v1/budget-heads");
    departments = Array.from(new Set(budgetHeads.map((h) => h.department))).sort();
  }

  for (const filterKey of def.filters) {
    const field = document.createElement("div");
    field.className = "filter-field";
    const label = FILTER_LABELS[filterKey] || filterKey;

    if (filterKey === "vendor_id") {
      field.innerHTML = `
        <label for="filter-${filterKey}">${label}</label>
        <select id="filter-${filterKey}">
          <option value="">All vendors</option>
          ${vendors.map((v) => `<option value="${v.id}">${v.vendor_name}</option>`).join("")}
        </select>
      `;
    } else if (filterKey === "department") {
      field.innerHTML = `
        <label for="filter-${filterKey}">${label}</label>
        <select id="filter-${filterKey}">
          <option value="">All departments</option>
          ${departments.map((d) => `<option value="${d}">${d}</option>`).join("")}
        </select>
      `;
    } else if (filterKey === "date_from" || filterKey === "date_to") {
      field.innerHTML = `<label for="filter-${filterKey}">${label}</label><input type="date" id="filter-${filterKey}" />`;
    } else {
      field.innerHTML = `<label for="filter-${filterKey}">${label}</label><input type="text" id="filter-${filterKey}" />`;
    }
    panel.appendChild(field);
  }
}

function currentFilterParams(def) {
  const params = new URLSearchParams();
  for (const filterKey of def.filters) {
    const el = document.getElementById(`filter-${filterKey}`);
    if (el && el.value) params.set(filterKey, el.value);
  }
  return params;
}

function renderTable(rows) {
  const head = document.getElementById("report-table-head");
  const body = document.getElementById("report-table-body");
  const status = document.getElementById("report-status");

  if (rows.length === 0) {
    head.innerHTML = "";
    body.innerHTML = "";
    status.textContent = "No data for the selected filters.";
    return;
  }

  status.textContent = `${rows.length} row${rows.length === 1 ? "" : "s"}.`;
  const columns = Object.keys(rows[0]);
  head.innerHTML = columns.map((c) => `<th>${c.replace(/_/g, " ")}</th>`).join("");
  body.innerHTML = rows
    .map((row) => `<tr>${columns.map((c) => `<td>${row[c] === null || row[c] === undefined ? "" : row[c]}</td>`).join("")}</tr>`)
    .join("");
}

async function runReport(type, def) {
  const status = document.getElementById("report-status");
  status.textContent = "Loading…";
  try {
    const params = currentFilterParams(def);
    const rows = await apiFetch(`/api/v1/reports/${type}?${params.toString()}`);
    renderTable(rows);
  } catch (err) {
    status.textContent = "";
    showError(friendlyMessage(err));
  }
}

async function exportCsv(type, def) {
  try {
    const params = currentFilterParams(def);
    params.set("format", "csv");
    const token = getToken();
    const response = await fetch(`/api/v1/reports/${type}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      const error = new Error("Could not export the report.");
      error.status = response.status;
      throw error;
    }
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${type}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    showError(friendlyMessage(err));
  }
}

async function init() {
  const type = getReportType();
  const def = REPORT_DEFINITIONS[type];

  try {
    const user = await getCurrentUser();
    renderAppShell(user, "report-viewer.html");

    if (!def) {
      showError("Unknown report type.");
      return;
    }

    document.getElementById("report-title").textContent = def.label;
    document.getElementById("report-description").textContent = `${def.description} (${def.frequency})`;

    await buildFilterPanel(def);
    document.getElementById("run-report-button").addEventListener("click", () => runReport(type, def));
    document.getElementById("export-csv-button").addEventListener("click", () => exportCsv(type, def));

    await runReport(type, def);
  } catch (err) {
    showError(friendlyMessage(err));
  }
}

init();
