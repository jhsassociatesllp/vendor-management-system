(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const body = document.getElementById("requests-body");

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

  if (!["Accounts Executive", "System Admin"].includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    body.innerHTML = `<tr><td colspan="4">Not available for your role.</td></tr>`;
    return;
  }

  renderAppShell(user, "bank-change-review.html");

  let vendorNameById = {};

  async function loadVendorNames() {
    const vendors = await apiFetch("/api/v1/vendors");
    vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));
  }

  async function load() {
    bannerError.style.display = "none";
    try {
      const requests = await apiFetch("/api/v1/bank-change-requests");
      render(requests);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function actionCellHtml(request) {
    const isPendingFirst = request.status === "Pending_First_Approval";
    const isPendingSecond = request.status === "Pending_Second_Approval";

    if (!isPendingFirst && !isPendingSecond) {
      return "&mdash;";
    }

    if (isPendingSecond && request.first_approved_by === user.id) {
      return `<div class="hint">You already approved this &mdash; a different approver is required.</div>`;
    }

    return `
      <button type="button" class="btn-primary" data-action="approve" data-id="${request.id}">Approve</button>
      <button type="button" class="btn-danger" data-action="show-reject" data-id="${request.id}">Reject</button>
      <div class="reject-box" id="reject-box-${request.id}" style="display: none; margin-top: 8px;">
        <label for="reason-${request.id}">Rejection Reason (required)</label>
        <textarea id="reason-${request.id}"></textarea>
        <div class="error-text" id="reason-error-${request.id}"></div>
        <button type="button" class="btn-danger" data-action="confirm-reject" data-id="${request.id}">Confirm Reject</button>
      </div>
    `;
  }

  function render(requests) {
    if (requests.length === 0) {
      body.innerHTML = `<tr><td colspan="4">No bank change requests.</td></tr>`;
      return;
    }

    body.innerHTML = requests
      .map((r) => {
        const vendorLabel = vendorNameById[r.vendor_id] || r.vendor_id;
        return `
          <tr>
            <td>${vendorLabel}</td>
            <td>${r.new_account_no} / ${r.new_ifsc_code}</td>
            <td>${badgePillHtml(r.status)}</td>
            <td>${actionCellHtml(r)}</td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll('[data-action="approve"]').forEach((btn) => {
      btn.addEventListener("click", () => approve(btn.dataset.id));
    });
    body.querySelectorAll('[data-action="show-reject"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(`reject-box-${btn.dataset.id}`).style.display = "block";
      });
    });
    body.querySelectorAll('[data-action="confirm-reject"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const reason = document.getElementById(`reason-${btn.dataset.id}`).value.trim();
        if (!reason) {
          document.getElementById(`reason-error-${btn.dataset.id}`).textContent = "Rejection reason is required.";
          return;
        }
        reject(btn.dataset.id, reason);
      });
    });
  }

  async function approve(requestId) {
    bannerSuccess.style.display = "none";
    bannerError.style.display = "none";
    try {
      const updated = await apiFetch(`/api/v1/bank-change-requests/${requestId}/approve`, { method: "POST" });
      bannerSuccess.textContent =
        updated.status === "Approved"
          ? "Approved. Vendor bank details have been updated."
          : "Approved. Awaiting a second, different approver.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  async function reject(requestId, reason) {
    bannerSuccess.style.display = "none";
    bannerError.style.display = "none";
    try {
      await apiFetch(`/api/v1/bank-change-requests/${requestId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejection_reason: reason }),
      });
      bannerSuccess.textContent = "Request rejected.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  await loadVendorNames();
  await load();
})();
