import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useUnreadNotificationCount } from '@/hooks/useNotifications'
import { navLinksForRole, ROUTES } from '@/lib/nav-config'
import { cn } from '@/lib/utils'
import jhsLogoFull from '@/assets/jhs-logo-full.webp'
import jhsLogoMark from '@/assets/jhs-logo-mark.webp'

/** Section 5.4: one AppShell (sidebar + top bar) wrapping every authenticated route,
 * nav links computed once from the current user's role instead of duplicated per page
 * (the old static site's per-page NAV_BY_ROLE lookup, centralized). Renders <Outlet/> so
 * it can sit directly in the route tree above every protected page. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const unreadCount = useUnreadNotificationCount()

  if (!user) return null

  const links = navLinksForRole(user.role)

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-sidebar shrink-0 flex-col bg-primary text-primary-foreground">
        <div className="flex items-center border-b border-white/15 px-space-2 py-space-2">
          <div className="rounded-md bg-white p-1.5">
            <img src={jhsLogoMark} alt="JHS" className="h-9 w-9" />
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto py-space-2">
          {links.map((link) => {
            const isActive = location.pathname === link.href.split('?')[0]
            return (
              <Link
                key={link.href}
                to={link.href}
                className={cn(
                  'border-l-[3px] border-transparent px-space-2 py-2.5 text-size-4 font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white',
                  isActive && 'border-brand bg-white/10 text-white',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-topbar items-center justify-between gap-space-3 border-b border-border bg-surface px-space-3">
          <img src={jhsLogoFull} alt="JHS & Associates LLP" className="h-7 w-auto" />
          <div className="flex items-center gap-space-3">
            <button
              type="button"
              title="Notifications"
              onClick={() => navigate(ROUTES.vendorNotifications)}
              className="relative rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            <div className="text-right leading-tight">
              <div className="text-size-4 font-semibold">{user.name}</div>
              <div className="text-size-5 text-muted-foreground">{user.role}</div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-border px-3 py-1.5 text-size-4 text-muted-foreground hover:bg-background hover:text-foreground"
            >
              Log out
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1100px] flex-1 p-space-3">{children ?? <Outlet />}</main>
      </div>
    </div>
  )
}
