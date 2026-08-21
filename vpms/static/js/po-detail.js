(function () {
  const params = new URLSearchParams(window.location.search);
  const poId = params.get("id");

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const detailFieldsEl = document.getElementById("detail-fields");
  const budgetCard = document.getElementById("budget-card");
  const budgetArea = document.getElementById("budget-area");
  const actionCard = document.getElementById("action-card");
  const actionArea = document.getElementById("action-area");
  const amendmentsArea = document.getElementById("amendments-area");
  const grnArea = document.getElementById("grn-area");

  const BUDGET_APPROVER_ROLES = ["Budget Controller", "Partner / VP", "System Admin"];
  const CANCEL_ROLES = ["Accounts Executive", "System Admin"];
  const AMEND_ROLES = ["Dept. Manager", "Accounts Executive", "System Admin"];
  const GRN_ROLES = ["Dept. Manager", "Accounts Executive", "System Admin"];

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

  function renderReasonBox(container, idPrefix, label, onConfirm) {
    container.innerHTML += `
      <div class="reason-box" id="${idPrefix}-box" style="display: none;">
        <label for="${idPrefix}-reason">${label}</label>
        <textarea id="${idPrefix}-reason"></textarea>
        <div class="error-text" id="${idPrefix}-reason-error"></div>
        <button type="button" class="btn-danger" id="${idPrefix}-confirm-button">Confirm Reject</button>
        <button type="button" class="btn-secondary" id="${idPrefix}-cancel-button">Cancel</button>
      </div>
    `;
    document.getElementById(`${idPrefix}-cancel-button`).addEventListener("click", () => {
      document.getElementById(`${idPrefix}-box`).style.display = "none";
    });
    document.getElementById(`${idPrefix}-confirm-button`).addEventListener("click", async () => {
      const reason = document.getElementById(`${idPrefix}-reason`).value.trim();
      if (!reason) {
        document.getElementById(`${idPrefix}-reason-error`).textContent = "A reason is required.";
        return;
      }
      await onConfirm(reason);
    });
  }

  async function renderPoFields(po, vendorLabel, itemLabel, agreementLabel) {
    const rows = [
      fieldRow("PO Number", po.po_number),
      fieldRow("Version", po.version),
      fieldRow("Status", badgePillHtml(po.status)),
      fieldRow("Vendor", vendorLabel),
      fieldRow("Item Code", itemLabel),
      fieldRow("Agreement", agreementLabel),
      fieldRow("Description", po.description),
      fieldRow("Quantity", `${po.quantity} ${po.unit}`),
      fieldRow("Rate", po.rate),
      fieldRow("Taxable Amount", po.po_value_excl_gst),
      fieldRow("GST Amount", po.gst_amount),
      fieldRow("Total (incl. GST)", po.total_po_value_incl_gst),
      fieldRow("Delivery / Completion Date", po.delivery_completion_date),
      fieldRow("PO Validity Date", po.po_validity_date),
      fieldRow("PO Date", po.po_date),
    ];
    if (po.rate_override_reason) rows.push(fieldRow("Rate Override Reason", po.rate_override_reason));
    if (po.over_budget_justification) rows.push(fieldRow("Over-Budget Justification", po.over_budget_justification));
    if (po.vendor_acknowledged_at) rows.push(fieldRow("Vendor Acknowledged At", formatDate(po.vendor_acknowledged_at)));
    if (po.rejection_reason) rows.push(fieldRow("Rejection Reason", po.rejection_reason));
    detailFieldsEl.innerHTML = rows.join("");
  }

  async function renderBudget(po) {
    try {
      const [head, availability] = await Promise.all([
        apiFetch(`/api/v1/budget-heads`).then((heads) => heads.find((h) => h.id === po.budget_head_id)),
        apiFetch(`/api/v1/budget-heads/${po.budget_head_id}/availability`),
      ]);
      budgetCard.style.display = "block";
      budgetArea.innerHTML = `
        <div class="hint">${head ? `${head.department} &mdash; ${head.cost_centre} (${head.period_label})` : ""}</div>
        ${buildBudgetBarHtml(availability.sanctioned_amount, availability.committed_amount)}
      `;
    } catch (err) {
      // Non-fatal — the PO detail itself already loaded.
    }
  }

  function renderApproveRejectActions(po) {
    actionCard.style.display = "block";
    actionArea.innerHTML += `
      <button type="button" class="btn-primary" id="approve-po-button">Approve</button>
      <button type="button" class="btn-danger" id="reject-po-button">Reject</button>
    `;
    renderReasonBox(actionArea, "po-reject", "Rejection Reason (required)", async (reason) => {
      await runAction(
        () => apiFetch(`/api/v1/purchase-orders/${po.id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason: reason }) }),
        "PO rejected."
      );
    });
    document.getElementById("approve-po-button").addEventListener("click", async () => {
      await runAction(() => apiFetch(`/api/v1/purchase-orders/${po.id}/approve`, { method: "POST" }), "PO approved.");
    });
    document.getElementById("reject-po-button").addEventListener("click", () => {
      document.getElementById("po-reject-box").style.display = "block";
    });
  }

  function renderCancelAction(po) {
    actionCard.style.display = "block";
    const wrap = document.createElement("div");
    wrap.innerHTML = `<button type="button" class="btn-danger" id="cancel-po-button">Cancel PO</button>`;
    actionArea.appendChild(wrap);
    document.getElementById("cancel-po-button").addEventListener("click", async () => {
      await runAction(() => apiFetch(`/api/v1/purchase-orders/${po.id}/cancel`, { method: "POST" }), "PO cancelled — budget released.");
    });
  }

  function renderAmendAction(po) {
    actionCard.style.display = "block";
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button type="button" class="btn-secondary" id="show-amend-button">Propose Amendment</button>
      <div class="reason-box" id="amend-box" style="display: none;">
        <label for="amend-quantity">New Quantity</label>
        <input type="number" id="amend-quantity" min="0.01" step="0.01" value="${po.quantity}" />
        <label for="amend-rate">New Rate</label>
        <input type="number" id="amend-rate" min="0.01" step="0.01" value="${po.rate}" />
        <label for="amend-date">New Delivery / Completion Date</label>
        <input type="date" id="amend-date" value="${po.delivery_completion_date}" />
        <label for="amend-reason">Reason (required)</label>
        <textarea id="amend-reason"></textarea>
        <div class="error-text" id="amend-error"></div>
        <button type="button" class="btn-primary" id="submit-amend-button">Submit Amendment</button>
        <button type="button" class="btn-secondary" id="cancel-amend-button">Cancel</button>
      </div>
    `;
    actionArea.appendChild(wrap);

    document.getElementById("show-amend-button").addEventListener("click", () => {
      document.getElementById("amend-box").style.display = "block";
    });
    document.getElementById("cancel-amend-button").addEventListener("click", () => {
      document.getElementById("amend-box").style.display = "none";
    });
    document.getElementById("submit-amend-button").addEventListener("click", async () => {
      const errorEl = document.getElementById("amend-error");
      errorEl.textContent = "";
      const reason = document.getElementById("amend-reason").value.trim();
      if (!reason) {
        errorEl.textContent = "A reason is required.";
        return;
      }
      const payload = {
        new_quantity: document.getElementById("amend-quantity").value,
        new_rate: document.getElementById("amend-rate").value,
        new_delivery_date: document.getElementById("amend-date").value,
        reason,
      };
      try {
        await apiFetch(`/api/v1/purchase-orders/${po.id}/amend`, { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Amendment proposed — it requires approval before taking effect.");
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        errorEl.textContent = friendlyMessage(err);
      }
    });
  }

  function renderGrnAction(po, cumulativeConfirmed) {
    actionCard.style.display = "block";
    const remaining = (Number(po.quantity) - cumulativeConfirmed).toFixed(2);
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <button type="button" class="btn-secondary" id="show-grn-button">Record GRN / SCN</button>
      <div class="reason-box" id="grn-box" style="display: none;">
        <div class="hint">Confirmed so far: ${cumulativeConfirmed} of ${po.quantity} ${po.unit} (${remaining} remaining).</div>
        <label for="grn-type">Type</label>
        <select id="grn-type">
          <option value="GRN">GRN (goods)</option>
          <option value="SCN">SCN (service)</option>
        </select>
        <label for="grn-quantity">Quantity Confirmed</label>
        <input type="number" id="grn-quantity" min="0.01" step="0.01" />
        <label for="grn-description">Description (required)</label>
        <textarea id="grn-description"></textarea>
        <div class="error-text" id="grn-error"></div>
        <button type="button" class="btn-primary" id="submit-grn-button">Submit</button>
        <button type="button" class="btn-secondary" id="cancel-grn-button">Cancel</button>
      </div>
    `;
    actionArea.appendChild(wrap);

    document.getElementById("show-grn-button").addEventListener("click", () => {
      document.getElementById("grn-box").style.display = "block";
    });
    document.getElementById("cancel-grn-button").addEventListener("click", () => {
      document.getElementById("grn-box").style.display = "none";
    });
    document.getElementById("submit-grn-button").addEventListener("click", async () => {
      const errorEl = document.getElementById("grn-error");
      errorEl.textContent = "";
      const description = document.getElementById("grn-description").value.trim();
      if (!description) {
        errorEl.textContent = "A description is required.";
        return;
      }
      const payload = {
        type: document.getElementById("grn-type").value,
        quantity_confirmed: document.getElementById("grn-quantity").value,
        description,
      };
      try {
        await apiFetch(`/api/v1/purchase-orders/${po.id}/grn`, { method: "POST", body: JSON.stringify(payload) });
        showSuccess("GRN/SCN entry recorded.");
        setTimeout(() => window.location.reload(), 800);
      } catch (err) {
        errorEl.textContent = friendlyMessage(err);
      }
    });
  }

  function renderAmendments(amendments, userRole) {
    if (amendments.length === 0) {
      amendmentsArea.innerHTML = "<p>No amendments have been proposed for this PO.</p>";
      return;
    }
    amendmentsArea.innerHTML = amendments
      .map(
        (a) => `
          <div class="card" style="box-shadow: none;" data-amendment-id="${a.id}">
            ${badgePillHtml(a.status)}
            <div class="field-row"><span class="field-label">Quantity</span><span class="field-value">${a.previous_quantity} &rarr; ${a.new_quantity}</span></div>
            <div class="field-row"><span class="field-label">Rate</span><span class="field-value">${a.previous_rate} &rarr; ${a.new_rate}</span></div>
            <div class="field-row"><span class="field-label">Delivery Date</span><span class="field-value">${a.previous_delivery_date} &rarr; ${a.new_delivery_date}</span></div>
            <div class="field-row"><span class="field-label">Reason</span><span class="field-value">${a.reason}</span></div>
            <div class="field-row"><span class="field-label">Proposed</span><span class="field-value">${formatDate(a.created_at)}</span></div>
            ${a.status === "Pending_Approval" && BUDGET_APPROVER_ROLES.includes(userRole)
              ? `<button type="button" class="btn-primary amendment-approve-button" data-id="${a.id}">Approve Amendment</button>
                 <button type="button" class="btn-danger amendment-reject-button" data-id="${a.id}">Reject Amendment</button>`
              : ""}
          </div>
        `
      )
      .join("");

    amendmentsArea.querySelectorAll(".amendment-approve-button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await runAction(
          () => apiFetch(`/api/v1/po-amendments/${btn.dataset.id}/approve`, { method: "POST" }),
          "Amendment approved — the PO now requires fresh approval."
        );
      });
    });
    amendmentsArea.querySelectorAll(".amendment-reject-button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await runAction(
          () => apiFetch(`/api/v1/po-amendments/${btn.dataset.id}/reject`, { method: "POST" }),
          "Amendment rejected — the PO is unchanged."
        );
      });
    });
  }

  function renderGrnEntries(entries, po) {
    const total = entries.reduce((sum, e) => sum + Number(e.quantity_confirmed), 0);
    if (entries.length === 0) {
      grnArea.innerHTML = "<p>No GRN/SCN entries recorded yet.</p>";
      return;
    }
    grnArea.innerHTML = `
      <div class="hint">Cumulative confirmed: ${total.toFixed(2)} of ${po.quantity} ${po.unit}</div>
      <table>
        <thead><tr><th>Type</th><th>Quantity</th><th>Description</th><th>Recorded</th></tr></thead>
        <tbody>
          ${entries
            .map((e) => `<tr><td>${e.type}</td><td>${e.quantity_confirmed}</td><td>${e.description}</td><td>${formatDate(e.created_at)}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    `;
  }

  async function init() {
    if (!poId) {
      showError("No PO id given.");
      return;
    }

    let user;
    try {
      user = await getCurrentUser();
      renderAppShell(user, "po-detail.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    let po;
    try {
      po = await apiFetch(`/api/v1/purchase-orders/${poId}`);
    } catch (err) {
      showError(err.status === 404 ? "Purchase order not found." : friendlyMessage(err));
      return;
    }

    let vendorLabel = po.vendor_id;
    let itemLabel = po.item_code_id;
    let agreementLabel = po.agreement_id;
    try {
      const [vendor, itemCodes, agreement] = await Promise.all([
        apiFetch(`/api/v1/vendors/${po.vendor_id}`),
        apiFetch("/api/v1/item-codes"),
        apiFetch(`/api/v1/agreements/${po.agreement_id}`),
      ]);
      vendorLabel = `${vendor.vendor_name} (${vendor.vendor_code})`;
      const item = itemCodes.find((i) => i.id === po.item_code_id);
      if (item) itemLabel = `${item.category} / ${item.sub_category} &mdash; ${item.description}`;
      agreementLabel = agreement.agreement_number;
    } catch (err) {
      // Non-fatal — fall back to raw ids already set above.
    }

    await renderPoFields(po, vendorLabel, itemLabel, agreementLabel);
    await renderBudget(po);

    if (BUDGET_APPROVER_ROLES.includes(user.role) && po.status === "Pending_Approval") {
      renderApproveRejectActions(po);
    }
    if (CANCEL_ROLES.includes(user.role) && ["Pending_Approval", "Approved"].includes(po.status)) {
      renderCancelAction(po);
    }
    if (AMEND_ROLES.includes(user.role) && ["Approved", "Vendor_Acknowledged"].includes(po.status)) {
      renderAmendAction(po);
    }

    let grnEntries = [];
    try {
      grnEntries = await apiFetch(`/api/v1/purchase-orders/${poId}/grn`);
    } catch (err) {
      grnArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
    }
    renderGrnEntries(grnEntries, po);

    if (GRN_ROLES.includes(user.role) && po.status === "Vendor_Acknowledged") {
      const cumulative = grnEntries.reduce((sum, e) => sum + Number(e.quantity_confirmed), 0);
      renderGrnAction(po, cumulative);
    }

    try {
      const amendments = await apiFetch(`/api/v1/purchase-orders/${poId}/amendments`);
      renderAmendments(amendments, user.role);
    } catch (err) {
      amendmentsArea.innerHTML = `<div class="error-text">${friendlyMessage(err)}</div>`;
    }
  }

  init();
})();
