(function () {
  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get("id");

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const timelineArea = document.getElementById("timeline-area");
  const detailFieldsEl = document.getElementById("detail-fields");
  const queryCard = document.getElementById("query-card");
  const queryArea = document.getElementById("query-area");
  const actionCard = document.getElementById("action-card");
  const actionArea = document.getElementById("action-area");

  const LEVEL_TO_STATUS = { L1: "L1_Verification", L2: "L2_Review", L3: "L3_Approval", L4: "L4_Finance_Approval" };

  const ACTIONS_BY_LEVEL = {
    L1: [
      { action: "Verify", cls: "btn-primary", needsComments: false },
      { action: "Return_To_Vendor", cls: "btn-secondary", needsComments: true },
      { action: "Reject", cls: "btn-danger", needsComments: true },
    ],
    L2: [
      { action: "Approve", cls: "btn-primary", needsComments: false },
      { action: "Return_To_Accounts", cls: "btn-secondary", needsComments: true },
      { action: "Reject", cls: "btn-danger", needsComments: true },
    ],
    L3: [
      { action: "Approve", cls: "btn-primary", needsComments: false },
      { action: "Reject", cls: "btn-danger", needsComments: true },
    ],
    L4: [
      { action: "Approve_For_Payment", cls: "btn-primary", needsComments: false },
      { action: "Hold", cls: "btn-secondary", needsComments: false },
      { action: "Reject", cls: "btn-danger", needsComments: true },
    ],
  };

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

  function findActiveApproval(approvals, invoiceStatus) {
    if (invoiceStatus === "On_Hold") {
      return approvals.find((a) => a.level === "L4") || null;
    }
    const level = Object.keys(LEVEL_TO_STATUS).find((l) => LEVEL_TO_STATUS[l] === invoiceStatus);
    if (!level) return null;
    const approval = approvals.find((a) => a.level === level) || null;
    return approval && approval.status === "Pending" ? approval : null;
  }

  async function canActAsRole(assignedRole, currentUser, allUsers) {
    if (currentUser.role === assignedRole) return true;
    try {
      const delegations = await apiFetch("/api/v1/approval-delegations");
      const today = new Date().toISOString().slice(0, 10);
      const roleById = Object.fromEntries(allUsers.map((u) => [u.id, u.role]));
      return delegations.some(
        (d) =>
          d.delegate_user_id === currentUser.id &&
          d.valid_from <= today &&
          d.valid_to >= today &&
          roleById[d.delegator_user_id] === assignedRole
      );
    } catch (err) {
      return false;
    }
  }

  function renderActionButtons(approval, invoiceStatus, onDone) {
    actionCard.style.display = "block";

    let buttons;
    if (invoiceStatus === "On_Hold") {
      buttons = [{ action: "Release", cls: "btn-primary", needsComments: false }];
    } else {
      buttons = ACTIONS_BY_LEVEL[approval.level] || [];
    }

    actionArea.innerHTML =
      `<div class="hint">Acting as ${approval.assigned_role} on stage ${approval.level}.</div>` +
      buttons.map((b) => `<button type="button" class="${b.cls} action-button" data-action="${b.action}">${b.action.replace(/_/g, " ")}</button>`).join("") +
      `<button type="button" class="btn-secondary" id="raise-query-button">Raise Query</button>` +
      `<div class="reason-box" id="comments-box" style="display: none;">
         <label for="comments-text" id="comments-label">Comments</label>
         <textarea id="comments-text"></textarea>
         <div class="error-text" id="comments-error"></div>
         <button type="button" class="btn-primary" id="confirm-comments-button">Confirm</button>
         <button type="button" class="btn-secondary" id="cancel-comments-button">Cancel</button>
       </div>
       <div class="reason-box" id="query-box" style="display: none;">
         <label for="query-text">Query Text (required)</label>
         <textarea id="query-text"></textarea>
         <div class="error-text" id="query-error"></div>
         <button type="button" class="btn-primary" id="confirm-query-button">Submit Query</button>
         <button type="button" class="btn-secondary" id="cancel-query-button">Cancel</button>
       </div>`;

    let pendingAction = null;

    async function runAction(action, comments) {
      bannerError.style.display = "none";
      try {
        await apiFetch(`/api/v1/invoice-approvals/${approval.id}/action`, {
          method: "POST",
          body: JSON.stringify({ action, comments: comments || null }),
        });
        showSuccess(`"${action.replace(/_/g, " ")}" recorded.`);
        setTimeout(onDone, 800);
      } catch (err) {
        showError(friendlyMessage(err));
      }
    }

    actionArea.querySelectorAll(".action-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const def = buttons.find((b) => b.action === btn.dataset.action);
        if (def.needsComments) {
          pendingAction = def.action;
          document.getElementById("comments-label").textContent = `Comments (required for ${def.action.replace(/_/g, " ")})`;
          document.getElementById("comments-box").style.display = "block";
        } else {
          runAction(def.action, null);
        }
      });
    });

    document.getElementById("cancel-comments-button").addEventListener("click", () => {
      document.getElementById("comments-box").style.display = "none";
    });
    document.getElementById("confirm-comments-button").addEventListener("click", () => {
      const comments = document.getElementById("comments-text").value.trim();
      if (!comments) {
        document.getElementById("comments-error").textContent = "Comments are required for this action.";
        return;
      }
      runAction(pendingAction, comments);
    });

    document.getElementById("raise-query-button").addEventListener("click", () => {
      document.getElementById("query-box").style.display = "block";
    });
    document.getElementById("cancel-query-button").addEventListener("click", () => {
      document.getElementById("query-box").style.display = "none";
    });
    document.getElementById("confirm-query-button").addEventListener("click", async () => {
      const queryText = document.getElementById("query-text").value.trim();
      if (!queryText) {
        document.getElementById("query-error").textContent = "Query text is required.";
        return;
      }
      bannerError.style.display = "none";
      try {
        await apiFetch(`/api/v1/invoices/${invoiceId}/queries`, {
          method: "POST",
          body: JSON.stringify({ query_text: queryText }),
        });
        showSuccess("Query raised — the invoice is paused until the vendor responds.");
        setTimeout(onDone, 800);
      } catch (err) {
        showError(friendlyMessage(err));
      }
    });
  }

  async function init() {
    if (!invoiceId) {
      showError("No invoice id given.");
      return;
    }

    let user;
    try {
      user = await getCurrentUser();
      renderAppShell(user, "invoice-approval-detail.html");
    } catch (err) {
      if (err.status !== 401) showError(friendlyMessage(err));
      return;
    }

    let invoice, approvals, queries, users, vendors;
    try {
      [invoice, approvals, queries, users, vendors] = await Promise.all([
        apiFetch(`/api/v1/invoices/${invoiceId}`),
        apiFetch(`/api/v1/invoices/${invoiceId}/approvals`),
        apiFetch(`/api/v1/invoices/${invoiceId}/queries`),
        apiFetch("/api/v1/users"),
        apiFetch("/api/v1/vendors"),
      ]);
    } catch (err) {
      showError(err.status === 404 ? "Invoice not found." : friendlyMessage(err));
      return;
    }

    const userNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const vendor = vendors.find((v) => v.id === invoice.vendor_id);

    timelineArea.innerHTML = buildWorkflowTimelineHtml(approvals, invoice.status);

    detailFieldsEl.innerHTML = [
      fieldRow("Invoice Number", invoice.invoice_number),
      fieldRow("Status", badgePillHtml(invoice.status)),
      fieldRow("Vendor", vendor ? `${vendor.vendor_name} (${vendor.vendor_code})` : invoice.vendor_id),
      fieldRow("Total Invoice Amount", invoice.total_invoice_amount),
      fieldRow("Invoice Date", invoice.invoice_date),
      fieldRow("Work Description", invoice.work_description),
    ].join("");

    // Queries list is already newest-first (per invoice_query_repository.list_for_invoice).
    // Show every query, not just the currently-open one — otherwise a vendor's response
    // vanishes from view the moment it's submitted, with no record of what was said.
    if (queries.length > 0) {
      queryCard.style.display = "block";
      queryArea.innerHTML = queries
        .map((q) => {
          const rows = [
            fieldRow("Raised At Level", q.raised_at_level),
            fieldRow("Raised By", userNameById[q.raised_by] || q.raised_by),
            fieldRow("Status", badgePillHtml(q.status)),
            fieldRow("Query", q.query_text),
            fieldRow("Raised", formatDate(q.created_at)),
          ];
          if (q.status === "Responded") {
            rows.push(fieldRow("Vendor Response", q.vendor_response));
            rows.push(fieldRow("Responded", formatDate(q.responded_at)));
          }
          return `<div class="reason-box">${rows.join("")}</div>`;
        })
        .join("");
    }

    const openQuery = queries.find((q) => q.status === "Open");
    if (openQuery) {
      queryArea.innerHTML += `<div class="hint">Nothing to approve until the vendor responds.</div>`;
      return; // No action panel while a query is open — nothing to approve yet.
    }

    const activeApproval = findActiveApproval(approvals, invoice.status);
    if (!activeApproval) {
      return; // Terminal state (Rejected/Paid) or Returned_To_Vendor — nothing actionable here.
    }

    const authorized = await canActAsRole(activeApproval.assigned_role, user, users);
    if (authorized) {
      renderActionButtons(activeApproval, invoice.status, () => window.location.reload());
    } else {
      actionCard.style.display = "block";
      actionArea.innerHTML = `<div class="hint">Currently pending ${activeApproval.assigned_role} — you don't have an active role or delegation for this stage.</div>`;
    }
  }

  init();
})();
