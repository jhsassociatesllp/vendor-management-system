(function () {
  const params = new URLSearchParams(window.location.search);
  const requestId = params.get("id");

  const detailFieldsEl = document.getElementById("detail-fields");
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const actionCard = document.getElementById("action-card");
  const actionArea = document.getElementById("action-area");
  const vendorCard = document.getElementById("vendor-card");
  const vendorArea = document.getElementById("vendor-area");
  const itemCodeCard = document.getElementById("item-code-card");
  const itemCodeArea = document.getElementById("item-code-area");

  const ACCOUNTS_REVIEWABLE_STATUSES = ["Submitted", "Accounts_Review"];
  const ACCOUNTS_ROLES = ["Accounts Executive", "System Admin"];
  const PARTNER_ROLES = ["Partner / VP", "System Admin"];

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

  function yesNo(value) {
    return value ? "Yes" : "No";
  }

  function renderFields(request) {
    const rows = [
      fieldRow("Status", badgePillHtml(request.status)),
      fieldRow("Recommended Vendor Name", request.recommended_vendor_name),
      fieldRow("Category", request.category),
      fieldRow("Estimated Annual Spend", request.estimated_annual_spend),
      fieldRow("Recommended PAN", request.recommended_pan),
      fieldRow("Recommended GSTIN", request.recommended_gstin || "&mdash;"),
      fieldRow("Business Need", request.business_need),
      fieldRow("Financial Stability OK", yesNo(request.financial_stability_ok)),
      fieldRow("Technical Capability OK", yesNo(request.technical_capability_ok)),
      fieldRow("Compliance Status OK", yesNo(request.compliance_status_ok)),
      fieldRow("Blacklist Check OK", yesNo(request.blacklist_check_ok)),
      fieldRow("Conflict of Interest Declared", yesNo(request.conflict_of_interest_declared)),
      fieldRow("References Provided", yesNo(request.references_provided)),
      fieldRow("MSME/Udyam Number", request.msme_udyam_number || "&mdash;"),
      fieldRow("Created", formatDate(request.created_at)),
    ];

    if (request.accounts_reviewed_at) {
      rows.push(fieldRow("Accounts Reviewed At", formatDate(request.accounts_reviewed_at)));
    }
    if (request.partner_decided_at) {
      rows.push(fieldRow("Partner Decision At", formatDate(request.partner_decided_at)));
    }
    if (request.rejection_reason) {
      rows.push(fieldRow("Rejection Reason", request.rejection_reason));
    }

    detailFieldsEl.innerHTML = rows.join("");
  }

  function renderRejectBox(container, onConfirm) {
    container.innerHTML += `
      <div class="reason-box" id="reject-box" style="display: none;">
        <label for="reject-reason">Rejection Reason (required)</label>
        <textarea id="reject-reason"></textarea>
        <div class="error-text" id="reject-reason-error"></div>
        <button type="button" class="btn-danger" id="confirm-reject-button">Confirm Reject</button>
        <button type="button" class="btn-secondary" id="cancel-reject-button">Cancel</button>
      </div>
    `;

    document.getElementById("cancel-reject-button").addEventListener("click", () => {
      document.getElementById("reject-box").style.display = "none";
    });

    document.getElementById("confirm-reject-button").addEventListener("click", async () => {
      const reason = document.getElementById("reject-reason").value.trim();
      if (!reason) {
        document.getElementById("reject-reason-error").textContent = "Rejection reason is required.";
        return;
      }
      await onConfirm(reason);
    });
  }

  function showRejectBox() {
    document.getElementById("reject-box").style.display = "block";
  }

  async function renderAccountsReviewActions(request) {
    actionCard.style.display = "block";
    actionArea.innerHTML = `
      <button type="button" class="btn-primary" id="advance-button">Advance to Partner Approval</button>
      <button type="button" class="btn-danger" id="reject-button">Reject</button>
    `;
    renderRejectBox(actionArea, async (reason) => {
      await runAction(() => submitAccountsReview(requestId, "reject", reason), "Request rejected.");
    });

    document.getElementById("advance-button").addEventListener("click", async () => {
      await runAction(
        () => submitAccountsReview(requestId, "advance", null),
        "Request advanced to Pending Partner Approval."
      );
    });
    document.getElementById("reject-button").addEventListener("click", showRejectBox);
  }

  async function renderPartnerDecisionActions(request) {
    actionCard.style.display = "block";
    actionArea.innerHTML = `
      <button type="button" class="btn-primary" id="approve-button">Approve</button>
      <button type="button" class="btn-danger" id="reject-button">Reject</button>
    `;
    renderRejectBox(actionArea, async (reason) => {
      await runAction(() => submitPartnerDecision(requestId, "reject", reason), "Request rejected.");
    });

    document.getElementById("approve-button").addEventListener("click", async () => {
      await runAction(() => submitPartnerDecision(requestId, "approve", null), "Request approved.");
    });
    document.getElementById("reject-button").addEventListener("click", showRejectBox);
  }

  async function runAction(actionFn, successMessage) {
    bannerError.style.display = "none";
    try {
      await actionFn();
      showSuccess(successMessage);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      showError(friendlyMessage(err));
    }
  }

  function vendorCreationFormHtml() {
    return `
      <label for="vendor_category">Vendor Category</label>
      <select id="vendor_category">
        <option value="Professional">Professional</option>
        <option value="Service">Service</option>
        <option value="Goods Supplier">Goods Supplier</option>
        <option value="Recurring">Recurring</option>
      </select>

      <div class="checkbox-row">
        <input type="checkbox" id="msme_status" />
        <label for="msme_status">Vendor is MSME registered</label>
      </div>
      <label for="udyam_number">Udyam Number</label>
      <input type="text" id="udyam_number" disabled />

      <label for="bank_account_no">Bank Account No.</label>
      <input type="text" id="bank_account_no" />

      <label for="ifsc_code">IFSC Code</label>
      <input type="text" id="ifsc_code" placeholder="HDFC0001234" maxlength="11" />
      <div class="hint">Bank name and branch are auto-populated from this code.</div>

      <label for="cancelled_cheque_doc_url">Cancelled Cheque Document</label>
      <input type="file" id="cancelled_cheque_doc_url" accept=".pdf,.jpg,.jpeg,.png" />
      <div class="hint">This phase stores only a stub reference to the file name — no real file storage yet.</div>

      <label for="address">Address</label>
      <textarea id="address"></textarea>

      <label for="vendor_email">Email</label>
      <input type="email" id="vendor_email" />

      <label for="mobile_number">Mobile Number</label>
      <input type="text" id="mobile_number" maxlength="10" />

      <div class="error-text" id="vendor-create-error"></div>
      <button type="button" class="btn-primary" id="create-vendor-button">Create Vendor Code</button>
    `;
  }

  function attachVendorCreationHandler() {
    document.getElementById("msme_status").addEventListener("change", (event) => {
      document.getElementById("udyam_number").disabled = !event.target.checked;
    });

    document.getElementById("create-vendor-button").addEventListener("click", async () => {
      const errorEl = document.getElementById("vendor-create-error");
      errorEl.textContent = "";

      const chequeFiles = document.getElementById("cancelled_cheque_doc_url").files;
      if (chequeFiles.length === 0) {
        errorEl.textContent = "Please choose a cancelled cheque file.";
        return;
      }

      const payload = {
        vendor_category: document.getElementById("vendor_category").value,
        msme_status: document.getElementById("msme_status").checked,
        udyam_number: document.getElementById("msme_status").checked
          ? document.getElementById("udyam_number").value.trim() || null
          : null,
        bank_account_no: document.getElementById("bank_account_no").value,
        ifsc_code: document.getElementById("ifsc_code").value.trim().toUpperCase(),
        // Stub only (per backend Section 3.2): no real file storage this phase,
        // just a reference string built from the chosen file's name.
        cancelled_cheque_doc_url: `/uploads/cancelled-cheques/${chequeFiles[0].name}`,
        address: document.getElementById("address").value,
        email: document.getElementById("vendor_email").value,
        mobile_number: document.getElementById("mobile_number").value.trim(),
      };

      try {
        const vendor = await apiFetch(`/api/v1/vendors/from-request/${requestId}`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        renderVendorCreated(vendor);
      } catch (err) {
        if (err.status === 422) {
          const fieldErrors = fieldErrorsFromDetail(err.data);
          const messages = Object.values(fieldErrors);
          errorEl.textContent = messages.length ? messages.join("; ") : friendlyMessage(err);
        } else {
          errorEl.textContent = friendlyMessage(err);
        }
      }
    });
  }

  function renderVendorCreated(vendor) {
    vendorCard.style.display = "block";
    vendorArea.innerHTML = `
      <div class="vendor-code-display">${vendor.vendor_code}</div>
      ${fieldRow("Vendor Name", vendor.vendor_name)}
      ${fieldRow("Bank", `${vendor.bank_name} &mdash; ${vendor.bank_branch}`)}
      ${fieldRow("TDS Section", vendor.tds_section)}
    `;
    renderItemCodeLinking(vendor.id);
  }

  async function renderItemCodeLinking(vendorId) {
    itemCodeCard.style.display = "block";
    itemCodeArea.innerHTML = "Loading item codes&hellip;";

    let itemCodes;
    try {
      itemCodes = await apiFetch("/api/v1/item-codes");
    } catch (err) {
      itemCodeArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
      return;
    }

    if (itemCodes.length === 0) {
      itemCodeArea.innerHTML = `<p>No item codes exist yet. Create one on the <a href="/static/pages/item-codes.html">Item Codes</a> page first.</p>`;
      return;
    }

    itemCodeArea.innerHTML =
      itemCodes
        .map(
          (item) => `
            <div class="checkbox-row">
              <input type="checkbox" class="item-code-checkbox" value="${item.id}" id="item-${item.id}" />
              <label for="item-${item.id}">${item.category} / ${item.sub_category} &mdash; ${item.description}</label>
            </div>
          `
        )
        .join("") +
      `<div class="error-text" id="link-error"></div>
       <button type="button" class="btn-primary" id="link-item-codes-button">Link Selected</button>`;

    document.getElementById("link-item-codes-button").addEventListener("click", async () => {
      const linkErrorEl = document.getElementById("link-error");
      linkErrorEl.textContent = "";

      const selectedIds = Array.from(document.querySelectorAll(".item-code-checkbox:checked")).map(
        (el) => el.value
      );
      if (selectedIds.length === 0) {
        linkErrorEl.textContent = "Select at least one item code to link.";
        return;
      }

      try {
        await apiFetch(`/api/v1/vendors/${vendorId}/item-codes`, {
          method: "POST",
          body: JSON.stringify({ item_code_ids: selectedIds }),
        });
        showSuccess("Item code(s) linked to vendor.");
      } catch (err) {
        linkErrorEl.textContent = friendlyMessage(err);
      }
    });
  }

  async function renderVendorCreationActions() {
    actionCard.style.display = "block";
    actionArea.innerHTML = vendorCreationFormHtml();
    attachVendorCreationHandler();
  }

  async function findExistingVendor() {
    const vendors = await apiFetch("/api/v1/vendors");
    return vendors.find((v) => v.source_request_id === requestId) || null;
  }

  async function init() {
    if (!requestId) {
      showError("No request id given.");
      return;
    }

    let user;
    try {
      user = await getCurrentUser();
      renderAppShell(user, "request-detail.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    let request;
    try {
      request = await apiFetch(`/api/v1/vendor-requests/${requestId}`);
    } catch (err) {
      detailFieldsEl.innerHTML = "";
      showError(err.status === 404 ? "Vendor request not found." : friendlyMessage(err));
      return;
    }

    renderFields(request);

    if (ACCOUNTS_ROLES.includes(user.role) && ACCOUNTS_REVIEWABLE_STATUSES.includes(request.status)) {
      await renderAccountsReviewActions(request);
    } else if (PARTNER_ROLES.includes(user.role) && request.status === "Pending_Partner_Approval") {
      await renderPartnerDecisionActions(request);
    } else if (ACCOUNTS_ROLES.includes(user.role) && request.status === "Approved") {
      const existingVendor = await findExistingVendor();
      if (existingVendor) {
        renderVendorCreated(existingVendor);
      } else {
        await renderVendorCreationActions();
      }
    }
  }

  init();
})();
