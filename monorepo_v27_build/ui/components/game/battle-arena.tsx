"use client"

import { useState, useEffect, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import type { BattleState, BattleCommand, Skill } from "@/lib/game-types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  Swords, 
  Shield, 
  Sparkles, 
  FlaskRound, 
  LogOut,
  Zap,
  Heart,
  Droplets,
  ChevronRight,
  X,
  Skull,
  Trophy
} from "lucide-react"

// Mock battle data
const MOCK_BATTLE: BattleState = {
  battleId: 1,
  turn: 3,
  isMyTurn: true,
  status: 'ACTIVE',
  me: {
    name: 'Cormac the Wanderer',
    hp: 245,
    maxHp: 320,
    mp: 45,
    maxMp: 80,
    statuses: [],
    limitbreak: 72,
    breaklevel: 2
  },
  opponent: {
    name: 'Forest Wraith',
    hp: 180,
    maxHp: 250,
    mp: 60,
    maxMp: 60,
    statuses: [{ id: 1, name: 'Poison', icon: 'skull', turnsRemaining: 2, description: 'Taking damage over time' }]
  },
  commands: [
    { id: 1, name: 'Attack', icon: 'swords', type: 'attack' },
    { id: 2, name: 'Skills', icon: 'sparkles', type: 'skill', skills: [
      { id: 1, name: 'Fire Slash', description: 'A blazing sword strike', icon: 'flame', mpCost: 12, targetType: 'enemy', element: 'fire' },
      { id: 2, name: 'Thunder Wave', description: 'Lightning crashes down', icon: 'zap', mpCost: 18, targetType: 'all_enemies', element: 'lightning' },
      { id: 3, name: 'Heal', description: 'Restore HP', icon: 'heart', mpCost: 10, targetType: 'self' }
    ]},
    { id: 3, name: 'Items', icon: 'flask', type: 'item' },
    { id: 4, name: 'Defend', icon: 'shield', type: 'defend' },
    { id: 5, name: 'Flee', icon: 'logout', type: 'flee' }
  ],
  log: [
    { turn: 1, actor: 'Cormac', text: 'used Attack!', damage: 45 },
    { turn: 1, actor: 'Forest Wraith', text: 'claws at you!', damage: 28 },
    { turn: 2, actor: 'Cormac', text: 'cast Fire Slash!', damage: 67, critical: true },
    { turn: 2, actor: 'Forest Wraith', text: 'takes poison damage.', damage: 15 },
    { turn: 3, actor: 'system', text: 'Your turn!' }
  ]
}

const COMMAND_ICONS: Record<string, React.ElementType> = {
  attack: Swords,
  skill: Sparkles,
  item: FlaskRound,
  defend: Shield,
  flee: LogOut,
  limit: Zap
}

