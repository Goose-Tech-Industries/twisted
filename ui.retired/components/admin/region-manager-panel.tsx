"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, ChevronLeft, X, Save } from "lucide-react"

interface Region {
  id: number; name: string; icon: string; description: string
  danger_level: number; corruption_level: number
  xp_mult: number; gold_mult: number; loot_mult: number
  spawn_rate_mult: number; shop_price_mult: number
  weather_override: string | null; faction_control: string | null
  pvp_enabled: boolean | number; is_sanctuary: boolean | number; is_active: boolean | number
  active_tags_json: string | null; auto_rules_json: string | null
}
interface GameMap { id: number; name: string; region_id: number | null }

const DANGER_COLORS: string[] = ['', '#0a0', '#aa0', '#f80', '#f00', '#a00']
const WEATHER_OPTS: string[]  = ['', 'CLEAR', 'RAIN', 'STORM', 'FOG', 'BLIZZARD', 'BLOOD_MOON']
const MULT_COLS: Array<[string, keyof Region, string]> = [
  ['XP',    'xp_mult',          '#0cf'],
  ['Gold',  'gold_mult',         '#ffd700'],
  ['Loot',  'loot_mult',         '#f0f'],
  ['Spawn', 'spawn_rate_mult',   '#f80'],
  ['Shop',  'shop_price_mult',   '#0a0'],
]
const SLIDER_FIELDS: Array<[string, keyof Region, string, number, number]> = [
  ['Danger Level (1–5)', 'danger_level',     '#f80', 1, 5],
  ['Corruption (0–5)',   'corruption_level', '#a0f', 0, 5],
]
const BOOL_FIELDS: Array<[keyof Region, string]> = [
  ['pvp_enabled',  '⚔️ PvP'],
  ['is_sanctuary', '🕊️ Sanctuary'],
  ['is_active',    '✅ Active'],
]

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /><div className="leading-relaxed">{children}</div>
    </div>
  )
}

