"use client"

import React from 'react'
import type { BattleCombatant } from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { Heart, Droplets, Zap, Skull, Crown } from "lucide-react"
import { WOUND_COLORS } from "./battle-arena"

// Compact combatant card for the side panels
export function CombatantCard({ combatant, isActive, color, isTargeted, onSelect }: {
  combatant: BattleCombatant
  isActive: boolean
  color: 'primary' | 'destructive'
  isTargeted?: boolean
  onSelect?: () => void
}) {
  const hpPct = combatant.maxHp > 0 ? (combatant.hp / combatant.maxHp) * 100 : 0
  const mpPct = combatant.maxMp > 0 ? (combatant.mp / combatant.maxMp) * 100 : 0
  const isDead = combatant.dead || combatant.hp <= 0
  const isKO = combatant.knockedOut

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full p-2 rounded-lg border text-left transition-all",
        isDead && "opacity-40",
        isActive && "border-primary/60 bg-primary/10",
        isTargeted && "ring-2 ring-destructive",
        !isActive && !isTargeted && "border-border/50 bg-card/30",
        onSelect && "cursor-pointer hover:bg-card/60"
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {isActive && <Crown className="w-3 h-3 text-primary shrink-0" />}
        <span className="text-xs font-medium truncate">{combatant.name}</span>
        {combatant.prone && <span className="text-[10px] shrink-0" title="Prone">⬇️</span>}
        {isKO && !isDead && <span className="text-[10px] shrink-0" title="Knocked Out">💫</span>}
        {isDead && !isKO && <Skull className="w-3 h-3 text-destructive shrink-0" />}
      </div>

      {/* HP */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <Heart className="w-2.5 h-2.5 text-[oklch(0.55_0.20_140)]" />
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-[oklch(0.55_0.20_140)]" style={{ width: `${hpPct}%` }} />
        </div>
        <span className="tabular-nums w-14 text-right">{combatant.hp}/{combatant.maxHp}</span>
      </div>

      {/* MP */}
      {combatant.maxMp > 0 && (
        <div className="flex items-center gap-1 text-[10px]">
          <Droplets className="w-2.5 h-2.5 text-[oklch(0.55_0.18_260)]" />
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-[oklch(0.55_0.18_260)]" style={{ width: `${mpPct}%` }} />
          </div>
          <span className="tabular-nums w-14 text-right">{combatant.mp}/{combatant.maxMp}</span>
        </div>
      )}

      {/* Statuses */}
      {combatant.statuses && combatant.statuses.length > 0 && (
        <div className="flex gap-0.5 mt-1 flex-wrap">
          {combatant.statuses.map(s => (
            <span key={s.id} className="text-[9px] px-1 py-0 bg-destructive/20 text-destructive rounded" title={s.description}>
              {s.name}
            </span>
          ))}
        </div>
      )}

      {/* Limit break */}
      {combatant.limitbreak !== undefined && combatant.limitbreak > 0 && (
        <div className="flex items-center gap-1 text-[10px] mt-0.5">
          <Zap className="w-2.5 h-2.5 text-[oklch(0.60_0.25_310)]" />
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full", combatant.limitbreak >= 100
                ? "bg-[oklch(0.55_0.25_310)] animate-pulse-slow"
                : "bg-[oklch(0.45_0.20_310)]"
              )}
              style={{ width: `${Math.min(combatant.limitbreak, 100)}%` }}
            />
          </div>
          <span className="tabular-nums w-8 text-right">{Math.round(combatant.limitbreak)}%</span>
        </div>
      )}

      {/* Limb zone wound dots */}
      {combatant.limbZones && combatant.limbZones.length > 0 && (
        <div className="flex items-center gap-1 mt-1" title="Limb conditions">
          {[...combatant.limbZones].sort((a, b) => a.sortOrder - b.sortOrder).map(zone => {
            const woundLevel = combatant.woundLevels?.[zone.key] || 'normal'
            return (
              <span
                key={zone.key}
                className={cn("w-2 h-2 rounded-full", WOUND_COLORS[woundLevel] || WOUND_COLORS.normal)}
                title={`${zone.label}: ${woundLevel}`}
              />
            )
          })}
        </div>
      )}

      {/* Ki Channeling indicator */}
      {combatant.kiChanneled && (
        <div className="flex items-center gap-1 text-[10px] mt-0.5 text-[oklch(0.65_0.20_60)]">
          <span>🔥</span>
          <span className="font-medium animate-pulse-slow">Ki Surge: {combatant.kiChanneled.turnsLeft}t</span>
        </div>
      )}

      {/* Bleed indicators */}
      {combatant.bleeds && combatant.bleeds.length > 0 && (
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {combatant.bleeds.map((b, i) => (
            <span key={`${b.tier}-${i}`} className="text-[9px] px-1 py-0 bg-destructive/20 text-destructive rounded" title={`${b.label}: ${b.turnsLeft} turns left`}>
              {b.icon} {b.turnsLeft}t
            </span>
          ))}
        </div>
      )}

      {/* Session 12: RP effect badges */}
      {(combatant.taunted || combatant.intimidated || combatant.rallied || combatant.tauntBonus) && (
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {combatant.taunted && (
            <span className="text-[9px] px-1 py-0 bg-[oklch(0.60_0.18_25)]/20 text-[oklch(0.60_0.18_25)] rounded">😤 Taunted</span>
          )}
          {combatant.intimidated && (
            <span className="text-[9px] px-1 py-0 bg-[oklch(0.55_0.15_280)]/20 text-[oklch(0.55_0.15_280)] rounded">👁️ Shaken {combatant.intimidated.turnsLeft}t</span>
          )}
          {combatant.rallied && (
            <span className="text-[9px] px-1 py-0 bg-[oklch(0.55_0.15_140)]/20 text-[oklch(0.55_0.15_140)] rounded">📣 Rallied {combatant.rallied.turnsLeft}t</span>
          )}
          {combatant.tauntBonus && (
            <span className="text-[9px] px-1 py-0 bg-[oklch(0.65_0.20_60)]/20 text-[oklch(0.65_0.20_60)] rounded">⚔️ Empowered</span>
          )}
        </div>
      )}

      {/* Stagger Gauge (FF7R) */}
      {(combatant.staggerThreshold ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-[10px] mt-0.5">
          <span className={combatant.isStaggered ? "text-[oklch(0.65_0.20_60)] animate-pulse" : "text-muted-foreground"}>💫</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all", combatant.isStaggered ? "bg-[oklch(0.65_0.20_60)] animate-pulse" : "bg-[oklch(0.55_0.18_280)]")}
              style={{ width: `${combatant.isStaggered ? 100 : Math.min(100, ((combatant.staggerGauge || 0) / (combatant.staggerThreshold || 1)) * 100)}%` }}
            />
          </div>
          {combatant.isStaggered ? (
            <span className="text-[oklch(0.65_0.20_60)] font-bold">x{combatant.staggerMult?.toFixed(1)}</span>
          ) : (
            <span className="tabular-nums text-muted-foreground">{combatant.staggerGauge || 0}/{combatant.staggerThreshold}</span>
          )}
        </div>
      )}

      {/* Break/Shield (Octopath) */}
      {combatant.shieldPoints != null && combatant.maxShieldPoints != null && combatant.maxShieldPoints > 0 && (
        <div className="flex items-center gap-1 mt-0.5 text-[10px]">
          <span>🛡️</span>
          <div className="flex gap-0.5">
            {Array.from({ length: combatant.maxShieldPoints }, (_, i) => (
              <span key={i} className={cn("w-2 h-2 rounded-full",
                combatant.isBroken ? "bg-destructive animate-pulse" :
                i < (combatant.shieldPoints || 0) ? "bg-[oklch(0.55_0.18_260)]" : "bg-muted"
              )} />
            ))}
          </div>
          {combatant.isBroken && <span className="text-destructive font-bold">BREAK!</span>}
          {combatant.shieldWeaknesses && combatant.shieldWeaknesses.length > 0 && (
            <span className="text-[9px] text-muted-foreground ml-1">
              Weak: {combatant.shieldWeaknesses.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Passive abilities */}
      {combatant.passives && combatant.passives.length > 0 && (
        <div className="flex gap-0.5 mt-0.5 flex-wrap">
          {combatant.passives.map((p, i) => (
            <span key={i} className="text-[9px] px-1 py-0 bg-[oklch(0.55_0.15_210)]/20 text-[oklch(0.55_0.15_210)] rounded" title={p.name}>
              {p.icon}
            </span>
          ))}
        </div>
      )}

      {/* Combo AP bar */}
      {combatant.currentAp != null && combatant.maxAp != null && combatant.maxAp > 0 && (
        <div className="flex items-center gap-1 text-[10px] mt-0.5">
          <span className="text-[oklch(0.65_0.20_60)]">🎮</span>
          <div className="flex gap-0.5">
            {Array.from({ length: combatant.maxAp }, (_, i) => (
              <span key={i} className={cn("w-1.5 h-3 rounded-sm",
                i < (combatant.currentAp || 0) ? "bg-[oklch(0.65_0.20_60)]" : "bg-muted"
              )} />
            ))}
          </div>
          <span className="text-muted-foreground tabular-nums">{combatant.currentAp}/{combatant.maxAp}</span>
        </div>
      )}

      {/* Session 24: Alignment tier */}
      {combatant.alignmentTier && (
        <div className={cn("text-[9px] mt-0.5", combatant.alignmentTier.color || 'text-muted-foreground')}>
          {combatant.alignmentTier.icon} {combatant.alignmentTier.name}
        </div>
      )}

      {/* Sessions 17-22: Stealth + Transform indicators */}
      {combatant.isStealthed && (
        <div className="text-[9px] mt-0.5 text-[oklch(0.55_0.12_200)]">🥷 Stealthed</div>
      )}
      {combatant.transformed && (
        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-[oklch(0.65_0.22_50)]">
          <span>{combatant.transformed.icon}</span>
          <span className="animate-pulse-slow">{combatant.transformed.name} {combatant.transformed.turnsLeft}t</span>
        </div>
      )}

      {/* Session 16: Boss phase indicator */}
      {combatant.isBoss && combatant.bossPhaseCount && combatant.bossPhaseCount > 0 && (
        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-[oklch(0.65_0.20_25)]">
          <span>👑</span>
          <span>Phase {(combatant.currentPhase || 0) + 1}/{combatant.bossPhaseCount + 1}</span>
        </div>
      )}

      {/* Session 15: Spell slots (BG3-style) */}
      {combatant.spellSlots && Object.keys(combatant.spellSlots).length > 0 && (
        <div className="flex items-center gap-1.5 mt-0.5 text-[9px]">
          {Object.entries(combatant.spellSlots).sort(([a],[b]) => Number(a)-Number(b)).map(([level, slot]) => (
            <div key={level} className="flex items-center gap-0.5" title={`Level ${level}: ${(slot as any).current}/${(slot as any).max}`}>
              <span className="text-muted-foreground">L{level}</span>
              {Array.from({ length: (slot as any).max }, (_, i) => (
                <span key={i} className={cn("w-1.5 h-1.5 rounded-full",
                  i < (slot as any).current ? "bg-[oklch(0.55_0.18_260)]" : "bg-muted"
                )} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Session 15: Summon indicator */}
      {combatant.isSummon && combatant.summonTurnsLeft != null && (
        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-[oklch(0.60_0.20_280)]">
          <span>👻</span>
          <span>Summon: {combatant.summonTurnsLeft}t</span>
        </div>
      )}

      {/* Session 13: Fighting style badge */}
      {combatant.fightingStyle && (
        <div className="flex items-center gap-1 mt-0.5 text-[9px] text-muted-foreground">
          <span>{combatant.fightingStyle.styleIcon}</span>
          <span className="truncate">{combatant.fightingStyle.styleName}</span>
          <span className="text-[8px] opacity-60">{combatant.fightingStyle.rankLabel}</span>
        </div>
      )}
    </button>
  )
}

// Mobile: compact combatant pill for horizontal team strip
export function MiniCombatantPill({ combatant, isActive, color, isTargeted, onSelect }: {
  combatant: BattleCombatant
  isActive: boolean
  color: 'primary' | 'destructive'
  isTargeted?: boolean
  onSelect?: () => void
}) {
  const hpPct = combatant.maxHp > 0 ? (combatant.hp / combatant.maxHp) * 100 : 0
  const isDead = combatant.dead || combatant.hp <= 0
  const isKO = combatant.knockedOut

  return (
    <button
      onClick={onSelect}
      className={cn(
        "shrink-0 px-2 py-1 rounded-lg border text-left transition-all min-w-[80px]",
        isDead && "opacity-40",
        isActive && "border-primary/60 bg-primary/10",
        isTargeted && "ring-2 ring-destructive",
        !isActive && !isTargeted && color === 'primary' ? "border-primary/30 bg-primary/5" : "",
        !isActive && !isTargeted && color === 'destructive' ? "border-destructive/30 bg-destructive/5" : "",
        onSelect && "active:scale-95"
      )}
    >
      <div className="flex items-center gap-1 mb-0.5">
        {isActive && <Crown className="w-2.5 h-2.5 text-primary shrink-0" />}
        {isKO && !isDead && <span className="text-[9px]">💫</span>}
        {isDead && !isKO && <Skull className="w-2.5 h-2.5 text-destructive shrink-0" />}
        <span className="text-[10px] font-medium truncate">{combatant.name}</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full", color === 'primary' ? "bg-[oklch(0.55_0.20_140)]" : "bg-destructive")}
          style={{ width: `${hpPct}%` }}
        />
      </div>
    </button>
  )
}
