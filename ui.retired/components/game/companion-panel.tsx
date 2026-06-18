"use client"

import { useEffect, useState, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Shield, Swords, Heart, Sparkles, UserMinus, Users, ScrollText, ChevronDown, ChevronUp, Star } from "lucide-react"
import type { Companion } from "@/lib/game-types"

interface CompanionQuest {
  id: number; npc_id: number; quest_order: number; title: string
  description: string | null; icon: string | null
  affinity_required: number; level_required: number
  objectives_json: string; rewards_json: string | null
  completion_dialogue: string | null; affinity_reward: number
  status: 'locked' | 'available' | 'active' | 'completed'
  progress_json: string | null
}

interface AffinityTier {
  tier_level: number; name: string; affinity_required: number
  description: string | null; unlock_text: string | null
}

const TACTICS_CONFIG: Record<Companion['tactics'], { label: string; icon: typeof Swords; description: string; color: string }> = {
  AGGRESSIVE: { label: 'Aggressive', icon: Swords, description: 'Prioritizes damage, rarely defends', color: 'text-red-400' },
  BALANCED:   { label: 'Balanced',   icon: Shield, description: 'Balanced offense and defense', color: 'text-blue-400' },
  DEFENSIVE:  { label: 'Defensive',  icon: Shield, description: 'Defends often, heals early', color: 'text-green-400' },
  SUPPORT:    { label: 'Support',    icon: Heart,  description: 'Prioritizes healing allies', color: 'text-pink-400' },
}

export function CompanionPanel() {
  const { state, socket, masterTrain, acceptNpcNeed } = useGame()
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

              {/* Affinity Bar */}
              <CompanionAffinity npcId={comp.npcId} name={comp.name} />

              {/* Master Train & Accept Need */}
              <div className="flex gap-2 mb-3">
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
                  onClick={() => masterTrain(comp.npcId)}>
                  <Sparkles className="w-3 h-3 mr-1" />
                  Train
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs"
                  onClick={() => acceptNpcNeed(comp.npcId)}>
                  <Heart className="w-3 h-3 mr-1" />
                  Fulfill Need
                </Button>
              </div>

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

// ═══════════════════════════════════════════════════════════════
// Companion Affinity + Quest Chain Sub-Component
// ═══════════════════════════════════════════════════════════════

function CompanionAffinity({ npcId, name }: { npcId: number; name: string }) {
  const { socket } = useGame()
  const { notify } = useNotification()
  const [affinity, setAffinity] = useState(0)
  const [tierName, setTierName] = useState('Stranger')
  const [nextTier, setNextTier] = useState<AffinityTier | null>(null)
  const [quests, setQuests] = useState<CompanionQuest[]>([])
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(() => {
    if (!socket) return
    socket.emit('companion_get_affinity', { npcId })
  }, [socket, npcId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!socket) return
    const onAffinity = (data: { npcId: number; affinity: number; tierName: string; nextTier: AffinityTier | null; quests: CompanionQuest[] }) => {
      if (data.npcId !== npcId) return
      setAffinity(data.affinity)
      setTierName(data.tierName)
      setNextTier(data.nextTier)
      setQuests(data.quests)
    }
    const onQuestResult = (data: { success: boolean; message: string; npcId: number }) => {
      if (data.npcId !== npcId) return
      notify(data.success ? 'success' : 'error', data.message)
      if (data.success) load()
    }
    socket.on('companion_affinity', onAffinity)
    socket.on('companion_quest_result', onQuestResult)
    return () => { socket.off('companion_affinity', onAffinity); socket.off('companion_quest_result', onQuestResult) }
  }, [socket, npcId, load, notify])

  const acceptQuest = (questId: number) => {
    if (!socket) return
    socket.emit('companion_quest_accept', { npcId, questId })
  }

  const progressPct = nextTier ? Math.min(100, (affinity / nextTier.affinity_required) * 100) : 100

  return (
    <div className="mb-3">
      {/* Affinity bar */}
      <div className="flex justify-between text-xs mb-1">
        <span className="text-pink-400 flex items-center gap-1"><Heart className="w-3 h-3" /> {tierName}</span>
        <span className="text-muted-foreground">{affinity}{nextTier ? ` / ${nextTier.affinity_required}` : ''}</span>
      </div>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
        <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
      </div>

      {/* Quest chain toggle */}
      {quests.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors w-full justify-between"
        >
          <span className="flex items-center gap-1"><ScrollText className="w-3 h-3" /> {name}&apos;s Story ({quests.filter(q => q.status === 'completed').length}/{quests.length})</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {/* Quest list */}
      {expanded && quests.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {quests.map(q => {
            const objectives = JSON.parse(q.objectives_json || '[]')
            const progress = q.progress_json ? JSON.parse(q.progress_json) : {}
            return (
              <div key={q.id} className={cn(
                "rounded border px-2.5 py-2 text-xs",
                q.status === 'completed' ? "border-green-500/20 bg-green-500/5 opacity-60" :
                q.status === 'active' ? "border-primary/30 bg-primary/5" :
                q.status === 'available' ? "border-yellow-500/20 bg-yellow-500/5" :
                "border-border opacity-40"
              )}>
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {q.icon || '📜'} {q.title}
                  </span>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                    q.status === 'completed' ? "text-green-400" :
                    q.status === 'active' ? "text-primary" :
                    q.status === 'available' ? "text-yellow-400" :
                    "text-muted-foreground"
                  )}>
                    {q.status === 'completed' && <Star className="w-3 h-3 inline mr-0.5" />}
                    {q.status}
                  </span>
                </div>
                {q.description && q.status !== 'locked' && (
                  <p className="text-muted-foreground mt-1">{q.description}</p>
                )}
                {q.status === 'active' && objectives.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {objectives.map((obj: { label?: string; count?: number; type?: string }, i: number) => {
                      const done = progress[i] || 0
                      const total = obj.count || 1
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <span>{obj.label || obj.type}</span>
                          <span className={done >= total ? "text-green-400" : ""}>{done}/{total}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {q.status === 'available' && (
                  <Button size="sm" variant="outline" className="mt-2 h-6 text-[10px]"
                    onClick={() => acceptQuest(q.id)}>
                    Accept Quest
                  </Button>
                )}
                {q.status === 'locked' && q.affinity_required > affinity && (
                  <p className="text-[10px] text-muted-foreground mt-1">Requires {q.affinity_required} affinity</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
