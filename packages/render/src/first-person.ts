/**
 * First-person pseudo-3D corridor renderer.
 *
 * Ported from /root/twisted/ui/components/game/map-renderers/pixi-renderer.tsx
 * (drawFirstPerson, lines 200-298).
 *
 * Raycasts forward from the player position against a 2D tile grid and
 * draws near/far walls at receding scales — Etrian Odyssey / Legend of
 * Grimrock / Wizardry style. Walls are tiles in the hardcoded WALL_TILE_IDS
 * set (replaceable at runtime for campaigns with different tilesets).
 */

import type { Container, Graphics } from "pixi.js";
import { darkenColor, lightenColor } from "./color.js";

/** Default wall-tile IDs. Override per-map by setting TwistedRenderer.wallTileIds. */
export const DEFAULT_WALL_TILE_IDS: ReadonlySet<number> = new Set([
  1, 6, 7, 16, 24, 30, 38, 47, 50,
]);

/** Default tile color lookup — overridden by DB tile palette at runtime. */
export type TileColorLookup = (tileId: number) => number;

export interface FirstPersonDrawArgs {
  /** Pixi namespace (dynamically imported to keep @twisted/render tree-shakeable). */
  pixi: typeof import("pixi.js");
  /** Layer containers the walls/ground/ceiling are drawn into. */
  layers: {
    ground: Container;
    walls: Container;
  };
  /** 2D tile grid [y][x] — raw tile IDs. */
  tiles: number[][];
  mapWidth: number;
  mapHeight: number;
  playerX: number;
  playerY: number;
  /** Facing direction: 0=N, 1=E, 2=S, 3=W. */
  facing: number;
  viewportPxW: number;
  viewportPxH: number;
  /** Tile color lookup — pass from your palette, falls back to 0x4a4a4a. */
  tileColor: TileColorLookup;
  /** Optional wall set override (default: DEFAULT_WALL_TILE_IDS). */
  wallTileIds?: ReadonlySet<number>;
  /** Max raycast depth in tiles (default 8). */
  maxDepth?: number;
}

/**
 * Draw a single first-person frame into the given Pixi layers.
 * Clears no layers — caller is responsible for removing old children first.
 */
export function drawFirstPerson(args: FirstPersonDrawArgs): void {
  const {
    pixi: PIXI,
    layers,
    tiles,
    mapWidth,
    mapHeight,
    playerX,
    playerY,
    facing,
    viewportPxW: vpW,
    viewportPxH: vpH,
    tileColor,
    wallTileIds = DEFAULT_WALL_TILE_IDS,
    maxDepth = 8,
  } = args;

  const corridorW = vpW * 0.6;
  const corridorH = vpH * 0.6;

  // Sky / ceiling backdrop
  const sky = new PIXI.Graphics().rect(0, 0, vpW, vpH / 2).fill(0x0a0a1a);
  layers.ground.addChild(sky);
  // Floor
  const floor = new PIXI.Graphics().rect(0, vpH / 2, vpW, vpH / 2).fill(0x2a2a1a);
  layers.ground.addChild(floor);

  // Facing vectors — 0=N, 1=E, 2=S, 3=W
  const dirs: Array<readonly [number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const fi = ((facing % 4) + 4) % 4;
  const [fdx, fdy] = dirs[fi]!;
  const [rdx, rdy] = dirs[(fi + 1) % 4]!;

  for (let depth = 0; depth < maxDepth; depth++) {
    const scale = 1 - (depth / maxDepth) * 0.85;
    const nextScale = 1 - ((depth + 1) / maxDepth) * 0.85;
    const cx = playerX + fdx * depth;
    const cy = playerY + fdy * depth;
    if (cx < 0 || cy < 0 || cx >= mapWidth || cy >= mapHeight) break;

    const row = tiles[cy];
    const tile = row ? (row[cx] ?? 0) : 0;

    // Forward wall — stops the raycast.
    if (wallTileIds.has(tile) && depth > 0) {
      const w = corridorW * scale;
      const h = corridorH * scale;
      const x = (vpW - w) / 2;
      const y = (vpH - h) / 2;
      const color = tileColor(tile);
      const wall: Graphics = new PIXI.Graphics()
        .rect(x, y, w, h)
        .fill(lightenColor(color, 1.2));
      layers.walls.addChild(wall);
      break;
    }

    const floorColor = tileColor(tile);
    const w1 = corridorW * scale;
    const w2 = corridorW * nextScale;
    const h1 = corridorH * scale;
    const h2 = corridorH * nextScale;
    const x1 = (vpW - w1) / 2;
    const x2 = (vpW - w2) / 2;
    const y1 = (vpH - h1) / 2;
    const y2 = (vpH - h2) / 2;

    // Left wall
    const lx = cx - rdx;
    const ly = cy - rdy;
    if (lx >= 0 && ly >= 0 && lx < mapWidth && ly < mapHeight) {
      const lrow = tiles[ly];
      const lt = lrow ? (lrow[lx] ?? 0) : 0;
      if (wallTileIds.has(lt)) {
        const wc = darkenColor(tileColor(lt), 0.7);
        const lw: Graphics = new PIXI.Graphics();
        lw.poly([x1, y1, x2, y2, x2, y2 + h2, x1, y1 + h1]);
        lw.fill(wc);
        layers.walls.addChild(lw);
      }
    }

    // Right wall
    const rx = cx + rdx;
    const ry = cy + rdy;
    if (rx >= 0 && ry >= 0 && rx < mapWidth && ry < mapHeight) {
      const rrow = tiles[ry];
      const rt = rrow ? (rrow[rx] ?? 0) : 0;
      if (wallTileIds.has(rt)) {
        const wc = darkenColor(tileColor(rt), 0.6);
        const rw: Graphics = new PIXI.Graphics();
        rw.poly([x1 + w1, y1, x2 + w2, y2, x2 + w2, y2 + h2, x1 + w1, y1 + h1]);
        rw.fill(wc);
        layers.walls.addChild(rw);
      }
    }

    // Floor stripe at this depth
    const fs: Graphics = new PIXI.Graphics();
    fs.poly([x1, y1 + h1, x2, y2 + h2, x2 + w2, y2 + h2, x1 + w1, y1 + h1]);
    fs.fill(darkenColor(floorColor, 0.8 - depth * 0.05));
    layers.ground.addChild(fs);

    // Ceiling stripe
    const cs: Graphics = new PIXI.Graphics();
    cs.poly([x1, y1, x2, y2, x2 + w2, y2, x1 + w1, y1]);
    cs.fill(darkenColor(0x1a1a2a, 0.9 - depth * 0.05));
    layers.ground.addChild(cs);
  }
}
