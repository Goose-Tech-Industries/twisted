// =================================================================
// GAME API CLIENT — Wires into Twisted Engine backend
// All fetch calls use credentials:'include' for session-cookie auth.
// Base URL comes from NEXT_PUBLIC_API_URL env var (never localStorage).
// =================================================================

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  error?: string
  data?: T
}

async function post<T = unknown>(endpoint: string, body: Record<string, unknown> = {}): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

async function get<T = unknown>(endpoint: string): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'GET',
      credentials: 'include'
    })
    return await res.json()
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

// =================================================================
// AUTH API
// =================================================================
export const authApi = {
  async login(username: string, password: string) {
    // TEACHING: The backend returns { success, username, role, dailyReward } at the top
    // level — not nested under a "data" key.  We normalise here so the rest of the
    // app can always do  res.data.username  without caring about the wire format.
    const raw = await post<{
      username?: string
      role?: string
      dailyReward?: {
        gold: number; streak: number; bonus: boolean; message: string
      } | null
    }>('/auth/login', { username, password })

    if (raw.success && !raw.data) {
      const r = raw as unknown as Record<string, unknown>
      return {
        ...raw,
        data: {
          username: (r.username as string) ?? username,
          role:     (r.role     as string) ?? 'PLAYER',
          dailyReward: (r.dailyReward as typeof raw.data extends undefined ? never : typeof raw.data) ?? null,
        },
      }
    }
    return raw
  },

  async register(username: string, email: string, password: string, characterName: string) {
    return post<{ userId: number }>('/auth/register', {
      username,
      email,
      password,
      charName: characterName,
    })
  },
  async logout() {
    return post('/auth/logout')
  },
  async me() {
    return get<{ username: string; role: string; charId?: number | null }>('/auth/me')
  },
  async checkField(field: 'username' | 'email', value: string) {
    return post<{ taken: boolean }>('/auth/check-field', { field, value })
  }
}

// =================================================================
// GAME API — Character, Maps, Inventory, Equipment
// =================================================================
export interface CharacterFull {
  character: {
    id: number; user_id: number; name: string; level: number
    current_hp: number; max_hp: number; current_mp: number; max_mp: number
    atk: number; def: number; mo: number; md: number; speed: number; luck: number
    experience: number; map_id: number; x: number; y: number; class_id: number
    class_name?: string; race_name?: string; bg_name?: string; feat_name?: string
    limitbreak?: number; breaklevel?: number
  }
  inventory: InventoryItem[]
  equipment: EquippedItem[]
  slots: EquipSlot[]
  gold: number
  skills: CharacterSkill[]
  limits: LimitBreak[]
  xpToNext: number | null
  xpCurrent: number
  unspentPoints: number
  battleRecord: { W: number; L: number; T: number }
  equipBonus: Record<string, number>
  effectiveStats: Record<string, number>
}

export interface InventoryItem {
  id: number; item_id: number; character_id: number; quantity: number
  name: string; icon: string; type: string; slot: string; description: string; value: number
  bonus_hp?: number; bonus_mp?: number; bonus_atk?: number; bonus_def?: number
  bonus_mo?: number; bonus_md?: number; bonus_speed?: number; bonus_luck?: number
  level_req?: number; elements?: string; set_status?: string
}

export interface EquippedItem extends InventoryItem { slot_key: string }
export interface EquipSlot { key_name: string; display_name: string; display_order: number }
export interface CharacterSkill {
  id: number; name: string; description: string; icon?: string
  mp_cost: number; target_type: string; element?: string; learn_level: number
}
export interface LimitBreak {
  id: number; name: string; description: string; power_mult: number; break_level: number
}
export interface GameMap {
  id: number; name: string; width: number; height: number
  tiles: number[][]; events: MapEvent[]; objects: MapObject[]; anims: MapAnim[]
  tileset_url: string; ambientDark: number
}
export interface MapEvent { x: number; y: number; type: string; data?: unknown }
export interface MapObject { x: number; y: number; type: string; sprite?: string }
export interface MapAnim { x: number; y: number; frames: string[] }

