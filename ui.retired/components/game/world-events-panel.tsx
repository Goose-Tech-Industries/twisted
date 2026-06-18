"use client"

import { useEffect, useState, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Zap, Clock, Users, MapPin, Gift, ChevronRight, Star, History } from "lucide-react"

// ─── Types ──────────────────────────────────────────────────────
interface ActiveEvent {
  id: number; name: string; description: string | null; icon: string | null
  event_type: string; region_id: number | null; map_id: number | null
  duration_minutes: number; phase_count: number; current_phase: number
  phases_json: string | null; rewards_json: string | null
  min_level: number; max_participants: number
  lore_text: string | null; announce_text: string | null
  stat_modifiers: string | null; effects_json: string | null
  started_at: string; expires_at: string
  participant_count?: number; my_contribution?: number; am_participating?: boolean
}

interface EventHistoryEntry {
  id: number; event_name: string; outcome: string
  participant_count: number; duration_actual: number; ended_at: string
}

type View = 'active' | 'history'

// ─── Component ──────────────────────────────────────────────────
export function WorldEventsPanel() {
  const { socket, state } = useGame()
  const { notify } = useNotification()
  const [view, setView] = useState<View>('active')
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([])
  const [history, setHistory] = useState<EventHistoryEntry[]>([])
  const [selectedEvent, setSelectedEvent] = useState<ActiveEvent | null>(null)
  const [loading, setLoading] = useState(false)

  const charId = state.character?.id

  const loadActive = useCallback(() => {
    if (!socket) return
    setLoading(true)
    socket.emit('world_events_get_active')
  }, [socket])

  const loadHistory = useCallback(() => {
    if (!socket) return
    setLoading(true)
    socket.emit('world_events_get_history')
  }, [socket])

  useEffect(() => { loadActive() }, [loadActive])

  useEffect(() => {
    if (!socket) return
    const onActive = (data: ActiveEvent[]) => { setActiveEvents(data); setLoading(false) }
    const onHistory = (data: EventHistoryEntry[]) => { setHistory(data); setView('history'); setLoading(false) }
    const onJoinResult = (data: { success: boolean; message: string; eventId: number }) => {
      notify(data.success ? 'success' : 'error', data.message)
      if (data.success) loadActive()
    }
    const onWorldEvent = () => { loadActive() }

    socket.on('world_events_active', onActive)
    socket.on('world_events_history', onHistory)
    socket.on('world_event_join_result', onJoinResult)
    socket.on('world_event', onWorldEvent)
    return () => {
      socket.off('world_events_active', onActive)
      socket.off('world_events_history', onHistory)
      socket.off('world_event_join_result', onJoinResult)
      socket.off('world_event', onWorldEvent)
    }
  }, [socket, loadActive, notify])

  const joinEvent = (eventId: number) => {
    if (!socket) return
    socket.emit('world_event_join', { eventId })
  }

  const timeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now()
    if (diff <= 0) return 'Ending...'
    const mins = Math.floor(diff / 60000)
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`
    return `${mins}m`
  }

  // ── Header ──
  const header = (
    <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-500" /> World Events
      </h2>
      <div className="flex gap-1">
        <Button variant={view === 'active' ? 'default' : 'ghost'} size="sm"
          onClick={() => { setView('active'); loadActive() }}>
          <Zap className="w-3.5 h-3.5 mr-1" /> Active
        </Button>
        <Button variant={view === 'history' ? 'default' : 'ghost'} size="sm"
          onClick={() => loadHistory()}>
          <History className="w-3.5 h-3.5 mr-1" /> History
        </Button>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════
  // DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════
  if (selectedEvent) {
    const ev = selectedEvent
    type Phase = { name?: string }
    type Rewards = { xp?: number; gold?: number; items?: { item_id: number; qty: number }[] } | null
    type Mods = Record<string, unknown> | null

    let phases: Phase[] = []
    let rewards: Rewards = null
    let mods: Mods = null
    try { phases = ev.phases_json ? (JSON.parse(ev.phases_json) as Phase[]) : [] } catch {}
    try { rewards = ev.rewards_json ? (JSON.parse(ev.rewards_json) as Rewards) : null } catch {}
    try { mods = ev.stat_modifiers ? (JSON.parse(ev.stat_modifiers) as Mods) : null } catch {}

    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
        {header}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <button onClick={() => setSelectedEvent(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            &larr; Back to events
          </button>

          <div className="text-center">
            <span className="text-4xl">{ev.icon || '🌍'}</span>
            <h3 className="text-xl font-bold mt-2">{ev.name}</h3>
            {ev.lore_text && <p className="text-sm text-muted-foreground mt-2 italic">{ev.lore_text}</p>}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-4 py-3">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-yellow-400" /> {timeRemaining(ev.expires_at)} left</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4" /> {ev.participant_count || 0} joined</span>
          </div>

          {/* Phase progress */}
          {phases.length > 1 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2">Phases</p>
              <div className="space-y-1">
                {phases.map((phase, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded text-xs border",
                    i < ev.current_phase ? "border-green-500/20 bg-green-500/5 text-green-400" :
                    i === ev.current_phase ? "border-yellow-500/30 bg-yellow-500/5 text-yellow-400 font-bold" :
                    "border-border opacity-50"
                  )}>
                    <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
                      {i < ev.current_phase ? '✓' : i + 1}
                    </span>
                    {phase.name || `Phase ${i + 1}`}
                    {i === ev.current_phase && <span className="ml-auto text-[10px] animate-pulse">ACTIVE</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modifiers */}
          {mods && Object.keys(mods).length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2">Active Modifiers</p>
              <div className="grid grid-cols-2 gap-1.5">
                {Object.entries(mods).map(([key, val]) => (
                  <div key={key} className="text-xs px-2.5 py-1.5 rounded bg-primary/10 border border-primary/20">
                    <span className="text-muted-foreground">{key.replace(/_/g, ' ')}: </span>
                    <span className="font-bold">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rewards */}
          {rewards && (
            <div>
              <p className="text-xs font-bold text-muted-foreground mb-2 flex items-center gap-1"><Gift className="w-3 h-3" /> Completion Rewards</p>
              <div className="flex flex-wrap gap-2 text-xs">
                {rewards.xp && <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">+{rewards.xp} XP</span>}
                {rewards.gold && <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-400">+{rewards.gold} Gold</span>}
                {rewards.items?.map((item, i) => (
                  <span key={i} className="px-2 py-1 rounded bg-purple-500/10 text-purple-400">Item #{item.item_id} x{item.qty}</span>
                ))}
              </div>
            </div>
          )}

          {/* Join button */}
          {!ev.am_participating ? (
            <Button className="w-full" onClick={() => joinEvent(ev.id)}>
              <Star className="w-4 h-4 mr-1" /> Join Event
            </Button>
          ) : (
            <div className="text-center">
              <p className="text-sm text-green-400 font-medium">You are participating</p>
              {ev.my_contribution !== undefined && ev.my_contribution > 0 && (
                <p className="text-xs text-muted-foreground mt-1">Contribution: {ev.my_contribution}</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // ACTIVE EVENTS LIST
  // ═══════════════════════════════════════════════════════════════
  if (view === 'active') {
    return (
      <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
        {header}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && <p className="text-muted-foreground text-center py-8">Loading...</p>}
          {!loading && !activeEvents.length && (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No active world events</p>
              <p className="text-xs mt-1">Events spawn randomly or are triggered by admins</p>
            </div>
          )}
          {activeEvents.map(ev => (
            <Card key={ev.id} className="cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => setSelectedEvent(ev)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{ev.icon || '🌍'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm">{ev.name}</h3>
                      <span className="text-xs text-yellow-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {timeRemaining(ev.expires_at)}
                      </span>
                    </div>
                    {ev.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      {ev.participant_count !== undefined && (
                        <span className="flex items-center gap-0.5"><Users className="w-3 h-3" /> {ev.participant_count}</span>
                      )}
                      {ev.region_id && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> Region {ev.region_id}</span>}
                      {ev.phase_count > 1 && <span>Phase {ev.current_phase + 1}/{ev.phase_count}</span>}
                      {ev.am_participating && <span className="text-green-400 font-medium">Joined</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // HISTORY VIEW
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && <p className="text-muted-foreground text-center py-8">Loading...</p>}
        {!loading && !history.length && (
          <p className="text-center py-8 text-muted-foreground">No event history yet</p>
        )}
        <div className="space-y-1">
          {history.map(h => (
            <div key={h.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted/50 text-sm">
              <div>
                <p className="font-medium">{h.event_name}</p>
                <p className="text-xs text-muted-foreground">
                  {h.participant_count} participants / {h.duration_actual}min / {new Date(h.ended_at).toLocaleDateString()}
                </p>
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded",
                h.outcome === 'completed' ? "text-green-400 bg-green-500/10" :
                h.outcome === 'failed' ? "text-red-400 bg-red-500/10" :
                "text-muted-foreground bg-muted"
              )}>
                {h.outcome}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
