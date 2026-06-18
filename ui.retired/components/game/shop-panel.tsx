"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { gameApi, type InventoryItem } from "@/lib/game-api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import {
  X,
  Coins,
  ShoppingCart,
  Package,
  Swords,
  Shield,
  Gem,
  FlaskRound,
  Shirt,
  Key,
  Minus,
  Plus,
  Loader2,
} from "lucide-react"

// ── Types ────────────────────────────────────────────────────────

interface ShopSupply extends InventoryItem {
  buy_price: number
  sell_price: number
  stock: number
}

interface ShopPanelProps {
  shopId: number
  onClose: () => void
}

const QUANTITY_OPTIONS = [1, 5, 10] as const

const TYPE_ICONS: Record<string, React.ElementType> = {
  weapon: Swords,
  armor: Shield,
  accessory: Gem,
  consumable: FlaskRound,
  material: Shirt,
  key: Key,
}

const TYPE_COLORS: Record<string, string> = {
  weapon: "bg-red-500/20 text-red-400 border-red-500/30",
  armor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  accessory: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  consumable: "bg-green-500/20 text-green-400 border-green-500/30",
  material: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  key: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
}

// ── Stat Row ─────────────────────────────────────────────────────

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", color)}>+{value}</span>
    </div>
  )
}

// ── Item Stat Tooltip ────────────────────────────────────────────

function ItemStats({ item }: { item: ShopSupply }) {
  const hasStats = item.bonus_atk || item.bonus_def || item.bonus_mo || item.bonus_md ||
    item.bonus_hp || item.bonus_mp || item.bonus_speed
  if (!hasStats) return null

  return (
    <div className="space-y-1 pt-2 border-t border-border">
      {item.bonus_atk ? <StatRow label="ATK" value={item.bonus_atk} color="text-red-400" /> : null}
      {item.bonus_def ? <StatRow label="DEF" value={item.bonus_def} color="text-blue-400" /> : null}
      {item.bonus_mo ? <StatRow label="M.Off" value={item.bonus_mo} color="text-purple-400" /> : null}
      {item.bonus_md ? <StatRow label="M.Def" value={item.bonus_md} color="text-cyan-400" /> : null}
      {item.bonus_hp ? <StatRow label="HP" value={item.bonus_hp} color="text-green-400" /> : null}
      {item.bonus_mp ? <StatRow label="MP" value={item.bonus_mp} color="text-blue-300" /> : null}
      {item.bonus_speed ? <StatRow label="SPD" value={item.bonus_speed} color="text-amber-400" /> : null}
    </div>
  )
}

// ── Main Panel ───────────────────────────────────────────────────

