"use client"

import {
  useState, useEffect, useCallback, useRef, useReducer
} from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Plus, Trash2, Info, Save, ChevronLeft, Map as MapIcon,
  ZoomIn, ZoomOut, Layers, Settings, Eye
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Constants ────────────────────────────────────────────────────
const EDITOR_TILE = 20
const PICKER_TILE = 32

// ── Types ────────────────────────────────────────────────────────
interface GameMap {
  id: number; name: string; width: number; height: number
  tileset_url: string; ambient_dark: number; spawn_x: number; spawn_y: number
  region_id: number | null
  tiles_json: string; collisions_json: string; objects_json: string; anims_json: string
}
interface MapEvent  { x: number; y: number; type: string; data?: string | number; terrain?: string; trigger?: string; conditions?: unknown[]; actions?: unknown[] }
interface MapObject { x: number; y: number; preset: string; icon: string; label: string; type: string; blocking: boolean; light?: { radius: number; color: string; flicker: boolean } | null; flagKey?: string | null; sprite_url?: string | null; sprite_w?: number; sprite_h?: number; anim_frames?: string[] | null; anim_fps?: number; battle_hp?: number | null; battle_destroy_type?: string | null; battle_destroy_damage?: number | null; battle_destroy_radius?: number | null; battle_cover_value?: number | null }
interface MapAnim   { trigger: number; frames: number[]; fps: number }
interface NPC       { id: number; name: string; icon: string; is_enemy: boolean }
interface Shop      { id: number; name: string }
interface Item      { id: number; name: string; icon: string; type: string }

type Layer = 'TILES' | 'OBJECTS' | 'EVENTS'
type EventTool = 'NPC' | 'TELEPORT' | 'ENEMY' | 'LOOT' | 'SHOP' | 'TERRAIN' | 'ERASER'

