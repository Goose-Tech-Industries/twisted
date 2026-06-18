"use client"

import {
  useState, useEffect, useCallback
} from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Plus, Trash2, Info, Layers, Map as MapIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { generateDungeon, generateCave, generateMaze } from "./map-generator"
import MapEditorCanvas from "./map-editor-canvas"

// ── Constants ────────────────────────────────────────────────────
export const EDITOR_TILE = 20
export const PICKER_TILE = 32

// ── Types ────────────────────────────────────────────────────────
export interface GameMap {
  id: number; name: string; width: number; height: number
  tileset_url: string; ambient_dark: number; spawn_x: number; spawn_y: number
  region_id: number | null
  tiles_json: string; collisions_json: string; objects_json: string; anims_json: string
  parallax_url: string | null; parallax_speed_x: number; parallax_speed_y: number
  fog_of_war: boolean; fog_reveal_radius: number
  ambient_sound_url: string | null
  is_template: boolean; template_category: string | null
}
export interface MapEvent  { x: number; y: number; type: string; data?: string | number; terrain?: string; trigger?: string; conditions?: unknown[]; actions?: unknown[] }
export interface MapObject { x: number; y: number; preset: string; icon: string; label: string; type: string; blocking: boolean; light?: { radius: number; color: string; flicker: boolean } | null; flagKey?: string | null; sprite_url?: string | null; sprite_w?: number; sprite_h?: number; anim_frames?: string[] | null; anim_fps?: number; battle_hp?: number | null; battle_destroy_type?: string | null; battle_destroy_damage?: number | null; battle_destroy_radius?: number | null; battle_cover_value?: number | null }
export interface MapAnim   { trigger: number; frames: number[]; fps: number }
export interface NPC       { id: number; name: string; icon: string; is_enemy: boolean }
export interface Shop      { id: number; name: string }
export interface Item      { id: number; name: string; icon: string; type: string }

export type Layer = 'TILES' | 'OBJECTS' | 'EVENTS'
export type EventTool = 'NPC' | 'TELEPORT' | 'ENEMY' | 'LOOT' | 'SHOP' | 'TERRAIN' | 'SCRIPT' | 'ERASER'
export type ModalType = 'npc' | 'teleport' | 'shop' | 'enemy' | 'loot' | 'terrain' | 'object-flags' | 'custom-sprite' | 'script' | null
export interface ModalState { type: ModalType; x: number; y: number; ei: number; oi: number }

// ── Object presets ───────────────────────────────────────────────
export const OBJECT_PRESETS: Record<string, { icon: string; label: string; type: 'LIGHT'|'PROP'|'DECO'; blocking: boolean; light?: {radius:number;color:string;flicker:boolean}; hint: string }> = {
  LANTERN:    { icon:'🕯️', label:'Lantern',       type:'LIGHT', blocking:false, light:{radius:2.5,color:'#ff8833',flicker:true},  hint:'Small warm light. Flickering.' },
  TORCH:      { icon:'🔥', label:'Torch',          type:'LIGHT', blocking:false, light:{radius:3.5,color:'#ff5500',flicker:true},  hint:'Bright warm light. Flickering flame.' },
  CHANDELIER: { icon:'✨', label:'Chandelier',     type:'LIGHT', blocking:false, light:{radius:6,  color:'#ffffcc',flicker:false}, hint:'Large soft white light.' },
  CRYSTAL:    { icon:'💎', label:'Magic Crystal',  type:'LIGHT', blocking:false, light:{radius:3,  color:'#4466ff',flicker:false}, hint:'Cold blue glow.' },
  CAMPFIRE:   { icon:'🏕️', label:'Campfire',       type:'LIGHT', blocking:false, light:{radius:4,  color:'#ff6600',flicker:true},  hint:'Outdoor fire. Flickering orange warmth.' },
  BARREL:     { icon:'🪣', label:'Barrel',         type:'PROP',  blocking:true,  hint:'Blocks movement.' },
  CRATE:      { icon:'📦', label:'Crate',          type:'PROP',  blocking:true,  hint:'Heavy crate. Blocks movement.' },
  BOULDER:    { icon:'🗿', label:'Boulder',        type:'PROP',  blocking:true,  hint:'Impassable rock.' },
  STATUE:     { icon:'🗽', label:'Statue',         type:'PROP',  blocking:true,  hint:'Decorative statue. Blocking.' },
  ALTAR:      { icon:'🏛️', label:'Altar',          type:'PROP',  blocking:false, hint:'Walkthrough decoration.' },
  TREE:       { icon:'🌲', label:'Tree',           type:'PROP',  blocking:true,  hint:'Blocks movement.' },
  FLOWER:     { icon:'🌸', label:'Flower',         type:'DECO',  blocking:false, hint:'Pure decoration. No collision.' },
  GRASS:      { icon:'🌿', label:'Tall Grass',     type:'DECO',  blocking:false, hint:'Visual only.' },
  BONES:      { icon:'🦴', label:'Bones',          type:'DECO',  blocking:false, hint:'Atmospheric decoration.' },
  MUSHROOM:   { icon:'🍄', label:'Mushroom',       type:'DECO',  blocking:false, hint:'Decoration.' },
  CHEST:      { icon:'📫', label:'Chest (closed)', type:'PROP',  blocking:false, hint:'Use with a flag for open/close state.' },
  SIGN:       { icon:'📋', label:'Sign',           type:'PROP',  blocking:false, hint:'Readable sign. Combine with SCRIPT to show text.' },
}