export const gameApi = {
  async getMyCharacters() {
    return post<{ characters: Array<{ id: number; name: string; level: number; class_name: string; race_name: string }> }>('/game/my-characters')
  },
  async getCharFull(charId: number) {
    return post<CharacterFull>('/game/get-char-full', { charId })
  },
  async createCharacter(data: { name: string; raceId: number; classId: number; backgroundId?: number; featId?: number }) {
    return post('/game/create-character', data)
  },
  async getCreationData() {
    return get<{
      config: Record<string, unknown>
      data: {
        classes: Array<{ id: number; name: string; description: string }>
        races: Array<{ id: number; name: string; description: string }>
        backgrounds: Array<{ id: number; name: string; description: string }>
        feats: Array<{ id: number; name: string; description: string }>
      }
    }>('/game/creation-data')
  },
  async getMap(mapId: number) {
    return post<{ map: GameMap }>('/game/get-map', { mapId })
  },
  async getAllMaps() {
    return post<{ maps: Array<{ id: number; name: string; description?: string; width: number; height: number; fast_travel_enabled?: number; min_level?: number }> }>('/game/get-all-maps')
  },
  async saveState(charId: number, state: Record<string, unknown>) {
    return post('/game/save-state', { charId, state })
  },
  async loadState(charId: number) {
    return post<{ state: Record<string, unknown> }>('/game/load-state', { charId })
  },
  async equipItem(charId: number, itemId: number, slotKey: string) {
    return post('/game/equip-item', { charId, itemId, slotKey })
  },
  async unequipItem(charId: number, slotKey: string) {
    return post('/game/unequip-item', { charId, slotKey })
  },
  async useItem(charId: number, itemId: number) {
    return post<{ newHp: number; newMp: number }>('/game/use-item', { charId, itemId })
  },
  async getShop(shopId: number) {
    return post<{ shop: { id: number; name: string }; supplies: Array<InventoryItem & { buy_price: number; sell_price: number; stock: number }> }>('/game/get-shop', { shopId })
  },
  async buyItem(charId: number, shopId: number, itemId: number, quantity: number = 1) {
    return post('/game/buy-item', { charId, shopId, itemId, quantity })
  },
  async sellItem(charId: number, itemId: number, quantity: number = 1) {
    return post('/game/sell-item', { charId, itemId, quantity })
  },
  async getMyOghams(charId: number) {
    return post<{ oghams: Array<{
      id: number; name: string; icon: string; description: string
      family_id: number; family_name: string; element_attack?: string
      on_hit_status?: string; on_hit_chance?: number; stat_bonus?: string; slotted: boolean
    }> }>('/game/my-oghams', { charId })
  },
  async getCharByName(name: string) {
    return post<{ charId?: number; name?: string; level?: number; class_name?: string }>('/game/get-char-by-name', { name })
  }
}

// =================================================================
// CODEX / BESTIARY API
// =================================================================
export type CodexCategory = 'creatures' | 'items' | 'lore' | 'locations' | 'oghams'

export interface CodexEntry {
  id: number
  category: CodexCategory
  name: string
  description: string
  discovered: boolean
  icon?: string
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  level?: number
  element?: string
  weakness?: string
  dropTable?: string[]
  region?: string
  minLevel?: number
  type?: string
  stats?: Record<string, number>
  chapter?: number
}

export interface CodexStats {
  category: CodexCategory
  total: number
  discovered: number
}

export const codexApi = {
  async getEntries(charId: number, category?: CodexCategory) {
    return post<{ entries: CodexEntry[] }>('/game/codex-entries', { charId, category })
  },
  async getStats(charId: number) {
    return post<{ stats: CodexStats[] }>('/game/codex-stats', { charId })
  }
}

// =================================================================
// CRAFTING API
// =================================================================
export interface CraftIngredient {
  item_id: number
  qty_needed: number
  qty_owned: number
}

export interface CraftRecipe {
  id: number
  name: string
  category: string
  result_item_id: number
  result_qty: number
  result_name: string
  result_icon: string
  result_type: string
  level_req: number
  skill_req?: string | null
  description?: string | null
  icon?: string
  ingredients: CraftIngredient[]
  canCraft: boolean
}

export const craftingApi = {
  async getRecipes(charId: number) {
    return post<{ recipes: CraftRecipe[]; itemNames: Record<string, { name: string; icon: string }> }>('/api/crafting/recipes', { charId })
  },
  async craft(charId: number, recipeId: number) {
    return post<{ message: string; resultItemId: number; resultQty: number }>('/api/crafting/craft', { charId, recipeId })
  },
  async learnRecipe(charId: number, recipeId: number) {
    return post<{ message: string }>('/api/crafting/learn', { charId, recipeId })
  }
}

// =================================================================
// ACHIEVEMENTS API
// =================================================================
export interface AchievementDef {
  id: number
  key_name: string
  title: string
  description: string
  icon: string
  category: string
  trigger_type: string
  trigger_value: number
  reward_gold: number
  reward_title: string | null
  is_hidden: number
  is_active: number
  sort_order: number
}

export interface EarnedAchievement extends AchievementDef {
  earned_at: string
}

export const achievementApi = {
  async getDefinitions() {
    return get<AchievementDef[]>('/api/achievements/definitions')
  },
  async getCharacterAchievements(charId: number) {
    return get<EarnedAchievement[]>(`/api/achievements/character/${charId}`)
  },
  async equipTitle(charId: number, title: string | null) {
    return post<{ title: string | null }>('/api/achievements/equip-title', { charId, title })
  }
}

