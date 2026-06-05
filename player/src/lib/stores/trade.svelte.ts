// Live trade — driven entirely by social channel events. No REST fetch;
// the server pushes `trade_request`, `trade_offer_updated`, `trade_accepted`,
// `trade_cancelled`, `trade_completed`.

import type { Item } from '$stores/inventory.svelte'

export type TradeStatus = 'idle' | 'invited' | 'pending' | 'negotiating' | 'locked' | 'closed'

export interface TradeOffer {
  /** Items the player commits to give. */
  items: Array<{ item: Item; qty: number }>
  gold: number
  locked: boolean
  accepted: boolean
}

export interface ActiveTrade {
  id: number
  partnerCharId: number
  partnerName: string
  me: TradeOffer
  them: TradeOffer
  status: TradeStatus
}

function createTradeStore() {
  let active = $state<ActiveTrade | null>(null)
  let invite = $state<{ fromCharId: number; fromName: string } | null>(null)

  return {
    get active() { return active },
    get invite() { return invite },

    setInvite(i: { fromCharId: number; fromName: string } | null) { invite = i },

    open(t: ActiveTrade) { active = t; invite = null },

    patch(delta: Partial<ActiveTrade>) {
      if (!active) return
      active = { ...active, ...delta }
    },

    setMyOffer(offer: TradeOffer) {
      if (!active) return
      active = { ...active, me: offer }
    },

    setTheirOffer(offer: TradeOffer) {
      if (!active) return
      active = { ...active, them: offer }
    },

    close() { active = null }
  }
}

export const trade = createTradeStore()
