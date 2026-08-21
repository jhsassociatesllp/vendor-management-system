function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function showError(message) {
  const banner = document.getElementById("banner-error");
  banner.textContent = message;
  banner.style.display = "block";
}

let agingChart = null;
let spendChart = null;
let vendorNameById = {};

async function loadKpis() {
  const summary = await apiFetch("/api/v1/mis/dashboard/summary");
  document.getElementById("kpi-total-payables").textContent = money(summary.total_payables);
  document.getElementById("kpi-overdue").textContent = summary.overdue_invoice_count;
  document.getElementById("kpi-msme-risk").textContent = summary.msme_risk_count;
  document.getElementById("kpi-budget-util").textContent = `${summary.budget_utilization_pct.toFixed(1)}%`;
}

async function loadAgingChart() {
  const rows = await apiFetch("/api/v1/mis/dashboard/aging");
  const colors = chartColors();
  const ctx = document.getElementById("aging-chart").getContext("2d");

  if (agingChart) agingChart.destroy();
  agingChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: rows.map((r) => r.bucket),
      datasets: [
        {
          label: "Amount (₹)",
          data: rows.map((r) => r.amount),
          backgroundColor: [colors.success, colors.warning, colors.warning, colors.danger],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const bucket = rows[elements[0].index].bucket;
        showAgingDrilldown(bucket);
      },
      scales: { y: { beginAtZero: true } },
    },
  });
}

async function showAgingDrilldown(bucket) {
  const container = document.getElementById("aging-drilldown");
  container.innerHTML = `<p class="hint">Loading ${bucket} invoices…</p>`;
  try {
    const rows = await apiFetch("/api/v1/reports/aging-analysis");
    const matches = rows.filter((r) => r.aging_bucket === bucket);
    if (matches.length === 0) {
      container.innerHTML = `<p class="hint">No invoices in the ${bucket} bucket.</p>`;
      return;
    }
    container.innerHTML = `
      <h3>${bucket} days (${matches.length} invoice${matches.length === 1 ? "" : "s"})</h3>
      <table>
        <thead><tr><th>Vendor</th><th>Invoice #</th><th>Amount</th><th>Invoice Date</th><th>Overdue Days</th></tr></thead>
        <tbody>
          ${matches
            .map(
              (r) => `<tr><td>${r.vendor_name}</td><td>${r.invoice_number}</td><td>${money(r.amount)}</td><td>${r.invoice_date}</td><td>${r.overdue_days}</td></tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="hint">Could not load drill-down: ${friendlyMessage(err)}</p>`;
  }
}

function currentSpendFilters() {
  const params = new URLSearchParams();
  const vendorId = document.getElementById("filter-vendor").value;
  const department = document.getElementById("filter-department").value;
  const dateFrom = document.getElementById("filter-date-from").value;
  const dateTo = document.getElementById("filter-date-to").value;
  if (vendorId) params.set("vendor_id", vendorId);
  if (department) params.set("department", department);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  return params;
}

let categoryIsolation = null;

async function loadSpendChart() {
  const params = currentSpendFilters();
  const rows = await apiFetch(`/api/v1/mis/dashboard/spend-by-category?${params.toString()}`);
  const filtered = categoryIsolation ? rows.filter((r) => r.category === categoryIsolation) : rows;
  const colors = chartColors();
  const ctx = document.getElementById("spend-chart").getContext("2d");

  if (spendChart) spendChart.destroy();
  spendChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: filtered.map((r) => r.category),
      datasets: [
        { label: "Current Period", data: filtered.map((r) => r.current_period_amount), backgroundColor: colors.primary },
        { label: "Previous Period", data: filtered.map((r) => r.previous_period_amount), backgroundColor: colors.border },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (!elements.length) return;
        const category = filtered[elements[0].index].category;
        categoryIsolation = categoryIsolation === category ? null : category;
        loadSpendChart();
      },
      scales: { y: { beginAtZero: true } },
    },
  });
}

async function populateFilterOptions() {
  const [vendors, budgetHeads] = await Promise.all([apiFetch("/api/v1/vendors"), apiFetch("/api/v1/budget-heads")]);

  const vendorSelect = document.getElementById("filter-vendor");
  for (const v of vendors) {
    vendorNameById[v.id] = v.vendor_name;
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = v.vendor_name;
    vendorSelect.appendChild(opt);
  }

  const departments = Array.from(new Set(budgetHeads.map((h) => h.department))).sort();
  const deptSelect = document.getElementById("filter-department");
  for (const dept of departments) {
    const opt = document.createElement("option");
    opt.value = dept;
    opt.textContent = dept;
    deptSelect.appendChild(opt);
  }
}

function setPeriod(monthsAgo) {
  const today = new Date();
  const target = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
  const from = new Date(target.getFullYear(), target.getMonth(), 1);
  const to = monthsAgo === 0 ? today : new Date(target.getFullYear(), target.getMonth() + 1, 0);
  document.getElementById("filter-date-from").value = from.toISOString().slice(0, 10);
  document.getElementById("filter-date-to").value = to.toISOString().slice(0, 10);
  categoryIsolation = null;
  loadSpendChart().catch((err) => showError(friendlyMessage(err)));
}

async function init() {
  try {
    const user = await getCurrentUser();
    renderAppShell(user, "mis-dashboard.html");

    await Promise.all([loadKpis(), loadAgingChart(), populateFilterOptions()]);
    await loadSpendChart();

    document.getElementById("apply-filters-button").addEventListener("click", () => {
      categoryIsolation = null;
      loadSpendChart().catch((err) => showError(friendlyMessage(err)));
    });
    document.getElementById("period-this-month").addEventListener("click", () => setPeriod(0));
    document.getElementById("period-last-month").addEventListener("click", () => setPeriod(1));
  } catch (err) {
    showError(friendlyMessage(err));
  }
}

init();
