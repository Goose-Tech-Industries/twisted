"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { GameMap, MapEvent, MapObject, ModalState } from "./map-manager-panel"

// ── Generic Modal Shell ──────────────────────────────────────────
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <h3 className="text-base font-bold text-primary mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ── Teleport Modal ───────────────────────────────────────────────
export function TeleportModal({ modal, maps, existing, onPlace, onClose }: { modal: ModalState; maps: GameMap[]; existing: MapEvent|null; onPlace: (e:MapEvent)=>void; onClose:()=>void }) {
  const parts = existing ? String(existing.data).split(',') : ['','0','0']
  const [mapId, setMapId] = useState(parts[0] || '')
  const [tx, setTx]       = useState(parseInt(parts[1])||0)
  const [ty, setTy]       = useState(parseInt(parts[2])||0)
  return (
    <Modal title={`🚪 Teleport at (${modal.x}, ${modal.y})`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">Player steps here → teleported to selected map at coordinates.</p>
      <label className="text-xs text-muted-foreground block mb-1">Destination Map</label>
      <select value={mapId} onChange={e => setMapId(e.target.value)}
        className="w-full px-3 py-2 bg-input border border-border rounded text-sm mb-3">
        <option value="">— Select map —</option>
        {maps.map(m => <option key={m.id} value={m.id}>{m.name} ({m.width}×{m.height})</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div><label className="text-xs text-muted-foreground">Dest X</label><Input type="number" value={tx} onChange={e=>setTx(parseInt(e.target.value)||0)} className="mt-1 h-8" /></div>
        <div><label className="text-xs text-muted-foreground">Dest Y</label><Input type="number" value={ty} onChange={e=>setTy(parseInt(e.target.value)||0)} className="mt-1 h-8" /></div>
      </div>
      <p className="text-[10px] text-muted-foreground mb-4">💡 Open the destination map to find the right coordinates.</p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!mapId} onClick={() => onPlace({ x:modal.x, y:modal.y, type:'TELEPORT', data:`${mapId},${tx},${ty}` })}>Place Teleport</Button>
      </div>
    </Modal>
  )
}

// ── Terrain Modal ────────────────────────────────────────────────
export function TerrainModal({ modal, existing, terrainTypes, onPlace, onRemove, onClose }: { modal:ModalState; existing:MapEvent|null; terrainTypes:Array<{id:string;label:string;icon:string;desc:string}>; onPlace:(e:MapEvent)=>void; onRemove:()=>void; onClose:()=>void }) {
  const [sel, setSel] = useState(existing?.terrain || terrainTypes[0]?.id || 'forest')
  return (
    <Modal title={`🌿 Terrain at (${modal.x}, ${modal.y})`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">Terrain affects combat on the tactical grid. Types are managed in Battle Config → Terrain.</p>
      <div className="space-y-2 mb-4 max-h-[400px] overflow-y-auto">
        {terrainTypes.map(t => (
          <label key={t.id} className={cn("flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors", sel===t.id ? 'bg-purple-900/20 border-purple-700' : 'border-border hover:bg-card')}>
            <input type="radio" name="terrain" value={t.id} checked={sel===t.id} onChange={()=>setSel(t.id)} className="w-4 h-4" />
            <span className="text-lg">{t.icon}</span>
            <div><div className="text-sm font-medium">{t.label}</div><div className="text-xs text-muted-foreground">{t.desc}</div></div>
          </label>
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        {existing && <Button variant="destructive" onClick={onRemove}>Remove</Button>}
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { const t=terrainTypes.find(x=>x.id===sel); if(t) onPlace({ x:modal.x, y:modal.y, type:'TERRAIN', terrain:t.id, data:t.label }) }}>Place Terrain</Button>
      </div>
    </Modal>
  )
}

// ── Object Flags Modal ───────────────────────────────────────────
const BATTLE_DESTROY_TYPES = [
  { value: '', label: 'None (not destructible)' },
  { value: 'fire_aoe', label: 'Fire AoE (explosion)' },
  { value: 'crush', label: 'Crush (damage on tile)' },
  { value: 'remove_cover', label: 'Remove Cover (just breaks)' },
]

export function ObjectFlagsModal({ obj, x, y, onSave, onClose }: { obj:MapObject; x:number; y:number; onSave:(flagKey:string|null,r?:number,battleProps?:Partial<MapObject>)=>void; onClose:()=>void }) {
  const [flagKey, setFlagKey]   = useState(obj.flagKey || '')
  const [radius, setRadius]     = useState(obj.light?.radius || 3)
  const isLight = obj.type === 'LIGHT'
  const isDestructible = ['BARREL','CRATE','CHANDELIER','POT','TORCH','BOULDER'].includes(obj.preset?.toUpperCase() || '')

  const [battleHp, setBattleHp] = useState(obj.battle_hp ?? '')
  const [destroyType, setDestroyType] = useState(obj.battle_destroy_type || '')
  const [destroyDmg, setDestroyDmg] = useState(obj.battle_destroy_damage ?? '')
  const [destroyRadius, setDestroyRadius] = useState(obj.battle_destroy_radius ?? '')
  const [coverValue, setCoverValue] = useState(obj.battle_cover_value ?? '')

  return (
    <Modal title={`${obj.icon} ${obj.label} at (${x}, ${y})`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">Edit this object's world flag link{isLight?' and light settings':''}.</p>
      <label className="text-xs text-muted-foreground block mb-1">Flag Key <span className="text-muted-foreground/60">(leave blank = always visible)</span></label>
      <Input value={flagKey} onChange={e=>setFlagKey(e.target.value)} placeholder={`e.g. lantern_${x}_${y}`} className="mb-1" />
      <p className="text-[10px] text-muted-foreground mb-3">To toggle: add a SCRIPT event → SET_MAP_FLAG {"{"} key: &quot;{flagKey||`lantern_${x}_${y}`}&quot;, value: false {"}"}</p>
      {isLight && (
        <div className="mb-3"><label className="text-xs text-muted-foreground block mb-1">Light Radius (tiles)</label>
        <Input type="number" value={radius} step={0.5} min={0.5} max={20} onChange={e=>setRadius(parseFloat(e.target.value)||3)} className="w-24" /></div>
      )}

      {/* Battle Object Properties */}
      {(isDestructible || obj.blocking) && (
        <div className="border-t border-border pt-3 mt-3">
          <p className="text-xs font-medium mb-2">Battle Grid Properties</p>
          <p className="text-[10px] text-muted-foreground mb-2">Custom overrides for when this object appears on a battle grid. Leave blank to use defaults.</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Battle HP</label>
              <Input type="number" value={battleHp} min={1} max={999} onChange={e=>setBattleHp(e.target.value ? parseInt(e.target.value) : '')} placeholder="Default" className="h-7 text-xs" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Cover Value %</label>
              <Input type="number" value={coverValue} min={0} max={100} onChange={e=>setCoverValue(e.target.value ? parseInt(e.target.value) : '')} placeholder="Default" className="h-7 text-xs" />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-muted-foreground block mb-0.5">On Destroy Effect</label>
              <select value={destroyType} onChange={e=>setDestroyType(e.target.value)} className="w-full h-7 text-xs rounded border border-border bg-background px-2">
                {BATTLE_DESTROY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {(destroyType === 'fire_aoe' || destroyType === 'crush') && (
              <>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Destroy Damage</label>
                  <Input type="number" value={destroyDmg} min={0} max={999} onChange={e=>setDestroyDmg(e.target.value ? parseInt(e.target.value) : '')} placeholder="Default" className="h-7 text-xs" />
                </div>
                {destroyType === 'fire_aoe' && (
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">AoE Radius</label>
                    <Input type="number" value={destroyRadius} min={0} max={5} onChange={e=>setDestroyRadius(e.target.value ? parseInt(e.target.value) : '')} placeholder="Default" className="h-7 text-xs" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end mt-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSave(flagKey||null, isLight?radius:undefined, {
          battle_hp: battleHp ? Number(battleHp) : null,
          battle_destroy_type: destroyType || null,
          battle_destroy_damage: destroyDmg ? Number(destroyDmg) : null,
          battle_destroy_radius: destroyRadius ? Number(destroyRadius) : null,
          battle_cover_value: coverValue ? Number(coverValue) : null,
        })}>Save</Button>
      </div>
    </Modal>
  )
}
