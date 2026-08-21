// Accounts Executive's accounts-review action, per Phase 1 backend Section 6.
async function submitAccountsReview(requestId, action, rejectionReason) {
  const payload = { action };
  if (action === "reject") {
    payload.rejection_reason = rejectionReason;
  }
  return apiFetch(`/api/v1/vendor-requests/${requestId}/accounts-review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
