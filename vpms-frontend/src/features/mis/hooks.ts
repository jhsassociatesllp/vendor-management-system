import { useMutation, useQuery } from '@tanstack/react-query'

import { apiFetch, apiFetchBlob } from '@/lib/api-client'

export interface DashboardFilters {
  vendor_id?: string
  department?: string
  category?: string
  date_from?: string
  date_to?: string
  [key: string]: string | undefined
}

export interface DashboardSummary {
  total_payables: number
  overdue_invoice_count: number
  msme_risk_count: number
  budget_utilization_pct: number
}

export interface DashboardAgingRow {
  bucket: string
  count: number
  amount: number
}

export interface SpendByCategoryRow {
  category: string
  current_period_amount: number
  previous_period_amount: number
}

export interface FieldChange {
  field: string
  old_value: string | null
  new_value: string | null
}

export interface AuditLog {
  id: string
  sequence: number
  timestamp: string
  user_id: string | null
  user_name_snapshot: string | null
  role_snapshot: string | null
  ip_address: string | null
  action: string
  module: string
  record_reference: string
  field_changes: FieldChange[] | null
  session_id: string | null
  previous_hash: string
  record_hash: string
}

export interface AuditLogFilters {
  user_id?: string
  module?: string
  action?: string
  record_reference?: string
  date_from?: string
  date_to?: string
  [key: string]: string | undefined
}

export interface IntegrityCheckBreak {
  id: string
  sequence: number
  expected_hash: string
  stored_hash: string
}

export interface IntegrityCheckResult {
  rows_checked: number
  clean: boolean
  breaks: IntegrityCheckBreak[]
}

/** Backend spec lists "11 standard reports" but its own endpoint table has 12 — built
 * (and listed here) all 12 to match the actual endpoints, same reasoning as the old
 * static site's REPORT_DEFINITIONS. Drives both ReportsPage's grid and
 * ReportViewerPage's generic filter panel — no fixed column list per report; the
 * viewer reads whatever fields the response actually contains. */
export const REPORT_DEFINITIONS: Record<string, { label: string; description: string; frequency: string; filters: string[] }> = {
  'vendor-master': {
    label: 'Vendor Master',
    description: 'Vendor code, name, category, MSME status, KYC status, TDS section.',
    frequency: 'As needed',
    filters: ['vendor_id'],
  },
  'vendor-compliance-status': {
    label: 'Vendor Compliance Status',
    description: 'GSTIN/PAN status, bank verification, document expiry.',
    frequency: 'Monthly',
    filters: ['vendor_id'],
  },
  'invoice-tracker': {
    label: 'Invoice Tracker',
    description: 'Full lifecycle timestamps per invoice.',
    frequency: 'Daily',
    filters: ['vendor_id', 'date_from', 'date_to'],
  },
  'pending-invoices': {
    label: 'Pending Invoices',
    description: 'Invoice, vendor, amount, current stage, days pending.',
    frequency: 'Daily',
    filters: ['vendor_id'],
  },
  'payment-register': {
    label: 'Payment Register',
    description: 'Date, vendor, gross, TDS, net paid, UTR.',
    frequency: 'Daily',
    filters: ['vendor_id', 'date_from', 'date_to'],
  },
  'tds-summary': {
    label: 'TDS Summary',
    description: 'Vendor PAN, section, gross, TDS.',
    frequency: 'Monthly',
    filters: ['vendor_id'],
  },
  'form16a-data': {
    label: 'Form 16A Data',
    description: 'TDS certificate data per vendor per quarter (data only — no PDF).',
    frequency: 'Quarterly',
    filters: ['vendor_id'],
  },
  'msme-payment': {
    label: 'MSME Payment Compliance',
    description: 'Vendor, invoice date, acceptance date, due date, payment date, delay.',
    frequency: 'Monthly',
    filters: ['vendor_id'],
  },
  'budget-utilisation': {
    label: 'Budget Utilisation',
    description: 'Budget head, sanctioned, committed, paid, available.',
    frequency: 'Monthly',
    filters: ['department'],
  },
  'aging-analysis': {
    label: 'Aging Analysis',
    description: 'Vendor, amount, invoice date, aging bucket, overdue days.',
    frequency: 'Weekly',
    filters: ['vendor_id'],
  },
  'vendor-performance': {
    label: 'Vendor Performance',
    description: 'Submission accuracy, TAT compliance, query frequency.',
    frequency: 'Monthly',
    filters: ['vendor_id'],
  },
  'approval-tat': {
    label: 'Approval TAT',
    description: 'Stage, approver, average TAT, breaches, escalations.',
    frequency: 'Monthly',
    filters: [],
  },
}

function toQueryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function useDashboardSummary(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['mis', 'dashboard', 'summary', filters],
    queryFn: () => apiFetch<DashboardSummary>(`/api/v1/mis/dashboard/summary${toQueryString(filters)}`),
  })
}

export function useDashboardAging(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['mis', 'dashboard', 'aging', filters],
    queryFn: () => apiFetch<DashboardAgingRow[]>(`/api/v1/mis/dashboard/aging${toQueryString(filters)}`),
  })
}

export function useDashboardSpendByCategory(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['mis', 'dashboard', 'spend-by-category', filters],
    queryFn: () => apiFetch<SpendByCategoryRow[]>(`/api/v1/mis/dashboard/spend-by-category${toQueryString(filters)}`),
  })
}

export type ReportRow = Record<string, string | number | boolean | null>

export function useReport(type: string | undefined, filters: Record<string, string | undefined>) {
  return useQuery({
    queryKey: ['reports', type, filters],
    queryFn: () => apiFetch<ReportRow[]>(`/api/v1/reports/${type}${toQueryString(filters)}`),
    enabled: !!type,
  })
}

export async function downloadReportCsv(type: string, filters: Record<string, string | undefined>): Promise<void> {
  const qs = toQueryString({ ...filters, format: 'csv' })
  const blob = await apiFetchBlob(`/api/v1/reports/${type}${qs}`)
  const blobUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = `${type}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(blobUrl)
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch<AuditLog[]>(`/api/v1/audit-logs${toQueryString(filters)}`),
  })
}

export function useIntegrityCheck() {
  return useMutation({
    mutationFn: () => apiFetch<IntegrityCheckResult>('/api/v1/audit-logs/integrity-check'),
  })
}
