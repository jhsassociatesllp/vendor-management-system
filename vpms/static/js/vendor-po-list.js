(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const listEl = document.getElementById("po-list");

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

  renderAppShell(user, "vendor-po-list.html");

  async function load() {
    bannerError.style.display = "none";
    listEl.innerHTML = "Loading&hellip;";
    try {
      const [status, pos] = await Promise.all([
        apiFetch("/api/v1/vendor-portal/profile/status"),
        apiFetch("/api/v1/purchase-orders"),
      ]);

      const ownPos = pos.filter((po) => po.vendor_id === status.vendor_id);
      render(ownPos);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function render(pos) {
    if (pos.length === 0) {
      listEl.innerHTML = `<div class="card">No purchase orders yet.</div>`;
      return;
    }

    listEl.innerHTML = pos
      .map((po) => {
        const canAcknowledge = po.status === "Approved";
        return `
          <div class="card">
            <h3>${po.po_number} ${badgePillHtml(po.status)}</h3>
            <div class="field-row"><span class="field-label">Description</span><span class="field-value">${po.description}</span></div>
            <div class="field-row"><span class="field-label">Quantity</span><span class="field-value">${po.quantity} ${po.unit}</span></div>
            <div class="field-row"><span class="field-label">Total (incl. GST)</span><span class="field-value">${po.total_po_value_incl_gst}</span></div>
            <div class="field-row"><span class="field-label">Delivery / Completion Date</span><span class="field-value">${po.delivery_completion_date}</span></div>
            ${canAcknowledge
              ? `
                <button type="button" class="btn-primary ack-button" data-id="${po.id}">Acknowledge</button>
                <div class="reason-box" id="ack-box-${po.id}" style="display: none;">
                  <p>You're confirming you'll fulfill this PO as specified &mdash; quantity, rate, and delivery
                  date. This cannot be undone from here.</p>
                  <button type="button" class="btn-primary confirm-ack-button" data-id="${po.id}">Confirm Acknowledgement</button>
                  <button type="button" class="btn-secondary cancel-ack-button" data-id="${po.id}">Cancel</button>
                </div>
              `
              : ""}
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".ack-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(`ack-box-${btn.dataset.id}`).style.display = "block";
      });
    });
    listEl.querySelectorAll(".cancel-ack-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(`ack-box-${btn.dataset.id}`).style.display = "none";
      });
    });
    listEl.querySelectorAll(".confirm-ack-button").forEach((btn) => {
      btn.addEventListener("click", async () => {
        bannerError.style.display = "none";
        try {
          await apiFetch(`/api/v1/purchase-orders/${btn.dataset.id}/vendor-acknowledge`, { method: "POST" });
          bannerSuccess.textContent = "Purchase order acknowledged.";
          bannerSuccess.style.display = "block";
          await load();
        } catch (err) {
          bannerError.textContent = friendlyMessage(err);
          bannerError.style.display = "block";
        }
      });
    });
  }

  await load();
})();
