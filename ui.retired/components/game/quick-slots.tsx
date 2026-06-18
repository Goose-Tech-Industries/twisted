"use client"

import { useState, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { useSettings } from '@/lib/settings-context'
import { useUiSounds } from '@/lib/audio-context'
import { Package, Flame, Droplets, Zap, Shield, Heart } from 'lucide-react'
import type { Item } from '@/lib/game-types'

interface QuickSlot {
  itemId: number | null
  item: Item | null
}

const SLOT_ICONS = [Package, Flame, Droplets, Zap, Shield]

export function QuickSlots() {
  const { inventory, notify } = useGame()
  const { formatKeybind, settings } = useSettings()
  const sounds = useUiSounds()
  
  // Quick slots state - in production this would be persisted
  const [slots, setSlots] = useState<QuickSlot[]>(
    Array.from({ length: 5 }, () => ({ itemId: null, item: null }))
  )
  const [draggedSlot, setDraggedSlot] = useState<number | null>(null)
  
  // Handle quick slot use
  const handleUseSlot = useCallback((slot: 1 | 2 | 3 | 4 | 5) => {
    const idx = slot - 1
    const slotData = slots[idx]
    
    if (!slotData.item) {
      sounds.error()
      return
    }
    
    // Check if item is a consumable
    if (slotData.item.type === 'consumable') {
      sounds.success()
      notify('success', `Used ${slotData.item.name}`)
      // In production, would call API to use item
    } else {
      sounds.click()
      notify('info', `${slotData.item.name} is not usable`)
    }
  }, [slots, notify, sounds])
  
  // Keyboard shortcuts handled by settings keybinds
  
  // Handle drag from inventory
  const handleDrop = useCallback((slotIndex: number, item: Item) => {
    setSlots(prev => {
      const next = [...prev]
      next[slotIndex] = { itemId: item.id, item }
      return next
    })
    sounds.click()
  }, [sounds])
  
  // Handle drag between slots
  const handleSlotDragStart = useCallback((slotIndex: number) => {
    setDraggedSlot(slotIndex)
  }, [])
  
  const handleSlotDrop = useCallback((targetIndex: number) => {
    if (draggedSlot === null || draggedSlot === targetIndex) return
    
    setSlots(prev => {
      const next = [...prev]
      const temp = next[targetIndex]
      next[targetIndex] = next[draggedSlot]
      next[draggedSlot] = temp
      return next
    })
    setDraggedSlot(null)
    sounds.click()
  }, [draggedSlot, sounds])
  
  // Clear a slot
  const handleClearSlot = useCallback((slotIndex: number) => {
    setSlots(prev => {
      const next = [...prev]
      next[slotIndex] = { itemId: null, item: null }
      return next
    })
  }, [])
  
  // Get keybind display for slot
  const getSlotKeybind = (index: number) => {
    const action = `quickSlot${index + 1}` as keyof typeof settings.keybinds
    return formatKeybind(settings.keybinds[action])
  }
  
  // Get consumable items from inventory for autofill suggestions
  const consumables = inventory.filter(i => i.type === 'consumable')
  
  return (
    <div className="shrink-0 flex justify-center border-t border-border bg-card/80">
      <div className="flex gap-0.5 md:gap-1 p-1.5 md:p-2">
        {slots.map((slot, index) => {
          const Icon = slot.item ? getItemIcon(slot.item) : SLOT_ICONS[index]

          return (
            <div
              key={index}
              className="relative group"
              draggable={!!slot.item}
              onDragStart={() => handleSlotDragStart(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const itemData = e.dataTransfer.getData('item')
                if (itemData) {
                  try {
                    const item = JSON.parse(itemData) as Item
                    handleDrop(index, item)
                  } catch {
                    handleSlotDrop(index)
                  }
                } else {
                  handleSlotDrop(index)
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                handleClearSlot(index)
              }}
            >
              <button
                onClick={() => handleUseSlot((index + 1) as 1 | 2 | 3 | 4 | 5)}
                className={`
                  w-9 h-9 md:w-12 md:h-12 flex items-center justify-center rounded border-2 transition-all
                  ${slot.item
                    ? 'bg-secondary border-primary/50 hover:border-primary hover:bg-primary/20'
                    : 'bg-secondary/50 border-border hover:border-muted-foreground'
                  }
                  ${draggedSlot === index ? 'opacity-50' : ''}
                `}
              >
                <Icon className={`w-4 h-4 md:w-6 md:h-6 ${slot.item ? 'text-foreground' : 'text-muted-foreground'}`} />

                {/* Stack count */}
                {slot.item && slot.item.quantity && slot.item.quantity > 1 && (
                  <span className="absolute bottom-0 right-0 text-[8px] md:text-[10px] font-bold text-foreground bg-black/60 px-0.5 md:px-1 rounded">
                    {slot.item.quantity}
                  </span>
                )}
              </button>

              {/* Keybind indicator — desktop only */}
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground font-mono whitespace-nowrap hidden md:block">
                {getSlotKeybind(index)}
              </div>

              {/* Tooltip */}
              {slot.item && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-popover border border-border rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                  <p className="text-sm font-medium">{slot.item.name}</p>
                  {slot.item.description && (
                    <p className="text-xs text-muted-foreground">{slot.item.description}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Auto-fill from consumables hint — desktop only */}
        {consumables.length > 0 && slots.every(s => !s.item) && (
          <div className="hidden md:flex items-center pl-2 text-xs text-muted-foreground">
            <span>Drag items here</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper to get appropriate icon for item type
function getItemIcon(item: Item) {
  switch (item.type) {
    case 'consumable':
      if (item.name.toLowerCase().includes('potion')) return Droplets
      if (item.name.toLowerCase().includes('health')) return Heart
      return Flame
    case 'weapon':
      return Zap
    case 'armor':
      return Shield
    default:
      return Package
  }
}
