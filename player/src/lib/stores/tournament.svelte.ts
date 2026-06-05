// Tournament + arena queue. Phoenix exposes match queue actions on the
// battle:lobby channel; REST exposes scheduled tournaments.

import { api } from '$phoenix/api'

export interface Tournament {
  id: number
  name: string
  format: string
  starts_at: string
  prize_pool?: string
  participants?: number
  max_participants?: number
  status: 'upcoming' | 'open' | 'running' | 'finished'
}

interface ListResp { success: boolean; tournaments?: Tournament[] }
interface SimpleResp { success: boolean; message?: string }

function createTournamentStore() {
  let list = $state<Tournament[]>([])
  let queued = $state<string | null>(null)
  let queueWait = $state<number>(0) // seconds in queue

  return {
    get list() { return list },
    get queued() { return queued },
    get queueWait() { return queueWait },

    async load() {
      try {
        const r = await api.get<ListResp>('/api/tournaments')
        list = r.tournaments ?? []
      } catch { /* tournament endpoint not always present */ }
    },

    setQueued(format: string | null) {
      queued = format
      queueWait = 0
    },

    tickWait(sec: number) { queueWait = sec }
  }
}

export const tournament = createTournamentStore()
