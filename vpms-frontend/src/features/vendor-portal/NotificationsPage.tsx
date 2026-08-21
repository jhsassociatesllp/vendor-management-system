import { useQueryClient } from '@tanstack/react-query'

import { apiFetch, friendlyMessage } from '@/lib/api-client'
import { formatDate } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'

/** Shared by every role (Section 5's Notifications link) — mirrors the old
 * vendor-notifications.html, which despite its filename has no role check and is used
 * by internal staff and vendors alike. Click a row to mark it read. */
export function NotificationsPage() {
  const { data: notifications, isLoading, error } = useNotifications()
  const queryClient = useQueryClient()

  async function markRead(id: string) {
    try {
      await apiFetch(`/api/v1/notifications/${id}/read`, { method: 'POST' })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err) {
      console.error(friendlyMessage(err))
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error) {
    return (
      <div className="rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">{friendlyMessage(error)}</div>
    )
  }

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Notifications</h1>
      {!notifications || notifications.length === 0 ? (
        <EmptyState message="No notifications yet." />
      ) : (
        <div className="flex flex-col gap-1">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => markRead(n.id)}
              className={cn(
                'flex items-start gap-2 rounded-md border border-border bg-surface p-space-2 text-left transition-colors hover:bg-background',
                n.read_at && 'opacity-60',
              )}
            >
              <div className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-brand')} />
              <div>
                <div className="text-size-4">{n.message}</div>
                <div className="text-size-5 text-muted-foreground">
                  {formatDate(n.created_at)}
                  {n.read_at ? ' · Read' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
