import { api } from '$phoenix/api'

export interface Achievement {
  id: number
  key: string
  name: string
  description: string
  icon?: string
  category?: string
  /** 0..1, computed server-side from progress / target. */
  progress?: number
  unlocked?: boolean
  unlocked_at?: string
}

interface ListResp { success: boolean; achievements?: Achievement[] }
interface CharResp {
  success: boolean
  achievements?: Achievement[]
  unlocked?: Achievement[]
  totalPoints?: number
}

function createAchievementStore() {
  let all = $state<Achievement[]>([])
  let unlocked = $state<Achievement[]>([])

  return {
    get all() { return all },
    get unlocked() { return unlocked },
    get pct() {
      if (all.length === 0) return 0
      return Math.round((unlocked.length / all.length) * 100)
    },

    async loadAll() {
      const r = await api.get<ListResp>('/api/achievements')
      all = r.achievements ?? []
    },

    async loadCharacter(charId: number) {
      const r = await api.get<CharResp>(`/api/achievements/${charId}`)
      // Phoenix's char-scoped endpoint returns the full achievements list
      // with `unlocked: true` flagged on the unlocked ones — filter on
      // intake so the store-shape remains "list of unlocked achievements".
      const list = r.unlocked ?? r.achievements ?? []
      unlocked = list.filter(a => a.unlocked === true || (a.progress ?? 0) >= 1)
    }
  }
}

export const achievements = createAchievementStore()
