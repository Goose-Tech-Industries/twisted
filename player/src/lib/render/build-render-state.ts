// Adapt the player-client domain stores (character/world) into the
// flat RenderState shape that @twisted/render expects. Pure function —
// safe to call from anywhere, runs cheap, is the contract between
// "what the channels gave us" and "what the renderer draws".

import type { RenderState } from '@twisted/render'
import type { Character } from '$stores/character.svelte'
import type { MapDef, NearbyPlayer, MapNpc, GroundItem } from '$stores/world.svelte'
import type { TilePaletteEntry } from '$stores/tile_palette.svelte'
import type { Equipment } from '$stores/inventory.svelte'

export interface BuildRenderStateArgs {
  map: MapDef
  character: Character | null
  players: NearbyPlayer[]
  npcs: MapNpc[]
  drops: GroundItem[]
  palette?: TilePaletteEntry[]
  equipment?: Equipment
  viewportW: number
  viewportH: number
  tileSize: number
  fogEnabled?: boolean
  exploredTiles?: Set<string>
  timeOfDay?: string
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
  const { map, character, players, npcs, drops, palette, viewportW, viewportH, tileSize, fogEnabled, exploredTiles } = args
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

  const tod = (args.timeOfDay || 'day').toLowerCase()
  const nightDarkness = (() => {
    switch (tod) {
      case 'dawn': return 0.20
      case 'day': return 0.0
      case 'dusk': return 0.45
      case 'night': return 0.72
      case 'midnight': return 0.88
      default: return 0.0
    }
  })()

  // Dynamic light sources (halos) for lanterns during dusk/night/midnight or in dark interiors
  const objects: Array<{
    x: number
    y: number
    type?: string
    preset?: string
    light?: { radius: number; color?: string; flicker?: boolean }
  }> = []

  const isDark = nightDarkness > 0 || (map.ambient_dark ?? 0) > 0.3

  if (isDark) {
    // 1. Player's handheld lantern halo
    objects.push({
      x: px,
      y: py,
      preset: 'LANTERN',
      light: {
        radius: 3.8,
        color: '#ffb347',
        flicker: true
      }
    })

    // 2. Nearby players' lanterns
    for (const p of players) {
      objects.push({
        x: p.x,
        y: p.y,
        preset: 'LANTERN',
        light: {
          radius: 3.2,
          color: '#ffd080',
          flicker: true
        }
      })
    }

    // 3. Captain Vane and lantern-bearing town watch / nocturnal sentries
    for (const n of npcs) {
      const name = (n.name || '').toLowerCase()
      const isVane = name.includes('vane')
      const isWatch = name.includes('watch') || name.includes('sentry') || name.includes('guard')
      if (isVane || isWatch) {
        objects.push({
          x: n.x,
          y: n.y,
          preset: 'LANTERN',
          light: {
            radius: isVane ? 4.5 : 3.5,
            color: isVane ? '#ff9933' : '#ffaa44',
            flicker: true
          }
        })
      }
    }
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

    objects: objects as never,

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
    playerSpriteUrl: character?.sprite_url || undefined,
    playerLayers: {
      body: character?.sprite_url || undefined,
      armor: (args.equipment?.chest as unknown as { sprite_url?: string })?.sprite_url || undefined,
      weapon: (args.equipment?.weapon as unknown as { sprite_url?: string })?.sprite_url || undefined,
      head: (args.equipment?.helmet as unknown as { sprite_url?: string })?.sprite_url || undefined,
      acc: (args.equipment?.offhand as unknown as { sprite_url?: string })?.sprite_url || (args.equipment?.amulet as unknown as { sprite_url?: string })?.sprite_url || undefined,
    },
    playerEquipped: {
      weaponIcon: args.equipment?.weapon?.icon,
      weaponName: args.equipment?.weapon?.name,
      armorIcon: args.equipment?.chest?.icon,
      shieldIcon: args.equipment?.offhand?.icon,
    },

    camX,
    camY,
    viewportW: tilesAcross,
    viewportH: tilesDown,

    ambientDark: map.ambient_dark,
    nightDarkness,

    tilePalette: palette,

    fogEnabled,
    exploredTiles: fogEnabled ? (exploredTiles as ReadonlySet<string> ?? new Set()) : undefined,
  }
}

export { TILE_SIZE }
