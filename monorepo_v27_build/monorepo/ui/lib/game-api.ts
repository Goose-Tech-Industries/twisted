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
    return post<{
      username: string
      role: string
      dailyReward?: {
        gold: number
        streak: number
        bonus: boolean
        message: string
      } | null
    }>('/auth/login', { username, password })
  },
  async register(username: string, password: string, characterName: string) {
    return post<{ userId: number }>('/auth/register', { username, password, charName: characterName })
  },
  async logout() {
    return post('/auth/logout')
  },
  async me() {
    return get<{ username: string; role: string }>('/auth/me')
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
    return post<{ characters: Array<{ id: number; name: string; level: number; class_name: string; race_name: string }> }>('/my-characters')
  },
  async getCharFull(charId: number) {
    return post<CharacterFull>('/get-char-full', { charId })
  },
  async createCharacter(data: { name: string; raceId: number; classId: number; backgroundId?: number; featId?: number }) {
    return post('/create-character', data)
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
    }>('/creation-data')
  },
  async getMap(mapId: number) {
    return post<{ map: GameMap }>('/get-map', { mapId })
  },
  async getAllMaps() {
    return post<{ maps: Array<{ id: number; name: string; description?: string; width: number; height: number; fast_travel_enabled?: number; min_level?: number }> }>('/get-all-maps')
  },
  async saveState(charId: number, state: Record<string, unknown>) {
    return post('/save-state', { charId, state })
  },
  async loadState(charId: number) {
    return post<{ state: Record<string, unknown> }>('/load-state', { charId })
  },
  async equipItem(charId: number, itemId: number, slotKey: string) {
    return post('/equip-item', { charId, itemId, slotKey })
  },
  async unequipItem(charId: number, slotKey: string) {
    return post('/unequip-item', { charId, slotKey })
  },
  async useItem(charId: number, itemId: number) {
    return post<{ newHp: number; newMp: number }>('/use-item', { charId, itemId })
  },
  async getShop(shopId: number) {
    return post<{ shop: { id: number; name: string }; supplies: Array<InventoryItem & { buy_price: number; sell_price: number; stock: number }> }>('/get-shop', { shopId })
  },
  async buyItem(charId: number, shopId: number, itemId: number, quantity: number = 1) {
    return post('/buy-item', { charId, shopId, itemId, quantity })
  },
  async sellItem(charId: number, itemId: number, quantity: number = 1) {
    return post('/sell-item', { charId, itemId, quantity })
  },
  async getMyOghams(charId: number) {
    return post<{ oghams: Array<{
      id: number; name: string; icon: string; description: string
      family_id: number; family_name: string; element_attack?: string
      on_hit_status?: string; on_hit_chance?: number; stat_bonus?: string; slotted: boolean
    }> }>('/my-oghams', { charId })
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
  guild: guildApi, progression: progressionApi, artifact: artifactApi
}
export default api