export const EVENT_ICONS: Record<string, string> = {
  NPC:'👤', TELEPORT:'🚪', ENEMY:'⚔️', LOOT:'💎', SHOP:'🏪', SCRIPT:'📜', TERRAIN:'🌿', ERASER:'✕'
}

export const TILE_COLORS = [
  // Core (0–10)
  '#1a3a1a','#4a4a4a','#0a2a5a','#3a2a0a','#5a5a5a','#3a2a1a','#6a6a5a','#0a0a0a','#2a1a4a','#0a2a0a','#5a4a2a',
  // Nature (11–20)
  '#2a4a2a','#3a5a3a','#1a2a1a','#4a6a3a','#5a7a4a','#6a8a5a','#2a3a2a','#8a9a6a','#3a4a1a','#1a4a3a',
  // Stone & Structure (21–30)
  '#3a3a3a','#5a5a6a','#2a2a2a','#6a5a4a','#4a3a2a','#7a7a7a','#3a3a4a','#5a4a3a','#2a2a3a','#1a1a1a',
  // Water & Ice (31–36)
  '#1a4a6a','#2a5a7a','#3a6a6a','#6a8aaa','#4a6a8a','#1a3a4a',
  // Underground (37–44)
  '#2a1a0a','#1a0a0a','#3a2a2a','#0a0a1a','#2a2a1a','#4a3a3a','#3a1a1a','#6a2a0a',
  // Snow & Mountain (45–50)
  '#8a9aaa','#6a7a8a','#5a5a6a','#7a8a9a','#9aaaba','#4a4a5a',
  // Interior (51–60)
  '#4a3a2a','#5a4a3a','#3a2a2a','#5a2a2a','#2a2a4a','#6a5a4a','#4a4a3a','#3a3a2a','#5a5a4a','#2a1a2a',
  // Special & Magical (61–70)
  '#4a1a4a','#1a3a3a','#3a0a0a','#0a1a2a','#4a4a1a','#1a1a3a','#2a0a2a','#0a3a1a','#3a3a0a','#5a1a3a',
  // Path & Road (71–75)
  '#4a3a1a','#5a5a5a','#3a3a3a','#6a5a3a','#4a4a4a',
  // Desert & Wasteland (76–80)
  '#7a6a3a','#6a5a2a','#8a7a4a','#5a4a1a','#4a3a0a',
]
export const TILE_NAMES = [
  // Core (0–10)
  'Grass','Wall','Water','Dirt','Stone','Wood','Rock','Void','Magic','Jungle','Sand',
  // Nature (11–20)
  'Forest','Moss','Swamp','Meadow','Farmland','Hedge','Thicket','Dry Grass','Marsh','Bog',
  // Stone & Structure (21–30)
  'Cobblestone','Marble','Dark Stone','Brick','Ruin','Tile Floor','Slate','Flagstone','Dungeon Floor','Obsidian',
  // Water & Ice (31–36)
  'Deep Water','Shallow Water','River','Ice','Frozen Lake','Murky Water',
  // Underground (37–44)
  'Cave Floor','Cave Wall','Mine Floor','Abyss','Cavern','Tunnel','Lava Rock','Lava',
  // Snow & Mountain (45–50)
  'Snow','Frozen Ground','Mountain','Tundra','Glacier','Cliff',
  // Interior (51–60)
  'Wood Floor','Plank Floor','Carpet (Dark)','Carpet (Red)','Carpet (Blue)','Tavern Floor','Kitchen Tile','Cellar Floor','Library Floor','Throne Room',
  // Special & Magical (61–70)
  'Corrupted','Enchanted','Blood-soaked','Shadow','Holy Ground','Arcane Circle','Necro Ground','Druid Grove','Runic Floor','Fey Wild',
  // Path & Road (71–75)
  'Dirt Path','Stone Road','Gravel','Boardwalk','Bridge',
  // Desert & Wasteland (76–80)
  'Desert Sand','Dune','Cracked Earth','Badlands','Scorched',
]

