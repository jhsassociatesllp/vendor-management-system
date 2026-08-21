import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { getToken } from '@/lib/api-client'
import { ROUTES } from '@/lib/nav-config'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import jhsLogoFull from '@/assets/jhs-logo-full.webp'

/** Vendor portal login (Phase 2B UI §3.1) — two-step OTP flow. Mirrors the old
 * static/pages/vendor-login.html + vendor-login.js: step 1 (email/password) issues a
 * pre-auth token + dev-mode OTP; step 2 verifies the code and issues the real token. */
export function VendorLoginPage() {
  const { vendorLoginStep1, vendorVerifyOtp } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null)
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (getToken()) navigate(ROUTES.vendorDashboard, { replace: true })
  }, [navigate])

  async function handleStep1(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)
    try {
      const result = await vendorLoginStep1(email, password)
      setPreAuthToken(result.preAuthToken)
      setDevOtpHint(`Dev mode: your OTP is ${result.otpCodeDevOnly}`)
      setStep(2)
    } catch (err) {
      setError('Invalid email or password.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleBack() {
    setStep(1)
    setPreAuthToken(null)
    setDevOtpHint(null)
    setError(null)
  }

  async function handleStep2(event: React.FormEvent) {
    event.preventDefault()
    if (!preAuthToken) return
    setError(null)
    setIsSubmitting(true)
    try {
      await vendorVerifyOtp(preAuthToken, otp)
      navigate(ROUTES.vendorDashboard, { replace: true })
    } catch (err) {
      setError('Invalid or expired code. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-[380px]">
        <CardContent className="pt-space-3">
          <img src={jhsLogoFull} alt="JHS" className="mx-auto mb-space-2 h-10 w-auto" />
          <div className="mb-1 text-center text-size-4 font-semibold text-primary">Vendor Portal</div>
          <div className="mb-space-3 text-center text-size-4 text-muted-foreground">
            Sign in to manage your vendor profile
          </div>

          {error && (
            <div className="mb-space-2 rounded-md bg-destructive-bg px-3 py-2 text-size-4 text-destructive">
              {error}
            </div>
          )}
          {devOtpHint && step === 2 && (
            <div className="mb-space-2 rounded-md bg-success-bg px-3 py-2 text-size-4 text-success">
              {devOtpHint}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleStep1} noValidate>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="mt-space-3 w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Please wait…' : 'Continue'}
              </Button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleStep2} noValidate>
              <Label htmlFor="otp">Enter the 6-digit code</Label>
              <Input
                id="otp"
                type="text"
                maxLength={6}
                inputMode="numeric"
                required
                autoFocus
                className="text-center font-heading text-size-2 tracking-[0.5em]"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
              />
              <p className="mt-1 text-size-5 text-muted-foreground">Code expires in a few minutes.</p>
              <Button type="submit" className="mt-space-3 w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Verifying…' : 'Verify & Sign In'}
              </Button>
              <Button type="button" variant="outline" className="mt-2 w-full" onClick={handleBack}>
                Back
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
