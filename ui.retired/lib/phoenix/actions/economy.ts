// Economy actions → social:lobby (bank, housing, mount, shop, gather, bounty, capture)
// Note: shop_buy/sell go to game:lobby (shop_handler), bank/housing/mount go to social:lobby
import { useCallback } from "react"
import type { Channel } from "phoenix"

export function useEconomyActions(
  gameChannel: Channel | null,
  socialChannel: Channel | null,
) {
  // Shop → game:lobby (shop_handler)
  const shopGetItems = useCallback((shopId: number) => {
    gameChannel?.push("shop_get_items", { shopId })
  }, [gameChannel])

  const shopBuyItem = useCallback((shopId: number, itemId: number, quantity: number) => {
    gameChannel?.push("shop_buy_item", { shopId, itemId, quantity })
  }, [gameChannel])

  const shopSellItem = useCallback((itemId: number, quantity: number) => {
    gameChannel?.push("shop_sell_item", { itemId, quantity })
  }, [gameChannel])

  // Bank → social:lobby (social_world_handler)
  const bankDeposit = useCallback((itemId: number, quantity: number) => {
    socialChannel?.push("bank_deposit", { itemId, quantity })
  }, [socialChannel])

  const bankWithdraw = useCallback((itemId: number, quantity: number) => {
    socialChannel?.push("bank_withdraw", { itemId, quantity })
  }, [socialChannel])

  // Housing → social:lobby
  const housingPurchase = useCallback((plotId: number) => {
    socialChannel?.push("housing_purchase", { plotId })
  }, [socialChannel])

  const housingPlaceFurniture = useCallback((furnitureId: number, x: number, y: number) => {
    socialChannel?.push("housing_place_furniture", { furnitureId, x, y })
  }, [socialChannel])

  // Mount → social:lobby
  const mountToggle = useCallback((mountId: number) => {
    socialChannel?.push("mount_toggle", { mountId })
  }, [socialChannel])

  // Capture → social:lobby
  const captureCreature = useCallback((npcId: number, itemId: number) => {
    socialChannel?.push("capture_creature", { npcId, itemId })
  }, [socialChannel])

  // Gather → social:lobby (minigame_handler)
  const gather = useCallback((nodeId: number) => {
    socialChannel?.push("gather", { nodeId })
  }, [socialChannel])

  // Bounty → social:lobby
  const bountyAccept = useCallback((bountyId: number) => {
    socialChannel?.push("bounty_accept", { bountyId })
  }, [socialChannel])

  return {
    shopGetItems, shopBuyItem, shopSellItem,
    bankDeposit, bankWithdraw,
    housingPurchase, housingPlaceFurniture,
    mountToggle, captureCreature, gather, bountyAccept,
  }
}