export function RegionManagerPanel() {
  const [regions,   setRegions]   = useState<Region[]>([])
  const [maps,      setMaps]      = useState<GameMap[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState<Partial<Region> | null>(null)
  const [tags,      setTags]      = useState<string[]>([])
  const [tagInput,  setTagInput]  = useState('')
  const [autoRules, setAutoRules] = useState<unknown[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    const [rr, mr] = await Promise.all([adminApi.entity.getAll('region'), adminApi.entity.getAll('map')])
    setRegions((rr.data || []) as Region[])
    setMaps((mr.data || []) as GameMap[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openEdit = (r?: Region) => {
    setEditing(r ? { ...r } : {
      name: '', icon: '🗺️', description: '', danger_level: 1, corruption_level: 0,
      xp_mult: 1, gold_mult: 1, loot_mult: 1, spawn_rate_mult: 1, shop_price_mult: 1,
      weather_override: null, faction_control: null,
      pvp_enabled: false, is_sanctuary: false, is_active: true,
      active_tags_json: '[]', auto_rules_json: '[]',
    })
    try {
      const parsedTags = JSON.parse(r?.active_tags_json || '[]')
      setTags(Array.isArray(parsedTags) ? parsedTags : [])
    } catch { setTags([]); console.warn('[Region] Invalid tags JSON for region', r?.id) }
    try {
      const parsedRules = JSON.parse(r?.auto_rules_json || '[]')
      setAutoRules(Array.isArray(parsedRules) ? parsedRules : [])
    } catch { setAutoRules([]); console.warn('[Region] Invalid auto_rules JSON for region', r?.id) }
  }

  const save = async () => {
    if (!editing?.name?.trim()) return
    const payload = {
      ...editing,
      pvp_enabled:  editing.pvp_enabled  ? 1 : 0,
      is_sanctuary: editing.is_sanctuary ? 1 : 0,
      is_active:    editing.is_active    ? 1 : 0,
      active_tags_json: JSON.stringify(tags),
      auto_rules_json:  JSON.stringify(autoRules),
    }
    const res = await adminApi.entity.save('region', payload as Record<string, unknown>, editing.id)
    if (res.success) {
      await fetch('/admin/clear-cache', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reloadRegions: true }),
      }).catch(() => {})
      load(); setEditing(null)
    } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete region "${name}"? Maps assigned to it will become unassigned.`)) return
    await adminApi.entity.delete('region', id); load()
  }

  const assignMap = async (mapId: number, regionId: string) => {
    await adminApi.entity.save('map', { region_id: parseInt(regionId) || null } as Record<string, unknown>, mapId)
    setMaps((prev: GameMap[]) => prev.map((m: GameMap) =>
      m.id === mapId ? { ...m, region_id: parseInt(regionId) || null } : m
    ))
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<Region> | null) => ({ ...prev, [k]: v }))

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !tags.includes(v)) { setTags((p: string[]) => [...p, v]); setTagInput('') }
  }

  const d = editing as Record<string, unknown> | null

  if (editing !== null && d) return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '+ New Region'}</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={save}><Save className="w-4 h-4 mr-1" />Save</Button>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Icon</label>
            <Input value={String(d.icon || '🗺️')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)} className="mt-1 text-center text-xl" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <Input value={String(d.description || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('description', e.target.value)} className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {SLIDER_FIELDS.map(([label, key, color, min, max]: [string, keyof Region, string, number, number]) => (
            <div key={key}>
              <label className="text-sm font-medium">{label}</label>
              <div className="flex items-center gap-3 mt-1">
                <input type="range" min={min} max={max} value={Number(d[key]) || min}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(key, parseInt(e.target.value))}
                  className="flex-1" style={{ accentColor: color }} />
                <span className="font-mono text-sm w-4" style={{ color }}>{Number(d[key]) || min}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">📊 Multipliers</h3>
          <div className="grid grid-cols-5 gap-2">
            {MULT_COLS.map(([label, key, color]: [string, keyof Region, string]) => (
              <div key={key}>
                <label className="text-xs font-medium block mb-1" style={{ color }}>{label}</label>
                <Input type="number" step={0.05} min={0.1} max={10} value={Number(d[key]) || 1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(key, parseFloat(e.target.value) || 1)}
                  className="h-8 text-xs text-center" style={{ color }} />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Weather Override</label>
            <select value={String(d.weather_override || '')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('weather_override', e.target.value || null)}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
              {WEATHER_OPTS.map((w: string) => <option key={w} value={w}>{w || '— None —'}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Faction Control</label>
            <Input value={String(d.faction_control || '')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('faction_control', e.target.value || null)}
              placeholder="e.g. undead" className="mt-1" />
          </div>
          <div className="flex flex-col gap-2 justify-end pb-1">
            {BOOL_FIELDS.map(([k, l]: [keyof Region, string]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!d[k]}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(k, e.target.checked)} className="w-4 h-4" />
                {l}
              </label>
            ))}
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">🏷️ Active Tags</h3>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {tags.length === 0
              ? <span className="text-xs text-muted-foreground">No tags</span>
              : tags.map((t: string, i: number) => (
                <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-secondary border border-border rounded-full text-xs">
                  {t}
                  <button onClick={() => setTags((p: string[]) => p.filter((_: string, j: number) => j !== i))}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
          </div>
          <div className="flex gap-2">
            <Input value={tagInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTagInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') addTag() }}
              placeholder="e.g. siege, festival" className="flex-1 h-8 text-xs" />
            <Button size="sm" variant="outline" onClick={addTag}><Plus className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🤖 Auto-Rules</h3>
              <p className="text-xs text-muted-foreground mt-0.5">World flag triggers that override region state.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() =>
              setAutoRules((p: unknown[]) => [...p, { conditions: [{ flag: 'blood_moon', op: '==', value: 'true' }], apply: { danger_level: 4, weather_override: 'BLOOD_MOON' } }])}>
              <Plus className="w-3.5 h-3.5 mr-1" />Add
            </Button>
          </div>
          {autoRules.length === 0 && <p className="text-xs text-muted-foreground">No auto-rules. Add one to make regions react to world flags.</p>}
          {autoRules.map((rule: unknown, i: number) => {
            const r = rule as Record<string, unknown>
            const conditions = Array.isArray(r.conditions) ? r.conditions as Array<Record<string, string>> : []
            const apply = (r.apply || {}) as Record<string, unknown>
            const updateRule = (updated: Record<string, unknown>) => {
              const p = [...autoRules]; p[i] = updated; setAutoRules(p)
            }
            const updateCondition = (ci: number, field: string, value: string) => {
              const newConds = [...conditions]; newConds[ci] = { ...newConds[ci], [field]: value }
              updateRule({ ...r, conditions: newConds })
            }
            const addCondition = () => updateRule({ ...r, conditions: [...conditions, { flag: '', op: '==', value: 'true' }] })
            const removeCondition = (ci: number) => updateRule({ ...r, conditions: conditions.filter((_: unknown, j: number) => j !== ci) })
            const setApplyField = (k: string, v: unknown) => updateRule({ ...r, apply: { ...apply, [k]: v } })

            return (
              <div key={i} className="p-3 bg-secondary/30 border border-border rounded-lg mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-purple-400">Rule {i + 1}</span>
                  <Button size="sm" variant="ghost" className="text-destructive h-6 w-6 p-0"
                    onClick={() => setAutoRules((p: unknown[]) => p.filter((_: unknown, j: number) => j !== i))}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>

                {/* Conditions */}
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">When:</p>
                {conditions.map((c, ci) => (
                  <div key={ci} className="flex items-center gap-1 mb-1">
                    <Input value={c.flag || ''} onChange={e => updateCondition(ci, 'flag', e.target.value)}
                      placeholder="flag_key" className="h-7 text-[11px] flex-1" />
                    <select value={c.op || '=='} onChange={e => updateCondition(ci, 'op', e.target.value)}
                      className="h-7 text-[11px] bg-input border border-border rounded px-1">
                      <option value="==">==</option><option value="!=">!=</option>
                      <option value=">">&gt;</option><option value="<">&lt;</option>
                      <option value=">=">&gt;=</option><option value="<=">&lt;=</option>
                    </select>
                    <Input value={c.value || ''} onChange={e => updateCondition(ci, 'value', e.target.value)}
                      placeholder="value" className="h-7 text-[11px] w-20" />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => removeCondition(ci)}>
                      <Trash2 className="w-2.5 h-2.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-muted-foreground" onClick={addCondition}>
                  + Add condition
                </Button>

                {/* Apply */}
                <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1 mt-2">Then apply:</p>
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Danger Level</label>
                    <Input type="number" value={Number(apply.danger_level) || ''} onChange={e => setApplyField('danger_level', parseInt(e.target.value) || 0)}
                      className="h-7 text-[11px]" placeholder="1-5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Weather Override</label>
                    <Input value={String(apply.weather_override || '')} onChange={e => setApplyField('weather_override', e.target.value || null)}
                      className="h-7 text-[11px]" placeholder="BLOOD_MOON" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">XP Mult</label>
                    <Input type="number" step="0.1" value={Number(apply.xp_mult) || ''} onChange={e => setApplyField('xp_mult', parseFloat(e.target.value) || null)}
                      className="h-7 text-[11px]" placeholder="1.5" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Spawn Mult</label>
                    <Input type="number" step="0.1" value={Number(apply.spawn_mult) || ''} onChange={e => setApplyField('spawn_mult', parseFloat(e.target.value) || null)}
                      className="h-7 text-[11px]" placeholder="2.0" />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🗺️ Regions</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{regions.length} region{regions.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Region</Button>
      </div>
      <Help>Regions set local rules for maps: XP/gold/loot multipliers, danger, weather, PvP. Auto-rules react to world flags automatically. Assign maps to regions in the table below.</Help>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (<>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          {regions.map((r: Region) => {
            const danger = r.danger_level || 1
            const rMaps = maps.filter((m: GameMap) => m.region_id === r.id)
            return (
              <div key={r.id} className="p-4 bg-card border border-border rounded-lg">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl">{r.icon || '🗺️'}</span>
                    <span className="font-bold text-primary">{r.name}</span>
                    <Badge className="text-[10px] py-0" style={{ background: DANGER_COLORS[Math.min(danger, 5)], color: '#fff' }}>⚠️ {danger}/5</Badge>
                    {r.is_sanctuary && <Badge variant="outline" className="text-[10px] py-0">🕊️</Badge>}
                    {r.pvp_enabled  && <Badge variant="destructive" className="text-[10px] py-0">⚔️ PvP</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(r.id, r.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                {r.description && <p className="text-xs text-muted-foreground mb-2">{r.description}</p>}
                <div className="grid grid-cols-5 gap-1 mb-2">
                  {MULT_COLS.map(([label, key, color]: [string, keyof Region, string]) => (
                    <div key={key} className="p-1.5 bg-secondary/30 rounded text-center">
                      <div className="text-[9px] text-muted-foreground">{label}</div>
                      <div className="text-xs font-mono" style={{ color }}>{Number(r[key]) || 1}×</div>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {rMaps.length} map{rMaps.length !== 1 ? 's' : ''}: {rMaps.map((m: GameMap) => m.name).join(', ') || '—'}
                </div>
              </div>
            )
          })}
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-bold mb-1">🗺️ Map → Region Assignment</h3>
          <p className="text-xs text-muted-foreground mb-3">Assign maps to regions. Changes apply immediately.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Map', 'Current Region', 'Assign'].map((h: string) => (
                  <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maps.map((m: GameMap) => (
                <tr key={m.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-4"><b>{m.name}</b> <span className="text-muted-foreground text-xs">#{m.id}</span></td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {regions.find((r: Region) => r.id === m.region_id)?.name || '—'}
                  </td>
                  <td className="py-2">
                    <select value={m.region_id || ''}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => assignMap(m.id, e.target.value)}
                      className="px-2 py-1 bg-input border border-border rounded text-xs">
                      <option value="">— None —</option>
                      {regions.map((r: Region) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>)}
    </div>
  )
}
