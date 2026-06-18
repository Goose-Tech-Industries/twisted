// Social actions → social:lobby (chat, party, guild, trade, friends, greet, staff)
import { useCallback } from "react"
import type { Channel } from "phoenix"

type Notify = (type: string, message: string) => void

export function useSocialActions(
  socialChannel: Channel | null,
  notify: Notify,
) {
  // Chat
  const chatSend = useCallback((text: string, channel: string, targetCharId?: number) => {
    socialChannel?.push("chat_send", { text, channel, targetCharId })
  }, [socialChannel])

  const emote = useCallback((emoteText: string) => {
    socialChannel?.push("emote", { text: emoteText })
  }, [socialChannel])

  const setPresence = useCallback((presence: string, message?: string) => {
    socialChannel?.push("set_presence", { presence, message })
  }, [socialChannel])

  const titleChanged = useCallback((title: string | null) => {
    socialChannel?.push("title_changed", { title })
  }, [socialChannel])

  const typingDm = useCallback((targetCharId: number) => {
    socialChannel?.push("typing_dm", { targetCharId })
  }, [socialChannel])

  // Friends
  const friendRequestSend = useCallback((targetCharId: number) => {
    socialChannel?.push("friend_request_sent", { targetCharId })
  }, [socialChannel])

  // Greet
  const greetPlayer = useCallback((targetCharId: number) => {
    socialChannel?.push("greet_player", { targetCharId })
  }, [socialChannel])

  const inspectPlayer = useCallback((targetCharId: number) => {
    socialChannel?.push("inspect_player", { targetCharId })
  }, [socialChannel])

  // Party
  const partyInvite = useCallback((targetCharId: number) => {
    socialChannel?.push("party_invite", { targetCharId })
    notify("info", "Party invite sent")
  }, [socialChannel, notify])

  const partyAccept = useCallback((partyId: number) => {
    socialChannel?.push("party_accept", { partyId })
  }, [socialChannel])

  const partyDecline = useCallback((partyId: number) => {
    socialChannel?.push("party_decline", { partyId })
  }, [socialChannel])

  const partyKick = useCallback((targetCharId: number) => {
    socialChannel?.push("party_kick", { targetCharId })
  }, [socialChannel])

  const partyLeave = useCallback(() => {
    socialChannel?.push("party_leave", {})
  }, [socialChannel])

  // Spar
  const sparRequest = useCallback((targetCharId: number) => {
    socialChannel?.push("spar_request", { targetCharId })
  }, [socialChannel])

  const sparAccept = useCallback((fromCharId: number) => {
    socialChannel?.push("spar_accept", { fromCharId })
  }, [socialChannel])

  // Trade
  const tradeRequest = useCallback((targetCharId: number) => {
    socialChannel?.push("trade_request", { targetCharId })
  }, [socialChannel])

  // Guild
  const guildSetRank = useCallback((targetCharId: number, rank: string) => {
    socialChannel?.push("guild_set_rank", { targetCharId, rank })
  }, [socialChannel])

  // Staff
  const staffPanelJoin = useCallback(() => {
    socialChannel?.push("staff_panel_join", {})
  }, [socialChannel])

  const staffNudge = useCallback((targetSocketId: string) => {
    socialChannel?.push("staff_nudge", { targetSocketId })
  }, [socialChannel])

  const staffSetStatus = useCallback((status: string) => {
    socialChannel?.push("staff_panel_status", { status })
  }, [socialChannel])

  const staffSetColor = useCallback((color: string) => {
    socialChannel?.push("staff_set_color", { color })
  }, [socialChannel])

  const staffTyping = useCallback(() => {
    socialChannel?.push("staff_typing", {})
  }, [socialChannel])

  return {
    chatSend, emote, setPresence, titleChanged, typingDm,
    friendRequestSend, greetPlayer, inspectPlayer,
    partyInvite, partyAccept, partyDecline, partyKick, partyLeave,
    sparRequest, sparAccept, tradeRequest, guildSetRank,
    staffPanelJoin, staffNudge, staffSetStatus, staffSetColor, staffTyping,
  }
}
