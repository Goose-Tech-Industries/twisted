// Thin REST helper for Phoenix /api endpoints. Mirrors the Phoenix
// router's surface (routes documented in te_phoenix/lib/te_phoenix_web/router.ex).

import { browser } from '$app/environment'

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
    this.name = 'ApiError'
  }
}

const TOKEN_KEY = 'twisted:phx-token'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body) headers['content-type'] = 'application/json'

  // Attach Bearer token whenever we have one. The server prefers the
  // signed session cookie but falls back to the bearer — without this,
  // a stale cookie (e.g. after a Phoenix restart) makes /api/auth/me
  // return success:false and the auth store logs the user out even
  // though their socket token is still valid.
  if (browser) {
    const t = localStorage.getItem(TOKEN_KEY)
    if (t) headers['authorization'] = `Bearer ${t}`
  }

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await res.text()
  const parsed = text ? safeJson(text) : null

  if (!res.ok) {
    const msg = (parsed && typeof parsed === 'object' && 'error' in parsed && typeof parsed.error === 'string')
      ? parsed.error
      : res.statusText
    throw new ApiError(res.status, msg, parsed)
  }

  return parsed as T
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return text }
}

export const api = {
  get:    <T = unknown>(p: string)              => request<T>('GET', p),
  post:   <T = unknown>(p: string, b?: unknown) => request<T>('POST', p, b),
  put:    <T = unknown>(p: string, b?: unknown) => request<T>('PUT', p, b),
  delete: <T = unknown>(p: string)              => request<T>('DELETE', p)
}
