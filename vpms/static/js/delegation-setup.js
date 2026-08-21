(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const form = document.getElementById("delegation-form");
  const formError = document.getElementById("form-error");
  const delegateSelect = document.getElementById("delegate_user_id");
  const body = document.getElementById("delegations-body");

  const APPROVER_ROLES = ["Accounts Executive", "Dept. Manager", "Partner / VP", "Finance Team", "System Admin"];

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

  renderAppShell(user, "delegation-setup.html");

  if (!APPROVER_ROLES.includes(user.role)) {
    bannerError.textContent = "You don't have permission for this action.";
    bannerError.style.display = "block";
    form.style.display = "none";
    body.innerHTML = `<tr><td colspan="5">Not available for your role.</td></tr>`;
    return;
  }

  let userNameById = {};

  async function loadUsers() {
    const users = await apiFetch("/api/v1/users");
    userNameById = Object.fromEntries(users.map((u) => [u.id, `${u.name} (${u.role})`]));
    delegateSelect.innerHTML =
      `<option value="">Select a user&hellip;</option>` +
      users
        .filter((u) => u.id !== user.id)
        .map((u) => `<option value="${u.id}">${u.name} &mdash; ${u.role}</option>`)
        .join("");
  }

  function statusLabel(delegation) {
    const today = new Date().toISOString().slice(0, 10);
    if (delegation.valid_to < today) return `<span class="badge badge-neutral">Expired</span>`;
    if (delegation.valid_from > today) return `<span class="badge badge-warning">Upcoming</span>`;
    return `<span class="badge badge-success">Active</span>`;
  }

  async function loadDelegations() {
    body.innerHTML = "Loading&hellip;";
    try {
      const delegations = await apiFetch("/api/v1/approval-delegations");
      if (delegations.length === 0) {
        body.innerHTML = `<tr><td colspan="5">No delegations yet.</td></tr>`;
        return;
      }
      body.innerHTML = delegations
        .map((d) => {
          const isDelegator = d.delegator_user_id === user.id;
          const otherUserId = isDelegator ? d.delegate_user_id : d.delegator_user_id;
          const direction = isDelegator ? "To" : "From";
          return `
            <tr>
              <td>${direction}</td>
              <td>${userNameById[otherUserId] || otherUserId}</td>
              <td>${d.valid_from}</td>
              <td>${d.valid_to}</td>
              <td>${statusLabel(d)}</td>
            </tr>
          `;
        })
        .join("");
    } catch (err) {
      body.innerHTML = `<tr><td colspan="5"><div class="error-text">${friendlyMessage(err)}</div></td></tr>`;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";
    bannerSuccess.style.display = "none";

    const payload = {
      delegate_user_id: delegateSelect.value,
      valid_from: document.getElementById("valid_from").value,
      valid_to: document.getElementById("valid_to").value,
    };

    try {
      await apiFetch("/api/v1/approval-delegations", { method: "POST", body: JSON.stringify(payload) });
      form.reset();
      bannerSuccess.textContent = "Delegation created.";
      bannerSuccess.style.display = "block";
      await loadDelegations();
    } catch (err) {
      formError.textContent = friendlyMessage(err);
    }
  });

  try {
    await loadUsers();
    await loadDelegations();
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
