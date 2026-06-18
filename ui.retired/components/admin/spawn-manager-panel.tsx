"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, ChevronLeft, Info } from "lucide-react"

interface Spawn {
  id: number; name: string; map_id: number; enabled: boolean | number
  x_min: number; y_min: number; x_max: number; y_max: number
  encounter_rate: number; min_level: number; max_level: number
  required_flag: string | null; world_flag_conditions: string | null
  encounter_table: string
}
interface GameMap  { id: number; name: string; width?: number; height?: number }
interface NPC      { id: number; name: string; icon: string; is_enemy: boolean | number }
interface EncEntry { npc_id: number; weight: number }

type CoordField = 'x_min' | 'y_min' | 'x_max' | 'y_max'
const COORD_FIELDS: [string, CoordField][] = [['X Min','x_min'],['Y Min','y_min'],['X Max','x_max'],['Y Max','y_max']]

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /><div>{children}</div>
    </div>
  )
}

export function SpawnManagerPanel() {
  const [spawns,     setSpawns]     = useState<Spawn[]>([])
  const [maps,       setMaps]       = useState<GameMap[]>([])
  const [npcs,       setNpcs]       = useState<NPC[]>([])
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState<Partial<Spawn> | null>(null)
  const [enc,        setEnc]        = useState<EncEntry[]>([])
  const [addNpcId,   setAddNpcId]   = useState(0)
  const [addWeight,  setAddWeight]  = useState(50)

  const load = useCallback(async () => {
    setLoading(true)
    const [sr, mr, nr] = await Promise.all([
      adminApi.entity.getAll('spawn'),
      adminApi.entity.getAll('map'),
      adminApi.entity.getAll('npc'),
    ])
    setSpawns((sr.data || []) as Spawn[])
    setMaps((mr.data || []) as GameMap[])
    setNpcs((nr.data || []) as NPC[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const enemies = npcs.filter((n: NPC) => n.is_enemy)

  const openEdit = (s?: Spawn) => {
    setEditing(s ? { ...s } : {
      name: 'Encounter Zone', map_id: maps[0]?.id || 0, enabled: 1,
      x_min: 0, y_min: 0, x_max: 19, y_max: 19,
      encounter_rate: 10, min_level: 1, max_level: 50,
      required_flag: null, world_flag_conditions: null, encounter_table: '[]',
    })
    try {
      const parsed = JSON.parse(s?.encounter_table || '[]')
      setEnc(Array.isArray(parsed) ? parsed as EncEntry[] : [])
    } catch { setEnc([]); console.warn('[Spawn] Invalid encounter_table JSON for spawn', s?.id) }
    setAddNpcId(enemies[0]?.id || 0)
  }

  const save = async () => {
    if (!editing) return
    const payload = { ...editing, encounter_table: JSON.stringify(enc) }
    const res = await adminApi.entity.save('spawn', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number) => {
    if (!confirm('Delete zone?')) return
    await adminApi.entity.delete('spawn', id); load()
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<Spawn> | null) => ({ ...prev, [k]: v }))

  const addEnc = () => {
    if (!addNpcId) return
    setEnc((prev: EncEntry[]) => [...prev, { npc_id: addNpcId, weight: addWeight }])
  }

  if (editing !== null) {
    const d = editing as Record<string, unknown>
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : 'New Spawn Zone'}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
        <Help>
          Define a rectangular zone on a map where random battles trigger as players walk through.
          <b> Encounter rate</b>: 10% = ~1 in 10 steps. Weight = relative spawn chance (higher = more common).
        </Help>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Map</label>
              <select value={Number(d.map_id) || 0} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('map_id', parseInt(e.target.value))}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                {maps.map((m: GameMap) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Zone Name</label>
              <Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {COORD_FIELDS.map(([l, k]: [string, CoordField]) => (
              <div key={k}>
                <label className="text-xs text-muted-foreground">{l}</label>
                <Input type="number" value={Number(d[k]) || 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(k, parseInt(e.target.value) || 0)}
                  className="mt-1 h-8 text-xs" />
              </div>
            ))}
          </div>
          {/* Visual Zone Preview */}
          {(() => {
            const map = maps.find((m: GameMap) => m.id === Number(d.map_id))
            if (!map) return null
            const mw = map.width || 20, mh = map.height || 20
            const cellSize = Math.max(4, Math.min(12, 240 / Math.max(mw, mh)))
            const x1 = Number(d.x_min) || 0, y1 = Number(d.y_min) || 0
            const x2 = Number(d.x_max) || mw - 1, y2 = Number(d.y_max) || mh - 1
            return (
              <div className="p-3 bg-secondary/20 border border-border rounded-lg">
                <p className="text-[10px] text-muted-foreground mb-1">Zone preview on {map.name} ({mw}x{mh})</p>
                <svg width={mw * cellSize} height={mh * cellSize} className="border border-border/50 rounded">
                  <rect width={mw * cellSize} height={mh * cellSize} fill="#1a1a2e" />
                  {/* Grid lines */}
                  {Array.from({ length: mw + 1 }).map((_, x) => (
                    <line key={`v${x}`} x1={x * cellSize} y1={0} x2={x * cellSize} y2={mh * cellSize} stroke="#333" strokeWidth="0.5" />
                  ))}
                  {Array.from({ length: mh + 1 }).map((_, y) => (
                    <line key={`h${y}`} x1={0} y1={y * cellSize} x2={mw * cellSize} y2={y * cellSize} stroke="#333" strokeWidth="0.5" />
                  ))}
                  {/* Spawn zone highlight */}
                  <rect x={x1 * cellSize} y={y1 * cellSize}
                    width={(Math.min(x2, mw - 1) - x1 + 1) * cellSize}
                    height={(Math.min(y2, mh - 1) - y1 + 1) * cellSize}
                    fill="rgba(248,113,113,0.25)" stroke="#f87171" strokeWidth="1.5" strokeDasharray="3,2" />
                </svg>
                {x2 < x1 && <p className="text-[10px] text-red-400 mt-1">Warning: x_max is less than x_min</p>}
                {y2 < y1 && <p className="text-[10px] text-red-400 mt-1">Warning: y_max is less than y_min</p>}
              </div>
            )
          })()}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Encounter Rate %</label>
              <Input type="number" min={0} max={100} value={Number(d.encounter_rate) || 10}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('encounter_rate', parseInt(e.target.value) || 0)} className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-0.5">0=off · 10=~1/10 steps · 100=every step</p>
            </div>
            <div>
              <label className="text-sm font-medium">Min Level</label>
              <Input type="number" min={1} value={Number(d.min_level) || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('min_level', parseInt(e.target.value) || 1)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Max Level</label>
              <Input type="number" min={1} value={Number(d.max_level) || 50}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('max_level', parseInt(e.target.value) || 50)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Enabled</label>
              <select value={String(d.enabled || 1)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('enabled', parseInt(e.target.value))}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                <option value="1">Yes</option><option value="0">No</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Required Player Flag</label>
              <Input value={String(d.required_flag || '')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('required_flag', e.target.value || null)}
                placeholder="Personal quest flag (optional)" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">World Flag Conditions (JSON)</label>
            <textarea value={String(d.world_flag_conditions || '')}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('world_flag_conditions', e.target.value || null)}
              rows={2} placeholder='[{"flag":"war_started","op":"==","value":"true"}]'
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-xs font-mono resize-none" />
          </div>

          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">⚔️ Encounter Table</h3>
            <p className="text-xs text-muted-foreground mb-3">Only enemies (Is Enemy = checked) appear here. Weight = relative probability.</p>
            {enc.length === 0 ? (
              <p className="text-xs text-muted-foreground mb-3">No enemies added yet.</p>
            ) : (
              <table className="w-full text-xs mb-3">
                <thead><tr className="border-b border-border">
                  <th className="text-left pb-1 text-muted-foreground font-medium">NPC</th>
                  <th className="text-left pb-1 text-muted-foreground font-medium">Weight</th>
                  <th className="w-8" />
                </tr></thead>
                <tbody>
                  {enc.map((e: EncEntry, i: number) => {
                    const npc = enemies.find((n: NPC) => n.id === e.npc_id)
                    return (
                      <tr key={i} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5">{npc ? `${npc.icon || '👹'} ${npc.name}` : `#${e.npc_id}`}</td>
                        <td className="py-1.5">{e.weight}</td>
                        <td>
                          <Button size="sm" variant="ghost" className="text-destructive h-6 w-6 p-0"
                            onClick={() => setEnc((p: EncEntry[]) => p.filter((_: EncEntry, j: number) => j !== i))}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {enemies.length === 0 ? (
              <p className="text-xs text-yellow-500">No enemy NPCs yet — create some in NPC Editor with "Is Enemy" checked.</p>
            ) : (
              <div className="flex gap-2">
                <select value={addNpcId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddNpcId(parseInt(e.target.value))}
                  className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs">
                  {enemies.map((n: NPC) => <option key={n.id} value={n.id}>{n.icon || '👹'} {n.name}</option>)}
                </select>
                <Input type="number" value={addWeight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddWeight(parseInt(e.target.value) || 50)}
                  className="w-20 h-8 text-xs" placeholder="Weight" />
                <Button size="sm" onClick={addEnc}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">👹 Random Encounters</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{spawns.length} spawn zone{spawns.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Zone</Button>
      </div>
      <Help>Spawn zones define rectangular areas where random encounters trigger. Each zone has its own enemy pool and encounter rate. Only enemy NPCs (Is Enemy checked) can be added to encounter tables.</Help>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Map', 'Zone', 'Area', 'Rate', 'Levels', 'Enemies', 'On?', ''].map((h: string) => (
                  <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spawns.map((s: Spawn) => {
                const map = maps.find((m: GameMap) => m.id === s.map_id)
                let enemyCount = 0
                try { enemyCount = (JSON.parse(s.encounter_table || '[]') as EncEntry[]).length } catch {}
                return (
                  <tr key={s.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{map?.name || `#${s.map_id}`}</td>
                    <td className="py-2 pr-3 font-semibold">{s.name}</td>
                    <td className="py-2 pr-3"><code className="text-xs text-primary">({s.x_min},{s.y_min})→({s.x_max},{s.y_max})</code></td>
                    <td className="py-2 pr-3 text-xs">{s.encounter_rate}%</td>
                    <td className="py-2 pr-3 text-xs">{s.min_level}–{s.max_level}</td>
                    <td className="py-2 pr-3 text-xs">{enemyCount} types</td>
                    <td className="py-2 pr-3">
                      <Badge className={s.enabled ? 'bg-green-900/50 text-green-400' : 'bg-secondary text-muted-foreground'}>
                        {s.enabled ? 'ON' : 'OFF'}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {spawns.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">No spawn zones yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
