(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const createCard = document.getElementById("create-card");
  const createForm = document.getElementById("create-form");
  const formError = document.getElementById("form-error");
  const listEl = document.getElementById("budget-heads-list");

  const CREATOR_ROLES = ["Budget Controller", "System Admin"];

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

  renderAppShell(user, "budget-heads.html");

  if (CREATOR_ROLES.includes(user.role)) {
    createCard.style.display = "block";
  }

  async function load() {
    bannerError.style.display = "none";
    listEl.innerHTML = "Loading&hellip;";
    try {
      const heads = await apiFetch("/api/v1/budget-heads");
      if (heads.length === 0) {
        listEl.innerHTML = `<div class="card">No budget heads yet.</div>`;
        return;
      }

      const availabilities = await Promise.all(
        heads.map((h) => apiFetch(`/api/v1/budget-heads/${h.id}/availability`))
      );

      listEl.innerHTML = `<div class="card-grid">${heads
        .map((head, i) => {
          const availability = availabilities[i];
          return `
            <div class="card">
              <h3>${head.department} &mdash; ${head.cost_centre}</h3>
              <div class="hint">${head.period_type} &middot; ${head.period_label}</div>
              ${buildBudgetBarHtml(availability.sanctioned_amount, availability.committed_amount)}
            </div>
          `;
        })
        .join("")}</div>`;
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";
    bannerSuccess.style.display = "none";

    const payload = {
      department: document.getElementById("department").value,
      cost_centre: document.getElementById("cost_centre").value,
      period_type: document.getElementById("period_type").value,
      period_label: document.getElementById("period_label").value,
      sanctioned_amount: document.getElementById("sanctioned_amount").value,
    };

    try {
      await apiFetch("/api/v1/budget-heads", { method: "POST", body: JSON.stringify(payload) });
      createForm.reset();
      document.getElementById("period_type").value = "Annual";
      bannerSuccess.textContent = "Budget head created.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      formError.textContent = friendlyMessage(err);
    }
  });

  await load();
})();