// =================================================================
// LEADERBOARD API
// =================================================================
export interface LevelLeader {
  rank: number; charId: number; name: string; level: number; xp: number
  className: string; raceName?: string; guildName?: string | null
}
export interface PvpLeader {
  rank: number; charId: number; name: string; level: number
  className: string; guildName?: string | null
  wins: number; losses: number; ratio: string
}
export interface WealthLeader {
  rank: number; charId: number; name: string; level: number
  className: string; guildName?: string | null; gold: number
}
export interface GuildLeader {
  rank: number; guildId: number; name: string; tag: string
  memberCount: number; avgLevel: string; maxLevel: number; totalWins: number
}
export interface AllLeaderboards {
  level: LevelLeader[]; pvp: PvpLeader[]; wealth: WealthLeader[]; guilds: GuildLeader[]
}

export const leaderboardApi = {
  /** /all returns { success, pvp, level, wealth, guilds } at the top level (not under data) */
  async getAll(): Promise<ApiResponse<AllLeaderboards>> {
    const raw = await get<AllLeaderboards>('/api/leaderboard/all')
    // Normalise: the /all endpoint puts boards at root, not under `data`
    if (raw.success && !raw.data) {
      const r = raw as unknown as Record<string, unknown>
      return { ...raw, data: { level: r.level, pvp: r.pvp, wealth: r.wealth, guilds: r.guilds } as AllLeaderboards }
    }
    return raw
  },
  async getLevel() {
    return get<LevelLeader[]>('/api/leaderboard/level')
  },
  async getPvp() {
    return get<PvpLeader[]>('/api/leaderboard/pvp')
  },
  async getWealth() {
    return get<WealthLeader[]>('/api/leaderboard/wealth')
  },
  async getGuilds() {
    return get<GuildLeader[]>('/api/leaderboard/guilds')
  }
}

// =================================================================
// QUEST / PARTY / GUILD / PROGRESSION / ARTIFACT — unchanged
// (Same endpoints, just stripped the localStorage base URL logic)
// =================================================================
export interface QuestDefinition {
  quest_id: string; title: string; description: string; quest_type: string; category: string
  required_level: number; is_repeatable: boolean; repeat_cooldown_hours?: number
  max_completions?: number; objectives_json: string; rewards_json: string
  can_accept?: boolean; blocked_reason?: string | null; is_active?: boolean; is_completed?: boolean
}
export interface ActiveQuest {
  quest_id: string; title: string; started_at: string
  objectives: Record<string, { current: number; target: number; complete: boolean; type: string; text: string }>
  is_ready_to_turn_in?: boolean; quest_type?: string; category?: string
}
export const questApi = {
  async getAvailable(characterId: number) { return post<QuestDefinition[]>('/api/quests/available', { characterId }) },
  async getActive(characterId: number) { return post<Record<string, ActiveQuest>>('/api/quests/active', { characterId }) },
  async getDetail(questId: string) { return post<QuestDefinition>('/api/quests/detail', { questId }) },
  async accept(characterId: number, questId: string) { return post<ActiveQuest>('/api/quests/accept', { characterId, questId }) },
  async progress(characterId: number, questId: string, objectiveKey: string, amount: number = 1) {
    return post<ActiveQuest>('/api/quests/progress', { characterId, questId, objectiveKey, amount })
  },
  async complete(characterId: number, questId: string) {
    return post<{ completed: { quest_id: string; title: string }; xp_awarded: number }>('/api/quests/complete', { characterId, questId })
  },
  async abandon(characterId: number, questId: string) { return post('/api/quests/abandon', { characterId, questId }) },
  async getNpcOffers(npcId: number, characterId: number) {
    return get<QuestDefinition[]>(`/api/quests/npc-offers/${npcId}/${characterId}`)
  }
}

export interface Friend { id: number; friend_char_id: number; friend_name: string; status: string; created_at: string }
export interface FriendRequest { id: number; requester_id?: number; recipient_id?: number; requester_name?: string; recipient_name?: string; created_at: string }
export interface PartyMember { char_id: number; name: string; level: number; class_name?: string; role: string; joined_at: string }
export interface Party { id: number; name: string; leader_id: number; created_at: string }
export const partyApi = {
  async getFriends(charId: number) { return get<{ accepted: Friend[]; incoming: FriendRequest[]; outgoing: FriendRequest[] }>(`/api/party/friends/${charId}`) },
  async sendFriendRequest(charId: number, targetCharId: number) { return post<{ targetName: string }>('/api/party/friends/request', { charId, targetCharId }) },
  async acceptFriendRequest(charId: number, requesterId: number) { return post<{ requesterName: string }>('/api/party/friends/accept', { charId, requesterId }) },
  async removeFriend(charId: number, targetCharId: number) { return post('/api/party/friends/remove', { charId, targetCharId }) },
  async getCurrentParty(charId: number) { return get<{ party: Party; members: PartyMember[] } | null>(`/api/party/current/${charId}`) },
  async disbandParty(charId: number, partyId: number) { return post('/api/party/disband', { charId, partyId }) }
}

