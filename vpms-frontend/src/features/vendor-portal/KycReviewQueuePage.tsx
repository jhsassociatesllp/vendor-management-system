import { Fragment, useState } from 'react'
import { toast } from 'sonner'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage, openAuthenticatedFile } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { usePendingKycDocuments, useReviewKycDocument } from '@/features/vendor-portal/hooks'
import { useVendors } from '@/features/vendor/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function ReviewDetailRow({ documentId }: { documentId: string }) {
  const review = useReviewKycDocument()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')
  const [fileError, setFileError] = useState('')

  async function handleViewFile() {
    setFileError('')
    try {
      await openAuthenticatedFile(`/api/v1/kyc-documents/${documentId}/file`)
    } catch {
      setFileError('Could not open the file.')
    }
  }

  async function handleVerify() {
    try {
      await review.mutateAsync({ id: documentId, decision: 'verify', reason: null })
      toast.success('Document verified.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  async function handleConfirmReject() {
    const trimmed = reason.trim()
    if (!trimmed) {
      setReasonError('Rejection reason is required.')
      return
    }
    try {
      await review.mutateAsync({ id: documentId, decision: 'reject', reason: trimmed })
      toast.success('Document rejected.')
    } catch (err) {
      toast.error(friendlyMessage(err))
    }
  }

  return (
    <TableRow>
      <TableCell colSpan={4}>
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" variant="outline" onClick={handleViewFile}>
            View Document
          </Button>
          <Button type="button" onClick={handleVerify} disabled={review.isPending}>
            Verify
          </Button>
          <Button type="button" variant="destructive" onClick={() => setShowReject(true)}>
            Reject
          </Button>
        </div>
        {fileError && <p className="mt-1 text-size-5 text-destructive">{fileError}</p>}
        {showReject && (
          <div className="mt-space-2 rounded-md border border-border bg-background p-space-2">
            <Label htmlFor={`reason-${documentId}`}>Rejection Reason (required)</Label>
            <Textarea id={`reason-${documentId}`} value={reason} onChange={(e) => setReason(e.target.value)} />
            {reasonError && <p className="mt-1 text-size-5 text-destructive">{reasonError}</p>}
            <Button type="button" variant="destructive" className="mt-space-2" onClick={handleConfirmReject}>
              Confirm Reject
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  )
}

/** Phase 2B UI's kyc-review-queue.html — Accounts Executive / System Admin only.
 * Click a row to expand its review actions (view file, verify, reject with reason). */
export function KycReviewQueuePage() {
  const { user } = useAuth()
  const { data: documents, isLoading } = usePendingKycDocuments()
  const { data: vendors } = useVendors()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!user || !['Accounts Executive', 'System Admin'].includes(user.role)) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
        You don't have permission for this action.
      </div>
    )
  }

  const vendorLabelById = new Map((vendors ?? []).map((v) => [v.id, `${v.vendor_name} (${v.vendor_code})`]))

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">KYC Review Queue</h1>
      <Card>
        <CardContent className="pt-space-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !documents || documents.length === 0 ? (
            <EmptyState message="No documents awaiting review." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <Fragment key={doc.id}>
                    <TableRow
                      className="clickable-row cursor-pointer"
                      onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                    >
                      <TableCell>{vendorLabelById.get(doc.vendor_id) ?? doc.vendor_id}</TableCell>
                      <TableCell>{doc.document_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                      <TableCell>
                        <StatusBadge status={doc.status} />
                      </TableCell>
                    </TableRow>
                    {expandedId === doc.id && <ReviewDetailRow documentId={doc.id} />}
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
