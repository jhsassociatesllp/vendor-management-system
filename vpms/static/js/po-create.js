(async function () {
  const bannerError = document.getElementById("banner-error");
  const form = document.getElementById("po-form");
  const formError = document.getElementById("form-error");
  const submitButton = document.getElementById("submit-button");

  const vendorSelect = document.getElementById("vendor_id");
  const itemSelect = document.getElementById("item_code_id");
  const agreementArea = document.getElementById("agreement-area");
  const budgetHeadSelect = document.getElementById("budget_head_id");
  const budgetBarArea = document.getElementById("budget-bar-area");
  const quantityInput = document.getElementById("quantity");
  const rateInput = document.getElementById("rate");
  const rateHint = document.getElementById("rate-hint");
  const rateOverrideArea = document.getElementById("rate-override-area");
  const rateOverrideReason = document.getElementById("rate_override_reason");
  const overBudgetCard = document.getElementById("over-budget-card");
  const overBudgetMessage = document.getElementById("over-budget-message");
  const requestExceptionCheckbox = document.getElementById("request-exception");
  const justificationArea = document.getElementById("justification-area");
  const justificationInput = document.getElementById("over_budget_justification");

  const CREATOR_ROLES = ["Dept. Manager", "Accounts Executive", "System Admin"];

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

  renderAppShell(user, "po-create.html");

  if (!CREATOR_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    form.style.display = "none";
    return;
  }

  let allAgreements = [];
  let selectedAgreement = null;
  let selectedRateCard = null;
  let cardDefaultRate = null;

  try {
    const [vendors, agreements] = await Promise.all([
      apiFetch("/api/v1/vendors"),
      apiFetch("/api/v1/agreements"),
    ]);
    allAgreements = agreements;

    vendorSelect.innerHTML =
      `<option value="">Select a vendor&hellip;</option>` +
      vendors
        .filter((v) => v.is_active)
        .map((v) => `<option value="${v.id}">${v.vendor_name} (${v.vendor_code})</option>`)
        .join("");

    const budgetHeads = await apiFetch("/api/v1/budget-heads");
    budgetHeadSelect.innerHTML =
      `<option value="">Select a budget head&hellip;</option>` +
      budgetHeads
        .map((b) => `<option value="${b.id}">${b.department} &mdash; ${b.cost_centre} (${b.period_label})</option>`)
        .join("");
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
    return;
  }

  vendorSelect.addEventListener("change", async () => {
    itemSelect.innerHTML = `<option value="">Loading&hellip;</option>`;
    itemSelect.disabled = true;
    agreementArea.innerHTML = "";
    selectedAgreement = null;
    selectedRateCard = null;
    updatePreview();

    const vendorId = vendorSelect.value;
    if (!vendorId) {
      itemSelect.innerHTML = `<option value="">Select a vendor first&hellip;</option>`;
      return;
    }

    try {
      const itemCodes = await apiFetch(`/api/v1/vendors/${vendorId}/item-codes`);
      if (itemCodes.length === 0) {
        itemSelect.innerHTML = `<option value="">No active item combinations for this vendor</option>`;
        return;
      }
      itemSelect.innerHTML =
        `<option value="">Select an item code&hellip;</option>` +
        itemCodes
          .map((i) => `<option value="${i.id}">${i.category} / ${i.sub_category} &mdash; ${i.description}</option>`)
          .join("");
      itemSelect.disabled = false;
    } catch (err) {
      itemSelect.innerHTML = `<option value="">Could not load item codes</option>`;
    }
  });

  itemSelect.addEventListener("change", async () => {
    selectedAgreement = null;
    selectedRateCard = null;
    cardDefaultRate = null;
    rateInput.value = "";
    rateInput.disabled = true;
    rateOverrideArea.style.display = "none";
    updatePreview();

    const vendorId = vendorSelect.value;
    const itemId = itemSelect.value;
    if (!vendorId || !itemId) {
      agreementArea.innerHTML = "";
      return;
    }

    const covering = allAgreements.find(
      (a) => a.vendor_id === vendorId && a.status === "Active" && a.covered_item_code_ids.includes(itemId)
    );

    if (!covering) {
      agreementArea.innerHTML = `<div class="error-text">No active agreement covers this vendor/item combination — a PO cannot be created until one exists.</div>`;
      return;
    }

    selectedAgreement = covering;
    agreementArea.innerHTML = `
      <div class="field-row"><span class="field-label">Agreement</span><span class="field-value">${covering.agreement_number} (GST ${covering.gst_rate}%)</span></div>
    `;

    try {
      const rateCards = await apiFetch(`/api/v1/agreements/${covering.id}/rate-cards`);
      const active = rateCards.find((rc) => rc.item_code_id === itemId && rc.is_active);
      if (active && active.rate !== null) {
        selectedRateCard = active;
        cardDefaultRate = active.rate;
        rateInput.value = active.rate;
        rateHint.textContent = `Pre-filled from the active rate card (₹${active.rate}). Change it to override, with a reason.`;
      } else {
        rateHint.textContent = "No active fixed rate on the rate card — enter a rate and a reason.";
      }
      rateInput.disabled = false;
    } catch (err) {
      rateHint.textContent = "Could not load the rate card — enter a rate and a reason.";
      rateInput.disabled = false;
    }
  });

  budgetHeadSelect.addEventListener("change", async () => {
    budgetBarArea.innerHTML = "";
    const id = budgetHeadSelect.value;
    if (!id) return;
    try {
      const availability = await apiFetch(`/api/v1/budget-heads/${id}/availability`);
      budgetBarArea.innerHTML = buildBudgetBarHtml(availability.sanctioned_amount, availability.committed_amount);
    } catch (err) {
      budgetBarArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
    }
  });

  function checkRateOverride() {
    if (!rateInput.value) {
      rateOverrideArea.style.display = "none";
      return;
    }
    const differs = cardDefaultRate === null || Number(rateInput.value) !== Number(cardDefaultRate);
    rateOverrideArea.style.display = differs ? "block" : "none";
  }

  function updatePreview() {
    const quantity = Number(quantityInput.value);
    const rate = Number(rateInput.value);
    const gstRate = selectedAgreement ? Number(selectedAgreement.gst_rate) : null;

    if (!quantity || !rate || gstRate === null) {
      document.getElementById("preview-taxable").textContent = "—";
      document.getElementById("preview-gst").textContent = "—";
      document.getElementById("preview-total").textContent = "—";
      return;
    }

    const taxable = quantity * rate;
    const gst = (taxable * gstRate) / 100;
    const total = taxable + gst;

    document.getElementById("preview-taxable").textContent = taxable.toFixed(2);
    document.getElementById("preview-gst").textContent = gst.toFixed(2);
    document.getElementById("preview-total").textContent = total.toFixed(2);
  }

  quantityInput.addEventListener("input", updatePreview);
  rateInput.addEventListener("input", () => {
    checkRateOverride();
    updatePreview();
  });

  requestExceptionCheckbox.addEventListener("change", () => {
    justificationArea.style.display = requestExceptionCheckbox.checked ? "block" : "none";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    if (!selectedAgreement) {
      formError.textContent = "Select a vendor and item code with an active covering agreement first.";
      return;
    }

    if (rateOverrideArea.style.display === "block" && !rateOverrideReason.value.trim()) {
      formError.textContent = "A reason is required when overriding the rate-card rate.";
      return;
    }

    if (overBudgetCard.style.display === "block" && requestExceptionCheckbox.checked && !justificationInput.value.trim()) {
      formError.textContent = "Justification is required to request an over-budget exception.";
      return;
    }

    const payload = {
      vendor_id: vendorSelect.value,
      item_code_id: itemSelect.value,
      agreement_id: selectedAgreement.id,
      description: document.getElementById("description").value,
      quantity: quantityInput.value,
      rate: rateInput.value || null,
      rate_override_reason: rateOverrideArea.style.display === "block" ? rateOverrideReason.value.trim() : null,
      budget_head_id: budgetHeadSelect.value,
      delivery_completion_date: document.getElementById("delivery_completion_date").value,
      po_validity_date: document.getElementById("po_validity_date").value,
      over_budget_justification:
        overBudgetCard.style.display === "block" && requestExceptionCheckbox.checked
          ? justificationInput.value.trim()
          : null,
    };

    try {
      const po = await apiFetch("/api/v1/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
      window.location.href = `/static/pages/po-detail.html?id=${po.id}`;
    } catch (err) {
      if (err.status === 400 && /insufficient budget/i.test(friendlyMessage(err))) {
        overBudgetCard.style.display = "block";
        overBudgetMessage.textContent = friendlyMessage(err);
        overBudgetMessage.style.display = "block";
        window.scrollTo({ top: overBudgetCard.offsetTop, behavior: "smooth" });
      } else {
        formError.textContent = friendlyMessage(err);
      }
    }
  });
})();
