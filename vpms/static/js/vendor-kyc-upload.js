(async function () {
  const bannerError = document.getElementById("banner-error");
  const bannerSuccess = document.getElementById("banner-success");
  const listEl = document.getElementById("documents-list");

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

  if (user.role !== "Vendor") {
    bannerError.textContent = "This page is only available to vendor-portal accounts.";
    bannerError.style.display = "block";
    return;
  }

  renderAppShell(user, "vendor-kyc-upload.html");

  let vendorId = null;

  async function load() {
    bannerError.style.display = "none";
    try {
      const [status, documents] = await Promise.all([
        apiFetch("/api/v1/vendor-portal/profile/status"),
        apiFetch("/api/v1/vendor-portal/kyc-documents"),
      ]);

      vendorId = status.vendor_id;
      renderSections(status, documents);
    } catch (err) {
      bannerError.textContent = friendlyMessage(err);
      bannerError.style.display = "block";
    }
  }

  function renderSections(status, documents) {
    const latestByType = {};
    for (const doc of documents) {
      const existing = latestByType[doc.document_type];
      if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
        latestByType[doc.document_type] = doc;
      }
    }

    if (status.mandatory_documents.length === 0) {
      listEl.innerHTML = `<div class="card">No mandatory documents apply to your vendor profile.</div>`;
      return;
    }

    listEl.innerHTML = status.mandatory_documents
      .map((docType) => {
        const doc = latestByType[docType];
        const label = docType.replace(/_/g, " ");
        const badge = doc ? badgePillHtml(doc.status) : `<span class="badge badge-neutral">Not Uploaded</span>`;
        const rejection = doc && doc.status === "Rejected" && doc.rejection_reason
          ? `<div class="error-text">Rejected: ${doc.rejection_reason}</div>`
          : "";
        const buttonLabel = doc ? "Re-upload" : "Upload";

        return `
          <div class="card">
            <h3>${label} ${badge}</h3>
            ${rejection}
            <input type="file" id="file-${docType}" />
            <div class="error-text" id="error-${docType}"></div>
            <button type="button" class="btn-primary" data-doc-type="${docType}">${buttonLabel}</button>
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll("button[data-doc-type]").forEach((button) => {
      button.addEventListener("click", () => handleUpload(button.dataset.docType));
    });
  }

  async function handleUpload(docType) {
    const errorEl = document.getElementById(`error-${docType}`);
    errorEl.textContent = "";
    bannerSuccess.style.display = "none";

    const fileInput = document.getElementById(`file-${docType}`);
    if (fileInput.files.length === 0) {
      errorEl.textContent = "Choose a file first.";
      return;
    }

    const formData = new FormData();
    formData.append("vendor_id", vendorId);
    formData.append("document_type", docType);
    formData.append("file", fileInput.files[0]);

    try {
      const token = getToken();
      const response = await fetch("/api/v1/vendor-portal/kyc-documents", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        errorEl.textContent = extractErrorMessage(data);
        return;
      }

      bannerSuccess.textContent = `${docType.replace(/_/g, " ")} uploaded and is now pending review.`;
      bannerSuccess.style.display = "block";
      await load();
    } catch (err) {
      errorEl.textContent = "Could not reach the server. Please try again.";
    }
  }

  await load();
})();
