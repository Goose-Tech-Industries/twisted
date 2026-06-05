/**
 * Entity rendering system.
 *
 * Manages the on-screen visual representation of players, NPCs, enemies,
 * projectiles, and companions. Uses Pixi's sprite system with texture
 * atlas batching for performance, and supports the 5-layer character
 * compositing model from the legacy game_engine.js CHAR_LAYER_ORDER:
 *
 *    body → head → hair → armor → weapon → acc
 *
 * The system is framework-agnostic (no React / Svelte / LiveView imports).
 * Consumers push `MapEntity[]` via `EntityRenderer.update()` on every tick
 * and the renderer reconciles the on-screen state with the given list.
 *
 * Design notes:
 *   - Each unique entity ID gets a persistent Pixi Container holding its
 *     layered sprites. Reconciliation adds/removes/updates in place,
 *     never rebuilds the whole scene.
 *   - Movement interpolates between the last known server tick and the
 *     current target position so other-player motion looks smooth even
 *     at 10Hz server tick rates.
 *   - Sprite textures are cached globally keyed on URL so the same hair
 *     sprite shared across 50 NPCs loads once.
 *   - Character layer order is hardcoded to the legacy CHAR_LAYER_ORDER
 *     but individual layers can be nil — a humanoid NPC might have no
 *     weapon, a wisp might only have body.
 *   - Animation frames are tracked per-entity with a per-entity fps so
 *     idle vs attack animations can run at different rates.
 */

import type { Container, Texture } from "pixi.js";
import type { MapEntity } from "./types.js";
import type { Projection } from "./projections/index.js";

/** Canonical layer order — matches legacy game_engine.js CHAR_LAYER_ORDER. */
export const CHAR_LAYER_ORDER = [
  "body",
  "head",
  "hair",
  "armor",
  "weapon",
  "acc",
] as const;

export type CharLayerName = (typeof CHAR_LAYER_ORDER)[number];

/**
 * Per-entity visual state tracked by EntityRenderer. Internal — callers
 * only deal with MapEntity input.
 */
interface EntityVisual {
  id: string | number;
  container: Container;
  /** Sprites indexed by layer name — may be missing layers. */
  layers: Partial<Record<CharLayerName, import("pixi.js").Sprite>>;
  /** Fallback marker (circle) when no sprite URLs are provided. */
  marker: import("pixi.js").Graphics | null;
  /** Current displayed tile position (for lerping). */
  drawX: number;
  drawY: number;
  /** Target tile position from the latest server tick. */
  targetX: number;
  targetY: number;
  /** Lerp progress 0..1 from drawX/Y to targetX/Y. */
  lerpT: number;
  /** Current facing direction (0..3) if the sprite has directional frames. */
  facing: number;
  /** Current animation state. */
  animation: NonNullable<MapEntity["animation"]>;
  /** Frame index within the current animation. */
  animFrame: number;
  /** Last frame advance time (perf.now ms). */
  lastFrameAt: number;
  /** Cached entity data from the last update (for dirty checks). */
  lastData: MapEntity;
}

export interface EntityRendererOptions {
  /** The Pixi container entities are drawn into — typically `layers.entities`. */
  container: Container;
  /** Projection strategy used to convert tile (x,y) → screen (sx,sy). */
  projection: Projection;
  /** Pixel size of a tile side at the current zoom. */
  tileSize: number;
  /** Camera offset computed by the outer renderer (passed every update). */
  getOffset: () => { x: number; y: number };
  /** Pixi namespace (injected for framework-agnosticism). */
  pixi: typeof import("pixi.js");
}

/**
 * Global sprite texture cache. Shared across all EntityRenderer
 * instances so that reused character layers (the same hair on 50 NPCs)
 * are loaded once.
 */
const textureCache = new Map<string, Promise<Texture>>();

/**
 * Fetch (or hit cache for) a sprite texture at the given URL. Returns a
 * Pixi.Texture.
 */
async function loadTexture(
  PIXI: typeof import("pixi.js"),
  url: string
): Promise<Texture> {
  let cached = textureCache.get(url);
  if (!cached) {
    cached = PIXI.Assets.load(url);
    textureCache.set(url, cached);
  }
  return cached;
}

/**
 * EntityRenderer — stateful reconciler for on-screen entities.
 *
 * Call `update(entities)` every frame. The renderer adds new entities,
 * updates existing ones, removes ones that have left the map, and
 * advances interpolation + animation.
 */
export class EntityRenderer {
  private opts: EntityRendererOptions;
  private visuals = new Map<string | number, EntityVisual>();
  /** Lerp speed — 1.0 = snap instantly, 0.2 = smooth over ~5 frames. */
  private lerpSpeed = 0.2;

  constructor(opts: EntityRendererOptions) {
    this.opts = opts;
  }

  /** Update the internal projection after a render-mode switch. */
  setProjection(projection: Projection, tileSize: number): void {
    this.opts.projection = projection;
    this.opts.tileSize = tileSize;
  }

  /** Reconcile the on-screen state to match the input entity list. */
  update(entities: readonly MapEntity[], dtMs: number): void {
    const seen = new Set<string | number>();

    for (const ent of entities) {
      seen.add(ent.id);
      let vis = this.visuals.get(ent.id);

      if (!vis) {
        vis = this.spawn(ent);
        this.visuals.set(ent.id, vis);
      } else {
        this.updateEntity(vis, ent);
      }

      this.tick(vis, dtMs);
      this.reproject(vis);
    }

    // Remove visuals for entities that disappeared
    for (const [id, vis] of this.visuals.entries()) {
      if (!seen.has(id)) {
        this.opts.container.removeChild(vis.container);
        vis.container.destroy({ children: true });
        this.visuals.delete(id);
      }
    }
  }

