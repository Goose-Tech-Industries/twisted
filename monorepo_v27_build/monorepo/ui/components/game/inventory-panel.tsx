"use client"

import { useState } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import type { Item } from "@/lib/game-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
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

export function InventoryPanel() {
  const { state, dispatch } = useGame()
  const { notify } = useNotification()
  const [filter, setFilter] = useState<ItemFilter>('all')
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  
  const filteredItems = filter === 'all' 
    ? state.inventory 
    : state.inventory.filter(item => item.type === filter)
  
  const handleUseItem = (item: Item) => {
    if (item.type === 'consumable') {
      dispatch({ type: 'REMOVE_ITEM', payload: { itemId: item.id, quantity: 1 } })
      
      // Simulate item effects
      if (item.name.toLowerCase().includes('health')) {
        const char = state.character
        if (char) {
          dispatch({ type: 'UPDATE_HP', payload: { current: Math.min(char.currentHp + 50, char.maxHp) } })
          notify('success', `Used ${item.name}. Restored 50 HP!`)
        }
      } else if (item.name.toLowerCase().includes('mana')) {
        const char = state.character
        if (char) {
          dispatch({ type: 'UPDATE_MP', payload: { current: Math.min(char.currentMp + 30, char.maxMp) } })
          notify('success', `Used ${item.name}. Restored 30 MP!`)
        }
      }
      
      setSelectedItem(null)
    }
  }
  
  const handleEquipItem = (item: Item) => {
    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') {
      notify('info', `Equipped ${item.name}`)
      setSelectedItem(null)
    }
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
    <div className="flex h-full">
      {/* Main Inventory Grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {filterButtons.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all",
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
            <Card className="celtic-border">
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No items found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredItems.map((item) => {
                const Icon = TYPE_ICONS[item.type] || Package
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={cn(
                      "relative p-3 rounded-lg border-2 text-left transition-all hover:scale-105",
                      RARITY_BG[item.rarity],
                      RARITY_COLORS[item.rarity],
                      selectedItem?.id === item.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    {/* Quantity Badge */}
                    {item.quantity > 1 && (
                      <span className="absolute top-1 right-1 bg-card border border-border text-xs px-1.5 py-0.5 rounded font-medium tabular-nums">
                        x{item.quantity}
                      </span>
                    )}
                    
                    {/* Icon */}
                    <div className="w-10 h-10 rounded bg-card/50 flex items-center justify-center mb-2">
                      <Icon className="w-5 h-5" />
                    </div>
                    
                    {/* Name */}
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{item.type}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Item Detail Sidebar */}
      {selectedItem && (
        <aside className="w-80 border-l border-border bg-card/50 p-4 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className={cn("text-lg font-bold", RARITY_COLORS[selectedItem.rarity])}>
                {selectedItem.name}
              </h3>
              <p className="text-sm text-muted-foreground capitalize">
                {selectedItem.rarity} {selectedItem.type}
              </p>
            </div>
            <button 
              onClick={() => setSelectedItem(null)}
              className="p-1 rounded hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          {/* Description */}
          <Card className="celtic-border mb-4">
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground italic">
                {selectedItem.description}
              </p>
            </CardContent>
          </Card>
          
          {/* Stats */}
          {(selectedItem.bonusAtk || selectedItem.bonusDef || selectedItem.bonusHp || selectedItem.bonusMp) && (
            <Card className="celtic-border mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                  Bonuses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {selectedItem.bonusAtk && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Attack</span>
                    <span className="text-[oklch(0.55_0.20_140)]">+{selectedItem.bonusAtk}</span>
                  </div>
                )}
                {selectedItem.bonusDef && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Defense</span>
                    <span className="text-[oklch(0.55_0.12_185)]">+{selectedItem.bonusDef}</span>
                  </div>
                )}
                {selectedItem.bonusHp && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Max HP</span>
                    <span className="text-[oklch(0.55_0.20_140)]">+{selectedItem.bonusHp}</span>
                  </div>
                )}
                {selectedItem.bonusMp && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Max MP</span>
                    <span className="text-[oklch(0.55_0.18_260)]">+{selectedItem.bonusMp}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Quantity */}
          <div className="flex items-center justify-between text-sm mb-4 px-1">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium tabular-nums">{selectedItem.quantity}</span>
          </div>
          
          {/* Actions */}
          <div className="space-y-2">
            {selectedItem.type === 'consumable' && (
              <Button 
                onClick={() => handleUseItem(selectedItem)}
                className="w-full bg-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.50_0.15_140)]"
              >
                <Check className="w-4 h-4 mr-2" />
                Use Item
              </Button>
            )}
            {(selectedItem.type === 'weapon' || selectedItem.type === 'armor' || selectedItem.type === 'accessory') && (
              <Button 
                onClick={() => handleEquipItem(selectedItem)}
                className="w-full"
              >
                <Swords className="w-4 h-4 mr-2" />
                Equip
              </Button>
            )}
            {selectedItem.type !== 'key' && (
              <Button 
                variant="outline" 
                className="w-full border-destructive/50 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Discard
              </Button>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
