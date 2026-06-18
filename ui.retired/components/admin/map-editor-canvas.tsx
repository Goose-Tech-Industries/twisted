"use client"

import {
  useState, useEffect, useCallback, useRef
} from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Save, ChevronLeft
} from "lucide-react"
import { cn } from "@/lib/utils"
// Socket.IO removed — admin panel moved to Phoenix LiveView (/sauce)
type Socket = { on: Function; emit: Function; disconnect: Function; connected: boolean }
const io = (..._args: unknown[]): Socket => ({ on() {}, emit() {}, disconnect() {}, connected: false })
import { EventScriptEditor, jsonToBlocks, blocksToJson } from "./event-script-editor"
import { generateDungeon, generateCave, generateMaze } from "./map-generator"
import { Modal, TeleportModal, TerrainModal, ObjectFlagsModal } from "./map-editor-modals"
import {
  EDITOR_TILE, PICKER_TILE,
  OBJECT_PRESETS, EVENT_ICONS, TILE_COLORS, TILE_NAMES,
  TERRAIN_TYPES_FALLBACK, ELEVATION_LEVELS,
  type GameMap, type MapEvent, type MapObject, type MapAnim,
  type NPC, type Shop, type Item,
  type Layer, type EventTool, type ModalState, type ModalType,
} from "./map-manager-panel"

// ── MAP EDITOR ────────────────────────────────────────────────────
type TileTool = 'PAINT' | 'FILL' | 'RECT' | 'ERASER' | 'EYEDROP' | 'PASSABILITY' | 'AUTOTILE' | 'ELEVATION' | 'SELECT'

interface AutotileGroup {
  id: number; name: string; icon: string; base_tile: number
  tileMap: Record<string, number> // bitmask string → tile index
}

interface EditorState {
  tiles: number[]
  tilesOverlay: number[]  // Layer 2 (overlay/fringe tiles)
  passability: number[]   // 0=walkable, 1=blocked, 2=event-trigger
  elevation: number[]     // 0-3 height per tile (for battle grid)
  events: MapEvent[]
  objects: MapObject[]
  anims: MapAnim[]
  layer: Layer
  tilesFringe: number[]     // Layer 3 (renders ABOVE the player — tree tops, roofs)
  tileLayer: 'ground' | 'overlay' | 'fringe'
  brush: number
  tool: EventTool
  tileTool: TileTool
  brushSize: number
  objectPreset: string
  zoom: number
  ambientDark: number
  tilesetUrl: string
  tilesetLoaded: boolean
  tilesetCols: number
  tilesetSrc: string
  painting: boolean
  dirty: boolean
  showGrid: boolean
  showPassability: boolean
  showElevation: boolean
  elevationBrush: number
  showEvents: boolean
  showObjects: boolean
  rectStart: { x: number; y: number } | null
  clipboard: { tiles: number[]; width: number; height: number; sx: number; sy: number } | null
  selecting: boolean
  selStart: { x: number; y: number } | null
  selEnd: { x: number; y: number } | null
  selection: { x: number; y: number; w: number; h: number; tiles: number[]; overlay: number[]; fringe: number[]; passability: number[]; elevation: number[] } | null
  selDragging: boolean
  selDragStart: { x: number; y: number } | null
}

