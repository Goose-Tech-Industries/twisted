"use client"

import { useState } from "react"
import { useGame } from "@/lib/game-context"
import type { Quest } from "@/lib/game-types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { QuestSkeleton } from "./panel-skeletons"
import { EmptyState } from "./empty-state"
import {
  ScrollText,
  CheckCircle2, 
  Circle, 
  Star,
  Coins,
  Package,
  ChevronRight,
  MapPin
} from "lucide-react"

type QuestFilter = 'all' | 'active' | 'completed'

export function QuestPanel() {
  const { state, dispatch, socket, notify } = useGame()
  const [filter, setFilter] = useState<QuestFilter>('all')
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)

  if (state.isLoading) return <QuestSkeleton />

  const filteredQuests = state.quests.filter(quest => {
    if (filter === 'all') return true
    if (filter === 'active') return quest.status === 'active'
    if (filter === 'completed') return quest.status === 'completed'
    return true
  })
  
  const questCounts = {
    all: state.quests.length,
    active: state.quests.filter(q => q.status === 'active').length,
    completed: state.quests.filter(q => q.status === 'completed').length,
  }
  
  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'main story': return 'text-primary border-primary/40 bg-primary/10'
      case 'side quest': return 'text-[oklch(0.55_0.18_260)] border-[oklch(0.55_0.18_260)]/40 bg-[oklch(0.55_0.18_260)]/10'
      case 'bounty': return 'text-[oklch(0.75_0.15_85)] border-[oklch(0.75_0.15_85)]/40 bg-[oklch(0.75_0.15_85)]/10'
      default: return 'text-muted-foreground border-border bg-muted'
    }
  }
  
  return (
    <div className="flex flex-col md:flex-row md:h-full">
      {/* Quest List */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <ScrollText className="w-5 h-5 text-primary" />
              Quest Log
            </h2>
          </div>
          
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4 border-b border-border pb-4 overflow-x-auto scrollbar-none snap-x snap-mandatory">
            {(['all', 'active', 'completed'] as const).map(value => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={cn(
                  "px-4 py-2 rounded text-sm transition-all capitalize",
                  filter === value
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {value} ({questCounts[value]})
              </button>
            ))}
          </div>
          
          {/* Quest List */}
          {filteredQuests.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No Quests"
              description="Your quest log is empty. Speak to NPCs and explore to discover new adventures."
            />
          ) : (
            <div className="space-y-3">
              {filteredQuests.map(quest => {
                const completedObjectives = quest.objectives.filter(o => o.completed).length
                const totalObjectives = quest.objectives.length
                const progress = (completedObjectives / totalObjectives) * 100
                
                return (
                  <button
                    key={quest.id}
                    onClick={() => setSelectedQuest(quest)}
                    className={cn(
                      "w-full text-left p-4 rounded-lg border transition-all hover:border-primary/40",
                      quest.status === 'completed' ? "bg-card/30 border-border/50" : "celtic-border",
                      selectedQuest?.id === quest.id && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Status Icon */}
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center mt-0.5",
                        quest.status === 'completed' 
                          ? "bg-[oklch(0.55_0.15_140)]/20 text-[oklch(0.55_0.15_140)]" 
                          : "bg-primary/20 text-primary"
                      )}>
                        {quest.status === 'completed' 
                          ? <CheckCircle2 className="w-4 h-4" /> 
                          : <Circle className="w-4 h-4" />
                        }
                      </div>
                      
                      {/* Quest Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className={cn(
                            "font-medium truncate",
                            quest.status === 'completed' && "text-muted-foreground line-through"
                          )}>
                            {quest.title}
                          </h3>
                          <span className={cn(
                            "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider",
                            getCategoryColor(quest.category)
                          )}>
                            {quest.category}
                          </span>
                        </div>
                        
                        <p className="text-sm text-muted-foreground line-clamp-1 mb-2">
                          {quest.description}
                        </p>
                        
                        {/* Progress Bar */}
                        {quest.status === 'active' && (
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {completedObjectives}/{totalObjectives}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Arrow */}
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
      
      {/* Quest Detail Sidebar */}
      {selectedQuest && (
        <aside className="w-80 border-l border-border bg-card/50 p-4 overflow-y-auto">
          {/* Header */}
          <div className="mb-4">
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider inline-block mb-2",
              getCategoryColor(selectedQuest.category)
            )}>
              {selectedQuest.category}
            </span>
            <h3 className="text-lg font-bold">{selectedQuest.title}</h3>
          </div>
          
          {/* Description */}
          <Card className="celtic-border mb-4">
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground italic">
                {selectedQuest.description}
              </p>
            </CardContent>
          </Card>
          
          {/* Objectives */}
          <Card className="celtic-border mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Objectives
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedQuest.objectives.map(objective => (
                <div 
                  key={objective.id}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded",
                    objective.completed ? "bg-[oklch(0.55_0.15_140)]/10" : "bg-card/50"
                  )}
                >
                  {objective.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-[oklch(0.55_0.15_140)] mt-0.5 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm",
                      objective.completed && "line-through text-muted-foreground"
                    )}>
                      {objective.description}
                    </p>
                    {!objective.completed && objective.required > 1 && (
                      <div className="flex items-center gap-2 mt-1">
                        <Progress 
                          value={(objective.current / objective.required) * 100} 
                          className="h-1 flex-1" 
                        />
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {objective.current}/{objective.required}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          
          {/* Rewards */}
          <Card className="celtic-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">
                Rewards
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedQuest.rewards.map((reward, i) => (
                <div 
                  key={i}
                  className="flex items-center gap-3 p-2 bg-card/50 rounded"
                >
                  {reward.type === 'xp' && (
                    <>
                      <Star className="w-4 h-4 text-[oklch(0.65_0.18_85)]" />
                      <span className="text-sm">{reward.amount.toLocaleString()} XP</span>
                    </>
                  )}
                  {reward.type === 'gold' && (
                    <>
                      <Coins className="w-4 h-4 text-[oklch(0.75_0.15_85)]" />
                      <span className="text-sm">{reward.amount.toLocaleString()} Gold</span>
                    </>
                  )}
                  {reward.type === 'item' && (
                    <>
                      <Package className="w-4 h-4 text-[oklch(0.55_0.18_260)]" />
                      <span className="text-sm">{reward.itemName}</span>
                    </>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          
          {/* Track Quest Button */}
          {selectedQuest.status === 'active' && (
            <button
              onClick={() => {
                const isTracked = state.trackedQuestId === selectedQuest.id
                dispatch({ type: 'SET_TRACKED_QUEST', payload: isTracked ? null : selectedQuest.id })
                if (socket) socket.emit('track_quest', { questId: isTracked ? null : selectedQuest.id })
                notify(isTracked ? 'info' : 'success', isTracked ? 'Quest untracked' : `Tracking: ${selectedQuest.title}`)
              }}
              className={cn(
                "w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 border rounded transition-colors",
                state.trackedQuestId === selectedQuest.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-primary/20 text-primary border-primary/40 hover:bg-primary/30"
              )}>
              <MapPin className="w-4 h-4" />
              {state.trackedQuestId === selectedQuest.id ? 'Tracking' : 'Track Quest'}
            </button>
          )}
        </aside>
      )}
    </div>
  )
}
