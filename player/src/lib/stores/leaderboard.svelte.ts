import { api } from '$phoenix/api'

export type LeaderboardType = 'level' | 'gold' | 'pvp' | 'achievements' | 'kills'

export interface LeaderRow {
  rank: number
  charId: number
  name: string
  level: number
  value: number
  guild_name?: string
}

interface Resp {
  success: boolean
  /** Phoenix uses `entries`; older tooling sent `leaderboard` or `rows`. */
  entries?: LeaderRow[]
  leaderboard?: LeaderRow[]
  rows?: LeaderRow[]
  type?: string
}

function createLeaderboardStore() {
  let rows = $state<LeaderRow[]>([])
  let active = $state<LeaderboardType>('level')

  return {
    get rows() { return rows },
    get active() { return active },

    async load(type: LeaderboardType) {
      active = type
      const r = await api.get<Resp>(`/api/leaderboard/${type}`)
      rows = r.entries ?? r.leaderboard ?? r.rows ?? []
    }
  }
}

export const leaderboard = createLeaderboardStore()
