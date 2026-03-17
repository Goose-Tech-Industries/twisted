"use client"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Info, RefreshCw, RotateCcw, Skull, Globe, MessageSquare, Swords, Flag } from "lucide-react"
import { cn } from "@/lib/utils"

async function wReq(method: string, url: string, data?: unknown): Promise<Record<string, unknown>> {
  const opts: RequestInit = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } }
  if (data && method !== 'GET') opts.body = JSON.stringify(data)
  return (await fetch(url, opts)).json()
}

interface WorldFlag { flag_key: string; flag_value: string; set_by: string; set_at: string }
interface NpcMood   { id: number; name: string; icon: string; mood: string; map_id: number; map_name: string }
interface DeadNpc   { id: number; name: string; icon: string; map_id: number; map_name: string; death_cause: string }
interface Faction   { id: number; name: string; icon: string; description: string; rival_id: number | null; npc_count: number }
interface Rumor     { id: number; char_name: string; rumor_text: string; spread_count: number; max_spread: number; created_at: string }

const MOODS: string[] = ['happy', 'fearful', 'angry', 'grieving', 'excited']
const MOOD_ICONS: Record<string, string> = { happy: '😄', fearful: '😨', angry: '😠', grieving: '😢', excited: '🤩' }
type Section = 'flags' | 'moods' | 'dead' | 'factions' | 'rumors'

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

