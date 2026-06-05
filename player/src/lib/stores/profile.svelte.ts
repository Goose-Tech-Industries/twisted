import { api } from '$phoenix/api'

export interface Profile {
  charId: number
  name: string
  level: number
  race_name?: string | null
  class_name?: string | null
  profile_color?: string | null
  profile_bio?: string | null
  profile_signature?: string | null
  profile_favorite_quote?: string | null
  profile_banner_emoji?: string | null
  profile_views?: number
  show_profile_viewers?: number | boolean
  status_message?: string | null
}

interface Resp { success: boolean; profile?: Profile; character?: Profile }

function createProfileStore() {
  let viewing = $state<Profile | null>(null)

  return {
    get viewing() { return viewing },

    async load(charId: number) {
      // /api/profile/:char_id is the read endpoint that returns the
      // profile_* columns. /api/character/:id is a different (public)
      // endpoint that returns minimal character data and 404s for
      // unknown ids — wrong target for this store.
      const r = await api.get<Resp>(`/api/profile/${charId}`)
      const data = r.profile ?? r.character ?? null
      if (data) viewing = { ...(data as Profile), charId }
    },

    async update(fields: Partial<Profile>) {
      // Phoenix's update_profile requires `charId` in the body — pull it
      // from the currently-viewed profile.
      if (!viewing) return { success: false, message: 'No active profile.' }
      const r = await api.post<{ success: boolean; message?: string }>(
        '/api/profile/update',
        { charId: viewing.charId, ...fields }
      )
      if (r.success) viewing = { ...viewing, ...fields }
      return r
    },

    close() { viewing = null }
  }
}

export const profile = createProfileStore()
