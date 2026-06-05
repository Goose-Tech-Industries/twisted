// Character store — owns the active character + a list of the user's
// characters. Loaded from REST; live mutations come via Phoenix events.
//
// Phoenix REST contract (te_phoenix_web/controllers/game_controller.ex):
//   GET  /api/characters              → { success, count, characters: [...] }
//   POST /api/characters/create       → { success, message, charId }
//   GET  /api/characters/:id          → { success, character }
//   POST /api/characters/:id/delete   → { success, message }

import { api } from '$phoenix/api'

/**
 * Character shape — superset of what Phoenix returns. All gameplay
 * fields are optional with sane defaults so the UI can render against
 * partial data (e.g. mid-load, or before the per-tick stat push lands).
 */
export interface Character {
  id: number
  name: string
  level: number
  current_hp: number
  max_hp: number
  current_mp: number
  max_mp: number
  /** Phoenix returns total `experience` (not separate current/next). */
  experience?: number
  /** Computed level threshold — populated by the level-curve util when known. */
  next_xp?: number
  /** Gold lives in a separate currency feed; UI reads from inventory store
   * when available. Kept here for components that take a unified Character. */
  gold?: number
  map_id: number
  x: number
  y: number
  /** Numeric IDs from Phoenix; *_name strings come from the JOIN. */
  race_id?: number
  class_id?: number
  race_name?: string | null
  class_name?: string | null
  icon?: string
  /** Combat stats — populated on full character fetch + init_self push. */
  atk?: number
  def?: number
  mo?: number
  md?: number
  speed?: number
  luck?: number
  limitbreak?: number
  breaklevel?: number
}

interface ListResp {
  success: boolean
  count?: number
  characters?: Character[]
  message?: string
}

interface OneResp {
  success: boolean
  character?: Character
  message?: string
}

interface CreateResp {
  success: boolean
  charId?: number
  message?: string
}

function createCharacterStore() {
  let list = $state<Character[]>([])
  let active = $state<Character | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)

  return {
    get list() { return list },
    get active() { return active },
    get loading() { return loading },
    get error() { return error },

    async loadList() {
      loading = true
      error = null
      try {
        const res = await api.get<ListResp>('/api/characters')
        if (!res.success) {
          error = res.message ?? 'Could not load characters'
          return
        }
        list = res.characters ?? []
      } catch (e) {
        error = (e as Error).message
      } finally {
        loading = false
      }
    },

    async loadActive(charId: number) {
      loading = true
      try {
        const res = await api.get<OneResp>(`/api/characters/${charId}`)
        if (!res.success || !res.character) {
          error = res.message ?? 'Character not found'
          return
        }
        active = res.character
      } catch (e) {
        error = (e as Error).message
      } finally {
        loading = false
      }
    },

    async create(name: string, race: string): Promise<number> {
      loading = true
      try {
        const res = await api.post<CreateResp>('/api/characters/create', { name, race })
        if (!res.success || !res.charId) {
          throw new Error(res.message ?? 'Create failed')
        }
        await this.loadList()
        return res.charId
      } finally {
        loading = false
      }
    },

    /** Apply a partial update from a Phoenix push (e.g. init_self / hp_changed). */
    patch(delta: Partial<Character>) {
      if (!active) {
        active = delta as Character
        return
      }
      active = { ...active, ...delta }
    },

    setActive(c: Character) { active = c },

    clear() {
      active = null
      list = []
    }
  }
}

export const character = createCharacterStore()
