// Shop store — driven by game channel pushes (ShopHandler).
// open_shop event → game.push('shop_get_items') → 'shop_items' push
// populates the store. Buy/sell go through shop_buy_item / shop_sell_item
// channel events; results come back as buy_result / sell_result.

export interface ShopItem {
  supply_id: number
  item_id: number
  buy_price: number
  sell_price: number
  stock: number
  name: string
  icon: string
  type: string
  rarity: string
  level_req: number
  description: string
  slot: string
  bonus_hp?: number
  bonus_mp?: number
  bonus_atk?: number
  bonus_def?: number
  bonus_speed?: number
}

export interface PlayerItem {
  item_id: number
  quantity: number
  name: string
  icon: string
  type: string
  rarity: string
  sell_price: number
}

interface ShopItemsPayload {
  shop_id: number
  items: ShopItem[]
  inventory: PlayerItem[]
  gold: number
  discount: number
}

interface BuySellResult {
  success: boolean
  message?: string
  gold?: number
}

export interface ShopState {
  shopId: number
  name: string
  items: ShopItem[]
  playerInventory: PlayerItem[]
  gold: number
  discount: number
}

type PushFn = (event: string, payload: Record<string, unknown>) => void

function createShopStore() {
  let open = $state<ShopState | null>(null)
  let _push = $state<PushFn | null>(null)

  return {
    get open() { return open },

    /** Bind the game channel push function so the store can send events. */
    bindPush(fn: PushFn) { _push = fn },

    /** Request shop items from the server (called on open_shop event). */
    load(shopId: number, shopName: string = 'Shop') {
      if (!_push) return
      _push('shop_get_items', { shopId })
      // Set a placeholder so the panel opens immediately
      open = { shopId, name: shopName, items: [], playerInventory: [], gold: 0, discount: 0 }
    },

    /** Handle the shop_items push from the server. */
    onItems(payload: ShopItemsPayload) {
      const existed = open
      open = {
        shopId: payload.shop_id,
        name: existed?.name ?? 'Shop',
        items: payload.items ?? [],
        playerInventory: payload.inventory ?? [],
        gold: payload.gold ?? 0,
        discount: payload.discount ?? 0
      }
    },

    buy(itemId: number, qty: number = 1) {
      if (!_push || !open) return
      _push('shop_buy_item', { shopId: open.shopId, itemId, quantity: qty })
    },

    sell(itemId: number, qty: number = 1) {
      if (!_push || !open) return
      _push('shop_sell_item', { shopId: open.shopId, itemId, quantity: qty })
    },

    /** Handle buy_result push. */
    onBuyResult(r: BuySellResult) {
      if (r.success && r.gold != null && open) {
        open = { ...open, gold: r.gold }
      }
      // After buy/sell, refresh the shop listing
      if (open) {
        if (_push) _push('shop_get_items', { shopId: open.shopId })
      }
    },

    onSellResult(r: BuySellResult) {
      if (r.success && r.gold != null && open) {
        open = { ...open, gold: r.gold }
      }
      if (open) {
        if (_push) _push('shop_get_items', { shopId: open.shopId })
      }
    },

    close() { open = null }
  }
}

export const shop = createShopStore()
