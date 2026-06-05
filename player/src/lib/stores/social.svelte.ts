// Social state — party, friends. Loaded from REST + mutated by social
// channel events.

import { api } from '$phoenix/api'

export interface PartyMember {
  charId: number
  name: string
  level: number
  current_hp?: number
  max_hp?: number
  online?: boolean
  isLeader?: boolean
}

export interface Party {
  id: number
  leaderId: number
  members: PartyMember[]
}

export interface Friend {
  charId: number
  name: string
  level: number
  online: boolean
  status?: string
}

interface PartyResp { success: boolean; party?: Party | null }
interface FriendsResp { success: boolean; friends?: Friend[] }
interface SimpleResp { success: boolean; message?: string }

function createSocialStore() {
  let party = $state<Party | null>(null)
  let friends = $state<Friend[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  return {
    get party() { return party },
    get friends() { return friends },
    get loading() { return loading },
    get error() { return error },

    async loadParty() {
      try {
        const r = await api.get<PartyResp>('/api/party')
        party = r.party ?? null
      } catch (e) { error = (e as Error).message }
    },

    async loadFriends() {
      try {
        const r = await api.get<FriendsResp>('/api/friends')
        friends = r.friends ?? []
      } catch (e) { error = (e as Error).message }
    },

    async load() {
      loading = true
      try { await Promise.all([this.loadParty(), this.loadFriends()]) }
      finally { loading = false }
    },

    async addFriend(targetName: string) {
      const r = await api.post<SimpleResp>('/api/friends/request', { targetName })
      return r
    },

    async removeFriend(charId: number) {
      const r = await api.post<SimpleResp>('/api/friends/remove', { charId })
      if (r.success) friends = friends.filter(f => f.charId !== charId)
      return r
    },

    setParty(p: Party | null) { party = p },
    upsertFriend(f: Friend) {
      const idx = friends.findIndex(x => x.charId === f.charId)
      if (idx === -1) friends = [...friends, f]
      else { const next = friends.slice(); next[idx] = f; friends = next }
    }
  }
}

export const social = createSocialStore()
