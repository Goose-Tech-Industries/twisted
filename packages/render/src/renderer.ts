/**
 * TwistedRenderer — framework-agnostic Pixi-powered map renderer.
 *
 * Replaces the internals of /root/twisted/ui/components/game/map-renderers/pixi-renderer.tsx
 * with a class-based, lifecycle-aware renderer that can be driven from:
 *   - React (useEffect → init/destroy, props → update)
 *   - Phoenix LiveView JS hook (mounted/destroyed, pushEventTo → update)
 *   - Svelte action (return destroy, set state → update)
 *   - Vanilla JS
 *
 * No framework imports inside this file. Only Pixi and our own modules.
 */

import type { Application, Container } from "pixi.js";
import type { CanvasMode, RenderMode } from "./index.js";
import type { RenderState, RendererCallbacks, TilePaletteEntry } from "./types.js";
import { makeProjection, type Projection, WALL_HEIGHT_PX } from "./projections/index.js";
import { drawFirstPerson, DEFAULT_WALL_TILE_IDS } from "./first-person.js";
import { EntityRenderer } from "./entities.js";
import { darkenColor, lightenColor } from "./color.js";

const WALL_DARKEN = 0.45;

/** Default color map for tile IDs 0..63. Matches legacy TILE_COLORS. */
const DEFAULT_TILE_COLORS: Record<number, number> = {
  0: 0x2e5d31, // grass
  1: 0x3a3a3a, // stone wall
  2: 0x3a2a0a, // dirt
  3: 0x1e3a5f, // water
  4: 0x7a5a2a, // wood
  5: 0x8a8a8a, // cobble
  6: 0x2a2a2a, // cave wall
  7: 0x1a1a1a, // void
};

/** Lazy Pixi import — lets the package be imported without pulling Pixi into SSR bundles. */
let pixiPromise: Promise<typeof import("pixi.js")> | null = null;
function loadPixi(): Promise<typeof import("pixi.js")> {
  if (!pixiPromise) pixiPromise = import("pixi.js");
  return pixiPromise;
}

export interface TwistedRendererOptions {
  /** DOM element to mount the Pixi canvas into. */
  container: HTMLElement;
  /** Operating mode — editor, live play, or battle. */
  canvasMode: CanvasMode;
  /** 2D projection strategy. */
  renderMode: RenderMode;
  /** Logical pixel size of one tile side. */
  tileSize: number;
  /** Optional callback set for click/explore/etc. events. */
  callbacks?: RendererCallbacks;
  /** Background alpha 0..1 (default 0 = transparent for overlay composability). */
  backgroundAlpha?: number;
  /** Override the wall-tile ID set for first-person mode. */
  wallTileIds?: ReadonlySet<number>;
}

/**
 * Stateful Pixi renderer. Create once per canvas, call init(), then call
 * update(state) on every frame/tick. Call destroy() on teardown.
 */
export class TwistedRenderer {
  private opts: TwistedRendererOptions;
  private app: Application | null = null;
  private layers: {
    ground: Container;
    walls: Container;
    objects: Container;
    entities: Container;
    player: Container;
    fringe: Container;
    fog: Container;
  } | null = null;
  private projection: Projection;
  private ready = false;
  private destroyed = false;
  private lastState: RenderState | null = null;
  private frameCounter = 0;
  private animatedTiles: Map<number, { colors: number[]; fps: number }> = new Map();
  /** Tile IDs that have a sprite-based animation or static sprite. Keyed
   * by tile id, value is the resolved frame URL list (one entry for
   * static sprites). Lookup is consulted in drawLayer to divert cells
   * to the sprite path instead of the color bucket. */
  private spriteTiles: Map<number, { urls: string[]; fps: number }> = new Map();
  private paletteColors: Map<number, number> = new Map();
  private entityRenderer: EntityRenderer | null = null;
  /** Cache of pre-loaded player/entity sprite textures, keyed by URL. */
  private playerTextureCache = new Map<string, Promise<unknown>>();
  /** Cache of loaded MapObject textures keyed by URL. Values resolve to
   * Pixi Texture instances that can be shared across many Sprite uses. */
  private objectTextureCache = new Map<string, Promise<unknown>>();
  /** Set of object URLs currently being loaded so we don't double-load. */
  private objectLoadPromises = new Map<string, Promise<void>>();

  constructor(opts: TwistedRendererOptions) {
    this.opts = opts;
    this.projection = makeProjection(opts.renderMode, opts.tileSize);
  }

