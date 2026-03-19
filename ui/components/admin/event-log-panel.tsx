"use client"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw } from "lucide-react"

interface GameEvent {
  id: number; event_type: string; actor_name: string | null
  target_name: string | null; detail_json: unknown; created_at: string
}
interface EventTypeOption { v: string; l: string }

const CHIP: Record<string, string> = {
  battle_end:          'bg-red-900/30 text-red-400',
  level_up:            'bg-green-900/30 text-green-400',
  gm_ban:              'bg-purple-900/30 text-purple-400',
  gm_unban:            'bg-purple-900/30 text-purple-400',
  gm_give_gold:        'bg-yellow-900/30 text-yellow-400',
  gm_role_change:      'bg-purple-900/30 text-purple-400',
  map_connection_edit: 'bg-blue-900/30 text-blue-400',
  gm_kick:             'bg-orange-900/30 text-orange-400',
}
const ICONS: Record<string, string> = {
  battle_end: '⚔️', level_up: '⬆️', gm_ban: '🚫', gm_unban: '✅',
  gm_give_gold: '💰', gm_role_change: '🎭', map_connection_edit: '🗺️', gm_kick: '⚡',
}

const EVENT_TYPES: EventTypeOption[] = [
  { v: '',                  l: 'All Event Types' },
  { v: 'battle_end',        l: '⚔️ Battle End' },
  { v: 'level_up',          l: '⬆️ Level Up' },
  { v: 'gm_ban',            l: '🚫 GM Ban' },
  { v: 'gm_unban',          l: '✅ GM Unban' },
  { v: 'gm_give_gold',      l: '💰 GM Give Gold' },
  { v: 'gm_role_change',    l: '🎭 GM Role Change' },
  { v: 'map_connection_edit', l: '🗺️ Map Edit' },
  { v: 'gm_kick',           l: '👢 GM Kick' },
  { v: 'gm_delete_char',    l: '💀 GM Delete Char' },
  { v: 'gm_note',           l: '📝 GM Note' },
  { v: 'world_flag',        l: '🏴 World Flag' },
]

function formatDetail(ev: GameEvent): string {
  try {
    const d = (typeof ev.detail_json === 'string'
      ? JSON.parse(ev.detail_json)
      : (ev.detail_json || {})) as Record<string, unknown>
    if (ev.event_type === 'battle_end')        return `+${d.gold || 0}g · +${d.xp || 0}xp · beat ${d.loserName || '—'}`
    if (ev.event_type === 'level_up')          return `→ Level ${d.new_level || '?'}`
    if (ev.event_type === 'gm_ban')            return d.reason ? `"${String(d.reason)}"` : '—'
    if (ev.event_type === 'gm_give_gold')      return `${Number(d.amount) > 0 ? '+' : ''}${d.amount}g`
    if (ev.event_type === 'gm_role_change')    return `→ ${d.role}`
    if (ev.event_type === 'map_connection_edit') return `${d.event_count} events saved`
    return JSON.stringify(d).slice(0, 60)
  } catch { return '—' }
}

export function EventLogPanel() {
  const [rows,        setRows]        = useState<GameEvent[]>([])
  const [filtered,    setFiltered]    = useState<GameEvent[]>([])
  const [loading,     setLoading]     = useState(true)
  const [typeFilter,  setTypeFilter]  = useState('')
  const [actorFilter, setActorFilter] = useState('')
  const [limit,       setLimit]       = useState(100)
  const [note,        setNote]        = useState('')

  const load = useCallback(async () => {
    setLoading(true); setNote('')
    const params = new URLSearchParams({ limit: String(limit) })
    if (typeFilter)  params.set('type', typeFilter)
    if (actorFilter) params.set('actorName', actorFilter)
    const r = await fetch(`/admin-panel/event-log?${params}`, { credentials: 'include' })
    const d: Record<string, unknown> = await r.json()
    if (d.note) {
      setNote(String(d.note)); setRows([]); setFiltered([])
    } else if (d.success) {
      const data = (d.data || []) as GameEvent[]
      setRows(data); setFiltered(data)
    }
    setLoading(false)
  }, [limit, typeFilter, actorFilter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const lower = actorFilter.toLowerCase()
    setFiltered(rows.filter((ev: GameEvent) =>
      !lower || (ev.actor_name || '').toLowerCase().includes(lower)
    ))
  }, [actorFilter, rows])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🔔 Event Log</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Audit trail — battles, GM actions, level-ups, map edits</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
        </Button>
      </div>

      <div className="flex gap-3 items-center flex-wrap mb-4">
        <select
          value={typeFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 bg-input border border-border rounded text-sm"
        >
          {EVENT_TYPES.map((o: EventTypeOption) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <Input
          value={actorFilter}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActorFilter(e.target.value)}
          placeholder="Filter by actor…"
          className="w-44 h-9"
        />
        <select
          value={limit}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setLimit(parseInt(e.target.value))}
          className="px-3 py-1.5 bg-input border border-border rounded text-sm"
        >
          {[50, 100, 250, 500].map((n: number) => <option key={n} value={n}>{n} rows</option>)}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {note && (
        <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-sm mb-4">
          ⚠️ {note}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[140px_130px_1fr_1fr_1fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <span>Time</span><span>Event</span><span>Actor</span><span>Target</span><span>Detail</span>
          </div>
          <div className="max-h-[65vh] overflow-y-auto">
            {filtered.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">No events found.</div>
            )}
            {filtered.map((ev: GameEvent) => {
              const when = new Date(ev.created_at).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
              })
              const chipCls = CHIP[ev.event_type] || 'bg-secondary text-muted-foreground'
              return (
                <div
                  key={ev.id}
                  className="grid grid-cols-[140px_130px_1fr_1fr_1fr] gap-2 px-3 py-2.5 border-b border-border/40 last:border-0 text-xs hover:bg-secondary/20 transition-colors"
                >
                  <span className="text-muted-foreground font-mono text-[11px]">{when}</span>
                  <span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${chipCls}`}>
                      {ICONS[ev.event_type] || '🔔'} {ev.event_type}
                    </span>
                  </span>
                  <span className="text-foreground truncate">{ev.actor_name || '—'}</span>
                  <span className="text-muted-foreground truncate">{ev.target_name || '—'}</span>
                  <span className="text-muted-foreground text-[11px] truncate">{formatDetail(ev)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
