import { api } from '$phoenix/api'

export interface WorldEvent {
  id: number
  name: string
  description?: string
  icon?: string
  starts_at?: string
  expires_at: string
  /** 0..n — server tracks how many phases have completed. */
  current_phase?: number
  total_phases?: number
  am_participating?: boolean
  participant_count?: number
  rewards_json?: string
  stat_modifiers?: string
  phases_json?: string
  lore_text?: string
}

interface ActiveResp { success: boolean; events?: WorldEvent[] }
interface SimpleResp { success: boolean; message?: string }

function createWorldEventsStore() {
  let active = $state<WorldEvent[]>([])
  let history = $state<WorldEvent[]>([])
  let scheduled = $state<WorldEvent[]>([])

  return {
    get active() { return active },
    get history() { return history },
    get scheduled() { return scheduled },

    async loadActive() {
      try {
        const r = await api.get<ActiveResp>('/api/world-events/active')
        active = r.events ?? []
      } catch { active = [] }
    },

    setActive(events: WorldEvent[]) { active = events ?? [] },
    setHistory(events: WorldEvent[]) { history = events ?? [] },
    setScheduled(events: WorldEvent[]) { scheduled = events ?? [] },

    async join(eventId: number) {
      const r = await api.post<SimpleResp>('/api/world-events/join', { eventId })
      if (r.success) await this.loadActive()
      return r
    }
  }
}

export const worldEvents = createWorldEventsStore()
