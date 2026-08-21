const TOKEN_KEY = 'vpms_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

interface FastApiValidationDetail {
  loc: (string | number)[]
  msg: string
}

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return 'Something went wrong. Please try again.'
  const detail = (data as { detail?: unknown }).detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return (detail as FastApiValidationDetail[])
      .map((entry) => {
        const field = Array.isArray(entry.loc) ? entry.loc[entry.loc.length - 1] : ''
        return field ? `${field}: ${entry.msg}` : entry.msg
      })
      .join('; ')
  }
  return 'Something went wrong. Please try again.'
}

/** 403 gets a fixed friendly message rather than surfacing whatever the API's detail
 * string says, matching the old static site's convention (api.js's friendlyMessage). */
export function friendlyMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "You don't have permission for this action."
    return err.message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

let onUnauthorized: (() => void) | null = null

/** AuthContext registers its own logout+redirect here once, at app startup, so
 * apiFetch can react to a 401 without importing React context into a plain module. */
export function registerUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (response.status === 401) {
    clearToken()
    onUnauthorized?.()
    throw new ApiError('Not authenticated.', 401, null)
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    throw new ApiError(extractErrorMessage(data), response.status, data)
  }

  return data as T
}

/** For endpoints that return a file (CSV export, KYC document view) rather than JSON. */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = getToken()
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(path, { headers })
  if (response.status === 401) {
    clearToken()
    onUnauthorized?.()
    throw new ApiError('Not authenticated.', 401, null)
  }
  if (!response.ok) {
    throw new ApiError('Could not load the file.', response.status, null)
  }
  return response.blob()
}

/** Opens an authenticated file endpoint (e.g. a KYC document) as a blob in a new tab —
 * a plain <a href> can't carry the Authorization header, so this fetches the blob first. */
export async function openAuthenticatedFile(path: string): Promise<void> {
  const blob = await apiFetchBlob(path)
  const blobUrl = URL.createObjectURL(blob)
  window.open(blobUrl, '_blank')
}
