// Tabletop RPG / DM Campaign Store
// Backed by Phoenix channel events: dm_list_campaigns, dm_character_sheets,
// dm_response, action_slots, etc.

export interface DmCampaign {
  id: number
  name: string
  description?: string | null
  dm_user_id?: number
  dm_name?: string | null
  max_players?: number | null
  player_count?: number
  is_oneshot?: number | boolean
  world_tone?: string | null
  map_id?: number | null
  ruleset_id?: number | null
  status?: 'recruiting' | 'active' | 'completed' | 'archived' | string
  session_count?: number
  moves_per_day?: number
  tiles_per_move?: number
  flying_tiles?: number
  created_at?: string
}

export interface DmCharacterSheet {
  id?: number
  campaign_id: number
  user_id?: number
  username?: string
  name: string
  race?: string
  class_name?: string
  level: number
  str: number
  dex: number
  con: number
  int_score: number
  wis: number
  cha: number
  max_hp: number
  current_hp?: number
  armor_class?: number
  background?: string
  alignment?: string
  personality?: string
  backstory?: string
  equipment_json?: string[] | Record<string, unknown>
  skills_json?: string[] | Record<string, unknown>
  spells_json?: string[] | Record<string, unknown>
  notes?: string
  portrait_url?: string
}

export interface DmFeedMessage {
  speaker: string
  text: string
  sessionId?: number | string
  timestamp: number
}

export interface DmActionSlot {
  action_type: string
  label: string
  icon?: string
  window_type: string
  remaining_uses: number
  max_uses: number
  reset_time?: string
}

function createDmCampaignsStore() {
  let list = $state<DmCampaign[]>([])
  let activeCampaign = $state<DmCampaign | null>(null)
  let sheets = $state<DmCharacterSheet[]>([])
  let sessionFeed = $state<DmFeedMessage[]>([])
  let actionSlots = $state<DmActionSlot[]>([])
  let pushFn: ((event: string, payload?: any) => void) | null = null

  return {
    get list() { return list },
    get activeCampaign() { return activeCampaign },
    get sheets() { return sheets },
    get sessionFeed() { return sessionFeed },
    get actionSlots() { return actionSlots },

    bindPush(fn: (event: string, payload?: any) => void) {
      pushFn = fn
    },

    listCampaigns() {
      pushFn?.('dm_list_campaigns', {})
    },

    createCampaign(payload: {
      name: string
      description?: string
      maxPlayers?: number
      worldTone?: string
      rulesetId?: number
      isOneshot?: boolean
    }) {
      pushFn?.('dm_create_campaign', payload)
    },

    respondInvite(campaignId: number, accept: boolean) {
      pushFn?.('dm_campaign_respond', { campaignId, accept })
    },

    getSheets(campaignId: number) {
      pushFn?.('dm_get_sheets', { campaignId })
    },

    saveSheet(campaignId: number, sheet: Partial<DmCharacterSheet>) {
      pushFn?.('dm_save_character_sheet', { campaignId, sheet })
    },

    startSession(campaignId: number, title?: string) {
      pushFn?.('dm_start_session', { campaignId, title })
    },

    endSession(campaignId: number, summary?: string) {
      pushFn?.('dm_end_session', { campaignId, summary })
    },

    joinSession(sessionId: number | string) {
      pushFn?.('dm_join_session', { sessionId })
    },

    sendAction(action: string, sessionId?: number | string) {
      pushFn?.('dm_action', { action, sessionId })
    },

    sendNarrate(text: string, sessionId: number | string) {
      pushFn?.('dm_narrate', { text, sessionId })
    },

    lockPlayer(targetCharId: number, locked: boolean) {
      pushFn?.('dm_lock_player', { targetCharId, locked })
    },

    lockAll(locked: boolean, sessionId: number | string) {
      pushFn?.('dm_lock_all', { locked, sessionId })
    },

    setEnvironment(weather: string, mapId?: number) {
      pushFn?.('dm_set_environment', { weather, mapId })
    },

    setScreenEffect(effect: string, sessionId: number | string) {
      pushFn?.('dm_screen_effect', { effect, sessionId })
    },

    getActionSlots(campaignId: number) {
      pushFn?.('get_action_slots', { campaignId })
    },

    performAction(campaignId: number, actionType: string) {
      pushFn?.('campaign_action', { campaignId, actionType })
    },

    set(next: DmCampaign[]) {
      list = next ?? []
      if (activeCampaign) {
        const found = list.find(c => c.id === activeCampaign!.id)
        if (found) activeCampaign = found
      }
    },
    setActive(c: DmCampaign | null) {
      activeCampaign = c
      sheets = []
      sessionFeed = []
      if (c) {
        pushFn?.('dm_get_sheets', { campaignId: c.id })
        pushFn?.('dm_join_session', { sessionId: c.id })
      }
    },
    setSheets(next: DmCharacterSheet[]) {
      sheets = next ?? []
    },
    updateSheet(sheet: DmCharacterSheet) {
      const idx = sheets.findIndex(s => s.id === sheet.id || (s.user_id && s.user_id === sheet.user_id))
      if (idx >= 0) sheets[idx] = sheet
      else sheets.push(sheet)
    },
    addFeedMessage(msg: { speaker: string; text: string; sessionId?: number | string }) {
      sessionFeed.push({
        ...msg,
        timestamp: Date.now()
      })
      if (sessionFeed.length > 100) sessionFeed.shift()
    },
    setActionSlots(slots: DmActionSlot[]) {
      actionSlots = slots ?? []
    },
    clear() {
      list = []
      activeCampaign = null
      sheets = []
      sessionFeed = []
      actionSlots = []
    }
  }
}

export const dmCampaigns = createDmCampaignsStore()
