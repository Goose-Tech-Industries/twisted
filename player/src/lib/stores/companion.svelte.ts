import { api } from '$phoenix/api'

export interface Companion {
  id: number
  name: string
  species?: string
  level: number
  current_hp: number
  max_hp: number
  affinity?: number
  active?: boolean
  icon?: string
  tactic?: 'aggressive' | 'defensive' | 'support' | 'passive'
}

interface ListResp { success: boolean; companions?: Companion[] }

function createCompanionStore() {
  let companions = $state<Companion[]>([])
  let active = $state<Companion | null>(null)
  let lastCharId = $state<number>(0)

  return {
    get companions() { return companions },
    get active() { return active },
    get activeSquad() { return companions.filter(c => c.active) },

    async load(charId: number) {
      if (charId) lastCharId = charId
      try {
        const r = await api.get<ListResp>(`/api/companions/${charId}`)
        companions = r.companions ?? []
        active = companions.find(c => c.active) ?? null
      } catch { /* endpoint optional */ }
    },

    setActive(c: Companion | null) { active = c },

    async toggleActive(id: number, on: boolean) {
      const r = await api.post<{ success: boolean; message?: string }>(
        `/api/companions/${id}/active`,
        { active: on }
      )
      if (r.success) {
        companions = companions.map(c => c.id === id ? { ...c, active: on } : c)
        active = companions.find(c => c.active) ?? null
        if (lastCharId) await this.load(lastCharId)
      }
      return r
    },

    async setTactic(id: number, tactic: Companion['tactic']) {
      const r = await api.post<{ success: boolean; message?: string }>(
        `/api/companions/${id}/tactic`,
        { tactic: (tactic ?? 'balanced').toUpperCase() }
      )
      if (r.success) {
        companions = companions.map(c => c.id === id ? { ...c, tactic } : c)
        if (active?.id === id) active = { ...active, tactic }
      }
      return r
    },

    patch(id: number, delta: Partial<Companion>) {
      companions = companions.map(c => c.id === id ? { ...c, ...delta } : c)
      if (active?.id === id) active = { ...active, ...delta }
    }
  }
}

export const companion = createCompanionStore()
