// =================================================================
// Phoenix Channel Event Types
// Complete type definitions for all push/receive events per channel.
// =================================================================

import type {
  Character,
  BattleState,
  BattleCommand,
  BattleLogEntry,
  GameMap,
  Companion,
  KOInteraction,
  PvpKOChoice,
  SigTechDiscovery,
  Item,
} from "../game-types"

import type {
  NearbyPlayer,
  PartyMember,
  Notification,
  BattleChatMessage,
  MapBattleIndicator,
} from "../game-reducers"

// ─── Utility ─────────────────────────────────────────────────────
type Empty = Record<string, never>

// ─── Game Channel (game:lobby) ───────────────────────────────────
export interface GamePushEvents {
  // Core
  join_game: { charId: number }
  select_character: { charId: number }
  move: { x: number; y: number; running?: boolean }
  move_continuous: { tileX: number; tileY: number; running?: boolean }
  interact: { x: number; y: number }
  teleport: { mapId: number; x: number; y: number }
  fast_travel: { mapId: number }
  request_refresh: Empty

  // Character
  request_respawn: Empty
  short_rest: Empty
  long_rest: Empty
  rest_at_inn: Empty
  distribute_ap: { stat: string; points: number }
  tutorial_complete: Empty
  get_preferences: Empty
  save_preferences: { prefs: Record<string, unknown> }
  get_fog_exploration: { mapId: number }
  save_fog_exploration: { mapId: number; tiles: number[] }

  // Items
  equip_item: { itemId: number; slotKey?: string }
  unequip_item: { slotKey: string }
  drop_item: { itemId: number; quantity: number }
  pickup_item: { groundItemId: number }
  get_ground_items: Empty
  use_item_on_map: { itemId: number }
  use_capsule: { itemId: number }
  use_ability: { abilityType: string }
  get_abilities: Empty

  // World
  interact_object: { objectId: number }
  enter_structure: { structureId: number }
  exit_structure: Empty
  event_choice: { choiceIndex: number }
  trigger_cutscene: { cutsceneId: number }
  world_events_get_active: Empty
  world_events_get_history: Empty
  world_event_join: { eventId: number }
  event_list: Empty
  event_signup: { eventId: number }
  event_cancel_signup: { eventId: number }
  event_create: Record<string, unknown>

  // Shop
  shop_get_items: { shopId: number }
  shop_buy_item: { shopId: number; itemId: number; quantity: number }
  shop_sell_item: { itemId: number; quantity: number }

  // NPC
  npc_talk: { npcId?: number; x?: number; y?: number; message?: string }
  npc_menu_choice: { choiceId: string }
  accept_npc_need: { npcId: number }
  companion_set_tactics: { npcId: number; tactics: string }
  companion_dismiss: { npcId: number }
  companion_get_affinity: { npcId: number }
  companion_quest_accept: { npcId: number; questId: number }
  master_train: { npcId: number }
  train: { trainingType: string }
  spar_request: { targetCharId: number }
  spar_accept: { fromCharId: number }

  // Lookups
  bank_get_items: Empty
  bounty_get_tasks: Empty
  mount_get_list: Empty
  creature_get_list: Empty
  job_get_list: Empty
  card_get_collection: Empty

  // AI
  ai_generate_quest: Empty
  ai_generate_item_text: { itemName: string; itemType: string }
  ai_generate_lore: { topic: string }
  ai_generate_biography: Empty
  ai_crafting_hint: { ingredients: Array<{ name: string }> }

  // DM
  dm_action: { action: string; sessionId?: string }
  dm_assist: { instruction: string; sessionId?: string }
  dm_narrate: { text: string; sessionId: string }
  dm_join_session: { sessionId: string }
  dm_list_campaigns: Empty
  dm_lock_player: { targetCharId: number; locked: boolean; sessionId: string }
  dm_lock_all: { locked: boolean; sessionId: string }
  dm_teleport_player: { targetCharId: number; mapId: number; x: number; y: number }
  dm_spawn_npc: { npcId: number; mapId: number; x: number; y: number }
}

