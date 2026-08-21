import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiFetch, getToken } from '@/lib/api-client'

export interface ProfileStatus {
  vendor_id: string
  complete: boolean
  mandatory_documents: string[]
  verified_documents: string[]
  missing_or_unverified: string[]
}

export interface KycDocument {
  id: string
  vendor_id: string
  document_type: string
  file_url: string
  status: string
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  uploaded_at: string
}

export interface BankChangeRequest {
  id: string
  vendor_id: string
  new_account_no: string
  new_ifsc_code: string
  status: string
  requested_by: string
  first_approved_by?: string | null
  created_at: string
}

export function useProfileStatus() {
  return useQuery({
    queryKey: ['vendor-portal', 'profile-status'],
    queryFn: () => apiFetch<ProfileStatus>('/api/v1/vendor-portal/profile/status'),
  })
}

export function useOwnKycDocuments() {
  return useQuery({
    queryKey: ['vendor-portal', 'kyc-documents'],
    queryFn: () => apiFetch<KycDocument[]>('/api/v1/vendor-portal/kyc-documents'),
  })
}

export function useUploadKycDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ vendorId, documentType, file }: { vendorId: string; documentType: string; file: File }) => {
      const formData = new FormData()
      formData.append('vendor_id', vendorId)
      formData.append('document_type', documentType)
      formData.append('file', file)

      const token = getToken()
      const response = await fetch('/api/v1/vendor-portal/kyc-documents', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = (data && typeof data.detail === 'string' && data.detail) || 'Upload failed.'
        throw new Error(message)
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-portal'] })
    },
  })
}

export function useOwnBankChangeRequests() {
  return useQuery({
    queryKey: ['vendor-portal', 'bank-change-requests'],
    queryFn: () => apiFetch<BankChangeRequest[]>('/api/v1/vendor-portal/bank-change-requests'),
  })
}

export function useCreateBankChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { new_account_no: string; new_ifsc_code: string }) =>
      apiFetch<BankChangeRequest>('/api/v1/vendor-portal/bank-change-requests', { method: 'POST', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vendor-portal', 'bank-change-requests'] }),
  })
}

export function usePendingKycDocuments() {
  return useQuery({
    queryKey: ['kyc-documents', 'pending'],
    queryFn: () => apiFetch<KycDocument[]>('/api/v1/kyc-documents/pending'),
  })
}

export function useReviewKycDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'verify' | 'reject'; reason: string | null }) =>
      apiFetch(`/api/v1/kyc-documents/${id}/review`, {
        method: 'POST',
        body: { decision, rejection_reason: reason },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kyc-documents'] }),
  })
}

export function useAllBankChangeRequests() {
  return useQuery({
    queryKey: ['bank-change-requests'],
    queryFn: () => apiFetch<BankChangeRequest[]>('/api/v1/bank-change-requests'),
  })
}

export function useApproveBankChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<BankChangeRequest>(`/api/v1/bank-change-requests/${id}/approve`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-change-requests'] }),
  })
}

export function useRejectBankChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiFetch(`/api/v1/bank-change-requests/${id}/reject`, { method: 'POST', body: { rejection_reason: reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bank-change-requests'] }),
  })
}
