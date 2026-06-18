// =================================================================
// Social Channel Listeners (social:lobby)
// Events: chat, party, guild, trade, greet, inspect, emotes, staff,
//         minigame results, economy results
// =================================================================
import { useEffect } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void
type Notify = (type: string, message: string, duration?: number) => void

export function useSocialChannelListeners(
  channel: Channel | null,
  dispatch: Dispatch,
  notify: Notify,
) {
  useEffect(() => {
    if (!channel) return
    const refs: number[] = []
    const on = (event: string, cb: (payload: any) => void) => {
      refs.push(channel.on(event, cb))
    }

    // ── Chat ─────────────────────────────────────────────────────
    on("chat_msg", (data) => dispatch({ type: "ADD_CHAT_MESSAGE", payload: data }))

    // ── Greet system ─────────────────────────────────────────────
    on("greet_ack", (data) => dispatch({ type: "ADD_HAS_GREETED_ID", payload: data.targetCharId }))
    on("greet_received", (data) => {
      dispatch({ type: "ADD_GREETED_ID", payload: data.fromCharId })
      notify("info", `${data.fromName} greets you!`)
    })

    // ── Inspect ──────────────────────────────────────────────────
    on("inspect_result", (data) => {
      if (data.success && data.character) {
        dispatch({ type: "SET_INSPECT_TARGET", payload: data.character })
      }
    })

    // ── Party ────────────────────────────────────────────────────
    on("party_update", (data) => dispatch({ type: "SET_PARTY_MEMBERS", payload: data.members || [] }))
    on("party_invited", (data) => notify("info", `${data.inviterName} invited you to a party!`, 8000))
    on("party_msg", (data) => notify(data.type === "error" ? "error" : "info", data.text))

    // ── Friends ──────────────────────────────────────────────────
    on("friend_request_incoming", (data) => notify("info", `${data.fromName} sent you a friend request!`, 6000))
    on("spar_requested", (data) => notify("info", `${data.fromName} wants to spar with you!`, 8000))
    on("spar_sent", (data) => notify("info", `Spar request sent to ${data.targetName}`))
    on("spar_error", (msg) => notify("error", typeof msg === "string" ? msg : msg?.message || "Spar error"))

    // ── Guild ────────────────────────────────────────────────────
    on("guild_joined", (data) => notify("success", `Joined guild: ${data.guildName}`))
    on("guild_left", () => notify("info", "You left the guild"))
    on("guild_msg", (data) => notify(data.type === "error" ? "error" : "info", data.text))

    // ── Trade ────────────────────────────────────────────────────
    on("trade_msg", (data) => notify(data.type === "error" ? "error" : "info", data.text))
    on("trade_requested", (data) => dispatch({ type: "SET_TRADE_REQUEST", payload: data }))
    on("trade_start", (data) => dispatch({ type: "SET_TRADE", payload: data }))
    on("trade_update", (data) => dispatch({ type: "SET_TRADE", payload: data }))
    on("trade_complete", () => { dispatch({ type: "SET_TRADE", payload: null }); notify("success", "Trade complete!") })
    on("trade_cancelled", () => { dispatch({ type: "SET_TRADE", payload: null }); notify("info", "Trade cancelled") })

    // ── Presence ─────────────────────────────────────────────────
    on("emote_bubble", (data) => {
      dispatch({ type: "PLAYER_STATUS_CHANGE", payload: { charId: data.charId, emote: data.text } })
    })
    on("typing_dm_indicator", () => {})
    on("player_title_changed", (data) => {
      dispatch({ type: "PLAYER_STATUS_CHANGE", payload: { charId: data.charId, title: data.title } })
    })
    on("player_presence_changed", (data) => {
      dispatch({ type: "PLAYER_STATUS_CHANGE", payload: { charId: data.charId, presence: data.presence } })
    })
    on("player_arena_changed", () => {})

    // ── Minigame results ─────────────────────────────────────────
    on("fish_bite", () => notify("warning", "Something is biting!", 3000))
    on("fish_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("dice_result", (d) => notify("info", d.message || `Rolled: ${d.result}`))
    on("card_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("gather_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("capture_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("mount_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("bounty_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("housing_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("bank_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("arena_bet_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("guestbook_result", (d) => notify(d.success ? "success" : "error", d.message))

    // ── Staff ────────────────────────────────────────────────────
    on("staff_sign_on", () => {})
    on("staff_sign_off", () => {})
    on("staff_panel_presence", () => {})
    on("staff_chat_msg", () => {})
    on("staff_chat_history", () => {})
    on("staff_nudge", () => notify("warning", "A staff member nudged you!"))
    on("staff_typing", () => {})

    // ── Events ───────────────────────────────────────────────────
    on("event_announcement", (data) => notify("info", `Upcoming event: ${data.name}`, 8000))
    on("notification_msg", (data) => {
      const nType = data.type === "damage" ? "warning" : "info"
      notify(nType, data.text)
    })

    return () => { for (const ref of refs) channel.off("", ref) }
  }, [channel, dispatch, notify])
}
