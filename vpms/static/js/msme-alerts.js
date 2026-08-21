(async function () {
  const bannerError = document.getElementById("banner-error");
  const overdueBody = document.getElementById("overdue-body");
  const atRiskBody = document.getElementById("at-risk-body");

  const FINANCE_ROLES = ["Finance Team", "System Admin"];

  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (err.status !== 401) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
    return;
  }

  renderAppShell(user, "msme-alerts.html");

  if (!FINANCE_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    overdueBody.innerHTML = `<tr><td colspan="4">Not available for your role.</td></tr>`;
    atRiskBody.innerHTML = "";
    return;
  }

  function rowHtml(alert, vendorLabel) {
    return `
      <tr class="clickable-row" data-id="${alert.invoice_id}">
        <td>${alert.invoice_number}</td>
        <td>${vendorLabel}</td>
        <td>${alert.payment_due_date}</td>
        <td>${buildUrgencyChipHtml(alert.payment_due_date, 7)}</td>
      </tr>
    `;
  }

  function attachRowClicks(container) {
    container.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/payment-record-form.html?id=${row.dataset.id}`;
      });
    });
  }

  try {
    const [alerts, vendors] = await Promise.all([
      apiFetch("/api/v1/payments/msme-alerts"),
      apiFetch("/api/v1/vendors"),
    ]);

    const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));

    const overdue = alerts.filter((a) => a.alert_type === "Overdue");
    const atRisk = alerts.filter((a) => a.alert_type === "At_Risk");

    overdueBody.innerHTML =
      overdue.length === 0
        ? `<tr><td colspan="4">No overdue MSME invoices.</td></tr>`
        : overdue.map((a) => rowHtml(a, vendorNameById[a.vendor_id] || a.vendor_id)).join("");
    attachRowClicks(overdueBody);

    atRiskBody.innerHTML =
      atRisk.length === 0
        ? `<tr><td colspan="4">No at-risk MSME invoices.</td></tr>`
        : atRisk.map((a) => rowHtml(a, vendorNameById[a.vendor_id] || a.vendor_id)).join("");
    attachRowClicks(atRiskBody);
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
