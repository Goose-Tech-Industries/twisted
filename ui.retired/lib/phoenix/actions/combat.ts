// Combat & battle actions → battle:lobby + battle:{id}
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useCombatActions(
  battleLobby: Channel | null,
  battleChannel: Channel | null,
  getState: () => { battle: any },
) {
  const ch = () => battleChannel || battleLobby

  const attack = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 1 })
  }, [battleChannel, battleLobby, getState])

  const defend = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 2 })
  }, [battleChannel, battleLobby, getState])

  const useSkill = useCallback((skillId: number) => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 3, skillId })
  }, [battleChannel, battleLobby, getState])

  const useBattleItem = useCallback((itemId: number) => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 4, itemId })
  }, [battleChannel, battleLobby, getState])

  const flee = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 5 })
  }, [battleChannel, battleLobby, getState])

  const limitBreak = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_action", { battleId, commandId: 6 })
  }, [battleChannel, battleLobby, getState])

  const battleChallenge = useCallback((targetCharId: number) => {
    battleLobby?.push("battle_challenge", { targetCharId })
  }, [battleLobby])

  const battleAccept = useCallback((challengerCharId: number) => {
    battleLobby?.push("battle_accept", { challengerCharId })
  }, [battleLobby])

  const battleBrave = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_brave", { battleId })
  }, [battleChannel, battleLobby, getState])

  const battleDefault = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_default", { battleId })
  }, [battleChannel, battleLobby, getState])

  const battlePreview = useCallback((skillId: number, targetId: number) => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_preview", { battleId, skillId, targetId })
  }, [battleChannel, battleLobby, getState])

  const battleAutoToggle = useCallback((enabled: boolean, tactics?: string) => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_auto_toggle", { battleId, enabled, tactics })
  }, [battleChannel, battleLobby, getState])

  const battleChatSend = useCallback((text: string) => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_chat_send", { battleId, text })
  }, [battleChannel, battleLobby, getState])

  const battleSpectate = useCallback((battleId: number) => {
    battleLobby?.push("battle_spectate", { battleId })
  }, [battleLobby])

  const battleSurrender = useCallback(() => {
    const battleId = getState().battle?.battleId
    ch()?.push("battle_surrender", { battleId })
  }, [battleChannel, battleLobby, getState])

  const startPveBattle = useCallback((enemyCharId: number) => {
    battleLobby?.push("start_pve_battle", { enemy_char_id: enemyCharId })
  }, [battleLobby])

  const startPartyPveBattle = useCallback((enemyCharId: number) => {
    battleLobby?.push("start_party_pve_battle", { enemy_npc_ids: [enemyCharId] })
  }, [battleLobby])

  const raidJoin = useCallback((raidId: number) => {
    battleLobby?.push("raid_join", { raidId })
  }, [battleLobby])

  // Extended battle actions
  const battleChallenge3v3 = useCallback((targetUserId: number, charIds: number[]) => {
    battleLobby?.push("battle_challenge_3v3", { targetUserId, myCharIds: charIds })
  }, [battleLobby])

  const battleAccept3v3 = useCallback((challengerUserId: number) => {
    battleLobby?.push("battle_accept_3v3", { challengerUserId })
  }, [battleLobby])

  const battleRefJoin = useCallback((battleId: number) => {
    ch()?.push("battle_ref_join", { battleId })
  }, [battleChannel, battleLobby])

  const battleRefAction = useCallback((battleId: number, action: string) => {
    ch()?.push("battle_ref_action", { battleId, action })
  }, [battleChannel, battleLobby])

  const battleChatHistory = useCallback((battleId: number) => {
    ch()?.push("battle_chat_history", { battleId })
  }, [battleChannel, battleLobby])

  const devourEnemy = useCallback((targetId: number) => {
    const battleId = getState().battle?.battleId
    ch()?.push("devour_enemy", { targetId, battleId })
  }, [battleChannel, battleLobby, getState])

  // Sig techs
  const sigTechEquipAbility = useCallback((techId: number, abilityId: number, slot: number) => {
    ch()?.push("sig_tech_equip_ability", { techId, abilityId, slot })
  }, [battleChannel, battleLobby])

  const sigTechGetAbilities = useCallback((techId: number) => {
    ch()?.push("sig_tech_get_abilities", { techId })
  }, [battleChannel, battleLobby])

  // Realtime combat
  const rtCombatTarget = useCallback((battleId: number, targetId: number) => {
    ch()?.push("rt_combat_target", { battleId, targetId })
  }, [battleChannel, battleLobby])

  const rtCombatMove = useCallback((battleId: number, x: number, y: number) => {
    ch()?.push("rt_combat_move", { battleId, x, y })
  }, [battleChannel, battleLobby])

  const rtCombatAbility = useCallback((battleId: number, skillId: number, targetId: number) => {
    ch()?.push("rt_combat_ability", { battleId, skillId, targetId })
  }, [battleChannel, battleLobby])

  const rtCombatPause = useCallback((battleId: number) => {
    ch()?.push("rt_combat_pause", { battleId })
  }, [battleChannel, battleLobby])

  // Async PvP
  const asyncPvpSetDefense = useCallback((charIds: number[]) => {
    battleLobby?.push("async_pvp_set_defense", { charIds })
  }, [battleLobby])

  const asyncPvpChallenge = useCallback((targetCharId: number) => {
    battleLobby?.push("async_pvp_challenge", { targetCharId })
  }, [battleLobby])

  const arenaPlaceBet = useCallback((matchId: number, fighterId: number, amount: number) => {
    battleLobby?.push("arena_place_bet", { matchId, fighterId, amount })
  }, [battleLobby])

  // Duel
  const duelChallenge = useCallback((targetCharId: number, wager?: number) => {
    battleLobby?.push("duel_challenge", { targetCharId, wager })
  }, [battleLobby])

  const duelAccept = useCallback((challengerCharId: number) => {
    battleLobby?.push("duel_accept", { challengerCharId })
  }, [battleLobby])

  const duelDecline = useCallback((challengerCharId: number) => {
    battleLobby?.push("duel_decline", { challengerCharId })
  }, [battleLobby])

  return {
    attack, defend, useSkill, useBattleItem, flee, limitBreak,
    battleChallenge, battleAccept, battleBrave, battleDefault,
    battlePreview, battleAutoToggle, battleChatSend, battleSpectate,
    battleSurrender, startPveBattle, startPartyPveBattle, raidJoin,
    battleChallenge3v3, battleAccept3v3, battleRefJoin, battleRefAction,
    battleChatHistory, devourEnemy, sigTechEquipAbility, sigTechGetAbilities,
    rtCombatTarget, rtCombatMove, rtCombatAbility, rtCombatPause,
    asyncPvpSetDefense, asyncPvpChallenge, arenaPlaceBet,
    duelChallenge, duelAccept, duelDecline,
  }
}
