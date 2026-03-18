"use client"

import { useGame, useNotification } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Shield, Swords, Heart, Sparkles, UserMinus, Users } from "lucide-react"
import type { Companion } from "@/lib/game-types"

const TACTICS_CONFIG: Record<Companion['tactics'], { label: string; icon: typeof Swords; description: string; color: string }> = {
  AGGRESSIVE: { label: 'Aggressive', icon: Swords, description: 'Prioritizes damage, rarely defends', color: 'text-red-400' },
  BALANCED:   { label: 'Balanced',   icon: Shield, description: 'Balanced offense and defense', color: 'text-blue-400' },
  DEFENSIVE:  { label: 'Defensive',  icon: Shield, description: 'Defends often, heals early', color: 'text-green-400' },
  SUPPORT:    { label: 'Support',    icon: Heart,  description: 'Prioritizes healing allies', color: 'text-pink-400' },
}

export function CompanionPanel() {
  const { state, socket } = useGame()
  const { notify } = useNotification()
  const { companions } = state

  const setTactics = (npcId: number, tactics: Companion['tactics']) => {
    if (!socket) return
    socket.emit('companion_set_tactics', { npcId, tactics })
    notify('info', `Tactics changed to ${TACTICS_CONFIG[tactics].label}`)
  }

  const dismissCompanion = (npcId: number, name: string) => {
    if (!socket) return
    if (!confirm(`Dismiss ${name}? You can recruit them again later.`)) return
    socket.emit('companion_dismiss', { npcId })
    notify('info', `${name} has been dismissed`)
  }

  if (!companions.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
        <Users className="w-12 h-12 mb-4 opacity-30" />
        <h3 className="text-lg font-medium mb-2">No Companions</h3>
        <p className="text-sm">
          Talk to friendly NPCs with high enough reputation to recruit them as companions.
          They&apos;ll fight alongside you in battle!
        </p>
        <p className="text-xs mt-4 opacity-60">Max 3 companions</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Users className="w-5 h-5" />
          Companions ({companions.length}/3)
        </h2>
      </div>

      {companions.map(comp => {
        const hpPct = comp.maxHp > 0 ? (comp.currentHp / comp.maxHp) * 100 : 0
        const mpPct = comp.maxMp > 0 ? (comp.currentMp / comp.maxMp) * 100 : 0
        const currentTactics = TACTICS_CONFIG[comp.tactics] || TACTICS_CONFIG.BALANCED

        return (
          <Card key={comp.npcId} className="celtic-border">
            <CardContent className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[oklch(0.55_0.12_185)]/20 border border-[oklch(0.55_0.12_185)]/40 flex items-center justify-center text-xl">
                    {comp.icon}
                  </div>
                  <div>
                    <h3 className="font-bold">{comp.name}</h3>
                    <p className="text-xs text-muted-foreground">Level {comp.level}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => dismissCompanion(comp.npcId, comp.name)}
                  title="Dismiss companion"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <UserMinus className="w-4 h-4" />
                </Button>
              </div>

              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-green-400">HP</span>
                  <span>{comp.currentHp}/{comp.maxHp}</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              </div>

              {/* MP Bar */}
              {comp.maxMp > 0 && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-blue-400">MP</span>
                    <span>{comp.currentMp}/{comp.maxMp}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${mpPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Tactics Selector */}
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Battle Tactics
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {(Object.entries(TACTICS_CONFIG) as [Companion['tactics'], typeof currentTactics][]).map(([key, cfg]) => {
                    const Icon = cfg.icon
                    return (
                      <button
                        key={key}
                        onClick={() => setTactics(comp.npcId, key)}
                        className={cn(
                          "flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all",
                          comp.tactics === key
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border hover:border-primary/30 text-muted-foreground hover:text-foreground"
                        )}
                        title={cfg.description}
                      >
                        <Icon className="w-3 h-3" />
                        <span className="text-[10px]">{cfg.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}

      <p className="text-[10px] text-muted-foreground text-center">
        Companions auto-join battles and follow you on the map.
      </p>
    </div>
  )
}
