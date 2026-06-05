// Debug-overlay registry. Panels self-register their wiring status so
// the overlay (Ticket P) can show ✅ REAL / ○ EMPTY / ⚠ STUB / ? UNKNOWN
// at a glance without us guessing which surfaces are actually live.

export type WiringStatus = 'real' | 'empty' | 'stub' | 'unknown'

export interface WiringEntry {
  name: string
  status: WiringStatus
  /** Wall-clock ms of the last status change. Used to render "5s ago". */
  lastUpdate: number
}

function createDebugStore() {
  let entries = $state<WiringEntry[]>([])
  let dismissed = $state(false)

  return {
    get entries() { return entries },
    get dismissed() { return dismissed },

    /** Idempotent — calling register twice for the same name is a no-op
     * after the first registration. Initial status defaults to 'stub'. */
    register(name: string, initial: WiringStatus = 'stub') {
      if (entries.find(e => e.name === name)) return
      entries = [...entries, { name, status: initial, lastUpdate: Date.now() }]
    },

    /** Update an existing entry's status. Silently no-ops if the panel
     * forgot to register first — that's a bug to surface in dev, not
     * something the overlay needs to crash on.
     *
     * IMPORTANT: must NOT reassign `entries` when nothing changed, or
     * an effect that calls update() on every run will keep dirtying
     * the $state and Svelte will eventually trip
     * effect_update_depth_exceeded. The early return below handles the
     * idempotent case. */
    update(name: string, status: WiringStatus) {
      const idx = entries.findIndex(e => e.name === name)
      if (idx === -1) return
      if (entries[idx].status === status) return
      // Mutate via a fresh array so Svelte tracks the change.
      const next = entries.slice()
      next[idx] = { ...entries[idx], status, lastUpdate: Date.now() }
      entries = next
    },

    /** Dismiss the overlay until next refresh. */
    dismiss() { dismissed = true },

    /** Reset between full page navigations (e.g., switching characters). */
    clear() {
      entries = []
      dismissed = false
    }
  }
}

export const debug = createDebugStore()
