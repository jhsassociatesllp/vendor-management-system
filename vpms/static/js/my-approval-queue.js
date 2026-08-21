(async function () {
  const bannerError = document.getElementById("banner-error");
  const body = document.getElementById("queue-body");

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

  renderAppShell(user, "my-approval-queue.html");

  try {
    const [queue, invoices, vendors] = await Promise.all([
      apiFetch("/api/v1/invoice-approvals/my-queue"),
      apiFetch("/api/v1/invoices"),
      apiFetch("/api/v1/vendors"),
    ]);

    const invoiceById = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));
    const vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));

    if (queue.length === 0) {
      body.innerHTML = `<tr><td colspan="5">Nothing pending your action right now.</td></tr>`;
      return;
    }

    body.innerHTML = queue
      .map((row) => {
        const invoice = invoiceById[row.invoice_id];
        return `
          <tr class="clickable-row" data-approval-id="${row.id}" data-invoice-id="${row.invoice_id}">
            <td>${invoice ? invoice.invoice_number : row.invoice_id}</td>
            <td>${invoice ? vendorNameById[invoice.vendor_id] || invoice.vendor_id : "&mdash;"}</td>
            <td>${invoice ? invoice.total_invoice_amount : "&mdash;"}</td>
            <td>${row.level}</td>
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
