(async function () {
  const bannerError = document.getElementById("banner-error");
  const body = document.getElementById("po-body");
  const statusFilter = document.getElementById("status-filter");
  const newPoLink = document.getElementById("new-po-link");

  const CREATOR_ROLES = ["Dept. Manager", "Accounts Executive", "System Admin"];

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

  renderAppShell(user, "po-list.html");

  if (CREATOR_ROLES.includes(user.role)) {
    newPoLink.style.display = "inline-block";
  }

  const params = new URLSearchParams(window.location.search);
  const initialStatus = params.get("status");
  if (initialStatus) {
    statusFilter.value = initialStatus;
  }

  let vendorNameById = {};
  let itemLabelById = {};
  let budgetHeadLabelById = {};
  let allPos = [];

  function render() {
    const filterValue = statusFilter.value;
    const rows = filterValue ? allPos.filter((po) => po.status === filterValue) : allPos;

    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="6">No purchase orders match this filter.</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(
        (po) => `
          <tr class="clickable-row" data-id="${po.id}">
            <td>${po.po_number}</td>
            <td>${vendorNameById[po.vendor_id] || po.vendor_id}</td>
            <td>${itemLabelById[po.item_code_id] || po.item_code_id}</td>
            <td>${po.total_po_value_incl_gst}</td>
            <td>${badgePillHtml(po.status)}</td>
            <td>${budgetHeadLabelById[po.budget_head_id] || po.budget_head_id}</td>
          </tr>
        `
      )
      .join("");

    body.querySelectorAll("tr.clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href = `/static/pages/po-detail.html?id=${row.dataset.id}`;
      });
    });
  }

  try {
    const [pos, vendors, itemCodes, budgetHeads] = await Promise.all([
      apiFetch("/api/v1/purchase-orders"),
      apiFetch("/api/v1/vendors"),
      apiFetch("/api/v1/item-codes"),
      apiFetch("/api/v1/budget-heads"),
    ]);

    allPos = pos;
    vendorNameById = Object.fromEntries(vendors.map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]));
    itemLabelById = Object.fromEntries(itemCodes.map((i) => [i.id, `${i.category} / ${i.sub_category}`]));
    budgetHeadLabelById = Object.fromEntries(
      budgetHeads.map((b) => [b.id, `${b.department} (${b.period_label})`])
    );

    render();
    statusFilter.addEventListener("change", render);
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }
})();
