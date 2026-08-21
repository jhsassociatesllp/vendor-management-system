(async function () {
  const bannerError = document.getElementById("banner-error");
  const form = document.getElementById("bank-change-form");
  const formError = document.getElementById("form-error");
  const requestsBody = document.getElementById("requests-body");

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

  renderAppShell(user, "vendor-bank-change.html");

  async function loadRequests() {
    try {
      const requests = await apiFetch("/api/v1/vendor-portal/bank-change-requests");
      if (requests.length === 0) {
        requestsBody.innerHTML = `<tr><td colspan="3">No bank change requests yet.</td></tr>`;
        return;
      }
      requestsBody.innerHTML = requests
        .map(
          (r) => `
            <tr>
              <td>${formatDate(r.created_at)}</td>
              <td>${r.new_account_no} / ${r.new_ifsc_code}</td>
              <td>${badgePillHtml(r.status)}</td>
            </tr>
          `
        )
        .join("");
    } catch (err) {
      requestsBody.innerHTML = `<tr><td colspan="3">${friendlyMessage(err)}</td></tr>`;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    const payload = {
      new_account_no: document.getElementById("new_account_no").value.trim(),
      new_ifsc_code: document.getElementById("new_ifsc_code").value.trim().toUpperCase(),
    };

    try {
      await apiFetch("/api/v1/vendor-portal/bank-change-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      await loadRequests();
    } catch (err) {
      if (err.status === 422) {
        const fieldErrors = fieldErrorsFromDetail(err.data);
        const messages = Object.values(fieldErrors);
        formError.textContent = messages.length ? messages.join("; ") : friendlyMessage(err);
      } else {
        formError.textContent = friendlyMessage(err);
      }
    }
  });

  await loadRequests();
})();
