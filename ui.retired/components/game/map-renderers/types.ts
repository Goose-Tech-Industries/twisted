// ═══════════════════════════════════════════════════════════════
// MAP RENDERER — Shared Types
// ═══════════════════════════════════════════════════════════════
// PixiJS is the sole rendering pipeline. All map modes (classic
// flat, 2.5D extruded, future isometric/hex) go through Pixi.
//
// The old DOM grid renderer in map-panel.tsx is kept ONLY as a
// WebGL fallback for browsers that don't support it. All new
// map features are added here once and work across all modes.
// ═══════════════════════════════════════════════════════════════

export type RenderMode = 'classic' | '2.5d' | 'isometric' | 'hex' | 'side-scroll' | 'first-person' | '3d'
// classic = PixiJS flat top-down (GPU-accelerated, same visual as old DOM grid)
// 2.5d    = PixiJS with height extrusion + depth sorting
// Future:  'isometric' | 'hex' — same data, different projection math

export interface MapEntity {
  type: 'npc' | 'enemy' | 'shop' | 'player'
  name: string
  x: number
  y: number
  charId?: number
  level?: number
  spriteUrl?: string | null
  icon?: string
}

export interface MapObject {
  x: number; y: number
  preset?: string; icon?: string; label?: string
  type?: string; blocking?: boolean
  light?: { radius: number; color: string; flicker: boolean } | null
}

export interface MapCompanion {
  npcId: number; name: string; icon: string
  x: number; y: number
}

export interface NearbyPlayer {
  charId: number; name: string; level: number
  x: number; y: number
  isOffline?: boolean
  spriteUrl?: string | null
}

export interface GroundItem {
  id: number; x: number; y: number
  item_id: number; quantity: number
  name: string; icon: string
}

export interface DeployedStructure {
  id: number; x: number; y: number
  name: string; icon: string; owner_id: number
}

export interface MapBattle {
  battleId: number; x: number; y: number
  playerNames: string[]; enemyNames: string[]
}

export interface MapRendererProps {
  // Map data
  tiles: number[][]           // ground layer as 2D grid
  elevationData: number[]     // flat array, index = y*width+x
  fringeTiles: number[]       // flat array
  objects: MapObject[]
  entities: MapEntity[]
  nearbyPlayers: NearbyPlayer[]
  companions: MapCompanion[]

  // Dimensions
  mapWidth: number
  mapHeight: number
  tileSize: number
  viewportW: number           // visible tiles across
  viewportH: number           // visible tiles down

  // Camera
  playerX: number
  playerY: number
  camX: number
  camY: number

  // Player appearance
  playerName: string
  playerSpriteUrl: string | null
  playerSpriteFrameW: number
  playerSpriteFrameH: number

  // Fog / lighting
  fogEnabled: boolean
  fogRadius: number
  ambientDark: number
  nightDarkness: number
  exploredTiles: Set<string>
  onExplore: (tiles: string[]) => void

  // Map properties
  parallaxUrl: string | null
  parallaxSpeedX: number
  parallaxSpeedY: number

  // Interior detection
  hiddenFringeTiles: Set<number>

  // Dynamic map elements
  groundItems: GroundItem[]
  deployedStructures: DeployedStructure[]
  mapBattles: MapBattle[]
  objectStates: Record<number, string>  // index → state_key

  // Callbacks
  onTileClick: (x: number, y: number) => void
  onEntityClick: (entity: MapEntity) => void
  onPickupItem?: (groundItemId: number) => void
  onEnterStructure?: (structureId: number) => void
  onBattleClick?: (battleId: number, action: 'join' | 'watch') => void

  // Render mode
  mode: RenderMode

  // Zone type (e.g., 'HTC' for Hyperbolic Time Chamber white void)
  zoneType?: string

  // DB-driven tile palette (for animated tiles)
  tilePalette?: TilePaletteEntry[]
}

// Tile palette type from DB
export interface TilePaletteEntry {
  id: number; name: string; color: string; category: string; is_passable: number
  animation_id?: number | null; frame_tiles?: number[] | null; fps?: number | null
}

// Build Pixi hex colors from DB palette
export function buildTileColorsFromPalette(palette: TilePaletteEntry[]): Record<number, number> {
  if (!palette?.length) return TILE_COLORS
  const map: Record<number, number> = {}
  for (const t of palette) map[t.id] = parseInt(t.color.replace('#', ''), 16)
  return map
}

