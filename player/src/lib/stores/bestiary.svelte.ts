import { api } from '$phoenix/api'

export interface BestiaryEntry {
  id: number
  name: string
  icon?: string
  description?: string
  tier?: number
  habitat?: string
  weakness?: string[]
  resistances?: string[]
  defeated_count?: number
  /** Server tracks discovery — only revealed entries show full stats. */
  discovered?: boolean
}

interface ListResp { success: boolean; bestiary?: BestiaryEntry[] }

function createBestiaryStore() {
  let entries = $state<BestiaryEntry[]>([])

  return {
    get entries() { return entries },
    get discoveredCount() { return entries.filter(e => e.discovered).length },

    async load(charId: number) {
      try {
        const r = await api.get<ListResp>(`/api/bestiary/${charId}`)
        entries = r.bestiary ?? []
      } catch { entries = [] }
    }
  }
}

export const bestiary = createBestiaryStore()