  /** Mount the Pixi Application into the container. Async — awaits Pixi load + init. */
  async init(width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    const PIXI = await loadPixi();
    if (this.destroyed) return;

    const app = new PIXI.Application();
    await app.init({
      width,
      height,
      backgroundAlpha: this.opts.backgroundAlpha ?? 0,
      antialias: false,
      resolution:
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      autoDensity: true,
    });

    if (this.destroyed) {
      app.destroy(true);
      return;
    }

    this.opts.container.innerHTML = "";
    this.opts.container.appendChild(app.canvas);
    this.app = app;

    const ground = new PIXI.Container();
    ground.label = "ground";
    const walls = new PIXI.Container();
    walls.label = "walls";
    const objects = new PIXI.Container();
    objects.label = "objects";
    const entities = new PIXI.Container();
    entities.label = "entities";
    const player = new PIXI.Container();
    player.label = "player";
    const fringe = new PIXI.Container();
    fringe.label = "fringe";
    const fog = new PIXI.Container();
    fog.label = "fog";

    app.stage.addChild(ground, walls, objects, entities, player, fringe, fog);
    this.layers = { ground, walls, objects, entities, player, fringe, fog };

    this.entityRenderer = new EntityRenderer({
      container: entities,
      projection: this.projection,
      tileSize: this.opts.tileSize,
      getOffset: () => {
        const o = this.currentOffsets();
        return { x: o.offsetX, y: o.offsetY };
      },
      pixi: PIXI,
    });

    // Animation ticker — advances frameCounter and re-runs `update`
    // at ~10fps whenever the last state contains animated tiles or
    // animated objects. Cheap because the render path is bucketed:
    // one Graphics per colour + per-sprite Pixi Sprites are light.
    let animFrameAccum = 0;
    app.ticker.add((tickerArg: unknown) => {
      const delta = typeof tickerArg === "number"
        ? tickerArg
        : (tickerArg as { deltaTime?: number })?.deltaTime ?? 1;
      animFrameAccum += delta;
      if (animFrameAccum < 6) return; // ~10fps at 60fps ticker
      animFrameAccum = 0;

      if (!this.lastState) return;

      const hasAnimatedTiles = this.animatedTiles.size > 0;
      const hasSpriteTiles = this.spriteTiles.size > 0;
      const hasAnimatedObjects = (this.lastState.objects || []).some(
        (o) => (o.sprite_anim_urls && o.sprite_anim_urls.length > 1) ||
               (o.anim_frames && o.anim_frames.length > 1)
      );

      if (hasAnimatedTiles || hasSpriteTiles || hasAnimatedObjects) {
        void this.update(this.lastState);
      }
    });

    this.ready = true;

    // Replay last state if update() was called before init() completed
    if (this.lastState) void this.update(this.lastState);
  }

