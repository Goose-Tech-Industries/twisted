"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2, Info, Store, ChevronLeft, Pencil, Globe, Save } from "lucide-react"

interface Shop { id: number; name: string; description: string; shop_type: string; npc_id: number; location_map_id: number }
interface Item { id: number; name: string; icon: string; type: string; value: number }
interface Supply {
  id: number; shop_id: number; item_id: number
  buy_price: number; sell_price: number; stock: number
  world_flag_conditions: string | null; flag_price_modifiers: string | null
}

type View = 'picker' | 'inventory' | 'edit-shop' | 'flags'

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

// ── Flags editor ──────────────────────────────────────────────────
function FlagsEditor({ supply, onBack }: { supply: Supply; onBack: () => void }) {
  const [conds, setConds] = useState<Array<{flag:string;op:string;value:string}>>([])
  const [mods, setMods] = useState<Array<{flag:string;multiplier:number}>>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    try { setConds(JSON.parse(supply.world_flag_conditions || '[]')) } catch { setConds([]) }
    try { setMods(JSON.parse(supply.flag_price_modifiers || '[]')) } catch { setMods([]) }
  }, [supply])

  const save = async () => {
    setSaving(true)
    await adminApi.entity.save('shop_supply', {
      world_flag_conditions: conds.length ? JSON.stringify(conds) : null,
      flag_price_modifiers:  mods.length  ? JSON.stringify(mods)  : null,
    }, supply.id)
    setSaving(false)
    onBack()
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="w-4 h-4" /></Button>
        <h2 className="text-lg font-bold">🌍 World Flag Rules — Supply #{supply.id}</h2>
      </div>
      <Help>
        <b>Show Conditions</b>: this item only appears in the shop when ALL conditions are true.
        Leave empty for the item to always appear.<br/>
        <b>Price Modifiers</b>: multiplies the buy price when the flag is active.
        Example: flag <code>festival_active</code> × 0.8 = 20% discount during festivals.
      </Help>
      <div className="space-y-6">
        {/* Conditions */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-purple-400">🌍 Show Conditions</h3>
            <Button size="sm" variant="outline" onClick={() => setConds(p => [...p, {flag:'',op:'==',value:'true'}])}>
              <Plus className="w-3.5 h-3.5 mr-1" />Add
            </Button>
          </div>
          {conds.length === 0 && <p className="text-xs text-muted-foreground">No conditions — item always visible.</p>}
          {conds.map((c, i) => (
            <div key={i} className="flex gap-2 items-center mb-2">
              <Input value={c.flag} onChange={e => setConds(p => p.map((x,j) => j===i ? {...x,flag:e.target.value} : x))}
                placeholder="flag key" className="flex-1 h-8 text-xs" />
              <select value={c.op} onChange={e => setConds(p => p.map((x,j) => j===i ? {...x,op:e.target.value} : x))}
                className="px-2 py-1 bg-input border border-border rounded text-xs">
                {['==','!=','>','<','>=','<='].map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              <Input value={c.value} onChange={e => setConds(p => p.map((x,j) => j===i ? {...x,value:e.target.value} : x))}
                placeholder="value" className="w-24 h-8 text-xs" />
              <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0"
                onClick={() => setConds(p => p.filter((_,j) => j!==i))}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
        {/* Modifiers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-yellow-400">💰 Price Modifiers</h3>
            <Button size="sm" variant="outline" onClick={() => setMods(p => [...p, {flag:'',multiplier:0.8}])}>
              <Plus className="w-3.5 h-3.5 mr-1" />Add
            </Button>
          </div>
          {mods.length === 0 && <p className="text-xs text-muted-foreground">No price modifiers.</p>}
          {mods.map((m, i) => (
            <div key={i} className="flex gap-2 items-center mb-2">
              <Input value={m.flag} onChange={e => setMods(p => p.map((x,j) => j===i ? {...x,flag:e.target.value} : x))}
                placeholder="flag key" className="flex-1 h-8 text-xs" />
              <span className="text-muted-foreground text-sm">×</span>
              <Input type="number" value={m.multiplier} step={0.05} min={0.1} max={10}
                onChange={e => setMods(p => p.map((x,j) => j===i ? {...x,multiplier:parseFloat(e.target.value)||1} : x))}
                className="w-20 h-8 text-xs" />
              <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0"
                onClick={() => setMods(p => p.filter((_,j) => j!==i))}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving}><Save className="w-4 h-4 mr-1" />Save Rules</Button>
          <Button variant="outline" onClick={onBack}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────
export function ShopSupplyPanel() {
  const [shops, setShops] = useState<Shop[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('picker')
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null)
  const [editingShop, setEditingShop] = useState<Partial<Shop>>({})
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null)

  // New item row
  const [newItemId, setNewItemId] = useState(0)
  const [newBuy, setNewBuy] = useState(100)
  const [newSell, setNewSell] = useState(25)
  const [newStock, setNewStock] = useState(-1)

  const load = useCallback(async () => {
    setLoading(true)
    const [sr, ir, sup] = await Promise.all([
      adminApi.entity.getAll('shop'),
      adminApi.entity.getAll('item'),
      adminApi.entity.getAll('shop_supply'),
    ])
    setShops((sr.data || []) as Shop[])
    setItems((ir.data || []) as Item[])
    setSupplies((sup.data || []) as Supply[])
    if (ir.data?.length) setNewItemId((ir.data[0] as Item).id)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const itemMap = Object.fromEntries(items.map(i => [i.id, i]))

  const addItem = async () => {
    if (!selectedShop) return
    await adminApi.entity.save('shop_supply', {
      shop_id: selectedShop.id, item_id: newItemId,
      buy_price: newBuy, sell_price: newSell, stock: newStock
    } as Record<string,unknown>)
    const r = await adminApi.entity.getAll('shop_supply')
    setSupplies((r.data || []) as Supply[])
  }

  const removeItem = async (id: number) => {
    await adminApi.entity.delete('shop_supply', id)
    setSupplies(prev => prev.filter(s => s.id !== id))
  }

  const updatePrice = async (id: number, field: string, val: number) => {
    await adminApi.entity.save('shop_supply', { [field]: val } as Record<string,unknown>, id)
    setSupplies(prev => prev.map(s => s.id === id ? { ...s, [field]: val } : s))
  }

  const saveShop = async () => {
    if (!editingShop.name?.trim()) { alert('Name is required.'); return }
    if (editingShop.id) {
      await adminApi.entity.save('shop', { name: editingShop.name, description: editingShop.description, location_map_id: editingShop.location_map_id || null } as Record<string,unknown>, editingShop.id)
    } else {
      await adminApi.entity.save('shop', { name: editingShop.name, description: editingShop.description || '' } as Record<string,unknown>)
    }
    await load()
    setView('picker')
  }

  const deleteShop = async (id: number) => {
    if (!confirm('Delete this shop and all its inventory listings?')) return
    await adminApi.entity.delete('shop', id)
    await load()
    setView('picker')
  }

  if (loading) return <div className="text-center py-12 text-muted-foreground">Loading…</div>

  // ── Flags editor view ──────────────────────────────────────────
  if (view === 'flags' && selectedSupply) {
    return <FlagsEditor supply={selectedSupply} onBack={() => { setView('inventory'); setSelectedSupply(null) }} />
  }

  // ── Inventory view ─────────────────────────────────────────────
  if (view === 'inventory' && selectedShop) {
    const shopSupplies = supplies.filter(s => s.shop_id === selectedShop.id)
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setView('picker')}><ChevronLeft className="w-4 h-4" /></Button>
          <div>
            <h2 className="text-xl font-bold">🏪 {selectedShop.name}</h2>
            <p className="text-xs text-muted-foreground">{shopSupplies.length} items in stock</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setEditingShop({ ...selectedShop }); setView('edit-shop') }}>
              <Pencil className="w-3.5 h-3.5 mr-1" />Edit Shop
            </Button>
            <Button size="sm" variant="destructive" onClick={() => deleteShop(selectedShop.id)}>Delete</Button>
          </div>
        </div>

        <Help>
          Stock of <b>-1</b> means unlimited. Stock depletes as players buy — use the Scheduler to auto-restock.
          <b> Buy Price</b> = what players pay. <b>Sell Price</b> = what players get when selling back.
          Click <Globe className="w-3 h-3 inline" /> to set world flag conditions or dynamic pricing.
        </Help>

        {/* Add item row */}
        <div className="p-4 bg-card border border-border rounded-lg mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Add Item to Shop</h3>
          <div className="flex gap-2 flex-wrap items-end">
            <div className="flex-1 min-w-36">
              <label className="text-xs text-muted-foreground">Item</label>
              <select value={newItemId} onChange={e => setNewItemId(parseInt(e.target.value))}
                className="mt-1 w-full px-2 py-1.5 bg-input border border-border rounded text-xs">
                {items.map(i => <option key={i.id} value={i.id}>{i.icon || '📦'} {i.name} ({i.type})</option>)}
              </select>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Buy Price</label>
              <Input type="number" value={newBuy} onChange={e => setNewBuy(parseInt(e.target.value)||0)} className="mt-1 h-8 text-xs" />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Sell Price</label>
              <Input type="number" value={newSell} onChange={e => setNewSell(parseInt(e.target.value)||0)} className="mt-1 h-8 text-xs" />
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Stock (-1=∞)</label>
              <Input type="number" value={newStock} onChange={e => setNewStock(parseInt(e.target.value))} className="mt-1 h-8 text-xs" />
            </div>
            <Button size="sm" onClick={addItem}><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
          </div>
        </div>

        {/* Supply table */}
        {shopSupplies.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No items yet — add one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Item</th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Type</th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium w-24">Buy</th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium w-24">Sell</th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Stock</th>
                  <th className="text-left pb-2 text-xs text-muted-foreground font-medium">Flags</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {shopSupplies.map(s => {
                  const item = itemMap[s.item_id]
                  const hasCond = s.world_flag_conditions && s.world_flag_conditions !== 'null'
                  const hasMod  = s.flag_price_modifiers  && s.flag_price_modifiers  !== 'null'
                  return (
                    <tr key={s.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-2">
                        <span className="text-base mr-1.5">{item?.icon || '📦'}</span>
                        <b>{item?.name || `#${s.item_id}`}</b>
                      </td>
                      <td className="py-2 pr-2 text-xs text-muted-foreground">{item?.type || '—'}</td>
                      <td className="py-2 pr-2">
                        <Input type="number" defaultValue={s.buy_price}
                          onBlur={e => updatePrice(s.id, 'buy_price', parseInt(e.target.value)||0)}
                          className="w-20 h-7 text-xs" />
                      </td>
                      <td className="py-2 pr-2">
                        <Input type="number" defaultValue={s.sell_price || 0}
                          onBlur={e => updatePrice(s.id, 'sell_price', parseInt(e.target.value)||0)}
                          className="w-20 h-7 text-xs" />
                      </td>
                      <td className="py-2 pr-2 text-xs">{s.stock < 0 ? '∞' : s.stock}</td>
                      <td className="py-2 pr-2">
                        <button onClick={() => { setSelectedSupply(s); setView('flags') }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          <Globe className="w-3.5 h-3.5" />
                          {hasCond && <Badge variant="secondary" className="text-[9px] py-0">COND</Badge>}
                          {hasMod  && <Badge variant="secondary" className="text-[9px] py-0 text-yellow-400">MOD</Badge>}
                        </button>
                      </td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0"
                          onClick={() => removeItem(s.id)}><Trash2 className="w-3 h-3" /></Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // ── Edit shop view ─────────────────────────────────────────────
  if (view === 'edit-shop') {
    return (
      <div className="p-6 max-w-md">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setView(editingShop.id ? 'inventory' : 'picker')}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold">{editingShop.id ? 'Edit Shop' : 'New Shop'}</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Shop Name</label>
            <Input value={editingShop.name || ''} onChange={e => setEditingShop(p => ({...p, name: e.target.value}))}
              placeholder="e.g. Blacksmith, The Healer's Hut" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <Input value={editingShop.description || ''} onChange={e => setEditingShop(p => ({...p, description: e.target.value}))}
              placeholder="e.g. Sells weapons and armor" className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Map ID (location)</label>
            <p className="text-xs text-muted-foreground mt-0.5">Which map this shop is on.</p>
            <Input type="number" value={editingShop.location_map_id || 0}
              onChange={e => setEditingShop(p => ({...p, location_map_id: parseInt(e.target.value)||0}))} className="mt-1" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={saveShop}>💾 Save</Button>
            <Button variant="outline" onClick={() => setView(editingShop.id ? 'inventory' : 'picker')}>Cancel</Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Shop picker ────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Store className="w-5 h-5" /> Shop Inventory</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{shops.length} shop{shops.length !== 1 ? 's' : ''} — click one to manage its stock</p>
        </div>
      </div>
      <Help>
        Click a shop to manage what it sells, at what price, and with how much stock.
        Stock depletes as players buy — set stock to <b>-1</b> for unlimited, or use the <b>Scheduler</b> to auto-restock daily.
        Each shop should be assigned an NPC in the <b>NPC Manager</b> so players can access it in-game.
      </Help>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {shops.map(s => {
          const count = supplies.filter(sup => sup.shop_id === s.id).length
          return (
            <button key={s.id} onClick={() => { setSelectedShop(s); setView('inventory') }}
              className="p-4 bg-card border border-border rounded-lg text-left hover:border-primary transition-colors group">
              <div className="text-base font-bold text-primary group-hover:text-primary/80">🏪 {s.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.description || 'No description'}</div>
              <div className="text-xs text-muted-foreground mt-2">{count} item{count !== 1 ? 's' : ''}</div>
            </button>
          )
        })}
        <button onClick={() => { setEditingShop({}); setView('edit-shop') }}
          className="p-4 bg-secondary/30 border-2 border-dashed border-border rounded-lg text-center hover:border-primary transition-colors text-muted-foreground flex items-center justify-content-center gap-2 justify-center">
          <Plus className="w-5 h-5" /> New Shop
        </button>
      </div>
    </div>
  )
}
