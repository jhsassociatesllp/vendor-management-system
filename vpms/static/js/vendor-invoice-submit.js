(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const nextButton = document.getElementById("next-button");
  const backButton = document.getElementById("back-button");

  const MANDATORY_DOC_TYPES = ["Invoice_PDF", "GRN_SCN_Ack", "Work_Completion_Proof"];
  const OPTIONAL_DOC_TYPES = ["Timesheet", "Measurement_Sheet", "PO_Copy"];
  const STEP_COUNT = 5;

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

  renderAppShell(user, "vendor-invoice-submit.html");

  const state = {
    currentStep: 1,
    vendorId: null,
    billingMode: "po",
    allPos: [],
    allAgreements: [],
    allItemCodes: [],
    selectedPo: null,
    selectedAgreement: null,
    selectedItemCodeId: null,
    invoiceId: null,
    uploadedDocs: {},
  };

  try {
    const status = await apiFetch("/api/v1/vendor-portal/profile/status");
    state.vendorId = status.vendor_id;

    const [pos, agreements, itemCodes] = await Promise.all([
      apiFetch("/api/v1/purchase-orders"),
      apiFetch("/api/v1/agreements"),
      apiFetch("/api/v1/item-codes"),
    ]);
    state.allPos = pos.filter((po) => po.vendor_id === state.vendorId && po.status === "Vendor_Acknowledged");
    state.allAgreements = agreements.filter((a) => a.vendor_id === state.vendorId && a.status === "Active");
    state.allItemCodes = itemCodes;
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
    return;
  }

  await populateStep1();
  showStep(1);

  document.querySelectorAll('input[name="billing-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      state.billingMode = document.querySelector('input[name="billing-mode"]:checked').value;
      document.getElementById("po-picker").style.display = state.billingMode === "po" ? "block" : "none";
      document.getElementById("agreement-picker").style.display = state.billingMode === "agreement" ? "block" : "none";
    });
  });

  async function populateStep1() {
    const poSelect = document.getElementById("po_id");
    if (state.allPos.length === 0) {
      poSelect.innerHTML = `<option value="">No Vendor_Acknowledged POs available</option>`;
    } else {
      poSelect.innerHTML =
        `<option value="">Select a PO&hellip;</option>` +
        state.allPos.map((po) => `<option value="${po.id}">${po.po_number} &mdash; ${po.description}</option>`).join("");
    }

    poSelect.addEventListener("change", async () => {
      const poBalanceArea = document.getElementById("po-balance-area");
      poBalanceArea.innerHTML = "";
      state.selectedPo = state.allPos.find((po) => po.id === poSelect.value) || null;
      if (!state.selectedPo) return;
      try {
        const balance = await apiFetch(`/api/v1/purchase-orders/${state.selectedPo.id}/balance`);
        poBalanceArea.innerHTML = `
          <div class="field-row"><span class="field-label">Remaining Value</span><span class="field-value">₹${balance.remaining_value}</span></div>
          <div class="field-row"><span class="field-label">Remaining Quantity</span><span class="field-value">${balance.remaining_quantity} ${state.selectedPo.unit}</span></div>
        `;
      } catch (err) {
        poBalanceArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
      }
    });

    const agreementSelect = document.getElementById("agreement_id");
    if (state.allAgreements.length === 0) {
      agreementSelect.innerHTML = `<option value="">No active agreements for this vendor</option>`;
    } else {
      agreementSelect.innerHTML =
        `<option value="">Select an agreement&hellip;</option>` +
        state.allAgreements.map((a) => `<option value="${a.id}">${a.agreement_number} &mdash; ${a.scope_of_work}</option>`).join("");
    }

    agreementSelect.addEventListener("change", () => {
      state.selectedAgreement = state.allAgreements.find((a) => a.id === agreementSelect.value) || null;
      const itemSelect = document.getElementById("item_code_id");
      if (!state.selectedAgreement) {
        itemSelect.innerHTML = `<option value="">Select an agreement first&hellip;</option>`;
        itemSelect.disabled = true;
        return;
      }
      const covered = state.allItemCodes.filter((i) => state.selectedAgreement.covered_item_code_ids.includes(i.id));
      itemSelect.innerHTML =
        `<option value="">Select an item code&hellip;</option>` +
        covered.map((i) => `<option value="${i.id}">${i.category} / ${i.sub_category} &mdash; ${i.description}</option>`).join("");
      itemSelect.disabled = false;
    });

    document.getElementById("item_code_id").addEventListener("change", (e) => {
      state.selectedItemCodeId = e.target.value || null;
    });
  }

  function activeAgreementForCurrentSelection() {
    return state.billingMode === "po"
      ? state.allAgreements.find((a) => a.id === state.selectedPo?.agreement_id) || null
      : state.selectedAgreement;
  }

  function validateStep1() {
    const errorEl = document.getElementById("step1-error");
    errorEl.textContent = "";
    if (state.billingMode === "po") {
      if (!state.selectedPo) {
        errorEl.textContent = "Select a Purchase Order.";
        return false;
      }
    } else {
      if (!state.selectedAgreement) {
        errorEl.textContent = "Select an Agreement.";
        return false;
      }
      if (!state.selectedItemCodeId) {
        errorEl.textContent = "Select an item code.";
        return false;
      }
    }
    return true;
  }

  function updateAmountsPreview() {
    const quantity = Number(document.getElementById("quantity").value) || 0;
    const rate = Number(document.getElementById("rate").value) || 0;
    const cgst = Number(document.getElementById("cgst_amount").value) || 0;
    const sgst = Number(document.getElementById("sgst_amount").value) || 0;
    const igst = Number(document.getElementById("igst_amount").value) || 0;

    const taxable = quantity * rate;
    const actualGst = cgst + sgst + igst;
    const total = taxable + actualGst;

    document.getElementById("taxable-display").textContent = taxable ? taxable.toFixed(2) : "—";
    document.getElementById("total-display").textContent = total ? total.toFixed(2) : "—";

    const gstWarning = document.getElementById("gst-warning");
    let agreementForGst;
    // agreementForGst may not be resolvable yet if the agreements list hasn't loaded when
    // this runs on step 1 fields — guarded by the try below.
    try {
      agreementForGst = activeAgreementForCurrentSelection();
    } catch (e) {
      agreementForGst = null;
    }

    if (agreementForGst && taxable > 0) {
      const expectedGst = (taxable * Number(agreementForGst.gst_rate)) / 100;
      const delta = Math.abs(actualGst - expectedGst);
      if (delta > 1) {
        gstWarning.textContent = `Your GST breakup (₹${actualGst.toFixed(2)}) differs from the expected GST at this agreement's ${agreementForGst.gst_rate}% rate (₹${expectedGst.toFixed(2)}) by more than ₹1. Correct this before submitting, or the server will reject it.`;
        gstWarning.style.display = "block";
      } else {
        gstWarning.style.display = "none";
      }
    } else {
      gstWarning.style.display = "none";
    }
  }

  ["quantity", "rate", "cgst_amount", "sgst_amount", "igst_amount"].forEach((id) => {
    document.getElementById(id).addEventListener("input", updateAmountsPreview);
  });

  function validateStep2() {
    const errorEl = document.getElementById("step2-error");
    errorEl.textContent = "";
    const quantity = Number(document.getElementById("quantity").value);
    const rate = Number(document.getElementById("rate").value);
    if (!quantity || quantity <= 0) {
      errorEl.textContent = "Enter a quantity greater than 0.";
      return false;
    }
    if (!rate || rate <= 0) {
      errorEl.textContent = "Enter a rate greater than 0.";
      return false;
    }
    return true;
  }

  function populateStep3Milestones() {
    const agreement = activeAgreementForCurrentSelection();
    const picker = document.getElementById("milestone-picker");
    if (!agreement || agreement.billing_frequency !== "Milestone") {
      picker.style.display = "none";
      return;
    }
    picker.style.display = "block";
    apiFetch(`/api/v1/agreements/${agreement.id}/milestones`)
      .then((milestones) => {
        const select = document.getElementById("billing_milestone_id");
        select.innerHTML =
          `<option value="">Select a milestone&hellip;</option>` +
          milestones.map((m) => `<option value="${m.id}">${m.description}</option>`).join("");
      })
      .catch(() => {});
  }

  function validateStep3() {
    const errorEl = document.getElementById("step3-error");
    errorEl.textContent = "";
    const invoiceNumber = document.getElementById("invoice_number").value.trim();
    const invoiceDate = document.getElementById("invoice_date").value;
    const from = document.getElementById("period_service_from").value;
    const to = document.getElementById("period_service_to").value;
    const description = document.getElementById("work_description").value.trim();

    if (!invoiceNumber) {
      errorEl.textContent = "Enter your invoice number.";
      return false;
    }
    if (!invoiceDate) {
      errorEl.textContent = "Invoice date is required.";
      return false;
    }
    if (!from || !to) {
      errorEl.textContent = "Period of service (both dates) is required.";
      return false;
    }
    if (to < from) {
      errorEl.textContent = "Period of service 'to' date must be on or after 'from' date.";
      return false;
    }
    if (!description) {
      errorEl.textContent = "Work description is required.";
      return false;
    }
    const agreement = activeAgreementForCurrentSelection();
    if (agreement && agreement.billing_frequency === "Milestone" && !document.getElementById("billing_milestone_id").value) {
      errorEl.textContent = "This agreement bills by milestone — select one.";
      return false;
    }
    return true;
  }

  function buildInvoicePayload() {
    return {
      invoice_number: document.getElementById("invoice_number").value.trim(),
      po_id: state.billingMode === "po" ? state.selectedPo.id : null,
      agreement_id: state.billingMode === "po" ? state.selectedPo.agreement_id : state.selectedAgreement.id,
      item_code_id: state.billingMode === "po" ? state.selectedPo.item_code_id : state.selectedItemCodeId,
      invoice_date: document.getElementById("invoice_date").value,
      quantity: document.getElementById("quantity").value,
      rate: document.getElementById("rate").value,
      cgst_amount: document.getElementById("cgst_amount").value || "0",
      sgst_amount: document.getElementById("sgst_amount").value || "0",
      igst_amount: document.getElementById("igst_amount").value || "0",
      total_invoice_amount: document.getElementById("total-display").textContent,
      period_service_from: document.getElementById("period_service_from").value,
      period_service_to: document.getElementById("period_service_to").value,
      billing_milestone_id: document.getElementById("billing_milestone_id").value || null,
      work_description: document.getElementById("work_description").value,
    };
  }

  async function ensureInvoiceCreated() {
    if (state.invoiceId) return true;
    const errorEl = document.getElementById("step3-error");
    try {
      const invoice = await apiFetch("/api/v1/invoices", { method: "POST", body: JSON.stringify(buildInvoicePayload()) });
      state.invoiceId = invoice.id;
      return true;
    } catch (err) {
      errorEl.textContent = friendlyMessage(err);
      return false;
    }
  }

  function renderDocumentsStep() {
    const area = document.getElementById("documents-area");
    const rows = [
      ...MANDATORY_DOC_TYPES.map((t) => ({ type: t, required: true })),
      ...OPTIONAL_DOC_TYPES.map((t) => ({ type: t, required: false })),
    ];

    area.innerHTML = rows
      .map(({ type, required }) => {
        const uploaded = state.uploadedDocs[type];
        return `
          <div class="card" style="box-shadow: none;">
            <h3>${type.replace(/_/g, " ")} ${required ? '<span class="doc-required-tag">Required</span>' : '<span class="doc-optional-tag">Optional</span>'}</h3>
            ${uploaded ? `<div class="hint">Uploaded ${formatDate(uploaded.uploaded_at)}</div>` : ""}
            <input type="file" id="file-${type}" />
            <div class="error-text" id="error-${type}"></div>
            <button type="button" class="btn-secondary doc-upload-button" data-type="${type}">${uploaded ? "Re-upload" : "Upload"}</button>
          </div>
        `;
      })
      .join("");

    area.querySelectorAll(".doc-upload-button").forEach((btn) => {
      btn.addEventListener("click", () => uploadDocument(btn.dataset.type));
    });
  }

  async function uploadDocument(docType) {
    const errorEl = document.getElementById(`error-${docType}`);
    errorEl.textContent = "";
    const fileInput = document.getElementById(`file-${docType}`);
    if (fileInput.files.length === 0) {
      errorEl.textContent = "Choose a file first.";
      return;
    }

    const formData = new FormData();
    formData.append("document_type", docType);
    formData.append("file", fileInput.files[0]);

    try {
      const token = getToken();
      const response = await fetch(`/api/v1/invoices/${state.invoiceId}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        errorEl.textContent = extractErrorMessage(data);
        return;
      }
      const document_ = await response.json();
      state.uploadedDocs[docType] = document_;
      renderDocumentsStep();
    } catch (err) {
      errorEl.textContent = "Could not reach the server. Please try again.";
    }
  }

  function renderReviewStep() {
    const agreement = activeAgreementForCurrentSelection();
    const uploadedTypes = Object.keys(state.uploadedDocs);
    const missingMandatory = MANDATORY_DOC_TYPES.filter((t) => !uploadedTypes.includes(t));

    const rows = [
      ["Invoice Number", document.getElementById("invoice_number").value],
      ["Billing basis", state.billingMode === "po" ? `PO ${state.selectedPo.po_number}` : `Agreement ${agreement.agreement_number} (no PO)`],
      ["Agreement", agreement ? agreement.agreement_number : "—"],
      ["Quantity", document.getElementById("quantity").value],
      ["Rate", document.getElementById("rate").value],
      ["Taxable Amount", document.getElementById("taxable-display").textContent],
      ["CGST / SGST / IGST", `${document.getElementById("cgst_amount").value} / ${document.getElementById("sgst_amount").value} / ${document.getElementById("igst_amount").value}`],
      ["Total Invoice Amount", document.getElementById("total-display").textContent],
      ["Invoice Date", document.getElementById("invoice_date").value],
      ["Period of Service", `${document.getElementById("period_service_from").value} — ${document.getElementById("period_service_to").value}`],
      ["Work Description", document.getElementById("work_description").value],
      ["Documents Uploaded", uploadedTypes.length ? uploadedTypes.join(", ") : "None"],
    ];

    document.getElementById("review-area").innerHTML =
      rows.map(([label, value]) => `<div class="summary-row"><span class="summary-label">${label}</span><span class="summary-value">${value}</span></div>`).join("") +
      (missingMandatory.length
        ? `<div class="banner-error" style="margin-top: var(--space-2);">Missing mandatory documents: ${missingMandatory.join(", ")}. Submission will be blocked until these are uploaded.</div>`
        : "");
  }

  function showStep(n) {
    state.currentStep = n;
    document.querySelectorAll(".form-step").forEach((section) => {
      section.classList.toggle("is-active", section.id === `step-${n}`);
    });
    document.querySelectorAll(".step-indicator__item").forEach((item) => {
      const step = Number(item.dataset.step);
      item.classList.toggle("is-active", step === n);
      item.classList.toggle("is-done", step < n);
    });
    backButton.style.display = n > 1 ? "inline-block" : "none";
    nextButton.style.display = n < STEP_COUNT ? "inline-block" : "none";

    if (n === 3) populateStep3Milestones();
    if (n === 4) renderDocumentsStep();
    if (n === 5) renderReviewStep();
  }

  backButton.addEventListener("click", () => {
    if (state.currentStep > 1) showStep(state.currentStep - 1);
  });

  nextButton.addEventListener("click", async () => {
    if (state.currentStep === 1 && !validateStep1()) return;
    if (state.currentStep === 2 && !validateStep2()) return;
    if (state.currentStep === 3) {
      if (!validateStep3()) return;
      nextButton.disabled = true;
      const created = await ensureInvoiceCreated();
      nextButton.disabled = false;
      if (!created) return;
    }
    showStep(state.currentStep + 1);
  });

  document.getElementById("final-submit-button").addEventListener("click", async () => {
    const errorEl = document.getElementById("step5-error");
    errorEl.textContent = "";
    try {
      await apiFetch(`/api/v1/invoices/${state.invoiceId}/submit`, { method: "POST" });
      bannerSuccess.textContent = "Invoice submitted successfully.";
      bannerSuccess.style.display = "block";
      setTimeout(() => {
        window.location.href = `/static/pages/invoice-detail.html?id=${state.invoiceId}`;
      }, 900);
    } catch (err) {
      errorEl.textContent = friendlyMessage(err);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
})();
