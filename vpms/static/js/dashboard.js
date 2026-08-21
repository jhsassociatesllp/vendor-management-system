(async function () {
  const contentEl = document.getElementById("dashboard-content");

  try {
    const user = await getCurrentUser();
    renderAppShell(user, "dashboard.html");

    // This is the staff dashboard (Phase 1). A portal-activated vendor always lands on
    // vendor-dashboard.html instead via the OTP login flow, so Vendor role has no real
    // actions here — per the original Phase 1 spec, show "No actions available yet"
    // rather than the vendor-portal links from NAV_BY_ROLE (which are for
    // vendor-dashboard.html's sidebar, not this page).
    const links =
      user.role === "Vendor"
        ? []
        : navLinksForRole(user.role).filter((link) => !link.href.endsWith("/dashboard.html"));
    if (links.length === 0) {
      contentEl.innerHTML = "<p>No actions available yet.</p>";
      return;
    }

    contentEl.innerHTML = `<div class="card-grid">${links
      .map((link) => `<a class="card" href="${link.href}"><h3>${link.label}</h3></a>`)
      .join("")}</div>`;
  } catch (err) {
    if (err.status !== 401) {
      contentEl.innerHTML = `<div class="banner-error">${friendlyMessage(err)}</div>`;
    }
  }
})();