  /** Push a new render state. Triggers a full redraw. */
  async update(state: RenderState): Promise<void> {
    this.lastState = state;
    if (!this.ready || this.destroyed || !this.app || !this.layers) return;
    const PIXI = await loadPixi();
    if (this.destroyed || !this.layers) return;

    // Update palette caches if the state carries a new palette
    if (state.tilePalette) this.ingestPalette(state.tilePalette);

    const layers = this.layers;
    for (const layer of Object.values(layers)) layer.removeChildren();

    // First-person mode takes over rendering entirely.
    if (this.opts.renderMode === "first-person") {
      const vp = this.projection.viewportSize(
        state.viewportW,
        state.viewportH,
        this.opts.tileSize + 1
      );
      // Build a 2D tile grid from the flat ground layer.
      const tiles2D = this.buildTile2D(state);
      drawFirstPerson({
        pixi: PIXI,
        layers: { ground: layers.ground, walls: layers.walls },
        tiles: tiles2D,
        mapWidth: state.mapWidth,
        mapHeight: state.mapHeight,
        playerX: state.playerX,
        playerY: state.playerY,
        facing: state.playerFacing ?? 0,
        viewportPxW: vp.w,
        viewportPxH: vp.h,
        tileColor: (id) => this.tileColor(id),
        wallTileIds: this.opts.wallTileIds ?? DEFAULT_WALL_TILE_IDS,
      });
      return;
    }

    // ─── All other modes: tile grid render ─────────────────────
    const { tileSize } = this.opts;
    const step = tileSize + 1;
    const viewportPxSize = this.projection.viewportSize(
      state.viewportW,
      state.viewportH,
      step
    );
    const vpPxW = viewportPxSize.w;
    const vpPxH = viewportPxSize.h;

    const offsetX =
      -state.camX * step +
      (this.opts.renderMode === "isometric" ? vpPxW / 2 : 0);
    const offsetY =
      -state.camY * step +
      (this.opts.renderMode === "isometric" ? tileSize * 2 : 0);

    // Fog of war: track newly explored tiles
    if (state.fogEnabled && this.opts.callbacks?.onExplore) {
      const r = state.fogRadius ?? 3;
      const fresh: string[] = [];
      const explored = state.exploredTiles ?? new Set<string>();
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const tx = state.playerX + dx;
          const ty = state.playerY + dy;
          if (tx < 0 || ty < 0 || tx >= state.mapWidth || ty >= state.mapHeight)
            continue;
          const key = `${tx},${ty}`;
          if (!explored.has(key)) fresh.push(key);
        }
      }
      if (fresh.length > 0) this.opts.callbacks.onExplore(fresh);
    }

    // ─── Draw all tile layers in paint order ─────────────────
    // Layer order matches legacy pixi-renderer.tsx:
    //   1. ground   → bottom-most, always drawn
    //   2. overlay  → decoration above ground, below entities
    //   3. fringe   → above-player "roof" tiles; auto-hide when player stands under them
    //   4. passability → debug/editor overlay, only when passabilityVisible is set
    //   5. elevation → debug/editor overlay, only when elevationVisible is set
    //
    // Each layer is a flat `width*height` number[] in state.layers.
    // Tile value -1 means "empty" (sparse layer) and is skipped.

    const { camX, camY, viewportW, viewportH, mapWidth, mapHeight } = state;
    const elevLayer = state.layers.elevation;
    const passabilityVisible = state.showPassability ?? false;
    const elevationVisible = state.showElevation ?? false;

    // For fringe auto-hide: tiles within 1 cell of the player are hidden
    // so the player's sprite is visible even when standing under a roof.
    const hideFringeNear = (x: number, y: number) =>
      Math.abs(x - state.playerX) <= 1 && Math.abs(y - state.playerY) <= 1;

    // Batched layer draw: group visible tiles by fill color so each color
    // becomes a single Pixi Graphics → draw all rects/polys for that color →
    // fill() once. This collapses per-tile Graphics instances (one per cell)
    // into one draw call per distinct color, which is typically 8-16 even
    // on dense maps — roughly a 100×–1000× reduction in GPU state changes.
    const drawLayer = (
      tiles: number[],
      targetContainer: Container,
      opts: { skipNegative: boolean; hideUnderPlayer: boolean; colorOverride?: (id: number) => number }
    ): void => {
      const buckets = new Map<number, Array<{ sx: number; sy: number }>>();

      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;

          const idx = y * mapWidth + x;
          const tileId = tiles[idx] ?? 0;
          if (opts.skipNegative && tileId < 0) continue;
          if (opts.hideUnderPlayer && hideFringeNear(x, y)) continue;

          const elev = elevLayer[idx] ?? 0;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);

          // Sprite-animated tile? Divert to the per-cell sprite path so
          // this cell draws as a Pixi.Sprite instead of being bucketed.
          const sprite = this.spriteTiles.get(tileId);
          if (sprite) {
            const frame = sprite.urls[Math.floor(this.frameCounter / (60 / sprite.fps)) % sprite.urls.length];
            const tex = frame ? this.getObjectTexture(frame) : null;
            if (tex) {
              const s = new PIXI.Sprite(tex as import("pixi.js").Texture);
              s.width = tileSize;
              s.height = tileSize;
              s.position.set(sx, sy);
              targetContainer.addChild(s);
            } else if (frame) {
              this.loadObjectTexture(frame);
              // Fall through to the color bucket as a placeholder while loading
              const fallback = opts.colorOverride ? opts.colorOverride(tileId) : this.tileColor(tileId);
              let b = buckets.get(fallback);
              if (!b) { b = []; buckets.set(fallback, b); }
              b.push({ sx, sy });
            }
            continue;
          }

          const color = opts.colorOverride ? opts.colorOverride(tileId) : this.tileColor(tileId);

          let bucket = buckets.get(color);
          if (!bucket) {
            bucket = [];
            buckets.set(color, bucket);
          }
          bucket.push({ sx, sy });
        }
      }

      for (const [color, cells] of buckets) {
        const gfx = new PIXI.Graphics();
        for (const { sx, sy } of cells) {
          this.projection.drawTile(gfx, sx, sy, tileSize);
        }
        gfx.fill(color);
        targetContainer.addChild(gfx);
      }
    };

    // Ground: always drawn, tile 0 is default grass (never skipped)
    drawLayer(state.layers.ground, layers.ground, {
      skipNegative: false,
      hideUnderPlayer: false,
    });

    // 2.5D wall extrusion — for every ground tile with elevation>0 draw
    // front/right/top/left/shadow/gradient faces on the walls layer.
    if (this.opts.renderMode === "2.5d") {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const elev = elevLayer[idx] ?? 0;
          if (elev <= 0) continue;

          const tileId = state.layers.ground[idx] ?? 0;
          const color = this.tileColor(tileId);
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          const wallH = elev * WALL_HEIGHT_PX;
          const wallColor = darkenColor(color, WALL_DARKEN);
          const sideW = Math.min(6, Math.ceil(tileSize * 0.15));

          const front = new PIXI.Graphics().rect(0, 0, tileSize, wallH).fill(wallColor);
          front.position.set(sx, sy + tileSize);
          layers.walls.addChild(front);

          const side = new PIXI.Graphics()
            .rect(0, 0, sideW, wallH + tileSize)
            .fill(darkenColor(color, 0.3));
          side.position.set(sx + tileSize, sy);
          layers.walls.addChild(side);

          const topEdge = new PIXI.Graphics()
            .rect(0, 0, tileSize, 2)
            .fill(lightenColor(color, 1.5));
          topEdge.position.set(sx, sy);
          layers.walls.addChild(topEdge);

          const leftEdge = new PIXI.Graphics()
            .rect(0, 0, 1, tileSize)
            .fill(lightenColor(color, 1.3));
          leftEdge.position.set(sx, sy);
          layers.walls.addChild(leftEdge);

          const shadowH = Math.min(wallH * 0.4, 8);
          const shadow = new PIXI.Graphics()
            .rect(0, 0, tileSize + sideW, shadowH)
            .fill({ color: 0x000000, alpha: 0.25 });
          shadow.position.set(sx, sy + tileSize + wallH);
          layers.walls.addChild(shadow);

          const gradStripe = new PIXI.Graphics()
            .rect(0, 0, tileSize, Math.ceil(wallH * 0.4))
            .fill({ color: 0x000000, alpha: 0.15 });
          gradStripe.position.set(sx, sy + tileSize + wallH * 0.6);
          layers.walls.addChild(gradStripe);
        }
      }
      layers.walls.sortChildren();
    }

    // Overlay: sparse, skip -1 (empty)
    drawLayer(state.layers.overlay, layers.walls, {
      skipNegative: true,
      hideUnderPlayer: false,
    });

    // Fringe: roof tiles, hide near player so they don't obscure the sprite.
    // Uses state.hiddenFringeTiles (set of tile indices) to dim tiles the
    // player is standing under without fully removing them.
    const hiddenFringe = state.hiddenFringeTiles;
    if (hiddenFringe && hiddenFringe.size > 0) {
      for (let i = 0; i < state.layers.fringe.length; i++) {
        const tileId = state.layers.fringe[i] ?? -1;
        if (tileId < 0) continue;
        const fx = i % mapWidth;
        const fy = Math.floor(i / mapWidth);
        if (!this.projection.inViewport(fx, fy, camX, camY, viewportW, viewportH)) continue;
        const isHidden = hiddenFringe.has(i);
        const { sx, sy } = this.projection.toScreen(fx, fy, 0, step, offsetX, offsetY);
        const gfx = new PIXI.Graphics();
        this.projection.drawTile(gfx, sx, sy, tileSize);
        gfx.fill({ color: this.tileColor(tileId), alpha: isHidden ? 0.1 : 1 });
        layers.fringe.addChild(gfx);
      }
    } else {
      drawLayer(state.layers.fringe, layers.fringe, {
        skipNegative: true,
        hideUnderPlayer: true,
      });
    }

    // ── Map objects (props, lights) ────────────────────────
    // Two rendering paths:
    //
    //   * sprite_url present  → real Pixi.Sprite from a loaded texture.
    //     Optional anim_frames[] rotates the texture via frameCounter.
    //     Loading is async; until the texture resolves we draw the emoji
    //     fallback so the object is never invisible mid-load.
    //
    //   * no sprite_url       → PIXI.Text with the icon character,
    //     preserving the legacy behaviour for unsprite'd objects.
    //
    // Light glow is drawn for every object with a light.radius > 0,
    // independent of the visual path above.

    for (const obj of state.objects || []) {
      if (!this.projection.inViewport(obj.x, obj.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[obj.y * mapWidth + obj.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(obj.x, obj.y, elev, step, offsetX, offsetY);

      // Current frame URL for animated objects — rotates every
      // (60 / fps) render frames. Non-animated objects just use sprite_url.
      // `sprite_anim_urls` is the URL form; `anim_frames` (tile IDs) is
      // the legacy tile-animation field and doesn't apply to sprite mode.
      const urlFrames =
        obj.sprite_anim_urls && obj.sprite_anim_urls.length > 0
          ? obj.sprite_anim_urls
          : null;
      const fps = Math.max(1, obj.anim_fps || 4);
      const activeUrl: string | undefined = urlFrames
        ? urlFrames[Math.floor(this.frameCounter / (60 / fps)) % urlFrames.length]
        : obj.sprite_url;

      let visual: import("pixi.js").Container | null = null;

      if (activeUrl) {
        const tex = this.getObjectTexture(activeUrl);

        if (tex) {
          const sprite = new PIXI.Sprite(tex as import("pixi.js").Texture);
          const targetW = (obj.sprite_w || tileSize) * (step / tileSize);
          const targetH = (obj.sprite_h || tileSize) * (step / tileSize);
          sprite.width = targetW;
          sprite.height = targetH;
          sprite.anchor.set(0.5, 1); // bottom-center so tall sprites plant on the tile
          sprite.position.set(sx + tileSize / 2, sy + tileSize);
          visual = sprite;
        } else {
          // Texture not loaded yet — fire async load and fall back to emoji
          this.loadObjectTexture(activeUrl);
        }
      }

      if (!visual) {
        const iconText = obj.icon || "📦";
        const text = new PIXI.Text({
          text: iconText,
          style: { fontSize: Math.round(tileSize * 0.65) },
        });
        text.anchor.set(0.5);
        text.position.set(sx + tileSize / 2, sy + tileSize / 2);
        visual = text;
      }

      if (this.opts.callbacks?.onObjectClick) {
        visual.eventMode = "static";
        visual.cursor = "pointer";
        const cb = this.opts.callbacks.onObjectClick;
        visual.on("pointerdown", () => cb(obj));
      }
      layers.objects.addChild(visual);

      if (obj.light && obj.light.radius > 0) {
        const glow = new PIXI.Graphics();
        const r = obj.light.radius * step;
        const c = parseInt((obj.light.color || "#ff8833").replace("#", ""), 16) || 0xff8833;
        glow.circle(0, 0, r).fill({ color: c, alpha: 0.08 });
        glow.position.set(sx + tileSize / 2, sy + tileSize / 2);
        layers.objects.addChild(glow);
      }
    }

    // ── Nearby players ─────────────────────────────────────
    for (const p of state.nearbyPlayers || []) {
      if (!this.projection.inViewport(p.x, p.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[p.y * mapWidth + p.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(p.x, p.y, elev, step, offsetX, offsetY);
      const dot = new PIXI.Graphics()
        .circle(0, 0, (tileSize - 4) / 2)
        .fill(p.isOffline ? 0x555555 : 0x44bbaa);
      dot.position.set(sx + tileSize / 2, sy + tileSize / 2);
      layers.entities.addChild(dot);
    }

    // ── Companions ─────────────────────────────────────────
    for (const comp of state.companions || []) {
      if (!this.projection.inViewport(comp.x, comp.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[comp.y * mapWidth + comp.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(comp.x, comp.y, elev, step, offsetX, offsetY);
      const text = new PIXI.Text({
        text: comp.icon || "⚔️",
        style: { fontSize: Math.round(tileSize * 0.5) },
      });
      text.anchor.set(0.5);
      text.position.set(sx + tileSize / 2, sy + tileSize / 2);
      layers.entities.addChild(text);
    }

    // ── Ground items (loot drops) ──────────────────────────
    for (const gi of state.groundItems || []) {
      if (!this.projection.inViewport(gi.x, gi.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[gi.y * mapWidth + gi.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(gi.x, gi.y, elev, step, offsetX, offsetY);

      const onPickup = this.opts.callbacks?.onPickupItem;
      if (gi.icon) {
        const text = new PIXI.Text({
          text: gi.icon,
          style: { fontSize: Math.round(tileSize * 0.5) },
        });
        text.anchor.set(0.5);
        text.position.set(sx + tileSize / 2, sy + tileSize / 2);
        if (onPickup) {
          text.eventMode = "static";
          text.cursor = "pointer";
          text.on("pointerdown", () => onPickup(gi.id));
        }
        layers.entities.addChild(text);
      } else {
        const dot = new PIXI.Graphics().circle(0, 0, tileSize * 0.2).fill(0xffcc00);
        dot.position.set(sx + tileSize / 2, sy + tileSize / 2);
        if (onPickup) {
          dot.eventMode = "static";
          dot.cursor = "pointer";
          dot.on("pointerdown", () => onPickup(gi.id));
        }
        layers.entities.addChild(dot);
      }
    }

    // ── Deployed structures ────────────────────────────────
    for (const s of state.deployedStructures || []) {
      if (!this.projection.inViewport(s.x, s.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[s.y * mapWidth + s.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(s.x, s.y, elev, step, offsetX, offsetY);
      const text = new PIXI.Text({
        text: s.icon || "🏠",
        style: { fontSize: Math.round(tileSize * 0.65) },
      });
      text.anchor.set(0.5);
      text.position.set(sx + tileSize / 2, sy + tileSize / 2);
      const onEnter = this.opts.callbacks?.onEnterStructure;
      if (onEnter) {
        text.eventMode = "static";
        text.cursor = "pointer";
        text.on("pointerdown", () => onEnter(s.id));
      }
      layers.entities.addChild(text);
    }

    // ── Active battle markers ──────────────────────────────
    for (const b of state.mapBattles || []) {
      if (!this.projection.inViewport(b.x, b.y, camX, camY, viewportW, viewportH)) continue;
      const elev = elevLayer[b.y * mapWidth + b.x] ?? 0;
      const { sx, sy } = this.projection.toScreen(b.x, b.y, elev, step, offsetX, offsetY);

      const glow = new PIXI.Graphics()
        .circle(0, 0, tileSize * 0.6)
        .fill({ color: 0xff3333, alpha: 0.4 });
      glow.position.set(sx + tileSize / 2, sy + tileSize / 2);
      layers.entities.addChild(glow);

      const icon = new PIXI.Text({
        text: "⚔️",
        style: { fontSize: Math.round(tileSize * 0.55) },
      });
      icon.anchor.set(0.5);
      icon.position.set(sx + tileSize / 2, sy + tileSize / 2);
      const onBattle = this.opts.callbacks?.onBattleClick;
      if (onBattle) {
        icon.eventMode = "static";
        icon.cursor = "pointer";
        icon.on("pointerdown", () => onBattle(b.battleId));
      }
      layers.entities.addChild(icon);
    }

    // Passability overlay (editor debug view only)
    if (passabilityVisible) {
      const passColor = (id: number): number => {
        switch (id) {
          case 0:
            return 0x00ff00; // walkable — green
          case 1:
            return 0xff0000; // blocked — red
          case 2:
            return 0xffff00; // trigger — yellow
          default:
            return 0x000000;
        }
      };
      // Passability overlay — batched by passValue so each value becomes one draw call.
      const passBuckets = new Map<number, Array<{ sx: number; sy: number }>>();
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const passValue = state.layers.passability[idx] ?? 0;
          if (passValue === 0) continue;
          const elev = elevLayer[idx] ?? 0;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          let bucket = passBuckets.get(passValue);
          if (!bucket) {
            bucket = [];
            passBuckets.set(passValue, bucket);
          }
          bucket.push({ sx, sy });
        }
      }
      for (const [passValue, cells] of passBuckets) {
        const gfx = new PIXI.Graphics();
        for (const { sx, sy } of cells) {
          this.projection.drawTile(gfx, sx, sy, tileSize);
        }
        gfx.fill({ color: passColor(passValue), alpha: 0.4 });
        layers.fog.addChild(gfx);
      }
    }

    // Elevation overlay (editor debug view) — draws a number label per tile
    if (elevationVisible) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const elev = elevLayer[idx] ?? 0;
          if (elev === 0) continue;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          const label = new PIXI.Text({
            text: String(elev),
            style: {
              fontFamily: "monospace",
              fontSize: 10,
              fill: 0xffd700,
              stroke: { color: 0x000000, width: 2 },
            },
          });
          label.x = sx + tileSize / 2 - label.width / 2;
          label.y = sy + tileSize / 2 - label.height / 2;
          layers.fog.addChild(label);
        }
      }
    }

    // ── Player marker ─────────────────────────────────────
    // If a sprite URL is provided, load and display it (async, cached).
    // Otherwise draw a ring+dot in the player's team color.
    {
      const pElev = elevLayer[state.playerY * mapWidth + state.playerX] ?? 0;
      const { sx, sy } = this.projection.toScreen(
        state.playerX,
        state.playerY,
        pElev,
        step,
        offsetX,
        offsetY
      );

      if (state.playerSpriteUrl) {
        const url = state.playerSpriteUrl;
        let texPromise = this.playerTextureCache.get(url);
        if (!texPromise) {
          texPromise = PIXI.Assets.load(url);
          this.playerTextureCache.set(url, texPromise);
        }
        const frameCounter = this.frameCounter;
        texPromise
          .then((tex: any) => {
            // Skip if the renderer moved on to a later frame or was destroyed.
            if (this.destroyed || !this.layers) return;
            if (this.frameCounter !== frameCounter + 0) {
              // Another update may have started; still OK to paint — Pixi will
              // compose. We intentionally do not skip here to avoid flicker.
            }
            const sprite = new PIXI.Sprite(tex);
            sprite.width = tileSize;
            sprite.height = tileSize;
            sprite.position.set(sx, sy);
            this.layers.player.addChild(sprite);
          })
          .catch(() => {
            const r = Math.round(tileSize * 0.275);
            const dot = new PIXI.Graphics()
              .circle(sx + tileSize / 2, sy + tileSize / 2, r)
              .fill(0x6666ff);
            if (this.layers) this.layers.player.addChild(dot);
          });
      } else {
        const r = Math.round(tileSize * 0.275);
        const ring = new PIXI.Graphics()
          .circle(sx + tileSize / 2, sy + tileSize / 2, r + 1)
          .stroke({ color: 0x8888ff, width: 2, alpha: 0.5 });
        layers.player.addChild(ring);
        const dot = new PIXI.Graphics()
          .circle(sx + tileSize / 2, sy + tileSize / 2, r)
          .fill(0x6666ff);
        layers.player.addChild(dot);
      }
    }

    // ── Fog of war + ambient darkness ──────────────────────
    // Offscreen 2D canvas composite → PIXI.Sprite. The `destination-out`
    // blend mode fails on many mobile GPUs when applied to Pixi Graphics
    // directly, so we composite on a 2D canvas first and upload as a texture.
    const totalDark = Math.min(1, (state.ambientDark ?? 0) + (state.nightDarkness ?? 0));
    const fogOn = state.fogEnabled ?? false;
    if (fogOn || totalDark > 0) {
      const darkAlpha = fogOn ? 0.92 : totalDark;

      const fogCanvas = document.createElement("canvas");
      fogCanvas.width = vpPxW;
      fogCanvas.height = vpPxH;
      const fctx = fogCanvas.getContext("2d");

      if (fctx) {
        fctx.fillStyle = `rgba(0,0,16,${darkAlpha})`;
        fctx.fillRect(0, 0, vpPxW, vpPxH);

        if (fogOn) {
          const explored = state.exploredTiles ?? new Set<string>();
          fctx.globalCompositeOperation = "destination-out";
          fctx.fillStyle = "rgba(0,0,0,0.6)";
          for (const key of explored) {
            const [txStr, tyStr] = key.split(",");
            const tx = Number(txStr);
            const ty = Number(tyStr);
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const { sx: ex, sy: ey } = this.projection.toScreen(tx, ty, 0, step, offsetX, offsetY);
            if (ex < -tileSize || ex > vpPxW + tileSize || ey < -tileSize || ey > vpPxH + tileSize) continue;
            fctx.fillRect(ex, ey, tileSize, tileSize);
          }

          const { sx: px, sy: py } = this.projection.toScreen(
            state.playerX,
            state.playerY,
            0,
            step,
            offsetX,
            offsetY
          );
          const revealR = (state.fogRadius ?? 3) * step;
          const cx = px + tileSize / 2;
          const cy = py + tileSize / 2;
          const grad = fctx.createRadialGradient(cx, cy, revealR * 0.3, cx, cy, revealR);
          grad.addColorStop(0, "rgba(0,0,0,1)");
          grad.addColorStop(0.7, "rgba(0,0,0,0.8)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          fctx.fillStyle = grad;
          fctx.beginPath();
          fctx.arc(cx, cy, revealR, 0, Math.PI * 2);
          fctx.fill();
          fctx.globalCompositeOperation = "source-over";
        }

        // Cut out light-source holes for any map object with a light radius.
        const objs = state.objects || [];
        const lit = objs.filter((o) => o.light && o.light.radius > 0);
        if (lit.length > 0) {
          fctx.globalCompositeOperation = "destination-out";
          for (const obj of lit) {
            const { sx: lx, sy: ly } = this.projection.toScreen(obj.x, obj.y, 0, step, offsetX, offsetY);
            const lr = obj.light!.radius * step;
            const lcx = lx + tileSize / 2;
            const lcy = ly + tileSize / 2;
            const lGrad = fctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
            lGrad.addColorStop(0, "rgba(0,0,0,0.9)");
            lGrad.addColorStop(0.5, "rgba(0,0,0,0.5)");
            lGrad.addColorStop(1, "rgba(0,0,0,0)");
            fctx.fillStyle = lGrad;
            fctx.beginPath();
            fctx.arc(lcx, lcy, lr, 0, Math.PI * 2);
            fctx.fill();
          }
          fctx.globalCompositeOperation = "source-over";

          // Colored glow on top of each light.
          for (const obj of lit) {
            const { sx: lx, sy: ly } = this.projection.toScreen(obj.x, obj.y, 0, step, offsetX, offsetY);
            const lr = obj.light!.radius * step * 0.6;
            const lcx = lx + tileSize / 2;
            const lcy = ly + tileSize / 2;
            const c = obj.light!.color || "#ff8833";
            const lGrad = fctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
            lGrad.addColorStop(0, c + "30");
            lGrad.addColorStop(1, c + "00");
            fctx.fillStyle = lGrad;
            fctx.beginPath();
            fctx.arc(lcx, lcy, lr, 0, Math.PI * 2);
            fctx.fill();
          }
        }

        const fogTex = PIXI.Texture.from(fogCanvas);
        const fogSprite = new PIXI.Sprite(fogTex);
        layers.fog.addChild(fogSprite);
      }
    }

    // Entity reconciliation — sprites, NPCs, enemies, drops. EntityRenderer
    // owns the `entities` layer and diffs against the previous frame so
    // textures aren't reloaded per frame.
    if (this.entityRenderer && state.entities) {
      this.entityRenderer.update(state.entities, 16);
    }

    this.frameCounter++;
  }

  /** Switch to a different render mode at runtime. Rebuilds the projection strategy. */
  setRenderMode(mode: RenderMode): void {
    this.opts.renderMode = mode;
    this.projection = makeProjection(mode, this.opts.tileSize);
    if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, this.opts.tileSize);
    if (this.lastState) void this.update(this.lastState);
  }

  /** Switch canvas mode (edit/play/battle). Future: adjusts camera + input routing. */
  setCanvasMode(mode: CanvasMode): void {
    this.opts.canvasMode = mode;
  }

  /**
   * Translate a screen-space pixel (relative to the renderer's canvas
   * element) into a tile coordinate using the current projection and the
   * last-rendered camera state. Returns null when no state is available yet
   * or when the click falls outside the visible map bounds.
   */
  screenToTile(localX: number, localY: number): { tileX: number; tileY: number } | null {
    const state = this.lastState;
    if (!state) return null;

    const { offsetX, offsetY, step } = this.currentOffsets();
    const { tileX, tileY } = this.projection.toMap(localX, localY, step, offsetX, offsetY);
    if (tileX < 0 || tileY < 0 || tileX >= state.mapWidth || tileY >= state.mapHeight) return null;
    return { tileX, tileY };
  }

  /** Project a tile coordinate back to screen pixels under the current camera. */
  tileToScreen(tileX: number, tileY: number, elevation = 0): { sx: number; sy: number } | null {
    if (!this.lastState) return null;
    const { offsetX, offsetY, step } = this.currentOffsets();
    return this.projection.toScreen(tileX, tileY, elevation, step, offsetX, offsetY);
  }

  /** Current rendering step and camera offsets. Shared by screen↔tile helpers. */
  private currentOffsets(): { step: number; offsetX: number; offsetY: number } {
    const state = this.lastState!;
    const { tileSize } = this.opts;
    const step = tileSize + 1;
    const vp = this.projection.viewportSize(state.viewportW, state.viewportH, step);

    let offsetX = -state.camX * step + vp.w / 2 - step / 2;
    let offsetY = -state.camY * step + vp.h / 2 - step / 2;
    if (this.opts.renderMode === "isometric") {
      offsetX = -state.camX * step + vp.w / 2;
      offsetY = -state.camY * step + tileSize * 2;
    }
    return { step, offsetX, offsetY };
  }

  /** Tear down the Pixi app and release GPU resources. */
  destroy(): void {
    this.destroyed = true;
    this.ready = false;
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
    this.layers = null;
  }

  // ── Internals ──────────────────────────────────────────────────

  private ingestPalette(palette: TilePaletteEntry[]): void {
    this.paletteColors.clear();
    this.animatedTiles.clear();
    this.spriteTiles.clear();
    for (const t of palette) {
      const c = parseHexColor(t.color);
      if (c !== null) this.paletteColors.set(t.id, c);

      // Sprite-based tile takes priority over color bucketing.
      if (t.frame_urls && t.frame_urls.length > 0) {
        this.spriteTiles.set(t.id, { urls: t.frame_urls, fps: t.fps ?? 4 });
      } else if (t.sprite_url) {
        this.spriteTiles.set(t.id, { urls: [t.sprite_url], fps: 1 });
      }

      if (t.frame_tiles && t.frame_tiles.length > 1) {
        const colors = t.frame_tiles.map((fid) => {
          const entry = palette.find((p) => p.id === fid);
          if (entry) {
            const pc = parseHexColor(entry.color);
            if (pc !== null) return pc;
          }
          return DEFAULT_TILE_COLORS[fid] ?? 0x333333;
        });
        this.animatedTiles.set(t.id, { colors, fps: t.fps ?? 4 });
      }
    }
  }

  /**
   * Synchronously return a loaded texture for an object sprite URL, or
   * `null` if it hasn't finished loading yet. The texture cache stores
   * **resolved** Texture values directly (via `.then(tex => cache.set)`)
   * so the hot render path never awaits — it does a single Map lookup.
   */
  private getObjectTexture(url: string): unknown | null {
    const cached = this.objectTextureCache.get(url) as unknown;
    if (cached && (cached as { __tex?: unknown }).__tex) {
      return (cached as { __tex: unknown }).__tex;
    }
    return null;
  }

  /**
   * Kick off a load for an object sprite URL. Idempotent — the second
   * call during a load-in-progress is a no-op. On completion we trigger
   * a re-render by calling `update` with the last state so the new
   * texture is picked up on the next frame.
   */
  private loadObjectTexture(url: string): void {
    if (this.objectLoadPromises.has(url)) return;

    const promise = (async () => {
      try {
        const PIXI = await loadPixi();
        const texture = await PIXI.Assets.load(url);
        // Box the resolved texture in a known-shape object so the sync
        // getter can distinguish "done" from "pending".
        this.objectTextureCache.set(url, { __tex: texture } as unknown as Promise<unknown>);
        void texture;

        // Re-render once the texture is available so the emoji fallback
        // flips to the real sprite on the next frame.
        if (this.lastState && !this.destroyed) {
          void this.update(this.lastState);
        }
      } catch (err) {
        // Failed loads are logged once; leaving the promise in-flight
        // would re-trigger on every render frame. Mark with a sentinel.
        console.warn("[TwistedRenderer] failed to load sprite", url, err);
        this.objectTextureCache.set(url, { __tex: null } as unknown as Promise<unknown>);
      } finally {
        this.objectLoadPromises.delete(url);
      }
    })();

    this.objectLoadPromises.set(url, promise);
  }

  private tileColor(id: number): number {
    const anim = this.animatedTiles.get(id);
    if (anim) {
      const fi =
        Math.floor(this.frameCounter / (60 / anim.fps)) % anim.colors.length;
      return anim.colors[fi]!;
    }
    return (
      this.paletteColors.get(id) ?? DEFAULT_TILE_COLORS[id] ?? 0x333333
    );
  }

  private buildTile2D(state: RenderState): number[][] {
    const grid: number[][] = [];
    for (let y = 0; y < state.mapHeight; y++) {
      const row: number[] = [];
      for (let x = 0; x < state.mapWidth; x++) {
        row.push(state.layers.ground[y * state.mapWidth + x] ?? 0);
      }
      grid.push(row);
    }
    return grid;
  }
}

function parseHexColor(s: string): number | null {
  const clean = s.startsWith("#") ? s.slice(1) : s;
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n : null;
}
