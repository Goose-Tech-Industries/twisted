// Map + nearby entities — driven by the Phoenix game channel.
//
// Phoenix push events the player receives:
//   init_self   — once per character init: full char + region
//   map_data    — full map definition (tiles + objects + events)
//   map_changed — { mapId } — server moved player to a new map
//   player_list — array of players currently on this map
//   npc_list    — array of NPCs currently on this map
//   force_move  — { x, y } — server corrects client-side position
//   notification — { type, message } — toast-style server message

export interface MapLayers {
  ground?: number[]
  overlay?: number[]
  passability?: number[]
  fringe?: number[]
  elevation?: number[]
}

export interface MapDef {
  id: number
  name: string
  width: number
  height: number
  /** "classic" | "isometric" | "hex" | "2.5d" | "side-scroll" | "first-person" | "3d" */
  render_mode: string
  ambient_dark?: number
  /** [y][x] tile id grid. Phoenix sends `tiles_json` as a flat array; we
   *  reshape on intake. */
  tiles: number[][]
  /** Flat 1D layer arrays from Phoenix's MapData payload (ground, overlay,
   *  passability, fringe, elevation). Absent on older map payloads. */
  layers?: MapLayers
  /** Rich map data — objects, events, fringe — kept verbatim from
   *  Phoenix's MapData payload for downstream renderers. */
  raw?: Record<string, unknown>
}

export interface NearbyPlayer {
  charId: number
  name: string
  x: number
  y: number
  level: number
  icon?: string
}

export interface MapNpc {
  id: number
  name: string
  x: number
  y: number
  icon?: string
  is_enemy: boolean
  level: number
}

export interface GroundItem {
  id: number
  item_id: number
  name: string
  x: number
  y: number
  qty: number
}

interface MapDataPayload {
  id?: number
  name?: string
  width?: number
  height?: number
  render_mode?: string
  ambient_dark?: number
  tiles?: number[][] | number[]
  tiles_json?: string
  layers?: MapLayers
}

/**
 * Reshape Phoenix's flexible map payload into the flat `MapDef` shape
 * the renderer expects. Handles three known payload variants:
 *   1. tiles: number[][]  — already shaped (preferred)
 *   2. tiles: number[]    — flat row-major
 *   3. layers.ground: number[]  — newer Phoenix shape
 */
function normalizeMap(p: MapDataPayload): MapDef | null {
  const w = p.width ?? 0
  const h = p.height ?? 0
  if (w <= 0 || h <= 0) return null

  let tiles: number[][] | null = null
  if (Array.isArray(p.tiles) && p.tiles.length > 0 && Array.isArray(p.tiles[0])) {
    tiles = p.tiles as number[][]
  } else if (Array.isArray(p.tiles)) {
    const flat = p.tiles as number[]
    tiles = []
    for (let y = 0; y < h; y++) tiles.push(flat.slice(y * w, (y + 1) * w))
  } else if (p.layers?.ground) {
    const flat = p.layers.ground
    tiles = []
    for (let y = 0; y < h; y++) tiles.push(flat.slice(y * w, (y + 1) * w))
  }

  if (!tiles) return null

  return {
    id: p.id ?? 0,
    name: p.name ?? 'Untitled Map',
    width: w,
    height: h,
    render_mode: p.render_mode ?? 'classic',
    ambient_dark: p.ambient_dark,
    tiles,
    layers: p.layers,
    raw: p as Record<string, unknown>
  }
}

interface PhoenixPlayer {
  char_id?: number
  charId?: number
  name?: string
  x?: number
  y?: number
  level?: number
  icon?: string
}

interface PhoenixNpc {
  id?: number
  npc_id?: number
  name?: string
  x?: number
  y?: number
  icon?: string
  is_enemy?: boolean | number
  level?: number
}

function createWorldStore() {
  let map = $state<MapDef | null>(null)
  let players = $state<NearbyPlayer[]>([])
  let npcs = $state<MapNpc[]>([])
  let drops = $state<GroundItem[]>([])
  let weather = $state<string>('clear')

  return {
    get map() { return map },
    get players() { return players },
    get npcs() { return npcs },
    get drops() { return drops },
    get weather() { return weather },

    /** Accept any of Phoenix's known map payload shapes. */
    setMapFromPayload(p: MapDataPayload) {
      const normalized = normalizeMap(p)
      if (normalized) map = normalized
    },

    /** Accept Phoenix's `player_list` shape and normalize. */
    setPlayersFromPayload(raw: PhoenixPlayer[]) {
      players = raw.map(p => ({
        charId: p.charId ?? p.char_id ?? 0,
        name: p.name ?? 'Unknown',
        x: p.x ?? 0,
        y: p.y ?? 0,
        level: p.level ?? 1,
        icon: p.icon
      }))
    },

    /** Accept Phoenix's `npc_list` shape and normalize. */
    setNpcsFromPayload(raw: PhoenixNpc[]) {
      npcs = raw.map(n => ({
        id: n.id ?? n.npc_id ?? 0,
        name: n.name ?? 'NPC',
        x: n.x ?? 0,
        y: n.y ?? 0,
        icon: n.icon,
        is_enemy: !!n.is_enemy,
        level: n.level ?? 1
      }))
    },

    setDrops(d: GroundItem[]) { drops = d },
    setWeather(w: string) { weather = w },

    upsertPlayer(p: NearbyPlayer) {
      const idx = players.findIndex(x => x.charId === p.charId)
      if (idx === -1) players = [...players, p]
      else { const next = players.slice(); next[idx] = p; players = next }
    },

    removePlayer(charId: number) {
      players = players.filter(p => p.charId !== charId)
    },

    clear() {
      map = null
      players = []
      npcs = []
      drops = []
      weather = 'clear'
    }
  }
}

export const world = createWorldStore()
