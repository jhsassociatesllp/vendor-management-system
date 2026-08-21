// Partner/VP's partner-decision action, per Phase 1 backend Section 6.
async function submitPartnerDecision(requestId, action, rejectionReason) {
  const payload = { action };
  if (action === "reject") {
    payload.rejection_reason = rejectionReason;
  }
  return apiFetch(`/api/v1/vendor-requests/${requestId}/partner-decision`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
