"use client"

import React from 'react'
import type { BattleToken } from "@/lib/game-types"
import { ParticleOverlay } from "./particle-overlay"
import { cn } from "@/lib/utils"
import { Crown, Move, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TERRAIN_STYLES, ELEVATION_OPACITY, WOUND_COLORS } from "./battle-arena"

interface GridObject {
  x: number
  y: number
  destroyed?: boolean
  blocking?: boolean
  label: string
  icon: string
  hp: number
  maxHp: number
}

interface BattleGridProps {
  grid: {
    width: number
    height: number
    tokens: BattleToken[]
    objects?: GridObject[]
  }
  terrainMap: Record<string, string>
  elevationMap: Record<string, number>
  threatenedTiles: Set<string>
  difficultSet: Set<string>
  validMoves: Set<string>
  selectedTarget: number | null
  selectedObjectKey: string | null
  myCharId: number | undefined
  myTeamId: string | undefined
  turnCharId: number | undefined
  CELL_SIZE: number
  isAnimating: boolean
  particleEffects: Array<{ preset: string; x: number; y: number; id: string }>
  battleEmote: { gridX: number; gridY: number; icon: string } | null | undefined
  // ATB / Formation data from battle
  battle: Record<string, unknown>
  // CTB timeline
  ctb: Record<string, unknown> | null
  // Grid interaction
  onGridClick: (x: number, y: number) => void
  // Move controls
  isMyTurn: boolean
  hasMoved: boolean
  showMoveRange: boolean
  moveRange: number
  onToggleMove: () => void
  // Formation row swap
  hasFormation: boolean
  onSwapRow: () => void
}