export interface GameReceiveEvents {
  map_data: GameMap
  tile_palette: Array<{ id: number; name: string; color: string; category: string; is_passable: number }>
  force_move: { x: number; y: number }
  event_queue: Array<Record<string, unknown>>
  init_self: { tutorialDone: boolean; enableGreetSystem: boolean; greetedIds: number[]; hasGreetedIds: number[] }
  error_msg: string
  ground_items: unknown[]
  ground_item_added: unknown
  ground_item_removed: { id: number }
  deployed_structures: unknown[]
  structure_deployed: unknown
  active_statuses: Array<{ id: number; name: string; icon: string; type: string }>
  overworld_effects: Record<string, unknown>
  equip_result: { success: boolean; message: string }
  interact_result: { success: boolean; message?: string }
  rest_result: { success: boolean; message: string }
  respawn_complete: { hp: number }
  ap_result: { success: boolean; message: string }
  train_result: { success: boolean; message: string }
  master_train_result: { success: boolean; message: string }
  npc_reply: { npcName: string; text: string }
  npc_need_resolved: { npcName: string; reward_gold: number; reward_xp: number; message: string }
  npc_relationships: Record<string, unknown>
  ai_quest_generated: Record<string, unknown>
  ai_item_text: { itemName: string; text: string }
  ai_lore_generated: { topic: string; text: string }
  ai_biography: { text: string }
  ai_crafting_hint_result: { hint: string }
  dm_response: { speaker: string; text: string; sessionId: string }
  dm_assist_result: Record<string, unknown>
  dm_session_started: Record<string, unknown>
  dm_session_ended: Record<string, unknown>
  dm_campaign_list: unknown[]
}

// ─── Social Channel (social:lobby) ──────────────────────────────
export interface SocialPushEvents {
  // Chat
  chat_send: { text: string; channel: string; targetCharId?: number }
  emote: { text: string }
  set_presence: { presence: string; message?: string }
  title_changed: { title: string | null }
  typing_dm: { targetCharId: number }
  friend_request_sent: { targetCharId: number }
  greet_player: { targetCharId: number }
  inspect_player: { targetCharId: number }
  view_profile: { charId: number }
  guestbook_post: { charId: number; text: string }

  // Guild
  guild_invite: { targetCharId: number }
  guild_accept: Empty
  guild_decline: Empty
  guild_kick: { targetCharId: number }
  guild_leave: Empty
  guild_set_rank: { targetCharId: number; rank: string }

  // Trade
  trade_request: { targetCharId: number }
  trade_accept: { targetCharId: number }
  trade_offer_item: { itemId: number; quantity: number }
  trade_offer_gold: { gold: number }
  trade_lock: Empty
  trade_unlock: Empty
  trade_confirm: Empty
  trade_cancel: Empty

  // Party
  party_invite: { targetCharId: number }
  party_accept: { partyId: number }
  party_decline: { partyId: number }
  party_kick: { targetCharId: number }
  party_leave: Empty

  // Staff
  staff_panel_join: Empty
  staff_panel_message: { text: string; channel?: string }
  staff_panel_away: { message: string }
  staff_nudge: { targetSocketId: string }
  staff_set_color: { color: string }
  staff_typing: Empty
  staff_panel_status: { status: string }

  // Minigames
  dice_roll: { bet: number; prediction: string }
  fish_cast: { spotId?: number }
  fish_reel: Empty
  card_game_challenge: { npcId: number }
  card_game_place: { cardId: number; position: number }
  gather: { nodeId: number }
  bounty_accept: { bountyId: number }
  bounty_claim: { task_id: number }
  arena_place_bet: { matchId: number; fighterId: number; amount: number }

  // Economy
  bank_deposit: { itemId: number; quantity: number }
  bank_withdraw: { itemId: number; quantity: number }
  capture_creature: { npcId: number; itemId: number }
  mount_toggle: { mountId: number }
  housing_purchase: { plotId: number }
  housing_place_furniture: { furnitureId: number; x: number; y: number }
  trigger_cutscene: { cutsceneId: number }
  npc_get_relationships: { npcId: number }
}

