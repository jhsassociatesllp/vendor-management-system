import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, getToken } from '@/lib/api-client'

export interface BudgetHead {
  id: string
  department: string
  cost_centre: string
  period_type: string
  period_label: string
  sanctioned_amount: string
  created_at: string
}

export interface BudgetAvailability {
  budget_head_id: string
  sanctioned_amount: string
  committed_amount: string
  available_amount: string
}

export interface Agreement {
  id: string
  agreement_number: string
  vendor_id: string
  scope_of_work: string
  billing_frequency: string
  gst_rate: string
  status: string
  covered_item_code_ids: string[]
}

export interface PurchaseOrder {
  id: string
  po_number: string
  version: number
  vendor_id: string
  item_code_id: string
  agreement_id: string
  description: string
  quantity: string
  unit: string
  rate: string
  rate_override_reason: string | null
  po_value_excl_gst: string
  gst_amount: string
  total_po_value_incl_gst: string
  budget_head_id: string
  delivery_completion_date: string
  po_validity_date: string
  po_date: string
  status: string
  vendor_acknowledged_at: string | null
  over_budget_justification: string | null
  rejection_reason: string | null
  created_at: string
}

export interface POAmendment {
  id: string
  po_id: string
  previous_quantity: string
  previous_rate: string
  previous_delivery_date: string
  new_quantity: string
  new_rate: string
  new_delivery_date: string
  reason: string
  status: string
  requested_by: string
  approved_by: string | null
  created_at: string
}

export interface GrnScnEntry {
  id: string
  po_id: string
  type: 'GRN' | 'SCN'
  quantity_confirmed: string
  description: string
  created_by: string
  created_at: string
}

export interface PurchaseOrderBalance {
  po_id: string
  total_po_value_incl_gst: string
  invoiced_amount: string
  remaining_value: string
  po_quantity: string
  grn_confirmed_quantity: string
  invoiced_quantity: string
  remaining_quantity: string
}

export interface Invoice {
  id: string
  invoice_number: string
  vendor_id: string
  po_id: string | null
  agreement_id: string
  item_code_id: string
  invoice_date: string
  quantity: string
  rate: string
  taxable_amount: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_gst_amount: string
  total_invoice_amount: string
  period_service_from: string
  period_service_to: string
  billing_milestone_id: string | null
  work_description: string
  rate_variance_flag: boolean
  gst_mismatch_delta: string
  msme_alert_triggered: boolean
  status: string
  payment_due_date: string | null
  created_at: string
}

export interface InvoiceDocument {
  id: string
  invoice_id: string
  document_type: string
  is_mandatory: boolean
  file_url: string
  uploaded_at: string
}

// ---------- Budget heads ----------

export function useBudgetHeads() {
  return useQuery({ queryKey: ['budget-heads'], queryFn: () => apiFetch<BudgetHead[]>('/api/v1/budget-heads') })
}

export function useBudgetAvailability(budgetHeadId: string | undefined) {
  return useQuery({
    queryKey: ['budget-heads', budgetHeadId, 'availability'],
    queryFn: () => apiFetch<BudgetAvailability>(`/api/v1/budget-heads/${budgetHeadId}/availability`),
    enabled: !!budgetHeadId,
  })
}

export function useCreateBudgetHead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: {
      department: string
      cost_centre: string
      period_type: string
      period_label: string
      sanctioned_amount: string
    }) => apiFetch<BudgetHead>('/api/v1/budget-heads', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget-heads'] }),
  })
}

// ---------- Agreements ----------

export function useAgreements() {
  return useQuery({ queryKey: ['agreements'], queryFn: () => apiFetch<Agreement[]>('/api/v1/agreements') })
}

export function useAgreement(id: string | undefined) {
  return useQuery({
    queryKey: ['agreements', id],
    queryFn: () => apiFetch<Agreement>(`/api/v1/agreements/${id}`),
    enabled: !!id,
  })
}

export function useAgreementRateCards(agreementId: string | undefined) {
  return useQuery({
    queryKey: ['agreements', agreementId, 'rate-cards'],
    queryFn: () => apiFetch<{ item_code_id: string; rate: string | null; is_active: boolean }[]>(`/api/v1/agreements/${agreementId}/rate-cards`),
    enabled: !!agreementId,
  })
}

export function useAgreementMilestones(agreementId: string | undefined) {
  return useQuery({
    queryKey: ['agreements', agreementId, 'milestones'],
    queryFn: () =>
      apiFetch<{ id: string; description: string }[]>(`/api/v1/agreements/${agreementId}/milestones`),
    enabled: !!agreementId,
  })
}

// ---------- Purchase orders ----------

export function usePurchaseOrders() {
  return useQuery({ queryKey: ['purchase-orders'], queryFn: () => apiFetch<PurchaseOrder[]>('/api/v1/purchase-orders') })
}

