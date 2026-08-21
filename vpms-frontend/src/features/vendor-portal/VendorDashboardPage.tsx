import { Link } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDate } from '@/lib/utils'
import { ROUTES } from '@/lib/nav-config'
import { type KycDocument, useOwnKycDocuments, useProfileStatus } from '@/features/vendor-portal/hooks'
import { ProgressRing } from '@/components/shared/ProgressRing'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/** Phase 2B UI's vendor-dashboard.html: profile completion ring, quick links, KYC
 * document checklist, recent notifications preview. Only reachable for the Vendor
 * role — routed separately from the internal staff DashboardPage. */
export function VendorDashboardPage() {
  const { user } = useAuth()
  const { data: status } = useProfileStatus()
  const { data: documents } = useOwnKycDocuments()
  const { data: notifications } = useNotifications()

  if (!user) return null

  const latestByType = new Map<string, KycDocument>()
  for (const doc of documents ?? []) {
    const existing = latestByType.get(doc.document_type)
    if (!existing || new Date(doc.uploaded_at) > new Date(existing.uploaded_at)) {
      latestByType.set(doc.document_type, doc)
    }
  }

  const total = status?.mandatory_documents.length ?? 0
  const verified = status?.verified_documents.length ?? 0
  const percent = total === 0 ? 100 : Math.round((verified / total) * 100)

  return (
    <div className="flex flex-col gap-space-2">
      <h1 className="font-heading text-size-1 font-bold">Welcome, {user.name}</h1>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-space-2">
        <Card>
          <CardContent className="flex items-center gap-space-3 pt-space-3">
            {status ? <ProgressRing percent={percent} size={100} /> : <p className="text-muted-foreground">Loading…</p>}
            <div>
              <h2 className="mb-1 font-heading text-size-3 font-bold">Profile Completion</h2>
              <p className="text-size-4 text-muted-foreground">
                {status?.complete
                  ? 'Your profile is complete — all mandatory documents are verified.'
                  : status
                    ? `${verified} of ${total} mandatory documents verified.`
                    : 'Loading your KYC status…'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-space-3">
            <h2 className="mb-space-2 font-heading text-size-3 font-bold">Quick Links</h2>
            <div className="flex flex-col gap-2">
              <Link to={ROUTES.vendorKycUpload} className="text-primary hover:underline">
                Upload Documents
              </Link>
              <Link to={ROUTES.vendorBankChange} className="text-primary hover:underline">
                Request Bank Change
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-3 font-bold">KYC Document Checklist</h2>
          {!status || status.mandatory_documents.length === 0 ? (
            <p className="text-muted-foreground">
              {status ? 'No mandatory documents apply to your vendor profile.' : 'Loading…'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.mandatory_documents.map((docType) => {
                  const doc = latestByType.get(docType)
                  const label = docType.replace(/_/g, ' ')
                  return (
                    <TableRow key={docType}>
                      <TableCell>
                        {label}
                        {doc?.status === 'Rejected' && doc.rejection_reason && (
                          <div className="mt-1 text-size-5 text-destructive">{doc.rejection_reason}</div>
                        )}
                      </TableCell>
                      <TableCell>{doc ? <StatusBadge status={doc.status} /> : <StatusBadge status="Not_Uploaded" />}</TableCell>
                      <TableCell>
                        {(!doc || doc.status === 'Rejected') && (
                          <Link to={ROUTES.vendorKycUpload} className="text-primary hover:underline">
                            {doc ? 'Re-upload' : 'Upload'}
                          </Link>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-space-3">
          <h2 className="mb-space-2 font-heading text-size-3 font-bold">Recent Notifications</h2>
          {!notifications || notifications.length === 0 ? (
            <EmptyState message="No notifications yet." />
          ) : (
            <div className="flex flex-col gap-2">
              {notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="flex items-start gap-2 border-b border-border pb-2 last:border-0">
                  <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand'}`} />
                  <div>
                    <div className="text-size-4">{n.message}</div>
                    <div className="text-size-5 text-muted-foreground">{formatDate(n.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Link to={ROUTES.vendorNotifications} className="mt-space-2 inline-block text-size-4 text-primary hover:underline">
            View all notifications
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
