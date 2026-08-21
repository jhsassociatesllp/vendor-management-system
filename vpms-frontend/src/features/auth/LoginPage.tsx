import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { friendlyMessage } from '@/lib/api-client'
import { getToken } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import jhsLogoFull from '@/assets/jhs-logo-full.webp'

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type LoginForm = z.infer<typeof loginSchema>

/** Internal staff login (Phase 0 UI) — single-step, no OTP. Mirrors the old
 * static/pages/login.html + auth.js exactly: email/password, single submit,
 * server-side error surfaced above the form. */
export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (getToken()) navigate(ROUTES.dashboard, { replace: true })
  }, [navigate])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginForm) {
    try {
      await login(values.email, values.password)
      navigate(ROUTES.dashboard, { replace: true })
    } catch (err) {
      setError('root', { message: friendlyMessage(err) })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-[380px]">
        <CardContent className="pt-space-3">
          <img src={jhsLogoFull} alt="JHS" className="mx-auto mb-space-2 h-10 w-auto" />
          <div className="mb-space-3 text-center text-size-4 text-muted-foreground">
            Vendor Payment Management System
          </div>

          {errors.root && (
            <div className="mb-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
              {errors.root.message}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" {...register('email')} />
            {errors.email && <p className="mt-1 text-size-5 text-destructive">{errors.email.message}</p>}

            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
            {errors.password && <p className="mt-1 text-size-5 text-destructive">{errors.password.message}</p>}

            <Button type="submit" className="mt-space-3 w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Logging in…' : 'Log In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