  /** Clean up all sprites + containers. */
  destroy(): void {
    for (const vis of this.visuals.values()) {
      this.opts.container.removeChild(vis.container);
      vis.container.destroy({ children: true });
    }
    this.visuals.clear();
  }

  // ── Internals ──────────────────────────────────────────────

  private spawn(ent: MapEntity): EntityVisual {
    const PIXI = this.opts.pixi;
    const container = new PIXI.Container();
    container.label = `entity-${ent.id}`;

    const vis: EntityVisual = {
      id: ent.id,
      container,
      layers: {},
      marker: null,
      drawX: ent.x,
      drawY: ent.y,
      targetX: ent.x,
      targetY: ent.y,
      lerpT: 1,
      facing: ent.facing ?? 2,
      animation: ent.animation ?? "idle",
      animFrame: 0,
      lastFrameAt: performance.now(),
      lastData: ent,
    };

    // If the entity has layered sprite URLs, spawn one sprite per layer
    // in CHAR_LAYER_ORDER. Otherwise fall back to a colored marker.
    if (ent.layers && Object.keys(ent.layers).length > 0) {
      for (const layerName of CHAR_LAYER_ORDER) {
        const url = ent.layers[layerName];
        if (url) {
          const placeholder = new PIXI.Sprite(PIXI.Texture.WHITE);
          placeholder.width = this.opts.tileSize;
          placeholder.height = this.opts.tileSize;
          placeholder.tint = kindColor(ent.kind);
          container.addChild(placeholder);
          vis.layers[layerName] = placeholder;

          // Load real texture asynchronously; swap it in when ready.
          void loadTexture(PIXI, url).then((tex) => {
            if (!placeholder.destroyed) {
              placeholder.texture = tex;
              placeholder.tint = 0xffffff;
            }
          });
        }
      }
    } else if (ent.spriteUrl) {
      const placeholder = new PIXI.Sprite(PIXI.Texture.WHITE);
      placeholder.width = this.opts.tileSize;
      placeholder.height = this.opts.tileSize;
      placeholder.tint = kindColor(ent.kind);
      container.addChild(placeholder);
      vis.layers.body = placeholder;

      void loadTexture(PIXI, ent.spriteUrl).then((tex) => {
        if (!placeholder.destroyed) {
          placeholder.texture = tex;
          placeholder.tint = 0xffffff;
        }
      });
    } else {
      // Marker fallback — colored circle keyed on entity kind.
      const marker = new PIXI.Graphics()
        .circle(this.opts.tileSize / 2, this.opts.tileSize / 2, this.opts.tileSize / 3)
        .fill(kindColor(ent.kind));
      container.addChild(marker);
      vis.marker = marker;
    }

    // Nameplate (simple text label above the sprite)
    if (ent.name) {
      const text = new PIXI.Text({
        text: ent.name,
        style: {
          fontFamily: "monospace",
          fontSize: 10,
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 2 },
        },
      });
      text.x = this.opts.tileSize / 2 - text.width / 2;
      text.y = -12;
      container.addChild(text);
    }

    this.opts.container.addChild(container);
    return vis;
  }

  private updateEntity(vis: EntityVisual, ent: MapEntity): void {
    // Movement target: if position changed, start a new lerp from current
    // displayed position.
    if (ent.x !== vis.targetX || ent.y !== vis.targetY) {
      vis.drawX = vis.drawX;
      vis.drawY = vis.drawY;
      vis.targetX = ent.x;
      vis.targetY = ent.y;
      vis.lerpT = 0;
    }

    if (ent.facing !== undefined && ent.facing !== vis.facing) {
      vis.facing = ent.facing;
    }

    if (ent.animation && ent.animation !== vis.animation) {
      vis.animation = ent.animation;
      vis.animFrame = 0;
    }

    vis.lastData = ent;
  }

  /** Advance interpolation + animation for one visual. */
  private tick(vis: EntityVisual, dtMs: number): void {
    // Position lerp
    if (vis.lerpT < 1) {
      vis.lerpT = Math.min(1, vis.lerpT + this.lerpSpeed * (dtMs / 16));
      vis.drawX = lerp(vis.drawX, vis.targetX, this.lerpSpeed);
      vis.drawY = lerp(vis.drawY, vis.targetY, this.lerpSpeed);
      if (Math.abs(vis.drawX - vis.targetX) < 0.01) vis.drawX = vis.targetX;
      if (Math.abs(vis.drawY - vis.targetY) < 0.01) vis.drawY = vis.targetY;
    }

    // Animation frame advance (stub — real sprite-sheet frame cycling
    // lands when we port SpriteAnimation from /root/twisted/ui/lib/sprite-animation.ts)
    const now = performance.now();
    if (now - vis.lastFrameAt > 150) {
      vis.animFrame = (vis.animFrame + 1) % 4;
      vis.lastFrameAt = now;
    }
  }

  /** Project current drawX/drawY to screen coordinates and move the container. */
  private reproject(vis: EntityVisual): void {
    const offset = this.opts.getOffset();
    const step = this.opts.tileSize + 1;
    const { sx, sy } = this.opts.projection.toScreen(
      vis.drawX,
      vis.drawY,
      0, // elevation — fed later from the map's elevation layer
      step,
      offset.x,
      offset.y
    );
    vis.container.x = sx;
    vis.container.y = sy;
  }
}

// ── Helpers ────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function kindColor(kind: MapEntity["kind"]): number {
  switch (kind) {
    case "player":
      return 0xffd166;
    case "npc":
      return 0x7dd3fc;
    case "enemy":
      return 0xef4444;
    case "projectile":
      return 0xf59e0b;
    case "companion":
      return 0xa78bfa;
    default:
      return 0xffffff;
  }
}
