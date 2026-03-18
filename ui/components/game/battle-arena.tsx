"use client"
import React from 'react'

import { useState, useCallback, useMemo } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import type { BattleCommand, Skill, BattleToken, BattleCombatant, WoundLevel, LimbZoneInfo, KOInteraction, PvpKOChoice, SignatureTech, SigTechDiscovery } from "@/lib/game-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Swords, Shield, Sparkles, FlaskRound, LogOut, Zap, Heart, Droplets,
  ChevronRight, X, Skull, Trophy, MapPin, Move, Crosshair, Crown, Clock,
  MessageCircle, Flag, Send, Smile, Handshake, Ban, Target, ShieldAlert, Eye
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
  fire:        { bg: '#3a1a0a', label: 'Fire! 8 dmg', icon: '🔥' },
}

const CELL_SIZE = 64

const WOUND_COLORS: Record<string, string> = {
  normal: 'bg-[oklch(0.55_0.20_140)]',
  light: 'bg-[oklch(0.65_0.15_85)]',
  heavy: 'bg-[oklch(0.60_0.20_40)]',
  disabled: 'bg-destructive',
}

// Team colors for multi-team (FFA) battles — up to 4 teams
const TEAM_COLORS = [
  { border: 'border-primary', bg: 'bg-primary/30', ring: 'ring-primary/40', bar: 'bg-primary', text: 'text-primary', label: 'Your Team' },
  { border: 'border-destructive', bg: 'bg-destructive/20', ring: '', bar: 'bg-destructive', text: 'text-destructive', label: 'Enemy' },
  { border: 'border-[oklch(0.60_0.20_280)]', bg: 'bg-[oklch(0.60_0.20_280)]/20', ring: '', bar: 'bg-[oklch(0.60_0.20_280)]', text: 'text-[oklch(0.60_0.20_280)]', label: 'Team 3' },
  { border: 'border-[oklch(0.65_0.15_85)]', bg: 'bg-[oklch(0.65_0.15_85)]/20', ring: '', bar: 'bg-[oklch(0.65_0.15_85)]', text: 'text-[oklch(0.65_0.15_85)]', label: 'Team 4' },
]

