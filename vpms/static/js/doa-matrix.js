(async function () {
  // Free-text role fields let a typo silently break the approval routing (a misspelled
  // role never matches any real user's role, so that level's approval would never route
  // to anyone) — these are the actual seeded roles capable of acting on an invoice
  // approval stage, kept as a fixed list rather than a free text field.
  const ROLE_OPTIONS = [
    "Accounts Executive",
    "Dept. Manager",
    "Partner / VP",
    "Finance Team",
    "Budget Controller",
    "System Admin",
  ];

  function roleOptionsHtml(selected, allowBlank) {
    const blank = allowBlank ? `<option value="">&mdash; None &mdash;</option>` : "";
    return (
      blank +
      ROLE_OPTIONS.map((role) => `<option value="${role}" ${role === selected ? "selected" : ""}>${role}</option>`).join("")
    );
  }

  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const body = document.getElementById("matrix-body");
  const createCard = document.getElementById("create-card");
  const createForm = document.getElementById("create-form");
  const createError = document.getElementById("create-error");

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

  renderAppShell(user, "doa-matrix.html");

  if (user.role !== "System Admin") {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    body.innerHTML = `<tr><td colspan="10">Not available for your role.</td></tr>`;
    return;
  }

  createCard.style.display = "block";
  document.getElementById("new_l1_role").innerHTML = roleOptionsHtml("Accounts Executive", false);
  document.getElementById("new_l2_role").innerHTML = roleOptionsHtml(null, true);
  document.getElementById("new_l3_role").innerHTML = roleOptionsHtml(null, true);
  document.getElementById("new_l4_role").innerHTML = roleOptionsHtml("Finance Team", false);

  function rowHtml(row) {
    return `
      <tr data-id="${row.id}">
        <td><input type="number" step="0.01" min="0" class="f-min" value="${row.min_amount}" /></td>
        <td><input type="number" step="0.01" min="0" class="f-max" value="${row.max_amount === null ? "" : row.max_amount}" /></td>
        <td><input type="checkbox" class="f-l2" ${row.requires_l2 ? "checked" : ""} /></td>
        <td><input type="checkbox" class="f-l3" ${row.requires_l3 ? "checked" : ""} /></td>
        <td><select class="f-l1-role">${roleOptionsHtml(row.l1_role, false)}</select></td>
        <td><select class="f-l2-role">${roleOptionsHtml(row.l2_role, true)}</select></td>
        <td><select class="f-l3-role">${roleOptionsHtml(row.l3_role, true)}</select></td>
        <td><select class="f-l4-role">${roleOptionsHtml(row.l4_role, false)}</select></td>
        <td style="white-space: nowrap;">
          <input type="number" min="1" class="f-l1-tat" style="width: 48px; display: inline-block;" value="${row.l1_tat_days}" />
          / <input type="number" min="1" class="f-l2-tat" style="width: 48px; display: inline-block;" value="${row.l2_tat_days}" />
          / <input type="number" min="1" class="f-l3-tat" style="width: 48px; display: inline-block;" value="${row.l3_tat_days}" />
          / <input type="number" min="1" class="f-l4-tat" style="width: 48px; display: inline-block;" value="${row.l4_tat_days}" />
        </td>
        <td>
          <button type="button" class="btn-primary save-button">Save</button>
          <div class="error-text row-error"></div>
        </td>
      </tr>
    `;
  }

  function readRowPayload(tr) {
    return {
      min_amount: tr.querySelector(".f-min").value,
      max_amount: tr.querySelector(".f-max").value || null,
      requires_l2: tr.querySelector(".f-l2").checked,
      requires_l3: tr.querySelector(".f-l3").checked,
      l1_role: tr.querySelector(".f-l1-role").value.trim(),
      l2_role: tr.querySelector(".f-l2-role").value.trim() || null,
      l3_role: tr.querySelector(".f-l3-role").value.trim() || null,
      l4_role: tr.querySelector(".f-l4-role").value.trim(),
      l1_tat_days: tr.querySelector(".f-l1-tat").value,
      l2_tat_days: tr.querySelector(".f-l2-tat").value,
      l3_tat_days: tr.querySelector(".f-l3-tat").value,
      l4_tat_days: tr.querySelector(".f-l4-tat").value,
    };
  }

  async function load() {
    bannerError.style.display = "none";
    try {
      const rows = await apiFetch("/api/v1/doa-matrix");
      if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="10">No slabs configured yet.</td></tr>`;
        return;
      }
      body.innerHTML = rows.map(rowHtml).join("");

      body.querySelectorAll(".save-button").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const tr = btn.closest("tr");
          const errorEl = tr.querySelector(".row-error");
          errorEl.textContent = "";
          bannerSuccess.style.display = "none";
          try {
            await apiFetch(`/api/v1/doa-matrix/${tr.dataset.id}`, {
              method: "PATCH",
              body: JSON.stringify(readRowPayload(tr)),
            });
            bannerSuccess.textContent = "Slab updated.";
            bannerSuccess.style.display = "block";
          } catch (err) {
            errorEl.textContent = friendlyMessage(err);
          }
        });
      });
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    createError.textContent = "";
    bannerSuccess.style.display = "none";

    const payload = {
      min_amount: document.getElementById("new_min_amount").value,
      max_amount: document.getElementById("new_max_amount").value || null,
      requires_l2: document.getElementById("new_requires_l2").checked,
      requires_l3: document.getElementById("new_requires_l3").checked,
      l1_role: document.getElementById("new_l1_role").value.trim(),
      l2_role: document.getElementById("new_l2_role").value.trim() || null,
      l3_role: document.getElementById("new_l3_role").value.trim() || null,
      l4_role: document.getElementById("new_l4_role").value.trim(),
      l1_tat_days: 1,
      l2_tat_days: 2,
      l3_tat_days: 2,
      l4_tat_days: 1,
    };

    try {
      await apiFetch("/api/v1/doa-matrix", { method: "POST", body: JSON.stringify(payload) });
      createForm.reset();
      document.getElementById("new_l1_role").value = "Accounts Executive";
      document.getElementById("new_l4_role").value = "Finance Team";
      bannerSuccess.textContent = "Slab added.";
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      createError.textContent = friendlyMessage(err);
    }
  });

  await load();
})();
