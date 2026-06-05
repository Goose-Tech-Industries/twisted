// DM-led campaigns the player can browse. Phoenix pushes
// `dm_campaigns_list` on `dm_list_campaigns`.

export interface DmCampaign {
  id: number
  name: string
  description?: string | null
  status?: string
  dm_name?: string | null
  player_count?: number
  max_players?: number | null
  created_at?: string
}

function createDmCampaignsStore() {
  let list = $state<DmCampaign[]>([])

  return {
    get list() { return list },
    set(next: DmCampaign[]) { list = next ?? [] },
    clear() { list = [] }
  }
}

export const dmCampaigns = createDmCampaignsStore()
