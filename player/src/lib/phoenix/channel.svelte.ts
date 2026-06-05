// Per-channel reactive helper. Wrap a Phoenix Channel in runes so a
// component can `$state`-ify the latest payload of any event without
// bookkeeping subscriptions itself.

import type { Channel } from 'phoenix'
import { onDestroy } from 'svelte'
import { connection } from './connection.svelte'

export type Push<T = unknown> = (event: string, payload: T) => Promise<unknown>

/**
 * Subscribe to a Phoenix channel for the lifetime of the calling
 * component. Returns a `push(event, payload)` helper plus a getter for
 * the resolved channel. Auto-leaves on component destroy.
 */
export function useChannel(topic: string, joinParams: object = {}) {
  let channel = $state<Channel | null>(null)

  $effect(() => {
    if (connection.state !== 'connected') return
    channel = connection.channel(topic, joinParams)
  })

  onDestroy(() => {
    connection.leave(topic)
    channel = null
  })

  function on<T = unknown>(event: string, handler: (payload: T) => void) {
    let ref: number | undefined

    $effect(() => {
      const ch = channel
      if (!ch) return
      ref = ch.on(event, (payload: unknown) => handler(payload as T))
      return () => { if (ref !== undefined) ch.off(event, ref) }
    })
  }

  /**
   * Fire-and-forget push. Phoenix `handle_in/3` callbacks default to
   * `{:noreply, socket}`, which never sends an `:ok` reply — only the
   * RPC-style `{:reply, {:ok, ...}, socket}` ones do. Resolving on
   * timeout (instead of rejecting) lets the same helper handle both.
   * If you specifically need the reply payload, use `request()`.
   */
  function push<T>(event: string, payload: T): Promise<unknown> {
    return new Promise((resolve) => {
      const ch = channel
      if (!ch) return resolve(undefined)
      ch.push(event, payload as object)
        .receive('ok', resolve)
        .receive('error', resolve)
        .receive('timeout', () => resolve(undefined))
    })
  }

  /**
   * RPC-style push — rejects on `:error` or timeout. Use this when the
   * caller actually needs the server's reply (e.g. a transactional
   * action where success/failure must be surfaced to the user).
   */
  function request<T>(event: string, payload: T, timeoutMs = 10_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const ch = channel
      if (!ch) return reject(new Error(`channel ${topic} not joined`))
      ch.push(event, payload as object, timeoutMs)
        .receive('ok', resolve)
        .receive('error', reject)
        .receive('timeout', () => reject(new Error(`${event} timed out`)))
    })
  }

  return {
    get channel() { return channel },
    on,
    push,
    request
  }
}