export function BattleArena() {
  const { state, dispatch } = useGame()
  const { notify } = useNotification()
  
  // Use mock battle for demo, or real battle from state
  const [battle, setBattle] = useState<BattleState>(MOCK_BATTLE)
  const [selectedCommand, setSelectedCommand] = useState<BattleCommand | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [damagePopup, setDamagePopup] = useState<{ value: number; critical?: boolean } | null>(null)
  
  const me = battle.me
  const opponent = battle.opponent
  
  const handleCommand = useCallback((command: BattleCommand) => {
    if (!battle.isMyTurn || isAnimating) return
    
    if (command.type === 'skill' && command.skills) {
      setSelectedCommand(command)
      return
    }
    
    // Execute action
    executeAction(command.type, command.id)
  }, [battle.isMyTurn, isAnimating])
  
  const handleSkill = useCallback((skill: Skill) => {
    if (skill.mpCost > me.mp) {
      notify('error', 'Not enough MP!')
      return
    }
    
    executeAction('skill', skill.id)
    setSelectedCommand(null)
  }, [me.mp])
  
  const executeAction = (type: string, id: number) => {
    setIsAnimating(true)
    
    // Simulate attack
    setTimeout(() => {
      const damage = Math.floor(Math.random() * 40) + 30
      const isCritical = Math.random() < 0.15
      const actualDamage = isCritical ? Math.floor(damage * 1.5) : damage
      
      setDamagePopup({ value: actualDamage, critical: isCritical })
      
      // Update opponent HP
      setBattle(prev => ({
        ...prev,
        opponent: {
          ...prev.opponent,
          hp: Math.max(0, prev.opponent.hp - actualDamage)
        },
        log: [
          ...prev.log,
          { 
            turn: prev.turn, 
            actor: prev.me.name, 
            text: type === 'skill' ? 'cast a spell!' : 'attacked!',
            damage: actualDamage,
            critical: isCritical
          }
        ]
      }))
      
      setTimeout(() => {
        setDamagePopup(null)
        setIsAnimating(false)
        
        // Check if opponent defeated
        if (battle.opponent.hp - actualDamage <= 0) {
          setBattle(prev => ({ ...prev, status: 'VICTORY' }))
          return
        }
        
        // Enemy turn
        setTimeout(() => {
          enemyTurn()
        }, 500)
      }, 800)
    }, 300)
  }
  
  const enemyTurn = () => {
    setIsAnimating(true)
    
    setTimeout(() => {
      const damage = Math.floor(Math.random() * 25) + 15
      
      setBattle(prev => ({
        ...prev,
        me: {
          ...prev.me,
          hp: Math.max(0, prev.me.hp - damage),
          limitbreak: Math.min(100, (prev.me.limitbreak || 0) + 8)
        },
        turn: prev.turn + 1,
        isMyTurn: true,
        log: [
          ...prev.log,
          { turn: prev.turn, actor: prev.opponent.name, text: 'attacks!', damage }
        ]
      }))
      
      setTimeout(() => {
        setIsAnimating(false)
        
        // Check if player defeated
        if (battle.me.hp - damage <= 0) {
          setBattle(prev => ({ ...prev, status: 'DEFEAT' }))
        }
      }, 500)
    }, 800)
  }
  
  const startNewBattle = () => {
    setBattle({
      ...MOCK_BATTLE,
      me: { ...MOCK_BATTLE.me },
      opponent: { ...MOCK_BATTLE.opponent },
      log: [{ turn: 1, actor: 'system', text: 'Battle begins!' }]
    })
  }
  
  // Battle End Screen
  if (battle.status === 'VICTORY' || battle.status === 'DEFEAT') {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="celtic-border max-w-md w-full">
          <CardContent className="p-8 text-center">
            {battle.status === 'VICTORY' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-[oklch(0.55_0.15_140)]/20 flex items-center justify-center mx-auto mb-4">
                  <Trophy className="w-10 h-10 text-[oklch(0.55_0.15_140)]" />
                </div>
                <h2 className="text-2xl font-bold text-[oklch(0.55_0.15_140)] mb-2">Victory!</h2>
                <p className="text-muted-foreground mb-6">
                  You defeated the {opponent.name}!
                </p>
                <div className="space-y-2 mb-6 text-left bg-card/50 rounded-lg p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Experience</span>
                    <span className="text-[oklch(0.65_0.18_85)]">+150 XP</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gold</span>
                    <span className="text-[oklch(0.75_0.15_85)]">+45g</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                  <Skull className="w-10 h-10 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold text-destructive mb-2">Defeat</h2>
                <p className="text-muted-foreground mb-6">
                  You have fallen in battle...
                </p>
              </>
            )}
            <Button onClick={startNewBattle} className="w-full">
              Continue
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Battle Area */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-card via-background to-card">
        {/* Turn Indicator */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className={cn(
            "px-4 py-2 rounded-full text-sm font-medium transition-all",
            battle.isMyTurn 
              ? "bg-primary/20 text-primary border border-primary/40" 
              : "bg-destructive/20 text-destructive border border-destructive/40"
          )}>
            {battle.isMyTurn ? 'Your Turn' : 'Enemy Turn'}
          </div>
        </div>
        
        {/* Opponent */}
        <div className="absolute top-8 right-8 w-72">
          <Card className="celtic-border bg-gradient-to-br from-destructive/10 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "w-12 h-12 rounded-lg bg-destructive/20 border border-destructive/40 flex items-center justify-center",
                  isAnimating && !battle.isMyTurn && "animate-shake"
                )}>
                  <Skull className="w-6 h-6 text-destructive" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{opponent.name}</h3>
                  <div className="flex gap-1 mt-1">
                    {opponent.statuses.map(status => (
                      <span 
                        key={status.id}
                        className="text-[10px] px-1.5 py-0.5 bg-destructive/20 text-destructive rounded"
                        title={status.description}
                      >
                        {status.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* HP Bar */}
              <div className="relative">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Heart className="w-3 h-3" /> HP
                  </span>
                  <span className="tabular-nums">{opponent.hp}/{opponent.maxHp}</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[oklch(0.45_0.18_25)] to-[oklch(0.55_0.22_25)] transition-all duration-300"
                    style={{ width: `${(opponent.hp / opponent.maxHp) * 100}%` }}
                  />
                </div>
                
                {/* Damage Popup */}
                {damagePopup && (
                  <div className={cn(
                    "absolute -top-8 left-1/2 -translate-x-1/2 font-bold animate-float",
                    damagePopup.critical ? "text-2xl text-[oklch(0.75_0.15_85)]" : "text-xl text-destructive"
                  )}>
                    {damagePopup.critical && 'CRIT! '}
                    -{damagePopup.value}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Player */}
        <div className="absolute bottom-32 left-8 w-72">
          <Card className="celtic-border bg-gradient-to-br from-primary/10 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  "w-12 h-12 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-bold text-primary",
                  isAnimating && battle.isMyTurn && "animate-shake"
                )}>
                  12
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{me.name}</h3>
                  <p className="text-xs text-muted-foreground">Blood Knight</p>
                </div>
              </div>
              
              {/* HP Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[oklch(0.55_0.20_140)] flex items-center gap-1">
                    <Heart className="w-3 h-3" /> HP
                  </span>
                  <span className="tabular-nums">{me.hp}/{me.maxHp}</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[oklch(0.45_0.18_140)] to-[oklch(0.55_0.20_140)] transition-all duration-300"
                    style={{ width: `${(me.hp / me.maxHp) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* MP Bar */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[oklch(0.55_0.18_260)] flex items-center gap-1">
                    <Droplets className="w-3 h-3" /> MP
                  </span>
                  <span className="tabular-nums">{me.mp}/{me.maxMp}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[oklch(0.45_0.16_260)] to-[oklch(0.55_0.18_260)] transition-all duration-300"
                    style={{ width: `${(me.mp / me.maxMp) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* Limit Break Bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[oklch(0.60_0.25_310)] flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Limit
                  </span>
                  <span className="tabular-nums">{Math.round(me.limitbreak || 0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full transition-all duration-300",
                      (me.limitbreak || 0) >= 100 
                        ? "bg-gradient-to-r from-[oklch(0.50_0.25_310)] to-[oklch(0.65_0.25_310)] animate-pulse-slow"
                        : "bg-gradient-to-r from-[oklch(0.40_0.20_310)] to-[oklch(0.55_0.22_310)]"
                    )}
                    style={{ width: `${Math.min(me.limitbreak || 0, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Battle Log */}
        <div className="absolute top-8 left-8 w-64">
          <Card className="celtic-border bg-card/80 backdrop-blur">
            <CardContent className="p-3 max-h-48 overflow-y-auto">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                Battle Log
              </p>
              <div className="space-y-1">
                {battle.log.slice(-6).map((entry, i) => (
                  <p key={i} className="text-xs">
                    <span className={cn(
                      "font-medium",
                      entry.actor === me.name ? "text-primary" : 
                      entry.actor === 'system' ? "text-muted-foreground" : "text-destructive"
                    )}>
                      {entry.actor === me.name ? 'You' : entry.actor}
                    </span>{' '}
                    <span className="text-muted-foreground">{entry.text}</span>
                    {entry.damage && (
                      <span className={cn(
                        "ml-1 font-medium",
                        entry.critical ? "text-[oklch(0.75_0.15_85)]" : "text-destructive"
                      )}>
                        {entry.critical && 'CRIT! '}-{entry.damage}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Command Menu */}
      <div className="border-t border-border bg-card p-4">
        {/* Skill Submenu */}
        {selectedCommand?.type === 'skill' && selectedCommand.skills && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Select Skill</h4>
              <button 
                onClick={() => setSelectedCommand(null)}
                className="p-1 rounded hover:bg-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {selectedCommand.skills.map(skill => {
                const canUse = skill.mpCost <= me.mp
                return (
                  <button
                    key={skill.id}
                    onClick={() => handleSkill(skill)}
                    disabled={!canUse || isAnimating}
                    className={cn(
                      "p-3 rounded-lg border text-left transition-all",
                      canUse 
                        ? "celtic-border hover:border-primary/40 hover:bg-primary/5" 
                        : "bg-muted/50 border-border/50 opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-4 h-4 text-[oklch(0.60_0.25_310)]" />
                      <span className="text-sm font-medium">{skill.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="text-[oklch(0.55_0.18_260)]">{skill.mpCost} MP</span>
                      {skill.element && (
                        <span className="capitalize">{skill.element}</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
        
        {/* Main Commands */}
        {!selectedCommand && (
          <div className="flex flex-wrap gap-2 justify-center">
            {battle.commands.map(command => {
              const Icon = COMMAND_ICONS[command.type] || Swords
              const isLimit = command.type === 'limit'
              const limitReady = isLimit && (me.limitbreak || 0) >= 100
              
              return (
                <Button
                  key={command.id}
                  onClick={() => handleCommand(command)}
                  disabled={!battle.isMyTurn || isAnimating || (isLimit && !limitReady)}
                  variant={isLimit && limitReady ? "default" : "outline"}
                  className={cn(
                    "min-w-[100px]",
                    isLimit && limitReady && "bg-[oklch(0.55_0.25_310)] hover:bg-[oklch(0.50_0.25_310)] animate-pulse-slow",
                    command.type === 'flee' && "border-destructive/50 text-destructive hover:bg-destructive/10"
                  )}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {command.name}
                  {command.type === 'skill' && <ChevronRight className="w-4 h-4 ml-1" />}
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
