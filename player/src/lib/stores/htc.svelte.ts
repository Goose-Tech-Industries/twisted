// Hyperbolic Training Chamber — accelerated training session.
// Phoenix exposes /api/htc REST + game channel events for tick updates.

import { api } from '$phoenix/api'

export interface HtcSession {
  id: number
  charId: number
  started_at: string
  ends_at: string
  multiplier: number
  remaining_secs: number
  tick_xp?: number
  tick_stat_gain?: Record<string, number>
}

export interface HtcConfig {
  costs: Array<{ tier: string; gold: number; multiplier: number; duration_secs: number }>
}

interface SessionResp { success: boolean; session?: HtcSession | null }
interface ConfigResp { success: boolean; config?: HtcConfig }
interface SimpleResp { success: boolean; message?: string }

function createHtcStore() {
  let session = $state<HtcSession | null>(null)
  let config = $state<HtcConfig | null>(null)

  return {
    get session() { return session },
    get config() { return config },
    get isTraining() { return session !== null },

    async load(charId: number) {
      try {
        const [sRes, cRes] = await Promise.all([
          api.get<SessionResp>(`/api/htc/${charId}`),
          api.get<ConfigResp>('/api/htc/config')
        ])
        session = sRes.session ?? null
        config = cRes.config ?? null
      } catch { /* htc endpoints optional */ }
    },

    async start(tier: string) {
      const r = await api.post<SessionResp & SimpleResp>('/api/htc/start', { tier })
      if (r.success && r.session) session = r.session
      return r
    },

    async stop() {
      const r = await api.post<SimpleResp>('/api/htc/stop', {})
      if (r.success) session = null
      return r
    },

    /** Phoenix push handler — server ticks the remaining time. */
    tick(remaining: number) {
      if (!session) return
      session = { ...session, remaining_secs: remaining }
    }
  }
}

export const htc = createHtcStore()
