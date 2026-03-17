"use client"
import React from 'react'

import { useState, useCallback, useMemo } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import type { BattleCommand, Skill, BattleToken, BattleCombatant } from "@/lib/game-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Swords, Shield, Sparkles, FlaskRound, LogOut, Zap, Heart, Droplets,
  ChevronRight, X, Skull, Trophy, MapPin, Move, Crosshair, Crown, Clock
} from "lucide-react"

const COMMAND_ICONS: Record<string, React.ElementType> = {
  attack: Swords, skill: Sparkles, item: FlaskRound,
  defend: Shield, flee: LogOut, limit: Zap
}

const TERRAIN_STYLES: Record<string, { bg: string; label: string; icon: string }> = {
  open:        { bg: '#1a2a1a', label: 'Open',        icon: '' },
  forest:      { bg: '#0a2a0a', label: 'Forest -20%', icon: '🌲' },
  high_ground: { bg: '#3a3a2a', label: 'High +15%',   icon: '⛰️' },
  cover:       { bg: '#2a2a1a', label: 'Cover -30%',  icon: '🪨' },
  water:       { bg: '#0a1a3a', label: 'Water -10%',  icon: '🌊' },
}

const CELL_SIZE = 64

export function BattleArena() {
  const { state, dispatch, socket } = useGame()
  const { notify } = useNotification()

  const battle = state.battle
  const [selectedCommand, setSelectedCommand] = useState<BattleCommand | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showMoveRange, setShowMoveRange] = useState(false)

  // No active battle
  if (!battle) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="celtic-border max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-4">
              <Swords className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No Active Battle</h2>
            <p className="text-muted-foreground mb-6">Explore the world to encounter enemies.</p>
            <Button onClick={() => dispatch({ type: 'SET_VIEW', payload: 'map' })} className="w-full">
              <MapPin className="w-4 h-4 mr-2" /> Return to Map
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const grid = battle.grid || { width: 8, height: 5, tokens: [] }
  const terrainMap = battle.terrainMap || {}
  const playerTeam = battle.playerTeam || (battle.me ? [battle.me] : [])
  const enemyTeam = battle.enemyTeam || (battle.opponent ? [battle.opponent] : [])
  const turnOrder = battle.turnOrder || []
  const me = battle.me
  const myCharId = me?.charId || state.character?.charId

  // Valid move tiles
  const validMoves = useMemo(() => {
    if (!showMoveRange || battle.hasMoved) return new Set<string>()
    const myToken = grid.tokens.find(t => t.charId === myCharId)
    if (!myToken) return new Set<string>()
    const range = battle.moveRange || 2
    const occupied = new Set(grid.tokens.filter(t => !t.dead).map(t => `${t.gridX},${t.gridY}`))
    const moves = new Set<string>()
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue
        const nx = myToken.gridX + dx
        const ny = myToken.gridY + dy
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue
        if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue // Chebyshev
        const key = `${nx},${ny}`
        if (!occupied.has(key)) moves.add(key)
      }
    }
    return moves
  }, [showMoveRange, battle.hasMoved, grid, myCharId, battle.moveRange])

  const executeAction = (commandId: number, skillId?: number, itemId?: number) => {
    if (!socket || !battle) return
    setIsAnimating(true)
    socket.emit('battle_action', {
      battleId: battle.battleId,
      commandId,
      ...(skillId != null && { skillId }),
      ...(itemId != null && { itemId }),
      ...(selectedTarget != null && { targetId: selectedTarget }),
    })
    setSelectedTarget(null)
    setSelectedCommand(null)
    setShowMoveRange(false)
    setTimeout(() => setIsAnimating(false), 800)
  }

  const handleCommand = (command: BattleCommand) => {
    if (!battle.isMyTurn || isAnimating) return
    if (command.type === 'skill' && command.skills) {
      setSelectedCommand(command)
      return
    }
    executeAction(command.id)
  }

  const handleSkill = (skill: Skill) => {
    if (skill.mpCost > (me?.mp || 0)) {
      notify('error', 'Not enough MP!')
      return
    }
    executeAction(selectedCommand?.id ?? 2, skill.id)
  }

  const handleGridClick = (x: number, y: number) => {
    if (!battle.isMyTurn || isAnimating) return

    // Move to tile
    if (showMoveRange && validMoves.has(`${x},${y}`)) {
      socket?.emit('battle_move', { battleId: battle.battleId, x, y })
      setShowMoveRange(false)
      return
    }

    // Select target
    const token = grid.tokens.find(t => t.gridX === x && t.gridY === y && !t.dead)
    if (token && token.teamId !== (grid.tokens.find(t => t.charId === myCharId)?.teamId ?? 1)) {
      setSelectedTarget(token.charId)
    }
  }

  const returnToMap = () => {
    dispatch({ type: 'SET_BATTLE', payload: null })
    dispatch({ type: 'SET_VIEW', payload: 'map' })
  }

  // Victory / Defeat
  if (battle.status === 'VICTORY' || battle.status === 'DEFEAT' || battle.status === 'FINISHED') {
    const won = battle.status === 'VICTORY' || (battle.status === 'FINISHED' && battle.winner === myCharId)
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="celtic-border max-w-md w-full">
          <CardContent className="p-8 text-center">
            {won ? (
              <>
                <div className="w-20 h-20 rounded-full bg-[oklch(0.55_0.15_140)]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-10 h-10 text-[oklch(0.55_0.15_140)]" />
                </div>
                <h2 className="text-2xl font-bold text-[oklch(0.55_0.15_140)] mb-2">Victory!</h2>
                <p className="text-muted-foreground mb-6">The enemy has been vanquished!</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                  <Skull className="w-10 h-10 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold text-destructive mb-2">Defeat</h2>
                <p className="text-muted-foreground mb-6">You have fallen in battle...</p>
              </>
            )}
            <Button onClick={returnToMap} className="w-full">Continue</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar: Turn Order */}
      <div className="border-b border-border bg-card/80 px-4 py-2 flex items-center gap-4">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" /> Turn {battle.turn}
        </div>
        <div className="flex items-center gap-1 flex-1 overflow-x-auto">
          {turnOrder.map((entry, i) => (
            <div
              key={`${entry.charId}-${i}`}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded text-xs whitespace-nowrap",
                entry.isCurrent ? "bg-primary text-primary-foreground" :
                entry.teamId === 1 ? "bg-[oklch(0.55_0.15_140)]/20 text-[oklch(0.55_0.15_140)]" :
                "bg-destructive/20 text-destructive"
              )}
            >
              {entry.isCurrent && <Crown className="w-3 h-3" />}
              {entry.name}
            </div>
          ))}
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-xs font-medium",
          battle.isMyTurn ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"
        )}>
          {battle.isMyTurn ? 'Your Turn' : 'Enemy Turn'}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Player Team */}
        <div className="w-48 border-r border-border bg-card/50 p-2 overflow-y-auto space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Your Team</p>
          {playerTeam.filter(c => c).map((c, i) => (
            <CombatantCard key={c.charId || i} combatant={c} isActive={c.charId === battle.turnCharId} color="primary" />
          ))}
        </div>

        {/* Center: Tactical Grid */}
        <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 bg-gradient-to-b from-card via-background to-card">
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
                const isMyToken = token && token.charId === myCharId
                const isEnemy = token && token.teamId === 2
                const isAlly = token && token.teamId === 1
                const isTargeted = token && token.charId === selectedTarget

                return (
                  <div
                    key={key}
                    className={cn(
                      "relative border border-border/20 flex items-center justify-center cursor-pointer transition-all",
                      isValidMove && "ring-2 ring-inset ring-primary/60",
                      isTargeted && "ring-2 ring-inset ring-destructive",
                    )}
                    style={{ backgroundColor: style.bg }}
                    onClick={() => handleGridClick(x, y)}
                    title={`(${x},${y}) ${style.label}`}
                  >
                    {/* Terrain icon */}
                    {style.icon && !token && (
                      <span className="text-lg opacity-30">{style.icon}</span>
                    )}

                    {/* Valid move highlight */}
                    {isValidMove && !token && (
                      <div className="absolute inset-0 bg-primary/15 rounded-sm" />
                    )}

                    {/* Token */}
                    {token && (
                      <div
                        className={cn(
                          "w-12 h-12 rounded-lg flex flex-col items-center justify-center border-2 transition-all",
                          isMyToken && "border-primary bg-primary/30 ring-2 ring-primary/40",
                          isAlly && !isMyToken && "border-[oklch(0.55_0.15_140)] bg-[oklch(0.55_0.15_140)]/20",
                          isEnemy && "border-destructive bg-destructive/20",
                          token.charId === battle.turnCharId && "animate-pulse-slow",
                        )}
                      >
                        <span className="text-[10px] font-bold truncate max-w-[48px]">
                          {token.name.split(' ')[0]}
                        </span>
                        {/* Mini HP bar */}
                        <div className="w-10 h-1 bg-muted rounded-full mt-0.5 overflow-hidden">
                          <div
                            className={cn("h-full", isEnemy ? "bg-destructive" : "bg-[oklch(0.55_0.15_140)]")}
                            style={{ width: `${(token.hp / token.maxHp) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Move button */}
          {battle.isMyTurn && !battle.hasMoved && !isAnimating && (
            <Button
              variant={showMoveRange ? "default" : "outline"}
              size="sm"
              className="mt-3"
              onClick={() => setShowMoveRange(!showMoveRange)}
            >
              <Move className="w-4 h-4 mr-1" />
              {showMoveRange ? 'Cancel Move' : `Move (${battle.moveRange || 2} tiles)`}
            </Button>
          )}
        </div>

        {/* Right: Enemy Team */}
        <div className="w-48 border-l border-border bg-card/50 p-2 overflow-y-auto space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1">Enemies</p>
          {enemyTeam.filter(c => c).map((c, i) => (
            <CombatantCard
              key={c.charId || i}
              combatant={c}
              isActive={c.charId === battle.turnCharId}
              color="destructive"
              isTargeted={c.charId === selectedTarget}
              onSelect={() => c.charId && !c.dead && setSelectedTarget(c.charId === selectedTarget ? null : c.charId!)}
            />
          ))}
        </div>
      </div>

      {/* Bottom: Battle Log + Commands */}
      <div className="border-t border-border bg-card">
        {/* Battle Log */}
        <div className="px-4 py-2 border-b border-border/50 max-h-20 overflow-y-auto">
          <div className="flex gap-4 text-xs">
            {battle.log.slice(-4).map((entry, i) => (
              <span key={i} className="whitespace-nowrap">
                <span className={cn(
                  "font-medium",
                  entry.actor === (me?.name || '') ? "text-primary" :
                  entry.actor === 'system' ? "text-muted-foreground" : "text-destructive"
                )}>
                  {entry.actor === me?.name ? 'You' : entry.actor}
                </span>{' '}
                <span className="text-muted-foreground">{entry.text}</span>
                {entry.damage && (
                  <span className={cn("ml-1 font-medium", entry.critical ? "text-[oklch(0.75_0.15_85)]" : "text-destructive")}>
                    {entry.critical && 'CRIT! '}-{entry.damage}
                  </span>
                )}
                {entry.heal && <span className="ml-1 font-medium text-[oklch(0.55_0.15_140)]">+{entry.heal}</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Skill Submenu */}
        {selectedCommand?.type === 'skill' && selectedCommand.skills && (
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Select Skill</h4>
              <button onClick={() => setSelectedCommand(null)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {selectedCommand.skills.map(skill => {
                const canUse = skill.mpCost <= (me?.mp || 0)
                return (
                  <button
                    key={skill.id}
                    onClick={() => handleSkill(skill)}
                    disabled={!canUse || isAnimating}
                    className={cn(
                      "p-2 rounded-lg border text-left transition-all",
                      canUse ? "celtic-border hover:border-primary/40 hover:bg-primary/5" : "bg-muted/50 opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[oklch(0.60_0.25_310)]" />
                      <span className="text-xs font-medium">{skill.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="text-[oklch(0.55_0.18_260)]">{skill.mpCost} MP</span>
                      {skill.element && <span className="capitalize">{skill.element}</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Main Commands */}
        {!selectedCommand && (
          <div className="flex flex-wrap gap-2 justify-center px-4 py-3">
            {(battle.commands || []).map(command => {
              const Icon = COMMAND_ICONS[command.type] || Swords
              const isLimit = command.type === 'limit'
              const limitReady = isLimit && (me?.limitbreak || 0) >= 100

              return (
                <Button
                  key={command.id}
                  onClick={() => handleCommand(command)}
                  disabled={!battle.isMyTurn || isAnimating || (isLimit && !limitReady)}
                  variant={isLimit && limitReady ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "min-w-[90px]",
                    isLimit && limitReady && "bg-[oklch(0.55_0.25_310)] hover:bg-[oklch(0.50_0.25_310)] animate-pulse-slow",
                    command.type === 'flee' && "border-destructive/50 text-destructive hover:bg-destructive/10"
                  )}
                >
                  <Icon className="w-4 h-4 mr-1.5" />
                  {command.name}
                  {command.type === 'skill' && <ChevronRight className="w-3 h-3 ml-1" />}
                </Button>
              )
            })}

            {/* Target indicator */}
            {selectedTarget && (
              <div className="flex items-center gap-2 px-3 py-1 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                <Crosshair className="w-3.5 h-3.5" />
                Target: {grid.tokens.find(t => t.charId === selectedTarget)?.name || '?'}
                <button onClick={() => setSelectedTarget(null)} className="hover:text-destructive/70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact combatant card for the side panels
function CombatantCard({ combatant, isActive, color, isTargeted, onSelect }: {
  combatant: BattleCombatant
  isActive: boolean
  color: 'primary' | 'destructive'
  isTargeted?: boolean
  onSelect?: () => void
}) {
  const hpPct = combatant.maxHp > 0 ? (combatant.hp / combatant.maxHp) * 100 : 0
  const mpPct = combatant.maxMp > 0 ? (combatant.mp / combatant.maxMp) * 100 : 0
  const isDead = combatant.dead || combatant.hp <= 0

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
        {isDead && <Skull className="w-3 h-3 text-destructive shrink-0" />}
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
    </button>
  )
}
