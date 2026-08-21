import { useState } from 'react'
import { toast } from 'sonner'

import { friendlyMessage } from '@/lib/api-client'
import { useProfileStatus } from '@/features/vendor-portal/hooks'
import { type PurchaseOrder, usePurchaseOrders, useVendorAcknowledgePO } from '@/features/procurement/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function AcknowledgeAction({ po }: { po: PurchaseOrder }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const acknowledge = useVendorAcknowledgePO(po.id)

  async function handleConfirm() {
    try {
      await acknowledge.mutateAsync()
      toast.success('Purchase order acknowledged.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  if (!showConfirm) {
    return (
      <Button type="button" onClick={() => setShowConfirm(true)}>
        Acknowledge
      </Button>
    )
  }

  return (
    <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
      <p className="text-size-4 text-muted-foreground">
        You're confirming you'll fulfill this PO as specified — quantity, rate, and delivery date. This cannot be
        undone from here.
      </p>
      <div className="mt-space-2 flex gap-2">
        <Button type="button" onClick={handleConfirm} disabled={acknowledge.isPending}>
          Confirm Acknowledgement
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

export function VendorPoListPage() {
  const { data: status } = useProfileStatus()
  const { data: pos, isLoading } = usePurchaseOrders()

  const ownPos = (pos ?? []).filter((po) => po.vendor_id === status?.vendor_id)

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">My Purchase Orders</h1>
      {isLoading || !status ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : ownPos.length === 0 ? (
        <EmptyState message="No purchase orders yet." />
      ) : (
        <div className="flex flex-col gap-space-2">
          {ownPos.map((po) => (
            <Card key={po.id}>
              <CardContent className="pt-space-3">
                <h3 className="mb-space-2 flex items-center gap-2 font-heading text-size-3 font-bold">
                  {po.po_number}
                  <StatusBadge status={po.status} />
                </h3>
                <div className="flex justify-between border-b border-border py-1 text-size-4">
                  <span className="text-muted-foreground">Description</span>
                  <span>{po.description}</span>
                </div>
                <div className="flex justify-between border-b border-border py-1 text-size-4">
                  <span className="text-muted-foreground">Quantity</span>
                  <span>
                    {po.quantity} {po.unit}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border py-1 text-size-4">
                  <span className="text-muted-foreground">Total (incl. GST)</span>
                  <span>{po.total_po_value_incl_gst}</span>
                </div>
                <div className="flex justify-between py-1 text-size-4">
                  <span className="text-muted-foreground">Delivery / Completion Date</span>
                  <span>{po.delivery_completion_date}</span>
                </div>
                {po.status === 'Approved' && (
                  <div className="mt-space-2">
                    <AcknowledgeAction po={po} />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