export interface SocialReceiveEvents {
  chat_msg: { text: string; from: string; channel: string; timestamp: number; charId?: number; color?: string }
  party_update: { members: PartyMember[] }
  party_invited: { inviterName: string; partyId: number }
  party_msg: { text: string; type: string }
  trade_requested: { fromCharId: number; fromName: string }
  trade_start: Record<string, unknown>
  trade_update: Record<string, unknown>
  trade_complete: Record<string, unknown>
  trade_cancelled: Record<string, unknown>
  trade_msg: { text: string; type: string }
  friend_request_incoming: { fromName: string; fromCharId: number }
  guild_joined: { guildName: string }
  guild_left: Empty
  guild_msg: { text: string; type: string }
  inspect_result: Record<string, unknown>
  greet_ack: { targetCharId: number; sent: boolean }
  greet_received: { fromCharId: number; fromName: string }
  emote_bubble: { charId: number; text: string }
  spar_requested: { fromName: string; fromCharId: number }
  spar_sent: { targetName: string }
  spar_error: string
  typing_dm_indicator: { charId: number }
  // Minigame results
  fish_bite: Empty
  fish_result: { success: boolean; message: string }
  dice_result: { result: number; message?: string }
  card_result: { success: boolean; message: string }
  gather_result: { success: boolean; message: string }
  capture_result: { success: boolean; message: string }
  mount_result: { success: boolean; message: string }
  bounty_result: { success: boolean; message: string }
  housing_result: { success: boolean; message: string }
  bank_result: { success: boolean; message: string }
  arena_bet_result: { success: boolean; message: string }
  guestbook_result: { success: boolean; message: string }
  guestbook_post: Record<string, unknown>
  // Staff
  staff_sign_on: { name: string; role: string }
  staff_sign_off: { name: string }
  staff_panel_presence: unknown[]
  staff_chat_msg: { from: string; text: string; channel: string }
  staff_chat_history: unknown[]
  staff_nudge: Empty
  staff_typing: { from: string }
  notification_msg: { text: string; type?: string }
  event_announcement: { name: string; starts_at: string }
}

// ─── Battle Channel (battle:lobby + battle:{id}) ─────────────────
export interface BattlePushEvents {
  // Initiation (battle:lobby)
  start_pve_battle: { enemy_char_id: number }
  start_party_pve_battle: { enemy_npc_ids: number[] }
  battle_challenge: { targetCharId: number }
  battle_accept: { challengerCharId: number }
  battle_challenge_3v3: { targetUserId: number; myCharIds: number[] }
  battle_accept_3v3: { challengerUserId: number }
  get_battles_on_map: Empty
  join_battle: { battleId: number }

  // Combat (battle:{id})
  battle_action: { commandId: number; skillId?: number; itemId?: number; targetCharId?: number }
  battle_move: { x: number; y: number }
  set_defense: { defense: string }
  get_state: Empty
  battle_brave: Empty
  battle_default: Empty
  battle_preview: { skillId: number; targetId: number }
  battle_auto_toggle: { enabled: boolean; tactics?: string }
  battle_surrender: Empty

  // Social (battle:{id})
  battle_chat_send: { text: string }
  battle_emote: { text: string }
  battle_chat_history: Empty
  battle_spectate: Empty
  battle_unspectate: Empty

  // Options
  battle_negotiate: { targetCharId: number }
  negotiate_respond: { accept: boolean }
  battle_toggle_nonlethal: Empty
  battle_set_defense: { defense: string }
  battle_limb_target: { limb: string }
  battle_ko_action: { action: string; targetCharId: number }
  battle_pvp_ko_choice: { choice: string }

  // Systems
  sig_tech_create: { description: string; ability1Id: number; ability2Id: number; ability3Id: number }
  sig_tech_equip_ability: { techId: number; abilityId: number; slot: number }
  sig_tech_get_abilities: { techId: number }
  devour_enemy: { targetId: number }

  // Duels
  duel_challenge: { targetCharId: number; wager?: number }
  duel_accept: { challengerCharId: number }
  duel_decline: { challengerCharId: number }

  // Realtime combat
  rt_combat_target: { targetId: number }
  rt_combat_move: { x: number; y: number }
  rt_combat_ability: { skillId: number; targetId: number }
  rt_combat_pause: Empty

  // Async PvP
  async_pvp_set_defense: { charIds: number[] }
  async_pvp_challenge: { targetCharId: number }

  // Raids
  raid_join: { raidId: number }

