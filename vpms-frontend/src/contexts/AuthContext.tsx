import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { apiFetch, clearToken, getToken, registerUnauthorizedHandler, setToken } from '@/lib/api-client'
import type { User } from '@/lib/types'

interface VendorLoginStep1Result {
  preAuthToken: string
  otpCodeDevOnly: string
  expiresInSeconds: number
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  /** Internal staff login (Phase 0) — no OTP step. */
  login: (email: string, password: string) => Promise<void>
  /** Vendor portal login step 1 (Phase 2B) — password only, issues a pre-auth token + OTP. */
  vendorLoginStep1: (email: string, password: string) => Promise<VendorLoginStep1Result>
  /** Vendor portal login step 2 — OTP verification, issues the real access token. */
  vendorVerifyOtp: (preAuthToken: string, code: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function loadCurrentUser() {
    if (!getToken()) {
      setUser(null)
      setIsLoading(false)
      return
    }
    try {
      const me = await apiFetch<User>('/api/v1/users/me')
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    registerUnauthorizedHandler(() => {
      setUser(null)
      queryClient.clear()
      navigate('/login', { replace: true })
    })
    void loadCurrentUser()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email: string, password: string) {
    const result = await apiFetch<{ access_token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setToken(result.access_token)
    await loadCurrentUser()
  }

  async function vendorLoginStep1(email: string, password: string): Promise<VendorLoginStep1Result> {
    const result = await apiFetch<{
      pre_auth_token: string
      otp_code_dev_only: string
      expires_in_seconds: number
    }>('/api/v1/vendor-portal/auth/login-step1', {
      method: 'POST',
      body: { email, password },
    })
    return {
      preAuthToken: result.pre_auth_token,
      otpCodeDevOnly: result.otp_code_dev_only,
      expiresInSeconds: result.expires_in_seconds,
    }
  }

  async function vendorVerifyOtp(preAuthToken: string, code: string) {
    const result = await apiFetch<{ access_token: string }>('/api/v1/vendor-portal/auth/verify-otp', {
      method: 'POST',
      body: { pre_auth_token: preAuthToken, code },
    })
    setToken(result.access_token)
    await loadCurrentUser()
  }

  function logout() {
    clearToken()
    setUser(null)
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, vendorLoginStep1, vendorVerifyOtp, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
