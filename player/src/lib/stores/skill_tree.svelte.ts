import { api } from '$phoenix/api'

export interface SkillNode {
  id: number
  key: string
  name: string
  description?: string
  icon?: string
  tier: number
  cost?: number
  required_node_ids?: number[]
  unlocked?: boolean
  available?: boolean
}

export interface ProgressionAggregate {
  level?: { level: number; xp: number; xpNeeded: number }
  quests?: { active: number; completed: number }
  battleRecord?: Record<string, unknown>
  gathering?: Array<{ skill: string; level: number; xp: number }>
  jobs?: Array<{ id: number; name: string; level: number }>
}

export interface ProgressionResp {
  success: boolean
  /** Phoenix shape: aggregate progression bundle. */
  progression?: ProgressionAggregate
  /** Future shape (when a skill tree is added): explicit nodes list. */
  ap?: number
  unspent_ap?: number
  level?: number
  unlocked_nodes?: number[]
  nodes?: SkillNode[]
}

function createSkillTreeStore() {
  let nodes = $state<SkillNode[]>([])
  let unspentAp = $state<number>(0)
  let unlocked = $state<Set<number>>(new Set())
  let aggregate = $state<ProgressionAggregate | null>(null)

  return {
    get nodes() { return nodes },
    get unspentAp() { return unspentAp },
    get unlocked() { return unlocked },
    get aggregate() { return aggregate },

    async load(charId: number) {
      try {
        const r = await api.get<ProgressionResp>(`/api/progression/${charId}`)
        if (r.nodes) nodes = r.nodes
        if (r.unlocked_nodes) unlocked = new Set(r.unlocked_nodes)
        unspentAp = r.unspent_ap ?? 0
        if (r.progression) aggregate = r.progression
      } catch { /* progression endpoint may be optional */ }
    },

    async unlock(nodeId: number) {
      const r = await api.post<{ success: boolean; message?: string }>(
        '/api/progression/unlock',
        { nodeId }
      )
      if (r.success) {
        unlocked = new Set([...unlocked, nodeId])
      }
      return r
    }
  }
}

export const skillTree = createSkillTreeStore()
