import { api } from '$phoenix/api'

export interface AuctionListing {
  id: number
  item_id: number
  name: string
  icon?: string
  rarity?: string
  price: number
  qty: number
  seller_name: string
  expires_at?: string
}

interface ListResp { success: boolean; listings?: AuctionListing[] }
interface SimpleResp { success: boolean; message?: string }

function createAuctionStore() {
  let listings = $state<AuctionListing[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  return {
    get listings() { return listings },
    get loading() { return loading },
    get error() { return error },

    async load() {
      loading = true
      try {
        const r = await api.get<ListResp>('/api/auction')
        listings = r.listings ?? []
      } catch (e) { error = (e as Error).message }
      finally { loading = false }
    },

    async create(itemId: number, qty: number, price: number) {
      const r = await api.post<SimpleResp>('/api/auction/create', { itemId, qty, price })
      if (r.success) await this.load()
      return r
    },

    async buy(listingId: number) {
      const r = await api.post<SimpleResp>('/api/auction/buy', { listingId })
      if (r.success) listings = listings.filter(l => l.id !== listingId)
      return r
    },

    async cancel(listingId: number) {
      const r = await api.post<SimpleResp>('/api/auction/cancel', { listingId })
      if (r.success) listings = listings.filter(l => l.id !== listingId)
      return r
    }
  }
}

export const auction = createAuctionStore()