// ── Flags ────────────────────────────────────────────────────────
function FlagsSection() {
  const [flags,   setFlags]   = useState<WorldFlag[]>([])
  const [loading, setLoading] = useState(true)
  const [newKey,  setNewKey]  = useState('')
  const [newVal,  setNewVal]  = useState('true')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await wReq('GET', '/admin/world-flags')
    setFlags(r.success ? (r.data as WorldFlag[]) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const toggle = async (key: string, currentVal: string) => {
    const newValue = currentVal === 'true' || currentVal === '1' ? 'false' : 'true'
    await wReq('POST', '/admin/world-flags', { key, value: newValue, setBy: 'Admin' })
    load()
  }
  const del = async (key: string) => {
    if (!confirm(`Delete world flag "${key}"? NPCs will no longer reference this event.`)) return
    await wReq('DELETE', `/admin/world-flags/${encodeURIComponent(key)}`); load()
  }
  const add = async () => {
    if (!newKey.trim()) { alert('Flag key is required'); return }
    await wReq('POST', '/admin/world-flags', { key: newKey.trim(), value: newVal || 'true', setBy: 'Admin' })
    setNewKey(''); setNewVal('true'); load()
  }

  return (
    <div>
      <Help>
        World flags are global switches that affect NPC dialogue. NPCs who know about an active flag will reference it
        naturally in conversation. Flags are set by script events — you can also set them manually here.
        <b> Toggle</b> a flag off to temporarily undo an event without deleting it.
      </Help>
      <div className="flex gap-2 mb-4">
        <Input value={newKey} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && add()}
          placeholder="flag_key (e.g. goblin_boss_slain)" className="flex-1" />
        <Input value={newVal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewVal(e.target.value)}
          placeholder="value" className="w-28" />
        <Button onClick={add}><Plus className="w-4 h-4 mr-1" />Set</Button>
      </div>
      {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : flags.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No world flags set yet.<br />
            <span className="text-xs">Flags are set by script events, or add one manually above.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {flags.map((f: WorldFlag) => {
              const isTrue = f.flag_value === 'true' || f.flag_value === '1'
              return (
                <div key={f.flag_key} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <Flag className={cn('w-4 h-4 shrink-0', isTrue ? 'text-green-400' : 'text-muted-foreground')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-sm font-bold text-purple-400">{f.flag_key}</code>
                      <code className="text-xs text-yellow-400">{f.flag_value}</code>
                      <Badge className={cn('text-[10px] py-0', isTrue ? 'bg-green-900/50 text-green-400' : 'bg-secondary text-muted-foreground')}>
                        {isTrue ? '● ACTIVE' : '● INACTIVE'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Set by {f.set_by || '—'} · {f.set_at ? new Date(f.set_at).toLocaleString() : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toggle(f.flag_key, f.flag_value)}>
                    {isTrue ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(f.flag_key)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ── Moods ────────────────────────────────────────────────────────
function MoodsSection() {
  const [npcs,         setNpcs]         = useState<NpcMood[]>([])
  const [loading,      setLoading]      = useState(true)
  const [setMoodName,  setSetMoodName]  = useState('')
  const [setMoodValue, setSetMoodValue] = useState('happy')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await wReq('GET', '/admin/npc-moods')
    setNpcs(r.success ? (r.data as NpcMood[]).filter((n: NpcMood) => n.mood) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const setMoodFn = async (name: string, mood: string) => {
    await wReq('POST', '/admin/npc-mood', { npcName: name, mood }); load()
  }
  const clearMood = async (name: string) => {
    await wReq('POST', '/admin/npc-mood', { npcName: name, mood: null }); load()
  }
  const addMood = async () => {
    if (!setMoodName.trim()) { alert('Enter an NPC name'); return }
    await setMoodFn(setMoodName.trim(), setMoodValue); setSetMoodName('')
  }

  return (
    <div>
      <Help>
        Moods change how an NPC greets and speaks to players without changing their persona.
        Moods reset on server restart unless re-applied by a script event.
      </Help>
      <div className="flex gap-2 mb-4">
        <Input value={setMoodName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSetMoodName(e.target.value)}
          placeholder="NPC name (exact)" className="flex-1" />
        <select value={setMoodValue} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSetMoodValue(e.target.value)}
          className="px-3 py-2 bg-input border border-border rounded-md text-sm">
          {MOODS.map((m: string) => <option key={m} value={m}>{MOOD_ICONS[m]} {m}</option>)}
        </select>
        <Button onClick={addMood}><Plus className="w-4 h-4 mr-1" />Set Mood</Button>
      </div>
      {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : npcs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No NPCs currently have a mood set.<br />
            <span className="text-xs">Moods are set by the 😶 NPC Mood script action or from this panel.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {npcs.map((n: NpcMood) => (
              <div key={n.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <span className="text-xl">{n.icon || '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{n.name}</div>
                  <p className="text-xs text-muted-foreground">{n.map_name || `Map ${n.map_id}`}</p>
                </div>
                <Badge variant="outline" className="text-sm">{MOOD_ICONS[n.mood]} {n.mood}</Badge>
                <select defaultValue={n.mood} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setMoodFn(n.name, e.target.value)}
                  className="px-2 py-1 bg-input border border-border rounded text-xs">
                  {MOODS.map((m: string) => <option key={m} value={m}>{MOOD_ICONS[m]} {m}</option>)}
                </select>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => clearMood(n.name)}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

// ── Dead NPCs ────────────────────────────────────────────────────
function DeadSection() {
  const [npcs,    setNpcs]    = useState<DeadNpc[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await wReq('GET', '/admin/dead-npcs')
    setNpcs(r.success ? (r.data as DeadNpc[]) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const resurrect = async (id: number, name: string) => {
    if (!confirm(`Resurrect "${name}"? They will reappear at their original position.`)) return
    await wReq('POST', `/admin/resurrect-npc/${id}`); load()
  }

  return (
    <div>
      <Help>
        NPCs marked as dead are removed from the game world. Resurrect them here to bring them back,
        or leave them dead and create a replacement NPC.
      </Help>
      {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : npcs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No NPCs have been killed.<br />
            <span className="text-xs">Use the 💀 Kill NPC script action to mark an NPC as dead.</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {npcs.map((n: DeadNpc) => (
              <div key={n.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card opacity-70">
                <Skull className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-lg text-muted-foreground">{n.icon || '👤'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-muted-foreground">{n.name} <span className="text-xs">[dead]</span></div>
                  <p className="text-xs text-muted-foreground">
                    {n.map_name || `Map ${n.map_id}`} · <span className="text-red-400 italic">{n.death_cause || 'Unknown cause'}</span>
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => resurrect(n.id, n.name)}>♻ Resurrect</Button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  )
}

// ── Factions ─────────────────────────────────────────────────────
function FactionsSection() {
  const [factions, setFactions] = useState<Faction[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<Partial<Faction> | null>(null)
  const [isNew,    setIsNew]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await wReq('GET', '/admin/factions')
    setFactions(r.success ? (r.data as Faction[]) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!editing?.name?.trim()) { alert('Name is required'); return }
    if (isNew) await wReq('POST', '/admin/factions', editing)
    else       await wReq('PUT', `/admin/factions/${editing!.id}`, editing)
    setEditing(null); load()
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete faction "${name}"? This removes all player standings with this faction.`)) return
    await wReq('DELETE', `/admin/factions/${id}`); load()
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<Faction> | null) => ({ ...prev, [k]: v }))

  return (
    <div>
      <Help>
        Factions group NPCs into organisations. Players gain or lose reputation with whole factions at once.
        Setting a <b>Rival</b> means helping one faction automatically hurts the other.
      </Help>
      {editing ? (
        <div className="p-4 bg-card border border-border rounded-lg space-y-3 mb-4">
          <h3 className="text-sm font-semibold">{isNew ? '+ New Faction' : `✏️ Edit: ${editing.name}`}</h3>
          <div className="grid grid-cols-2 gap-3">
            <Input value={editing.name || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} placeholder="Faction Name" />
            <Input value={editing.icon || '⚔️'} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)} placeholder="Icon" className="w-20" style={{ fontSize: 22 }} />
          </div>
          <Input value={editing.description || ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('description', e.target.value)} placeholder="Description" />
          <Input type="number" value={editing.rival_id ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('rival_id', e.target.value ? parseInt(e.target.value) : null)}
            placeholder="Rival Faction ID (optional)" className="w-48" />
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => { setIsNew(true); setEditing({ icon: '⚔️' }) }} className="mb-4">
          <Plus className="w-4 h-4 mr-1" />New Faction
        </Button>
      )}
      {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : factions.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No factions yet.<br />
            <span className="text-xs">Create factions like "Town Guard", "Thieves Guild", "Merchant Council".</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {factions.map((f: Faction) => {
              const rivalName = f.rival_id
                ? factions.find((x: Faction) => x.id === f.rival_id)?.name || `Faction #${f.rival_id}`
                : null
              return (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <span className="text-xl">{f.icon || '⚔️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{f.name}</span>
                      <Badge variant="outline" className="text-[10px] py-0">{f.npc_count || 0} NPCs</Badge>
                      {rivalName && <Badge variant="outline" className="text-[10px] py-0 text-red-400">Rivals: {rivalName}</Badge>}
                    </div>
                    {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => { setIsNew(false); setEditing({ ...f }) }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(f.id, f.name)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ── Rumors ───────────────────────────────────────────────────────
function RumorsSection() {
  const [rumors,  setRumors]  = useState<Rumor[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await wReq('GET', '/admin/rumors')
    setRumors(r.success ? (r.data as Rumor[]) : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const suppress = async (id: number) => {
    if (!confirm('Suppress this rumor? It will stop spreading.')) return
    await wReq('DELETE', `/admin/rumors/${id}`); load()
  }

  return (
    <div>
      <Help>
        Rumors are player deeds spreading between NPCs. Every 30 seconds the world tick picks one rumor and teaches it
        to 1–2 NPCs. Each rumor spreads to max 8 NPCs then stops. NPCs reference these naturally in conversation.
      </Help>
      {loading ? <div className="text-center py-8 text-muted-foreground">Loading…</div>
        : rumors.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            No rumors spreading.<br />
            <span className="text-xs">Rumors are created when players win battles and complete quests.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {rumors.map((r: Rumor) => {
              const pct = Math.min(100, Math.round((r.spread_count / r.max_spread) * 100))
              const done = pct >= 100
              return (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{r.char_name}</span>
                      <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                      {done && <Badge variant="secondary" className="text-[10px] py-0">Fully spread</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground italic mb-2">"{r.rumor_text}"</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-32">
                        <div className={cn('h-full rounded-full', done ? 'bg-muted-foreground' : 'bg-primary')}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{r.spread_count}/{r.max_spread}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => suppress(r.id)}>
                    Suppress
                  </Button>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ── Main Panel ────────────────────────────────────────────────────
const SECTIONS: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
  { id: 'flags',    label: 'World Flags', icon: <Flag className="w-4 h-4" /> },
  { id: 'moods',    label: 'NPC Moods',   icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'dead',     label: 'Dead NPCs',   icon: <Skull className="w-4 h-4" /> },
  { id: 'factions', label: 'Factions',    icon: <Swords className="w-4 h-4" /> },
  { id: 'rumors',   label: 'Rumors',      icon: <Globe className="w-4 h-4" /> },
]

export function WorldStatePanel() {
  const [active, setActive] = useState<Section>('flags')
  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2"><Globe className="w-5 h-5" /> World State</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage the living world — flags, NPC moods, factions, and rumors</p>
      </div>
      <div className="flex gap-2 flex-wrap mb-6">
        {SECTIONS.map((s: { id: Section; label: string; icon: React.ReactNode }) => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
              active === s.id
                ? 'bg-primary/10 border-primary/50 text-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
            )}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>
      {active === 'flags'    && <FlagsSection />}
      {active === 'moods'    && <MoodsSection />}
      {active === 'dead'     && <DeadSection />}
      {active === 'factions' && <FactionsSection />}
      {active === 'rumors'   && <RumorsSection />}
    </div>
  )
}