// Fallback tile color palette — hex for Pixi
export const TILE_COLORS: Record<number, number> = {
  // Core (0–10)
  0: 0x1a3a1a, 1: 0x4a4a4a, 2: 0x0a2a5a, 3: 0x3a2a0a, 4: 0x5a5a5a,
  5: 0x3a2a1a, 6: 0x6a6a5a, 7: 0x0a0a0a, 8: 0x2a1a4a, 9: 0x0a2a0a, 10: 0x5a4a2a,
  // Nature (11–20)
  11: 0x2a4a2a, 12: 0x3a5a3a, 13: 0x1a2a1a, 14: 0x4a6a3a, 15: 0x5a7a4a,
  16: 0x6a8a5a, 17: 0x2a3a2a, 18: 0x8a9a6a, 19: 0x3a4a1a, 20: 0x1a4a3a,
  // Stone & Structure (21–30)
  21: 0x3a3a3a, 22: 0x5a5a6a, 23: 0x2a2a2a, 24: 0x6a5a4a, 25: 0x4a3a2a,
  26: 0x7a7a7a, 27: 0x3a3a4a, 28: 0x5a4a3a, 29: 0x2a2a3a, 30: 0x1a1a1a,
  // Water & Ice (31–36)
  31: 0x1a4a6a, 32: 0x2a5a7a, 33: 0x3a6a6a, 34: 0x6a8aaa, 35: 0x4a6a8a, 36: 0x1a3a4a,
  // Underground (37–44)
  37: 0x2a1a0a, 38: 0x1a0a0a, 39: 0x3a2a2a, 40: 0x0a0a1a, 41: 0x2a2a1a,
  42: 0x4a3a3a, 43: 0x3a1a1a, 44: 0x6a2a0a,
  // Snow & Mountain (45–50)
  45: 0x8a9aaa, 46: 0x6a7a8a, 47: 0x5a5a6a, 48: 0x7a8a9a, 49: 0x9aaaba, 50: 0x4a4a5a,
  // Interior (51–60)
  51: 0x4a3a2a, 52: 0x5a4a3a, 53: 0x3a2a2a, 54: 0x5a2a2a, 55: 0x2a2a4a,
  56: 0x6a5a4a, 57: 0x4a4a3a, 58: 0x3a3a2a, 59: 0x5a5a4a, 60: 0x2a1a2a,
  // Special & Magical (61–70)
  61: 0x4a1a4a, 62: 0x1a3a3a, 63: 0x3a0a0a, 64: 0x0a1a2a, 65: 0x4a4a1a,
  66: 0x1a1a3a, 67: 0x2a0a2a, 68: 0x0a3a1a, 69: 0x3a3a0a, 70: 0x5a1a3a,
  // Path & Road (71–75)
  71: 0x4a3a1a, 72: 0x5a5a5a, 73: 0x3a3a3a, 74: 0x6a5a3a, 75: 0x4a4a4a,
  // Desert & Wasteland (76–80)
  76: 0x7a6a3a, 77: 0x6a5a2a, 78: 0x8a7a4a, 79: 0x5a4a1a, 80: 0x4a3a0a,
}

// CSS versions for DOM fallback renderer (keep in sync with TILE_COLORS above)
export const TILE_COLORS_CSS: Record<number, string> = {
  0: '#1a3a1a', 1: '#4a4a4a', 2: '#0a2a5a', 3: '#3a2a0a', 4: '#5a5a5a',
  5: '#3a2a1a', 6: '#6a6a5a', 7: '#0a0a0a', 8: '#2a1a4a', 9: '#0a2a0a', 10: '#5a4a2a',
  11: '#2a4a2a', 12: '#3a5a3a', 13: '#1a2a1a', 14: '#4a6a3a', 15: '#5a7a4a',
  16: '#6a8a5a', 17: '#2a3a2a', 18: '#8a9a6a', 19: '#3a4a1a', 20: '#1a4a3a',
  21: '#3a3a3a', 22: '#5a5a6a', 23: '#2a2a2a', 24: '#6a5a4a', 25: '#4a3a2a',
  26: '#7a7a7a', 27: '#3a3a4a', 28: '#5a4a3a', 29: '#2a2a3a', 30: '#1a1a1a',
  31: '#1a4a6a', 32: '#2a5a7a', 33: '#3a6a6a', 34: '#6a8aaa', 35: '#4a6a8a', 36: '#1a3a4a',
  37: '#2a1a0a', 38: '#1a0a0a', 39: '#3a2a2a', 40: '#0a0a1a', 41: '#2a2a1a',
  42: '#4a3a3a', 43: '#3a1a1a', 44: '#6a2a0a',
  45: '#8a9aaa', 46: '#6a7a8a', 47: '#5a5a6a', 48: '#7a8a9a', 49: '#9aaaba', 50: '#4a4a5a',
  51: '#4a3a2a', 52: '#5a4a3a', 53: '#3a2a2a', 54: '#5a2a2a', 55: '#2a2a4a',
  56: '#6a5a4a', 57: '#4a4a3a', 58: '#3a3a2a', 59: '#5a5a4a', 60: '#2a1a2a',
  61: '#4a1a4a', 62: '#1a3a3a', 63: '#3a0a0a', 64: '#0a1a2a', 65: '#4a4a1a',
  66: '#1a1a3a', 67: '#2a0a2a', 68: '#0a3a1a', 69: '#3a3a0a', 70: '#5a1a3a',
  71: '#4a3a1a', 72: '#5a5a5a', 73: '#3a3a3a', 74: '#6a5a3a', 75: '#4a4a4a',
  76: '#7a6a3a', 77: '#6a5a2a', 78: '#8a7a4a', 79: '#5a4a1a', 80: '#4a3a0a',
}