export function BattleGrid({
  grid,
  terrainMap,
  elevationMap,
  threatenedTiles,
  difficultSet,
  validMoves,
  selectedTarget,
  selectedObjectKey,
  myCharId,
  myTeamId,
  turnCharId,
  CELL_SIZE,
  isAnimating,
  particleEffects,
  battleEmote,
  battle,
  ctb,
  onGridClick,
  isMyTurn,
  hasMoved,
  showMoveRange,
  moveRange,
  onToggleMove,
  hasFormation,
  onSwapRow,
}: BattleGridProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-2 md:p-4 bg-gradient-to-b from-card via-background to-card">
      <div
        className="relative border-2 border-border/50 rounded-lg overflow-hidden"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${grid.width}, ${CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${grid.height}, ${CELL_SIZE}px)`,
        }}
      >
        {/* Grid Cells */}
        {Array.from({ length: grid.height }, (_, y) =>
          Array.from({ length: grid.width }, (_, x) => {
            const key = `${x},${y}`
            const terrain = terrainMap[key] || 'open'
            const style = TERRAIN_STYLES[terrain] || TERRAIN_STYLES.open
            const isValidMove = validMoves.has(key)
            const token = grid.tokens.find(t => t.gridX === x && t.gridY === y && !t.dead)
            const gridObj = (grid.objects || []).find(o => o.x === x && o.y === y && !o.destroyed)
            const isMyToken = token && token.charId === myCharId
            const tokenTeamId = token ? String(token.teamId) : ''
            const isAlly = token && (tokenTeamId === myTeamId || (!myTeamId && tokenTeamId === 'players') || tokenTeamId === '1')
            const isEnemy = token && !isAlly
            const isTargeted = token && token.charId === selectedTarget
            const isObjTargeted = gridObj && selectedObjectKey === key
            const elevation = elevationMap[key] || 0
            const isThreatened = threatenedTiles.has(key)
            const isDifficult = difficultSet.has(key)

            return (
              <div
                key={key}
                className={cn(
                  "relative border border-border/20 flex items-center justify-center cursor-pointer transition-all",
                  isValidMove && "ring-2 ring-inset ring-primary/60",
                  isTargeted && "ring-2 ring-inset ring-destructive",
                  isObjTargeted && "ring-2 ring-inset ring-[oklch(0.65_0.15_85)]",
                  isThreatened && !isValidMove && !isTargeted && "ring-1 ring-inset ring-destructive/30",
                )}
                style={{ backgroundColor: style.bg }}
                onClick={() => onGridClick(x, y)}
                title={[
                  gridObj ? `${gridObj.label} (${gridObj.hp}/${gridObj.maxHp} HP)` : `(${x},${y}) ${style.label}`,
                  elevation > 0 ? `Elev: ${elevation}` : '',
                  isDifficult ? 'Difficult terrain (2x move cost)' : '',
                  isThreatened ? 'Enemy zone of control' : '',
                ].filter(Boolean).join(' | ')}
              >
                {/* Elevation overlay — lighter = higher */}
                {elevation > 0 && (
                  <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: ELEVATION_OPACITY[elevation] || 0.24 }} />
                )}

                {/* Zone of control threat overlay */}
                {isThreatened && !isValidMove && (
                  <div className="absolute inset-0 bg-destructive/8 pointer-events-none" />
                )}

                {/* Difficult terrain indicator */}
                {isDifficult && !token && !gridObj && (
                  <div className="absolute bottom-0.5 right-0.5 text-[8px] text-[oklch(0.65_0.15_85)] font-bold pointer-events-none">2x</div>
                )}

                {/* Elevation number badge */}
                {elevation > 0 && !token && !gridObj && (
                  <div className="absolute top-0.5 left-0.5 text-[8px] text-white/50 font-mono pointer-events-none">{elevation}</div>
                )}

                {/* Terrain icon */}
                {style.icon && !token && !gridObj && (
                  <span className="text-lg opacity-30">{style.icon}</span>
                )}

                {/* Valid move highlight */}
                {isValidMove && !token && !gridObj && (
                  <div className="absolute inset-0 bg-primary/15 rounded-sm" />
                )}

                {/* Battle Object */}
                {gridObj && !token && (
                  <div className={cn(
                    "w-12 h-12 rounded-lg flex flex-col items-center justify-center border-2 transition-all",
                    isObjTargeted
                      ? "border-[oklch(0.65_0.15_85)] bg-[oklch(0.65_0.15_85)]/20 ring-2 ring-[oklch(0.65_0.15_85)]/40"
                      : "border-[oklch(0.50_0.08_60)] bg-[oklch(0.25_0.04_60)]/60"
                  )}>
                    <span className="text-lg leading-none">{gridObj.icon}</span>
                    {/* Object HP bar */}
                    <div className="w-10 h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                      <div
                        className="h-full bg-[oklch(0.65_0.15_85)]"
                        style={{ width: `${(gridObj.hp / gridObj.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Token */}
                {token && (
                  <div
                    className={cn(
                      "w-12 h-12 rounded-lg flex flex-col items-center justify-center border-2 transition-all",
                      isMyToken && "border-primary bg-primary/30 ring-2 ring-primary/40",
                      isAlly && !isMyToken && "border-[oklch(0.55_0.15_140)] bg-[oklch(0.55_0.15_140)]/20",
                      isEnemy && "border-destructive bg-destructive/20",
                      token.charId === turnCharId && "animate-pulse-slow",
                      token.knockedOut && "border-[oklch(0.50_0.18_300)] bg-[oklch(0.30_0.12_300)]/40",
                      token.dead && "opacity-40",
                    )}
                  >
                    {token.knockedOut && !token.dead ? (
                      <span className="text-lg" title={`${token.name} (KO)`}>💫</span>
                    ) : (token as unknown as Record<string,unknown>).spriteUrl ? (
                      <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${(token as unknown as Record<string,unknown>).spriteUrl}`}
                        alt={token.name} className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} />
                    ) : (
                      <span className="text-[10px] font-bold truncate max-w-[48px]">
                        {token.name.split(' ')[0]}
                      </span>
                    )}
                    {/* Mini HP bar */}
                    <div className="w-10 h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                      <div
                        className={cn("h-full", isEnemy ? "bg-destructive" : "bg-[oklch(0.55_0.15_140)]")}
                        style={{ width: `${(token.hp / token.maxHp) * 100}%` }}
                      />
                    </div>
                    {/* Formation row badge */}
                    {!!battle.formation && !!(token as unknown as Record<string,unknown>).row && (
                      <div className={cn(
                        "absolute -top-1 -right-1 text-[7px] font-bold px-1 rounded",
                        (token as unknown as Record<string,unknown>).row === 'front'
                          ? "bg-[oklch(0.65_0.15_85)]/80 text-[oklch(0.95_0.05_85)]"
                          : "bg-[oklch(0.50_0.15_250)]/80 text-[oklch(0.90_0.05_250)]"
                      )}>
                        {(token as unknown as Record<string,unknown>).row === 'front' ? 'F' : 'B'}
                      </div>
                    )}
                    {/* ATB gauge mini-bar */}
                    {!!battle.atb && (
                      <div className="w-10 h-0.5 bg-muted/50 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full transition-all",
                            isEnemy ? "bg-[oklch(0.65_0.15_85)]" : "bg-[oklch(0.65_0.20_200)]"
                          )}
                          style={{ width: `${(battle.atb as Record<string,unknown>)?.gauges
                            ? ((battle.atb as Record<string,Record<string,unknown>>).gauges[String(token.charId)] as Record<string,unknown>)?.pct || 0
                            : 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}

        {/* Particle effects overlay */}
        <ParticleOverlay
          effects={particleEffects}
          width={grid.width * CELL_SIZE}
          height={grid.height * CELL_SIZE}
        />

        {/* Emote overlay */}
        {battleEmote && (
          <div
            className="absolute z-30 flex items-center justify-center pointer-events-none animate-bounce"
            style={{
              left: battleEmote.gridX * CELL_SIZE + CELL_SIZE / 2 - 16,
              top: battleEmote.gridY * CELL_SIZE - 20,
              width: 32, height: 32,
            }}
          >
            <span className="text-2xl drop-shadow-lg">{battleEmote.icon}</span>
          </div>
        )}
      </div>

      {/* CTB Timeline (shown alongside grid when CTB mode active) */}
      {ctb && (
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] text-muted-foreground mr-1">Turn Order:</span>
          {((ctb.timeline as Array<{ charId: number; name: string; teamId: string; isAI: boolean }>) || []).slice(0, 10).map((entry, i) => {
            const isMe = entry.charId === myCharId
            return (
              <div key={i} className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-medium border",
                i === 0 ? "bg-primary/20 border-primary/40 text-primary" :
                entry.isAI ? "bg-destructive/10 border-destructive/20 text-destructive" :
                isMe ? "bg-primary/10 border-primary/20 text-primary" :
                "bg-muted border-border/30 text-muted-foreground"
              )}>
                {i === 0 && <Crown className="w-2.5 h-2.5 inline mr-0.5" />}
                {entry.name.split(' ')[0]}
              </div>
            )
          })}
        </div>
      )}

      {/* Move + Row Swap buttons */}
      <div className="flex gap-2 mt-3">
      {isMyTurn && !hasMoved && !isAnimating && (
        <Button
          variant={showMoveRange ? "default" : "outline"}
          size="sm"
          onClick={onToggleMove}
        >
          <Move className="w-4 h-4 mr-1" />
          {showMoveRange ? 'Cancel Move' : `Move (${moveRange} tiles)`}
        </Button>
      )}

      {/* Row Swap button (formation system) */}
      {isMyTurn && !isAnimating && hasFormation && (
        <Button
          variant="outline"
          size="sm"
          onClick={onSwapRow}
        >
          <ShieldAlert className="w-4 h-4 mr-1" />
          Swap Row
        </Button>
      )}
      </div>
    </div>
  )
}
