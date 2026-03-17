"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, ChevronLeft, Info } from "lucide-react"

// ================================================================
// SHARED
// ================================================================
function fxPreview(fx: string): string {
  try {
    const e = (typeof fx === 'string' ? JSON.parse(fx) : (fx || {})) as Record<string, unknown>
    if (e.damage)    return `DMG: ${(e.damage as Record<string, unknown>).formula}`
    if (e.heal)      return `HEAL: ${(e.heal as Record<string, unknown>).formula}`
    if (e.flee)      return 'FLEE'
    if (e.open_menu) return `MENU → ${e.open_menu}`
    return Object.keys(e).join(', ') || '—'
  } catch { return '?' }
}

function EffectsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">Effects (JSON)</label>
      <p className="text-xs text-muted-foreground mb-2">
        e.g. <code className="text-green-400">{'{"damage":{"formula":"mo*2.5"}}'}</code> or{' '}
        <code className="text-green-400">{'{"heal":{"formula":"MAX"}}'}</code>
      </p>
      <textarea value={value} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        rows={5} className="w-full px-3 py-2 bg-input border border-border rounded text-xs font-mono resize-y" />
    </div>
  )
}

// ================================================================
// LIMIT BREAK PANEL
// ================================================================
interface LimitBreak {
  id: number; name: string; icon: string; class_id: number; break_level: number
  char_level_req: number; target_type: string; description: string; effects: string
}
interface GameClass { id: number; name: string }

const TARGET_TYPES: string[] = ['ENEMY', 'SELF', 'ALL']

