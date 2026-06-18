"use client"
import React from 'react'

import { useState } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { OghamsSkeleton } from "./panel-skeletons"
import type { BloodOgham } from "@/lib/game-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  Droplets,
  Flame,
  Target,
  Skull,
  Shield,
  Zap,
  Heart,
  Swords,
  Plus,
  Minus,
  AlertTriangle
} from "lucide-react"

const OGHAM_ICONS: Record<string, React.ElementType> = {
  flame: Flame,
  target: Target,
  skull: Skull,
  shield: Shield,
  zap: Zap,
  heart: Heart,
  swords: Swords,
}

export function OghamsPanel() {
  const { state } = useGame()
  const { notify } = useNotification()
  const [selectedOgham, setSelectedOgham] = useState<BloodOgham | null>(null)

  if (state.isLoading) return <OghamsSkeleton />

  const slottedOghams = state.oghams.filter(o => o.slotted)
  const unslottedOghams = state.oghams.filter(o => !o.slotted)
  
  // Group by family
  const families = state.oghams.reduce((acc, ogham) => {
    const family = ogham.familyName || 'Unbound'
    if (!acc[family]) acc[family] = []
    acc[family].push(ogham)
    return acc
  }, {} as Record<string, BloodOgham[]>)
  
  const handleSlot = (ogham: BloodOgham) => {
    if (slottedOghams.length >= 3 && !ogham.slotted) {
      notify('error', 'Maximum 3 Oghams can be slotted at once')
      return
    }
    // In a real implementation, this would update the state
    notify('success', ogham.slotted 
      ? `Removed ${ogham.name} from your blade` 
      : `${ogham.name} carved into your blade`)
  }
  
  return (
    <div className="flex flex-col md:flex-row md:h-full max-w-5xl mx-auto w-full">
      {/* Main Content */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2 blood-text">
              <Droplets className="w-5 h-5 text-primary" />
              Blood Oghams
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Ancient runes carved in blood. Each mark is a promise to something old.
            </p>
          </div>
          
          {/* Warning Card */}
          <Card className="celtic-border bg-primary/5 border-primary/30 mb-6">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-primary">Blood Oghams carry a price</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Each Ogham grants power, but prolonged use changes the bearer. 
                  Slot up to 3 at a time. Equip 2+ from the same family to unlock set bonuses.
                </p>
              </div>
            </CardContent>
          </Card>
          
          {/* Slotted Oghams */}
          <Card className="celtic-border mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="uppercase tracking-wider text-muted-foreground">
                  Active Oghams ({slottedOghams.length}/3)
                </span>
                {slottedOghams.length >= 2 && (
                  <span className="text-xs text-primary px-2 py-0.5 bg-primary/20 rounded-full">
                    Set Bonus Active!
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[0, 1, 2].map(slot => {
                  const ogham = slottedOghams[slot]
                  if (ogham) {
                    const Icon = OGHAM_ICONS[ogham.icon] || Droplets
                    return (
                      <button
                        key={slot}
                        onClick={() => setSelectedOgham(ogham)}
                        className={cn(
                          "relative p-4 rounded-lg border-2 text-center transition-all rune-glow",
                          "bg-primary/10 border-primary/40 hover:bg-primary/20",
                          selectedOgham?.id === ogham.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                      >
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-primary">{ogham.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{ogham.familyName}</p>
                      </button>
                    )
                  }
                  return (
                    <div
                      key={slot}
                      className="p-4 rounded-lg border-2 border-dashed border-border text-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-2">
                        <Plus className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Empty Slot</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
          
          {/* Available Oghams by Family */}
          {(Object.entries(families) as [string, BloodOgham[]][]).map(([familyName, oghams]: [string, BloodOgham[]]) => (
            <Card key={familyName} className="celtic-border mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Droplets className="w-4 h-4" />
                  {familyName}
                  <span className="text-xs text-primary ml-auto">
                    {oghams.filter(o => o.slotted).length}/{oghams.length} Active
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {oghams.map(ogham => {
                    const Icon = OGHAM_ICONS[ogham.icon] || Droplets
                    return (
                      <button
                        key={ogham.id}
                        onClick={() => setSelectedOgham(ogham)}
                        className={cn(
                          "relative p-3 rounded-lg border text-left transition-all",
                          ogham.slotted 
                            ? "bg-primary/10 border-primary/40 rune-glow" 
                            : "celtic-border hover:border-primary/30",
                          selectedOgham?.id === ogham.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        )}
                      >
                        {ogham.slotted && (
                          <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-primary/30 text-primary rounded-full">
                            Active
                          </span>
                        )}
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded flex items-center justify-center",
                            ogham.slotted ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm font-medium truncate",
                              ogham.slotted && "text-primary"
                            )}>
                              {ogham.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {ogham.elementAttack && `+${ogham.elementAttack} damage`}
                              {ogham.onHitStatus && `${ogham.onHitChance}% ${ogham.onHitStatus}`}
                              {ogham.statBonus && Object.entries(ogham.statBonus).map(([k, v]) => `+${v} ${k.toUpperCase()}`).join(', ')}
                            </p>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      {/* Detail Sidebar */}
      {selectedOgham && (
        <aside className="w-80 border-l border-border bg-card/50 p-4 overflow-y-auto">
          {(() => {
            const Icon = OGHAM_ICONS[selectedOgham.icon] || Droplets
            return (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-14 h-14 rounded-lg flex items-center justify-center",
                    selectedOgham.slotted 
                      ? "bg-primary/20 text-primary rune-glow" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className={cn(
                      "font-bold text-lg",
                      selectedOgham.slotted && "text-primary blood-text"
                    )}>
                      {selectedOgham.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">{selectedOgham.familyName}</p>
                  </div>
                </div>
                
                {/* Description */}
                <Card className="celtic-border mb-4">
                  <CardContent className="p-3">
                    <p className="text-sm text-muted-foreground italic">
                      "{selectedOgham.description}"
                    </p>
                  </CardContent>
                </Card>
                
                {/* Effects */}
                <Card className="celtic-border mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                      Effects
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {selectedOgham.elementAttack && (
                      <div className="flex items-center gap-2 text-sm">
                        <Flame className="w-4 h-4 text-[oklch(0.60_0.20_50)]" />
                        <span>+{selectedOgham.elementAttack} element damage</span>
                      </div>
                    )}
                    {selectedOgham.onHitStatus && (
                      <div className="flex items-center gap-2 text-sm">
                        <Skull className="w-4 h-4 text-[oklch(0.55_0.22_25)]" />
                        <span>{selectedOgham.onHitChance}% chance to inflict {selectedOgham.onHitStatus}</span>
                      </div>
                    )}
                    {selectedOgham.statBonus && Object.entries(selectedOgham.statBonus).map(([stat, value]) => (
                      <div key={stat} className="flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4 text-[oklch(0.55_0.15_140)]" />
                        <span>+{value} {stat.toUpperCase()}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                
                {/* Action Button */}
                <Button 
                  onClick={() => handleSlot(selectedOgham)}
                  className={cn(
                    "w-full",
                    selectedOgham.slotted 
                      ? "bg-destructive/80 hover:bg-destructive" 
                      : "bg-primary hover:bg-primary/90"
                  )}
                >
                  {selectedOgham.slotted ? (
                    <>
                      <Minus className="w-4 h-4 mr-2" />
                      Remove Ogham
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Slot Ogham
                    </>
                  )}
                </Button>
                
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  {selectedOgham.slotted 
                    ? 'Removing will reset accumulated power' 
                    : 'Slotting requires a moment of ritual'}
                </p>
              </>
            )
          })()}
        </aside>
      )}
    </div>
  )
}
