import { Link } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { navLinksForRole, ROUTES } from '@/lib/nav-config'
import { Card, CardTitle } from '@/components/ui/card'

/** Per-role dashboard (Phase 1 UI + Phase 2B UI's vendor-dashboard.html both route here
 * from App.tsx today; a real progress-ring vendor dashboard replaces this for the Vendor
 * role in the Vendor Portal module). Mirrors dashboard.js: a card grid of the role's own
 * nav links minus the dashboard link itself, "No actions available yet" if none. */
export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null

  const links =
    user.role === 'Vendor'
      ? []
      : navLinksForRole(user.role).filter((link) => link.href !== ROUTES.dashboard)

  return (
    <div>
      <h1 className="mb-space-2 font-heading text-size-1 font-bold">Dashboard</h1>
      {links.length === 0 ? (
        <p className="text-muted-foreground">No actions available yet.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-space-2">
          {links.map((link) => (
            <Link key={link.href} to={link.href}>
              <Card className="p-space-3 transition-colors hover:border-primary">
                <CardTitle className="text-primary">{link.label}</CardTitle>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
