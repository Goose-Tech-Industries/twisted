// =================================================================
// Map Channel Listeners (map:{mapId}) — receive only
// Events: player_list, player_joined/moved/left, ground items
// =================================================================
import { useEffect } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void

export function useMapChannelListeners(
  channel: Channel | null,
  dispatch: Dispatch,
  myCharId?: number,
) {
  useEffect(() => {
    if (!channel) return
    const refs: number[] = []
    const on = (event: string, cb: (payload: any) => void) => {
      refs.push(channel.on(event, cb))
    }

    // ── Player presence ──────────────────────────────────────────
    on("player_list", (data) => {
      const players = Array.isArray(data) ? data : data.players || []
      dispatch({ type: "SET_NEARBY_PLAYERS", payload: players })
    })

    on("player_joined", (player) => {
      if (!player || player.charId === myCharId) return
      dispatch({ type: "PLAYER_JOINED", payload: player })
    })

    on("player_moved", (data) => {
      dispatch({ type: "PLAYER_MOVED", payload: data })
    })

    on("player_left", (charId) => {
      dispatch({ type: "PLAYER_LEFT", payload: charId })
    })

    on("player_status_change", (data) => {
      dispatch({ type: "PLAYER_STATUS_CHANGE", payload: data })
    })

    // ── Ground items (may also come via game channel) ────────────
    on("ground_items", (items) => dispatch({ type: "SET_GROUND_ITEMS", payload: items || [] }))
    on("ground_item_added", (item) => dispatch({ type: "ADD_GROUND_ITEM", payload: item }))
    on("ground_item_removed", (data) => dispatch({ type: "REMOVE_GROUND_ITEM", payload: data.id }))

    // ── Structures ───────────────────────────────────────────────
    on("deployed_structures", (structs) => dispatch({ type: "SET_DEPLOYED_STRUCTURES", payload: structs || [] }))
    on("structure_deployed", (s) => dispatch({ type: "ADD_DEPLOYED_STRUCTURE", payload: s }))

    return () => { for (const ref of refs) channel.off("", ref) }
  }, [channel, dispatch, myCharId])
}