  // Referee
  battle_ref_join: Empty
  battle_ref_action: { action: string }

  // Special
  job_switch: { jobId: number }
}

export interface BattleReceiveEvents {
  battle_start: BattleState
  battle_start_join: { battle_id: number }
  battle_update: { state?: BattleState; action?: unknown; commands?: BattleCommand[]; spectator?: boolean; log?: BattleLogEntry[] }
  battle_grid_update: { grid: unknown; hasMoved: boolean; log?: BattleLogEntry[] }
  battle_end: Empty
  battle_result: Record<string, unknown>
  battle_defeat: Record<string, unknown>
  battle_error: string
  battle_ko_interact: { koNpcs: KOInteraction[] }
  pvp_ko_choice: PvpKOChoice
  battles_on_map: MapBattleIndicator[]
  battle_ended_on_map: { battleId: number }
  battle_chat_msg: BattleChatMessage
  battle_emote_show: { charId: number; text: string }
  battle_challenged: { challengerName: string; challengerCharId: number }
  battle_challenged_3v3: { challengerName: string }
  battle_defense_set: { charId: number; stance: string }
  battle_nonlethal_toggled: { charId: number; nonlethal: boolean }
  battle_limb_target_set: { charId: number; limbKey: string }
  battle_ko_result: { success: boolean; message: string }
  battle_pvp_ko_result: { success: boolean; message: string }
  battle_spectate_result: Record<string, unknown>
  battle_auto_status: { enabled: boolean }
  battle_preview_result: Record<string, unknown>
  battle_brave_result: Record<string, unknown>
  battle_default_result: Record<string, unknown>
  battle_ref_joined: Empty
  battle_ref_pause: { paused: boolean; refName: string }
  battle_chat_history: BattleChatMessage[]
  negotiate_result: Record<string, unknown>
  negotiate_request: Record<string, unknown>
  trigger_pve_battle: { npcId: number }
  random_encounter: { zoneName?: string; npcId: number; npcName?: string }
  loot_drops: { drops: Array<{ name: string; icon?: string }>; enemyName: string }
  ogham_drop: { name: string; icon: string }
  sig_tech_discovery: SigTechDiscovery
  sig_tech_created: { success: boolean; message: string }
  sig_tech_ability_equipped: { success: boolean; message: string }
  sig_tech_abilities_list: unknown[]
  learn_result: { success: boolean; message: string }
  style_rank_up: { styleName?: string; newRank?: string }
  artifact_transfer: { artifactName?: string; fromName?: string; toName?: string }
  async_pvp_result: { success: boolean; message: string }
  raid_result: { success: boolean; message: string }
  raid_update: Record<string, unknown>
  duel_request: Record<string, unknown>
  duel_accepted: Record<string, unknown>
  duel_declined: Record<string, unknown>
  duel_error: string
  duel_expired: Empty
}

// ─── User Channel (user:{charId}) — receive only ────────────────
export interface UserReceiveEvents {
  notification: { type: string; message: string }
  notification_msg: { text: string; type?: string }
  error_msg: string
  force_disconnect: { reason?: string } | string
  quest_progress_update: { quests: unknown[] }
  companion_list: Companion[]
  companion_joined: Companion
  companion_dismissed: { npcId: number }
  companion_moved: { npcId: number; x: number; y: number }
  companion_tactics_changed: { npcId: number; tactics: string }
  warp_discovered: { mapId: number; name: string }
  mail_unread_count: { count: number }
  battle_start_join: { battle_id: number }
  duel_expired: Empty
}

// ─── Map Channel (map:{mapId}) — receive only ───────────────────
export interface MapReceiveEvents {
  player_list: NearbyPlayer[] | { players: NearbyPlayer[] }
  player_joined: NearbyPlayer
  player_moved: { id: number; x: number; y: number }
  player_left: number
  player_status_change: NearbyPlayer & { isOffline?: boolean }
  player_title_changed: { charId: number; title: string | null }
  player_presence_changed: { charId: number; presence: string }
  player_arena_changed: Empty
  ground_items: unknown[]
  ground_item_added: unknown
  ground_item_removed: { id: number }
  deployed_structures: unknown[]
  structure_deployed: unknown
}
