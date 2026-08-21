import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch } from '@/lib/api-client'

export interface VendorRequest {
  id: string
  requested_by: string
  business_need: string
  category: string
  estimated_annual_spend: string
  recommended_vendor_name: string
  recommended_pan: string
  recommended_gstin: string | null
  financial_stability_ok: boolean
  technical_capability_ok: boolean
  compliance_status_ok: boolean
  blacklist_check_ok: boolean
  conflict_of_interest_declared: boolean
  references_provided: boolean
  msme_udyam_number: string | null
  status: string
  rejection_reason: string | null
  accounts_reviewed_by: string | null
  accounts_reviewed_at: string | null
  partner_decided_by: string | null
  partner_decided_at: string | null
  created_at: string
}

export interface VendorRequestCreatePayload {
  business_need: string
  category: string
  estimated_annual_spend: string
  recommended_vendor_name: string
  recommended_pan: string
  recommended_gstin: string | null
  financial_stability_ok: boolean
  technical_capability_ok: boolean
  compliance_status_ok: boolean
  blacklist_check_ok: boolean
  conflict_of_interest_declared: boolean
  references_provided: boolean
  msme_udyam_number: string | null
}

export interface Vendor {
  id: string
  vendor_code: string
  vendor_name: string
  vendor_category: string
  msme_status: boolean
  bank_name: string
  bank_branch: string
  tds_section: string
  source_request_id: string | null
  [key: string]: unknown
}

export interface ItemCode {
  id: string
  category: string
  sub_category: string
  description: string
  unit: string
  default_rate: string
  is_active: boolean
}

export function useVendorRequests() {
  return useQuery({
    queryKey: ['vendor-requests'],
    queryFn: () => apiFetch<VendorRequest[]>('/api/v1/vendor-requests'),
  })
}

export function useVendorRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['vendor-requests', id],
    queryFn: () => apiFetch<VendorRequest>(`/api/v1/vendor-requests/${id}`),
    enabled: !!id,
  })
}

export function useCreateVendorRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorRequestCreatePayload) =>
      apiFetch<VendorRequest>('/api/v1/vendor-requests', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-requests'] }),
  })
}

export function useAccountsReview(requestId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { action: 'advance' | 'reject'; rejection_reason?: string | null }) =>
      apiFetch<VendorRequest>(`/api/v1/vendor-requests/${requestId}/accounts-review`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-requests'] })
    },
  })
}

export function usePartnerDecision(requestId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { action: 'approve' | 'reject'; rejection_reason?: string | null }) =>
      apiFetch<VendorRequest>(`/api/v1/vendor-requests/${requestId}/partner-decision`, {
        method: 'POST',
        body: payload,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-requests'] })
    },
  })
}

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: () => apiFetch<Vendor[]>('/api/v1/vendors'),
  })
}

export interface VendorFromRequestPayload {
  vendor_category: string
  msme_status: boolean
  udyam_number: string | null
  bank_account_no: string
  ifsc_code: string
  cancelled_cheque_doc_url: string
  address: string
  email: string
  mobile_number: string
}

export function useCreateVendorFromRequest(requestId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: VendorFromRequestPayload) =>
      apiFetch<Vendor>(`/api/v1/vendors/from-request/${requestId}`, { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendors'] }),
  })
}

export function useLinkItemCodes(vendorId: string) {
  return useMutation({
    mutationFn: (itemCodeIds: string[]) =>
      apiFetch(`/api/v1/vendors/${vendorId}/item-codes`, {
        method: 'POST',
        body: { item_code_ids: itemCodeIds },
      }),
  })
}

export function useItemCodes() {
  return useQuery({
    queryKey: ['item-codes'],
    queryFn: () => apiFetch<ItemCode[]>('/api/v1/item-codes'),
  })
}

export interface ItemCodeCreatePayload {
  category: string
  sub_category: string
  description: string
  unit: string
  default_rate: string
}

export function useCreateItemCode() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ItemCodeCreatePayload) =>
      apiFetch<ItemCode>('/api/v1/item-codes', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['item-codes'] }),
  })
}
