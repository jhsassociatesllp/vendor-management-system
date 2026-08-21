let expandedLogId = null;
let currentRows = [];

function showError(message) {
  const banner = document.getElementById("banner-error");
  banner.textContent = message;
  banner.style.display = "block";
}

async function populateFilterOptions() {
  const [users, logs] = await Promise.all([apiFetch("/api/v1/users"), apiFetch("/api/v1/audit-logs")]);

  const userSelect = document.getElementById("filter-user");
  for (const u of users) {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  }

  const modules = Array.from(new Set(logs.map((l) => l.module))).sort();
  const moduleSelect = document.getElementById("filter-module");
  for (const m of modules) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    moduleSelect.appendChild(opt);
  }
}

function currentFilterParams() {
  const params = new URLSearchParams();
  const userId = document.getElementById("filter-user").value;
  const module = document.getElementById("filter-module").value;
  const action = document.getElementById("filter-action").value;
  const recordReference = document.getElementById("filter-record-reference").value.trim();
  const dateFrom = document.getElementById("filter-date-from").value;
  const dateTo = document.getElementById("filter-date-to").value;
  if (userId) params.set("user_id", userId);
  if (module) params.set("module", module);
  if (action) params.set("action", action);
  if (recordReference) params.set("record_reference", recordReference);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  return params;
}

function fieldChangesHtml(log) {
  if (!log.field_changes || log.field_changes.length === 0) {
    return `<p class="hint">No field-level changes recorded for this entry.</p>`;
  }
  return log.field_changes
    .map(
      (c) => `
      <div class="audit-field-change">
        <span class="audit-field-change__name">${c.field}</span>
        <span class="audit-field-change__old">${c.old_value === null ? "—" : c.old_value}</span>
        <span>&rarr;</span>
        <span class="audit-field-change__new">${c.new_value === null ? "—" : c.new_value}</span>
      </div>
    `
    )
    .join("");
}

function renderRows() {
  const body = document.getElementById("audit-table-body");
  const status = document.getElementById("audit-status");

  if (currentRows.length === 0) {
    body.innerHTML = "";
    status.textContent = "No audit entries for the selected filters.";
    return;
  }
  status.textContent = `${currentRows.length} entr${currentRows.length === 1 ? "y" : "ies"}.`;

  body.innerHTML = currentRows
    .map((log) => {
      const rowHtml = `
        <tr class="audit-row clickable-row" data-log-id="${log.id}">
          <td>${formatDate(log.timestamp)}</td>
          <td>${log.user_name_snapshot || "System"}</td>
          <td>${log.role_snapshot || ""}</td>
          <td>${badgePillHtml(log.action)}</td>
          <td>${log.module}</td>
          <td>${log.record_reference}</td>
        </tr>
      `;
      if (log.id !== expandedLogId) return rowHtml;
      return (
        rowHtml +
        `
        <tr class="audit-detail-row">
          <td colspan="6">
            <div><strong>Session:</strong> ${log.session_id || "—"} &nbsp; <strong>IP:</strong> ${log.ip_address || "—"}</div>
            <div style="margin-top: 8px;">${fieldChangesHtml(log)}</div>
            <div class="hint" style="margin-top: 8px;">Record hash: ${log.record_hash}</div>
          </td>
        </tr>
      `
      );
    })
    .join("");

  for (const row of body.querySelectorAll("tr.audit-row")) {
    row.addEventListener("click", () => {
      const logId = row.getAttribute("data-log-id");
      expandedLogId = expandedLogId === logId ? null : logId;
      renderRows();
    });
  }
}

async function loadLogs() {
  const status = document.getElementById("audit-status");
  status.textContent = "Loading…";
  try {
    const params = currentFilterParams();
    currentRows = await apiFetch(`/api/v1/audit-logs?${params.toString()}`);
    renderRows();
  } catch (err) {
    status.textContent = "";
    showError(friendlyMessage(err));
  }
}

async function runIntegrityCheck() {
  const resultEl = document.getElementById("integrity-result");
  resultEl.innerHTML = `<p class="hint">Checking…</p>`;
  try {
    const result = await apiFetch("/api/v1/audit-logs/integrity-check");
    if (result.clean) {
      resultEl.innerHTML = `
        <div class="integrity-banner is-clean">
          <span class="integrity-banner__icon">&#10003;</span>
          <div class="integrity-banner__text">
            <strong>Chain intact — no tampering detected.</strong>
            <span>${result.rows_checked} row${result.rows_checked === 1 ? "" : "s"} checked.</span>
          </div>
        </div>
      `;
      return;
    }
    resultEl.innerHTML = `
      <div class="integrity-banner is-broken">
        <span class="integrity-banner__icon">&#9888;</span>
        <div class="integrity-banner__text">
          <strong>${result.breaks.length} break${result.breaks.length === 1 ? "" : "s"} found.</strong>
          <span>${result.rows_checked} row${result.rows_checked === 1 ? "" : "s"} checked — a stored hash no longer matches its recomputed value at the sequence(s) below.</span>
        </div>
      </div>
      <table>
        <thead><tr><th>Sequence</th><th>Expected Hash</th><th>Stored Hash</th></tr></thead>
        <tbody>
          ${result.breaks
            .map(
              (b) => `
              <tr>
                <td>${b.sequence}</td>
                <td class="hash-cell" title="${b.expected_hash}">${b.expected_hash}</td>
                <td class="hash-cell" title="${b.stored_hash}">${b.stored_hash}</td>
              </tr>
            `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    resultEl.innerHTML = "";
    showError(friendlyMessage(err));
  }
}

async function init() {
  try {
    const user = await getCurrentUser();
    renderAppShell(user, "audit-trail.html");

    await populateFilterOptions();
    await loadLogs();

    document.getElementById("apply-filters-button").addEventListener("click", loadLogs);
    document.getElementById("integrity-check-button").addEventListener("click", runIntegrityCheck);
  } catch (err) {
    showError(friendlyMessage(err));
  }
}

init();
