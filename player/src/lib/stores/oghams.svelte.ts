// Oghams — Celtic rune passives. Each character can socket up to N
// oghams to bend their stats / unlock unique abilities. Driven by REST.

import { api } from '$phoenix/api'

export interface Ogham {
  id: number
  key: string
  name: string
  glyph: string
  description: string
  tier: number
  effects?: Record<string, number | string>
}

export interface OghamSlot {
  index: number
  ogham_id: number | null
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
