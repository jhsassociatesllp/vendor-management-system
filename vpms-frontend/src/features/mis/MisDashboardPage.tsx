import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { money } from '@/lib/utils'
import {
  type DashboardFilters,
  useDashboardAging,
  useDashboardSpendByCategory,
  useDashboardSummary,
  useReport,
} from '@/features/mis/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { useBudgetHeads } from '@/features/procurement/hooks'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/shared/EmptyState'

const CATEGORIES = ['Professional', 'Service', 'Goods Supplier', 'Recurring']

const AGING_COLORS: Record<string, string> = {
  '0-30': 'hsl(159 65% 30%)',
  '30-60': 'hsl(36 71% 42%)',
  '60-90': 'hsl(36 71% 42%)',
  '90+': 'hsl(4 76% 40%)',
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-space-3">
        <div className="font-heading text-size-1 font-bold text-foreground">{value}</div>
        <div className="text-size-4 text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

export function MisDashboardPage() {
  // Draft filter inputs vs. the committed `filters` object — every chart/KPI query reads
  // from `filters`, so Apply Filters / period presets / drill-downs all move together
  // (Phase 5 UI spec Section 3.1: "changing filters re-fetches and re-renders both charts
  // and the KPI cards, not just one or the other" — the backend's summary/aging endpoints
  // previously took no filters at all; extended them to match spend-by-category's).
  const [draftVendorId, setDraftVendorId] = useState('')
  const [draftDepartment, setDraftDepartment] = useState('')
  const [draftCategory, setDraftCategory] = useState('')
  const [draftDateFrom, setDraftDateFrom] = useState('')
  const [draftDateTo, setDraftDateTo] = useState('')
  const [filters, setFilters] = useState<DashboardFilters>({})

  const [agingBucket, setAgingBucket] = useState<string | null>(null)
  const [categoryIsolation, setCategoryIsolation] = useState<string | null>(null)

  const { data: vendors } = useVendors()
  const { data: budgetHeads } = useBudgetHeads()
  const departments = Array.from(new Set((budgetHeads ?? []).map((h) => h.department))).sort()

  const { data: summary } = useDashboardSummary(filters)
  const { data: aging } = useDashboardAging(filters)
  const { data: spend } = useDashboardSpendByCategory(filters)
  const { data: agingReport } = useReport('aging-analysis', { vendor_id: filters.vendor_id })

  const displayedSpend = categoryIsolation ? (spend ?? []).filter((r) => r.category === categoryIsolation) : spend ?? []
  const drilldownRows = agingBucket ? (agingReport ?? []).filter((r) => r.aging_bucket === agingBucket) : []

  function applyFilters() {
    setAgingBucket(null)
    setCategoryIsolation(null)
    setFilters({
      vendor_id: draftVendorId || undefined,
      department: draftDepartment || undefined,
      category: draftCategory || undefined,
      date_from: draftDateFrom || undefined,
      date_to: draftDateTo || undefined,
    })
  }

  function setPeriod(monthsAgo: number) {
    const today = new Date()
    const target = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1)
    const from = new Date(target.getFullYear(), target.getMonth(), 1)
    const to = monthsAgo === 0 ? today : new Date(target.getFullYear(), target.getMonth() + 1, 0)
    const fromStr = from.toISOString().slice(0, 10)
    const toStr = to.toISOString().slice(0, 10)
    setDraftDateFrom(fromStr)
    setDraftDateTo(toStr)
    setAgingBucket(null)
    setCategoryIsolation(null)
    setFilters((prev) => ({ ...prev, date_from: fromStr, date_to: toStr }))
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">MIS Dashboard</h1>

      <div className="grid grid-cols-2 gap-space-2 md:grid-cols-4">
        <KpiCard label="Total Payables" value={summary ? money(summary.total_payables) : '—'} />
        <KpiCard label="Overdue Invoices" value={summary ? String(summary.overdue_invoice_count) : '—'} />
        <KpiCard label="MSME Risk Count" value={summary ? String(summary.msme_risk_count) : '—'} />
        <KpiCard label="Budget Utilization" value={summary ? `${summary.budget_utilization_pct.toFixed(1)}%` : '—'} />
      </div>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-1 font-heading text-size-2 font-bold">Filters</h2>
          <div className="grid grid-cols-2 gap-space-2 md:grid-cols-5">
            <div>
              <Label htmlFor="filter-vendor">Vendor</Label>
              <Select value={draftVendorId || '__all__'} onValueChange={(v) => setDraftVendorId(v === '__all__' ? '' : v)}>
                <SelectTrigger id="filter-vendor">
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
            <div>
              <Label htmlFor="filter-department">Department</Label>
              <Select value={draftDepartment || '__all__'} onValueChange={(v) => setDraftDepartment(v === '__all__' ? '' : v)}>
                <SelectTrigger id="filter-department">
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
            <div>
              <Label htmlFor="filter-category">Category</Label>
              <Select value={draftCategory || '__all__'} onValueChange={(v) => setDraftCategory(v === '__all__' ? '' : v)}>
                <SelectTrigger id="filter-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-date-from">Period From</Label>
              <Input id="filter-date-from" type="date" value={draftDateFrom} onChange={(e) => setDraftDateFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="filter-date-to">Period To</Label>
              <Input id="filter-date-to" type="date" value={draftDateTo} onChange={(e) => setDraftDateTo(e.target.value)} />
            </div>
          </div>
          <div className="mt-space-2 flex gap-space-1">
            <Button type="button" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPeriod(0)}>
              This Month
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPeriod(1)}>
              Last Month
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-1 font-heading text-size-2 font-bold">Aging</h2>
          <p className="mb-space-2 text-size-4 text-muted-foreground">Click a bar to see the invoices in that bucket.</p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={aging ?? []}
                onClick={(e) => {
                  if (!e?.activeLabel) return
                  const label = String(e.activeLabel)
                  setAgingBucket(label === agingBucket ? null : label)
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 21% 91%)" />
                <XAxis dataKey="bucket" stroke="hsl(221 13% 46%)" fontSize={12} />
                <YAxis stroke="hsl(221 13% 46%)" fontSize={12} />
                <Tooltip formatter={(value: unknown) => money(Number(Array.isArray(value) ? value[0] : (value ?? 0)))} />
                <Bar dataKey="amount" name="Amount" cursor="pointer" isAnimationActive={false}>
                  {(aging ?? []).map((row) => (
                    <Cell key={row.bucket} fill={AGING_COLORS[row.bucket] ?? 'hsl(213 94% 21%)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {agingBucket && (
            <div className="mt-space-2">
              <h3 className="mb-space-1 font-heading text-size-3 font-bold">
                {agingBucket} days ({drilldownRows.length} invoice{drilldownRows.length === 1 ? '' : 's'})
              </h3>
              {drilldownRows.length === 0 ? (
                <EmptyState message={`No invoices in the ${agingBucket} bucket.`} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Invoice Date</TableHead>
                      <TableHead>Overdue Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drilldownRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{String(r.vendor_name)}</TableCell>
                        <TableCell>{String(r.invoice_number)}</TableCell>
                        <TableCell>{money(Number(r.amount))}</TableCell>
                        <TableCell>{String(r.invoice_date)}</TableCell>
                        <TableCell>{String(r.overdue_days)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-1 font-heading text-size-2 font-bold">Spend by Category</h2>
          <p className="mb-space-2 text-size-4 text-muted-foreground">
            Bars show the selected period vs. the immediately preceding period of equal length. Click a bar to isolate that category.
          </p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayedSpend}
                onClick={(e) => {
                  if (!e?.activeLabel) return
                  const label = String(e.activeLabel)
                  setCategoryIsolation((prev) => (prev === label ? null : label))
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 21% 91%)" />
                <XAxis dataKey="category" stroke="hsl(221 13% 46%)" fontSize={12} />
                <YAxis stroke="hsl(221 13% 46%)" fontSize={12} />
                <Tooltip formatter={(value: unknown) => money(Number(Array.isArray(value) ? value[0] : (value ?? 0)))} />
                <Legend />
                <Bar dataKey="current_period_amount" name="Current Period" fill="hsl(213 94% 21%)" cursor="pointer" isAnimationActive={false} />
                <Bar dataKey="previous_period_amount" name="Previous Period" fill="hsl(216 21% 91%)" cursor="pointer" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
