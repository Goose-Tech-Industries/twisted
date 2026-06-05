// Auth store — current user + session token. Drives the Phoenix
// connection: when auth lands, we connect; when it clears, we disconnect.
//
// Phoenix REST contract (te_phoenix_web/controllers/auth_controller.ex):
//   POST /api/auth/login     → { success, username, role, token, dailyReward }
//   POST /api/auth/register  → { success, message } (server stores session, no token)
//   GET  /api/auth/me        → { success, username, role, chatColor, charId }
//   POST /api/auth/logout    → { success }

import { browser } from '$app/environment'
import { api, ApiError } from '$phoenix/api'
import { connection } from '$phoenix/connection.svelte'

export interface User {
  username: string
  role: string
  chatColor?: string | null
  /** Most-recent character id (from /api/auth/me). May be null for new accounts. */
  defaultCharId?: number | null
}

export interface DailyReward {
  gold: number
  streak: number
  bonus: boolean
  message: string
}

const TOKEN_KEY = 'twisted:phx-token'

interface LoginResp {
  success: boolean
  message?: string
  username?: string
  role?: string
  token?: string
  dailyReward?: DailyReward | null
}

interface MeResp {
  success: boolean
  username?: string
  role?: string
  chatColor?: string | null
  charId?: number | null
  /** Fresh socket token, issued on every /me hit so a stale
   * localStorage token gets replaced as soon as the user re-opens
   * the app. */
  token?: string
}

interface RegisterResp {
  success: boolean
  message?: string
}

function loadToken(): string | null {
  if (!browser) return null
  return localStorage.getItem(TOKEN_KEY)
}

function saveToken(t: string | null) {
  if (!browser) return
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

function createAuthStore() {
  let user = $state<User | null>(null)
  let token = $state<string | null>(loadToken())
  let dailyReward = $state<DailyReward | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)
  // restore() may be called from both the layout's onMount AND from
  // child page boot (Svelte runs child onMount before parent). Hold the
  // in-flight promise so concurrent callers all await the same /me call
  // — avoids one resolver clearing the token while the other was happy.
  let restorePromise: Promise<void> | null = null

  function applyLogin(r: LoginResp, mePayload?: MeResp) {
    user = {
      username: r.username || mePayload?.username || '',
      role: r.role || mePayload?.role || 'PLAYER',
      chatColor: mePayload?.chatColor ?? null,
      defaultCharId: mePayload?.charId ?? null
    }
    if (r.token) {
      token = r.token
      saveToken(r.token)
      // The Phoenix socket only needs the token; user id lives inside it.
      connection.connect(r.token, 0)
    }
    dailyReward = r.dailyReward ?? null
  }

  return {
    get user() { return user },
    get token() { return token },
    get dailyReward() { return dailyReward },
    get loading() { return loading },
    get error() { return error },
    get isAuthed() { return !!user && !!token },

    async login(username: string, password: string) {
      loading = true
      error = null
      try {
        const r = await api.post<LoginResp>('/api/auth/login', { username, password })
        if (!r.success) {
          error = r.message ?? 'Login failed'
          throw new Error(error)
        }
        // Pull /me to get charId for default-char auto-pick.
        let me: MeResp | undefined
        try { me = await api.get<MeResp>('/api/auth/me') } catch { /* non-fatal */ }
        applyLogin(r, me)
      } catch (e) {
        if (!error) error = e instanceof ApiError ? e.message : 'Login failed'
        throw e
      } finally {
        loading = false
      }
    },

    async register(username: string, password: string, email?: string) {
      loading = true
      error = null
      try {
        const r = await api.post<RegisterResp>('/api/auth/register', {
          username, password, email
        })
        if (!r.success) {
          error = r.message ?? 'Registration failed'
          throw new Error(error)
        }
        // Phoenix register doesn't return a token — log in to obtain one.
        await this.login(username, password)
      } catch (e) {
        if (!error) error = e instanceof ApiError ? e.message : 'Registration failed'
        throw e
      } finally {
        loading = false
      }
    },

    async logout() {
      try { await api.post('/api/auth/logout') } catch { /* ignore */ }
      user = null
      token = null
      dailyReward = null
      saveToken(null)
      connection.disconnect()
    },

    /** Restore session from stored token (called from layout onMount
     * AND defensively from child page onMount). Idempotent — concurrent
     * calls share the same in-flight promise.
     * /me also returns a fresh socket token, so we always connect with
     * a valid one even if the cached token was stale. */
    async restore() {
      if (!token) return
      if (restorePromise) return restorePromise
      loading = true
      restorePromise = (async () => {
        try {
          const me = await api.get<MeResp>('/api/auth/me')
          if (!me.success) throw new Error('expired')
          user = {
            username: me.username || '',
            role: me.role || 'PLAYER',
            chatColor: me.chatColor ?? null,
            defaultCharId: me.charId ?? null
          }
          // Prefer the fresh token from /me; fall back to the cached one
          // if Phoenix hasn't been redeployed with the token-on-/me fix
          // yet. Either way we attempt the socket connect so the user
          // can see whether the cached token still works.
          const useToken = me.token ?? token
          if (me.token && me.token !== token) {
            token = me.token
            saveToken(me.token)
          }
          if (useToken) connection.connect(useToken, 0)
        } catch {
          token = null
          saveToken(null)
        } finally {
          loading = false
          restorePromise = null
        }
      })()
      return restorePromise
    },

    dismissDailyReward() { dailyReward = null }
  }
}

export const auth = createAuthStore()
