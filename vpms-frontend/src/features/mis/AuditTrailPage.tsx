import { Fragment, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import { friendlyMessage, apiFetch } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { type AuditLogFilters, useAuditLogs, useIntegrityCheck } from '@/features/mis/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const ACTIONS = ['Create', 'Update', 'Approve', 'Reject', 'Delete', 'View', 'Login', 'Logout', 'Login_Failed', 'Document_Upload', 'System']

interface AppUser {
  id: string
  name: string
}

function useAllUsersForAudit() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiFetch<AppUser[]>('/api/v1/users') })
}

export function AuditTrailPage() {
  const [draft, setDraft] = useState<AuditLogFilters>({})
  const [applied, setApplied] = useState<AuditLogFilters>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: users } = useAllUsersForAudit()
  const { data: logs, isLoading } = useAuditLogs(applied)
  const modules = Array.from(new Set((logs ?? []).map((l) => l.module))).sort()

  const integrityCheck = useIntegrityCheck()

  function updateDraft(patch: Partial<AuditLogFilters>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div className="flex flex-col gap-space-2">
      <div>
        <h1 className="font-heading text-size-1 font-bold">Audit Trail</h1>
        <p className="text-size-4 text-muted-foreground">
          Read-only. Every write in the system is logged here — there are no edit or delete controls on this page.
        </p>
      </div>

      <Card>
        <CardContent className="pt-space-3">
          <div className="grid grid-cols-2 gap-space-2 md:grid-cols-3 lg:grid-cols-6">
            <div>
              <Label htmlFor="filter-user">User</Label>
              <Select value={draft.user_id || '__all__'} onValueChange={(v) => updateDraft({ user_id: v === '__all__' ? undefined : v })}>
                <SelectTrigger id="filter-user">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All users</SelectItem>
                  {(users ?? []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-module">Module</Label>
              <Select value={draft.module || '__all__'} onValueChange={(v) => updateDraft({ module: v === '__all__' ? undefined : v })}>
                <SelectTrigger id="filter-module">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All modules</SelectItem>
                  {modules.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-action">Action</Label>
              <Select value={draft.action || '__all__'} onValueChange={(v) => updateDraft({ action: v === '__all__' ? undefined : v })}>
                <SelectTrigger id="filter-action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All actions</SelectItem>
                  {ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-record-reference">Record Reference</Label>
              <Input
                id="filter-record-reference"
                placeholder="e.g. invoice number"
                value={draft.record_reference ?? ''}
                onChange={(e) => updateDraft({ record_reference: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="filter-date-from">Date From</Label>
              <Input id="filter-date-from" type="date" value={draft.date_from ?? ''} onChange={(e) => updateDraft({ date_from: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="filter-date-to">Date To</Label>
              <Input id="filter-date-to" type="date" value={draft.date_to ?? ''} onChange={(e) => updateDraft({ date_to: e.target.value })} />
            </div>
          </div>
          <Button type="button" className="mt-space-2" onClick={() => setApplied({ ...draft })}>
            Apply Filters
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <div className="mb-space-2 flex items-center justify-between">
            <h2 className="font-heading text-size-2 font-bold">Integrity Check</h2>
            <Button type="button" variant="secondary" onClick={() => integrityCheck.mutate()} disabled={integrityCheck.isPending}>
              Run Integrity Check
            </Button>
          </div>
          {integrityCheck.isError && <p className="text-size-4 text-destructive">{friendlyMessage(integrityCheck.error)}</p>}
          {integrityCheck.data && (
            <>
              {integrityCheck.data.clean ? (
                <div className="flex items-center gap-space-2 rounded-md bg-success-bg px-3 py-2 text-success">
                  <span className="text-lg">✓</span>
                  <div>
                    <div className="font-semibold">Chain intact — no tampering detected.</div>
                    <div className="text-size-4">{integrityCheck.data.rows_checked} row{integrityCheck.data.rows_checked === 1 ? '' : 's'} checked.</div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-space-2 rounded-md bg-destructive-bg px-3 py-2 text-destructive">
                    <span className="text-lg">⚠</span>
                    <div>
                      <div className="font-semibold">
                        {integrityCheck.data.breaks.length} break{integrityCheck.data.breaks.length === 1 ? '' : 's'} found.
                      </div>
                      <div className="text-size-4">
                        {integrityCheck.data.rows_checked} row{integrityCheck.data.rows_checked === 1 ? '' : 's'} checked — a stored hash no longer
                        matches its recomputed value at the sequence(s) below.
                      </div>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sequence</TableHead>
                        <TableHead>Expected Hash</TableHead>
                        <TableHead>Stored Hash</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {integrityCheck.data.breaks.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell>{b.sequence}</TableCell>
                          <TableCell className="font-mono text-size-5" title={b.expected_hash}>
                            {b.expected_hash}
                          </TableCell>
                          <TableCell className="font-mono text-size-5" title={b.stored_hash}>
                            {b.stored_hash}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !logs || logs.length === 0 ? (
            <EmptyState message="No audit entries for the selected filters." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Record</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <TableCell>{formatDate(log.timestamp)}</TableCell>
                      <TableCell>{log.user_name_snapshot || 'System'}</TableCell>
                      <TableCell>{log.role_snapshot || ''}</TableCell>
                      <TableCell>
                        <StatusBadge status={log.action} />
                      </TableCell>
                      <TableCell>{log.module}</TableCell>
                      <TableCell>{log.record_reference}</TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="text-size-4">
                            <strong>Session:</strong> {log.session_id || '—'} &nbsp; <strong>IP:</strong> {log.ip_address || '—'}
                          </div>
                          <div className="mt-space-1 flex flex-col gap-1">
                            {!log.field_changes || log.field_changes.length === 0 ? (
                              <p className="text-size-4 text-muted-foreground">No field-level changes recorded for this entry.</p>
                            ) : (
                              log.field_changes.map((c, i) => (
                                <div key={i} className="flex items-center gap-2 text-size-4">
                                  <span className="font-semibold">{c.field}</span>
                                  <span className="text-muted-foreground">{c.old_value ?? '—'}</span>
                                  <span>&rarr;</span>
                                  <span className="text-foreground">{c.new_value ?? '—'}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="mt-space-1 text-size-5 text-muted-foreground">Record hash: {log.record_hash}</div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
