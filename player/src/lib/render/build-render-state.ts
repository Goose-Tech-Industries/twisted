// Adapt the player-client domain stores (character/world) into the
// flat RenderState shape that @twisted/render expects. Pure function —
// safe to call from anywhere, runs cheap, is the contract between
// "what the channels gave us" and "what the renderer draws".

import type { RenderState } from '@twisted/render'
import type { Character } from '$stores/character.svelte'
import type { MapDef, NearbyPlayer, MapNpc, GroundItem } from '$stores/world.svelte'
import type { TilePaletteEntry } from '$stores/tile_palette.svelte'

export interface BuildRenderStateArgs {
  map: MapDef
  character: Character | null
  players: NearbyPlayer[]
  npcs: MapNpc[]
  drops: GroundItem[]
  /** Admin-defined tile palette pushed on the channel. When present
   * the renderer maps tile ids → admin colors/sprites; otherwise it
   * falls back to its DEFAULT_TILE_COLORS table. */
  palette?: TilePaletteEntry[]
  viewportW: number
  viewportH: number
  tileSize: number
}

const TILE_SIZE = 32

/**
 * Flatten the [y][x] tile grid the channels send us into the flat
 * row-major number[] arrays @twisted/render's `RenderState.layers`
 * expects. Returns the same length as `width * height`.
 */
function flattenTiles(tiles: number[][], width: number, height: number): number[] {
  const out: number[] = new Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = tiles[y]
    for (let x = 0; x < width; x++) {
      out[y * width + x] = row?.[x] ?? 0
    }
  }
  return out
}

export function buildRenderState(args: BuildRenderStateArgs): RenderState {
  const { map, character, players, npcs, drops, palette, viewportW, viewportH, tileSize } = args
  const ground = flattenTiles(map.tiles, map.width, map.height)
  const layers = map.layers
  const area = map.width * map.height
  const readLayer = (data: number[] | undefined, fallback: number) =>
    data && data.length === area ? data : new Array(area).fill(fallback)

  // CRITICAL: the @twisted/render renderer expects viewportW/H and
  // camX/Y in TILE units, not pixel units. Its `viewportSize(vpW, _, s)`
  // returns `{ w: vpW * s, h: vpH * s }` and `offsetX` is computed as
  // `-camX * step + vpPxW/2`. Passing pixel coords here makes tiles
  // render thousands of pixels off-canvas (the prior bug — black canvas
  // even though state.layers.ground was full and `gfxBuckets > 0`).
  // Convert pixel viewport → tile viewport via `step = tileSize + 1`.
  const step = tileSize + 1
  const tilesAcross = Math.max(1, Math.floor(viewportW / step))
  const tilesDown = Math.max(1, Math.floor(viewportH / step))

  // Camera follows the character (tile coords, centered in viewport).
  //
  // Two regimes:
  //   - Map LARGER than viewport: cam follows player, clamped to map edges
  //   - Map SMALLER than viewport: cam fixed to map center
  //
  // The renderer's offset math is `offsetX = -camX*step + vpPxW/2 - step/2`,
  // which puts world tile `camX` at screen center (more precisely, world
  // tile `camX + 0.5` at the centre pixel). When the map is small and we
  // simply clamped to 0, world tile (0,0) ended up at screen centre and
  // the map painted into the right/bottom quadrant. Fix: when map fits
  // inside the viewport, place cam at map centre so the map renders
  // centred in the canvas.
  const px = character?.x ?? Math.floor(map.width / 2)
  const py = character?.y ?? Math.floor(map.height / 2)

  let camX: number
  if (map.width <= tilesAcross) {
    camX = (map.width - 1) / 2
  } else {
    const camTileX = px - tilesAcross / 2 + 0.5
    camX = Math.max(0, Math.min(camTileX, map.width - tilesAcross))
  }

  let camY: number
  if (map.height <= tilesDown) {
    camY = (map.height - 1) / 2
  } else {
    const camTileY = py - tilesDown / 2 + 0.5
    camY = Math.max(0, Math.min(camTileY, map.height - tilesDown))
  }

  return {
    layers: {
      ground,
      overlay: readLayer(layers?.overlay, -1),
      passability: readLayer(layers?.passability, 0),
      fringe: readLayer(layers?.fringe, -1),
      elevation: readLayer(layers?.elevation, 0)
    },
    mapWidth: map.width,
    mapHeight: map.height,

    objects: [],

    entities: npcs.map(n => ({
      id: `npc:${n.id}`,
      kind: n.is_enemy ? 'enemy' : 'npc',
      x: n.x,
      y: n.y,
      name: n.name
    })),

    nearbyPlayers: players.map(p => ({
      id: `player:${p.charId}`,
      x: p.x,
      y: p.y,
      name: p.name
    })),

    groundItems: drops.map(d => ({
      id: d.id,
      x: d.x,
      y: d.y
    })),

    playerX: px,
    playerY: py,
    playerName: character?.name,

    camX,
    camY,
    viewportW: tilesAcross,
    viewportH: tilesDown,

    ambientDark: map.ambient_dark,

    tilePalette: palette
  }
}

export { TILE_SIZE }
