import { api } from '$phoenix/api'
import type { Item } from '$stores/inventory.svelte'

export interface ShopListing extends Item {
  shop_price: number
  stock?: number
}

export interface Shop {
  id: number
  name: string
  npc_name?: string
  inventory: ShopListing[]
  buys?: boolean
}

interface Resp { success: boolean; shop?: Shop }
interface SimpleResp { success: boolean; message?: string }

function createShopStore() {
  let open = $state<Shop | null>(null)

  return {
    get open() { return open },

    async load(shopId: number) {
      const r = await api.get<Resp>(`/api/shops/${shopId}`)
      if (r.success && r.shop) open = r.shop
    },

    async buy(itemId: number, qty: number) {
      const r = await api.post<SimpleResp>('/api/shop/buy', { itemId, qty })
      return r
    },

    async sell(itemId: number, qty: number) {
      const r = await api.post<SimpleResp>('/api/shop/sell', { itemId, qty })
      return r
    },

    close() { open = null }
  }
}

export const shop = createShopStore()
