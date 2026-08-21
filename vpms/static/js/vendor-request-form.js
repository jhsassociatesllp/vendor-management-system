(async function () {
  try {
    const user = await getCurrentUser();
    renderAppShell(user, "vendor-request-form.html");
  } catch (err) {
    if (err.status !== 401) throw err;
    return;
  }

  const form = document.getElementById("request-form");
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const isMsmeCheckbox = document.getElementById("is_msme");
  const udyamInput = document.getElementById("msme_udyam_number");

  const FIELD_IDS = [
    "business_need",
    "category",
    "estimated_annual_spend",
    "recommended_vendor_name",
    "recommended_pan",
    "recommended_gstin",
    "msme_udyam_number",
  ];

  isMsmeCheckbox.addEventListener("change", () => {
    udyamInput.disabled = !isMsmeCheckbox.checked;
    if (!isMsmeCheckbox.checked) {
      udyamInput.value = "";
    }
  });

  function clearErrors() {
    bannerError.style.display = "none";
    bannerError.textContent = "";
    for (const field of FIELD_IDS) {
      const el = document.getElementById(`err-${field}`);
      if (el) el.textContent = "";
    }
  }

  function showFieldError(field, message) {
    const el = document.getElementById(`err-${field}`);
    if (el) {
      el.textContent = message;
    } else {
      bannerError.textContent = message;
      bannerError.style.display = "block";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    bannerSuccess.style.display = "none";

    const payload = {
      business_need: document.getElementById("business_need").value,
      category: document.getElementById("category").value,
      estimated_annual_spend: document.getElementById("estimated_annual_spend").value,
      recommended_vendor_name: document.getElementById("recommended_vendor_name").value,
      recommended_pan: document.getElementById("recommended_pan").value.trim().toUpperCase(),
      recommended_gstin: document.getElementById("recommended_gstin").value.trim().toUpperCase() || null,
      financial_stability_ok: document.getElementById("financial_stability_ok").checked,
      technical_capability_ok: document.getElementById("technical_capability_ok").checked,
      compliance_status_ok: document.getElementById("compliance_status_ok").checked,
      blacklist_check_ok: document.getElementById("blacklist_check_ok").checked,
      conflict_of_interest_declared: document.getElementById("conflict_of_interest_declared").checked,
      references_provided: document.getElementById("references_provided").checked,
      msme_udyam_number: isMsmeCheckbox.checked ? udyamInput.value.trim() || null : null,
    };

    try {
      await apiFetch("/api/v1/vendor-requests", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      bannerSuccess.textContent = "Vendor request submitted. Redirecting to your requests…";
      bannerSuccess.style.display = "block";
      setTimeout(() => {
        window.location.href = "/static/pages/vendor-requests-list.html";
      }, 1200);
    } catch (err) {
      if (err.status === 403) {
        bannerError.textContent = friendlyMessage(err);
        bannerError.style.display = "block";
      } else if (err.status === 422) {
        const fieldErrors = fieldErrorsFromDetail(err.data);
        if (Object.keys(fieldErrors).length > 0) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            showFieldError(field, message);
          }
        } else {
          bannerError.textContent = friendlyMessage(err);
          bannerError.style.display = "block";
        }
      } else if (err.status === 400 || err.status === 409) {
        // Section 5.2 duplicate-PAN/GSTIN check: surface right next to the PAN field.
        showFieldError("recommended_pan", err.message);
      } else {
        bannerError.textContent = friendlyMessage(err);
        bannerError.style.display = "block";
      }
    }
  });
})();
