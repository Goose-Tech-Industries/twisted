/**
 * Projection strategies for 2D map rendering.
 *
 * Each strategy defines how map-space coordinates (tile x, tile y, elevation)
 * project to screen-space pixels, plus helpers for drawing tile shapes and
 * viewport culling.
 *
 * Ported from /root/twisted/ui/components/game/map-renderers/pixi-renderer.tsx
 * (lines 46-198 — `makeProjection`).
 *
 * All strategies are pure math and rendering-primitive-agnostic. A minimal
 * `TileDrawContext` interface abstracts the drawing target so the same
 * strategies can feed Pixi Graphics, Canvas2D, or tests.
 */

import type { RenderMode } from "../index.js";

/**
 * Minimal drawing primitive interface. Matches the subset of Pixi v8 Graphics
 * API that the projection drawTile() methods need. Any renderer that can
 * implement these five methods can accept a Projection.
 *
 * For Pixi: a Graphics instance satisfies this natively.
 * For tests: a fake that records calls works.
 */
export interface TileDrawContext {
  rect(x: number, y: number, w: number, h: number): TileDrawContext | void;
  poly(points: number[]): TileDrawContext | void;
  moveTo(x: number, y: number): TileDrawContext | void;
  lineTo(x: number, y: number): TileDrawContext | void;
  closePath(): TileDrawContext | void;
}

/**
 * Every projection strategy implements this interface.
 */
export interface Projection {
  readonly mode: RenderMode;

  /**
   * Project map-space tile coordinate to screen-space pixel coordinate,
   * accounting for elevation (for 2.5D and iso wall extrusion) and camera offsets.
   */
  toScreen(
    tileX: number,
    tileY: number,
    elevation: number,
    step: number,
    offsetX: number,
    offsetY: number
  ): { sx: number; sy: number };

  /**
   * Inverse of toScreen — project a screen-space pixel back to a tile
   * coordinate. Used by the editor to translate pointer events into tile
   * clicks under any projection.
   *
   * Elevation is not inverted (click-through at elevation 0); callers that
   * need an elevated pick should iterate candidate elevations externally.
   */
  toMap(
    sx: number,
    sy: number,
    step: number,
    offsetX: number,
    offsetY: number
  ): { tileX: number; tileY: number };

  /**
   * Draw the tile shape at screen coordinates (sx, sy) into the given context.
   * For classic/2.5D/side-scroll/fp: a rect. For iso: a diamond. For hex: a hexagon.
   */
  drawTile(gfx: TileDrawContext, sx: number, sy: number, tileSize: number): void;

  /**
   * Compute the pixel dimensions a tile viewport (vpW × vpH tiles) will occupy
   * in screen space. Used to size the root Container / set scissors.
   */
  viewportSize(
    vpW: number,
    vpH: number,
    step: number
  ): { w: number; h: number };

  /**
   * Viewport culling — is tile (tx, ty) inside the visible camera rect?
   */
  inViewport(
    tileX: number,
    tileY: number,
    camX: number,
    camY: number,
    vpW: number,
    vpH: number
  ): boolean;
}

/**
 * Height in pixels added per elevation level. Matches the legacy renderer.
 * Used by 2.5D and isometric projections for wall/cliff extrusion.
 */
export const WALL_HEIGHT_PX = 24;

/**
 * Factory: build the projection strategy for a given render mode.
 * `tileSize` is the logical tile side in pixels at the current zoom.
 */
