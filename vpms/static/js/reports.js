function renderReportGrid() {
  const grid = document.getElementById("report-grid");
  grid.innerHTML = Object.entries(REPORT_DEFINITIONS)
    .map(
      ([slug, def]) => `
      <a class="card" href="/static/pages/report-viewer.html?type=${slug}">
        <h3>${def.label}</h3>
        <p>${def.description}</p>
        <span class="report-card__frequency">${def.frequency}</span>
      </a>
    `
    )
    .join("");
}

async function init() {
  try {
    const user = await getCurrentUser();
    renderAppShell(user, "reports.html");
    renderReportGrid();
  } catch (err) {
    const banner = document.getElementById("banner-error");
    banner.textContent = friendlyMessage(err);
    banner.style.display = "block";
  }
}

init();
