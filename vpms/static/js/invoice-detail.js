(function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const detailFieldsEl = document.getElementById("detail-fields");
  const amountsFieldsEl = document.getElementById("amounts-fields");
  const periodFieldsEl = document.getElementById("period-fields");
  const documentsArea = document.getElementById("documents-area");
  const actionCard = document.getElementById("action-card");
  const actionArea = document.getElementById("action-area");

  const ROUTE_ROLES = ["Accounts Executive", "System Admin"];

  function showError(message) {
    bannerError.textContent = message;
    bannerError.style.display = "block";
  }

  function showSuccess(message) {
    bannerSuccess.textContent = message;
    bannerSuccess.style.display = "block";
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
      renderAppShell(user, "invoice-detail.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    let invoice;
    try {
      invoice = await apiFetch(`/api/v1/invoices/${invoiceId}`);
    } catch (err) {
      showError(err.status === 404 ? "Invoice not found." : friendlyMessage(err));
      return;
    }

    let vendorLabel = invoice.vendor_id;
    let itemLabel = invoice.item_code_id;
    let agreementLabel = invoice.agreement_id;
    let poLabel = invoice.po_id;
    let milestoneLabel = invoice.billing_milestone_id;

    try {
      const [vendor, itemCodes, agreement] = await Promise.all([
        apiFetch(`/api/v1/vendors/${invoice.vendor_id}`),
        apiFetch("/api/v1/item-codes"),
        apiFetch(`/api/v1/agreements/${invoice.agreement_id}`),
      ]);
      vendorLabel = `${vendor.vendor_name} (${vendor.vendor_code})`;
      const item = itemCodes.find((i) => i.id === invoice.item_code_id);
      if (item) itemLabel = `${item.category} / ${item.sub_category} &mdash; ${item.description}`;
      agreementLabel = agreement.agreement_number;

      if (invoice.po_id) {
        const po = await apiFetch(`/api/v1/purchase-orders/${invoice.po_id}`);
        poLabel = `<a href="/static/pages/po-detail.html?id=${po.id}">${po.po_number}</a>`;
      } else {
        poLabel = "&mdash; (Agreement-based)";
      }

      if (invoice.billing_milestone_id) {
        const milestones = await apiFetch(`/api/v1/agreements/${invoice.agreement_id}/milestones`).catch(() => []);
        const milestone = (milestones || []).find((m) => m.id === invoice.billing_milestone_id);
        milestoneLabel = milestone ? milestone.description : invoice.billing_milestone_id;
      } else {
        milestoneLabel = "&mdash;";
      }
    } catch (err) {
      // Non-fatal — fall back to raw ids already set above.
    }

    const inApprovalWorkflow = !["Draft", "Submitted"].includes(invoice.status);

    detailFieldsEl.innerHTML = [
      fieldRow("Invoice Number", invoice.invoice_number),
      fieldRow(
        "Status",
        `${badgePillHtml(invoice.status)}${flagTagsHtml(invoice)}${
          inApprovalWorkflow
            ? ` &middot; <a href="/static/pages/invoice-approval-detail.html?id=${invoice.id}">View approval status</a>`
            : ""
        }`
      ),
      fieldRow("Vendor", vendorLabel),
      fieldRow("Item Code", itemLabel),
      fieldRow("Agreement", agreementLabel),
      fieldRow("Purchase Order", poLabel),
      fieldRow("Invoice Date", invoice.invoice_date),
      fieldRow("Work Description", invoice.work_description),
      fieldRow("Submitted", invoice.status === "Submitted" ? formatDate(invoice.created_at) : "&mdash; (Draft)"),
    ].join("");

    amountsFieldsEl.innerHTML = [
      fieldRow("Quantity", invoice.quantity),
      fieldRow("Rate", invoice.rate),
      fieldRow("Taxable Amount", invoice.taxable_amount),
      fieldRow("CGST", invoice.cgst_amount),
      fieldRow("SGST", invoice.sgst_amount),
      fieldRow("IGST", invoice.igst_amount),
      fieldRow("Total GST", invoice.total_gst_amount),
      fieldRow("Total Invoice Amount", invoice.total_invoice_amount),
      fieldRow("GST Mismatch Delta", invoice.gst_mismatch_delta),
    ].join("");

    periodFieldsEl.innerHTML = [
      fieldRow("Period of Service", `${invoice.period_service_from} &mdash; ${invoice.period_service_to}`),
      fieldRow("Billing Milestone", milestoneLabel),
    ].join("");

    try {
      const documents = await apiFetch(`/api/v1/invoices/${invoiceId}/documents`);
      renderDocuments(documents);
    } catch (err) {
      documentsArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
    }

    if (ROUTE_ROLES.includes(user.role) && invoice.status === "Submitted") {
      actionCard.style.display = "block";
      actionArea.innerHTML = `
        <div class="hint">This invoice is Submitted and ready to enter the approval workflow.</div>
        <button type="button" class="btn-primary" id="route-button">Route for Approval</button>
      `;
      document.getElementById("route-button").addEventListener("click", async () => {
        bannerError.style.display = "none";
        try {
          await apiFetch(`/api/v1/invoices/${invoiceId}/route-for-approval`, { method: "POST" });
          showSuccess("Invoice routed for approval.");
          setTimeout(() => {
            window.location.href = `/static/pages/invoice-approval-detail.html?id=${invoiceId}`;
          }, 800);
        } catch (err) {
          showError(friendlyMessage(err));
        }
      });
    }
  }

  function renderDocuments(documents) {
    if (documents.length === 0) {
      documentsArea.innerHTML = "<p>No documents uploaded.</p>";
      return;
    }

    documentsArea.innerHTML = `
      <table>
        <thead><tr><th>Type</th><th>Required</th><th>Uploaded</th><th></th></tr></thead>
        <tbody>
          ${documents
            .map(
              (doc) => `
                <tr>
                  <td>${doc.document_type.replace(/_/g, " ")}</td>
                  <td>${doc.is_mandatory ? `<span class="doc-required-tag">Required</span>` : `<span class="doc-optional-tag">Optional</span>`}</td>
                  <td>${formatDate(doc.uploaded_at)}</td>
                  <td><button type="button" class="btn-secondary view-doc-button" data-id="${doc.id}">View</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;

    documentsArea.querySelectorAll(".view-doc-button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await openAuthenticatedFile(`/api/v1/invoices/documents/${btn.dataset.id}/file`);
        } catch (err) {
          showError("Could not open the file.");
        }
      });
    });
  }

  init();
})();
