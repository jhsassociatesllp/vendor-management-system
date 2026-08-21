(async function () {
  const bannerError = document.getElementById("banner-error");
  const body = document.getElementById("queue-body");

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

  renderAppShell(user, "payment-queue.html");

  if (!FINANCE_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    body.innerHTML = `<tr><td colspan="5">Not available for your role.</td></tr>`;
    return;
  }

  try {
    const [queue, vendors] = await Promise.all([
      apiFetch("/api/v1/payments/queue"),
      apiFetch("/api/v1/vendors"),
    ]);

    const vendorById = Object.fromEntries(vendors.map((v) => [v.id, v]));

    if (queue.length === 0) {
      body.innerHTML = `<tr><td colspan="5">Nothing in the payment queue.</td></tr>`;
      return;
    }

    // Already sorted server-side by payment_due_date — do not re-sort here.
    body.innerHTML = queue
      .map((inv) => {
        const vendor = vendorById[inv.vendor_id];
        const vendorLabel = vendor ? `${vendor.vendor_name} (${vendor.vendor_code})` : inv.vendor_id;
        const msmeTag = vendor && vendor.msme_status ? `<span class="flag-tag flag-tag--msme">MSME</span>` : "";
        return `
          <tr class="clickable-row" data-id="${inv.id}">
            <td>${inv.invoice_number}</td>
            <td>${vendorLabel}${msmeTag}</td>
            <td>${inv.total_invoice_amount}</td>
            <td>${inv.payment_due_date || "&mdash;"} ${buildUrgencyChipHtml(inv.payment_due_date, 7)}</td>
            <td>${badgePillHtml(inv.status)}</td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/payment-record-form.html?id=${row.dataset.id}`;
      });
    });
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
