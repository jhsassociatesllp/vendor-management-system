(function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const timelineArea = document.getElementById("timeline-area");
  const detailFieldsEl = document.getElementById("detail-fields");
  const queryCard = document.getElementById("query-card");
  const queryArea = document.getElementById("query-area");
  const paymentCard = document.getElementById("payment-card");
  const paymentArea = document.getElementById("payment-area");

  function showError(message) {
    bannerError.textContent = message;
    bannerError.style.display = "block";
  }

  function fieldRow(label, value) {
    return `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${value}</span></div>`;
  }

  async function init() {
    if (!invoiceId) {
      showError("No invoice id given.");
      return;
    }

    let user;
    try {
      user = await getCurrentUser();
      renderAppShell(user, "vendor-invoices-list.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    if (user.role !== "Vendor") {
      showError("This page is only available to vendor-portal accounts.");
      return;
    }

    let invoice, approvals, queries;
    try {
      [invoice, approvals, queries] = await Promise.all([
        apiFetch(`/api/v1/invoices/${invoiceId}`),
        apiFetch(`/api/v1/invoices/${invoiceId}/approvals`),
        apiFetch(`/api/v1/invoices/${invoiceId}/queries`),
      ]);
    } catch (err) {
      showError(err.status === 404 ? "Invoice not found." : friendlyMessage(err));
      return;
    }

    timelineArea.innerHTML = buildWorkflowTimelineHtml(approvals, invoice.status);

    detailFieldsEl.innerHTML = [
      fieldRow("Invoice Number", invoice.invoice_number),
      fieldRow("Status", badgePillHtml(invoice.status)),
      fieldRow("Total Invoice Amount", invoice.total_invoice_amount),
      fieldRow("Invoice Date", invoice.invoice_date),
    ].join("");

    if (invoice.status === "Returned_To_Vendor") {
      detailFieldsEl.innerHTML += `
        <div class="reason-box">
          <p>This invoice was returned. Once you've made corrections, resubmit it to send it back into review.</p>
          <button type="button" class="btn-primary" id="resubmit-button">Resubmit</button>
        </div>
      `;
      document.getElementById("resubmit-button").addEventListener("click", async () => {
        bannerError.style.display = "none";
        try {
          await apiFetch(`/api/v1/invoices/${invoiceId}/resubmit`, { method: "POST" });
          bannerSuccess.textContent = "Invoice resubmitted.";
          bannerSuccess.style.display = "block";
          setTimeout(() => window.location.reload(), 800);
        } catch (err) {
          showError(friendlyMessage(err));
        }
      });
    }

    // Queries list is already newest-first. Show every query, not just the currently-open
    // one — otherwise a submitted response vanishes from view with no record of it.
    if (queries.length > 0) {
      queryCard.style.display = "block";
      queryArea.innerHTML = queries
        .map((q) => {
          const rows = [
            fieldRow("Raised At Level", q.raised_at_level),
            fieldRow("Status", badgePillHtml(q.status)),
            fieldRow("Query", q.query_text),
            fieldRow("Raised", formatDate(q.created_at)),
          ];
          if (q.status === "Responded") {
            rows.push(fieldRow("Your Response", q.vendor_response));
            rows.push(fieldRow("Responded", formatDate(q.responded_at)));
          }
          return `<div class="reason-box">${rows.join("")}</div>`;
        })
        .join("");
    }

    const openQuery = queries.find((q) => q.status === "Open");
    if (openQuery) {
      queryArea.innerHTML += `
        <label for="vendor-response">Your Response</label>
        <textarea id="vendor-response"></textarea>
        <div class="error-text" id="response-error"></div>
        <button type="button" class="btn-primary" id="submit-response-button">Submit Response</button>
      `;
      document.getElementById("submit-response-button").addEventListener("click", async () => {
        const responseText = document.getElementById("vendor-response").value.trim();
        if (!responseText) {
          document.getElementById("response-error").textContent = "A response is required.";
          return;
        }
        bannerError.style.display = "none";
        try {
          await apiFetch(`/api/v1/invoices/${invoiceId}/queries/${openQuery.id}/respond`, {
            method: "POST",
            body: JSON.stringify({ vendor_response: responseText }),
          });
          bannerSuccess.textContent = "Response submitted — this invoice is back with the reviewer.";
          bannerSuccess.style.display = "block";
          setTimeout(() => window.location.reload(), 800);
        } catch (err) {
          showError(friendlyMessage(err));
        }
      });
    }

    if (invoice.status === "Paid") {
      paymentCard.style.display = "block";
      try {
        const payment = await apiFetch(`/api/v1/invoices/${invoiceId}/payment`);
        paymentArea.innerHTML = [
          fieldRow("Payment Date", payment.payment_date),
          fieldRow("UTR Reference", payment.utr_reference),
          fieldRow("Payment Mode", payment.payment_mode),
        ].join("");
      } catch (err) {
        paymentArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
      }
    }
  }

  init();
})();
