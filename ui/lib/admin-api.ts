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
    if (!res.ok) return { success: false, message: `Server error (${res.status})` }
    const json = await res.json()
    if (json.success && !json.data) {
      const { success, message, error, ...rest } = json
      if (Object.keys(rest).length > 0) return { success, message, error, data: rest as T }
    }
    return json
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

async function adminGet<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${ADMIN_API_BASE}${endpoint}`, {
      credentials: 'include'
    })
    if (!res.ok) return { success: false, message: `Server error (${res.status})` }
    const json = await res.json()
    // Normalize: backend often returns fields at top level instead of under `data`
    if (json.success && !json.data) {
      const { success, message, error, ...rest } = json
      return { success, message, error, data: rest as T }
    }
    return json
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
  // ── Ability Scores ─────────────────────────────────────────────
  | 'ability_score'     // AbilityScorePanel    → game_ability_scores
  | 'ability_effect'    // AbilityEffectPanel   → game_ability_effects
  | 'race_ability_bonus'// RaceAbilityBonusPanel→ game_race_ability_bonuses
  | 'class_ability_bonus'// ClassAbilityBonusPanel→ game_class_ability_bonuses
  | 'bg_ability_bonus'  // BgAbilityBonusPanel  → game_background_ability_bonuses
  | 'race_class_access' // RaceClassAccessPanel → game_race_class_access
  // ── World Features ─────────────────────────────────────────────
  | 'region_weather'   // RegionWeatherPanel   → game_region_weather
  | 'npc_patrol'       // NpcPatrolPanel       → game_npc_patrols
  | 'world_event'      // WorldEventPanel      → game_world_events
  | 'spawn_wave'       // SpawnWavePanel       → game_spawn_waves
  | 'region_rep_gate'  // RegionRepGatePanel   → game_region_rep_gates
  | 'script'           // DialogueBuilderPanel → game_scripts
  | 'item_set'         // ItemSetPanel         → game_item_sets
  | 'npc_schedule'     // NpcSchedulePanel     → game_npc_schedules
  | 'enemy_scaling'    // EnemyScalingPanel    → game_enemy_scaling
  | 'subclass'         // SubclassPanel        → game_subclasses
  | 'racial_ability'   // RacialAbilityPanel   → game_racial_abilities
  | 'class_mastery'    // ClassMasteryPanel    → game_class_mastery
  | 'stat_cap'         // StatCapPanel         → game_stat_caps
  | 'title'            // TitlePanel           → game_titles
  | 'char_transform'   // CharTransformPanel   → character_transformations
  | 'arena_match'      // ArenaMatchPanel      → game_arena_matches
  | 'arena_ranking'    // ArenaRankingPanel    → game_arena_rankings
  | 'combo_chain'      // ComboChainPanel      → game_combo_chains
  | 'summon'           // SummonPanel          → game_summons
  | 'battle_replay'    // BattleReplayPanel    → game_battle_replays
  | 'arena_season'     // ArenaSeasonPanel     → game_arena_seasons
  | 'map_hazard'       // MapHazardPanel       → game_map_hazards
  | 'status_immunity'  // StatusImmunityPanel  → game_status_immunities
  | 'battle_template'  // BattleTemplatePanel  → game_battle_templates
  | 'staff_activity'   // StaffActivityPanel   → staff_activity_log
  | 'shift_note'       // ShiftNotePanel       → staff_shift_notes
  | 'auto_mod_rule'    // AutoModPanel         → game_auto_mod_rules
  | 'player_warning'   // WarningPanel         → player_warnings
  | 'staff_perm'       // StaffPermPanel       → staff_permissions
  | 'broadcast_tmpl'   // BroadcastTmplPanel   → staff_broadcast_templates
  | 'player_appeal'    // AppealPanel          → player_appeals
  | 'staff_audit'      // StaffAuditPanel      → staff_audit_log
  | 'config_snapshot'  // ConfigSnapshotPanel  → game_config_snapshots
  | 'config_profile'   // ConfigProfilePanel  → game_config_profiles
  | 'settings_log'     // SettingsLogPanel    → settings_change_log
  | 'ogham_awakening'  // OghamAwakeningPanel  → game_ogham_awakenings
  | 'spell_tome'       // SpellTomePanel       → game_spell_tomes
  | 'elem_affinity'    // ElemAffinityPanel    → game_elemental_affinities
  | 'item_curse'       // ItemCursePanel       → game_item_curses
  | 'ogham_fusion'     // OghamFusionPanel     → game_ogham_fusions
  | 'ogham_shard'      // OghamShardPanel      → game_ogham_shards
  | 'shard_recipe'     // ShardRecipePanel     → game_shard_recipes
  | 'corruption_tier'  // CorruptionTierPanel  → game_ogham_corruption_tiers
  | 'magic_school'     // MagicSchoolPanel     → game_magic_schools
  | 'enchantment'      // EnchantmentPanel     → game_enchantments
  | 'ritual'           // RitualPanel          → game_rituals
  | 'magic_resist'     // MagicResistPanel     → game_magic_resistances
  | 'artifact_rivalry' // ArtifactRivalryPanel → game_artifact_rivalries
  | 'ki_move'          // KiMovePanel          → game_ki_moves
  | 'fusion'           // FusionPanel          → game_fusions
  | 'battle_terrain'   // BattleTerrainPanel   → game_battle_terrain
  | 'battle_item'      // BattleItemPanel      → game_battle_items
  | 'finishing_move'   // FinishingMovePanel   → game_finishing_moves
  | 'battle_condition' // BattleConditionPanel → game_battle_conditions
  | 'combo_chain'      // ComboChainPanel      → game_combo_chains
  | 'summon'           // SummonPanel          → game_summons
  | 'battle_replay'    // BattleReplayPanel    → game_battle_replays
  | 'arena_season'     // ArenaSeasonPanel     → game_arena_seasons
  | 'map_hazard'       // MapHazardPanel       → game_map_hazards
  | 'status_immunity'  // StatusImmunityPanel  → game_status_immunities

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
    async ban(userId: number, reason: string) { return adminPost(`/admin-panel/player/${userId}/ban`, { reason }) },
    async unban(userId: number) { return adminPost(`/admin-panel/player/${userId}/unban`, {}) },
    async setRole(userId: number, role: string) { return adminPost(`/admin-panel/player/${userId}/role`, { role }) },
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
        totalGold: number; avgGold: number; maxGold: number
        richest: Array<{ id: number; username: string; gold: number; role?: string }>
        distribution: { broke: number; poor: number; modest: number; comfortable: number; wealthy: number; rich: number; total_users: number }
        levelGoldTable?: Array<{ level: number; gold_for_win: number }>
        recentGoldEvents?: unknown[]
      }>('/admin-panel/economy')
    }
  }
}

export default adminApi
