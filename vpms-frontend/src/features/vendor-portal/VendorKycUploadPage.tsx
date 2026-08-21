import { useState } from 'react'
import { toast } from 'sonner'

import { friendlyMessage } from '@/lib/api-client'
import { type KycDocument, useOwnKycDocuments, useProfileStatus, useUploadKycDocument } from '@/features/vendor-portal/hooks'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function DocumentUploadCard({ vendorId, docType, doc }: { vendorId: string; docType: string; doc?: KycDocument }) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const upload = useUploadKycDocument()
  const label = docType.replace(/_/g, ' ')

  async function handleUpload() {
    setError('')
    if (!file) {
      setError('Choose a file first.')
      return
    }
    try {
      await upload.mutateAsync({ vendorId, documentType: docType, file })
      toast.success(`${label} uploaded and is now pending review.`)
      setFile(null)
    } catch (err) {
      setError(friendlyMessage(err))
    }
  }

  return (
    <Card>
      <CardContent className="pt-space-3">
        <h3 className="mb-1 flex items-center gap-2 text-size-3 font-semibold">
          {label}
          {doc ? <StatusBadge status={doc.status} /> : <StatusBadge status="Not_Uploaded" />}
        </h3>
        {doc?.status === 'Rejected' && doc.rejection_reason && (
          <p className="mb-space-2 text-size-4 text-destructive">Rejected: {doc.rejection_reason}</p>
        )}
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-size-4"
        />
        {error && <p className="mt-1 text-size-5 text-destructive">{error}</p>}
        <div>
          <Button type="button" className="mt-space-2" onClick={handleUpload} disabled={upload.isPending}>
            {doc ? 'Re-upload' : 'Upload'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Phase 2B UI's vendor-kyc-upload.html: one card per mandatory document type, each
 * with its own file input and upload/re-upload button. */
export function VendorKycUploadPage() {
  const { data: status, isLoading: statusLoading } = useProfileStatus()
  const { data: documents } = useOwnKycDocuments()

  const latestByType = new Map<string, KycDocument>()
  for (const doc of documents ?? []) {
    const existing = latestByType.get(doc.document_type)
    if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
      latestByType.set(doc.document_type, doc)
    }
  }

  return (
    <div>
      <h1 className="mb-1 font-heading text-size-1 font-bold">KYC Documents</h1>
      <p className="mb-space-3 text-size-4 text-muted-foreground">
        Upload each mandatory document below. Your Accounts team will review and verify them.
      </p>

      {statusLoading || !status ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : status.mandatory_documents.length === 0 ? (
        <EmptyState message="No mandatory documents apply to your vendor profile." />
      ) : (
        <div className="flex flex-col gap-space-2">
          {status.mandatory_documents.map((docType) => (
            <DocumentUploadCard
              key={docType}
              vendorId={status.vendor_id}
              docType={docType}
              doc={latestByType.get(docType)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
