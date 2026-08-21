(async function () {
  const bannerError = document.getElementById("banner-error");
  const listEl = document.getElementById("notifications-list");

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

  renderAppShell(user, "vendor-notifications.html");

  async function load() {
    try {
      const notifications = await apiFetch("/api/v1/notifications");
      render(notifications);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function render(notifications) {
    if (notifications.length === 0) {
      listEl.innerHTML = "<p>No notifications yet.</p>";
      return;
    }

    listEl.innerHTML = notifications
      .map(
        (n) => `
          <div class="notification-row${n.read_at ? " is-read" : ""}" data-id="${n.id}">
            <div class="notification-row__dot"></div>
            <div>
              <div class="notification-row__message">${n.message}</div>
              <div class="notification-row__time">${formatDate(n.created_at)}${n.read_at ? " &middot; Read" : ""}</div>
            </div>
          </div>
        `
      )
      .join("");

    listEl.querySelectorAll(".notification-row").forEach((row) => {
      row.addEventListener("click", () => markRead(row.dataset.id));
    });
  }

  async function markRead(id) {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: "POST" });
      await load();
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  await load();
})();
