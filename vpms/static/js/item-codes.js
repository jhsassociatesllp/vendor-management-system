(async function () {
  const bannerError = document.getElementById("banner-error");
  const bodyEl = document.getElementById("item-codes-body");
  const form = document.getElementById("item-code-form");
  const formError = document.getElementById("form-error");

  async function loadItemCodes() {
    const itemCodes = await apiFetch("/api/v1/item-codes");
    if (itemCodes.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="6">No item codes yet.</td></tr>`;
      return;
    }
    bodyEl.innerHTML = itemCodes
      .map(
        (item) => `
          <tr>
            <td>${item.category}</td>
            <td>${item.sub_category}</td>
            <td>${item.description}</td>
            <td>${item.unit}</td>
            <td>${item.default_rate}</td>
            <td>${item.is_active ? "Yes" : "No"}</td>
          </tr>
        `
      )
      .join("");
  }

  try {
    const user = await getCurrentUser();
    renderAppShell(user, "item-codes.html");

    if (!["Accounts Executive", "System Admin"].includes(user.role)) {
      bannerError.textContent = "You don't have permission for this action.";
      bannerError.style.display = "block";
      form.style.display = "none";
      bodyEl.innerHTML = `<tr><td colspan="6">Not available for your role.</td></tr>`;
      return;
    }

    await loadItemCodes();
  } catch (err) {
    if (err.status !== 401) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    formError.textContent = "";

    const payload = {
      category: document.getElementById("category").value,
      sub_category: document.getElementById("sub_category").value,
      description: document.getElementById("description").value,
      unit: document.getElementById("unit").value,
      default_rate: document.getElementById("default_rate").value,
    };

    try {
      await apiFetch("/api/v1/item-codes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      await loadItemCodes();
    } catch (err) {
      formError.textContent = friendlyMessage(err);
    }
  });
})();
