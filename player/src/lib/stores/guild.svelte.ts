import { api } from '$phoenix/api'

export interface GuildMember {
  charId: number
  name: string
  level: number
  rank: string
  online?: boolean
}

export interface GuildNews {
  id: number
  body: string
  posted_by: string
  posted_at: string
}

export interface Guild {
  id: number
  name: string
  description?: string
  level?: number
  members?: GuildMember[]
  member_count?: number
}

interface GuildsResp { success: boolean; guilds?: Guild[] }
interface OneResp { success: boolean; guild?: Guild; message?: string }
interface MembersResp { success: boolean; members?: GuildMember[] }
interface NewsResp { success: boolean; news?: GuildNews[] }

function createGuildStore() {
  let mine = $state<Guild | null>(null)
  let directory = $state<Guild[]>([])
  let news = $state<GuildNews[]>([])

  return {
    get mine() { return mine },
    get directory() { return directory },
    get news() { return news },

    async loadDirectory() {
      const r = await api.get<GuildsResp>('/api/guilds')
      directory = r.guilds ?? []
    },

    async load(guildId: number) {
      const r = await api.get<OneResp>(`/api/guilds/${guildId}`)
      if (r.success && r.guild) mine = r.guild
    },

    async loadMembers(guildId: number) {
      const r = await api.get<MembersResp>(`/api/guilds/${guildId}/members`)
      if (mine && r.members) mine = { ...mine, members: r.members }
    },

    async loadNews(guildId: number) {
      const r = await api.get<NewsResp>(`/api/guilds/${guildId}/news`)
      news = r.news ?? []
    },

    async postNews(guildId: number, body: string) {
      const r = await api.post<{ success: boolean; message?: string }>(
        `/api/guilds/${guildId}/news`,
        { body }
      )
      if (r.success) await this.loadNews(guildId)
      return r
    },

    async create(name: string, description: string) {
      const r = await api.post<{ success: boolean; guildId?: number; message?: string }>(
        '/api/guilds/create',
        { name, description }
      )
      if (r.success && r.guildId) await this.load(r.guildId)
      return r
    }
  }
}

export const guild = createGuildStore()
