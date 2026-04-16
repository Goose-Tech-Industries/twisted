// ═══════════════════════════════════════════════════════════════
// y-phoenix adapter — Yjs CRDT sync over a Phoenix Channel
// ═══════════════════════════════════════════════════════════════
//
// Provides a thin transport binding between a Yjs Y.Doc and a Phoenix
// Channel. Handles:
//
//   - Outgoing updates: any local Y.Doc mutation is encoded and pushed
//     as a "yjs:update" message on the channel.
//   - Incoming updates: channel "yjs:update" messages are decoded and
//     applied to the local Y.Doc.
//   - Awareness (cursor presence, user state): broadcast via "yjs:awareness"
//     messages on the same channel. Receives awareness from other clients
//     and surfaces them via the local awareness instance.
//   - Initial sync: on join, the client sends a "yjs:sync_request" and
//     receives back the full state vector from the server.
//
// This is the transport layer only. The server-side MapChannel (M0-5)
// persists Yjs snapshots to game_map_drafts and broadcasts fanout.
//
// ═══════════════════════════════════════════════════════════════

import * as Y from "yjs"
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness"

/**
 * Attach a Yjs document to a Phoenix Channel.
 *
 * @param {Y.Doc} ydoc - the Y.Doc to sync
 * @param {Object} channel - a Phoenix Channel instance (already joined)
 * @returns {{awareness: Awareness, destroy: () => void}}
 */
export function bindYjsToChannel(ydoc, channel) {
  const awareness = new Awareness(ydoc)

  // ── Outgoing: local Y.Doc update → channel ──
  const onDocUpdate = (update, origin) => {
    // Skip echoes from the channel itself to avoid loops
    if (origin === channel) return
    channel.push("yjs:update", { update: toBase64(update) })
  }

  const onAwarenessChange = ({ added, updated, removed }) => {
    const changedClients = added.concat(updated).concat(removed)
    const payload = encodeAwarenessUpdate(awareness, changedClients)
    channel.push("yjs:awareness", { update: toBase64(payload) })
  }

  ydoc.on("update", onDocUpdate)
  awareness.on("update", onAwarenessChange)

  // ── Incoming: channel messages → local Y.Doc / awareness ──
  const refDocUpdate = channel.on("yjs:update", ({ update }) => {
    if (typeof update === "string") {
      Y.applyUpdate(ydoc, fromBase64(update), channel)
    }
  })

  const refAwareness = channel.on("yjs:awareness", ({ update }) => {
    if (typeof update === "string") {
      applyAwarenessUpdate(awareness, fromBase64(update), channel)
    }
  })

  // ── Initial sync: request full state from server ──
  channel
    .push("yjs:sync_request", {})
    .receive("ok", ({ snapshot }) => {
      if (snapshot) {
        Y.applyUpdate(ydoc, fromBase64(snapshot), channel)
      }
    })
    .receive("error", (err) => {
      console.warn("[y-phoenix] sync request failed", err)
    })

  const destroy = () => {
    ydoc.off("update", onDocUpdate)
    awareness.off("update", onAwarenessChange)
    channel.off("yjs:update", refDocUpdate)
    channel.off("yjs:awareness", refAwareness)
    awareness.destroy()
  }

  return { awareness, destroy }
}

// ── Base64 helpers — Uint8Array ↔ string transport ──

function toBase64(bytes) {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64(str) {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
