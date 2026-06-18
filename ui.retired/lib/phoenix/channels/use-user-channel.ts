// =================================================================
// User Channel Listeners (user:{charId}) — receive only
// Events: notifications, companions, quest updates, mail, warps
// =================================================================
import { useEffect } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void
type Notify = (type: string, message: string, duration?: number) => void

export function useUserChannelListeners(
  channel: Channel | null,
  dispatch: Dispatch,
  notify: Notify,
  onBattleStartJoin?: (battleId: number) => void,
) {
  useEffect(() => {
    if (!channel) return
    const refs: number[] = []
    const on = (event: string, cb: (payload: any) => void) => {
      refs.push(channel.on(event, cb))
    }

    // ── Notifications ────────────────────────────────────────────
    on("notification", (data) => notify(data.type || "info", data.message))
    on("notification_msg", (data) => {
      const nType = data.type === "damage" ? "warning" : "info"
      notify(nType, data.text)
    })
    on("error_msg", (msg) => notify("error", typeof msg === "string" ? msg : msg?.message || "Error"))
    on("force_disconnect", (data) => {
      const reason = typeof data === "string" ? data : data?.reason || "Disconnected by server."
      notify("error", reason)
    })

    // ── Companions ───────────────────────────────────────────────
    on("companion_list", (data) => dispatch({ type: "SET_COMPANIONS", payload: data || [] }))
    on("companion_joined", (data) => dispatch({ type: "ADD_COMPANION", payload: data }))
    on("companion_dismissed", (data) => dispatch({ type: "REMOVE_COMPANION", payload: data.npcId }))
    on("companion_moved", (data) => {
      dispatch({ type: "UPDATE_COMPANION", payload: { npcId: data.npcId, changes: { x: data.x, y: data.y } } })
    })
    on("companion_tactics_changed", (data) => {
      dispatch({ type: "UPDATE_COMPANION", payload: { npcId: data.npcId, changes: { tactics: data.tactics } } })
    })

    // ── Quest & progression ──────────────────────────────────────
    on("quest_progress_update", (data) => dispatch({ type: "SET_ACTIVE_QUESTS", payload: data.quests || [] }))

    // ── Mail ─────────────────────────────────────────────────────
    on("mail_unread_count", (data) => dispatch({ type: "SET_MAIL_UNREAD", payload: data.count }))

    // ── Warps ────────────────────────────────────────────────────
    on("warp_discovered", (data) => notify("success", `Discovered warp: ${data.name}`))

    // ── Battle start (server tells this user to join a battle) ───
    on("battle_start_join", (data) => {
      if (data.battle_id && onBattleStartJoin) {
        onBattleStartJoin(data.battle_id)
      }
    })

    // ── Duel expiry ──────────────────────────────────────────────
    on("duel_expired", () => notify("info", "Duel request expired"))

    return () => { for (const ref of refs) channel.off("", ref) }
  }, [channel, dispatch, notify, onBattleStartJoin])
}
