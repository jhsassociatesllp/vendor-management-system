import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { friendlyMessage } from '@/lib/api-client'
import { type ReportRow, REPORT_DEFINITIONS, downloadReportCsv, useReport } from '@/features/mis/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { useBudgetHeads } from '@/features/procurement/hooks'
import { DataTable } from '@/components/shared/DataTable'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const FILTER_LABELS: Record<string, string> = {
  vendor_id: 'Vendor',
  department: 'Department',
  date_from: 'Date From',
  date_to: 'Date To',
}

export function ReportViewerPage() {
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type') ?? undefined
  const def = type ? REPORT_DEFINITIONS[type] : undefined

  const { data: vendors } = useVendors()
  const { data: budgetHeads } = useBudgetHeads()
  const departments = Array.from(new Set((budgetHeads ?? []).map((h) => h.department))).sort()

  const [draftFilters, setDraftFilters] = useState<Record<string, string>>({})
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({})
  const [exporting, setExporting] = useState(false)

  const { data: rows, isLoading, isFetching, isError, error } = useReport(type, appliedFilters)

  // Genuinely generic — columns come from whatever keys the response rows contain, not a
  // hardcoded list per report type, so a report's column set can change on the backend
  // without needing a matching frontend change (Section 7 of the old Phase 5 UI spec).
  // accessorKey (for sort) + an explicit cell (for guaranteed-fresh display) from the
  // start — the same fix the Approvals module needed after-the-fact for cross-referenced
  // lookups; here the column set itself depends on `rows`, so it's exposed to the same
  // class of staleness if `rows` resolves after the table's first render.
  const columns = useMemo<ColumnDef<ReportRow>[]>(() => {
    if (!rows || rows.length === 0) return []
    return Object.keys(rows[0]).map((key) => ({
      header: key.replace(/_/g, ' '),
      accessorKey: key,
      id: key,
      cell: ({ row }) => {
        const value = row.original[key]
        return value === null || value === undefined ? '' : String(value)
      },
    }))
  }, [rows])

  if (!type || !def) {
    return <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">Unknown report type.</div>
  }

  function updateDraft(key: string, value: string) {
    setDraftFilters((prev) => ({ ...prev, [key]: value }))
  }

  function runReport() {
    setAppliedFilters({ ...draftFilters })
  }

  async function handleExport() {
    setExporting(true)
    try {
      await downloadReportCsv(type!, appliedFilters)
    } catch (err) {
      toast.error(friendlyMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <div>
        <h1 className="font-heading text-size-1 font-bold">{def.label}</h1>
        <p className="text-size-4 text-muted-foreground">
          {def.description} ({def.frequency})
        </p>
      </div>

      <Card>
        <CardContent className="pt-space-3">
          {def.filters.length === 0 ? (
            <p className="text-size-4 text-muted-foreground">This report has no filters.</p>
          ) : (
            <div className="grid grid-cols-2 gap-space-2 md:grid-cols-4">
              {def.filters.map((filterKey) => {
                const label = FILTER_LABELS[filterKey] ?? filterKey
                if (filterKey === 'vendor_id') {
                  return (
                    <div key={filterKey}>
                      <Label htmlFor={`filter-${filterKey}`}>{label}</Label>
                      <Select value={draftFilters[filterKey] || '__all__'} onValueChange={(v) => updateDraft(filterKey, v === '__all__' ? '' : v)}>
                        <SelectTrigger id={`filter-${filterKey}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All vendors</SelectItem>
                          {(vendors ?? []).map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.vendor_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                }
                if (filterKey === 'department') {
                  return (
                    <div key={filterKey}>
                      <Label htmlFor={`filter-${filterKey}`}>{label}</Label>
                      <Select value={draftFilters[filterKey] || '__all__'} onValueChange={(v) => updateDraft(filterKey, v === '__all__' ? '' : v)}>
                        <SelectTrigger id={`filter-${filterKey}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All departments</SelectItem>
                          {departments.map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                }
                return (
                  <div key={filterKey}>
                    <Label htmlFor={`filter-${filterKey}`}>{label}</Label>
                    <Input
                      id={`filter-${filterKey}`}
                      type={filterKey === 'date_from' || filterKey === 'date_to' ? 'date' : 'text'}
                      value={draftFilters[filterKey] ?? ''}
                      onChange={(e) => updateDraft(filterKey, e.target.value)}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-space-2 flex gap-space-1">
            <Button type="button" onClick={runReport} disabled={isFetching}>
              Run Report
            </Button>
            <Button type="button" variant="secondary" onClick={handleExport} disabled={exporting || !rows || rows.length === 0}>
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          {isError ? (
            <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">{friendlyMessage(error)}</div>
          ) : (
            <DataTable
              columns={columns}
              data={rows ?? []}
              isLoading={isLoading}
              searchable
              searchPlaceholder="Search…"
              emptyMessage="No data for the selected filters."
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