export function usePurchaseOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', id],
    queryFn: () => apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${id}`),
    enabled: !!id,
  })
}

export interface PurchaseOrderCreatePayload {
  vendor_id: string
  item_code_id: string
  agreement_id: string
  description: string
  quantity: string
  rate: string | null
  rate_override_reason: string | null
  budget_head_id: string
  delivery_completion_date: string
  po_validity_date: string
  over_budget_justification: string | null
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PurchaseOrderCreatePayload) =>
      apiFetch<PurchaseOrder>('/api/v1/purchase-orders', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

function invalidatePoAndBudget(queryClient: ReturnType<typeof useQueryClient>, poId: string) {
  queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
  queryClient.invalidateQueries({ queryKey: ['purchase-orders', poId] })
  queryClient.invalidateQueries({ queryKey: ['budget-heads'] })
}

export function useApprovePurchaseOrder(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${poId}/approve`, { method: 'POST' }),
    onSuccess: () => invalidatePoAndBudget(queryClient, poId),
  })
}

export function useRejectPurchaseOrder(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) =>
      apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${poId}/reject`, { method: 'POST', body: { rejection_reason: reason } }),
    onSuccess: () => invalidatePoAndBudget(queryClient, poId),
  })
}

export function useCancelPurchaseOrder(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${poId}/cancel`, { method: 'POST' }),
    onSuccess: () => invalidatePoAndBudget(queryClient, poId),
  })
}

export function useVendorAcknowledgePO(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<PurchaseOrder>(`/api/v1/purchase-orders/${poId}/vendor-acknowledge`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }),
  })
}

export function useProposeAmendment(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { new_quantity: string; new_rate: string; new_delivery_date: string; reason: string }) =>
      apiFetch<POAmendment>(`/api/v1/purchase-orders/${poId}/amend`, { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders', poId, 'amendments'] }),
  })
}

export function usePoAmendments(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', poId, 'amendments'],
    queryFn: () => apiFetch<POAmendment[]>(`/api/v1/purchase-orders/${poId}/amendments`),
    enabled: !!poId,
  })
}

export function useApproveAmendment(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (amendmentId: string) => apiFetch<POAmendment>(`/api/v1/po-amendments/${amendmentId}/approve`, { method: 'POST' }),
    onSuccess: () => {
      invalidatePoAndBudget(queryClient, poId)
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', poId, 'amendments'] })
    },
  })
}

export function useRejectAmendment(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (amendmentId: string) => apiFetch<POAmendment>(`/api/v1/po-amendments/${amendmentId}/reject`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders', poId, 'amendments'] }),
  })
}

export function usePoGrnEntries(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', poId, 'grn'],
    queryFn: () => apiFetch<GrnScnEntry[]>(`/api/v1/purchase-orders/${poId}/grn`),
    enabled: !!poId,
  })
}

export function useRecordGrn(poId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { type: 'GRN' | 'SCN'; quantity_confirmed: string; description: string }) =>
      apiFetch<GrnScnEntry>(`/api/v1/purchase-orders/${poId}/grn`, { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-orders', poId, 'grn'] }),
  })
}

export function usePoBalance(poId: string | undefined) {
  return useQuery({
    queryKey: ['purchase-orders', poId, 'balance'],
    queryFn: () => apiFetch<PurchaseOrderBalance>(`/api/v1/purchase-orders/${poId}/balance`),
    enabled: !!poId,
  })
}

// ---------- Invoices ----------

export function useInvoices() {
  return useQuery({ queryKey: ['invoices'], queryFn: () => apiFetch<Invoice[]>('/api/v1/invoices') })
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: () => apiFetch<Invoice>(`/api/v1/invoices/${id}`),
    enabled: !!id,
  })
}

export interface InvoiceCreatePayload {
  invoice_number: string
  po_id: string | null
  agreement_id: string
  item_code_id: string
  invoice_date: string
  quantity: string
  rate: string
  cgst_amount: string
  sgst_amount: string
  igst_amount: string
  total_invoice_amount: string
  period_service_from: string
  period_service_to: string
  billing_milestone_id: string | null
  work_description: string
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: InvoiceCreatePayload) => apiFetch<Invoice>('/api/v1/invoices', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useInvoiceDocuments(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', invoiceId, 'documents'],
    queryFn: () => apiFetch<InvoiceDocument[]>(`/api/v1/invoices/${invoiceId}/documents`),
    enabled: !!invoiceId,
  })
}

export function useUploadInvoiceDocument(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ documentType, file }: { documentType: string; file: File }) => {
      const formData = new FormData()
      formData.append('document_type', documentType)
      formData.append('file', file)

      const token = getToken()
      const response = await fetch(`/api/v1/invoices/${invoiceId}/documents`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = (data && typeof data.detail === 'string' && data.detail) || 'Upload failed.'
        throw new Error(message)
      }
      return response.json() as Promise<InvoiceDocument>
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'documents'] }),
  })
}

export function useSubmitInvoice(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<Invoice>(`/api/v1/invoices/${invoiceId}/submit`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}

export function useRouteInvoiceForApproval(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<Invoice>(`/api/v1/invoices/${invoiceId}/route-for-approval`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  })
}
