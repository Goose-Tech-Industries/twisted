"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Minus, Plus, Shuffle, ChevronRight, ChevronLeft, Info } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────
export interface AbilityScoreDef {
  id: number; key_name: string; name: string; celtic_name?: string
  description?: string; icon?: string; min_value: number; max_value: number
  base_value: number; sort_order: number
}

export interface AbilityEffect {
  id: number; ability_id: number; stat_key: string
  bonus_per_point: number; description?: string
}

export interface RaceAbilityBonus {
  id: number; race_id: number; ability_id: number; bonus: number
}

interface Props {
  abilities: AbilityScoreDef[]
  effects: AbilityEffect[]
  raceBonuses: RaceAbilityBonus[]
  classBonuses?: Array<{ race_id?: number; class_id?: number; background_id?: number; ability_id: number; bonus: number }>
  bgBonuses?: Array<{ race_id?: number; class_id?: number; background_id?: number; ability_id: number; bonus: number }>
  raceId: number
  raceName: string
  classId?: number
  className?: string
  bgId?: number
  bgName?: string
  budget: number
  onComplete: (scores: Record<string, number>) => void
  onBack: () => void
}

// ── Helpers ───────────────────────────────────────────────────────
// Point cost table (BG3-style: 8-13 cost 1 each, 14 costs 2, 15 costs 2)
function pointCost(value: number): number {
  if (value <= 13) return value - 8
  if (value === 14) return 7
  return 9 // 15
}

function modifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