export interface Guild { id: number; name: string; tag: string; description?: string; emblem?: string; leader_id: number; created_at: string; member_count?: number }
export interface GuildMember { char_id: number; name: string; level: number; class_name?: string; rank: 'LEADER' | 'OFFICER' | 'MEMBER'; joined_at: string }
export interface GuildInvite { id: number; guild_id: number; guild_name: string; tag: string; emblem: string; inviter_name: string; expires_at: string }
export const guildApi = {
  async getMyGuild(charId: number) { return get<{ guild: Guild & { rank: string }; members: GuildMember[]; pendingInvites: GuildInvite[] } | null>(`/api/guild/my/${charId}`) },
  async searchGuilds(query?: string) { const q = query ? `?q=${encodeURIComponent(query)}` : ''; return get<Guild[]>(`/api/guild/search${q}`) },
  async getGuildInfo(guildId: number) { return get<{ guild: Guild; members: GuildMember[] }>(`/api/guild/info/${guildId}`) },
  async createGuild(charId: number, name: string, tag: string, description?: string, emblem?: string) {
    return post<{ guildId: number; guildName: string; guildTag: string }>('/api/guild/create', { charId, name, tag, description, emblem })
  },
  async disbandGuild(charId: number, guildId: number) { return post('/api/guild/disband', { charId, guildId }) }
}

export interface ProgressionStatus { level: number; xp: number; xp_to_next: number; unspent_points: number; using_level_table: boolean; levels_gained: number }
export const progressionApi = {
  async getStatus(characterId: number) { return post<ProgressionStatus>('/api/progression/status', { characterId }) },
  async awardXp(characterId: number, amount: number, reason?: string) {
    return post<{ previous_level: number; new_level: number; levels_gained: number; xp_remaining: number; unspent_points: number }>('/api/progression/award-xp', { characterId, amount, reason })
  },
  async spendPoints(characterId: number, spend: Record<string, number>) {
    return post<{ spent: Record<string, number>; remaining_points: number }>('/api/progression/level-up', { characterId, spend })
  },
  async getLevelRequirements() { return get<Array<{ level: number; xp_required: number; total_xp?: number }>>('/api/progression/level-requirements') }
}

export interface LegendaryArtifact { artifact_id: string; name: string; description: string; rarity: string; current_wielder_id?: number; wielder_name?: string; total_kills: number; kill_streak: number; last_bloodshed_at?: string; is_dormant: boolean; active_curses_json?: string }
export interface ArtifactPower { power_id: string; name: string; description: string; unlock_kills: number; is_active: boolean }
export interface ArtifactLineage { lineage_id: string; wielder_id: number; wielder_name: string; acquired_at: string; ended_at?: string; ended_reason?: string }
export interface ArtifactHunt { hunt_id: string; hunter_id: number; hunter_name: string; bounty_amount: number; status: string; notes?: string; created_at: string }
export const artifactApi = {
  async list() { return get<LegendaryArtifact[]>('/api/artifacts') },
  async getDetail(artifactId: string) { return get<{ artifact: LegendaryArtifact; powers: ArtifactPower[]; lineage: ArtifactLineage[]; hunts: ArtifactHunt[] }>(`/api/artifacts/${artifactId}`) },
  async getWielderArtifacts(characterId: number) { return get<LegendaryArtifact[]>(`/api/artifacts/wielder/${characterId}`) },
  async createHunt(characterId: number, artifactId: string, bountyAmount: number, notes?: string) {
    return post<{ hunt_id: string }>('/api/artifacts/hunt/create', { characterId, artifactId, bountyAmount, notes })
  },
  async createShrine(characterId: number, artifactId: string, zoneId?: number, title?: string, message?: string) {
    return post<{ shrine_id: string }>('/api/artifacts/shrine/create', { characterId, artifactId, zoneId, title, message })
  },
  async worship(characterId: number, shrineId: string) {
    return post<{ worship_id: string }>('/api/artifacts/shrine/worship', { characterId, shrineId })
  }
}

export const api = {
  auth: authApi, game: gameApi, quest: questApi, party: partyApi,
  guild: guildApi, progression: progressionApi, artifact: artifactApi, codex: codexApi, crafting: craftingApi, leaderboard: leaderboardApi, achievement: achievementApi
}
export default api
