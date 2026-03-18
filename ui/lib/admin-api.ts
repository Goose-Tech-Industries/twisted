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
  // ── Session 8: Limb Targeting / Combat Options ──────────────────
  | 'body_type'       // BodyTypePanel      → game_body_types
  | 'limb_zone'       // LimbZonePanel      → game_limb_zones
  | 'battle_knockout' // KO log             → game_battle_knockouts
  // ── Session 9: Flavor Text / Combo ──────────────────────────────
  | 'flavor_text'    // FlavorTextPanel    → game_flavor_texts
  | 'flavor_keyword' // FlavorKeywordPanel → game_flavor_keywords
  // ── Session 10: Ki Channeling / Bleed ───────────────────────────
  | 'bleed_tier'     // BleedTierPanel     → game_bleed_tiers
  // ── Session 11: Signature Techniques ────────────────────────────
  | 'sig_level'      // SigLevelPanel      → game_signature_levels
  | 'sig_ability'    // SigAbilityPanel    → game_signature_abilities
  | 'sig_tech'       // SigTechPanel       → character_signature_techs
  // ── Session 12: RP Engine ───────────────────────────────────────
  | 'narration'      // NarrationPanel     → game_battle_narrations
  | 'premade_sig'    // PremadeSigTechPanel→ game_premade_sig_techs
  | 'training_log'   // TrainingLogPanel   → game_master_training_log
  // ── Session 13: Fighting Styles ─────────────────────────────────
  | 'fighting_style' // FightingStylePanel → game_fighting_styles
  | 'style_rank'     // StyleRankPanel     → game_fighting_style_ranks
  | 'char_style'     // CharStylePanel     → character_fighting_styles
  // ── Session 14: Tournaments ─────────────────────────────────────
  | 'tournament'     // TournamentPanel    → game_tournaments
  | 'tourney_match'  // TourneyMatchPanel  → game_tournament_matches
  | 'tourney_history'// TourneyHistoryPanel→ game_tournament_history
  // ── Session 16: Boss Phases / Win Conditions ────────────────────
  // ── Session 23: Final Systems ─────────────────────────────────
  // ── Session 24: Alignment + Battle Rules ──────────────────────
  // ── Session 25: Training ──────────────────────────────────────
  | 'terminology'    // TerminologyPanel   → game_terminology
  | 'training_config'// TrainingConfigPanel→ game_training_config
  | 'alignment_tier' // AlignmentTierPanel → game_alignment_tiers
  | 'alignment_action'// AlignmentActionPanel→ game_alignment_actions
  | 'battle_rule'    // BattleRulePanel    → game_battle_rules
  | 'elem_reaction'  // ElementReactionPanel→ game_elemental_reactions
  | 'status_combo'   // StatusComboPanel   → game_status_combos
  | 'afterlife'      // AfterlifePanel     → game_afterlife_worlds
  | 'death_penalty'  // DeathPenaltyPanel  → game_death_penalties
  | 'transformation' // TransformPanel     → game_transformations
  | 'link_attack'    // LinkAttackPanel    → game_link_attacks
  | 'trap'           // TrapPanel          → game_battle_traps
  | 'weather'        // WeatherPanel       → game_weather_effects
  | 'boss_phase'     // BossPhasePanel     → game_boss_phases
  | 'win_condition'  // WinConditionPanel  → game_win_conditions
  | 'quest_battle_override' // QuestBattleOverridePanel → game_quest_battle_overrides

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
