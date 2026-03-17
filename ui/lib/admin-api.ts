// =================================================================
// ADMIN API CLIENT
// Base URL from NEXT_PUBLIC_API_URL — never localStorage.
// All requests use credentials:'include' for session-cookie auth.
// =================================================================

const ADMIN_API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  error?: string
  data?: T
}

async function adminPost<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    })
    return await res.json()
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

async function adminGet<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
      credentials: 'include'
    })
    return await res.json()
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

export type EntityType =
  // ── original ──────────────────────────────────────────────────
  | 'item' | 'skill' | 'npc' | 'map' | 'quest' | 'class' | 'race'
  | 'ogham' | 'ogham_family' | 'shop' | 'arena' | 'artifact'
  | 'status' | 'feat' | 'loot_table' | 'spawn' | 'battle_cmd' | 'background'
  // ── added for React admin panels ──────────────────────────────
  | 'stat'           // StatEnginePanel  → game_stat_definitions
  | 'shop_supply'    // ShopSupplyPanel  → shop_supplies
  | 'artifact_power' // ArtifactManagerPanel → artifact_powers
  | 'quest_board'    // QuestBoardPanel  → game_quest_board
  | 'region'          // RegionManagerPanel → game_regions
  | 'faction'         // WorldStatePanel    → game_factions
  | 'scheduled_task'  // SchedulerPanel     → game_scheduled_tasks
  | 'craft_recipe'    // CraftManagerPanel  → game_craft_recipes
  | 'auction_listing' // AuctionPanel       → auction_listings
  | 'limit'           // LimitBreakPanel    → game_limit_breaks

export const adminApi = {
  dashboard: {
    async getStats() {
      return adminGet<{
        stats: { users: number; chars: number; maps: number; npcs: number; items: number; battles: number }
        online: number
        onlineList: Array<{ name: string; level: number; mapId: number; mapName?: string }>
        recentUsers: Array<{ username: string; role: string; is_banned: boolean; last_login: string; created_at: string }>
        topChars: Array<{ name: string; level: number; username: string }>
        totalGold: number
        aiProvider: string
        mapPop: Record<string, number>
        signupTrend: Array<{ day: string; n: number }>
        streakStats: { avg_streak: number; max_streak: number; streak_players: number }
        openReports: number | null
        battlesToday: number | null
        tutorialRate: number
      }>('/admin-panel/dashboard')
    }
  },

  entity: {
    async getAll<T = unknown>(type: EntityType): Promise<ApiResponse<T[]>> {
      return adminGet<T[]>(`/admin-panel/${type}`)
    },
    async get<T = unknown>(type: EntityType, id: number): Promise<ApiResponse<T>> {
      return adminGet<T>(`/admin-panel/${type}/${id}`)
    },
    async save<T = unknown>(type: EntityType, data: Record<string, unknown>, id?: number): Promise<ApiResponse<T>> {
      return adminPost<T>(`/admin-panel/${type}${id ? `/${id}` : ''}`, data)
    },
    async delete(type: EntityType, id: number): Promise<ApiResponse<void>> {
      return adminPost<void>(`/admin-panel/${type}/${id}/delete`, {})
    }
  },

  players: {
    async getAll() {
      return adminGet<Array<{
        id: number; username: string; role: string; is_banned: boolean; last_login: string
        characters: Array<{ id: number; name: string; level: number; class_name: string }>
      }>>('/admin-panel/players')
    },
    async ban(userId: number, reason: string) { return adminPost('/admin-panel/player/ban', { userId, reason }) },
    async unban(userId: number) { return adminPost('/admin-panel/player/unban', { userId }) },
    async setRole(userId: number, role: string) { return adminPost('/admin-panel/player/role', { userId, role }) },
    async kick(charId: number, reason: string) { return adminPost('/admin-panel/player/kick', { charId, reason }) },
    async teleport(charId: number, mapId: number, x: number, y: number) {
      return adminPost('/admin-panel/player/teleport', { charId, mapId, x, y })
    },
    async giveItem(charId: number, itemId: number, quantity: number) {
      return adminPost('/admin-panel/player/give-item', { charId, itemId, quantity })
    },
    async giveGold(charId: number, amount: number) {
      return adminPost('/admin-panel/player/give-gold', { charId, amount })
    },
    async setLevel(charId: number, level: number) {
      return adminPost('/admin-panel/player/set-level', { charId, level })
    }
  },

  gm: {
    async announce(message: string, style: 'info' | 'warning' | 'danger') {
      return adminPost('/admin-panel/server-announce', { message, style })
    },
    async mapBroadcast(mapId: number, message: string) {
      return adminPost('/admin-panel/broadcast-map', { mapId, message })
    },
    async chatBroadcast(message: string, channel: string) {
      return adminPost('/admin-panel/broadcast', { message, channel })
    },
    async worldEvent(eventType: string, payload: Record<string, unknown>) {
      return adminPost('/admin-panel/world-event', { eventType, payload })
    }
  },

  settings: {
    async get() { return adminGet<Record<string, unknown>>('/admin-panel/settings') },
    async update(settings: Record<string, unknown>) { return adminPost('/admin-panel/settings', settings) }
  },

  economy: {
    async getStats() {
      return adminGet<{
        totalGold: number; goldPerPlayer: number
        topRichest: Array<{ name: string; gold: number }>
        itemDistribution: Record<string, number>
      }>('/admin-panel/economy')
    }
  }
}

export default adminApi