function modStr(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

// ── Component ─────────────────────────────────────────────────────
export function AbilityScoreAllocator({ abilities, effects, raceBonuses, classBonuses = [], bgBonuses = [], raceId, raceName, classId, className: clsName, bgId, bgName, budget, onComplete, onBack }: Props) {
  const sorted = useMemo(() => [...abilities].sort((a, b) => a.sort_order - b.sort_order), [abilities])

  // Initialize all scores at base_value (usually 8)
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {}
    for (const a of sorted) s[a.key_name] = a.base_value
    return s
  })
  const [showInfo, setShowInfo] = useState<string | null>(null)

  // Calculate points spent
  const pointsSpent = useMemo(() => {
    return Object.values(scores).reduce((sum, v) => sum + pointCost(v), 0)
  }, [scores])

  const pointsRemaining = budget - pointsSpent

  // Get total bonus for an ability (race + class + background)
  const getRaceBonus = useCallback((abilityId: number) => {
    const rb = raceBonuses.find(b => b.race_id === raceId && b.ability_id === abilityId)?.bonus || 0
    const cb = classId ? (classBonuses.find(b => (b.class_id || b.race_id) === classId && b.ability_id === abilityId)?.bonus || 0) : 0
    const bb = bgId ? (bgBonuses.find(b => (b.background_id || b.race_id) === bgId && b.ability_id === abilityId)?.bonus || 0) : 0
    return rb + cb + bb
  }, [raceBonuses, classBonuses, bgBonuses, raceId, classId, bgId])

  // Get individual source bonuses for display
  const getBonusSources = useCallback((abilityId: number) => {
    const sources: Array<{ label: string; bonus: number }> = []
    const rb = raceBonuses.find(b => b.race_id === raceId && b.ability_id === abilityId)?.bonus || 0
    if (rb) sources.push({ label: raceName, bonus: rb })
    if (classId) {
      const cb = classBonuses.find(b => (b.class_id || b.race_id) === classId && b.ability_id === abilityId)?.bonus || 0
      if (cb) sources.push({ label: clsName || 'Class', bonus: cb })
    }
    if (bgId) {
      const bb = bgBonuses.find(b => (b.background_id || b.race_id) === bgId && b.ability_id === abilityId)?.bonus || 0
      if (bb) sources.push({ label: bgName || 'Background', bonus: bb })
    }
    return sources
  }, [raceBonuses, classBonuses, bgBonuses, raceId, classId, bgId, raceName, clsName, bgName])

  // Get effects for an ability
  const getEffects = useCallback((abilityId: number) => {
    return effects.filter(e => e.ability_id === abilityId)
  }, [effects])

  const inc = useCallback((key: string) => {
    const ability = sorted.find(a => a.key_name === key)
    if (!ability) return
    const current = scores[key]
    if (current >= ability.max_value) return
    const newCost = pointCost(current + 1) - pointCost(current)
    if (newCost > pointsRemaining) return
    setScores(prev => ({ ...prev, [key]: current + 1 }))
  }, [scores, pointsRemaining, sorted])

  const dec = useCallback((key: string) => {
    const ability = sorted.find(a => a.key_name === key)
    if (!ability) return
    const current = scores[key]
    if (current <= ability.min_value) return
    setScores(prev => ({ ...prev, [key]: current - 1 }))
  }, [scores, sorted])

  const randomize = useCallback(() => {
    const newScores: Record<string, number> = {}
    for (const a of sorted) newScores[a.key_name] = a.base_value
    let remaining = budget
    // Randomly distribute points
    const keys = sorted.map(a => a.key_name)
    let attempts = 0
    while (remaining > 0 && attempts < 200) {
      const key = keys[Math.floor(Math.random() * keys.length)]
      const ability = sorted.find(a => a.key_name === key)!
      if (newScores[key] < ability.max_value) {
        const cost = pointCost(newScores[key] + 1) - pointCost(newScores[key])
        if (cost <= remaining) {
          newScores[key]++
          remaining -= cost
        }
      }
      attempts++
    }
    setScores(newScores)
  }, [sorted, budget])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold">Ability Scores</h3>
          <p className="text-xs text-muted-foreground">Allocate points to define your character&apos;s strengths — {raceName} racial bonuses applied</p>
        </div>
        <Button variant="outline" size="sm" onClick={randomize} className="gap-1">
          <Shuffle className="w-3.5 h-3.5" /> Random
        </Button>
      </div>

      {/* Points remaining */}
      <div className="flex items-center justify-center gap-3 py-2 bg-secondary/30 rounded-lg border border-border">
        <span className="text-xs text-muted-foreground">Points remaining:</span>
        <span className={cn("text-2xl font-bold font-mono",
          pointsRemaining > 5 ? "text-green-500" : pointsRemaining > 0 ? "text-yellow-500" : "text-muted-foreground"
        )}>
          {pointsRemaining}
        </span>
        <span className="text-xs text-muted-foreground">/ {budget}</span>
      </div>

      {/* Ability score rows */}
      <div className="space-y-2">
        {sorted.map(ability => {
          const base = scores[ability.key_name]
          const raceBonus = getRaceBonus(ability.id)
          const total = base + raceBonus
          const mod = modifier(total)
          const abilityEffects = getEffects(ability.id)
          const isInfoOpen = showInfo === ability.key_name

          return (
            <div key={ability.key_name} className="bg-secondary/20 rounded-lg border border-border p-2 md:p-3">
              <div className="flex items-center gap-2 md:gap-3">
                {/* Icon + name */}
                <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-primary/10 flex items-center justify-center text-base md:text-lg shrink-0">
                  {ability.icon || '⚡'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs md:text-sm font-bold truncate">{ability.name}</span>
                    {ability.celtic_name && (
                      <span className="text-[9px] md:text-[10px] text-primary/60 italic hidden sm:inline">{ability.celtic_name}</span>
                    )}
                    <button onClick={() => setShowInfo(isInfoOpen ? null : ability.key_name)}
                      className="text-muted-foreground hover:text-foreground shrink-0">
                      <Info className="w-3 h-3" />
                    </button>
                  </div>
                  {raceBonus !== 0 && (
                    <div className="flex flex-wrap gap-1">
                      {getBonusSources(ability.id).map((s, i) => (
                        <span key={i} className={cn("text-[9px] md:text-[10px] font-medium",
                          s.bonus > 0 ? "text-green-400" : "text-red-400"
                        )}>
                          {s.label} {s.bonus > 0 ? `+${s.bonus}` : s.bonus}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-1 md:gap-2 shrink-0">
                  <button onClick={() => dec(ability.key_name)}
                    disabled={base <= ability.min_value}
                    className="w-7 h-7 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center disabled:opacity-30">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <div className="text-center w-10 md:w-12">
                    <div className="text-base md:text-lg font-bold font-mono">{base}</div>
                    {raceBonus !== 0 && (
                      <div className="text-[9px] md:text-[10px] text-muted-foreground">&rarr; {total}</div>
                    )}
                  </div>
                  <button onClick={() => inc(ability.key_name)}
                    disabled={base >= ability.max_value || pointsRemaining <= 0}
                    className="w-7 h-7 rounded bg-secondary hover:bg-secondary/80 flex items-center justify-center disabled:opacity-30">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Modifier */}
                <div className={cn("w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center font-bold font-mono text-xs md:text-sm shrink-0",
                  mod > 0 ? "bg-green-900/30 text-green-400" :
                  mod < 0 ? "bg-red-900/30 text-red-400" :
                  "bg-secondary text-muted-foreground"
                )}>
                  {modStr(mod)}
                </div>
              </div>

              {/* Info panel */}
              {isInfoOpen && (
                <div className="mt-2 pt-2 border-t border-border/50 space-y-1">
                  {ability.description && (
                    <p className="text-[11px] text-muted-foreground">{ability.description}</p>
                  )}
                  {abilityEffects.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {abilityEffects.map(e => (
                        <span key={e.id} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          {e.description || `${e.stat_key} ${modStr(e.bonus_per_point)}/pt`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Derived stats preview */}
      <div className="bg-secondary/20 rounded-lg border border-border p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Derived Bonuses</p>
        <div className="flex flex-wrap gap-2">
          {sorted.map(ability => {
            const total = scores[ability.key_name] + getRaceBonus(ability.id)
            const mod = modifier(total)
            if (mod === 0) return null
            return getEffects(ability.id).map(e => {
              const bonus = Math.floor(mod * e.bonus_per_point)
              if (bonus === 0) return null
              return (
                <span key={e.id} className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono",
                  bonus > 0 ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
                )}>
                  {e.stat_key}: {modStr(bonus)}
                </span>
              )
            })
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onBack} className="flex-1 gap-1">
          <ChevronLeft className="w-4 h-4" /> Back
        </Button>
        <Button onClick={() => onComplete(scores)} disabled={pointsRemaining < 0}
          className="flex-1 blood-glow gap-1">
          Continue <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
