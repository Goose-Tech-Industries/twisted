// =================================================================
// Game Channel Listeners (game:lobby)
// Events: map_data, event_queue, init_self, force_move, NPC replies,
//         equip/rest/respawn results, AI features, DM mode
// =================================================================
import { useEffect } from "react"
import type { Channel } from "phoenix"

type Dispatch = (action: { type: string; payload?: unknown }) => void
type Notify = (type: string, message: string, duration?: number) => void

export function useGameChannelListeners(
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

    // ── Map & World ──────────────────────────────────────────────
    on("map_data", (data) => dispatch({ type: "SET_MAP", payload: data }))
    on("tile_palette", (tiles) => dispatch({ type: "SET_TILE_PALETTE", payload: tiles || [] }))
    on("force_move", (data) => {
      dispatch({ type: "FORCE_MOVE", payload: data })
    })
    on("ground_items", (items) => dispatch({ type: "SET_GROUND_ITEMS", payload: items || [] }))
    on("ground_item_added", (item) => dispatch({ type: "ADD_GROUND_ITEM", payload: item }))
    on("ground_item_removed", (data) => dispatch({ type: "REMOVE_GROUND_ITEM", payload: data.id }))
    on("deployed_structures", (structs) => dispatch({ type: "SET_DEPLOYED_STRUCTURES", payload: structs || [] }))
    on("structure_deployed", (s) => dispatch({ type: "ADD_DEPLOYED_STRUCTURE", payload: s }))
    on("active_statuses", (statuses) => dispatch({ type: "SET_ACTIVE_STATUSES", payload: statuses || [] }))
    on("overworld_effects", (fx) => dispatch({ type: "SET_OVERWORLD_EFFECTS", payload: fx }))

    // ── Event queue (dialogue, NPC choices, notifications) ──────
    on("event_queue", (events) => {
      for (const evt of events || []) {
        if (evt.cmd === "dialogue") {
          dispatch({ type: "SET_DIALOGUE", payload: { speaker: evt.speaker || "NPC", text: evt.text || "", choices: [] } })
        } else if (evt.cmd === "npc_choice_menu") {
          const choices = (evt.choices || []).map((c: any, i: number) => ({ id: i + 1, label: c.text || c.id, choiceId: c.id }))
          dispatch({ type: "SET_DIALOGUE", payload: { speaker: evt.npcName || "NPC", text: "", choices } })
        } else if (evt.cmd === "npc_talk_prompt") {
          dispatch({ type: "SET_DIALOGUE", payload: { speaker: evt.npcName || "NPC", text: `*${evt.npcName || "The NPC"} awaits your words...*`, choices: [] } })
        } else if (evt.cmd === "notification") {
          notify(evt.type === "error" ? "error" : "info", evt.text || "")
        }
      }
    })

    // ── Init self (after character select) ───────────────────────
    on("init_self", (data) => {
      if (!data.tutorialDone) dispatch({ type: "SET_SHOW_TUTORIAL", payload: true })
      if (data.enableGreetSystem) dispatch({ type: "SET_GREET_SYSTEM", payload: true })
      if (Array.isArray(data.greetedIds)) dispatch({ type: "SET_GREETED_IDS", payload: data.greetedIds })
      if (Array.isArray(data.hasGreetedIds)) dispatch({ type: "SET_HAS_GREETED_IDS", payload: data.hasGreetedIds })
    })

    // ── NPC dialogue ─────────────────────────────────────────────
    on("npc_reply", (data) => {
      dispatch({ type: "SET_DIALOGUE", payload: { speaker: data.npcName, text: data.text, choices: [] } })
    })
    on("npc_need_resolved", (data) => {
      notify("success", data.message || `${data.npcName} thanks you! +${data.reward_gold}g +${data.reward_xp}xp`, 5000)
    })
    on("npc_relationships", () => {})

    // ── Arena ────────────────────────────────────────────────────
    on("arena_entered", (data) => notify("info", `Entered arena: ${data.name}`))
    on("arena_left", () => notify("info", "Left arena zone"))

    // ── Game system results ──────────────────────────────────────
    on("equip_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("interact_result", (d) => { if (!d.success && d.message) notify("error", d.message) })
    on("rest_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("respawn_complete", (d) => notify("info", `Respawned with ${d.hp} HP`))
    on("ap_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("train_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("master_train_result", (d) => notify(d.success ? "success" : "error", d.message))
    on("job_result", (d) => notify(d.success ? "success" : "error", d.message))

    // ── AI features ──────────────────────────────────────────────
    on("ai_quest_generated", (d) => notify("success", `New quest: ${d.name}`, 6000))
    on("ai_item_text", (d) => notify("info", `${d.itemName}: ${d.text}`, 5000))
    on("ai_lore_generated", (d) => {
      dispatch({ type: "SET_DIALOGUE", payload: { speaker: "Ancient Text", text: d.text, choices: [] } })
    })
    on("ai_biography", (d) => {
      dispatch({ type: "SET_DIALOGUE", payload: { speaker: "Biography", text: d.text, choices: [] } })
    })
    on("ai_crafting_hint_result", (d) => notify("info", `Crafting idea: ${d.hint}`, 5000))

    // ── DM mode ──────────────────────────────────────────────────
    on("dm_response", (d) => {
      dispatch({ type: "SET_DIALOGUE", payload: { speaker: d.speaker, text: d.text, choices: [] } })
    })
    on("dm_assist_result", (d) => notify("info", d.text, 8000))
    on("dm_campaign_created", () => {})
    on("dm_campaigns_list", () => {})
    on("dm_character_sheets", () => {})
    on("dm_session_started", (d) => notify("success", `Session ${d.sessionNumber} started!`, 5000))
    on("dm_session_ended", () => notify("info", "Session ended.", 5000))
    on("event_list_result", () => {})

    // ── Cutscene ─────────────────────────────────────────────────
    on("cutscene_play", (data) => {
      if (data.events) {
        for (const evt of data.events) {
          dispatch({ type: "SET_DIALOGUE", payload: { speaker: evt.speaker || "", text: evt.text || "", choices: [] } })
        }
      }
    })
    on("teleport", () => {})

    // ── Abilities list ───────────────────────────────────────────
    on("abilities_list", (data) => dispatch({ type: "SET_ACTIVE_STATUSES", payload: data || [] }))

    return () => { for (const ref of refs) channel.off("", ref) }
  }, [channel, dispatch, notify])
}
