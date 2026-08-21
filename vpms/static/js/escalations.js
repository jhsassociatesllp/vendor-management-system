(async function () {
  const bannerError = document.getElementById("banner-error");
  const body = document.getElementById("escalations-body");

  const APPROVER_ROLES = ["Accounts Executive", "Dept. Manager", "Partner / VP", "Finance Team", "System Admin"];

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

  renderAppShell(user, "escalations.html");

  if (!APPROVER_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    body.innerHTML = `<tr><td colspan="5">Not available for your role.</td></tr>`;
    return;
  }

  try {
    const [escalations, invoices, vendors] = await Promise.all([
      apiFetch("/api/v1/invoice-approvals/escalations"),
      apiFetch("/api/v1/invoices"),
      apiFetch("/api/v1/vendors"),
    ]);

    const invoiceById = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));
    const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));

    if (escalations.length === 0) {
      body.innerHTML = `<tr><td colspan="5">No escalations right now.</td></tr>`;
      return;
    }

    body.innerHTML = escalations
      .map((row) => {
        const invoice = invoiceById[row.invoice_id];
        return `
          <tr class="clickable-row" data-invoice-id="${row.invoice_id}">
            <td>${invoice ? invoice.invoice_number : row.invoice_id}</td>
            <td>${invoice ? vendorNameById[invoice.vendor_id] || invoice.vendor_id : "&mdash;"}</td>
            <td>${row.level}</td>
            <td>${row.assigned_role}</td>
            <td>${buildUrgencyChipHtml(row.tat_due_at, 3)}</td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/invoice-approval-detail.html?id=${row.dataset.invoiceId}`;
      });
    });
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