// Fallback terrain types — replaced by DB data when available
export const TERRAIN_TYPES_FALLBACK = [
  { id:'forest',      label:'Forest',      icon:'🌲', desc:'Cover: -20% incoming damage' },
  { id:'high_ground', label:'High Ground', icon:'⛰️', desc:'+1 range, +15% outgoing damage' },
  { id:'water',       label:'Water',       icon:'🌊', desc:'Slow: -10% outgoing damage' },
  { id:'cover',       label:'Hard Cover',  icon:'🧱', desc:'Cover: -30% incoming damage' },
  { id:'fire',        label:'Fire',        icon:'🔥', desc:'8 dmg per turn' },
]

export const ELEVATION_LEVELS = [
  { level: 0, label: 'Ground',   color: 'transparent' },
  { level: 1, label: 'Low (+1)', color: 'rgba(100,200,100,0.2)' },
  { level: 2, label: 'Mid (+2)', color: 'rgba(200,200,50,0.3)' },
  { level: 3, label: 'High (+3)', color: 'rgba(255,150,50,0.4)' },
]

// ── Helpers ───────────────────────────────────────────────────────
function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-3">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

// ── MAP LIST ──────────────────────────────────────────────────────
export function MapManagerPanel() {
  const [maps, setMaps]             = useState<GameMap[]>([])
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState<GameMap | null>(null)
  const [creating, setCreating]     = useState<Partial<GameMap>>({})
  const [showCreate, setShowCreate] = useState(false)

  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await adminApi.entity.getAll('map')
      if (r.success) { setMaps((r.data || []) as GameMap[]); setLoadError(null) }
      else setLoadError(r.message || 'Failed to load maps')
    } catch { setLoadError('Could not reach server') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createMap = async () => {
    if (!creating.name?.trim()) { setLoadError('Map name is required'); return }
    const w = Math.min(Math.max(creating.width || 20, 5), 100)
    const h = Math.min(Math.max(creating.height || 20, 5), 100)
    try {
      const res = await adminApi.entity.save('map', {
        name: creating.name, width: w, height: h,
        tiles_json:      JSON.stringify(new Array(w*h).fill(0)),
        collisions_json: '[]', objects_json: '[]', anims_json: '[]',
        ambient_dark: 0, tileset_url: null
      } as Record<string,unknown>)
      if (res.success) { await load(); setShowCreate(false); setCreating({}) }
      else setLoadError(res.message || 'Create failed')
    } catch { setLoadError('Server error creating map') }
  }

  const deleteMap = async (id: number, name: string) => {
    if (!confirm(`Delete map "${name}"?\n\nThis removes the map and all its events. Players currently on this map will be kicked.`)) return
    const res = await adminApi.entity.delete('map', id)
    if (res.success) load()
  }

  if (editing) {
    return <MapEditorCanvas map={editing} maps={maps} onExit={() => { setEditing(null); load() }} />
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><MapIcon className="w-5 h-5" /> Map Editor</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{maps.length} map{maps.length!==1?'s':''} — click to edit</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0]
              if (!file) return
              try {
                const text = await file.text()
                const data = JSON.parse(text)
                const API = process.env.NEXT_PUBLIC_API_URL || ''
                const r = await fetch(`${API}/admin-panel/map-import`, {
                  method: 'POST', credentials: 'include',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(data)
                }).then(r => r.json())
                if (r.success) { load(); setLoadError(null) }
                else setLoadError(r.message || 'Import failed')
              } catch { setLoadError('Invalid JSON file') }
            }
            input.click()
          }}>📥 Import</Button>
          <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Map</Button>
        </div>
      </div>

      <Help>
        Click a map to open the full editor. The editor has three layers:
        <b> Terrain</b> (paint tiles), <b>Objects</b> (place lights, props, decorations), and <b>Events</b> (NPCs, teleports, shops, loot).
        Always <b>save before switching maps</b> — unsaved changes are lost on exit.
      </Help>

      {showCreate && (
        <div className="p-4 bg-card border border-border rounded-lg mb-4 space-y-3">
          <h3 className="text-sm font-semibold">+ New Map</h3>
          {/* Quick templates */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Start from template:</label>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: '🟩 Blank', w: 20, h: 20 },
                { label: '🏘 Small Town', w: 25, h: 20 },
                { label: '🏰 Dungeon Room', w: 15, h: 12 },
                { label: '🌲 Forest Path', w: 30, h: 15 },
                { label: '⚔️ Battle Arena', w: 8, h: 5 },
                { label: '🏠 Interior', w: 10, h: 8 },
                { label: '🌍 Large Open', w: 50, h: 40 },
              ].map(t => (
                <button key={t.label} onClick={() => setCreating(p => ({ ...p, width: t.w, height: t.h, name: p.name || t.label.slice(2).trim() }))}
                  className={cn("px-2.5 py-1.5 rounded border text-xs transition-colors",
                    creating.width === t.w && creating.height === t.h
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-border')}>
                  {t.label} <span className="text-muted-foreground/60">{t.w}×{t.h}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={creating.name||''} onChange={e=>setCreating(p=>({...p,name:e.target.value}))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Width (tiles)</label>
              <Input type="number" value={creating.width||20} min={5} max={200} onChange={e=>setCreating(p=>({...p,width:parseInt(e.target.value)||20}))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Height (tiles)</label>
              <Input type="number" value={creating.height||20} min={5} max={200} onChange={e=>setCreating(p=>({...p,height:parseInt(e.target.value)||20}))} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Templates set the size. You can always resize later with the 📐 tool.</p>
          <div className="flex gap-2">
            <Button onClick={createMap}>Create Empty</Button>
            <Button variant="outline" onClick={async () => {
              const gen = prompt(
                'Procedural Generator\n\n' +
                'Choose a generator type:\n' +
                '  1 — Dungeon (BSP rooms connected by corridors)\n' +
                '  2 — Cave (cellular automata organic shapes)\n' +
                '  3 — Maze (perfect maze with dead ends)\n\n' +
                'Enter 1, 2, or 3:'
              )
              if (!gen || !['1','2','3'].includes(gen)) return
              const w = Math.min(Math.max(creating.width || 30, 10), 100)
              const h = Math.min(Math.max(creating.height || 25, 10), 100)
              const name = creating.name || (gen === '1' ? 'Generated Dungeon' : gen === '2' ? 'Generated Cave' : 'Generated Maze')

              // Generate tiles
              let tiles: number[]
              if (gen === '1') tiles = generateDungeon(w, h)
              else if (gen === '2') tiles = generateCave(w, h)
              else tiles = generateMaze(w, h)

              // Create passability from tiles (wall=blocked, floor=walkable)
              const pass = tiles.map(t => t === 1 ? 1 : 0)

              const res = await adminApi.entity.save('map', {
                name, width: w, height: h,
                tiles_json: JSON.stringify([tiles, new Array(w*h).fill(-1), pass, new Array(w*h).fill(-1), new Array(w*h).fill(0)]),
                collisions_json: '[]', objects_json: '[]', anims_json: '[]',
                ambient_dark: gen === '1' ? 0.6 : gen === '2' ? 0.4 : 0.3,
              } as Record<string,unknown>)
              if (res.success) { await load(); setShowCreate(false); setCreating({}) }
            }}>🎲 Generate</Button>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {maps.map(m => {
            let evCount = 0, objCount = 0
            try { evCount  = JSON.parse(m.collisions_json||'[]').length } catch {}
            try { objCount = JSON.parse(m.objects_json   ||'[]').length } catch {}
            return (
              <div key={m.id} className="p-4 bg-card border border-border rounded-lg hover:border-primary transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-bold text-sm">{m.name}</div>
                    <div className="text-xs text-muted-foreground">{m.width}×{m.height} · {evCount} events · {objCount} objects</div>
                    {m.ambient_dark > 0 && <div className="text-xs text-indigo-400">🌑 {Math.round(m.ambient_dark*100)}% dark</div>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => deleteMap(m.id, m.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={() => setEditing(m)}>
                  <Layers className="w-3.5 h-3.5 mr-1" />Open Editor
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