export function makeProjection(mode: RenderMode, tileSize: number): Projection {
  const step = tileSize + 1;
  const halfW = tileSize / 2;
  const halfH = tileSize / 4;

  switch (mode) {
    case "isometric":
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          const sx = (x - y) * halfW + offsetX;
          const sy = (x + y) * halfH - elev * WALL_HEIGHT_PX + offsetY;
          return { sx, sy };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          // Invert the iso transform:
          //   u = sx - offsetX = (x - y) * halfW
          //   v = sy - offsetY = (x + y) * halfH     (elev ignored, see interface)
          // so x = u/(2*halfW) + v/(2*halfH), y = v/(2*halfH) - u/(2*halfW)
          const u = sx - offsetX;
          const v = sy - offsetY;
          const a = u / (2 * halfW);
          const b = v / (2 * halfH);
          return { tileX: Math.floor(a + b), tileY: Math.floor(b - a) };
        },
        drawTile(gfx, sx, sy) {
          // Diamond shape — Disgaea / FFT style
          gfx.poly([
            sx + halfW, sy,
            sx + tileSize, sy + halfH,
            sx + halfW, sy + tileSize / 2,
            sx, sy + halfH,
          ]);
        },
        viewportSize(vpW, vpH, s) {
          return {
            w: (vpW + vpH) * halfW + s * 4,
            h: (vpW + vpH) * halfH + s * 4,
          };
        },
        // O-v3 final: camX/camY is the world tile that should appear at
        // the CENTER of the viewport (per renderer.ts computeOffsets
        // convention). Earlier impl assumed camX was top-left, which
        // culled the upper-left half of any centered map. Use ±vp/2
        // around the camera, plus a 3-tile buffer for iso's diamond
        // overdraw.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return (
            x >= camX - vpW / 2 - 3 &&
            x <= camX + vpW / 2 + 3 &&
            y >= camY - vpH / 2 - 3 &&
            y <= camY + vpH / 2 + 3
          );
        },
      };

    case "2.5d":
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          return {
            sx: x * step + offsetX,
            sy: y * step - elev * WALL_HEIGHT_PX + offsetY,
          };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          return {
            tileX: Math.floor((sx - offsetX) / step),
            tileY: Math.floor((sy - offsetY) / step),
          };
        },
        drawTile(gfx, sx, sy) {
          gfx.rect(sx, sy, tileSize, tileSize);
        },
        viewportSize(vpW, vpH, s) {
          return { w: vpW * s, h: vpH * s + WALL_HEIGHT_PX * 8 };
        },
        // O-v3 final: camX/camY is the viewport CENTER. 2.5d keeps a
        // larger Y buffer (±3) to cover wall extrusions reaching above
        // their base tile.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return (
            x >= camX - vpW / 2 - 2 &&
            x <= camX + vpW / 2 + 2 &&
            y >= camY - vpH / 2 - 3 &&
            y <= camY + vpH / 2 + 3
          );
        },
      };

    case "classic":
    default:
      return classicProjection("classic", tileSize, step);
  }
}

function classicProjection(
  mode: RenderMode,
  tileSize: number,
  step: number
): Projection {
  return {
    mode,
    toScreen(x, y, _elev, _step, offsetX, offsetY) {
      return { sx: x * step + offsetX, sy: y * step + offsetY };
    },
    toMap(sx, sy, _step, offsetX, offsetY) {
      return {
        tileX: Math.floor((sx - offsetX) / step),
        tileY: Math.floor((sy - offsetY) / step),
      };
    },
    drawTile(gfx, sx, sy) {
      gfx.rect(sx, sy, tileSize, tileSize);
    },
    viewportSize(vpW, vpH, s) {
      return { w: vpW * s, h: vpH * s };
    },
    // O-v3 final: camX/camY is the world tile that appears at the CENTER
    // of the viewport, per renderer.ts computeOffsets. Earlier impl
    // assumed camX was the top-left tile, which culled the upper-left
    // half of any centered map (e.g. tiles 0..9 of a 24×24 map with
    // camX=11.5, vpW=24 → only tiles 10..23 render → "14×14 lower-right
    // corner" symptom). Use ±vp/2 around the camera + 2-tile buffer.
    inViewport(x, y, camX, camY, vpW, vpH) {
      return (
        x >= camX - vpW / 2 - 2 &&
        x <= camX + vpW / 2 + 2 &&
        y >= camY - vpH / 2 - 2 &&
        y <= camY + vpH / 2 + 2
      );
    },
  };
}