export function BattleArena() {
  const { state, dispatch, socket } = useGame()
  const { notify } = useNotification()

  const battle = state.battle
  const [selectedCommand, setSelectedCommand] = useState<BattleCommand | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<number | null>(null)
  const [selectedObjectKey, setSelectedObjectKey] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showMoveRange, setShowMoveRange] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [showEmotes, setShowEmotes] = useState(false)
  const [targetLimb, setTargetLimb] = useState<string | null>(null)
  const [showLimbSelector, setShowLimbSelector] = useState(false)
  const [flavorText, setFlavorText] = useState('')

  // Combo input state (Legaia-style)
  const [comboInputs, setComboInputs] = useState<string[]>([])
  const [showComboInput, setShowComboInput] = useState(false)

  // Session 11: Sig Tech Discovery modal state
  const [sigTechName, setSigTechName] = useState('')
  const [sigTechType, setSigTechType] = useState<'ki_attack' | 'physical' | 'ki_heal'>('ki_attack')
  const [sigTechElement, setSigTechElement] = useState<string | null>(null)
  const sigTechDiscovery = (state as any).sigTechDiscovery as SigTechDiscovery | null | undefined

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
  const allTeams = battle.allTeams
  const myTeamId = battle.myTeamId
  const teamCount = battle.teamCount || 2
  const teamIds = allTeams ? Object.keys(allTeams) : []
  const isMultiTeam = teamCount > 2
  const turnOrder = battle.turnOrder || []
  const me = battle.me
  const myCharId = me?.charId || state.character?.charId

  // Map teamId → color index (my team always index 0)
  const teamColorMap = useMemo(() => {
    const map: Record<string, number> = {}
    if (myTeamId) map[myTeamId] = 0
    let colorIdx = 1
    for (const tId of teamIds) {
      if (tId === myTeamId) continue
      map[tId] = colorIdx++
    }
    return map
  }, [teamIds, myTeamId])

  // Valid move tiles
  const validMoves = useMemo(() => {
    if (!showMoveRange || battle.hasMoved) return new Set<string>()
    const myToken = grid.tokens.find(t => t.charId === myCharId)
    if (!myToken) return new Set<string>()
    const range = battle.moveRange || 2
    const occupied = new Set(grid.tokens.filter(t => !t.dead).map(t => `${t.gridX},${t.gridY}`))
    // Also exclude blocking objects
    const blockedByObj = new Set((grid.objects || []).filter(o => !o.destroyed && o.blocking).map(o => `${o.x},${o.y}`))
    const moves = new Set<string>()
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        if (dx === 0 && dy === 0) continue
        const nx = myToken.gridX + dx
        const ny = myToken.gridY + dy
        if (nx < 0 || nx >= grid.width || ny < 0 || ny >= grid.height) continue
        if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue // Chebyshev
        const key = `${nx},${ny}`
        if (!occupied.has(key) && !blockedByObj.has(key)) moves.add(key)
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
      ...(selectedObjectKey != null && { targetObjectKey: selectedObjectKey }),
      ...(targetLimb != null && { targetLimb }),
      ...(flavorText.trim() && { flavorText: flavorText.trim() }),
    })
    setSelectedTarget(null)
    setSelectedObjectKey(null)
    setSelectedCommand(null)
    setShowMoveRange(false)
    setTargetLimb(null)
    setShowLimbSelector(false)
    setFlavorText('')
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

  const handleSigTech = (tech: SignatureTech) => {
    if (!socket || !battle) return
    setIsAnimating(true)
    socket.emit('battle_action', {
      battleId: battle.battleId,
      commandId: selectedCommand?.id ?? 2,
      sigTechId: tech.techId,
      ...(selectedTarget != null && { targetId: selectedTarget }),
      ...(selectedObjectKey != null && { targetObjectKey: selectedObjectKey }),
      ...(targetLimb != null && { targetLimb }),
      ...(flavorText.trim() && { flavorText: flavorText.trim() }),
    })
    setSelectedTarget(null)
    setSelectedObjectKey(null)
    setSelectedCommand(null)
    setShowMoveRange(false)
    setTargetLimb(null)
    setShowLimbSelector(false)
    setFlavorText('')
    setTimeout(() => setIsAnimating(false), 800)
  }

  const handleGridClick = (x: number, y: number) => {
    if (!battle.isMyTurn || isAnimating) return

    // Move to tile
    if (showMoveRange && validMoves.has(`${x},${y}`)) {
      socket?.emit('battle_move', { battleId: battle.battleId, x, y })
      setShowMoveRange(false)
      return
    }

    // Select target (combatant — any non-ally)
    const token = grid.tokens.find(t => t.gridX === x && t.gridY === y && !t.dead)
    const myTokenTeam = grid.tokens.find(t => t.charId === myCharId)?.teamId
    if (token && String(token.teamId) !== String(myTokenTeam ?? 'players')) {
      setSelectedTarget(token.charId)
      setSelectedObjectKey(null)
      return
    }

    // Select target (destructible object)
    const obj = (grid.objects || []).find(o => o.x === x && o.y === y && !o.destroyed)
    if (obj) {
      setSelectedObjectKey(`${x},${y}`)
      setSelectedTarget(null)
      return
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
            {/* Post-battle KO'd NPC interactions */}
            {won && (state as any).battleKoNpcs && ((state as any).battleKoNpcs as KOInteraction[]).length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Knocked-Out Foes</p>
                {((state as any).battleKoNpcs as KOInteraction[]).map(npc => (
                  <div key={npc.charId} className="flex items-center gap-2 p-2 bg-muted/20 border border-border/50 rounded-lg">
                    <span className="text-lg">{npc.icon}</span>
                    <span className="text-sm font-medium flex-1">{npc.name}</span>
                    <div className="flex gap-1">
                      {npc.actions.includes('interrogate') && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                          onClick={() => socket?.emit('battle_ko_action', { battleId: battle.battleId, charId: npc.charId, action: 'interrogate' })}>
                          <MessageCircle className="w-3 h-3 mr-0.5" />Ask
                        </Button>
                      )}
                      {npc.actions.includes('recruit') && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-[oklch(0.55_0.15_140)]/50 text-[oklch(0.55_0.15_140)]"
                          onClick={() => socket?.emit('battle_ko_action', { battleId: battle.battleId, charId: npc.charId, action: 'recruit' })}>
                          <Handshake className="w-3 h-3 mr-0.5" />Recruit
                        </Button>
                      )}
                      {npc.actions.includes('loot') && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-[oklch(0.65_0.15_85)]/50 text-[oklch(0.65_0.15_85)]"
                          onClick={() => socket?.emit('battle_ko_action', { battleId: battle.battleId, charId: npc.charId, action: 'loot' })}>
                          <FlaskRound className="w-3 h-3 mr-0.5" />Loot
                        </Button>
                      )}
                      {npc.actions.includes('release') && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                          onClick={() => socket?.emit('battle_ko_action', { battleId: battle.battleId, charId: npc.charId, action: 'release' })}>
                          Release
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={returnToMap} className="w-full">Continue</Button>
          </CardContent>
        </Card>

        {/* PvP KO Choice overlay */}
        {(state as any).pvpKoChoice && (() => {
          const choice = (state as any).pvpKoChoice as PvpKOChoice
          return (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldAlert className="w-8 h-8 text-[oklch(0.65_0.15_85)]" />
                  <div>
                    <h3 className="font-bold text-lg">Fallen Foes</h3>
                    <p className="text-xs text-muted-foreground">Choose the fate of your opponents</p>
                  </div>
                </div>
                <div className="space-y-3 mb-4">
                  {choice.koPvpPlayers.map(p => (
                    <div key={p.charId} className="flex items-center gap-3 p-3 bg-muted/20 border border-border/50 rounded-lg">
                      <span className="text-sm font-medium flex-1">{p.name}</span>
                      <Button
                        size="sm"
                        className="bg-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.50_0.15_140)]"
                        onClick={() => socket?.emit('battle_pvp_ko_choice', { battleId: choice.battleId, charId: p.charId, choice: 'spare' })}
                      >
                        Spare
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => socket?.emit('battle_pvp_ko_choice', { battleId: choice.battleId, charId: p.charId, choice: 'finish' })}
                      >
                        Finish
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="text-[10px] text-muted-foreground space-y-0.5">
                  <p className="text-[oklch(0.55_0.15_140)]">Sparing grants +{choice.repBonusSpare} reputation</p>
                  <p className="text-destructive">Finishing costs {choice.repPenaltyFinish} reputation</p>
                </div>
              </div>
            </div>
          )
        })()}
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
        {/* Session 17: Weather display */}
        {battle.weather && battle.weather.name !== 'clear' && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-muted/30 text-[10px] text-muted-foreground">
            <span>{battle.weather.icon}</span>
            <span>{battle.weather.label}</span>
          </div>
        )}
        {/* Session 16: Win condition display */}
        {battle.winCondition && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[oklch(0.55_0.15_140)]/10 text-[10px] text-[oklch(0.55_0.15_140)]">
            <span>{battle.winCondition.icon}</span>
            <span>{battle.winCondition.description}</span>
          </div>
        )}
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
        {/* Left: Your Team */}
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
                const gridObj = (grid.objects || []).find(o => o.x === x && o.y === y && !o.destroyed)
                const isMyToken = token && token.charId === myCharId
                const tokenTeamId = token ? String(token.teamId) : ''
                const isAlly = token && (tokenTeamId === myTeamId || (!myTeamId && tokenTeamId === 'players') || tokenTeamId === '1')
                const isEnemy = token && !isAlly
                const isTargeted = token && token.charId === selectedTarget
                const isObjTargeted = gridObj && selectedObjectKey === key

                return (
                  <div
                    key={key}
                    className={cn(
                      "relative border border-border/20 flex items-center justify-center cursor-pointer transition-all",
                      isValidMove && "ring-2 ring-inset ring-primary/60",
                      isTargeted && "ring-2 ring-inset ring-destructive",
                      isObjTargeted && "ring-2 ring-inset ring-[oklch(0.65_0.15_85)]",
                    )}
                    style={{ backgroundColor: style.bg }}
                    onClick={() => handleGridClick(x, y)}
                    title={gridObj ? `${gridObj.label} (${gridObj.hp}/${gridObj.maxHp} HP)` : `(${x},${y}) ${style.label}`}
                  >
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
                          token.charId === battle.turnCharId && "animate-pulse-slow",
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
                      </div>
                    )}
                  </div>
                )
              })
            )}

            {/* Emote overlay */}
            {state.battleEmote && (
              <div
                className="absolute z-30 flex items-center justify-center pointer-events-none animate-bounce"
                style={{
                  left: state.battleEmote.gridX * CELL_SIZE + CELL_SIZE / 2 - 16,
                  top: state.battleEmote.gridY * CELL_SIZE - 20,
                  width: 32, height: 32,
                }}
              >
                <span className="text-2xl drop-shadow-lg">{state.battleEmote.icon}</span>
              </div>
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

        {/* Right: Enemy Team(s) */}
        <div className="w-48 border-l border-border bg-card/50 p-2 overflow-y-auto space-y-2">
          {isMultiTeam && allTeams ? (
            // Multi-team: show each opposing team with color-coded headers
            <>
              {teamIds.filter(t => t !== myTeamId).map((teamId, idx) => {
                const members = allTeams[teamId] || []
                const colorIdx = teamColorMap[teamId] ?? (idx + 1)
                const teamColor = TEAM_COLORS[colorIdx % TEAM_COLORS.length]
                return (
                  <div key={teamId}>
                    <p className={cn("text-[10px] uppercase tracking-wider px-1 mb-1", teamColor.text)}>
                      {teamColor.label} ({teamId})
                    </p>
                    {members.filter(c => c).map((c, i) => (
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
                )
              })}
            </>
          ) : (
            // Standard 2-team: single enemy list
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Bottom: Battle Log + Chat + Commands */}
      <div className="border-t border-border bg-card">
        {/* Battle Log (left) + Chat (right) */}
        <div className="flex border-b border-border/50">
          {/* Battle Log */}
          <div className="flex-1 px-3 py-2 max-h-24 overflow-y-auto border-r border-border/30">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">Battle Log</p>
            <div className="space-y-0.5 text-xs">
              {battle.log.slice(-6).map((entry, i) => (
                <div key={i}>
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
                </div>
              ))}
            </div>
          </div>

          {/* Battle Chat */}
          <div className="w-64 px-3 py-2 max-h-24 flex flex-col">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground/50 mb-1">
              <MessageCircle className="w-2.5 h-2.5 inline mr-0.5" />Chat
            </p>
            <div className="flex-1 overflow-y-auto space-y-0.5 text-xs mb-1">
              {state.battleChat.length === 0 && (
                <span className="text-muted-foreground/40 text-[10px]">No messages yet...</span>
              )}
              {state.battleChat.slice(-8).map((msg, i) => (
                <div key={i}>
                  <span className={cn("font-medium",
                    msg.fromCharId === myCharId ? "text-primary" : "text-[oklch(0.65_0.15_85)]"
                  )}>{msg.from}:</span>{' '}
                  <span className="text-foreground/80">{msg.text}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && chatInput.trim() && socket && battle) {
                    socket.emit('battle_chat', { battleId: battle.battleId, text: chatInput.trim() })
                    setChatInput('')
                  }
                }}
                placeholder="Say something..."
                className="flex-1 h-6 px-2 text-[10px] bg-input border border-border rounded"
              />
              <button
                onClick={() => {
                  if (chatInput.trim() && socket && battle) {
                    socket.emit('battle_chat', { battleId: battle.battleId, text: chatInput.trim() })
                    setChatInput('')
                  }
                }}
                className="h-6 w-6 flex items-center justify-center rounded bg-primary/20 hover:bg-primary/30 text-primary"
              >
                <Send className="w-3 h-3" />
              </button>
            </div>
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

              {/* Session 11: Signature Techs in skill submenu */}
              {selectedCommand.signatureTechs && selectedCommand.signatureTechs.length > 0 && selectedCommand.signatureTechs.map(tech => {
                const xpForNext = tech.level * 10
                const xpPct = xpForNext > 0 ? Math.min(100, (tech.xp / xpForNext) * 100) : 0
                return (
                  <button
                    key={`sig-${tech.techId}`}
                    onClick={() => handleSigTech(tech)}
                    disabled={isAnimating}
                    className="p-2 rounded-lg border border-[oklch(0.60_0.22_50)]/60 text-left transition-all hover:border-[oklch(0.60_0.22_50)] hover:bg-[oklch(0.60_0.22_50)]/10 relative"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm">{tech.icon || '\u26A1'}</span>
                      <span className="text-xs font-medium text-[oklch(0.60_0.22_50)]">{tech.name}</span>
                      <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-[oklch(0.60_0.22_50)]/20 text-[oklch(0.60_0.22_50)]">
                        Lv.{tech.level}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="capitalize text-[oklch(0.60_0.22_50)]/80">{tech.techType.replace('_', ' ')}</span>
                      {tech.element && <span className="capitalize">{tech.element}</span>}
                    </div>
                    {/* XP progress bar */}
                    <div className="mt-1 w-full h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-[oklch(0.60_0.22_50)] rounded-full transition-all" style={{ width: `${xpPct}%` }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Combo Input System (Legaia-style) */}
        {battle.settings?.enableComboInput && battle.isMyTurn && !selectedCommand && (
          <div className="px-4 pt-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">Combo Input</span>
              <span className="text-[10px] text-muted-foreground">
                AP: {me?.currentAp ?? 0}/{me?.maxAp ?? 6}
              </span>
              {comboInputs.length > 0 && (
                <span className="text-xs text-primary">{comboInputs.map(i => ({H:'⬆️',L:'⬇️',R:'➡️',U:'⬆️'}[i] || i)).join(' ')}</span>
              )}
            </div>
            <div className="flex gap-1 items-center">
              {['H','L','R'].map(dir => (
                <Button key={dir} variant="outline" size="sm"
                  className="w-10 h-10 text-lg p-0"
                  disabled={comboInputs.length >= (me?.maxAp ?? 6)}
                  onClick={() => setComboInputs(prev => [...prev, dir])}
                >
                  {{H:'⬆️',L:'⬇️',R:'➡️'}[dir]}
                </Button>
              ))}
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => setComboInputs(prev => prev.slice(0, -1))}
                disabled={comboInputs.length === 0}
              >
                Undo
              </Button>
              <Button size="sm" className="text-xs bg-primary"
                disabled={comboInputs.length === 0 || isAnimating}
                onClick={() => {
                  if (socket && battle) {
                    socket.emit('battle_action', {
                      battleId: battle.battleId, comboInput: comboInputs.join(','),
                      ...(selectedTarget != null && { targetId: selectedTarget }),
                      ...(targetLimb != null && { targetLimb }),
                    })
                    setComboInputs([])
                    setIsAnimating(true)
                    setTimeout(() => setIsAnimating(false), 800)
                  }
                }}
              >
                Execute! ({comboInputs.length} hits)
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
                onClick={() => setComboInputs([])}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Session 9/12: RP Description Input (works on any action) */}
        {(battle.settings?.enableFlavorText || battle.settings?.enableRpDescriptions) && battle.isMyTurn && !selectedCommand && (
          <div className="px-4 pt-2 flex gap-2 items-center">
            <input
              value={flavorText}
              onChange={e => setFlavorText(e.target.value)}
              placeholder="Describe your action for an RP bonus... (optional)"
              className="flex-1 h-7 px-2 text-xs bg-input border border-border rounded italic"
              maxLength={200}
            />
            {flavorText.length >= 50 ? (
              <span className="text-[10px] text-[oklch(0.55_0.18_140)] whitespace-nowrap font-medium">
                🎭 +7-12%
              </span>
            ) : flavorText.length >= 20 ? (
              <span className="text-[10px] text-[oklch(0.60_0.18_180)] whitespace-nowrap">
                🎭 +5%
              </span>
            ) : null}
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

            {/* Session 10: Channel Ki button */}
            {battle.settings?.enableKiChanneling && battle.isMyTurn && !me?.kiChanneled && (
              <Button
                variant="outline"
                size="sm"
                className="border-[oklch(0.65_0.20_60)]/50 text-[oklch(0.65_0.20_60)] hover:bg-[oklch(0.65_0.20_60)]/10"
                onClick={() => {
                  if (socket && battle && confirm('Channel Ki? Full power for 5 turns, then crash to half.')) {
                    socket.emit('battle_action', { battleId: battle.battleId, commandId: 13 })
                  }
                }}
              >
                🔥 Channel Ki
              </Button>
            )}

            {/* Session 12: RP Commands — Taunt, Intimidate, Rally */}
            {battle.settings?.enableRpCommands && battle.isMyTurn && (
              <>
                <Button variant="outline" size="sm"
                  className="border-[oklch(0.60_0.18_25)]/50 text-[oklch(0.60_0.18_25)] hover:bg-[oklch(0.60_0.18_25)]/10"
                  onClick={() => {
                    if (socket && battle) socket.emit('battle_action', {
                      battleId: battle.battleId, commandId: 14,
                      ...(flavorText.trim() && { flavorText: flavorText.trim() }),
                    })
                    setFlavorText('')
                  }}
                >
                  😤 Taunt
                </Button>
                {selectedTarget && (
                  <Button variant="outline" size="sm"
                    className="border-[oklch(0.55_0.15_280)]/50 text-[oklch(0.55_0.15_280)] hover:bg-[oklch(0.55_0.15_280)]/10"
                    onClick={() => {
                      if (socket && battle) socket.emit('battle_action', {
                        battleId: battle.battleId, commandId: 15,
                        targetId: selectedTarget,
                        ...(flavorText.trim() && { flavorText: flavorText.trim() }),
                      })
                      setFlavorText('')
                    }}
                  >
                    👁️ Intimidate
                  </Button>
                )}
                {playerTeam.length > 1 && (
                  <Button variant="outline" size="sm"
                    className="border-[oklch(0.55_0.15_140)]/50 text-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.55_0.15_140)]/10"
                    onClick={() => {
                      if (socket && battle) socket.emit('battle_action', {
                        battleId: battle.battleId, commandId: 16,
                        ...(flavorText.trim() && { flavorText: flavorText.trim() }),
                      })
                      setFlavorText('')
                    }}
                  >
                    📣 Rally
                  </Button>
                )}
              </>
            )}

            {/* Negotiate — requires a selected target */}
            {battle.isMyTurn && selectedTarget && (
              <Button
                variant="outline"
                size="sm"
                className="border-[oklch(0.60_0.18_180)]/50 text-[oklch(0.60_0.18_180)] hover:bg-[oklch(0.60_0.18_180)]/10"
                onClick={() => {
                  if (socket && battle) {
                    socket.emit('battle_negotiate', { battleId: battle.battleId, targetCharId: selectedTarget })
                  }
                }}
              >
                <Handshake className="w-4 h-4 mr-1.5" />
                Negotiate
              </Button>
            )}

            {/* Surrender */}
            {battle.isMyTurn && (
              <Button
                variant="outline"
                size="sm"
                className="border-[oklch(0.65_0.15_85)]/50 text-[oklch(0.65_0.15_85)] hover:bg-[oklch(0.65_0.15_85)]/10"
                onClick={() => {
                  if (socket && battle && confirm('Are you sure you want to surrender? Your team loses.')) {
                    socket.emit('battle_surrender', { battleId: battle.battleId })
                  }
                }}
              >
                <Flag className="w-4 h-4 mr-1.5" />
                Surrender
              </Button>
            )}

            {/* Emotes */}
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setShowEmotes(!showEmotes)}>
                <Smile className="w-4 h-4 mr-1" />
                Emote
              </Button>
              {showEmotes && (
                <div className="absolute bottom-full mb-1 left-0 flex gap-1 p-1.5 bg-card border border-border rounded-lg shadow-lg z-30">
                  {[
                    { emote: 'taunt', icon: '😤' },
                    { emote: 'respect', icon: '🫡' },
                    { emote: 'laugh', icon: '😂' },
                    { emote: 'rage', icon: '🔥' },
                    { emote: 'wave', icon: '👋' },
                  ].map(e => (
                    <button key={e.emote} onClick={() => {
                      socket?.emit('battle_emote', { battleId: battle.battleId, emote: e.emote })
                      setShowEmotes(false)
                    }}
                      className="w-8 h-8 flex items-center justify-center rounded hover:bg-muted text-lg"
                      title={e.emote}
                    >{e.icon}</button>
                  ))}
                </div>
              )}
            </div>

            {/* Non-lethal toggle */}
            {battle.settings?.enableNonlethal && battle.isMyTurn && (
              <Button
                variant={me?.nonLethal ? "default" : "outline"}
                size="sm"
                className={cn(
                  "min-w-[90px]",
                  me?.nonLethal
                    ? "bg-[oklch(0.50_0.18_280)] hover:bg-[oklch(0.45_0.18_280)]"
                    : "border-[oklch(0.50_0.18_280)]/50 text-[oklch(0.50_0.18_280)] hover:bg-[oklch(0.50_0.18_280)]/10"
                )}
                onClick={() => {
                  if (socket && battle) {
                    socket.emit('battle_toggle_nonlethal', { battleId: battle.battleId })
                  }
                }}
              >
                <Ban className="w-4 h-4 mr-1.5" />
                {me?.nonLethal ? 'Non-Lethal' : 'Lethal'}
              </Button>
            )}

            {/* Active defense stance selector */}
            {battle.settings?.enableActiveDefense && battle.isMyTurn && (
              <div className="flex items-center gap-1 px-2 py-1 bg-card/50 border border-border/50 rounded-lg">
                <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                {([
                  { key: 'dodge', icon: '\u{1F4A8}', label: 'Dodge' },
                  { key: 'block', icon: '\u{1F6E1}\uFE0F', label: 'Block' },
                  { key: 'counter', icon: '\u21A9\uFE0F', label: 'Counter' },
                  { key: 'none', icon: '\u2014', label: 'None' },
                ] as const).map(opt => (
                  <button
                    key={opt.key}
                    title={opt.label}
                    className={cn(
                      "px-2 py-0.5 rounded text-xs transition-all",
                      me?.defaultDefense === opt.key
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-muted-foreground"
                    )}
                    onClick={() => {
                      if (socket && battle) {
                        socket.emit('battle_set_defense', { battleId: battle.battleId, defense: opt.key })
                      }
                    }}
                  >
                    {opt.icon}
                  </button>
                ))}
              </div>
            )}

            {/* Limb targeting selector */}
            {battle.settings?.enableLimbTargeting && selectedTarget && battle.isMyTurn && (() => {
              const targetCombatant = [...(playerTeam || []), ...(enemyTeam || [])].find(c => c.charId === selectedTarget)
              const zones = targetCombatant?.limbZones
              if (!zones || zones.length === 0) return null
              return (
                <div className="relative">
                  <Button
                    variant={targetLimb ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      targetLimb
                        ? "bg-[oklch(0.55_0.20_40)] hover:bg-[oklch(0.50_0.20_40)]"
                        : "border-[oklch(0.55_0.20_40)]/50 text-[oklch(0.55_0.20_40)]"
                    )}
                    onClick={() => setShowLimbSelector(!showLimbSelector)}
                  >
                    <Target className="w-4 h-4 mr-1" />
                    {targetLimb ? zones.find(z => z.key === targetLimb)?.label || targetLimb : 'Aim'}
                  </Button>
                  {showLimbSelector && (
                    <div className="absolute bottom-full mb-1 left-0 p-2 bg-card border border-border rounded-lg shadow-lg z-30 min-w-[160px] space-y-1">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                        <Eye className="w-2.5 h-2.5 inline mr-0.5" />Target Limb
                      </p>
                      {[...zones].sort((a, b) => a.sortOrder - b.sortOrder).map(zone => {
                        const woundLevel = targetCombatant?.woundLevels?.[zone.key] || 'normal'
                        const limbHp = targetCombatant?.limbHp?.[zone.key]
                        const hpPct = limbHp ? (limbHp.current / limbHp.max) * 100 : 100
                        return (
                          <button
                            key={zone.key}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1 rounded text-xs transition-all text-left",
                              targetLimb === zone.key
                                ? "bg-[oklch(0.55_0.20_40)]/20 text-[oklch(0.55_0.20_40)]"
                                : "hover:bg-muted text-foreground/80"
                            )}
                            onClick={() => {
                              setTargetLimb(zone.key)
                              setShowLimbSelector(false)
                              if (socket && battle) {
                                socket.emit('battle_limb_target', { battleId: battle.battleId, limb: zone.key })
                              }
                            }}
                          >
                            <span>{zone.icon}</span>
                            <span className="flex-1">{zone.label}</span>
                            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", WOUND_COLORS[woundLevel] || WOUND_COLORS.normal)}
                                style={{ width: `${hpPct}%` }}
                              />
                            </div>
                          </button>
                        )
                      })}
                      {targetLimb && (
                        <button
                          className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground py-0.5"
                          onClick={() => { setTargetLimb(null); setShowLimbSelector(false) }}
                        >
                          Clear target
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

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
            {/* Object target indicator */}
            {selectedObjectKey && (() => {
              const obj = (grid.objects || []).find(o => `${o.x},${o.y}` === selectedObjectKey)
              return obj ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-[oklch(0.65_0.15_85)]/10 border border-[oklch(0.65_0.15_85)]/30 rounded text-xs text-[oklch(0.65_0.15_85)]">
                  <Crosshair className="w-3.5 h-3.5" />
                  Target: {obj.icon} {obj.label} ({obj.hp}/{obj.maxHp} HP)
                  <button onClick={() => setSelectedObjectKey(null)} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : null
            })()}
          </div>
        )}
      </div>

      {/* Negotiation Dialogue Overlay */}
      {state.negotiateResult && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Handshake className={cn("w-8 h-8", state.negotiateResult.success ? "text-[oklch(0.55_0.15_140)]" : "text-destructive")} />
              <div>
                <h3 className="font-bold text-lg">
                  {state.negotiateResult.pending ? 'Alliance Proposed' :
                   state.negotiateResult.success ? 'Negotiation Successful!' : 'Negotiation Failed'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {state.negotiateResult.targetName}
                  {state.negotiateResult.willingness != null && ` — ${state.negotiateResult.willingness}% willingness`}
                </p>
              </div>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg mb-4 text-sm italic leading-relaxed">
              &ldquo;{state.negotiateResult.dialogue}&rdquo;
            </div>
            {state.negotiateResult.success && (
              <p className="text-sm text-[oklch(0.55_0.15_140)] mb-4">
                {state.negotiateResult.targetName} has joined your team!
              </p>
            )}
            <Button onClick={() => dispatch({ type: 'SET_NEGOTIATE_RESULT', payload: null })} className="w-full">
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Incoming Alliance Request (from another player) */}
      {state.negotiateRequest && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Handshake className="w-8 h-8 text-[oklch(0.60_0.18_180)]" />
              <div>
                <h3 className="font-bold text-lg">Alliance Proposal</h3>
                <p className="text-xs text-muted-foreground">From {state.negotiateRequest.fromName}</p>
              </div>
            </div>
            <p className="text-sm mb-6">
              <span className="font-medium">{state.negotiateRequest.fromName}</span> wants you to join their team.
              Accept to fight alongside them, or decline to remain enemies.
            </p>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-[oklch(0.55_0.15_140)] hover:bg-[oklch(0.50_0.15_140)]"
                onClick={() => {
                  socket?.emit('negotiate_respond', {
                    battleId: state.negotiateRequest!.battleId,
                    fromCharId: state.negotiateRequest!.fromCharId,
                    accept: true
                  })
                  dispatch({ type: 'SET_NEGOTIATE_REQUEST', payload: null })
                }}
              >
                <Handshake className="w-4 h-4 mr-2" /> Accept Alliance
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-destructive/50 text-destructive"
                onClick={() => {
                  socket?.emit('negotiate_respond', {
                    battleId: state.negotiateRequest!.battleId,
                    fromCharId: state.negotiateRequest!.fromCharId,
                    accept: false
                  })
                  dispatch({ type: 'SET_NEGOTIATE_REQUEST', payload: null })
                }}
              >
                <X className="w-4 h-4 mr-2" /> Decline
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Session 11: Signature Technique Discovery Modal */}
      {sigTechDiscovery && (
        <div className="absolute inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            className="celtic-border bg-gradient-to-b from-card via-card to-[oklch(0.15_0.05_50)] border-2 border-[oklch(0.60_0.22_50)]/60 rounded-xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden"
            style={{ boxShadow: '0 0 40px oklch(0.60 0.22 50 / 0.25), 0 0 80px oklch(0.60 0.22 50 / 0.10)' }}
          >
            {/* Animated border glow */}
            <div className="absolute inset-0 rounded-xl pointer-events-none" style={{
              background: 'linear-gradient(45deg, transparent 40%, oklch(0.60 0.22 50 / 0.08) 50%, transparent 60%)',
              backgroundSize: '200% 200%',
              animation: 'shimmer 3s ease-in-out infinite',
            }} />

            <div className="relative z-10">
              <h3 className="text-xl font-bold text-center mb-1 text-[oklch(0.75_0.18_50)]">
                A Technique Takes Shape...
              </h3>
              <p className="text-xs text-center text-muted-foreground mb-4">
                Your fighting patterns have coalesced into something unique.
              </p>

              {/* Dominant keywords as glowing tags */}
              <div className="flex flex-wrap gap-2 justify-center mb-5">
                {sigTechDiscovery.dominantKeywords.map(kw => (
                  <span
                    key={kw.keyword}
                    className="px-2.5 py-1 rounded-full text-xs font-medium border border-[oklch(0.60_0.22_50)]/40 text-[oklch(0.75_0.18_50)] bg-[oklch(0.60_0.22_50)]/10"
                    style={{ textShadow: '0 0 8px oklch(0.60 0.22 50 / 0.5)' }}
                  >
                    {kw.keyword} x{kw.count}
                  </span>
                ))}
              </div>

              {/* Technique name input */}
              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Technique Name</label>
                  <input
                    value={sigTechName || sigTechDiscovery.suggestedName}
                    onChange={e => setSigTechName(e.target.value)}
                    placeholder={sigTechDiscovery.suggestedName}
                    className="w-full h-9 px-3 text-sm bg-input border border-[oklch(0.60_0.22_50)]/30 rounded-lg text-[oklch(0.75_0.18_50)] font-medium focus:border-[oklch(0.60_0.22_50)] focus:outline-none"
                    maxLength={60}
                  />
                </div>

                {/* Type selector */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <div className="flex gap-2">
                    {(['ki_attack', 'physical', 'ki_heal'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setSigTechType(t)}
                        className={cn(
                          "flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                          (sigTechType || sigTechDiscovery.suggestedType) === t
                            ? "border-[oklch(0.60_0.22_50)] bg-[oklch(0.60_0.22_50)]/20 text-[oklch(0.75_0.18_50)]"
                            : "border-border text-muted-foreground hover:border-[oklch(0.60_0.22_50)]/40"
                        )}
                      >
                        {t === 'ki_attack' ? 'Ki Attack' : t === 'physical' ? 'Physical' : 'Ki Heal'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Element selector */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Element (optional)</label>
                  <div className="flex gap-2 flex-wrap">
                    {[null, 'fire', 'ice', 'lightning', 'shadow', 'holy', 'poison'].map(el => (
                      <button
                        key={el ?? 'none'}
                        onClick={() => setSigTechElement(el)}
                        className={cn(
                          "px-2.5 py-1 rounded text-xs border transition-all",
                          (sigTechElement === undefined ? sigTechDiscovery.suggestedElement : sigTechElement) === el
                            ? "border-[oklch(0.60_0.22_50)] bg-[oklch(0.60_0.22_50)]/20 text-[oklch(0.75_0.18_50)]"
                            : "border-border text-muted-foreground hover:border-[oklch(0.60_0.22_50)]/40"
                        )}
                      >
                        {el ? el.charAt(0).toUpperCase() + el.slice(1) : 'None'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-[oklch(0.55_0.22_50)] hover:bg-[oklch(0.50_0.22_50)] text-white font-bold"
                  onClick={() => {
                    if (socket) {
                      const name = sigTechName || sigTechDiscovery.suggestedName
                      const type = sigTechType || sigTechDiscovery.suggestedType
                      const element = sigTechElement === undefined ? sigTechDiscovery.suggestedElement : sigTechElement
                      socket.emit('sig_tech_create', {
                        name,
                        techType: type,
                        element: element || null,
                        originKeywords: sigTechDiscovery.originKeywords,
                      })
                      dispatch({ type: 'SET_SIG_TECH_DISCOVERY', payload: null })
                      setSigTechName('')
                      setSigTechType('ki_attack')
                      setSigTechElement(null)
                      notify('success', `Forged technique: ${name}!`)
                    }
                  }}
                >
                  Forge Technique
                </Button>
                <Button
                  variant="outline"
                  className="border-muted-foreground/30 text-muted-foreground"
                  onClick={() => {
                    dispatch({ type: 'SET_SIG_TECH_DISCOVERY', payload: null })
                    setSigTechName('')
                    setSigTechType('ki_attack')
                    setSigTechElement(null)
                  }}
                >
                  Not Yet
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
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
