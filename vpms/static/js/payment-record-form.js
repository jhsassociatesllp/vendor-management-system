(function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const invoiceFieldsEl = document.getElementById("invoice-fields");
  const formCard = document.getElementById("form-card");
  const form = document.getElementById("payment-form");
  const formError = document.getElementById("form-error");

  const tdsSectionInput = document.getElementById("tds_section");
  const tdsRateInput = document.getElementById("tds_rate");
  const overrideReasonArea = document.getElementById("override-reason-area");
  const overrideReasonInput = document.getElementById("tds_override_reason");

  const FINANCE_ROLES = ["Finance Team", "System Admin"];

  function showError(message) {
    bannerError.textContent = message;
    bannerError.style.display = "block";
  }

  function fieldRow(label, value) {
    return `<div class="field-row"><span class="field-label">${label}</span><span class="field-value">${value}</span></div>`;
  }

  function money(n) {
    return `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  async function init() {
    if (!invoiceId) {
      showError("No invoice id given.");
      return;
    }

    let user;
    try {
      user = await getCurrentUser();
      renderAppShell(user, "payment-queue.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    if (!FINANCE_ROLES.includes(user.role)) {
      showError("You don't have permission for this action.");
      return;
    }

    let invoice, vendor, defaultTds;
    try {
      invoice = await apiFetch(`/api/v1/invoices/${invoiceId}`);
      const vendors = await apiFetch("/api/v1/vendors");
      vendor = vendors.find((v) => v.id === invoice.vendor_id);
    } catch (err) {
      showError(err.status === 404 ? "Invoice not found." : friendlyMessage(err));
      return;
    }

    if (invoice.status !== "Approved_For_Payment") {
      invoiceFieldsEl.innerHTML = [
        fieldRow("Invoice Number", invoice.invoice_number),
        fieldRow("Status", badgePillHtml(invoice.status)),
      ].join("");
      showError(`This invoice must be Approved_For_Payment to record a payment (current status: ${invoice.status}).`);
      return;
    }

    invoiceFieldsEl.innerHTML = [
      fieldRow("Invoice Number", invoice.invoice_number),
      fieldRow("Vendor", vendor ? `${vendor.vendor_name} (${vendor.vendor_code})${vendor.msme_status ? ` <span class="flag-tag flag-tag--msme">MSME</span>` : ""}` : invoice.vendor_id),
      fieldRow("Total Invoice Amount", invoice.total_invoice_amount),
      fieldRow("Payment Due Date", `${invoice.payment_due_date || "&mdash;"} ${buildUrgencyChipHtml(invoice.payment_due_date, 7)}`),
      fieldRow("Status", badgePillHtml(invoice.status)),
    ].join("");

    try {
      defaultTds = await apiFetch(`/api/v1/payments/tds-default/${invoiceId}`);
    } catch (err) {
      showError(friendlyMessage(err));
      return;
    }

    tdsSectionInput.value = defaultTds.tds_section;
    tdsRateInput.value = defaultTds.tds_rate;
    formCard.style.display = "block";

    function updatePreview() {
      const gross = Number(invoice.total_invoice_amount);
      const rate = Number(tdsRateInput.value);
      if (!rate && rate !== 0) {
        document.getElementById("preview-gross").textContent = "&mdash;";
        document.getElementById("preview-tds").textContent = "&mdash;";
        document.getElementById("preview-net").textContent = "&mdash;";
        return;
      }
      const tds = (gross * rate) / 100;
      const net = gross - tds;
      document.getElementById("preview-gross").textContent = money(gross);
      document.getElementById("preview-tds").textContent = money(tds);
      document.getElementById("preview-net").textContent = money(net);

      const overridden = tdsSectionInput.value.trim() !== defaultTds.tds_section || Number(tdsRateInput.value) !== Number(defaultTds.tds_rate);
      overrideReasonArea.style.display = overridden ? "block" : "none";
    }

    tdsSectionInput.addEventListener("input", updatePreview);
    tdsRateInput.addEventListener("input", updatePreview);
    updatePreview();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      formError.textContent = "";
      bannerSuccess.style.display = "none";

      const overridden = tdsSectionInput.value.trim() !== defaultTds.tds_section || Number(tdsRateInput.value) !== Number(defaultTds.tds_rate);
      if (overridden && !overrideReasonInput.value.trim()) {
        formError.textContent = "A reason is required when overriding the default TDS section/rate.";
        return;
      }

      const payload = {
        invoice_id: invoiceId,
        tds_section: tdsSectionInput.value.trim(),
        tds_rate: tdsRateInput.value,
        tds_override_reason: overridden ? overrideReasonInput.value.trim() : null,
        payment_mode: document.getElementById("payment_mode").value,
        company_bank_account: document.getElementById("company_bank_account").value.trim(),
        payment_date: document.getElementById("payment_date").value,
        utr_reference: document.getElementById("utr_reference").value.trim(),
        itc_eligible: document.getElementById("itc_eligible").checked,
      };

      try {
        const payment = await apiFetch("/api/v1/payments", { method: "POST", body: JSON.stringify(payload) });
        bannerSuccess.textContent = `Payment recorded (net payable ${money(payment.net_payable_amount)}). Awaiting a different Finance user's confirmation.`;
        bannerSuccess.style.display = "block";
        form.style.display = "none";
        setTimeout(() => {
          window.location.href = "/static/pages/payment-queue.html";
        }, 1500);
      } catch (err) {
        formError.textContent = friendlyMessage(err);
      }
    });
  }

  init();
})();
