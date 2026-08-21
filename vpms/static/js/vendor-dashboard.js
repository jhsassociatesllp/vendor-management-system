(async function () {
  const bannerError = document.getElementById("banner-error");

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

  renderAppShell(user, "vendor-dashboard.html");
  document.getElementById("greeting").textContent = `Welcome, ${user.name}`;

  try {
    const [status, documents, notifications] = await Promise.all([
      apiFetch("/api/v1/vendor-portal/profile/status"),
      apiFetch("/api/v1/vendor-portal/kyc-documents"),
      apiFetch("/api/v1/notifications"),
    ]);

    renderProgressRing(status);
    renderChecklist(status, documents);
    renderNotificationsPreview(notifications);
  } catch (err) {
    bannerError.textContent = friendlyMessage(err);
    bannerError.style.display = "block";
  }

  function renderProgressRing(status) {
    const total = status.mandatory_documents.length;
    const verified = status.verified_documents.length;
    const percent = total === 0 ? 100 : Math.round((verified / total) * 100);

    document.getElementById("progress-ring-holder").innerHTML = buildProgressRingSvg(percent, { size: 120 });
    document.getElementById("progress-caption").textContent = status.complete
      ? "Your profile is complete — all mandatory documents are verified."
      : `${verified} of ${total} mandatory documents verified.`;
  }

  function renderChecklist(status, documents) {
    const latestByType = {};
    for (const doc of documents) {
      const existing = latestByType[doc.document_type];
      if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
        latestByType[doc.document_type] = doc;
      }
    }

    const body = document.getElementById("checklist-body");
    if (status.mandatory_documents.length === 0) {
      body.innerHTML = `<tr><td colspan="3">No mandatory documents apply to your vendor profile.</td></tr>`;
      return;
    }

    body.innerHTML = status.mandatory_documents
      .map((docType) => {
        const doc = latestByType[docType];
        const label = docType.replace(/_/g, " ");
        const badge = doc ? badgePillHtml(doc.status) : `<span class="badge badge-neutral">Not Uploaded</span>`;
        const action = doc && doc.status !== "Rejected"
          ? ""
          : `<a href="/static/pages/vendor-kyc-upload.html">${doc ? "Re-upload" : "Upload"}</a>`;
        const rejection = doc && doc.status === "Rejected" && doc.rejection_reason
          ? `<div class="error-text">${doc.rejection_reason}</div>`
          : "";
        return `<tr><td>${label}${rejection}</td><td>${badge}</td><td>${action}</td></tr>`;
      })
      .join("");
  }

  function renderNotificationsPreview(notifications) {
    const holder = document.getElementById("notifications-preview");
    if (notifications.length === 0) {
      holder.innerHTML = "<p>No notifications yet.</p>";
      return;
    }

    holder.innerHTML = notifications
      .slice(0, 5)
      .map(
        (n) => `
          <div class="notification-row${n.read_at ? " is-read" : ""}">
            <div class="notification-row__dot"></div>
            <div>
              <div class="notification-row__message">${n.message}</div>
              <div class="notification-row__time">${formatDate(n.created_at)}</div>
            </div>
          </div>
        `
      )
      .join("");
  }
})();
