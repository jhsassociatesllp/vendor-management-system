(async function () {
  const bannerError = document.getElementById("banner-error");
  const body = document.getElementById("invoices-body");

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

  if (user.role !== "Vendor") {
    bannerError.textContent = "This page is only available to vendor-portal accounts.";
    bannerError.style.display = "block";
    return;
  }

  renderAppShell(user, "vendor-invoices-list.html");

  try {
    const [invoices, pos] = await Promise.all([
      apiFetch("/api/v1/invoices"),
      apiFetch("/api/v1/purchase-orders"),
    ]);

    const poNumberById = Object.fromEntries(pos.map((p) => [p.id, p.po_number]));

    if (invoices.length === 0) {
      body.innerHTML = `<tr><td colspan="5">No invoices yet.</td></tr>`;
      return;
    }

    body.innerHTML = invoices
      .map(
        (inv) => `
          <tr class="clickable-row" data-id="${inv.id}">
            <td>${inv.invoice_number}</td>
            <td>${inv.po_id ? poNumberById[inv.po_id] || inv.po_id : "&mdash; (Agreement-based)"}</td>
            <td>${inv.total_invoice_amount}</td>
            <td>${badgePillHtml(inv.status)}${flagTagsHtml(inv)}</td>
            <td>${inv.status === "Submitted" ? formatDate(inv.created_at) : "&mdash;"}</td>
          </tr>
        `
      )
      .join("");

    body.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/vendor-invoice-track.html?id=${row.dataset.id}`;
      });
    });
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
