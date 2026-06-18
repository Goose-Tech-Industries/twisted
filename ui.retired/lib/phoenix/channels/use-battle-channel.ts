// =================================================================
// Battle Channel Listeners (battle:lobby + battle:{id})
// Events: battle_start, battle_update, battle_end, battle_result,
//         KO interactions, sig techs, duels, loot, rewards
// =================================================================
import { useEffect } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void
type Notify = (type: string, message: string, duration?: number) => void

export function useBattleChannelListeners(
  lobbyChannel: Channel | null,
  battleChannel: Channel | null,
  dispatch: Dispatch,
  notify: Notify,
  onBattleStartJoin?: (battleId: number) => void,
) {
  // ── Lobby channel (battle:lobby) ───────────────────────────────
  useEffect(() => {
    if (!lobbyChannel) return
    const refs: number[] = []
    const on = (event: string, cb: (payload: any) => void) => {
      refs.push(lobbyChannel.on(event, cb))
    }

    on("battles_on_map", (data) => dispatch({ type: "SET_MAP_BATTLES", payload: data }))
    on("battle_ended_on_map", (data) => {
      dispatch({ type: "REMOVE_MAP_BATTLE", payload: data.battleId })
    })

    // Server triggers a PvE battle (event-runner or spawn zone)
    on("trigger_pve_battle", (data) => {
      lobbyChannel.push("start_pve_battle", { enemy_char_id: data.npcId })
    })
    on("random_encounter", (data) => {
      notify("warning", `${data.npcName || "An enemy"} attacks!`)
      lobbyChannel.push("start_pve_battle", { enemy_char_id: data.npcId })
    })

    // Battle start — server tells us to join a specific battle channel
    on("battle_start_join", (data) => {
      if (data.battle_id && onBattleStartJoin) {
        onBattleStartJoin(data.battle_id)
      }
    })

    // Challenge notifications
    on("battle_challenged", (data) => notify("warning", `${data.challengerName} challenges you to battle!`, 8000))
    on("battle_challenged_3v3", (data) => notify("warning", `${data.challengerName} challenges you to a 3v3 battle!`, 8000))

    // Duel events
    on("duel_request", () => {})
    on("duel_accepted", () => {})
    on("duel_declined", () => {})
    on("duel_error", (msg) => notify("error", typeof msg === "string" ? msg : "Duel error"))
    on("duel_expired", () => notify("info", "Duel request expired"))

    return () => { for (const ref of refs) lobbyChannel.off("", ref) }
  }, [lobbyChannel, dispatch, notify, onBattleStartJoin])

  // ── Active battle channel (battle:{id}) ────────────────────────
  useEffect(() => {
    if (!battleChannel) return
    const refs: number[] = []
    const on = (event: string, cb: (payload: any) => void) => {
      refs.push(battleChannel.on(event, cb))
    }

    // Core battle state
    on("battle_start", (data) => {
      dispatch({ type: "SET_BATTLE", payload: data })
      dispatch({ type: "SET_VIEW", payload: "battle" })
    })

    on("battle_update", (data) => {
      const merged = { ...(data.state || data) }
      if (data.commands) merged.commands = data.commands
      if (data.spectator) merged.isSpectator = true
      dispatch({ type: "SET_BATTLE", payload: merged })
    })

    on("battle_grid_update", (data) => {
      dispatch({ type: "MERGE_BATTLE", payload: { grid: data.grid, hasMoved: data.hasMoved } })
    })

    on("battle_end", () => {
      dispatch({ type: "SET_BATTLE", payload: null })
    })

    on("battle_result", (data) => {
      if (data.xp) notify("xp", `+${data.xp} XP`)
      if (data.gold) notify("item", `+${data.gold} gold`)
      dispatch({ type: "SET_BATTLE", payload: null })
      dispatch({ type: "CLEAR_BATTLE_CHAT" })
      dispatch({ type: "SET_NEGOTIATE_RESULT", payload: null })
      dispatch({ type: "SET_NEGOTIATE_REQUEST", payload: null })
    })

    on("battle_defeat", () => {
      notify("error", "You have been defeated...")
      dispatch({ type: "SET_BATTLE", payload: null })
      dispatch({ type: "CLEAR_BATTLE_CHAT" })
      dispatch({ type: "SET_NEGOTIATE_RESULT", payload: null })
      dispatch({ type: "SET_NEGOTIATE_REQUEST", payload: null })
    })

    // KO interactions
    on("battle_ko_interact", (data) => dispatch({ type: "SET_BATTLE_KO_NPCS", payload: data.koNpcs }))
    on("pvp_ko_choice", (data) => dispatch({ type: "SET_PVP_KO_CHOICE", payload: data }))

    // Chat & emotes
    on("battle_chat_msg", (msg) => dispatch({ type: "ADD_BATTLE_CHAT", payload: msg }))
    on("battle_emote_show", (emote) => {
      dispatch({ type: "SET_BATTLE_EMOTE", payload: emote })
      setTimeout(() => dispatch({ type: "SET_BATTLE_EMOTE", payload: null }), 2500)
    })
    on("battle_chat_history", (data) => {
      for (const m of data.messages || []) dispatch({ type: "ADD_BATTLE_CHAT", payload: m })
    })

    // Negotiate
    on("negotiate_result", (data) => dispatch({ type: "SET_NEGOTIATE_RESULT", payload: data }))
    on("negotiate_request", (data) => dispatch({ type: "SET_NEGOTIATE_REQUEST", payload: data }))

    // Combat option feedback
    on("battle_error", (msg) => notify("error", typeof msg === "string" ? msg : "Battle error"))
    on("battle_defense_set", (data) => notify("info", `Defense stance: ${data.stance}`))
    on("battle_nonlethal_toggled", (data) => notify("info", data.nonlethal ? "Non-lethal mode ON" : "Non-lethal mode OFF"))
    on("battle_limb_target_set", (data) => notify("info", `Targeting: ${data.limbKey}`))
    on("battle_ko_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("battle_pvp_ko_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("battle_spectate_result", (d) => notify(d.success ? "info" : "error", d.message))
    on("battle_auto_status", (d) => notify("info", d.enabled ? "Auto-battle ON" : "Auto-battle OFF"))
    on("battle_preview_result", () => {})
    on("battle_brave_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("battle_default_result", (d) => notify(d.success ? "info" : "error", d.message))
    on("battle_ref_joined", () => notify("info", "A referee has joined the battle"))
    on("battle_ref_pause", (d) => notify("warning", d.paused ? `${d.refName} paused the battle` : `${d.refName} resumed the battle`))
    on("rt_combat_paused", (d) => notify("info", d.paused ? "Combat paused" : "Combat resumed"))
    on("learn_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("async_pvp_result", (d) => notify(d.success ? "success" : "error", d.message))

    // Loot & rewards
    on("loot_drops", (data) => {
      const names = (data.drops || []).map((d: any) => d.name).join(", ")
      if (names) notify("success", `Loot from ${data.enemyName}: ${names}`, 5000)
    })
    on("ogham_drop", (data) => notify("success", `${data.icon || "\uD83E\uDE78"} Ogham acquired: ${data.name}`, 5000))
    on("quest_progress_update", (data) => dispatch({ type: "SET_ACTIVE_QUESTS", payload: data.quests || [] }))
    on("style_rank_up", (data) => notify("success", `Fighting style ranked up: ${data.styleName || "Unknown"} \u2192 ${data.newRank || ""}`, 5000))
    on("artifact_transfer", (data) => {
      if (data.artifactName) notify("warning", `Artifact ${data.artifactName} transferred from ${data.fromName || "?"} to ${data.toName || "?"}`, 6000)
    })

    // Sig techs
    on("sig_tech_discovery", (data) => dispatch({ type: "SET_SIG_TECH_DISCOVERY", payload: data }))
    on("sig_tech_created", (d) => notify(d.success ? "success" : "error", d.message))
    on("sig_tech_ability_equipped", (d) => notify(d.success ? "success" : "error", d.message))
    on("sig_tech_abilities_list", () => {})

    // Raids
    on("raid_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("raid_update", () => {})

    return () => { for (const ref of refs) battleChannel.off("", ref) }
  }, [battleChannel, dispatch, notify])
}
