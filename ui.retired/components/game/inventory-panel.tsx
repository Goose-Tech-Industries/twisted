"use client"
import React from 'react'

import { useState } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { useHaptics } from "@/hooks/use-haptics"
import type { Item } from "@/lib/game-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { InventorySkeleton } from "./panel-skeletons"
import { EmptyState } from "./empty-state"
import {
  Swords,
  Shield,
  Gem,
  FlaskRound,
  Key,
  Shirt,
  Package,
  X,
  Check,
  Trash2
} from "lucide-react"

const TYPE_ICONS: Record<string, React.ElementType> = {
  weapon: Swords,
  armor: Shield,
  accessory: Gem,
  consumable: FlaskRound,
  material: Package,
  key: Key,
}

const RARITY_COLORS: Record<string, string> = {
  common: 'border-border text-foreground',
  uncommon: 'border-[oklch(0.55_0.15_140)] text-[oklch(0.55_0.15_140)]',
  rare: 'border-[oklch(0.55_0.18_260)] text-[oklch(0.55_0.18_260)]',
  epic: 'border-[oklch(0.60_0.25_310)] text-[oklch(0.60_0.25_310)]',
  legendary: 'border-[oklch(0.75_0.15_85)] text-[oklch(0.75_0.15_85)]',
}

const RARITY_BG: Record<string, string> = {
  common: 'bg-card',
  uncommon: 'bg-[oklch(0.55_0.15_140)]/10',
  rare: 'bg-[oklch(0.55_0.18_260)]/10',
  epic: 'bg-[oklch(0.60_0.25_310)]/10',
  legendary: 'bg-[oklch(0.75_0.15_85)]/10',
}

type ItemFilter = 'all' | Item['type']

// ── Shared Item Detail (used by sidebar + bottom sheet) ─────────
function ItemDetail({ item, onUse, onEquip, onDrop, onClose }: {
  item: Item
  onUse: (item: Item) => void
  onEquip: (item: Item) => void
  onDrop: (item: Item) => void
  onClose: () => void
}) {
  const Icon = TYPE_ICONS[item.type] || Package
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("w-14 h-14 rounded-lg flex items-center justify-center border-2 shrink-0", RARITY_COLORS[item.rarity], RARITY_BG[item.rarity])}>
          <Icon className="w-7 h-7" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={cn("text-lg font-bold", RARITY_COLORS[item.rarity])}>
            {item.name}
          </h3>
          <p className="text-sm text-muted-foreground capitalize">
            {item.rarity} {item.type}
          </p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors shrink-0 hidden md:block">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      {item.description && (
        <Card className="celtic-border">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground italic">{item.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {(item.bonusAtk || item.bonusDef || item.bonusHp || item.bonusMp) && (
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Bonuses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {item.bonusAtk ? <StatRow label="Attack" value={item.bonusAtk} color="text-[oklch(0.55_0.20_140)]" /> : null}
            {item.bonusDef ? <StatRow label="Defense" value={item.bonusDef} color="text-[oklch(0.55_0.12_185)]" /> : null}
            {item.bonusHp ? <StatRow label="Max HP" value={item.bonusHp} color="text-[oklch(0.55_0.20_140)]" /> : null}
            {item.bonusMp ? <StatRow label="Max MP" value={item.bonusMp} color="text-[oklch(0.55_0.18_260)]" /> : null}
          </CardContent>
        </Card>
      )}

      {/* Quantity */}
      <div className="flex items-center justify-between text-sm px-1">
        <span className="text-muted-foreground">Quantity</span>
        <span className="font-medium tabular-nums">{item.quantity}</span>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        {item.type === 'consumable' && (
          <Button onClick={() => onUse(item)} className="w-full bg-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.50_0.15_140)]">
            <Check className="w-4 h-4 mr-2" /> Use Item
          </Button>
        )}
        {(item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') && (
          <Button onClick={() => onEquip(item)} className="w-full">
            <Swords className="w-4 h-4 mr-2" /> Equip
          </Button>
        )}
        {item.type !== 'key' && (
          <Button variant="outline" className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={() => onDrop(item)}>
            <Trash2 className="w-4 h-4 mr-2" /> Drop on Map
          </Button>
        )}
      </div>
    </div>
  )
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={color}>+{value}</span>
    </div>
  )
}

