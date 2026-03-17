"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, ChevronLeft, Info } from "lucide-react"

interface Recipe {
  id: number; name: string; icon: string; category: string
  result_item_id: number; result_qty: number; level_req: number
  unlock_mode: string; skill_req: string | null; description: string
  ingredients_json: string; is_active: number
}
interface Item { id: number; name: string; icon: string; type: string }
interface Ing  { item_id: number; qty: number }

type ItemMap = Record<number, Item>

const CATEGORIES: string[] = ['WEAPON', 'ARMOR', 'POTION', 'FOOD', 'MISC']

function CraftHelp() {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div>
        <b>ALWAYS</b> = visible to all players immediately.{' '}
        <b>LEARNED</b> = hidden until discovered via event, shop, or admin command.
        All ingredients must be in the player's inventory to craft.
      </div>
    </div>
  )
}

export function CraftManagerPanel() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [items,   setItems]   = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Recipe> | null>(null)
  const [ings,    setIngs]    = useState<Ing[]>([])
  const [addItem, setAddItem] = useState(0)
  const [addQty,  setAddQty]  = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    const [rr, ir] = await Promise.all([adminApi.entity.getAll('craft_recipe'), adminApi.entity.getAll('item')])
    setRecipes((rr.data || []) as Recipe[])
    setItems((ir.data || []) as Item[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const itemMap: ItemMap = Object.fromEntries(items.map((i: Item) => [i.id, i]))

  const openEdit = (r?: Recipe) => {
    setEditing(r ? { ...r } : {
      name: '', icon: '🔨', category: 'MISC',
      result_item_id: items[0]?.id || 0, result_qty: 1, level_req: 1,
      unlock_mode: 'ALWAYS', skill_req: null, description: '',
      ingredients_json: '[]', is_active: 1,
    })
    try { setIngs((JSON.parse(r?.ingredients_json || '[]') as Ing[]).map((i: Ing) => ({ ...i }))) }
    catch { setIngs([]) }
    setAddItem(items[0]?.id || 0); setAddQty(1)
  }

  const save = async () => {
    if (!editing?.result_item_id) { alert('Choose a result item'); return }
    if (!ings.length) { alert('Add at least one ingredient'); return }
    const payload = { ...editing, ingredients_json: JSON.stringify(ings) }
    const res = await adminApi.entity.save('craft_recipe', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number) => {
    if (!confirm('Delete this recipe? Players who know it will lose access.')) return
    await adminApi.entity.delete('craft_recipe', id); load()
  }

  const setField = (k: string, v: unknown) =>
    setEditing((prev: Partial<Recipe> | null) => ({ ...prev, [k]: v }))

  const addIng = () => {
    if (!addItem) { alert('Select an item first'); return }
    if (ings.find((i: Ing) => i.item_id === addItem)) { alert('That item is already an ingredient'); return }
    setIngs((prev: Ing[]) => [...prev, { item_id: addItem, qty: addQty }])
  }

  if (editing !== null) {
    const d = editing as Record<string, unknown>
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '🔨 New Recipe'}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
        <CraftHelp />
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Recipe Name</label>
              <Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Icon</label>
              <Input value={String(d.icon || '🔨')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)} className="mt-1 text-center text-xl" />
            </div>
            <div>
              <label className="text-sm font-medium">Category</label>
              <select value={String(d.category || 'MISC')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('category', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                {CATEGORIES.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Result Item</label>
              <select value={String(d.result_item_id || '')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('result_item_id', parseInt(e.target.value))}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                <option value="">— choose —</option>
                {items.map((i: Item) => <option key={i.id} value={i.id}>{i.icon || '📦'} {i.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Result Qty</label>
              <Input type="number" min={1} value={Number(d.result_qty) || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('result_qty', parseInt(e.target.value) || 1)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Level Req</label>
              <Input type="number" min={1} value={Number(d.level_req) || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('level_req', parseInt(e.target.value) || 1)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Unlock Mode</label>
              <select value={String(d.unlock_mode || 'ALWAYS')} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('unlock_mode', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                <option value="ALWAYS">ALWAYS — visible to all players</option>
                <option value="LEARNED">LEARNED — must find/buy recipe first</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Skill Required</label>
              <Input value={String(d.skill_req || '')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('skill_req', e.target.value || null)}
                placeholder="e.g. Blacksmithing (optional)" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea value={String(d.description || '')}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField('description', e.target.value)}
              rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm resize-none" />
          </div>

          <div className="p-4 bg-card border border-border rounded-lg">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">🧪 Ingredients</h3>
            {ings.length === 0 && <p className="text-xs text-muted-foreground mb-3">No ingredients yet.</p>}
            {ings.map((ing: Ing, i: number) => {
              const it = itemMap[ing.item_id]
              return (
                <div key={i} className="flex items-center gap-3 p-2 bg-secondary/20 border border-border rounded-lg mb-2">
                  <span className="text-lg">{it?.icon || '📦'}</span>
                  <span className="flex-1 text-sm">{it?.name || `#${ing.item_id}`}</span>
                  <div>
                    <label className="text-[10px] text-muted-foreground">QTY</label>
                    <Input type="number" min={1} value={ing.qty}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setIngs((p: Ing[]) => p.map((x: Ing, j: number) => j === i ? { ...x, qty: parseInt(e.target.value) || 1 } : x))}
                      className="h-7 w-16 text-xs" />
                  </div>
                  <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0"
                    onClick={() => setIngs((p: Ing[]) => p.filter((_: Ing, j: number) => j !== i))}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )
            })}
            <div className="flex gap-2 mt-2">
              <select value={addItem} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAddItem(parseInt(e.target.value))}
                className="flex-1 px-2 py-1.5 bg-input border border-border rounded text-xs">
                {items.map((i: Item) => <option key={i.id} value={i.id}>{i.icon || '📦'} {i.name} [{i.type}]</option>)}
              </select>
              <Input type="number" min={1} value={addQty}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAddQty(parseInt(e.target.value) || 1)}
                className="w-16 h-8 text-xs" />
              <Button size="sm" onClick={addIng}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🔨 Crafting Recipes</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{recipes.length} recipe{recipes.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Recipe</Button>
      </div>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Recipe', 'Result', 'Ingredients', 'Level', 'Type', ''].map((h: string) => (
                  <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recipes.map((r: Recipe) => {
                const res = itemMap[r.result_item_id]
                let recipeIngs: Ing[] = []
                try { recipeIngs = JSON.parse(r.ingredients_json || '[]') as Ing[] } catch {}
                return (
                  <tr key={r.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-3"><b>{r.icon} {r.name}</b><div className="text-[10px] text-muted-foreground">{r.category}</div></td>
                    <td className="py-2 pr-3 text-xs">{res ? `${res.icon || '📦'} ${res.name} ×${r.result_qty}` : '—'}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {recipeIngs.map((i: Ing) => `${i.qty}× ${itemMap[i.item_id]?.name || '#' + i.item_id}`).join(', ') || '—'}
                    </td>
                    <td className="py-2 pr-3 text-xs text-center">{r.level_req}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={r.unlock_mode === 'LEARNED' ? 'secondary' : 'outline'} className="text-[10px] py-0">
                        {r.unlock_mode}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {recipes.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No recipes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
