"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeft, Plus, Trash2, Save, Search } from "lucide-react"

interface NPC  { id: number; name: string; icon: string; is_enemy: boolean | number; map_id: number; x: number; y: number; drop_table_json: string }
interface Item { id: number; name: string; icon: string; type: string }
interface Row  { item_id: number | null; chance: number; min_qty: number; max_qty: number; conditions?: unknown[] }

type ItemMap = Record<number, Item>

export function LootTablePanel() {
  const [enemies, setEnemies] = useState<NPC[]>([])
  const [items,   setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<NPC | null>(null)
  const [rows,    setRows]    = useState<Row[]>([])
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saveOk,  setSaveOk]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [nr, ir] = await Promise.all([adminApi.entity.getAll('npc'), adminApi.entity.getAll('item')])
    setEnemies(((nr.data || []) as NPC[]).filter((n: NPC) => n.is_enemy))
    setItems((ir.data || []) as Item[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openEdit = (npc: NPC) => {
    setEditing(npc)
    try { setRows((JSON.parse(npc.drop_table_json || '[]') as Row[]).map((r: Row) => ({ ...r }))) }
    catch { setRows([]) }
  }

  const save = async () => {
    if (!editing) return
    setSaving(true)
    const valid = rows.filter((r: Row) => r.item_id)
    if (valid.length !== rows.length && !confirm('Some rows have no item and will be removed. Continue?')) {
      setSaving(false); return
    }
    const payload: Row[] = valid.map((r: Row) => ({
      item_id:  parseInt(String(r.item_id)),
      chance:   Math.min(100, Math.max(1, parseFloat(String(r.chance)) || 50)),
      min_qty:  Math.max(1, parseInt(String(r.min_qty)) || 1),
      max_qty:  Math.max(parseInt(String(r.min_qty)) || 1, parseInt(String(r.max_qty)) || 1),
      ...(r.conditions?.length ? { conditions: r.conditions } : {}),
    }))
    const res = await adminApi.entity.save('npc', { drop_table_json: JSON.stringify(payload) }, editing.id)
    if (res.success) {
      setEditing((prev: NPC | null) => prev ? { ...prev, drop_table_json: JSON.stringify(payload) } : null)
      setRows(payload)
      setEnemies((prev: NPC[]) => prev.map((e: NPC) =>
        e.id === editing.id ? { ...e, drop_table_json: JSON.stringify(payload) } : e
      ))
      setSaveOk(true); setTimeout(() => setSaveOk(false), 2000)
    } else alert('Save failed: ' + String(res.message || 'Unknown error'))
    setSaving(false)
  }

  const itemMap: ItemMap = Object.fromEntries(items.map((i: Item) => [i.id, i]))
  const filtered = enemies.filter((e: NPC) => e.name.toLowerCase().includes(search.toLowerCase()))

  const updateRow = (i: number, k: string, v: unknown) =>
    setRows((prev: Row[]) => prev.map((r: Row, j: number) => j === i ? { ...r, [k]: v } : r))

  if (editing) {
    const total = rows.reduce((s: number, r: Row) => s + (parseFloat(String(r.chance)) || 0), 0)
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <span className="text-2xl">{editing.icon || '👹'}</span>{editing.name}
              </h2>
              <p className="text-xs text-muted-foreground">Loot Table Editor</p>
            </div>
          </div>
          <Button onClick={save} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />{saveOk ? '✅ Saved!' : saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        <div className="grid grid-cols-[2fr_1fr_80px_80px_36px] gap-2 px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Item</span><span>Chance %</span><span>Min Qty</span><span>Max Qty</span><span />
        </div>

        <div className="space-y-2 mb-4">
          {rows.length === 0 && <p className="text-center text-muted-foreground py-8">No drops. Click Add Drop below.</p>}
          {rows.map((r: Row, i: number) => {
            const pct = Math.min(100, parseFloat(String(r.chance)) || 0)
            const col = pct >= 60 ? '#3fb950' : pct >= 30 ? '#d29922' : '#f85149'
            return (
              <div key={i} className="grid grid-cols-[2fr_1fr_80px_80px_36px] gap-2 items-center p-3 bg-secondary/20 border border-border rounded-lg">
                <select value={String(r.item_id || '')}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateRow(i, 'item_id', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-2 py-1.5 bg-input border border-border rounded text-xs">
                  <option value="">— Pick an item —</option>
                  {items.map((it: Item) => <option key={it.id} value={it.id}>{it.icon || '📦'} {it.name}</option>)}
                </select>
                <div className="flex items-center gap-1.5">
                  <input type="range" min={1} max={100} value={pct}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(i, 'chance', parseInt(e.target.value))}
                    className="flex-1" style={{ accentColor: col }} />
                  <Input type="number" min={1} max={100} value={pct}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(i, 'chance', parseInt(e.target.value) || 1)}
                    className="w-14 h-7 text-xs text-center" style={{ color: col }} />
                </div>
                <Input type="number" min={1} max={99} value={r.min_qty || 1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(i, 'min_qty', parseInt(e.target.value) || 1)}
                  className="h-8 text-xs" />
                <Input type="number" min={1} max={99} value={r.max_qty || 1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRow(i, 'max_qty', parseInt(e.target.value) || 1)}
                  className="h-8 text-xs" />
                <button onClick={() => setRows((p: Row[]) => p.filter((_: Row, j: number) => j !== i))} className="text-destructive hover:text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>

        <Button variant="outline" onClick={() => setRows((p: Row[]) => [...p, { item_id: null, chance: 50, min_qty: 1, max_qty: 1 }])} className="w-full mb-6">
          <Plus className="w-4 h-4 mr-1" />Add Drop
        </Button>

        {rows.length > 0 && (
          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">📊 Drop Preview</h3>
            {rows.filter((r: Row) => r.item_id).map((r: Row, i: number) => {
              const item = itemMap[Number(r.item_id)]
              const pct = Math.min(100, parseFloat(String(r.chance)) || 0)
              const col = pct >= 60 ? '#3fb950' : pct >= 30 ? '#d29922' : '#f85149'
              return (
                <div key={i} className="mb-2">
                  <div className="flex justify-between text-xs mb-1">
                    <span>{item ? (item.icon || '📦') + ' ' + item.name : '❓ Unknown'}</span>
                    <span className="font-bold" style={{ color: col }}>
                      {pct}% <span className="font-normal text-muted-foreground">×{r.min_qty}{r.max_qty > r.min_qty ? '–' + r.max_qty : ''}</span>
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: '9999px' }} />
                  </div>
                </div>
              )
            })}
            {total > 100 && (
              <p className="text-xs text-yellow-500 mt-2">
                ⚠️ Total chance ({total.toFixed(0)}%) exceeds 100%. Each entry rolls independently — this is fine but worth knowing.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold">🎁 Loot Tables</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{enemies.length} enemies — click one to edit its drops</p>
      </div>
      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)} placeholder="Filter enemies…" className="pl-9" />
      </div>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {filtered.map((e: NPC) => {
            let drops = 0
            try { drops = (JSON.parse(e.drop_table_json || '[]') as unknown[]).length } catch {}
            return (
              <button key={e.id} onClick={() => openEdit(e)}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary transition-colors text-left">
                <span className="text-2xl">{e.icon || '👹'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{e.name}</div>
                  <div className="text-xs text-muted-foreground">Map {e.map_id} · ({e.x},{e.y})</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${drops > 0 ? 'bg-green-900/50 text-green-400' : 'bg-secondary text-muted-foreground'}`}>
                  {drops > 0 ? `${drops} drop${drops !== 1 ? 's' : ''}` : 'No drops'}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
