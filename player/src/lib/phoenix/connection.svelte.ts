// Phoenix Channels connection — Svelte 5 runes-based singleton.
// Holds the Socket, exposes connection state as a $state rune so any
// component can `$derived` from it without manual subscription.

import { Socket, type Channel } from 'phoenix'
import { browser } from '$app/environment'

type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error'

let socket: Socket | null = null
const channels = new Map<string, Channel>()
// Topics the server has rejected as `unmatched topic` / `unauthorized`.
// Keeping them in a denylist prevents reactive effects from spinning up
// fresh channels on every tick, which would re-fire the join error and
// spam the console.
const deadTopics = new Set<string>()
const warned = new Set<string>()

function createConnectionStore() {
  let state = $state<ConnState>('disconnected')
  let token = $state<string | null>(null)
  let userId = $state<number | null>(null)
  let lastError = $state<string | null>(null)

  return {
    get state() { return state },
    get token() { return token },
    get userId() { return userId },
    get socket() { return socket },
    get lastError() { return lastError },

    /** Open the Phoenix socket. Idempotent — calling twice with the same
     * token while already connected/connecting is a no-op. If a prior
     * attempt errored or the socket dropped, this WILL retry — without
     * that, a transient WS failure during boot leaves the socket dead
     * for the rest of the session.
     *
     * Each call logs `[phx] connect` to the console so the path is
     * visible in DevTools — when the player reports "no map data", the
     * first thing to check is whether connect() ever fired. */
    connect(authToken: string, uid: number) {
      if (!browser) return
      // Active socket with the same token AND a healthy state — nothing to do.
      if (socket && token === authToken && (state === 'connected' || state === 'connecting')) {
        return
      }

      // Tear down any prior socket/state cleanly before rebuilding.
      this.disconnect()

      console.info('[phx] connect', { url: '/socket', hasToken: !!authToken })

      token = authToken
      userId = uid
      state = 'connecting'

      const url = '/socket'
      socket = new Socket(url, { params: { token: authToken } })

      socket.onOpen(() => {
        console.info('[phx] socket open')
        state = 'connected'
        lastError = null
      })
      socket.onError((err: unknown) => {
        const e = err as { message?: string; reason?: string; code?: number } | undefined
        const reason = e?.reason || e?.message || (e?.code ? `code ${e.code}` : 'WebSocket error')
        console.warn('[phx] socket error', reason)
        state = 'error'
        lastError = reason
      })
      socket.onClose((evt: unknown) => {
        const e = evt as { code?: number; reason?: string } | undefined
        // Code 1000 = normal close, 1006 = abnormal (network/handshake fail).
        // 4xxx = app-defined (Phoenix uses 4001 etc. for auth rejection).
        if (state !== 'error' && e?.code && e.code !== 1000) {
          lastError = e.reason || `closed (${e.code})`
        }
        if (e?.code) console.info('[phx] socket close', e.code, e.reason)
        state = 'disconnected'
      })

      socket.connect()
    },

    disconnect() {
      for (const ch of channels.values()) ch.leave()
      channels.clear()
      deadTopics.clear()
      warned.clear()
      socket?.disconnect()
      socket = null
      token = null
      userId = null
      state = 'disconnected'
    },

    /** Get-or-join a channel. Multiple components can share the same
     * instance. Topics that the server doesn't recognize are
     * remembered separately so we don't reattempt every effect-tick. */
    channel(topic: string, params: object = {}): Channel | null {
      if (!socket) return null
      if (deadTopics.has(topic)) return null
      const cached = channels.get(topic)
      if (cached) return cached

      const ch = socket.channel(topic, params)
      ch.join()
        .receive('error', (resp) => {
          // Phoenix sends `reason: 'unmatched topic'` (with a space) when
          // no channel module is registered for the prefix; older
          // releases return the underscored form. Treat both as "this
          // server doesn't handle this topic" — silently leave + cache
          // the dead topic so we don't auto-rejoin or re-create the
          // channel on every reactive update.
          const reason = ((resp as { reason?: string })?.reason || '').toLowerCase()
          const isDead = reason.includes('unmatched') || reason === 'unauthorized'
          if (isDead) {
            deadTopics.add(topic)
            channels.delete(topic)
            try { ch.leave() } catch { /* may already be leaving */ }
            // One warning per topic is enough.
            if (!warned.has(topic)) {
              warned.add(topic)
              console.warn(`[phx] ${topic} unavailable (${reason}) — skipping subscription`)
            }
          } else {
            console.error(`[phx] join ${topic} failed`, resp)
          }
        })
      channels.set(topic, ch)
      return ch
    },

    /** Leave + drop a channel from the cache (e.g. when a player switches maps). */
    leave(topic: string) {
      const ch = channels.get(topic)
      if (!ch) return
      ch.leave()
      channels.delete(topic)
    }
  }
}

export const connection = createConnectionStore()
