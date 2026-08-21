(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const body = document.getElementById("confirm-body");

  const FINANCE_ROLES = ["Finance Team", "System Admin"];

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

  renderAppShell(user, "payment-confirm-queue.html");

  if (!FINANCE_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    body.innerHTML = `<tr><td colspan="6">Not available for your role.</td></tr>`;
    return;
  }

  let invoiceById = {};
  let userNameById = {};

  function actionCellHtml(payment) {
    if (payment.initiated_by === user.id) {
      return `<div class="hint">You recorded this payment &mdash; a different Finance user must confirm or reject it.</div>`;
    }
    return `
      <button type="button" class="btn-primary" data-action="confirm" data-id="${payment.id}">Confirm</button>
      <button type="button" class="btn-danger" data-action="show-reject" data-id="${payment.id}">Reject</button>
      <div class="reason-box" id="reject-box-${payment.id}" style="display: none; margin-top: 8px;">
        <label for="reject-reason-${payment.id}">Rejection Reason (required)</label>
        <textarea id="reject-reason-${payment.id}"></textarea>
        <div class="error-text" id="reject-error-${payment.id}"></div>
        <button type="button" class="btn-danger" data-action="confirm-reject" data-id="${payment.id}">Confirm Reject</button>
      </div>
    `;
  }

  async function load() {
    bannerError.style.display = "none";
    try {
      const [payments, invoices, users] = await Promise.all([
        apiFetch("/api/v1/payments/pending-confirmation"),
        apiFetch("/api/v1/invoices"),
        apiFetch("/api/v1/users"),
      ]);
      invoiceById = Object.fromEntries(invoices.map((inv) => [inv.id, inv]));
      userNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));
      render(payments);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function render(payments) {
    if (payments.length === 0) {
      body.innerHTML = `<tr><td colspan="6">Nothing awaiting confirmation.</td></tr>`;
      return;
    }

    body.innerHTML = payments
      .map((p) => {
        const invoice = invoiceById[p.invoice_id];
        return `
          <tr>
            <td>${invoice ? invoice.invoice_number : p.invoice_id}</td>
            <td>${p.net_payable_amount}</td>
            <td>${p.payment_mode}</td>
            <td>${p.utr_reference}</td>
            <td>${userNameById[p.initiated_by] || p.initiated_by}</td>
            <td>${actionCellHtml(p)}</td>
          </tr>
        `;
      })
      .join("");

    body.querySelectorAll('[data-action="confirm"]').forEach((btn) => {
      btn.addEventListener("click", () => confirm(btn.dataset.id));
    });
    body.querySelectorAll('[data-action="show-reject"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById(`reject-box-${btn.dataset.id}`).style.display = "block";
      });
    });
    body.querySelectorAll('[data-action="confirm-reject"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        const reason = document.getElementById(`reject-reason-${btn.dataset.id}`).value.trim();
        if (!reason) {
          document.getElementById(`reject-error-${btn.dataset.id}`).textContent = "A reason is required.";
          return;
        }
        reject(btn.dataset.id, reason);
      });
    });
  }

  async function confirm(paymentId) {
    bannerSuccess.style.display = "none";
    bannerError.style.display = "none";
    try {
      await apiFetch(`/api/v1/payments/${paymentId}/confirm`, { method: "POST" });
      bannerSuccess.textContent = "Payment confirmed — invoice marked Paid.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  async function reject(paymentId, reason) {
    bannerSuccess.style.display = "none";
    bannerError.style.display = "none";
    try {
      await apiFetch(`/api/v1/payments/${paymentId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      bannerSuccess.textContent = "Payment rejected. The maker must record a fresh payment.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  await load();
})();