// ── Object presets ───────────────────────────────────────────────
const OBJECT_PRESETS: Record<string, { icon: string; label: string; type: 'LIGHT'|'PROP'|'DECO'; blocking: boolean; light?: {radius:number;color:string;flicker:boolean}; hint: string }> = {
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

const EVENT_ICONS: Record<string, string> = {
  NPC:'👤', TELEPORT:'🚪', ENEMY:'⚔️', LOOT:'💎', SHOP:'🏪', SCRIPT:'📜', TERRAIN:'🌿', ERASER:'✕'
}

const TILE_COLORS = ['#2d5a27','#8b7355','#1a3a5c','#c0a060','#555','#3d2b1f','#7a7a7a','#111','#4a0080','#0a4a2a']
const TILE_NAMES  = ['Grass','Dirt','Water','Sand','Stone','Wood','Rock','Void','Magic','Jungle']

const TERRAIN_TYPES = [
  { id:'forest',      label:'Forest',      icon:'🌲', desc:'Cover: -20% incoming damage' },
  { id:'high_ground', label:'High Ground', icon:'⛰️', desc:'+1 range, +15% outgoing damage' },
  { id:'water',       label:'Water',       icon:'🌊', desc:'Slow: -10% outgoing damage' },
  { id:'cover',       label:'Hard Cover',  icon:'🧱', desc:'Cover: -30% incoming damage' },
  { id:'fire',        label:'Fire',        icon:'🔥', desc:'8 dmg per turn' },
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

// ── Modal ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <h3 className="text-base font-bold text-primary mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}

// ── MAP EDITOR ────────────────────────────────────────────────────
interface EditorState {
  tiles: number[]
  events: MapEvent[]
  objects: MapObject[]
  anims: MapAnim[]
  layer: Layer
  brush: number
  tool: EventTool
  objectPreset: string
  zoom: number
  ambientDark: number
  tilesetUrl: string
  tilesetLoaded: boolean
  tilesetCols: number
  tilesetSrc: string
  painting: boolean
  dirty: boolean
}

type ModalType = 'npc' | 'teleport' | 'shop' | 'enemy' | 'loot' | 'terrain' | 'object-flags' | 'custom-sprite' | null
interface ModalState { type: ModalType; x: number; y: number; ei: number; oi: number }

function MapEditor({ map, maps, onExit }: { map: GameMap; maps: GameMap[]; onExit: () => void }) {
  const [state, setState] = useState<EditorState>(() => {
    let tiles: number[] = []
    let events: MapEvent[] = []
    let objects: MapObject[] = []
    let anims: MapAnim[] = []
    try { tiles   = JSON.parse(map.tiles_json      || '[]') } catch {}
    try { events  = JSON.parse(map.collisions_json || '[]') } catch {}
    try { objects = JSON.parse(map.objects_json    || '[]') } catch {}
    try { anims   = JSON.parse(map.anims_json      || '[]') } catch {}
    if (!tiles.length) tiles = new Array(map.width * map.height).fill(0)
    return {
      tiles, events, objects, anims,
      layer: 'TILES', brush: 0, tool: 'NPC', objectPreset: 'LANTERN',
      zoom: 1, ambientDark: map.ambient_dark || 0, tilesetUrl: map.tileset_url || '',
      tilesetLoaded: false, tilesetCols: 0, tilesetSrc: '', painting: false, dirty: false
    }
  })

  const [npcs, setNpcs]   = useState<NPC[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [modal, setModal] = useState<ModalState>({ type: null, x:0, y:0, ei:-1, oi:-1 })
  const [hoveredCell, setHoveredCell] = useState<{x:number;y:number;tile:number} | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const tilesetImgRef = useRef<HTMLImageElement | null>(null)
  const pickerRef = useRef<HTMLCanvasElement>(null)

  // Load lookup data
  useEffect(() => {
    adminApi.entity.getAll('npc').then(r => setNpcs((r.data || []) as NPC[]))
    adminApi.entity.getAll('shop').then(r => setShops((r.data || []) as Shop[]))
    adminApi.entity.getAll('item').then(r => setItems((r.data || []) as Item[]))
  }, [])

  const set = useCallback((update: Partial<EditorState>) => {
    setState(prev => ({ ...prev, ...update, dirty: true }))
  }, [])

  // Load tileset image
  const loadTileset = useCallback((url: string) => {
    if (!url.trim()) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const cols = Math.floor(img.naturalWidth  / PICKER_TILE)
      tilesetImgRef.current = img
      setState(prev => ({ ...prev, tilesetLoaded: true, tilesetCols: cols, tilesetSrc: url }))
    }
    img.onerror = () => setState(prev => ({ ...prev, tilesetLoaded: false }))
    img.src = url
  }, [])

  useEffect(() => { if (state.tilesetUrl) loadTileset(state.tilesetUrl) }, [])

  // Draw tileset picker canvas
  useEffect(() => {
    const canvas = pickerRef.current
    const img = tilesetImgRef.current
    if (!canvas || !img || !state.tilesetLoaded) return

    const cols = state.tilesetCols
    const rows = Math.floor(img.naturalHeight / PICKER_TILE)
    canvas.width  = cols * PICKER_TILE
    canvas.height = rows * PICKER_TILE
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 0.5
    for (let c = 0; c <= cols; c++) { ctx.beginPath(); ctx.moveTo(c*PICKER_TILE,0); ctx.lineTo(c*PICKER_TILE,canvas.height); ctx.stroke() }
    for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(0,r*PICKER_TILE); ctx.lineTo(canvas.width,r*PICKER_TILE); ctx.stroke() }
    // Highlight selected tile
    const selCol = state.brush % cols
    const selRow = Math.floor(state.brush / cols)
    ctx.strokeStyle = '#bb86fc'
    ctx.lineWidth = 2
    ctx.strokeRect(selCol*PICKER_TILE+1, selRow*PICKER_TILE+1, PICKER_TILE-2, PICKER_TILE-2)
  }, [state.tilesetLoaded, state.brush, state.tilesetCols])

  // Picker click
  const handlePickerClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = pickerRef.current; if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const col = Math.floor((e.clientX - rect.left) * scaleX / PICKER_TILE)
    const row = Math.floor((e.clientY - rect.top)  * scaleY / PICKER_TILE)
    if (col < 0 || row < 0) return
    set({ brush: row * state.tilesetCols + col })
  }

  // Cell click
  const handleCellClick = (i: number, x: number, y: number) => {
    if (state.layer === 'TILES') {
      const tiles = [...state.tiles]
      tiles[i] = state.brush
      set({ tiles })
      return
    }
    if (state.layer === 'OBJECTS') {
      const oi = state.objects.findIndex(o => o.x === x && o.y === y)
      if (state.objectPreset === 'ERASER') {
        if (oi >= 0) { const objs = [...state.objects]; objs.splice(oi, 1); set({ objects: objs }) }
        return
      }
      if (state.objectPreset === 'CUSTOM') { setModal({ type: 'custom-sprite', x, y, ei: -1, oi }); return }
      const preset = OBJECT_PRESETS[state.objectPreset]
      if (!preset) return
      const existing = oi >= 0 ? state.objects[oi] : null
      if (existing && existing.preset === state.objectPreset) { setModal({ type: 'object-flags', x, y, ei: -1, oi }); return }
      const newObj: MapObject = { x, y, preset: state.objectPreset, icon: preset.icon, label: preset.label, type: preset.type, blocking: preset.blocking, light: preset.light ? { ...preset.light } : null }
      const objs = [...state.objects]
      if (oi >= 0) objs[oi] = newObj; else objs.push(newObj)
      set({ objects: objs })
      return
    }
    // Events layer
    const ei = state.events.findIndex(e => e.x === x && e.y === y)
    if (state.tool === 'ERASER') {
      if (ei >= 0) { const evs = [...state.events]; evs.splice(ei, 1); set({ events: evs }) }
      return
    }
    setModal({ type: state.tool.toLowerCase() as ModalType, x, y, ei, oi: -1 })
  }

  // Paint on drag
  const handleCellMouseEnter = (i: number, x: number, y: number, tile: number) => {
    setHoveredCell({ x, y, tile })
    if (state.painting && state.layer === 'TILES') {
      const tiles = [...state.tiles]; tiles[i] = state.brush; set({ tiles })
    }
  }

  // Add/update event helper
  const placeEvent = (ev: MapEvent) => {
    const evs = [...state.events]
    if (modal.ei >= 0) evs[modal.ei] = ev; else evs.push(ev)
    set({ events: evs })
    setModal({ type: null, x:0, y:0, ei:-1, oi:-1 })
  }

  // Save
  const save = async () => {
    setSaving(true); setSaveMsg('')
    const payload = {
      tiles_json:      JSON.stringify(state.tiles),
      collisions_json: JSON.stringify(state.events),
      objects_json:    JSON.stringify(state.objects),
      anims_json:      JSON.stringify(state.anims),
      ambient_dark:    state.ambientDark,
      tileset_url:     state.tilesetUrl || null,
    }
    const r = await adminApi.entity.save('map', payload as Record<string,unknown>, map.id)
    if (r.success) {
      await fetch(`/admin/clear-cache`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ mapId: map.id }) }).catch(()=>{})
      setSaveMsg('✅ Saved!'); setState(prev => ({ ...prev, dirty: false }))
      setTimeout(() => setSaveMsg(''), 2000)
    } else { setSaveMsg('❌ ' + (r.message || 'Save failed')) }
    setSaving(false)
  }

  const TS = Math.round(EDITOR_TILE * state.zoom)

  // Cell background style
  const cellStyle = (i: number, x: number, y: number): React.CSSProperties => {
    const tv = state.tiles[i] ?? 0
    const base: React.CSSProperties = { width: TS, height: TS, flexShrink: 0, cursor: 'pointer', position: 'relative', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(10, Math.round(TS * 0.55)) }
    if (state.tilesetLoaded && tilesetImgRef.current) {
      const cols = state.tilesetCols
      const col = tv % cols; const row = Math.floor(tv / cols)
      const imgW = tilesetImgRef.current.naturalWidth
      const imgH = tilesetImgRef.current.naturalHeight
      const scale = TS / PICKER_TILE
      return { ...base, backgroundImage: `url(${state.tilesetSrc})`, backgroundSize: `${imgW*scale}px ${imgH*scale}px`, backgroundPosition: `-${col*TS}px -${row*TS}px`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated' }
    }
    return { ...base, background: TILE_COLORS[tv] || '#333' }
  }

  const evAtCell  = (x: number, y: number) => state.events.find(e => e.x === x && e.y === y)
  const objAtCell = (x: number, y: number) => state.objects.find(o => o.x === x && o.y === y)

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border shrink-0 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onExit}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="font-bold text-sm">{map.name}</span>
        <span className="text-xs text-muted-foreground">{map.width}×{map.height}</span>
        {state.dirty && <Badge variant="outline" className="text-[10px] py-0 text-yellow-400 border-yellow-800">Unsaved</Badge>}

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">🔍</span>
          <input type="range" min={0.5} max={3} step={0.5} value={state.zoom}
            onChange={e => setState(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
            className="w-20 accent-primary" />
          <span className="text-xs text-muted-foreground w-6">{state.zoom}×</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saveMsg && <span className="text-xs font-medium">{saveMsg}</span>}
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Tileset bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-black/20 border-b border-border shrink-0 text-xs">
        <span className="text-muted-foreground shrink-0">TILESET:</span>
        <Input value={state.tilesetUrl} onChange={e => setState(prev => ({ ...prev, tilesetUrl: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && loadTileset(state.tilesetUrl)}
          placeholder="https://example.com/tileset.png" className="flex-1 h-7 text-xs font-mono" />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadTileset(state.tilesetUrl)}>Load</Button>
        {state.tilesetLoaded && <span className="text-green-400 shrink-0">✔ Loaded</span>}
      </div>

      {/* Darkness bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 bg-[#0a0a14] border-b border-border shrink-0 text-xs">
        <span className="text-muted-foreground shrink-0">🌑 DARKNESS:</span>
        <input type="range" min={0} max={1} step={0.05} value={state.ambientDark}
          onChange={e => setState(prev => ({ ...prev, ambientDark: parseFloat(e.target.value), dirty: true }))}
          className="w-32 accent-indigo-400" />
        <span className="text-indigo-400 w-8">{Math.round(state.ambientDark*100)}%</span>
        <span className="text-muted-foreground/40">0% = fully lit · 30% = dusk · 70% = dungeon · 90% = pitch black</span>
      </div>

      {/* Layer tabs */}
      <div className="flex items-center gap-4 px-4 py-2 bg-[#1a1a1a] border-b border-border shrink-0">
        {([['TILES','🖌️ TERRAIN'],['OBJECTS','🏮 OBJECTS'],['EVENTS','⚙️ EVENTS']] as [Layer,string][]).map(([l,label]) => (
          <label key={l} className={cn("cursor-pointer text-sm", state.layer===l ? l==='EVENTS'?'text-purple-400':l==='OBJECTS'?'text-yellow-400':'text-white' : 'text-muted-foreground')}>
            <input type="radio" name="layer" checked={state.layer===l} onChange={() => set({ layer: l, painting: false })} className="mr-1.5" />
            {label}
          </label>
        ))}
      </div>

      {/* Toolbar for EVENTS layer */}
      {state.layer === 'EVENTS' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#111] border-b border-border shrink-0 flex-wrap">
          <span className="text-muted-foreground text-xs shrink-0">TOOL:</span>
          {(['NPC','TELEPORT','ENEMY','LOOT','SHOP','TERRAIN','ERASER'] as EventTool[]).map(t => (
            <button key={t} onClick={() => set({ tool: t })}
              className={cn("px-2 py-1 rounded text-xs transition-colors border", state.tool===t ? 'bg-purple-900/60 border-purple-500 text-purple-300' : 'bg-[#222] border-[#444] text-muted-foreground hover:text-foreground')}>
              {EVENT_ICONS[t]} {t}
            </button>
          ))}
        </div>
      )}

      {/* OBJECTS toolbar */}
      {state.layer === 'OBJECTS' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#111] border-b border-border shrink-0 flex-wrap">
          <span className="text-muted-foreground text-xs shrink-0">BRUSH:</span>
          <button onClick={() => set({ objectPreset: 'ERASER' })}
            className={cn("px-2 py-1 rounded text-xs border", state.objectPreset==='ERASER' ? 'bg-red-900/60 border-red-700 text-red-300' : 'bg-[#222] border-[#444] text-red-400')}>
            ✕ ERASE
          </button>
          {Object.entries(OBJECT_PRESETS).slice(0,8).map(([k, p]) => (
            <button key={k} onClick={() => set({ objectPreset: k })}
              className={cn("px-2 py-1 rounded text-xs border transition-colors", state.objectPreset===k ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-[#222] border-[#444] text-muted-foreground hover:text-foreground')}>
              {p.icon}
            </button>
          ))}
        </div>
      )}

      {/* Main: grid + side panel */}
      <div className="flex gap-0 flex-1 min-h-0 overflow-hidden">

        {/* Grid */}
        <div className="flex-1 overflow-auto min-w-0 p-4"
          onMouseLeave={() => setState(prev => ({ ...prev, painting: false }))}>
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${map.width},${TS}px)`, width: map.width*TS, height: map.height*TS, background: '#000', border: '2px solid #555', cursor: state.layer==='TILES'?'crosshair':'pointer' }}
            onMouseDown={() => setState(prev => ({ ...prev, painting: true }))}
            onMouseUp={()   => setState(prev => ({ ...prev, painting: false }))}>
            {state.tiles.map((tile, i) => {
              const x = i % map.width, y = Math.floor(i / map.width)
              const ev  = evAtCell(x, y)
              const obj = objAtCell(x, y)
              const isHovered = hoveredCell?.x === x && hoveredCell?.y === y
              return (
                <div key={i} style={cellStyle(i, x, y)}
                  onClick={() => handleCellClick(i, x, y)}
                  onMouseEnter={() => handleCellMouseEnter(i, x, y, tile)}
                  className={isHovered ? 'outline outline-2 outline-white z-10' : ''}>
                  {obj && (
                    <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', textShadow:'0 0 3px black', outline: obj.type==='LIGHT'?'1px solid #ffcc44':obj.blocking?'1px solid #ff6644':undefined }}>
                      {obj.icon}
                    </span>
                  )}
                  {ev && !obj && (
                    <span style={{ textShadow:'0 0 3px black', outline: ev.actions ? '1px solid #bb86fc' : undefined }}>
                      {ev.actions ? '📜' : (EVENT_ICONS[ev.type] || '?')}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-64 shrink-0 border-l border-border bg-[#1a1a1a] overflow-y-auto p-3 space-y-3">

          {/* Tiles: tileset picker or color legend */}
          {state.layer === 'TILES' && (
            <>
              {state.tilesetLoaded ? (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Tile Picker</div>
                  <div className="overflow-auto max-h-64">
                    <canvas ref={pickerRef} onClick={handlePickerClick}
                      style={{ display:'block', cursor:'crosshair', imageRendering:'pixelated', maxWidth:'100%' }} />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Tile Legend</div>
                  {TILE_COLORS.map((col, i) => (
                    <div key={i} onClick={() => set({ brush: i })}
                      className="flex items-center gap-2 mb-1.5 cursor-pointer">
                      <div style={{ width:20, height:20, background:col, border: state.brush===i?'2px solid white':'1px solid #444', flexShrink:0 }} />
                      <span className={state.brush===i ? 'text-white text-xs' : 'text-muted-foreground text-xs'}>{TILE_NAMES[i]}</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground mt-2 p-2 bg-black/20 rounded">💡 Paste a tileset URL above to paint with real tiles.</p>
                </div>
              )}
            </>
          )}

          {/* Objects: full palette */}
          {state.layer === 'OBJECTS' && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Object Palette</div>
              {[['LIGHT','💡 LIGHTS','text-yellow-400'],['PROP','📦 PROPS','text-orange-400'],['DECO','🎨 DECO','text-blue-400']] .map(([grpType, grpLabel, grpColor]) => (
                <div key={grpType}>
                  <div className={cn("text-[10px] uppercase tracking-widest mt-3 mb-1.5 border-b border-border pb-1", grpColor)}>{grpLabel}</div>
                  {Object.entries(OBJECT_PRESETS).filter(([,p]) => p.type === grpType).map(([k, p]) => {
                    const sel = state.objectPreset === k
                    return (
                      <div key={k} onClick={() => set({ objectPreset: k })}
                        className={cn("flex items-center gap-2 p-1.5 mb-1 rounded cursor-pointer border transition-colors text-xs",
                          sel ? 'bg-yellow-900/20 border-yellow-700' : 'bg-transparent border-transparent hover:bg-white/5')}>
                        <span className="text-base w-6 text-center shrink-0">{p.icon}</span>
                        <div>
                          <div className={sel ? 'text-yellow-300' : 'text-foreground'}>{p.label}</div>
                          <div className="text-muted-foreground text-[10px]">{p.type==='LIGHT' ? `R=${p.light?.radius}${p.light?.flicker?' 🔥':''}` : p.blocking?'⛔ blocks':'✅ walkthrough'}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Events: summary */}
          {state.layer === 'EVENTS' && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Map Summary</div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div>{state.events.length} event{state.events.length!==1?'s':''}</div>
                <div>{state.objects.length} object{state.objects.length!==1?'s':''}</div>
                {Object.entries(EVENT_ICONS).filter(([t]) => t!=='ERASER').map(([type, icon]) => {
                  const n = state.events.filter(e => e.type===type).length
                  return n > 0 ? <div key={type}>{icon} {n} {type.toLowerCase()}{n!==1?'s':''}</div> : null
                })}
              </div>
              <div className="mt-3 text-[10px] text-muted-foreground p-2 bg-black/20 rounded leading-relaxed">
                Select a tool above then click any tile to place an event.
                Click an existing event tile again to edit it.
                Use ERASER to remove events.
              </div>
            </div>
          )}

          {/* Cell inspector */}
          <div className="border-t border-border pt-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Cell Inspector</div>
            {hoveredCell ? (
              <div className="text-xs space-y-1">
                <div className="font-bold text-foreground">({hoveredCell.x}, {hoveredCell.y})</div>
                <div className="text-muted-foreground">
                  {state.tilesetLoaded ? `Tile #${hoveredCell.tile}` : (TILE_NAMES[hoveredCell.tile] || `Tile ${hoveredCell.tile}`)}
                </div>
                {(() => {
                  const obj = objAtCell(hoveredCell.x, hoveredCell.y)
                  const ev  = evAtCell(hoveredCell.x, hoveredCell.y)
                  return <>
                    {obj && <div className="text-yellow-400">{obj.icon} {obj.label} [{obj.type}]{obj.blocking?' ⛔':''}</div>}
                    {ev  && <div className="text-purple-400">{EVENT_ICONS[ev.type]||'?'} {ev.type} {ev.data ? `→ ${ev.data}` : ''}</div>}
                    {!obj && !ev && <div className="text-muted-foreground/40">Empty</div>}
                  </>
                })()}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground/40">Hover a tile to inspect</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal.type === 'npc' && (
        <Modal title={`👤 Place NPC at (${modal.x}, ${modal.y})`} onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>
          <p className="text-xs text-muted-foreground mb-3">Select an NPC — ⚔️ = has combat stats</p>
          <select id="npc-pick" className="w-full px-3 py-2 bg-input border border-border rounded text-sm mb-4"
            defaultValue={modal.ei>=0 ? String(state.events[modal.ei]?.data) : ''}>
            {npcs.map(n => <option key={n.id} value={n.name}>{n.icon||'👤'} {n.name}{n.is_enemy?' ⚔️':''}</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>Cancel</Button>
            <Button onClick={() => {
              const sel = (document.getElementById('npc-pick') as HTMLSelectElement)?.value
              if (sel) placeEvent({ x:modal.x, y:modal.y, type:'NPC', data:sel })
            }}>Place NPC</Button>
          </div>
        </Modal>
      )}

      {modal.type === 'teleport' && (
        <TeleportModal modal={modal} maps={maps} existing={modal.ei>=0?state.events[modal.ei]:null}
          onPlace={placeEvent} onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})} />
      )}

      {modal.type === 'shop' && (
        <Modal title={`🏪 Shop Event at (${modal.x}, ${modal.y})`} onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>
          <p className="text-xs text-muted-foreground mb-3">Player walks here → shop opens automatically.</p>
          <select id="shop-pick" className="w-full px-3 py-2 bg-input border border-border rounded text-sm mb-4"
            defaultValue={modal.ei>=0 ? String(state.events[modal.ei]?.data) : ''}>
            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>Cancel</Button>
            <Button onClick={() => {
              const val = (document.getElementById('shop-pick') as HTMLSelectElement)?.value
              if (val) placeEvent({ x:modal.x, y:modal.y, type:'SHOP', data:val })
            }}>Place Shop</Button>
          </div>
        </Modal>
      )}

      {modal.type === 'loot' && (
        <Modal title={`💎 Loot Event at (${modal.x}, ${modal.y})`} onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>
          <p className="text-xs text-muted-foreground mb-3">Player walks here → item added to inventory (once per character).</p>
          <select id="loot-pick" className="w-full px-3 py-2 bg-input border border-border rounded text-sm mb-4"
            defaultValue={modal.ei>=0 ? String(state.events[modal.ei]?.data) : ''}>
            {items.map(i => <option key={i.id} value={i.id}>{i.icon||'📦'} {i.name} [{i.type}]</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>Cancel</Button>
            <Button onClick={() => {
              const val = (document.getElementById('loot-pick') as HTMLSelectElement)?.value
              if (val) placeEvent({ x:modal.x, y:modal.y, type:'LOOT', data:val })
            }}>Place Loot</Button>
          </div>
        </Modal>
      )}

      {modal.type === 'enemy' && (
        <Modal title={`⚔️ Enemy Event at (${modal.x}, ${modal.y})`} onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>
          <p className="text-xs text-muted-foreground mb-3">Fixed enemy encounter — triggers when player walks here.</p>
          <select id="enemy-pick" className="w-full px-3 py-2 bg-input border border-border rounded text-sm mb-4"
            defaultValue={modal.ei>=0 ? String(state.events[modal.ei]?.data) : ''}>
            {npcs.filter(n => n.is_enemy).map(n => <option key={n.id} value={n.id}>{n.icon||'👹'} {n.name}</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>Cancel</Button>
            <Button onClick={() => {
              const val = (document.getElementById('enemy-pick') as HTMLSelectElement)?.value
              if (val) placeEvent({ x:modal.x, y:modal.y, type:'ENEMY', data:val })
            }}>Place Enemy</Button>
          </div>
        </Modal>
      )}

      {modal.type === 'terrain' && (
        <TerrainModal modal={modal} existing={modal.ei>=0?state.events[modal.ei]:null}
          onPlace={placeEvent}
          onRemove={() => { const evs=[...state.events]; if(modal.ei>=0) evs.splice(modal.ei,1); set({events:evs}); setModal({type:null,x:0,y:0,ei:-1,oi:-1}) }}
          onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})} />
      )}

      {modal.type === 'object-flags' && modal.oi >= 0 && (
        <ObjectFlagsModal obj={state.objects[modal.oi]} x={modal.x} y={modal.y}
          onSave={(flagKey, lightRadius, battleProps) => {
            const objs = [...state.objects]
            objs[modal.oi] = { ...objs[modal.oi], flagKey, ...battleProps }
            if (objs[modal.oi].light && lightRadius !== undefined) objs[modal.oi].light!.radius = lightRadius
            set({ objects: objs })
            setModal({type:null,x:0,y:0,ei:-1,oi:-1})
          }}
          onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})} />
      )}
    </div>
  )
}