export function ShopPanel({ shopId, onClose }: ShopPanelProps) {
  const { state, dispatch, loadCharacter } = useGame()
  const { notify } = useNotification()

  const [shopName, setShopName] = useState("Shop")
  const [supplies, setSupplies] = useState<ShopSupply[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedItem, setSelectedItem] = useState<ShopSupply | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)

  const charId = state.character?.charId ?? state.character?.id ?? 0
  const gold = state.character?.gold ?? 0

  // ── Fetch shop data ──────────────────────────────────────────

  const fetchShop = useCallback(async () => {
    setLoading(true)
    const res = await gameApi.getShop(shopId)
    if (res.success && res.data) {
      setShopName(res.data.shop.name)
      setSupplies(res.data.supplies as ShopSupply[])
    } else {
      notify("error", res.message || "Failed to load shop")
    }
    setLoading(false)
  }, [shopId, notify])

  useEffect(() => {
    fetchShop()
  }, [fetchShop])

  // ── Buy handler ──────────────────────────────────────────────

  const handleBuy = async (item: ShopSupply) => {
    const totalCost = item.buy_price * quantity
    if (totalCost > gold) {
      notify("error", "Not enough gold!")
      return
    }
    setBusy(true)
    const res = await gameApi.buyItem(charId, shopId, item.item_id, quantity)
    if (res.success) {
      notify("success", res.message || `Bought ${quantity}x ${item.name}`)
      // Refresh shop + update gold locally
      await fetchShop()
      if (state.character) {
        // Gold is updated server-side; reload character to get fresh gold
      loadCharacter(charId)
      }
    } else {
      notify("error", res.message || "Purchase failed")
    }
    setBusy(false)
  }

  // ── Sell handler ─────────────────────────────────────────────

  const handleSell = async (item: InventoryItem) => {
    setBusy(true)
    const sellQty = Math.min(quantity, item.quantity)
    const res = await gameApi.sellItem(charId, item.item_id, sellQty)
    if (res.success) {
      const sellPrice = Math.floor((item.value ?? 0) * 0.5) * sellQty
      notify("success", res.message || `Sold ${sellQty}x ${item.name} for ${sellPrice}g`)
      // Gold + inventory updated server-side; reload character
      loadCharacter(charId)
    } else {
      notify("error", res.message || "Sale failed")
    }
    setBusy(false)
  }

  // ── Quantity selector ────────────────────────────────────────

  function QuantitySelector() {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 border-border"
          onClick={() => setQuantity(q => Math.max(1, q - 1))}
          disabled={quantity <= 1}
        >
          <Minus className="w-3 h-3" />
        </Button>
        <span className="w-8 text-center text-sm font-medium tabular-nums">{quantity}</span>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 border-border"
          onClick={() => setQuantity(q => q + 1)}
        >
          <Plus className="w-3 h-3" />
        </Button>
        <div className="flex gap-1 ml-2">
          {QUANTITY_OPTIONS.map(q => (
            <button
              key={q}
              onClick={() => setQuantity(q)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                quantity === q
                  ? "bg-primary/20 text-primary border border-primary/40"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground border border-border"
              )}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Buy Tab Content ──────────────────────────────────────────

  function BuyGrid() {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (supplies.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">This shop has nothing for sale.</p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {supplies.map(item => {
          const Icon = TYPE_ICONS[item.type] || Package
          const totalCost = item.buy_price * quantity
          const canAfford = gold >= totalCost
          const inStock = item.stock === -1 || item.stock >= quantity
          const isSelected = selectedItem?.id === item.id

          return (
            <Card
              key={item.id}
              className={cn(
                "celtic-border cursor-pointer transition-all hover:border-primary/40 bg-card/80",
                isSelected && "ring-1 ring-primary border-primary/60"
              )}
              onClick={() => setSelectedItem(isSelected ? null : item)}
            >
              <CardContent className="p-3 space-y-2">
                {/* Header row */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 capitalize", TYPE_COLORS[item.type])}
                      >
                        {item.type}
                      </Badge>
                      {item.stock !== -1 && (
                        <span className="text-[10px] text-muted-foreground">
                          Stock: {item.stock}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span className={cn(
                      "text-sm font-bold tabular-nums",
                      canAfford ? "text-amber-400" : "text-red-400"
                    )}>
                      {item.buy_price}
                    </span>
                  </div>
                </div>

                {/* Description */}
                {item.description && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">
                    {item.description}
                  </p>
                )}

                {/* Expanded stats + comparison on selection */}
                {isSelected && (() => {
                  // Find currently equipped item in the same slot for comparison
                  const equipped = item.slot && state.charFull?.equipment
                    ? state.charFull.equipment.find((eq) => eq.slot === item.slot)
                    : null
                  const stats = [
                    { key: 'bonus_atk', label: 'ATK', color: 'text-red-400' },
                    { key: 'bonus_def', label: 'DEF', color: 'text-blue-400' },
                    { key: 'bonus_mo', label: 'M.Off', color: 'text-purple-400' },
                    { key: 'bonus_md', label: 'M.Def', color: 'text-cyan-400' },
                    { key: 'bonus_hp', label: 'HP', color: 'text-green-400' },
                    { key: 'bonus_mp', label: 'MP', color: 'text-blue-300' },
                    { key: 'bonus_speed', label: 'SPD', color: 'text-amber-400' },
                  ]

                  return (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Stat comparison table */}
                      <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between text-[10px] uppercase text-muted-foreground/60 mb-1.5 px-1">
                          <span>Stat</span>
                          <div className="flex gap-6">
                            <span className="w-12 text-right">Shop</span>
                            {equipped && <span className="w-12 text-right">Equipped</span>}
                            {equipped && <span className="w-10 text-right">Diff</span>}
                          </div>
                        </div>
                        {stats.map(s => {
                          const shopVal = ((item as unknown as Record<string, number>)[s.key]) || 0
                          const eqVal = equipped ? ((equipped as unknown as Record<string, number>)[s.key]) || 0 : 0
                          const diff = shopVal - eqVal
                          if (!shopVal && !eqVal) return null as unknown as React.ReactElement
                          return (
                            <div key={s.key} className="flex items-center justify-between text-xs px-1 py-0.5">
                              <span className="text-muted-foreground">{s.label}</span>
                              <div className="flex gap-6">
                                <span className={cn("w-12 text-right font-medium tabular-nums", s.color)}>
                                  {shopVal ? `+${shopVal}` : '--'}
                                </span>
                                {equipped && (
                                  <span className="w-12 text-right font-medium tabular-nums text-muted-foreground">
                                    {eqVal ? `+${eqVal}` : '--'}
                                  </span>
                                )}
                                {equipped && (
                                  <span className={cn("w-10 text-right font-bold tabular-nums",
                                    diff > 0 ? "text-green-400" : diff < 0 ? "text-red-400" : "text-muted-foreground/50"
                                  )}>
                                    {diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '='}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                        {equipped && (
                          <p className="text-[10px] text-muted-foreground/50 mt-1 px-1">
                            vs. equipped {(equipped as unknown as Record<string, string>).name || item.slot}
                          </p>
                        )}
                        {!equipped && item.slot && (
                          <p className="text-[10px] text-muted-foreground/50 mt-1 px-1">
                            Nothing equipped in {item.slot} slot
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="text-xs text-muted-foreground">
                          Total: <span className={cn("font-bold", canAfford ? "text-amber-400" : "text-red-400")}>
                            {totalCost}g
                          </span>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 bg-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.50_0.15_140)]"
                          disabled={!canAfford || !inStock || busy}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleBuy(item)
                          }}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShoppingCart className="w-3 h-3 mr-1" />}
                          Buy
                        </Button>
                      </div>
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // ── Sell Tab Content ─────────────────────────────────────────

  function SellGrid() {
    const sellableItems = state.inventory.filter(i => i.type !== "key")

    if (sellableItems.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">No items to sell.</p>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sellableItems.map(item => {
          const Icon = TYPE_ICONS[item.type] || Package
          // Sell price is 50% of item value; fall back to 0 if value missing
          const rawItem = item as unknown as InventoryItem
          const baseValue = (rawItem as InventoryItem & { value?: number }).value ?? 0
          const sellPrice = Math.floor(baseValue * 0.5)
          const sellQty = Math.min(quantity, item.quantity)
          const totalSell = sellPrice * sellQty

          return (
            <Card
              key={item.id}
              className="celtic-border bg-card/80 transition-all hover:border-primary/40"
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg border border-border bg-muted/30 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 capitalize", TYPE_COLORS[item.type])}
                      >
                        {item.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Qty: {item.quantity}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Coins className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-sm font-bold tabular-nums text-amber-400">
                      {sellPrice}
                    </span>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs text-muted-foreground italic line-clamp-1">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                  <div className="text-xs text-muted-foreground">
                    Sell {sellQty}x = <span className="font-bold text-amber-400">{totalSell}g</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                    disabled={sellPrice === 0 || busy}
                    onClick={() => handleSell(rawItem)}
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Coins className="w-3 h-3 mr-1" />}
                    Sell
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="celtic-border w-full max-w-3xl max-h-[90dvh] flex flex-col bg-card border-border shadow-2xl">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between pb-3 shrink-0 border-b border-border">
          <div>
            <CardTitle className="text-lg font-bold">{shopName}</CardTitle>
            <div className="flex items-center gap-1.5 mt-1">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold tabular-nums text-amber-400">{gold.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">gold</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <QuantitySelector />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 hover:bg-muted"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        {/* Tabs */}
        <Tabs defaultValue="buy" className="flex-1 flex flex-col min-h-0">
          <div className="px-4 pt-3 shrink-0">
            <TabsList className="w-full bg-muted/50">
              <TabsTrigger value="buy" className="flex-1 gap-1.5">
                <ShoppingCart className="w-4 h-4" />
                Buy
              </TabsTrigger>
              <TabsTrigger value="sell" className="flex-1 gap-1.5">
                <Coins className="w-4 h-4" />
                Sell
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="buy" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full max-h-[calc(90dvh-180px)]">
              <div className="p-4">
                <BuyGrid />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sell" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-full max-h-[calc(90dvh-180px)]">
              <div className="p-4">
                <SellGrid />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}