// ── Main Panel ──────────────────────────────────────────────────
export function InventoryPanel() {
  const game = useGame()
  const { state, dispatch, socket } = game
  const { notify } = useNotification()
  const haptics = useHaptics()
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)

  if (state.isLoading) return <InventorySkeleton />

  const filteredItems = filter === 'all'
    ? state.inventory
    : state.inventory.filter(item => item.type === filter)

  const handleUseItem = (item: Item) => {
    if (!socket) return
    if (item.type === 'consumable') {
      haptics.success()
      socket.emit('use_item_on_map', { itemId: item.id })
      dispatch({ type: 'REMOVE_ITEM', payload: { itemId: item.id, quantity: 1 } })
      setSelectedItem(null)
    }
  }

  const handleEquipItem = (item: Item) => {
    if (!socket) return
    haptics.medium()
    socket.emit('equip_item', { itemId: item.id })
    setSelectedItem(null)
  }

  const handleUnequipItem = (slot: string) => {
    if (!socket) return
    socket.emit('unequip_item', { slot })
  }

  const handleDropItem = (item: Item) => {
    if (!socket) return
    haptics.medium()
    socket.emit('drop_item', { itemId: item.id, quantity: 1 })
    dispatch({ type: 'REMOVE_ITEM', payload: { itemId: item.id, quantity: 1 } })
    notify('info', `Dropped ${item.name}`)
    setSelectedItem(null)
  }

  const filterButtons: { value: ItemFilter; label: string; icon: React.ElementType }[] = [
    { value: 'all', label: 'All', icon: Package },
    { value: 'weapon', label: 'Weapons', icon: Swords },
    { value: 'armor', label: 'Armor', icon: Shield },
    { value: 'accessory', label: 'Accessories', icon: Gem },
    { value: 'consumable', label: 'Consumables', icon: FlaskRound },
    { value: 'material', label: 'Materials', icon: Shirt },
    { value: 'key', label: 'Key Items', icon: Key },
  ]

  return (
    <div className="flex flex-col md:flex-row md:h-full">
      {/* Main Inventory Grid */}
      <div className="flex-1 p-4 md:overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Filter Tabs — horizontally scrollable on mobile */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory">
            {filterButtons.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all whitespace-nowrap shrink-0 snap-start",
                  filter === value
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {/* Item Count */}
          <p className="text-sm text-muted-foreground mb-4">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            {filter !== 'all' && ` (${state.inventory.length} total)`}
          </p>

          {/* Items Grid */}
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No Items"
              description="Your pack is empty. Explore the world, defeat enemies, and visit shops to find gear."
            />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
              {filteredItems.map((item) => {
                const Icon = TYPE_ICONS[item.type] || Package
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={cn(
                      "relative p-2 md:p-3 rounded-lg border-2 text-left transition-all active:scale-95 md:hover:scale-105",
                      RARITY_BG[item.rarity],
                      RARITY_COLORS[item.rarity],
                      selectedItem?.id === item.id && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                    )}
                  >
                    {/* Quantity Badge */}
                    {item.quantity > 1 && (
                      <span className="absolute top-0.5 right-0.5 bg-card border border-border text-[10px] md:text-xs px-1 md:px-1.5 py-0.5 rounded font-medium tabular-nums">
                        x{item.quantity}
                      </span>
                    )}

                    {/* Icon */}
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded bg-card/50 flex items-center justify-center mb-1 md:mb-2">
                      <Icon className="w-4 h-4 md:w-5 md:h-5" />
                    </div>

                    {/* Name */}
                    <p className="text-xs md:text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground capitalize mt-0.5 hidden sm:block">{item.type}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop: sidebar detail panel ── */}
      {selectedItem && (
        <aside className="hidden md:block w-80 border-l border-border bg-card/50 p-4 overflow-y-auto">
          <ItemDetail
            item={selectedItem}
            onUse={handleUseItem}
            onEquip={handleEquipItem}
            onDrop={handleDropItem}
            onClose={() => setSelectedItem(null)}
          />
        </aside>
      )}

      {/* ── Mobile: bottom sheet detail panel ── */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null) }}>
        <SheetContent side="bottom" className="md:hidden p-0 bg-card border-border rounded-t-2xl max-h-[80dvh] [&>button:last-child]:hidden">
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>
          <div className="px-4 pb-6 overflow-y-auto">
            {selectedItem && (
              <ItemDetail
                item={selectedItem}
                onUse={handleUseItem}
                onEquip={handleEquipItem}
                onDrop={handleDropItem}
                onClose={() => setSelectedItem(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
