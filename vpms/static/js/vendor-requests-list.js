(async function () {
  const bodyEl = document.getElementById("requests-body");
  const bannerError = document.getElementById("banner-error");
  const titleEl = document.getElementById("page-title");

  try {
    const user = await getCurrentUser();
    renderAppShell(user, "vendor-requests-list.html");

    if (user.role === "Dept. Manager") {
      titleEl.textContent = "My Vendor Requests";
    } else if (user.role === "Partner / VP") {
      titleEl.textContent = "Requests Pending Approval";
    } else if (user.role === "Accounts Executive") {
      titleEl.textContent = "Requests Pending Review";
    }

    const requests = await apiFetch("/api/v1/vendor-requests");

    if (requests.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="4">No vendor requests to show.</td></tr>`;
      return;
    }

    bodyEl.innerHTML = requests
      .map(
        (req) => `
          <tr class="clickable-row" data-id="${req.id}">
            <td>${req.recommended_vendor_name}</td>
            <td>${req.category}</td>
            <td>${badgePillHtml(req.status)}</td>
            <td>${formatDate(req.created_at)}</td>
          </tr>
        `
      )
      .join("");

    bodyEl.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/request-detail.html?id=${row.dataset.id}`;
      });
    });
  } catch (err) {
    if (err.status !== 401) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
      bodyEl.innerHTML = `<tr><td colspan="4">Could not load requests.</td></tr>`;
    }
  }
})();