// ── Teleport Modal ────────────────────────────────────────────────
function TeleportModal({ modal, maps, existing, onPlace, onClose }: { modal: ModalState; maps: GameMap[]; existing: MapEvent|null; onPlace: (e:MapEvent)=>void; onClose:()=>void }) {
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

// ── Terrain Modal ─────────────────────────────────────────────────
function TerrainModal({ modal, existing, onPlace, onRemove, onClose }: { modal:ModalState; existing:MapEvent|null; onPlace:(e:MapEvent)=>void; onRemove:()=>void; onClose:()=>void }) {
  const [sel, setSel] = useState(existing?.terrain || 'forest')
  return (
    <Modal title={`🌿 Terrain at (${modal.x}, ${modal.y})`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">Terrain affects combat on the tactical grid.</p>
      <div className="space-y-2 mb-4">
        {TERRAIN_TYPES.map(t => (
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
        <Button onClick={() => { const t=TERRAIN_TYPES.find(x=>x.id===sel)!; onPlace({ x:modal.x, y:modal.y, type:'TERRAIN', terrain:t.id, data:t.label }) }}>Place Terrain</Button>
      </div>
    </Modal>
  )
}

// ── Object Flags Modal ────────────────────────────────────────────
const BATTLE_DESTROY_TYPES = [
  { value: '', label: 'None (not destructible)' },
  { value: 'fire_aoe', label: 'Fire AoE (explosion)' },
  { value: 'crush', label: 'Crush (damage on tile)' },
  { value: 'remove_cover', label: 'Remove Cover (just breaks)' },
]

function ObjectFlagsModal({ obj, x, y, onSave, onClose }: { obj:MapObject; x:number; y:number; onSave:(flagKey:string|null,r?:number,battleProps?:Partial<MapObject>)=>void; onClose:()=>void }) {
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

// ── MAP LIST ──────────────────────────────────────────────────────
export function MapManagerPanel() {
  const [maps, setMaps]             = useState<GameMap[]>([])
  const [loading, setLoading]       = useState(true)
  const [editing, setEditing]       = useState<GameMap | null>(null)
  const [creating, setCreating]     = useState<Partial<GameMap>>({})
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.entity.getAll('map')
    setMaps((r.data || []) as GameMap[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createMap = async () => {
    if (!creating.name?.trim()) { alert('Name is required'); return }
    const w = creating.width  || 20
    const h = creating.height || 20
    const res = await adminApi.entity.save('map', {
      name: creating.name, width: w, height: h,
      tiles_json:      JSON.stringify(new Array(w*h).fill(0)),
      collisions_json: '[]', objects_json: '[]', anims_json: '[]',
      ambient_dark: 0, tileset_url: null
    } as Record<string,unknown>)
    if (res.success) { await load(); setShowCreate(false); setCreating({}) }
    else alert(res.message || 'Create failed')
  }

  const deleteMap = async (id: number, name: string) => {
    if (!confirm(`Delete map "${name}"?\n\nThis removes the map and all its events. Players currently on this map will be kicked.`)) return
    const res = await adminApi.entity.delete('map', id)
    if (res.success) load()
  }

  if (editing) {
    return <MapEditor map={editing} maps={maps} onExit={() => { setEditing(null); load() }} />
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><MapIcon className="w-5 h-5" /> Map Editor</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{maps.length} map{maps.length!==1?'s':''} — click to edit</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-1" />New Map</Button>
      </div>

      <Help>
        Click a map to open the full editor. The editor has three layers:
        <b> Terrain</b> (paint tiles), <b>Objects</b> (place lights, props, decorations), and <b>Events</b> (NPCs, teleports, shops, loot).
        Always <b>save before switching maps</b> — unsaved changes are lost on exit.
      </Help>

      {showCreate && (
        <div className="p-4 bg-card border border-border rounded-lg mb-4 space-y-3">
          <h3 className="text-sm font-semibold">+ New Map</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs text-muted-foreground">Name</label>
              <Input value={creating.name||''} onChange={e=>setCreating(p=>({...p,name:e.target.value}))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Width (tiles)</label>
              <Input type="number" value={creating.width||20} min={5} max={100} onChange={e=>setCreating(p=>({...p,width:parseInt(e.target.value)||20}))} className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Height (tiles)</label>
              <Input type="number" value={creating.height||20} min={5} max={100} onChange={e=>setCreating(p=>({...p,height:parseInt(e.target.value)||20}))} className="mt-1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Keep new maps small (20×20) until you're comfortable. You can always expand later.</p>
          <div className="flex gap-2">
            <Button onClick={createMap}>Create</Button>
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
