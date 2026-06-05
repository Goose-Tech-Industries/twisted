// Quest store. REST-loaded from /api/quests, mutated via /api/quests/progress
// + /api/quests/complete.

import { api } from '$phoenix/api'

export type QuestStatus = 'active' | 'completed' | 'failed' | 'available'

export interface QuestObjective {
  key: string
  description: string
  current: number
  required: number
  completed?: boolean
}

export interface Quest {
  id: number
  key?: string
  name: string
  description?: string
  icon?: string
  status: QuestStatus
  level_required?: number
  objectives?: QuestObjective[]
  rewards?: { xp?: number; gold?: number; items?: Array<{ item_id: number; qty: number }> }
}

interface ListResp { success: boolean; quests?: Quest[] }
interface OneResp { success: boolean; quest?: Quest; message?: string }
interface BoardResp { success: boolean; bounties?: Quest[]; quests?: Quest[] }

function createQuestStore() {
  let quests = $state<Quest[]>([])
  let board = $state<Quest[]>([])
  let trackedId = $state<number | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)

  return {
    get quests() { return quests },
    get board() { return board },
    get tracked() {
      const id = trackedId
      return quests.find(q => q.id === id) ?? null
    },
    get active() { return quests.filter(q => q.status === 'active') },
    get completed() { return quests.filter(q => q.status === 'completed') },
    get loading() { return loading },
    get error() { return error },

    async load() {
      loading = true
      error = null
      try {
        const r = await api.get<ListResp>('/api/quests')
        quests = r.quests ?? []
      } catch (e) {
        error = (e as Error).message
      } finally {
        loading = false
      }
    },

    async loadBoard() {
      try {
        const r = await api.get<BoardResp>('/api/questboard')
        board = r.bounties ?? r.quests ?? []
      } catch { /* board is optional */ }
    },

    async complete(charId: number, questId: number) {
      const r = await api.post<{ success: boolean; message?: string }>(
        '/api/quests/complete',
        { charId, questId }
      )
      if (r.success) await this.load()
      else error = r.message ?? 'Could not turn in'
      return r
    },

    track(questId: number | null) {
      trackedId = questId
    },

    /** Apply a partial update from a Phoenix push. */
    patch(qid: number, delta: Partial<Quest>) {
      quests = quests.map(q => q.id === qid ? { ...q, ...delta } : q)
    },

    /** Replace the quest list wholesale. Used by init_self to seed the
     * panel without a separate REST round-trip. Accepts any shape and
     * coerces missing fields conservatively. */
    set(list: Quest[] | unknown[]) {
      const safe = (Array.isArray(list) ? list : []) as Partial<Quest>[]
      quests = safe.map(q => ({
        ...q,
        id: q.id ?? 0,
        name: q.name ?? 'Untitled quest',
        status: q.status ?? 'active'
      }))
    }
  }
}

export const quests = createQuestStore()
