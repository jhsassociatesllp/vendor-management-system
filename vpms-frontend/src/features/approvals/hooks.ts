import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'

export interface InvoiceApproval {
  id: string
  invoice_id: string
  level: 'L1' | 'L2' | 'L3' | 'L4'
  assigned_role: string
  status: 'Pending' | 'Completed' | 'Rejected' | 'Returned' | 'Query_Raised' | 'Skipped'
  action_taken_by: string | null
  action_at: string | null
  comments: string | null
  tat_due_at: string
  tat_paused: boolean
  created_at: string
}

export interface InvoiceQuery {
  id: string
  invoice_id: string
  raised_at_level: string
  raised_by: string
  query_text: string
  status: 'Open' | 'Responded'
  vendor_response: string | null
  responded_at: string | null
  created_at: string
}

export interface Delegation {
  id: string
  delegator_user_id: string
  delegate_user_id: string
  valid_from: string
  valid_to: string
  created_by: string
  created_at: string
}

export interface DoaMatrixRow {
  id: string
  min_amount: string
  max_amount: string | null
  requires_l2: boolean
  requires_l3: boolean
  l1_role: string
  l2_role: string | null
  l3_role: string | null
  l4_role: string
  l1_tat_days: number
  l2_tat_days: number
  l3_tat_days: number
  l4_tat_days: number
  created_at: string
}

export interface Payment {
  id: string
  invoice_id: string
  gross_amount: string
  tds_section: string
  tds_rate: string
  tds_amount: string
  net_payable_amount: string
  payment_mode: string
  company_bank_account: string
  payment_date: string
  utr_reference: string
  itc_eligible: boolean
  status: string
  initiated_by: string
  initiated_at: string
  confirmed_by: string | null
  confirmed_at: string | null
  rejection_reason: string | null
  late_payment_interest_amount: string
  is_late: boolean
}

export interface AppUser {
  id: string
  name: string
  role: string
}

export interface MsmeAlert {
  invoice_id: string
  invoice_number: string
  vendor_id: string
  payment_due_date: string
  alert_type: 'Overdue' | 'At_Risk'
  days_until_due: number
}

// ---------- Approval queue / actions ----------

export function useMyApprovalQueue() {
  return useQuery({
    queryKey: ['invoice-approvals', 'my-queue'],
    queryFn: () => apiFetch<InvoiceApproval[]>('/api/v1/invoice-approvals/my-queue'),
  })
}

export function useEscalations() {
  return useQuery({
    queryKey: ['invoice-approvals', 'escalations'],
    queryFn: () => apiFetch<InvoiceApproval[]>('/api/v1/invoice-approvals/escalations'),
  })
}

export function useInvoiceApprovals(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', invoiceId, 'approvals'],
    queryFn: () => apiFetch<InvoiceApproval[]>(`/api/v1/invoices/${invoiceId}/approvals`),
    enabled: !!invoiceId,
  })
}

export function useInvoiceQueries(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', invoiceId, 'queries'],
    queryFn: () => apiFetch<InvoiceQuery[]>(`/api/v1/invoices/${invoiceId}/queries`),
    enabled: !!invoiceId,
  })
}

/** Used by delegation-setup, invoice-approval-detail (delegate-authorization check) and
 * payment-confirm-queue (maker name lookup) — kept here once rather than duplicated per page. */
export function useAllUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiFetch<AppUser[]>('/api/v1/users') })
}

function invalidateInvoiceWorkflow(queryClient: ReturnType<typeof useQueryClient>, invoiceId: string) {
  queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId] })
  queryClient.invalidateQueries({ queryKey: ['invoice-approvals'] })
}

export function useTakeApprovalAction(invoiceId: string, approvalId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { action: string; comments: string | null }) =>
      apiFetch<InvoiceApproval>(`/api/v1/invoice-approvals/${approvalId}/action`, { method: 'POST', body: payload }),
    onSuccess: () => invalidateInvoiceWorkflow(queryClient, invoiceId),
  })
}

export function useRaiseQuery(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (queryText: string) =>
      apiFetch<InvoiceQuery>(`/api/v1/invoices/${invoiceId}/queries`, { method: 'POST', body: { query_text: queryText } }),
    onSuccess: () => invalidateInvoiceWorkflow(queryClient, invoiceId),
  })
}

export function useRespondToQuery(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ queryId, response }: { queryId: string; response: string }) =>
      apiFetch<InvoiceQuery>(`/api/v1/invoices/${invoiceId}/queries/${queryId}/respond`, {
        method: 'POST',
        body: { vendor_response: response },
      }),
    onSuccess: () => invalidateInvoiceWorkflow(queryClient, invoiceId),
  })
}

export function useResubmitInvoice(invoiceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch(`/api/v1/invoices/${invoiceId}/resubmit`, { method: 'POST' }),
    onSuccess: () => invalidateInvoiceWorkflow(queryClient, invoiceId),
  })
}

// ---------- Delegations ----------

export function useDelegations() {
  return useQuery({ queryKey: ['approval-delegations'], queryFn: () => apiFetch<Delegation[]>('/api/v1/approval-delegations') })
}

export function useCreateDelegation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { delegate_user_id: string; valid_from: string; valid_to: string }) =>
      apiFetch<Delegation>('/api/v1/approval-delegations', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval-delegations'] }),
  })
}

// ---------- DoA matrix ----------

export function useDoaMatrix() {
  return useQuery({ queryKey: ['doa-matrix'], queryFn: () => apiFetch<DoaMatrixRow[]>('/api/v1/doa-matrix') })
}

export function useCreateDoaMatrixRow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) => apiFetch<DoaMatrixRow>('/api/v1/doa-matrix', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doa-matrix'] }),
  })
}

export function useUpdateDoaMatrixRow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      apiFetch<DoaMatrixRow>(`/api/v1/doa-matrix/${id}`, { method: 'PATCH', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doa-matrix'] }),
  })
}

// ---------- Payments ----------

export function usePaymentQueue() {
  return useQuery({
    queryKey: ['payments', 'queue'],
    queryFn: () => apiFetch<import('@/features/procurement/hooks').Invoice[]>('/api/v1/payments/queue'),
  })
}

export function usePendingConfirmation() {
  return useQuery({
    queryKey: ['payments', 'pending-confirmation'],
    queryFn: () => apiFetch<Payment[]>('/api/v1/payments/pending-confirmation'),
  })
}

export function useMsmeAlerts() {
  return useQuery({ queryKey: ['payments', 'msme-alerts'], queryFn: () => apiFetch<MsmeAlert[]>('/api/v1/payments/msme-alerts') })
}

export function useTdsDefault(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'tds-default', invoiceId],
    queryFn: () => apiFetch<{ tds_section: string; tds_rate: string }>(`/api/v1/payments/tds-default/${invoiceId}`),
    enabled: !!invoiceId,
  })
}

export interface PaymentCreatePayload {
  invoice_id: string
  tds_section: string
  tds_rate: string
  tds_override_reason: string | null
  payment_mode: string
  company_bank_account: string
  payment_date: string
  utr_reference: string
  itc_eligible: boolean
}

export function useRecordPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PaymentCreatePayload) => apiFetch<Payment>('/api/v1/payments', { method: 'POST', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useConfirmPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paymentId: string) => apiFetch<Payment>(`/api/v1/payments/${paymentId}/confirm`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useRejectPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      apiFetch<Payment>(`/api/v1/payments/${paymentId}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

export function useInvoicePayment(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', invoiceId, 'payment'],
    queryFn: () => apiFetch<Payment>(`/api/v1/invoices/${invoiceId}/payment`),
    enabled: !!invoiceId,
  })
}