export default function MapEditorCanvas({ map, maps, onExit }: { map: GameMap; maps: GameMap[]; onExit: () => void }) {
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
    // Parse overlay layer (stored in tiles_json as second array if present)
    let tilesOverlay: number[] = new Array(map.width * map.height).fill(-1)
    let tilesFringe: number[] = new Array(map.width * map.height).fill(-1)
    let passability: number[] = new Array(map.width * map.height).fill(0)
    let elevation: number[] = new Array(map.width * map.height).fill(0)
    try {
      const parsed = JSON.parse(map.tiles_json || '[]')
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        tiles = parsed[0] || tiles
        tilesOverlay = parsed[1] || tilesOverlay
        passability = parsed[2] || passability
        tilesFringe = parsed[3] || tilesFringe
        elevation = parsed[4] || elevation
      }
    } catch {}

    return {
      tiles, tilesOverlay, tilesFringe, passability, elevation, events, objects, anims,
      layer: 'TILES', tileLayer: 'ground' as const, brush: 0, tool: 'NPC',
      tileTool: 'PAINT' as TileTool, brushSize: 1, objectPreset: 'LANTERN',
      zoom: 1, ambientDark: map.ambient_dark || 0, tilesetUrl: map.tileset_url || '',
      tilesetLoaded: false, tilesetCols: 0, tilesetSrc: '', painting: false, dirty: false,
      showGrid: true, showPassability: false, showElevation: false, elevationBrush: 0,
      showEvents: true, showObjects: true, rectStart: null,
      clipboard: null, selecting: false, selStart: null, selEnd: null,
      selection: null, selDragging: false, selDragStart: null
    }
  })

  const [npcs, setNpcs]   = useState<NPC[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [terrainTypes, setTerrainTypes] = useState<Array<{id:string;label:string;icon:string;desc:string}>>(TERRAIN_TYPES_FALLBACK)
  const [spawnZones, setSpawnZones] = useState<Array<{id:number;name:string;x_min:number;y_min:number;x_max:number;y_max:number;encounter_rate:number;enabled:boolean}>>([])
  const [showSpawnZones, setShowSpawnZones] = useState(false)
  const [showNpcPaths, setShowNpcPaths] = useState(false)
  const [npcPatrols, setNpcPatrols] = useState<Array<{name:string;icon:string;x:number;y:number;move_type:string;wander_radius:number}>>([])

  const [tilesetAssets, setTilesetAssets] = useState<Array<{id:number;original_name:string;file_url:string}>>([])
  const [showTilesetPicker, setShowTilesetPicker] = useState(false)
  const [autotileGroups, setAutotileGroups] = useState<AutotileGroup[]>([])
  const [selectedAutotile, setSelectedAutotile] = useState<number>(0)
  const [modal, setModal] = useState<ModalState>({ type: null, x:0, y:0, ei:-1, oi:-1 })
  const [hoveredCell, setHoveredCell] = useState<{x:number;y:number;tile:number} | null>(null)

  // DB-driven tile palette (overrides hardcoded TILE_COLORS/TILE_NAMES)
  const [dbTileColors, setDbTileColors] = useState<string[]>(TILE_COLORS)
  const [dbTileNames, setDbTileNames] = useState<string[]>(TILE_NAMES)
  const [dbTileCategories, setDbTileCategories] = useState<Array<{ label: string; start: number; end: number }>>([])
  useEffect(() => {
    fetch('/admin/tile-palette', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (!data.success || !data.tiles?.length) return
        const colors: string[] = []
        const names: string[] = []
        const catMap = new Map<string, { start: number; end: number }>()
        for (const t of data.tiles) {
          colors[t.id] = t.color
          names[t.id] = t.name
          const existing = catMap.get(t.category)
          if (existing) { existing.end = Math.max(existing.end, t.id) }
          else { catMap.set(t.category, { start: t.id, end: t.id }) }
        }
        setDbTileColors(colors)
        setDbTileNames(names)
        setDbTileCategories([...catMap.entries()].map(([label, range]) => ({ label, ...range })))
      })
      .catch(() => {})
  }, [])

  // Undo/Redo stack
  const [undoStack, setUndoStack] = useState<number[][]>([])
  const [redoStack, setRedoStack] = useState<number[][]>([])
  const pushUndo = (tiles: number[]) => {
    setUndoStack(prev => [...prev.slice(-19), [...tiles]])
    setRedoStack([])
  }
  const undo = () => {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(r => [...r, [...state.tiles]])
    setUndoStack(u => u.slice(0, -1))
    set({ tiles: prev })
  }
  const redo = () => {
    if (!redoStack.length) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(u => [...u, [...state.tiles]])
    setRedoStack(r => r.slice(0, -1))
    set({ tiles: next })
  }

  // Flood fill tool
  const floodFill = (startIdx: number, targetTile: number, replaceTile: number) => {
    if (targetTile === replaceTile) return state.tiles
    const tiles = [...state.tiles]
    const w = map.width, h = map.height
    const queue = [startIdx]
    const visited = new Set<number>()
    let count = 0
    while (queue.length && count < 500) {
      const idx = queue.shift()!
      if (visited.has(idx) || tiles[idx] !== targetTile) continue
      visited.add(idx)
      tiles[idx] = replaceTile
      count++
      const x = idx % w, y = Math.floor(idx / w)
      if (x > 0) queue.push(idx - 1)
      if (x < w - 1) queue.push(idx + 1)
      if (y > 0) queue.push(idx - w)
      if (y < h - 1) queue.push(idx + w)
    }
    return tiles
  }

  // Multi-tile brush paint
  const paintBrush = (cx: number, cy: number, tiles: number[]) => {
    const size = state.brushSize
    const half = Math.floor(size / 2)
    const newTiles = [...tiles]
    for (let dy = -half; dy < size - half; dy++) {
      for (let dx = -half; dx < size - half; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
          newTiles[ny * map.width + nx] = state.brush
        }
      }
    }
    return newTiles
  }
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [parallaxUrl, setParallaxUrl] = useState(map.parallax_url || '')
  const [parallaxSpeedX, setParallaxSpeedX] = useState(map.parallax_speed_x || 0.5)
  const [parallaxSpeedY, setParallaxSpeedY] = useState(map.parallax_speed_y || 0.25)
  const [fogOfWar, setFogOfWar] = useState(!!map.fog_of_war)
  const [fogRadius, setFogRadius] = useState(map.fog_reveal_radius || 3)
  const [ambientSoundUrl, setAmbientSoundUrl] = useState(map.ambient_sound_url || '')
  const [neighborNorth, setNeighborNorth] = useState<number | null>((map as unknown as Record<string,unknown>).neighbor_north as number | null)
  const [neighborSouth, setNeighborSouth] = useState<number | null>((map as unknown as Record<string,unknown>).neighbor_south as number | null)
  const [neighborEast, setNeighborEast] = useState<number | null>((map as unknown as Record<string,unknown>).neighbor_east as number | null)
  const [neighborWest, setNeighborWest] = useState<number | null>((map as unknown as Record<string,unknown>).neighbor_west as number | null)
  const [zoneType, setZoneType] = useState<string>((map as unknown as Record<string,unknown>).zone_type as string || 'WORLD')
  const [renderMode, setRenderMode] = useState<string>((map as unknown as Record<string,unknown>).render_mode as string || 'classic')
  const [spawnX, setSpawnX] = useState<number>((map as unknown as Record<string,unknown>).spawn_x as number || Math.floor(map.width / 2))
  const [spawnY, setSpawnY] = useState<number>((map as unknown as Record<string,unknown>).spawn_y as number || Math.floor(map.height / 2))
  const [showAdvanced, setShowAdvanced] = useState(false)
  // Collaborative editing
  const [collabEditors, setCollabEditors] = useState<Array<{username:string;color:string}>>([])
  const [collabCursors, setCollabCursors] = useState<Record<string, {username:string;color:string;x:number;y:number}>>({})
  const collabSocketRef = useRef<Socket | null>(null)

  useEffect(() => {
    const socketUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin
    const sock = io(socketUrl, { withCredentials: true, transports: ['websocket', 'polling'] })
    collabSocketRef.current = sock

    sock.on('connect', () => {
      sock.emit('map_editor_join', { mapId: map.id })
    })

    sock.on('map_editor_presence', (editors: Array<{username:string;color:string}>) => {
      setCollabEditors(editors)
    })

    sock.on('map_editor_cursor_update', (data: {socketId:string;username:string;color:string;x:number;y:number}) => {
      setCollabCursors(prev => ({ ...prev, [data.socketId]: data }))
    })

    sock.on('map_editor_tile_change', (data: {layer:string; changes:Array<{index:number;value:number}>}) => {
      setState(prev => {
        const key = data.layer as keyof EditorState
        if (!Array.isArray(prev[key])) return prev
        const arr = [...(prev[key] as number[])]
        for (const c of data.changes) arr[c.index] = c.value
        return { ...prev, [key]: arr }
      })
    })

    sock.on('map_editor_event_change', (data: {events:MapEvent[]}) => {
      setState(prev => ({ ...prev, events: data.events }))
    })

    sock.on('map_editor_object_change', (data: {objects:MapObject[]}) => {
      setState(prev => ({ ...prev, objects: data.objects }))
    })

    return () => {
      sock.emit('map_editor_leave')
      sock.disconnect()
    }
  }, [map.id])

  // Broadcast tile changes to other editors
  const broadcastTileChange = useCallback((layer: string, changes: Array<{index:number;value:number}>) => {
    collabSocketRef.current?.emit('map_editor_tile_change', { layer, changes })
  }, [])

  // Inline playtest mode
  const [playtestMode, setPlaytestMode] = useState(false)
  const [playerPos, setPlayerPos] = useState({ x: map.spawn_x || 0, y: map.spawn_y || 0 })

  const movePlayer = useCallback((dx: number, dy: number) => {
    if (!playtestMode) return
    setPlayerPos(prev => {
      const nx = prev.x + dx, ny = prev.y + dy
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) return prev
      const idx = ny * map.width + nx
      if (state.passability[idx] === 1) return prev // blocked
      // Check for events at destination
      const ev = state.events.find(e => e.x === nx && e.y === ny)
      if (ev) {
        if (ev.type === 'TELEPORT' && ev.data) {
          const parts = String(ev.data).split(',')
          const destMap = maps.find(m => m.id === parseInt(parts[0]))
          alert(`🚪 Teleport → ${destMap?.name || 'Map #'+parts[0]} at (${parts[1]||0}, ${parts[2]||0})`)
        } else if (ev.type === 'NPC') {
          alert(`👤 NPC: ${ev.data || 'Talk interaction'}`)
        } else if (ev.type === 'ENEMY') {
          alert(`⚔️ Enemy encounter! ${ev.data || ''}`)
        } else if (ev.type === 'SHOP') {
          alert(`🏪 Shop: ${ev.data || 'Opens shop'}`)
        } else if (ev.type === 'LOOT') {
          alert(`💎 Loot: Item #${ev.data || '?'}`)
        }
      }
      return { x: nx, y: ny }
    })
  }, [playtestMode, map.width, map.height, state.passability, state.events, maps])

  // Keyboard controls for playtest
  useEffect(() => {
    if (!playtestMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); movePlayer(0, -1) }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); movePlayer(0, 1) }
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); movePlayer(-1, 0) }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); movePlayer(1, 0) }
      if (e.key === 'Escape') setPlaytestMode(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [playtestMode, movePlayer])

  const [showResize, setShowResize] = useState(false)
  const [resizeW, setResizeW] = useState(map.width)
  const [resizeH, setResizeH] = useState(map.height)
  const [resizeAnchor, setResizeAnchor] = useState<'top-left'|'top-right'|'bottom-left'|'bottom-right'|'center'>('top-left')

  const applyResize = () => {
    const newW = Math.min(Math.max(resizeW, 5), 200)
    const newH = Math.min(Math.max(resizeH, 5), 200)
    if (newW === map.width && newH === map.height) return

    const resizeLayer = (old: number[], fill: number) => {
      const result = new Array(newW * newH).fill(fill)
      // Calculate offset based on anchor
      let offX = 0, offY = 0
      if (resizeAnchor === 'top-right' || resizeAnchor === 'bottom-right') offX = newW - map.width
      if (resizeAnchor === 'bottom-left' || resizeAnchor === 'bottom-right') offY = newH - map.height
      if (resizeAnchor === 'center') { offX = Math.floor((newW - map.width) / 2); offY = Math.floor((newH - map.height) / 2) }
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const nx = x + offX, ny = y + offY
          if (nx >= 0 && nx < newW && ny >= 0 && ny < newH) {
            result[ny * newW + nx] = old[y * map.width + x]
          }
        }
      }
      return result
    }

    const resizeEvents = (events: MapEvent[]) => {
      let offX = 0, offY = 0
      if (resizeAnchor === 'top-right' || resizeAnchor === 'bottom-right') offX = newW - map.width
      if (resizeAnchor === 'bottom-left' || resizeAnchor === 'bottom-right') offY = newH - map.height
      if (resizeAnchor === 'center') { offX = Math.floor((newW - map.width) / 2); offY = Math.floor((newH - map.height) / 2) }
      return events.map(e => ({ ...e, x: e.x + offX, y: e.y + offY }))
        .filter(e => e.x >= 0 && e.x < newW && e.y >= 0 && e.y < newH)
    }

    const resizeObjects = (objects: MapObject[]) => {
      let offX = 0, offY = 0
      if (resizeAnchor === 'top-right' || resizeAnchor === 'bottom-right') offX = newW - map.width
      if (resizeAnchor === 'bottom-left' || resizeAnchor === 'bottom-right') offY = newH - map.height
      if (resizeAnchor === 'center') { offX = Math.floor((newW - map.width) / 2); offY = Math.floor((newH - map.height) / 2) }
      return objects.map(o => ({ ...o, x: o.x + offX, y: o.y + offY }))
        .filter(o => o.x >= 0 && o.x < newW && o.y >= 0 && o.y < newH)
    }

    set({
      tiles: resizeLayer(state.tiles, 0),
      tilesOverlay: resizeLayer(state.tilesOverlay, -1),
      tilesFringe: resizeLayer(state.tilesFringe, -1),
      passability: resizeLayer(state.passability, 0),
      elevation: resizeLayer(state.elevation, 0),
      events: resizeEvents(state.events),
      objects: resizeObjects(state.objects),
    })
    map.width = newW
    map.height = newH
    setShowResize(false)
  }

  const tilesetImgRef = useRef<HTMLImageElement | null>(null)
  const pickerRef = useRef<HTMLCanvasElement>(null)

  // Load lookup data
  useEffect(() => {
    adminApi.entity.getAll('npc').then(r => setNpcs((r.data || []) as NPC[])).catch(() => {})
    adminApi.entity.getAll('shop').then(r => setShops((r.data || []) as Shop[])).catch(() => {})
    adminApi.entity.getAll('item').then(r => setItems((r.data || []) as Item[])).catch(() => {})
    // Load spawn zones for this map
    adminApi.entity.getAll('spawn').then(r => {
      const all = (r.data || []) as Array<Record<string, unknown>>
      setSpawnZones(all.filter(s => Number(s.map_id) === map.id).map(s => ({
        id: Number(s.id), name: String(s.name || 'Zone'),
        x_min: Number(s.x_min || 0), y_min: Number(s.y_min || 0),
        x_max: Number(s.x_max || 10), y_max: Number(s.y_max || 10),
        encounter_rate: Number(s.encounter_rate || 10),
        enabled: !!s.enabled,
      })))
    }).catch(() => {})
    // Load NPC positions for patrol visualization
    adminApi.entity.getAll('npc').then(r => {
      const all = (r.data || []) as Array<Record<string, unknown>>
      setNpcPatrols(all.filter(n => Number(n.map_id) === map.id).map(n => ({
        name: String(n.name), icon: String(n.icon || '👤'),
        x: Number(n.x || 0), y: Number(n.y || 0),
        move_type: String(n.move_type || 'STATIONARY'),
        wander_radius: Number(n.wander_radius || 3),
      })))
    }).catch(() => {})
    // Load tileset assets
    const assetsApi = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${assetsApi}/assets-api/list?category=tileset`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.assets) {
          setTilesetAssets(data.assets.map((a: Record<string,unknown>) => ({
            id: Number(a.id), original_name: String(a.original_name || a.filename), file_url: String(a.file_url)
          })))
        }
      })
      .catch(() => {})
    // Load terrain types from DB
    adminApi.entity.getAll('battle_terrain').then(r => {
      const rows = (r.data || []) as Array<Record<string, unknown>>
      if (rows.length > 0) {
        setTerrainTypes(rows.map(t => ({
          id: String(t.name || t.id),
          label: String(t.name || ''),
          icon: String(t.icon || '🟩'),
          desc: String(t.description || `Movement: ${t.movement_cost_mult}x`),
        })))
      }
    }).catch(() => {})
    // Load autotile groups
    const API = process.env.NEXT_PUBLIC_API_URL || ''
    fetch(`${API}/admin-panel/autotile_group`, { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(d => {
        if (d.success && d.data) {
          setAutotileGroups(d.data.map((g: Record<string, unknown>) => {
            let tileMap = {}
            try { tileMap = typeof g.tile_map === 'string' ? JSON.parse(g.tile_map as string) : (g.tile_map || {}) } catch {}
            return { id: g.id, name: g.name, icon: g.icon || '🔲', base_tile: g.base_tile, tileMap }
          }))
        }
      }).catch(e => console.warn('[MapEditor] Autotile groups load failed:', e))
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

  // Auto-tiling: 8-neighbor bitmask for full corner support (47 unique tiles)
  const getAutotileBitmask = (tiles: number[], x: number, y: number, group: AutotileGroup) => {
    const w = map.width, h = map.height
    const baseTiles = Object.values(group.tileMap).concat([group.base_tile])
    const isSame = (nx: number, ny: number) => {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return true
      return baseTiles.includes(tiles[ny * w + nx])
    }
    const n = isSame(x, y-1), e = isSame(x+1, y), s = isSame(x, y+1), w_ = isSame(x-1, y)
    const ne = n && e && isSame(x+1, y-1)
    const se = s && e && isSame(x+1, y+1)
    const sw = s && w_ && isSame(x-1, y+1)
    const nw = n && w_ && isSame(x-1, y-1)

    let mask = 0
    if (n)  mask |= 1;   if (ne) mask |= 2
    if (e)  mask |= 4;   if (se) mask |= 8
    if (s)  mask |= 16;  if (sw) mask |= 32
    if (w_) mask |= 64;  if (nw) mask |= 128

    const groupSize = Object.keys(group.tileMap).length
    if (groupSize <= 16) {
      let simple = 0
      if (n)  simple |= 1
      if (e)  simple |= 2
      if (s)  simple |= 4
      if (w_) simple |= 8
      return simple
    }
    return mask
  }

  // Paint an auto-tile and update all neighbors
  const paintAutotile = (cx: number, cy: number, tiles: number[], group: AutotileGroup) => {
    const w = map.width, h = map.height
    const newTiles = [...tiles]
    const size = state.brushSize
    const half = Math.floor(size / 2)

    for (let dy = -half; dy < size - half; dy++) {
      for (let dx = -half; dx < size - half; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          newTiles[ny * w + nx] = group.base_tile
        }
      }
    }

    const toRecalc = new Set<string>()
    for (let dy = -half - 1; dy < size - half + 1; dy++) {
      for (let dx = -half - 1; dx < size - half + 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          toRecalc.add(`${nx},${ny}`)
        }
      }
    }

    for (const key of toRecalc) {
      const [px, py] = key.split(',').map(Number)
      const idx = py * w + px
      const allGroupTiles = Object.values(group.tileMap).concat([group.base_tile])
      if (!allGroupTiles.includes(newTiles[idx])) continue
      const mask = getAutotileBitmask(newTiles, px, py, group)
      const variant = group.tileMap[String(mask)]
      if (variant !== undefined) newTiles[idx] = variant
    }

    return newTiles
  }

  // Copy selection to clipboard
  const copySelection = () => {
    if (!state.selStart || !state.selEnd) return
    const sx = Math.min(state.selStart.x, state.selEnd.x), ex = Math.max(state.selStart.x, state.selEnd.x)
    const sy = Math.min(state.selStart.y, state.selEnd.y), ey = Math.max(state.selStart.y, state.selEnd.y)
    const w = ex - sx + 1, h = ey - sy + 1
    const tiles: number[] = []
    for (let y = sy; y <= ey; y++) {
      for (let x = sx; x <= ex; x++) {
        tiles.push(state.tiles[y * map.width + x])
      }
    }
    set({ clipboard: { tiles, width: w, height: h, sx, sy } })
  }

  // Paste clipboard at position
  const pasteClipboard = (px: number, py: number) => {
    if (!state.clipboard) return
    pushUndo(state.tiles)
    const tiles = [...state.tiles]
    const { width: cw, height: ch, tiles: ct } = state.clipboard
    for (let dy = 0; dy < ch; dy++) {
      for (let dx = 0; dx < cw; dx++) {
        const tx = px + dx, ty = py + dy
        if (tx < map.width && ty < map.height) {
          tiles[ty * map.width + tx] = ct[dy * cw + dx]
        }
      }
    }
    set({ tiles })
  }

  // Custom saved stamps (persisted to localStorage)
  const [savedStamps, setSavedStamps] = useState<Array<{ name: string; tiles: number[]; width: number; height: number }>>([])
  useEffect(() => {
    try { const s = localStorage.getItem('map_stamps'); if (s) setSavedStamps(JSON.parse(s)) } catch {}
  }, [])

  const saveStamp = () => {
    if (!state.clipboard) return
    const name = prompt('Name this stamp:')
    if (!name?.trim()) return
    const stamp = { name: name.trim(), tiles: state.clipboard.tiles, width: state.clipboard.width, height: state.clipboard.height }
    const newStamps = [...savedStamps, stamp]
    setSavedStamps(newStamps)
    try { localStorage.setItem('map_stamps', JSON.stringify(newStamps)) } catch {}
  }

  const deleteStamp = (idx: number) => {
    const newStamps = savedStamps.filter((_, i) => i !== idx)
    setSavedStamps(newStamps)
    try { localStorage.setItem('map_stamps', JSON.stringify(newStamps)) } catch {}
  }

  const loadStamp = (stamp: { tiles: number[]; width: number; height: number }) => {
    set({ clipboard: { ...stamp, sx: 0, sy: 0 } })
  }

  // Map room templates — pre-built layouts admins can stamp
  const MAP_TEMPLATES = [
    { name: '🏠 Room 5x5', w: 5, h: 5, gen: (wall: number, floor: number) => {
      const t: number[] = []
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++)
        t.push((x === 0 || x === 4 || y === 0 || y === 4) ? wall : floor)
      return t
    }},
    { name: '🏰 Room 8x6', w: 8, h: 6, gen: (wall: number, floor: number) => {
      const t: number[] = []
      for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++)
        t.push((x === 0 || x === 7 || y === 0 || y === 5) ? wall : floor)
      return t
    }},
    { name: '🌲 Forest Clearing', w: 7, h: 7, gen: (_wall: number, floor: number) => {
      const t: number[] = []
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const dist = Math.sqrt((x-3)**2 + (y-3)**2)
        t.push(dist <= 2.5 ? floor : floor + 1)
      }
      return t
    }},
    { name: '➡️ Corridor H', w: 8, h: 3, gen: (wall: number, floor: number) => {
      const t: number[] = []
      for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++)
        t.push(y === 1 ? floor : wall)
      return t
    }},
    { name: '⬇️ Corridor V', w: 3, h: 8, gen: (wall: number, floor: number) => {
      const t: number[] = []
      for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++)
        t.push(x === 1 ? floor : wall)
      return t
    }},
  ]

  const stampTemplate = (tmpl: typeof MAP_TEMPLATES[0], px: number, py: number) => {
    pushUndo(state.tiles)
    const tiles = [...state.tiles]
    const generated = tmpl.gen(state.brush, state.brush > 0 ? state.brush - 1 : 0)
    for (let dy = 0; dy < tmpl.h; dy++) {
      for (let dx = 0; dx < tmpl.w; dx++) {
        const tx = px + dx, ty = py + dy
        if (tx < map.width && ty < map.height) {
          tiles[ty * map.width + tx] = generated[dy * tmpl.w + dx]
        }
      }
    }
    set({ tiles })
  }

  // Keyboard shortcuts (undo/redo, copy/paste)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); copySelection() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && state.clipboard) {
        e.preventDefault()
        if (hoveredCell) pasteClipboard(hoveredCell.x, hoveredCell.y)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

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
      // Playtest mode — click adjacent tile to move there
      if (playtestMode) {
        const dx = x - playerPos.x, dy = y - playerPos.y
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx !== 0 || dy !== 0)) {
          movePlayer(dx, dy)
        }
        return
      }

      // Select tool — rectangular selection + drag move
      if (state.tileTool === 'SELECT') {
        if (state.selection) {
          const sel = state.selection
          if (x >= sel.x && x < sel.x + sel.w && y >= sel.y && y < sel.y + sel.h) {
            set({ selDragging: true, selDragStart: { x, y } })
            return
          }
          commitSelection()
        }
        set({ selStart: { x, y }, selEnd: { x, y }, selection: null })
        return
      }

      // Eyedropper — pick tile under cursor
      if (state.tileTool === 'EYEDROP') {
        const activeTiles = state.tileLayer === 'fringe' ? state.tilesFringe : state.tileLayer === 'overlay' ? state.tilesOverlay : state.tiles
        set({ brush: activeTiles[i], tileTool: 'PAINT' })
        return
      }
      // Passability painting
      if (state.tileTool === 'PASSABILITY') {
        const pass = [...state.passability]
        pass[i] = (pass[i] + 1) % 3
        set({ passability: pass })
        return
      }
      // Elevation painting
      if (state.tileTool === 'ELEVATION') {
        const elev = [...state.elevation]
        const half = Math.floor(state.brushSize / 2)
        for (let dy = -half; dy < state.brushSize - half; dy++) {
          for (let dx = -half; dx < state.brushSize - half; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
              elev[ny * map.width + nx] = state.elevationBrush
            }
          }
        }
        set({ elevation: elev })
        return
      }
      const activeTiles = state.tileLayer === 'fringe' ? state.tilesFringe : state.tileLayer === 'overlay' ? state.tilesOverlay : state.tiles
      pushUndo(activeTiles)
      const layerKey = state.tileLayer === 'fringe' ? 'tilesFringe' : state.tileLayer === 'overlay' ? 'tilesOverlay' : 'tiles'
      const eraseVal = state.tileLayer === 'ground' ? 0 : -1

      // Auto-tile mode
      if (state.tileTool === 'AUTOTILE' && autotileGroups[selectedAutotile]) {
        const group = autotileGroups[selectedAutotile]
        set({ [layerKey]: paintAutotile(x, y, activeTiles, group) } as Partial<EditorState>)
        return
      }

      if (state.tileTool === 'FILL') {
        const filled = floodFill(i, activeTiles[i], state.brush)
        set({ [layerKey]: filled } as Partial<EditorState>)
      } else if (state.tileTool === 'RECT') {
        if (!state.rectStart) {
          set({ rectStart: { x, y } })
        } else {
          const sx = Math.min(state.rectStart.x, x), ex = Math.max(state.rectStart.x, x)
          const sy = Math.min(state.rectStart.y, y), ey = Math.max(state.rectStart.y, y)
          const tiles = [...activeTiles]
          for (let ry = sy; ry <= ey; ry++) {
            for (let rx = sx; rx <= ex; rx++) {
              tiles[ry * map.width + rx] = state.brush
            }
          }
          set({ [layerKey]: tiles, rectStart: null } as Partial<EditorState>)
        }
      } else if (state.tileTool === 'ERASER') {
        const tiles = [...activeTiles]
        const half = Math.floor(state.brushSize / 2)
        for (let dy = -half; dy < state.brushSize - half; dy++) {
          for (let dx = -half; dx < state.brushSize - half; dx++) {
            const nx = x + dx, ny = y + dy
            if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) tiles[ny * map.width + nx] = eraseVal
          }
        }
        set({ [layerKey]: tiles } as Partial<EditorState>)
      } else {
        set({ [layerKey]: paintBrush(x, y, activeTiles) } as Partial<EditorState>)
      }
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
    collabSocketRef.current?.emit('map_editor_cursor', { x, y })
    if (state.painting && state.layer === 'TILES' && state.tileTool === 'AUTOTILE' && autotileGroups[selectedAutotile]) {
      const group = autotileGroups[selectedAutotile]
      const layerKey = state.tileLayer === 'overlay' ? 'tilesOverlay' : 'tiles'
      const activeTiles = state.tileLayer === 'fringe' ? state.tilesFringe : state.tileLayer === 'overlay' ? state.tilesOverlay : state.tiles
      set({ [layerKey]: paintAutotile(x, y, activeTiles, group) } as Partial<EditorState>)
    }
    if (state.painting && state.layer === 'TILES' && (state.tileTool === 'PAINT' || state.tileTool === 'ERASER')) {
      if (state.tileTool === 'ERASER') {
        const tiles = [...state.tiles]; tiles[i] = 0; set({ tiles })
      } else {
        set({ tiles: paintBrush(x, y, state.tiles) })
      }
    }
    // Select tool drag
    if (state.layer === 'TILES' && state.tileTool === 'SELECT') {
      if (state.selDragging && state.selection && state.selDragStart) {
        const dx = x - state.selDragStart.x
        const dy = y - state.selDragStart.y
        if (dx !== 0 || dy !== 0) {
          set({
            selection: { ...state.selection, x: state.selection.x + dx, y: state.selection.y + dy },
            selDragStart: { x, y },
          })
        }
        return
      }
      if (state.painting && state.selStart) {
        set({ selEnd: { x, y } })
        return
      }
    }
    // Elevation drag painting
    if (state.painting && state.layer === 'TILES' && state.tileTool === 'ELEVATION') {
      const elev = [...state.elevation]
      const half = Math.floor(state.brushSize / 2)
      for (let dy = -half; dy < state.brushSize - half; dy++) {
        for (let dx = -half; dx < state.brushSize - half; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
            elev[ny * map.width + nx] = state.elevationBrush
          }
        }
      }
      set({ elevation: elev })
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
      tiles_json:      JSON.stringify([state.tiles, state.tilesOverlay, state.passability, state.tilesFringe, state.elevation]),
      collisions_json: JSON.stringify(state.events),
      objects_json:    JSON.stringify(state.objects),
      anims_json:      JSON.stringify(state.anims),
      ambient_dark:    state.ambientDark,
      tileset_url:     state.tilesetUrl || null,
      parallax_url:    parallaxUrl || null,
      parallax_speed_x: parallaxSpeedX,
      parallax_speed_y: parallaxSpeedY,
      fog_of_war:      fogOfWar ? 1 : 0,
      fog_reveal_radius: fogRadius,
      ambient_sound_url: ambientSoundUrl || null,
      neighbor_north: neighborNorth || null,
      neighbor_south: neighborSouth || null,
      neighbor_east:  neighborEast  || null,
      neighbor_west:  neighborWest  || null,
      zone_type:     zoneType || 'WORLD',
      render_mode:   renderMode || 'classic',
      spawn_x:       spawnX,
      spawn_y:       spawnY,
    }
    const r = await adminApi.entity.save('map', payload as Record<string,unknown>, map.id)
    if (r.success) {
      await fetch(`/admin/clear-cache`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ mapId: map.id }) }).catch(()=>{})
      setSaveMsg('✅ Saved!'); setState(prev => ({ ...prev, dirty: false }))
      setTimeout(() => setSaveMsg(''), 2000)
    } else { setSaveMsg('❌ ' + (r.message || 'Save failed')) }
    setSaving(false)
  }

  // Selection helpers
  const finalizeSelection = () => {
    if (!state.selStart || !state.selEnd) return
    const x1 = Math.min(state.selStart.x, state.selEnd.x)
    const y1 = Math.min(state.selStart.y, state.selEnd.y)
    const x2 = Math.max(state.selStart.x, state.selEnd.x)
    const y2 = Math.max(state.selStart.y, state.selEnd.y)
    const w = x2 - x1 + 1, h = y2 - y1 + 1
    const tiles: number[] = [], overlay: number[] = [], fringe: number[] = [], pass: number[] = [], elev: number[] = []
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const idx = (y1 + dy) * map.width + (x1 + dx)
        tiles.push(state.tiles[idx] || 0)
        overlay.push(state.tilesOverlay[idx] ?? -1)
        fringe.push(state.tilesFringe[idx] ?? -1)
        pass.push(state.passability[idx] || 0)
        elev.push(state.elevation[idx] || 0)
      }
    }
    set({ selection: { x: x1, y: y1, w, h, tiles, overlay, fringe, passability: pass, elevation: elev }, selStart: null, selEnd: null })
  }

  const commitSelection = () => {
    if (!state.selection) return
    const sel = state.selection
    pushUndo(state.tiles)
    const newTiles = [...state.tiles], newOverlay = [...state.tilesOverlay], newFringe = [...state.tilesFringe]
    const newPass = [...state.passability], newElev = [...state.elevation]
    for (let dy = 0; dy < sel.h; dy++) {
      for (let dx = 0; dx < sel.w; dx++) {
        const nx = sel.x + dx, ny = sel.y + dy
        if (nx >= 0 && nx < map.width && ny >= 0 && ny < map.height) {
          const di = ny * map.width + nx
          const si = dy * sel.w + dx
          newTiles[di] = sel.tiles[si]
          newOverlay[di] = sel.overlay[si]
          newFringe[di] = sel.fringe[si]
          newPass[di] = sel.passability[si]
          newElev[di] = sel.elevation[si]
        }
      }
    }
    set({ tiles: newTiles, tilesOverlay: newOverlay, tilesFringe: newFringe, passability: newPass, elevation: newElev, selection: null, selDragging: false })
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
    return { ...base, background: dbTileColors[tv] || '#333' }
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
        {collabEditors.length > 1 && (
          <div className="flex items-center gap-1 ml-1">
            {collabEditors.map((e, i) => (
              <span key={i} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded border border-border/30" style={{ color: e.color }}>
                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: e.color }} />
                {e.username}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">🔍</span>
          <input type="range" min={0.5} max={3} step={0.5} value={state.zoom}
            onChange={e => setState(prev => ({ ...prev, zoom: parseFloat(e.target.value) }))}
            className="w-20 accent-primary" />
          <span className="text-xs text-muted-foreground w-6">{state.zoom}×</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {saveMsg && <span className="text-xs font-medium">{saveMsg}</span>}
          {/* Version history */}
          <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={async () => {
            const API = process.env.NEXT_PUBLIC_API_URL || ''
            const r = await fetch(`${API}/admin-panel/map-versions/${map.id}`, { credentials: 'include' }).then(r => r.json())
            if (r.success && r.versions?.length) {
              const list = r.versions.map((v: Record<string,unknown>) => `v${v.version_num} — ${new Date(String(v.created_at)).toLocaleString()}`).join('\n')
              const pick = prompt(`Map Versions (${r.versions.length}):\n\n${list}\n\nEnter version number to revert (or cancel):`)
              if (pick) {
                const ver = r.versions.find((v: Record<string,unknown>) => String(v.version_num) === pick)
                if (ver && confirm(`Revert to version ${pick}? This will replace current map data.`)) {
                  const rev = await fetch(`${API}/admin-panel/map-versions/${map.id}/revert/${ver.id}`, { method: 'POST', credentials: 'include' }).then(r => r.json())
                  if (rev.success) { alert('Reverted! Reloading map...'); onExit() }
                  else alert(rev.message || 'Revert failed')
                }
              }
            } else alert('No saved versions yet. Versions are created each time you save.')
          }} title="View version history and revert">
            📋 History
          </Button>
          {/* Export */}
          <Button size="sm" variant="outline" className="text-[10px] h-7" onClick={async () => {
            const API = process.env.NEXT_PUBLIC_API_URL || ''
            const r = await fetch(`${API}/admin-panel/map-export/${map.id}`, { credentials: 'include' }).then(r => r.json())
            if (r.success) {
              const blob = new Blob([JSON.stringify(r.export, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a'); a.href = url; a.download = `${map.name.replace(/\s+/g, '_')}.json`; a.click()
              URL.revokeObjectURL(url)
            }
          }} title="Export map as JSON file">
            📤 Export
          </Button>
          <Button size="sm" variant={playtestMode ? "default" : "outline"}
            onClick={() => {
              setPlaytestMode(!playtestMode)
              if (!playtestMode) setPlayerPos({ x: map.spawn_x || Math.floor(map.width/2), y: map.spawn_y || Math.floor(map.height/2) })
            }}
            className={playtestMode ? "bg-green-700 hover:bg-green-600" : ""}
            title="Walk around the map with WASD/arrows. Press Escape to exit.">
            {playtestMode ? '🏃 Playing... (ESC)' : '🏃 Playtest'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => {
            const gameUrl = process.env.NEXT_PUBLIC_GAME_URL || window.location.origin
            window.open(`${gameUrl}?testmap=${map.id}`, '_blank')
          }} title="Open game client in a new tab on this map">
            ▶️ Live Test
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="w-3.5 h-3.5 mr-1" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Tileset bar */}
      <div className="flex items-center gap-2 px-4 py-1.5 bg-black/20 border-b border-border shrink-0 text-xs">
        <span className="text-muted-foreground shrink-0">TILESET:</span>
        <div className="relative flex-1 flex gap-1">
          <Input value={state.tilesetUrl} onChange={e => setState(prev => ({ ...prev, tilesetUrl: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && loadTileset(state.tilesetUrl)}
            placeholder="https://example.com/tileset.png" className="flex-1 h-7 text-xs font-mono" />
          {tilesetAssets.length > 0 && (
            <button onClick={() => setShowTilesetPicker(!showTilesetPicker)}
              className={cn("h-7 px-2 rounded border text-[10px] shrink-0",
                showTilesetPicker ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
              📂 Library ({tilesetAssets.length})
            </button>
          )}
          {showTilesetPicker && (
            <div className="absolute top-8 left-0 right-0 z-50 bg-card border border-border rounded-lg shadow-xl p-2 max-h-48 overflow-y-auto">
              <p className="text-[10px] text-muted-foreground mb-1">Select a tileset from your asset library:</p>
              {tilesetAssets.map(a => (
                <button key={a.id} onClick={() => {
                  setState(prev => ({ ...prev, tilesetUrl: a.file_url }))
                  loadTileset(a.file_url)
                  setShowTilesetPicker(false)
                }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 text-left transition-colors">
                  <img src={a.file_url} alt="" className="w-8 h-8 object-cover rounded border border-border" style={{ imageRendering: 'pixelated' }}
                    onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                  <div>
                    <div className="text-xs font-medium">{a.original_name}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[300px]">{a.file_url}</div>
                  </div>
                  {state.tilesetUrl === a.file_url && <span className="text-green-400 text-xs ml-auto">✔</span>}
                </button>
              ))}
              <p className="text-[10px] text-muted-foreground/50 mt-1 border-t border-border/20 pt-1">
                Upload new tilesets in the Asset Manager (category: &quot;tileset&quot;)
              </p>
            </div>
          )}
        </div>
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
        <span className="text-[#333] mx-2">|</span>
        <button onClick={() => { setResizeW(map.width); setResizeH(map.height); setShowResize(!showResize) }}
          className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded border border-border/30 hover:border-border">
          📐 Resize Map
        </button>
      </div>

      {/* Resize bar */}
      {showResize && (
        <div className="flex items-center gap-3 px-4 py-2 bg-yellow-950/20 border-b border-yellow-900/30 shrink-0 text-xs">
          <span className="text-yellow-400 shrink-0 font-medium">📐 RESIZE:</span>
          <span className="text-muted-foreground">Current: {map.width}×{map.height}</span>
          <span className="text-muted-foreground">→</span>
          <Input type="number" value={resizeW} min={5} max={200} onChange={e => setResizeW(parseInt(e.target.value) || map.width)} className="h-6 w-16 text-xs" />
          <span className="text-muted-foreground">×</span>
          <Input type="number" value={resizeH} min={5} max={200} onChange={e => setResizeH(parseInt(e.target.value) || map.height)} className="h-6 w-16 text-xs" />
          <span className="text-muted-foreground shrink-0">Anchor:</span>
          {(['top-left','top-right','bottom-left','bottom-right','center'] as const).map(a => (
            <button key={a} onClick={() => setResizeAnchor(a)}
              className={cn("px-1.5 py-0.5 rounded border text-[10px]",
                resizeAnchor === a ? 'bg-yellow-900/40 border-yellow-600 text-yellow-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
              {a === 'top-left' ? '↖' : a === 'top-right' ? '↗' : a === 'bottom-left' ? '↙' : a === 'bottom-right' ? '↘' : '⊕'}
            </button>
          ))}
          <Button size="sm" className="h-6 text-xs" onClick={applyResize}
            disabled={resizeW === map.width && resizeH === map.height}>
            Apply
          </Button>
          <button onClick={() => setShowResize(false)} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
          <span className="text-muted-foreground/40 text-[10px]">Tiles/objects shift based on anchor. Out-of-bounds content is trimmed.</span>
        </div>
      )}

      {/* Advanced properties bar */}
      <div className="flex items-center gap-2 px-4 py-1 bg-black/10 border-b border-border shrink-0 text-xs">
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn("text-[10px] px-2 py-0.5 rounded border",
            showAdvanced ? 'bg-purple-900/30 border-purple-600 text-purple-300' : 'border-border/30 text-muted-foreground hover:text-foreground')}>
          {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
        </button>
        {parallaxUrl && <span className="text-[10px] text-cyan-400">🖼 Parallax</span>}
        {fogOfWar && <span className="text-[10px] text-amber-400">🌫 Fog</span>}
        {ambientSoundUrl && <span className="text-[10px] text-green-400">🔊 Sound</span>}
      </div>

      {showAdvanced && (
        <div className="px-4 py-2 bg-[#0d0d14] border-b border-border shrink-0 space-y-2">
          {/* Parallax */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-cyan-400 shrink-0 w-20 font-medium">🖼 Parallax:</span>
            <Input value={parallaxUrl} onChange={e => { setParallaxUrl(e.target.value); set({}) }}
              placeholder="https://example.com/sky.png" className="flex-1 h-6 text-xs font-mono" />
            <span className="text-muted-foreground shrink-0">Speed X:</span>
            <Input type="number" value={parallaxSpeedX} min={0} max={2} step={0.1}
              onChange={e => { setParallaxSpeedX(parseFloat(e.target.value) || 0.5); set({}) }}
              className="h-6 w-14 text-xs" />
            <span className="text-muted-foreground shrink-0">Y:</span>
            <Input type="number" value={parallaxSpeedY} min={0} max={2} step={0.1}
              onChange={e => { setParallaxSpeedY(parseFloat(e.target.value) || 0.25); set({}) }}
              className="h-6 w-14 text-xs" />
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Scrolling background behind tiles. Speed = parallax scroll rate relative to camera (0.5 = half-speed for depth).</p>

          {/* Fog of War */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-amber-400 shrink-0 w-20 font-medium">🌫 Fog:</span>
            <button onClick={() => { setFogOfWar(!fogOfWar); set({}) }}
              className={cn("w-9 h-[18px] rounded-full transition-colors relative shrink-0",
                fogOfWar ? "bg-amber-600" : "bg-muted")}>
              <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-transform",
                fogOfWar ? "translate-x-[18px]" : "translate-x-0.5")} />
            </button>
            <span className="text-muted-foreground">{fogOfWar ? 'ON' : 'OFF'}</span>
            {fogOfWar && (
              <>
                <span className="text-muted-foreground ml-2">Reveal radius:</span>
                <Input type="number" value={fogRadius} min={1} max={10}
                  onChange={e => { setFogRadius(parseInt(e.target.value) || 3); set({}) }}
                  className="h-6 w-14 text-xs" />
                <span className="text-muted-foreground/40">tiles</span>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Tiles hidden until player walks nearby. Great for dungeons and exploration. State saved per-character.</p>

          {/* Ambient Sound */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-400 shrink-0 w-20 font-medium">🔊 Sound:</span>
            <Input value={ambientSoundUrl} onChange={e => { setAmbientSoundUrl(e.target.value); set({}) }}
              placeholder="https://example.com/forest-ambience.mp3" className="flex-1 h-6 text-xs font-mono" />
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Background ambient audio that plays when on this map. Loops automatically. For zone-specific sounds, use Sound Zones in the Map Hub.</p>

          {/* Neighbor Maps (seamless transitions) */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="text-blue-400 shrink-0 w-20 font-medium">🔗 Neighbors:</span>
            {([
              ['North', neighborNorth, setNeighborNorth],
              ['South', neighborSouth, setNeighborSouth],
              ['East', neighborEast, setNeighborEast],
              ['West', neighborWest, setNeighborWest],
            ] as [string, number | null, (v: number | null) => void][]).map(([dir, val, setter]) => (
              <div key={dir} className="flex items-center gap-1">
                <span className="text-muted-foreground text-[10px] w-8">{dir}:</span>
                <select value={val ?? ''} onChange={e => { setter(e.target.value ? parseInt(e.target.value) : null); set({}) }}
                  className="h-6 text-[10px] bg-input border border-border rounded px-1 w-28">
                  <option value="">None</option>
                  {maps.filter(m => m.id !== map.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Adjacent maps for seamless transitions. When a player walks to the edge, they see the neighbor map tiles and smoothly transition.</p>

          {/* Zone Type */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-pink-400 shrink-0 w-20 font-medium">🏷 Zone:</span>
            <select value={zoneType} onChange={e => { setZoneType(e.target.value); set({}) }}
              className="h-6 text-xs bg-input border border-border rounded px-1 w-32">
              <option value="WORLD">World (default)</option>
              <option value="DUNGEON">Dungeon</option>
              <option value="ARENA">Arena (PvP)</option>
              <option value="HTC">Time Chamber (HTC)</option>
              <option value="SANCTUARY">Sanctuary (safe)</option>
              <option value="INSTANCE">Instance (private)</option>
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Zone type controls special behaviors. HTC = Hyperbolic Time Chamber with gravity training. Arena = PvP zone. Sanctuary = no combat.</p>

          {/* Render Mode */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-cyan-400 shrink-0 w-20 font-medium">🎮 Render:</span>
            <select value={renderMode} onChange={e => { setRenderMode(e.target.value); set({}) }}
              className="h-6 text-xs bg-input border border-border rounded px-1 w-32">
              <option value="classic">Classic (top-down)</option>
              <option value="2.5d">2.5D (elevated)</option>
              <option value="isometric">Isometric</option>
              <option value="hex">Hex Grid</option>
              <option value="side-scroll">Side-Scroll</option>
              <option value="first-person">First-Person (FPS)</option>
              <option value="3d">3D (orbit cam)</option>
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">How this map renders in-game. First-Person = free-roam WASD + mouse look. 3D = overhead orbit camera. Others are 2D tile-based.</p>

          {/* Spawn Point */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-400 shrink-0 w-20 font-medium">📍 Spawn:</span>
            <span className="text-muted-foreground">X:</span>
            <Input type="number" value={spawnX} min={0} max={map.width - 1}
              onChange={e => { setSpawnX(parseInt(e.target.value) || 0); set({}) }}
              className="h-6 w-14 text-xs" />
            <span className="text-muted-foreground">Y:</span>
            <Input type="number" value={spawnY} min={0} max={map.height - 1}
              onChange={e => { setSpawnY(parseInt(e.target.value) || 0); set({}) }}
              className="h-6 w-14 text-xs" />
            <button onClick={() => { setSpawnX(Math.floor(map.width / 2)); setSpawnY(Math.floor(map.height / 2)); set({}) }}
              className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-muted/30">Center</button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 ml-20">Default spawn position when teleporting to this map without specific coordinates.</p>
        </div>
      )}

      {/* Layer tabs */}
      <div className="flex items-center gap-1 px-4 py-2 bg-[#1a1a1a] border-b border-border shrink-0">
        {([
          ['TILES',   '🖌️ Tiles',    'Paint the ground, walls, and scenery',   'text-white',       'bg-green-900/30 border-green-600'],
          ['OBJECTS', '🏮 Objects',  'Place lights, props, and decorations',   'text-yellow-400',  'bg-yellow-900/30 border-yellow-600'],
          ['EVENTS',  '⚙️ Events',   'Add NPCs, teleports, shops, and logic', 'text-purple-400',  'bg-purple-900/30 border-purple-600'],
        ] as [Layer, string, string, string, string][]).map(([l, label, hint, activeColor, activeBg]) => (
          <button key={l} onClick={() => set({ layer: l, painting: false })}
            className={cn("px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
              state.layer === l ? `${activeColor} ${activeBg}` : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/20'
            )}
            title={hint}>
            {label}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground/40 ml-2">
          {state.layer === 'TILES' && '🖌️ Paint tiles across 3 sub-layers (ground → overlay → fringe). Use tools below.'}
          {state.layer === 'OBJECTS' && '🏮 Click to place objects. Right-click objects on the grid for settings.'}
          {state.layer === 'EVENTS' && '⚙️ Select a tool, then click a tile to place. Events trigger when players walk on them.'}
        </span>
      </div>

      {/* Toolbar for TILES layer */}
      {state.layer === 'TILES' && (
        <div className="flex items-center gap-1 px-4 py-1.5 bg-[#111] border-b border-border shrink-0 flex-wrap">
          {/* Layer selector (ground/overlay) */}
          <span className="text-muted-foreground text-[10px] shrink-0">LAYER:</span>
          <button onClick={() => set({ tileLayer: 'ground' })}
            title="Ground layer — base terrain (grass, dirt, stone, water)"
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.tileLayer==='ground' ? 'bg-green-900/60 border-green-500 text-green-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            ① Ground
          </button>
          <button onClick={() => set({ tileLayer: 'overlay' })}
            title="Overlay layer — renders between ground and player (paths, carpets, decals)"
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.tileLayer==='overlay' ? 'bg-cyan-900/60 border-cyan-500 text-cyan-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            ② Overlay
          </button>
          <button onClick={() => set({ tileLayer: 'fringe' })}
            title="Fringe layer — renders ABOVE the player (rooftops, tree canopy). Roofs auto-hide when the player walks underneath, revealing the interior below. Paint rooftop tiles here to create buildings with enterable interiors."
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.tileLayer==='fringe' ? 'bg-purple-900/60 border-purple-500 text-purple-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            ③ Fringe
          </button>

          <span className="text-[#333] mx-1">|</span>

          {/* Tools */}
          <span className="text-muted-foreground text-[10px] shrink-0">TOOL:</span>
          {([
            ['PAINT',       '🖌️', 'Paint — click or drag to place tiles'],
            ['AUTOTILE',    '🧩', 'Auto-Tile — smart borders that connect automatically'],
            ['FILL',        '🪣', 'Fill — flood-fill an area with the selected tile'],
            ['RECT',        '⬜', 'Rectangle — click two corners to fill a box'],
            ['SELECT',      '⬚', 'Select — drag to select tiles, then drag to move them'],
            ['EYEDROP',     '💉', 'Eyedropper — click a tile to copy its ID to your brush'],
            ['PASSABILITY', '🚧', 'Passability — mark tiles as walkable, blocked, or event-trigger'],
            ['ELEVATION',   '⛰️', 'Elevation — set height levels (0-3) for battle grid'],
            ['ERASER',      '✕',  'Eraser — remove tiles from the active layer'],
          ] as [TileTool, string, string][]).map(([t, ic, tip]) => (
            <button key={t} onClick={() => set({ tileTool: t, rectStart: null })}
              title={tip}
              className={cn("px-1.5 py-0.5 rounded text-[10px] transition-colors border",
                state.tileTool===t ? 'bg-blue-900/60 border-blue-500 text-blue-300' : 'bg-[#222] border-[#444] text-muted-foreground hover:text-foreground')}>
              {ic}
            </button>
          ))}

          <span className="text-[#333] mx-1">|</span>

          {/* Brush size */}
          {[1,2,3,5].map(s => (
            <button key={s} onClick={() => set({ brushSize: s })}
              className={cn("px-1.5 py-0.5 rounded text-[10px] border",
                state.brushSize===s ? 'bg-blue-900/60 border-blue-500 text-blue-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
              {s}
            </button>
          ))}

          <span className="text-[#333] mx-1">|</span>

          {/* Undo/Redo */}
          <button onClick={undo} disabled={!undoStack.length}
            className="px-1.5 py-0.5 rounded text-[10px] bg-[#222] border border-[#444] text-muted-foreground hover:text-foreground disabled:opacity-30" title="Ctrl+Z">
            ↩
          </button>
          <button onClick={redo} disabled={!redoStack.length}
            className="px-1.5 py-0.5 rounded text-[10px] bg-[#222] border border-[#444] text-muted-foreground hover:text-foreground disabled:opacity-30" title="Ctrl+Shift+Z">
            ↪
          </button>

          {/* Toggles */}
          <button onClick={() => set({ showGrid: !state.showGrid })}
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.showGrid ? 'bg-blue-900/40 border-blue-500 text-blue-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            ▦
          </button>
          <button onClick={() => set({ showEvents: !state.showEvents })}
            className={cn('px-1.5 py-0.5 rounded text-[10px] border',
              state.showEvents ? 'bg-blue-900/40 border-blue-500 text-blue-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            {state.showEvents ? '👁 Events' : '🚫 Events'}
          </button>
          <button onClick={() => set({ showObjects: !state.showObjects })}
            className={cn('px-1.5 py-0.5 rounded text-[10px] border',
              state.showObjects ? 'bg-green-900/40 border-green-500 text-green-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
            {state.showObjects ? '👁 Objects' : '🚫 Objects'}
          </button>
          <button onClick={() => set({ showPassability: !state.showPassability })}
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.showPassability ? 'bg-red-900/40 border-red-500 text-red-300' : 'bg-[#222] border-[#444] text-muted-foreground')}
            title="Show passability overlay">
            🚧
          </button>
          <button onClick={() => set({ showElevation: !state.showElevation })}
            className={cn("px-1.5 py-0.5 rounded text-[10px] border",
              state.showElevation ? 'bg-orange-900/40 border-orange-500 text-orange-300' : 'bg-[#222] border-[#444] text-muted-foreground')}
            title="Show elevation overlay">
            ⛰️
          </button>
          {spawnZones.length > 0 && (
            <button onClick={() => setShowSpawnZones(!showSpawnZones)}
              className={cn("px-1.5 py-0.5 rounded text-[10px] border",
                showSpawnZones ? 'bg-red-900/40 border-red-500 text-red-300' : 'bg-[#222] border-[#444] text-muted-foreground')}
              title={`Show encounter zones (${spawnZones.length} zones)`}>
              ⚔️ {spawnZones.length}
            </button>
          )}
          {npcPatrols.length > 0 && (
            <button onClick={() => setShowNpcPaths(!showNpcPaths)}
              className={cn("px-1.5 py-0.5 rounded text-[10px] border",
                showNpcPaths ? 'bg-cyan-900/40 border-cyan-500 text-cyan-300' : 'bg-[#222] border-[#444] text-muted-foreground')}
              title={`Show NPC positions and wander zones (${npcPatrols.length} NPCs)`}>
              👤 {npcPatrols.length}
            </button>
          )}

          {/* Auto-tile group picker */}
          {state.tileTool === 'AUTOTILE' && autotileGroups.length > 0 && (
            <>
              <span className="text-[#333] mx-1">|</span>
              <span className="text-muted-foreground text-[10px]">GROUP:</span>
              {autotileGroups.map((g, i) => (
                <button key={g.id} onClick={() => setSelectedAutotile(i)}
                  className={cn("px-1.5 py-0.5 rounded text-[10px] border",
                    selectedAutotile===i ? 'bg-green-900/60 border-green-500 text-green-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
                  {g.icon} {g.name}
                </button>
              ))}
            </>
          )}

          {/* Status indicators */}
          {state.rectStart && <span className="text-[10px] text-yellow-400 ml-1">📐 Click end...</span>}
          {state.tileTool === 'EYEDROP' && <span className="text-[10px] text-cyan-400 ml-1">💉 Click to pick tile</span>}
          {state.tileTool === 'SELECT' && <span className="text-[10px] text-blue-400 ml-1">⬚ Drag to select, then drag selection to move. Click outside to place.</span>}
          {state.tileTool === 'PASSABILITY' && <span className="text-[10px] text-red-400 ml-1">🚧 Click: walk→block→trigger</span>}
          {state.tileTool === 'ELEVATION' && (
            <span className="text-[10px] text-orange-400 ml-1 flex items-center gap-1">
              ⛰️ Height:
              {ELEVATION_LEVELS.map(e => (
                <button key={e.level} onClick={() => set({ elevationBrush: e.level })}
                  className={cn("px-1.5 py-0.5 rounded border text-[10px]",
                    state.elevationBrush === e.level ? 'bg-orange-900/60 border-orange-500 text-orange-300' : 'bg-[#222] border-[#444] text-muted-foreground')}>
                  {e.label}
                </button>
              ))}
            </span>
          )}
          {state.tileTool === 'AUTOTILE' && <span className="text-[10px] text-green-400 ml-1">🧩 Smart borders</span>}
        </div>
      )}

      {/* Second toolbar: Templates + Copy/Paste (TILES layer) */}
      {state.layer === 'TILES' && (
        <div className="flex items-center gap-1 px-4 py-1 bg-[#0d0d0d] border-b border-border/50 shrink-0 flex-wrap">
          <span className="text-muted-foreground text-[10px] shrink-0">STAMP:</span>
          {MAP_TEMPLATES.map((tmpl, i) => (
            <button key={i} onClick={() => {
              if (hoveredCell) stampTemplate(tmpl, hoveredCell.x, hoveredCell.y)
              else alert('Hover over a tile first, then click a stamp')
            }}
              className="px-1.5 py-0.5 rounded text-[10px] bg-[#222] border border-[#444] text-muted-foreground hover:text-foreground hover:bg-[#333]"
              title={`${tmpl.name} (${tmpl.w}x${tmpl.h}) — stamps at hovered position`}>
              {tmpl.name}
            </button>
          ))}
          <span className="text-[#333] mx-1">|</span>
          <button onClick={copySelection} disabled={!state.selStart || !state.selEnd}
            className="px-1.5 py-0.5 rounded text-[10px] bg-[#222] border border-[#444] text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Copy selected region (Ctrl+C)">
            📋 Copy
          </button>
          <button onClick={() => { if (hoveredCell && state.clipboard) pasteClipboard(hoveredCell.x, hoveredCell.y) }}
            disabled={!state.clipboard}
            className="px-1.5 py-0.5 rounded text-[10px] bg-[#222] border border-[#444] text-muted-foreground hover:text-foreground disabled:opacity-30"
            title="Paste at hover position (Ctrl+V)">
            📌 Paste {state.clipboard ? `(${state.clipboard.width}x${state.clipboard.height})` : ''}
          </button>
          {state.clipboard && (
            <>
              <span className="text-[9px] text-cyan-400">✂️ Clipboard: {state.clipboard.width}x{state.clipboard.height}</span>
              <button onClick={saveStamp}
                className="px-1.5 py-0.5 rounded text-[10px] bg-green-900/30 border border-green-800/50 text-green-400 hover:bg-green-900/50"
                title="Save clipboard as reusable stamp">
                💾 Save Stamp
              </button>
            </>
          )}
          {savedStamps.length > 0 && (
            <>
              <span className="text-[#333] mx-1">|</span>
              <span className="text-muted-foreground text-[10px]">MY STAMPS:</span>
              {savedStamps.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-0.5">
                  <button onClick={() => loadStamp(s)}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-purple-900/30 border border-purple-800/50 text-purple-300 hover:bg-purple-900/50"
                    title={`Load stamp: ${s.width}x${s.height}`}>
                    {s.name}
                  </button>
                  <button onClick={() => deleteStamp(i)} className="text-[8px] text-muted-foreground hover:text-destructive" title="Delete stamp">×</button>
                </span>
              ))}
            </>
          )}
        </div>
      )}

      {/* Toolbar for EVENTS layer */}
      {state.layer === 'EVENTS' && (
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-[#111] border-b border-border shrink-0 flex-wrap">
          <span className="text-muted-foreground text-xs shrink-0">PLACE:</span>
          {([
            ['NPC',      'NPC — talk interaction on click'],
            ['TELEPORT', 'Teleport — warp player to another map on step'],
            ['ENEMY',    'Enemy — trigger a battle when player steps here'],
            ['LOOT',     'Loot — one-time item pickup on step'],
            ['SHOP',     'Shop — opens shop UI on step'],
            ['TERRAIN',  'Terrain — set combat terrain type for this tile'],
            ['SCRIPT',   'Script — visual IF/THEN event logic (dialogues, give items, teleport, etc.)'],
            ['ERASER',   'Eraser — remove event from tile'],
          ] as [EventTool, string][]).map(([t, tip]) => (
            <button key={t} onClick={() => set({ tool: t })} title={tip}
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
            onMouseUp={() => {
              setState(prev => ({ ...prev, painting: false }))
              if (state.tileTool === 'SELECT' && state.selStart && state.selEnd) finalizeSelection()
              if (state.tileTool === 'SELECT' && state.selDragging) set({ selDragging: false })
            }}>
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
                  {/* Other editors' cursors */}
                  {Object.entries(collabCursors).map(([sid, cur]) => (
                    cur.x === x && cur.y === y ? (
                      <div key={sid} style={{ position:'absolute', inset:-1, border:`2px solid ${cur.color}`, borderRadius:2, pointerEvents:'none', zIndex:10 }}>
                        <span style={{ position:'absolute', top:-14, left:0, fontSize:'8px', color: cur.color, background:'rgba(0,0,0,0.7)', padding:'0 3px', borderRadius:2, whiteSpace:'nowrap' }}>{cur.username}</span>
                      </div>
                    ) : null
                  ))}
                  {/* NPC patrol range overlay */}
                  {showNpcPaths && npcPatrols.some(n => {
                    if (n.move_type === 'STATIONARY') return n.x === x && n.y === y
                    const dist = Math.max(Math.abs(x - n.x), Math.abs(y - n.y))
                    return dist <= n.wander_radius
                  }) && (
                    <div style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:1 }}>
                      {npcPatrols.filter(n => n.x === x && n.y === y).map((n, i) => (
                        <span key={i} style={{ position:'absolute', top:0, left:0, fontSize:'10px', zIndex:3 }}>{n.icon}</span>
                      ))}
                      {npcPatrols.some(n => n.move_type === 'WANDER' && Math.max(Math.abs(x - n.x), Math.abs(y - n.y)) <= n.wander_radius && !(n.x === x && n.y === y)) && (
                        <div style={{ background:'rgba(0,200,200,0.08)', border:'1px solid rgba(0,200,200,0.15)', position:'absolute', inset:0 }} />
                      )}
                    </div>
                  )}
                  {/* Spawn zone overlay */}
                  {showSpawnZones && spawnZones.some(z => x >= z.x_min && x <= z.x_max && y >= z.y_min && y <= z.y_max) && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(255,50,50,0.15)', border:'1px solid rgba(255,50,50,0.3)', pointerEvents:'none', zIndex:1 }}>
                      <span style={{ position:'absolute', top:0, left:1, fontSize:'7px', color:'#f88', textShadow:'0 0 2px black' }}>⚔️</span>
                    </div>
                  )}
                  {/* Selection overlay */}
                  {state.selection && x >= state.selection.x && x < state.selection.x + state.selection.w &&
                    y >= state.selection.y && y < state.selection.y + state.selection.h && (
                    <div style={{ position:'absolute', inset:0, background:'rgba(100,150,255,0.25)', border:'1px solid rgba(100,150,255,0.6)', pointerEvents:'none', zIndex:5 }} />
                  )}
                  {/* Selection-in-progress overlay */}
                  {state.tileTool === 'SELECT' && state.selStart && state.selEnd && !state.selection && (() => {
                    const sx = Math.min(state.selStart.x, state.selEnd.x), sy = Math.min(state.selStart.y, state.selEnd.y)
                    const ex = Math.max(state.selStart.x, state.selEnd.x), ey = Math.max(state.selStart.y, state.selEnd.y)
                    return x >= sx && x <= ex && y >= sy && y <= ey ? (
                      <div style={{ position:'absolute', inset:0, background:'rgba(100,150,255,0.15)', border:'1px dashed rgba(100,150,255,0.4)', pointerEvents:'none', zIndex:5 }} />
                    ) : null
                  })()}
                  {/* Elevation overlay */}
                  {state.showElevation && state.elevation[i] > 0 && (
                    <div style={{ position:'absolute', inset:0, background: ELEVATION_LEVELS[state.elevation[i]]?.color || 'transparent', pointerEvents:'none', zIndex:1 }}>
                      <span style={{ position:'absolute', top:1, right:2, fontSize:'8px', color:'#fff', fontWeight:'bold', textShadow:'0 0 3px black' }}>{state.elevation[i]}</span>
                    </div>
                  )}
                  {obj && (
                    <span style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'14px', textShadow:'0 0 3px black', outline: obj.type==='LIGHT'?'1px solid #ffcc44':obj.blocking?'1px solid #ff6644':undefined, zIndex:2 }}>
                      {obj.icon}
                    </span>
                  )}
                  {ev && !obj && (
                    <span style={{ textShadow:'0 0 3px black', outline: ev.actions ? '1px solid #bb86fc' : undefined, zIndex:2, position:'relative' }}>
                      {ev.actions ? '📜' : (EVENT_ICONS[ev.type] || '?')}
                    </span>
                  )}
                  {/* Playtest player token */}
                  {playtestMode && playerPos.x === x && playerPos.y === y && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:20, fontSize: Math.max(12, TS * 0.7), filter:'drop-shadow(0 0 4px cyan)' }}
                      onClick={() => { if (playtestMode) movePlayer(0, 0) }}>
                      🧍
                    </div>
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
                  {(dbTileCategories.length ? dbTileCategories : [{ label: 'All Tiles', start: 0, end: dbTileColors.length - 1 }]).map(cat => (
                    <div key={cat.label} className="mb-2">
                      <div className="text-[9px] uppercase tracking-widest text-primary/60 mb-1 mt-1">{cat.label}</div>
                      <div className="flex flex-wrap gap-1">
                        {dbTileColors.slice(cat.start, cat.end + 1).map((col, j) => {
                          if (!col) return null
                          const i = cat.start + j
                          return (
                            <div key={i} onClick={() => set({ brush: i })} title={dbTileNames[i] || `Tile ${i}`}
                              className="cursor-pointer" style={{ width: 22, height: 22, background: col, border: state.brush === i ? '2px solid white' : '1px solid #444' }} />
                          )
                        })}
                      </div>
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
                  {state.tilesetLoaded ? `Tile #${hoveredCell.tile}` : (dbTileNames[hoveredCell.tile] || `Tile ${hoveredCell.tile}`)}
                </div>
                {(() => {
                  const obj = objAtCell(hoveredCell.x, hoveredCell.y)
                  const ev  = evAtCell(hoveredCell.x, hoveredCell.y)
                  const idx = hoveredCell.y * map.width + hoveredCell.x
                  const pass = state.passability[idx]
                  const elev = state.elevation[idx]
                  return <>
                    {obj && <div className="text-yellow-400">{obj.icon} {obj.label} [{obj.type}]{obj.blocking?' ⛔':''}</div>}
                    {ev && ev.type === 'TELEPORT' && ev.data && (() => {
                      const parts = String(ev.data).split(',')
                      const destId = parseInt(parts[0])
                      const destMap = maps.find(m => m.id === destId)
                      return <div className="text-purple-400">🚪 Teleport → <span className="text-purple-300 font-medium">{destMap ? destMap.name : `Map #${destId}`}</span> ({parts[1]||0}, {parts[2]||0})</div>
                    })()}
                    {ev && ev.type !== 'TELEPORT' && <div className="text-purple-400">{EVENT_ICONS[ev.type]||'?'} {ev.type} {ev.data ? `→ ${ev.data}` : ''}</div>}
                    {pass > 0 && <div className={pass===1 ? 'text-red-400' : 'text-amber-400'}>{pass===1 ? '⛔ Blocked' : '⚡ Event trigger'}</div>}
                    {elev > 0 && <div className="text-orange-400">⛰️ Elevation: {elev}</div>}
                    {spawnZones.filter(z => hoveredCell.x >= z.x_min && hoveredCell.x <= z.x_max && hoveredCell.y >= z.y_min && hoveredCell.y <= z.y_max).map(z => (
                      <div key={z.id} className="text-red-400">⚔️ {z.name} ({z.encounter_rate}% rate)</div>
                    ))}
                    {!obj && !ev && pass === 0 && elev === 0 && <div className="text-muted-foreground/40">Empty</div>}
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
          terrainTypes={terrainTypes}
          onPlace={placeEvent}
          onRemove={() => { const evs=[...state.events]; if(modal.ei>=0) evs.splice(modal.ei,1); set({events:evs}); setModal({type:null,x:0,y:0,ei:-1,oi:-1}) }}
          onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})} />
      )}

      {modal.type === 'script' && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && setModal({type:null,x:0,y:0,ei:-1,oi:-1})}>
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-bold text-primary mb-1">📜 Script Event at ({modal.x}, {modal.y})</h3>
            <p className="text-xs text-muted-foreground mb-4">Build IF/THEN logic visually. When a player steps on this tile, conditions are checked and actions execute.</p>
            {(() => {
              const existing = modal.ei >= 0 ? state.events[modal.ei] : null
              const { conditionBlocks, actionBlocks } = jsonToBlocks(
                (existing?.conditions as unknown[]) || [],
                (existing?.actions as unknown[]) || []
              )
              return (
                <EventScriptEditor
                  conditions={conditionBlocks}
                  actions={actionBlocks}
                  trigger={(existing as unknown as Record<string, unknown>)?.trigger as string}
                  triggerMeta={{
                    radius: (existing as unknown as Record<string, unknown>)?.radius as number,
                    width: (existing as unknown as Record<string, unknown>)?.width as number,
                    height: (existing as unknown as Record<string, unknown>)?.height as number,
                    required_item_id: (existing as unknown as Record<string, unknown>)?.required_item_id as number,
                  }}
                  onChange={(conditions, actions, trigger, triggerMeta) => {
                    const json = blocksToJson(conditions, actions)
                    const ev: MapEvent = {
                      x: modal.x, y: modal.y, type: 'SCRIPT',
                      trigger: trigger || 'STEP_ON',
                      conditions: json.conditions as unknown[],
                      actions: json.actions as unknown[],
                      ...(triggerMeta || {}),
                    }
                    placeEvent(ev)
                  }}
                  onClose={() => setModal({type:null,x:0,y:0,ei:-1,oi:-1})}
                />
              )
            })()}
          </div>
        </div>
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
