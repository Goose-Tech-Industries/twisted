import { api } from '$phoenix/api'

export interface LfpListing {
  id: number
  charId: number
  name: string
  level: number
  role: 'tank' | 'healer' | 'dps' | 'support' | 'any'
  note?: string
  region?: string
  posted_at?: string
}

interface ListResp { success: boolean; listings?: LfpListing[] }
interface SimpleResp { success: boolean; message?: string }

function createLfpStore() {
  let listings = $state<LfpListing[]>([])

  return {
    get listings() { return listings },

    async load() {
      const r = await api.get<ListResp>('/api/lfp')
      listings = r.listings ?? []
    },

    async list(role: LfpListing['role'], note: string) {
      const r = await api.post<SimpleResp>('/api/lfp/list', { role, note })
      if (r.success) await this.load()
      return r
    },

    async delist() {
      const r = await api.post<SimpleResp>('/api/lfp/delist', {})
      if (r.success) await this.load()
      return r
    }
  }
}

export const lfp = createLfpStore()
