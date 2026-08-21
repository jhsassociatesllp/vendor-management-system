import { useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { type DoaMatrixRow, useCreateDoaMatrixRow, useDoaMatrix, useUpdateDoaMatrixRow } from '@/features/approvals/hooks'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Free-text role fields let a typo silently break the approval routing (a misspelled
// role never matches any real user's role, so that level's approval would never route
// to anyone) — a fixed list of the actual seeded roles instead of a free text field.
const ROLE_OPTIONS = ['Accounts Executive', 'Dept. Manager', 'Partner / VP', 'Finance Team', 'Budget Controller', 'System Admin']

function RoleSelect({ value, onChange, allowBlank }: { value: string; onChange: (v: string) => void; allowBlank: boolean }) {
  return (
    <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger className="min-w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowBlank && <SelectItem value="__none__">— None —</SelectItem>}
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function MatrixRow({ row }: { row: DoaMatrixRow }) {
  const update = useUpdateDoaMatrixRow()
  const [minAmount, setMinAmount] = useState(row.min_amount)
  const [maxAmount, setMaxAmount] = useState(row.max_amount ?? '')
  const [requiresL2, setRequiresL2] = useState(row.requires_l2)
  const [requiresL3, setRequiresL3] = useState(row.requires_l3)
  const [l1Role, setL1Role] = useState(row.l1_role)
  const [l2Role, setL2Role] = useState(row.l2_role ?? '')
  const [l3Role, setL3Role] = useState(row.l3_role ?? '')
  const [l4Role, setL4Role] = useState(row.l4_role)
  const [l1Tat, setL1Tat] = useState(String(row.l1_tat_days))
  const [l2Tat, setL2Tat] = useState(String(row.l2_tat_days))
  const [l3Tat, setL3Tat] = useState(String(row.l3_tat_days))
  const [l4Tat, setL4Tat] = useState(String(row.l4_tat_days))
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    try {
      await update.mutateAsync({
        id: row.id,
        payload: {
          min_amount: minAmount,
          max_amount: maxAmount || null,
          requires_l2: requiresL2,
          requires_l3: requiresL3,
          l1_role: l1Role,
          l2_role: l2Role || null,
          l3_role: l3Role || null,
          l4_role: l4Role,
          l1_tat_days: l1Tat,
          l2_tat_days: l2Tat,
          l3_tat_days: l3Tat,
          l4_tat_days: l4Tat,
        },
      })
      toast.success('Slab updated.')
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <TableRow>
      <TableCell>
        <Input type="number" step="0.01" min={0} className="w-[100px]" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.01" min={0} className="w-[100px]" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
      </TableCell>
      <TableCell>
        <Checkbox checked={requiresL2} onCheckedChange={(v) => setRequiresL2(!!v)} />
      </TableCell>
      <TableCell>
        <Checkbox checked={requiresL3} onCheckedChange={(v) => setRequiresL3(!!v)} />
      </TableCell>
      <TableCell>
        <RoleSelect value={l1Role} onChange={setL1Role} allowBlank={false} />
      </TableCell>
      <TableCell>
        <RoleSelect value={l2Role} onChange={setL2Role} allowBlank />
      </TableCell>
      <TableCell>
        <RoleSelect value={l3Role} onChange={setL3Role} allowBlank />
      </TableCell>
      <TableCell>
        <RoleSelect value={l4Role} onChange={setL4Role} allowBlank={false} />
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Input type="number" min={1} className="w-12" value={l1Tat} onChange={(e) => setL1Tat(e.target.value)} />/
          <Input type="number" min={1} className="w-12" value={l2Tat} onChange={(e) => setL2Tat(e.target.value)} />/
          <Input type="number" min={1} className="w-12" value={l3Tat} onChange={(e) => setL3Tat(e.target.value)} />/
          <Input type="number" min={1} className="w-12" value={l4Tat} onChange={(e) => setL4Tat(e.target.value)} />
        </div>
      </TableCell>
      <TableCell>
        <Button type="button" onClick={handleSave} disabled={update.isPending}>
          Save
        </Button>
        {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
      </TableCell>
    </TableRow>
  )
}

export function DoaMatrixPage() {
  const { user } = useAuth()
  const { data: rows, isLoading } = useDoaMatrix()
  const createRow = useCreateDoaMatrixRow()

  const [newMin, setNewMin] = useState('')
  const [newMax, setNewMax] = useState('')
  const [newRequiresL2, setNewRequiresL2] = useState(false)
  const [newRequiresL3, setNewRequiresL3] = useState(false)
  const [newL1Role, setNewL1Role] = useState('Accounts Executive')
  const [newL2Role, setNewL2Role] = useState('')
  const [newL3Role, setNewL3Role] = useState('')
  const [newL4Role, setNewL4Role] = useState('Finance Team')
  const [createError, setCreateError] = useState('')

  if (!user || user.role !== 'System Admin') {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  async function handleCreate() {
    setCreateError('')
    try {
      await createRow.mutateAsync({
        min_amount: newMin,
        max_amount: newMax || null,
        requires_l2: newRequiresL2,
        requires_l3: newRequiresL3,
        l1_role: newL1Role,
        l2_role: newL2Role || null,
        l3_role: newL3Role || null,
        l4_role: newL4Role,
        l1_tat_days: 1,
        l2_tat_days: 2,
        l3_tat_days: 2,
        l4_tat_days: 1,
      })
      toast.success('Slab added.')
      setNewMin('')
      setNewMax('')
      setNewRequiresL2(false)
      setNewRequiresL3(false)
      setNewL1Role('Accounts Executive')
      setNewL2Role('')
      setNewL3Role('')
      setNewL4Role('Finance Team')
    } catch (err) {
      setCreateError(friendlyMessage(err))
    }
  }

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">DoA Matrix</h1>
      <p className="text-size-4 text-muted-foreground">
        Amount slabs that decide which levels an invoice's approval routes through, and each level's TAT.
      </p>

      <Card>
        <CardContent className="pt-space-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !rows || rows.length === 0 ? (
            <EmptyState message="No slabs configured yet." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Min Amount</TableHead>
                    <TableHead>Max Amount</TableHead>
                    <TableHead>L2?</TableHead>
                    <TableHead>L3?</TableHead>
                    <TableHead>L1 Role</TableHead>
                    <TableHead>L2 Role</TableHead>
                    <TableHead>L3 Role</TableHead>
                    <TableHead>L4 Role</TableHead>
                    <TableHead>TAT (L1/L2/L3/L4 days)</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <MatrixRow key={row.id} row={row} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-2 font-bold">Add Slab</h2>
          <Label htmlFor="new_min_amount">Min Amount</Label>
          <Input id="new_min_amount" type="number" step="0.01" min={0} value={newMin} onChange={(e) => setNewMin(e.target.value)} />
          <Label htmlFor="new_max_amount">Max Amount (blank = no upper limit)</Label>
          <Input id="new_max_amount" type="number" step="0.01" min={0} value={newMax} onChange={(e) => setNewMax(e.target.value)} />
          <div className="mt-space-2 flex items-center gap-space-1">
            <Checkbox id="new_requires_l2" checked={newRequiresL2} onCheckedChange={(v) => setNewRequiresL2(!!v)} />
            <Label htmlFor="new_requires_l2" className="mb-0 mt-0 font-normal">
              Requires L2
            </Label>
          </div>
          <div className="mt-space-2 flex items-center gap-space-1">
            <Checkbox id="new_requires_l3" checked={newRequiresL3} onCheckedChange={(v) => setNewRequiresL3(!!v)} />
            <Label htmlFor="new_requires_l3" className="mb-0 mt-0 font-normal">
              Requires L3
            </Label>
          </div>
          <Label>L1 Role</Label>
          <RoleSelect value={newL1Role} onChange={setNewL1Role} allowBlank={false} />
          <div className="mt-space-2">
            <Label>L2 Role</Label>
            <RoleSelect value={newL2Role} onChange={setNewL2Role} allowBlank />
          </div>
          <div className="mt-space-2">
            <Label>L3 Role</Label>
            <RoleSelect value={newL3Role} onChange={setNewL3Role} allowBlank />
          </div>
          <div className="mt-space-2">
            <Label>L4 Role</Label>
            <RoleSelect value={newL4Role} onChange={setNewL4Role} allowBlank={false} />
          </div>
          {createError && <p className="mt-1 text-size-5 text-destructive">{createError}</p>}
          <Button type="button" className="mt-space-3" onClick={handleCreate} disabled={createRow.isPending}>
            Add Slab
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
