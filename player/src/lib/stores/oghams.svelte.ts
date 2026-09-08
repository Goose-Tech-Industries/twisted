// Oghams — Celtic rune passives. Each character can socket up to N
// oghams to bend their stats / unlock unique abilities. Driven by REST.

import { api } from '$phoenix/api'

export interface OghamSetBonus {
  min_count?: number
  label?: string
  stat_bonus?: Record<string, number>
  element_attack?: string
  on_hit_status?: string
  on_hit_chance?: number
}

export interface Ogham {
  id: number
  key: string
  name: string
  glyph: string
  description: string
  lore?: string
  tier: number
  element_attack?: string | null
  on_hit_status?: string | null
  on_hit_chance?: number
  kills_to_rank_up?: number
  family_id?: number | null
  family_name?: string
  family_icon?: string
  set_bonus?: OghamSetBonus | null
  effects?: Record<string, number | string>
}

export interface OghamSlot {
  index: number
  ogham_id: number | null
  current_rank?: number
  kill_count?: number
}

interface ListResp { success: boolean; oghams?: Ogham[] }
interface SlotsResp { success: boolean; slots?: OghamSlot[]; max_slots?: number }
interface SimpleResp { success: boolean; message?: string }

function createOghamStore() {
  let library = $state<Ogham[]>([])
  let slots = $state<OghamSlot[]>([])
  let maxSlots = $state<number>(3)

  return {
    get library() { return library },
    get slots() { return slots },
    get maxSlots() { return maxSlots },

    async load(charId: number) {
      try {
        const [allRes, mineRes] = await Promise.all([
          api.get<ListResp>('/api/oghams'),
          api.get<SlotsResp>(`/api/oghams/${charId}`)
        ])
        library = allRes.oghams ?? []
        slots = mineRes.slots ?? []
        maxSlots = mineRes.max_slots ?? 3
      } catch { /* oghams endpoint optional */ }
    },

    async socket(slotIndex: number, oghamId: number | null) {
      const r = await api.post<SimpleResp>('/api/oghams/socket', { slotIndex, oghamId })
      if (r.success) {
        slots = slots.map(s => s.index === slotIndex ? { ...s, ogham_id: oghamId } : s)
      }
      return r
    }
  }
}

export const oghams = createOghamStore()