export function LimitBreakPanel() {
  const [breaks,  setBreaks]  = useState<LimitBreak[]>([])
  const [classes, setClasses] = useState<GameClass[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<LimitBreak> | null>(null)
  const [fxJson,  setFxJson]  = useState('{}')

  const load = useCallback(async () => {
    setLoading(true)
    const [lr, cr] = await Promise.all([adminApi.entity.getAll('limit'), adminApi.entity.getAll('class')])
    setBreaks((lr.data || []) as LimitBreak[])
    setClasses((cr.data || []) as GameClass[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const classMap = Object.fromEntries(classes.map((c: GameClass) => [c.id, c.name]))

  const openEdit = (l?: LimitBreak) => {
    setEditing(l ? { ...l } : { name: '', icon: '💥', class_id: classes[0]?.id || 0, break_level: 1, char_level_req: 1, target_type: 'ENEMY', description: '', effects: '{}' })
    try { setFxJson(JSON.stringify(JSON.parse(l?.effects || '{}'), null, 2)) } catch { setFxJson('{}') }
  }

  const save = async () => {
    if (!editing?.name?.trim()) { alert('Name required'); return }
    try { JSON.parse(fxJson) } catch { alert('Invalid effects JSON'); return }
    const payload = { ...editing, effects: fxJson }
    const res = await adminApi.entity.save('limit', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number) => {
    if (!confirm('Delete this limit break?')) return
    await adminApi.entity.delete('limit', id); load()
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<LimitBreak> | null) => ({ ...prev, [k]: v }))
  const d = editing as Record<string, unknown> | null

  if (editing !== null && d) return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '💥 New Limit Break'}</h2>
        </div>
        <div className="flex gap-2"><Button onClick={save}>💾 Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-sm font-medium">Name</label><Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" /></div>
          <div><label className="text-sm font-medium">Icon</label><Input value={String(d.icon || '💥')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)} className="mt-1 text-center text-xl" /></div>
          <div>
            <label className="text-sm font-medium">Class</label>
            <select value={String(d.class_id || '')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('class_id', parseInt(e.target.value))}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
              {classes.map((c: GameClass) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-sm font-medium">Break Level (1–3)</label><Input type="number" min={1} max={3} value={Number(d.break_level) || 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('break_level', parseInt(e.target.value) || 1)} className="mt-1" /></div>
          <div><label className="text-sm font-medium">Char Level Req</label><Input type="number" min={1} value={Number(d.char_level_req) || 1} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('char_level_req', parseInt(e.target.value) || 1)} className="mt-1" /></div>
          <div>
            <label className="text-sm font-medium">Target</label>
            <select value={String(d.target_type || 'ENEMY')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('target_type', e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
              {TARGET_TYPES.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Description</label>
          <textarea value={String(d.description || '')} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('description', e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm resize-none" />
        </div>
        <EffectsEditor value={fxJson} onChange={setFxJson} />
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-xl font-bold">💥 Limit Breaks</h2><p className="text-sm text-muted-foreground mt-0.5">{breaks.length} defined</p></div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Limit Break</Button>
      </div>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">{['Icon', 'Name', 'Class', 'Break Lv', 'Char Lv', 'Effect', ''].map((h: string) => <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium pr-3">{h}</th>)}</tr></thead>
            <tbody>
              {breaks.sort((a: LimitBreak, b: LimitBreak) => a.class_id - b.class_id).map((l: LimitBreak) => (
                <tr key={l.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 text-xl">{l.icon || '💥'}</td>
                  <td className="py-2 pr-3 font-semibold">{l.name}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{classMap[l.class_id] || `#${l.class_id}`}</td>
                  <td className="py-2 pr-3 text-xs">Lv{l.break_level}</td>
                  <td className="py-2 pr-3 text-xs">{l.char_level_req}+</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{fxPreview(l.effects)}</td>
                  <td className="py-2"><div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(l)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(l.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                </tr>
              ))}
              {breaks.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No limit breaks yet. Create classes first.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ================================================================
// BATTLE CMD PANEL
// ================================================================
interface BattleCmd {
  id: number; name: string; icon: string; description: string
  target_type: string; display_order: number; is_default: boolean | number; effects: string
}

const CMD_TARGET_TYPES: string[] = ['SELF', 'ENEMY', 'SELF_OR_ENEMY', 'ALL', 'MENU', 'NONE']

export function BattleCmdPanel() {
  const [cmds,    setCmds]    = useState<BattleCmd[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<BattleCmd> | null>(null)
  const [fxJson,  setFxJson]  = useState('{}')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.entity.getAll('battle_cmd')
    setCmds((r.data || []) as BattleCmd[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openEdit = (c?: BattleCmd) => {
    setEditing(c ? { ...c } : { name: '', icon: '⚔️', description: '', target_type: 'ENEMY', display_order: 0, is_default: 1, effects: '{}' })
    try { setFxJson(JSON.stringify(JSON.parse(c?.effects || '{}'), null, 2)) } catch { setFxJson('{}') }
  }

  const save = async () => {
    if (!editing?.name?.trim()) { alert('Name required'); return }
    try { JSON.parse(fxJson) } catch { alert('Invalid effects JSON'); return }
    const payload = { ...editing, effects: fxJson, is_default: editing.is_default ? 1 : 0 }
    const res = await adminApi.entity.save('battle_cmd', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number) => {
    if (!confirm('Delete this command? Classes that reference it will lose it.')) return
    await adminApi.entity.delete('battle_cmd', id); load()
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<BattleCmd> | null) => ({ ...prev, [k]: v }))
  const d = editing as Record<string, unknown> | null

  if (editing !== null && d) return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '⚔️ New Battle Command'}</h2>
        </div>
        <div className="flex gap-2"><Button onClick={save}>💾 Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-sm font-medium">Name</label><Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" /></div>
          <div><label className="text-sm font-medium">Icon</label><Input value={String(d.icon || '⚔️')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)} className="mt-1 text-center text-xl" /></div>
        </div>
        <div><label className="text-sm font-medium">Description</label><Input value={String(d.description || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('description', e.target.value)} className="mt-1" /></div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium">Target Type</label>
            <select value={String(d.target_type || 'ENEMY')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('target_type', e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
              {CMD_TARGET_TYPES.map((t: string) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="text-sm font-medium">Display Order</label><Input type="number" min={0} value={Number(d.display_order) || 0} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('display_order', parseInt(e.target.value) || 0)} className="mt-1" /></div>
          <div>
            <label className="text-sm font-medium">Availability</label>
            <select value={String(d.is_default ? 1 : 0)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('is_default', parseInt(e.target.value))}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
              <option value="1">All Classes (default)</option>
              <option value="0">Class-specific only</option>
            </select>
          </div>
        </div>
        <EffectsEditor value={fxJson} onChange={setFxJson} />
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-xl font-bold">⚔️ Battle Commands</h2><p className="text-sm text-muted-foreground mt-0.5">{cmds.length} commands — sorted by display order</p></div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Command</Button>
      </div>
      <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div><b>Default</b> commands appear for all classes. <b>Class-specific</b> ones are assigned in the Class editor (Entity Manager → Classes → battle_cmds JSON). Display order controls menu position.</div>
      </div>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">{['#', 'Icon', 'Name', 'Target', 'Scope', 'Effect', ''].map((h: string) => <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium pr-3">{h}</th>)}</tr></thead>
            <tbody>
              {cmds.sort((a: BattleCmd, b: BattleCmd) => a.display_order - b.display_order).map((c: BattleCmd) => (
                <tr key={c.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{c.display_order}</td>
                  <td className="py-2 pr-3 text-xl">{c.icon || '⚔️'}</td>
                  <td className="py-2 pr-3"><b>{c.name}</b><div className="text-xs text-muted-foreground">{c.description}</div></td>
                  <td className="py-2 pr-3"><span className="text-xs px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded">{c.target_type}</span></td>
                  <td className="py-2 pr-3"><span className={`text-xs px-1.5 py-0.5 rounded ${c.is_default ? 'bg-green-900/40 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>{c.is_default ? '✔ All Classes' : 'Class-specific'}</span></td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{fxPreview(c.effects)}</td>
                  <td className="py-2"><div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div></td>
                </tr>
              ))}
              {cmds.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No commands yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
