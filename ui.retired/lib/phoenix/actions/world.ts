// World, AI, DM, and event actions → game:lobby
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useWorldActions(gameChannel: Channel | null) {
  // World interaction
  const interactObject = useCallback((objectIndex: number, action: string) => {
    gameChannel?.push("interact_object", { objectIndex, action })
  }, [gameChannel])

  const spawnMapParticle = useCallback((preset: string, x: number, y: number) => {
    gameChannel?.push("spawn_map_particle", { preset, x, y })
  }, [gameChannel])

  // AI features
  const aiGenerateQuest = useCallback(() => {
    gameChannel?.push("ai_generate_quest", {})
  }, [gameChannel])

  const aiGenerateItemText = useCallback((itemName: string, itemType: string) => {
    gameChannel?.push("ai_generate_item_text", { itemName, itemType })
  }, [gameChannel])

  const aiGenerateLore = useCallback((topic: string) => {
    gameChannel?.push("ai_generate_lore", { topic })
  }, [gameChannel])

  const aiGenerateBiography = useCallback(() => {
    gameChannel?.push("ai_generate_biography", {})
  }, [gameChannel])

  const aiCraftingHint = useCallback((ingredients: Array<{ name: string }>) => {
    gameChannel?.push("ai_crafting_hint", { ingredients })
  }, [gameChannel])

  // DM mode
  const dmAction = useCallback((action: string, sessionId?: string) => {
    gameChannel?.push("dm_action", { action, sessionId })
  }, [gameChannel])

  const dmAssist = useCallback((instruction: string, sessionId?: string) => {
    gameChannel?.push("dm_assist", { instruction, sessionId })
  }, [gameChannel])

  const dmNarrate = useCallback((text: string, sessionId: string) => {
    gameChannel?.push("dm_narrate", { text, sessionId })
  }, [gameChannel])

  const dmJoinSession = useCallback((sessionId: string) => {
    gameChannel?.push("dm_join_session", { sessionId })
  }, [gameChannel])

  const dmLockPlayer = useCallback((targetCharId: number, locked: boolean, sessionId?: string) => {
    gameChannel?.push("dm_lock_player", { targetCharId, locked, sessionId })
  }, [gameChannel])

  const dmLockAll = useCallback((locked: boolean, sessionId: string) => {
    gameChannel?.push("dm_lock_all", { locked, sessionId })
  }, [gameChannel])

  const dmTeleportPlayer = useCallback((targetCharId: number, mapId?: number, x?: number, y?: number) => {
    gameChannel?.push("dm_teleport_player", { targetCharId, mapId, x, y })
  }, [gameChannel])

  const dmSpawnNpc = useCallback((npcId: number, mapId?: number, x?: number, y?: number) => {
    gameChannel?.push("dm_spawn_npc", { npcId, mapId, x, y })
  }, [gameChannel])

  const dmForceBattle = useCallback((targetCharId: number, enemyNpcId: number) => {
    gameChannel?.push("dm_force_battle", { targetCharId, enemyNpcId })
  }, [gameChannel])

  const dmSetEnvironment = useCallback((mapId?: number, weather?: string, ambientDark?: number) => {
    gameChannel?.push("dm_set_environment", { mapId, weather, ambientDark })
  }, [gameChannel])

  const dmScreenEffect = useCallback((sessionId: string, effect: string, duration?: number, color?: string) => {
    gameChannel?.push("dm_screen_effect", { sessionId, effect, duration, color })
  }, [gameChannel])

  const dmSpawnParticle = useCallback((preset: string, x: number, y: number, mapId?: number) => {
    gameChannel?.push("dm_spawn_particle", { mapId, preset, x, y })
  }, [gameChannel])

  const dmCreateCampaign = useCallback((data: Record<string, unknown>) => {
    gameChannel?.push("dm_create_campaign", data)
  }, [gameChannel])

  const dmListCampaigns = useCallback(() => {
    gameChannel?.push("dm_list_campaigns", {})
  }, [gameChannel])

  const dmInvitePlayer = useCallback((campaignId: number, targetUserId: number) => {
    gameChannel?.push("dm_invite_player", { campaignId, targetUserId })
  }, [gameChannel])

  const dmCampaignRespond = useCallback((campaignId: number, accept: boolean) => {
    gameChannel?.push("dm_campaign_respond", { campaignId, accept })
  }, [gameChannel])

  const dmSaveSheet = useCallback((campaignId: number, sheet: Record<string, unknown>) => {
    gameChannel?.push("dm_save_character_sheet", { campaignId, sheet })
  }, [gameChannel])

  const dmGetSheets = useCallback((campaignId: number) => {
    gameChannel?.push("dm_get_sheets", { campaignId })
  }, [gameChannel])

  const dmStartSession = useCallback((campaignId: number, title?: string) => {
    gameChannel?.push("dm_start_session", { campaignId, title })
  }, [gameChannel])

  const dmEndSession = useCallback((campaignId: number, summary?: string) => {
    gameChannel?.push("dm_end_session", { campaignId, summary })
  }, [gameChannel])

  // Events
  const eventList = useCallback(() => {
    gameChannel?.push("event_list", {})
  }, [gameChannel])

  const eventSignup = useCallback((eventId: number) => {
    gameChannel?.push("event_signup", { eventId })
  }, [gameChannel])

  const eventCancelSignup = useCallback((eventId: number) => {
    gameChannel?.push("event_cancel_signup", { eventId })
  }, [gameChannel])

  const eventCreate = useCallback((data: Record<string, unknown>) => {
    gameChannel?.push("event_create", data)
  }, [gameChannel])

  // Lookups
  const bankGetItems = useCallback(() => {
    gameChannel?.push("bank_get_items", {})
  }, [gameChannel])

  const bountyGetTasks = useCallback(() => {
    gameChannel?.push("bounty_get_tasks", {})
  }, [gameChannel])

  const mountGetList = useCallback(() => {
    gameChannel?.push("mount_get_list", {})
  }, [gameChannel])

  const cardGetCollection = useCallback(() => {
    gameChannel?.push("card_get_collection", {})
  }, [gameChannel])

  return {
    interactObject, spawnMapParticle,
    aiGenerateQuest, aiGenerateItemText, aiGenerateLore, aiGenerateBiography, aiCraftingHint,
    dmAction, dmAssist, dmNarrate, dmJoinSession,
    dmLockPlayer, dmLockAll, dmTeleportPlayer, dmSpawnNpc,
    dmForceBattle, dmSetEnvironment, dmScreenEffect, dmSpawnParticle,
    dmCreateCampaign, dmListCampaigns, dmInvitePlayer, dmCampaignRespond,
    dmSaveSheet, dmGetSheets, dmStartSession, dmEndSession,
    eventList, eventSignup, eventCancelSignup, eventCreate,
    bankGetItems, bountyGetTasks, mountGetList, cardGetCollection,
  }
}
