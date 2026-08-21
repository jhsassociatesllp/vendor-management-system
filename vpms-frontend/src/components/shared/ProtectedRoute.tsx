import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ROUTES } from '@/lib/nav-config'

interface ProtectedRouteProps {
  /** Roles allowed on this route. Omit to allow any authenticated user. */
  roles?: string[]
}

/** Gates a route (or subtree, via <Outlet/>) on authentication and, optionally, role.
 * Section 5.2: redirect when not authenticated, but show a clear "not authorized" state
 * (not a redirect) when authenticated with the wrong role — the user is real, they just
 * can't do this, and that's a different situation from "please log in." */
export function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
    )
  }

  if (!user) {
    return <Navigate to={ROUTES.login} replace state={{ from: location }} />
  }

  if (roles && !roles.includes(user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
        <h1 className="text-size-2">Not authorized</h1>
        <p className="text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    )
  }

  return <Outlet />
}
