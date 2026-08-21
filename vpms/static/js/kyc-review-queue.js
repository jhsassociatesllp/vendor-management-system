(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const body = document.getElementById("queue-body");

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

  renderAppShell(user, "kyc-review-queue.html");

  let vendorNameById = {};

  async function loadVendorNames() {
    const vendors = await apiFetch("/api/v1/vendors");
    vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));
  }

  async function load() {
    bannerError.style.display = "none";
    try {
      const [documents] = await Promise.all([apiFetch("/api/v1/kyc-documents/pending")]);
      render(documents);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function render(documents) {
    if (documents.length === 0) {
      body.innerHTML = `<tr><td colspan="4">No documents awaiting review.</td></tr>`;
      return;
    }

    body.innerHTML = documents
      .map((doc) => {
        const vendorLabel = vendorNameById[doc.vendor_id] || doc.vendor_id;
        return `
          <tr class="clickable-row" data-id="${doc.id}">
            <td>${vendorLabel}</td>
            <td>${doc.document_type.replace(/_/g, " ")}</td>
            <td>${formatDate(doc.uploaded_at)}</td>
            <td>${badgePillHtml(doc.status)}</td>
          </tr>
          <tr class="review-detail-row" data-detail-for="${doc.id}" style="display: none;">
            <td colspan="4">
              <div class="card" style="box-shadow: none; margin: 0;">
                <button type="button" class="btn-secondary" data-action="view-file" data-id="${doc.id}">View Document</button>
                <div class="error-text" id="file-error-${doc.id}"></div>
                <button type="button" class="btn-primary" data-action="verify" data-id="${doc.id}">Verify</button>
                <button type="button" class="btn-danger" data-action="show-reject" data-id="${doc.id}">Reject</button>
                <div class="reject-box" id="reject-box-${doc.id}" style="display: none; margin-top: 12px;">
                  <label for="reason-${doc.id}">Rejection Reason (required)</label>
                  <textarea id="reason-${doc.id}"></textarea>
                  <div class="error-text" id="reason-error-${doc.id}"></div>
                  <button type="button" class="btn-danger" data-action="confirm-reject" data-id="${doc.id}">Confirm Reject</button>
                </div>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        const detailRow = body.querySelector(`tr[data-detail-for="${row.dataset.id}"]`);
        const isOpen = detailRow.style.display !== "none";
        body.querySelectorAll(".review-detail-row").forEach((r) => (r.style.display = "none"));
        detailRow.style.display = isOpen ? "none" : "table-row";
      });
    });

    body.querySelectorAll('[data-action="view-file"]').forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const errorEl = document.getElementById(`file-error-${btn.dataset.id}`);
        errorEl.textContent = "";
        try {
          await openAuthenticatedFile(`/api/v1/kyc-documents/${btn.dataset.id}/file`);
        } catch (err) {
          errorEl.textContent = "Could not open the file.";
        }
      });
    });

    body.querySelectorAll('[data-action="verify"]').forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        review(btn.dataset.id, "verify", null);
      });
    });

    body.querySelectorAll('[data-action="show-reject"]').forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        document.getElementById(`reject-box-${btn.dataset.id}`).style.display = "block";
      });
    });

    body.querySelectorAll('[data-action="confirm-reject"]').forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const reason = document.getElementById(`reason-${btn.dataset.id}`).value.trim();
        if (!reason) {
          document.getElementById(`reason-error-${btn.dataset.id}`).textContent = "Rejection reason is required.";
          return;
        }
        review(btn.dataset.id, "reject", reason);
      });
    });
  }

  async function review(documentId, decision, rejectionReason) {
    bannerSuccess.style.display = "none";
    bannerError.style.display = "none";
    try {
      await apiFetch(`/api/v1/kyc-documents/${documentId}/review`, {
        method: "POST",
        body: JSON.stringify({ decision, rejection_reason: rejectionReason }),
      });
      bannerSuccess.textContent = `Document ${decision === "verify" ? "verified" : "rejected"}.`;
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
