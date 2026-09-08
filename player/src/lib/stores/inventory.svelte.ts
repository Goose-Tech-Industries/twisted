// Inventory + equipment store. REST-loaded, channel-mutated.
//
// Phoenix REST contract (te_phoenix_web/controllers/game_controller.ex):
//   GET /api/inventory/:char_id  → { success, items: [...] }
//   GET /api/equipment/:char_id  → { success, equipment: [...] }
// Channel mutations: equip_result, inventory_changed, etc.

import { api } from '$phoenix/api'

export interface Item {
  id: number
  name: string
  description?: string
  icon?: string
  type: string
  rarity: string
  bonus_atk?: number
  bonus_def?: number
  bonus_hp?: number
  buy_price?: number
  qty?: number
  inventory_id?: number
  sprite_url?: string
}

export type EquipSlot =
  | 'helmet' | 'face' | 'amulet' | 'shoulders' | 'cloak'
  | 'chest' | 'gloves' | 'belt' | 'weapon' | 'offhand'
  | 'ring1' | 'ring2' | 'trinket' | 'boots'

export type Equipment = Partial<Record<EquipSlot, Item | null>>

interface ItemsResp {
  success: boolean
  items?: Item[]
  message?: string
}

interface EquipmentResp {
  success: boolean
  equipment?: Array<{ slot: EquipSlot; item: Item }> | Equipment
  message?: string
}

function createInventoryStore() {
  let items = $state<Item[]>([])
  let equipment = $state<Equipment>({})
  let gold = $state<number>(0)

  function normalizeEquipment(raw: EquipmentResp['equipment']): Equipment {
    if (!raw) return {}
    if (Array.isArray(raw)) {
      const eq: Equipment = {}
      for (const e of raw) eq[e.slot] = e.item
      return eq
    }
    return raw
  }

  return {
    get items() { return items },
    get equipment() { return equipment },
    get gold() { return gold },

    async load(charId: number) {
      const [inv, eq] = await Promise.all([
        api.get<ItemsResp>(`/api/inventory/${charId}`).catch(() => ({ success: false })),
        api.get<EquipmentResp>(`/api/equipment/${charId}`).catch(() => ({ success: false }))
      ])
      if ('items' in inv && inv.items) items = inv.items
      if ('equipment' in eq) equipment = normalizeEquipment(eq.equipment)
    },

    setItems(next: Item[]) { items = next },
    setEquipment(next: EquipmentResp['equipment']) { equipment = normalizeEquipment(next) },
    setGold(n: number) { gold = n },

    add(item: Item) {
      const existing = items.find(i => i.id === item.id)
      if (existing) {
        items = items.map(i => i.id === item.id
          ? { ...i, qty: (i.qty ?? 1) + (item.qty ?? 1) }
          : i
        )
      } else {
        items = [...items, item]
      }
    },

    remove(itemId: number, qty = 1) {
      const next: Item[] = []
      for (const i of items) {
        if (i.id !== itemId) { next.push(i); continue }
        const remaining = (i.qty ?? 1) - qty
        if (remaining > 0) next.push({ ...i, qty: remaining })
      }
      items = next
    },

    equip(slot: EquipSlot, item: Item | null) {
      equipment = { ...equipment, [slot]: item }
    },

    clear() {
      items = []
      equipment = {}
      gold = 0
    }
  }
}

export const inventory = createInventoryStore()
