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

/** Layer names tracked by the dirty-flag system. Each name maps to a
 * group of paint sites in update() that share a data source — so
 * marking 'ground' dirty clears + repaints layers.ground (and the 2.5d
 * wall extrusion which depends on ground tile ids), but leaves overlay
 * and fringe untouched. */
export type LayerName =
  | "ground"
  | "overlay"
  | "fringe"
  | "passability"
  | "elevation"
  | "entities"
  | "objects";
import { makeProjection, type Projection, WALL_HEIGHT_PX } from "./projections/index.js";
import { drawFirstPerson, DEFAULT_WALL_TILE_IDS } from "./first-person.js";
import { EntityRenderer } from "./entities.js";
import { darkenColor, lightenColor } from "./color.js";

const WALL_DARKEN = 0.45;

/**
 * Default color map for tile IDs 0..63. Mirrors @tile_palette in
 * te_phoenix/lib/te_phoenix_web/live/admin/map_editor_live.ex so the
 * renderer falls back to the same colors the editor palette shows even
 * if the LiveView hasn't pushed a tilePalette yet (initial frame, SSR).
 */
const DEFAULT_TILE_COLORS: Record<number, number> = {
  // 0–7 base terrain
  0: 0x2e5d31, // grass
  1: 0x3a3a3a, // stone
  2: 0x3a2a0a, // dirt
  3: 0x1e3a5f, // water
  4: 0x7a5a2a, // wood
  5: 0x8a8a8a, // cobble
  6: 0x2a2a2a, // cave
  7: 0x1a1a1a, // void
  // 8–23 natural terrain
  8: 0xc9b27a, // sand
  9: 0xe8edf2, // snow
  10: 0xa4c8e0, // ice
  11: 0x4a3520, // mud
  12: 0xc1331a, // lava
  13: 0x5a544f, // ash
  14: 0x4a7a3a, // tall grass
  15: 0x8a5d8a, // heather
  16: 0x3a5a30, // moss
  17: 0x3d3823, // bog
  18: 0x2b1f10, // peat
  19: 0x3a3a25, // mire
  20: 0x3d6385, // shallows
  21: 0x14304f, // ocean
  22: 0x2d5478, // river
  23: 0x5a8aaa, // rapids
  // 24–31 stone & masonry
  24: 0xd6d2c8, // marble
  25: 0x4a525a, // slate
  26: 0x813833, // brick
  27: 0x6d6e72, // granite
  28: 0xb08a5a, // sandstone
  29: 0x5a574d, // ruined cobble
  30: 0x5d3329, // ancient brick
  31: 0x3a3530, // dolmen
  // 32–39 wood & vegetation
  32: 0x6e4a25, // planks
  33: 0x855e2e, // oak floor
  34: 0x4a311a, // bark
  35: 0x2d2010, // roots
  36: 0x4a3a3a, // bramble
  37: 0x3d6535, // fern
  38: 0x2a1f1a, // thorns
  39: 0x2d5025, // ivy
  // 40–47 cave & underworld
  40: 0xd8d0b8, // bone
  41: 0x4a1c1c, // blood earth
  42: 0x6e1c1c, // gore
  43: 0x1f1a18, // cinder
  44: 0xb8501a, // ember
  45: 0x15131a, // shadow
  46: 0x1a0d2a, // void rift
  47: 0x3a3520, // blight
  // 48–55 magic & rune
  48: 0x6a5aa0, // rune
  49: 0x5a8a90, // ward
  50: 0x80c0e8, // ley line
  51: 0x8aa8d0, // crystal
  52: 0x7a4ab0, // amethyst
  53: 0x1a6a4a, // emerald moss
  54: 0xd090b8, // faerie ring
  55: 0x5a5040, // ogham stone
  // 56–63 structural & decorative
  56: 0x3a2515, // trapdoor
  57: 0x6a5a4a, // stairs up
  58: 0x2a1f15, // stairs down
  59: 0x050505, // pit
  60: 0x8a8a90, // spike
  61: 0xc08a35, // torch ground
  62: 0x5a4530, // bridge plank
  63: 0x4a4035, // doorstep
};

/** Lazy Pixi import — lets the package be imported without pulling Pixi into SSR bundles. */
let pixiPromise: Promise<typeof import("pixi.js")> | null = null;
function loadPixi(): Promise<typeof import("pixi.js")> {
  if (!pixiPromise) pixiPromise = import("pixi.js");
  return pixiPromise;
}

export interface TwistedRendererOptions {
  /**
   * DOM element to mount the Pixi canvas into. Used for the legacy
   * "give me a div, I'll fill it" flow (React/LiveView main thread).
   * Mutually exclusive with `canvas` — pass exactly one.
   */
  container?: HTMLElement;
  /**
   * Pre-created canvas to draw on. Accepts `HTMLCanvasElement` for
   * main-thread use OR `OffscreenCanvas` for Web Worker rendering
   * (the SvelteKit player's preferred path — keeps the render loop
   * off the main thread so 60fps holds during channel/UI churn).
   * Mutually exclusive with `container`.
   */
  canvas?: HTMLCanvasElement | OffscreenCanvas;
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
  /**
   * devicePixelRatio override. Required when running in a Web Worker
   * (no `window.devicePixelRatio` access there). Defaults to
   * `window.devicePixelRatio` on the main thread, `1` in workers.
   */
  resolution?: number;
  /**
   * When false, tile animations (water shimmer, lava glow, sprite frames)
   * are disabled — animated tiles draw as static (first frame / base color)
   * and the animation ticker becomes a true no-op. Default: true.
   */
  animateTiles?: boolean;
}

/**
 * Stateful Pixi renderer. Create once per canvas, call init(), then call
 * update(state) on every frame/tick. Call destroy() on teardown.
 */
export class TwistedRenderer {
  private opts: TwistedRendererOptions;
  private app: Application | null = null;
  private layers: {
    background: Container;
    ground: Container;
    groundAnim: Container;
    walls: Container;
    overlayAnim: Container;
    objects: Container;
    entities: Container;
    player: Container;
    fringe: Container;
    fringeAnim: Container;
    fog: Container;
  } | null = null;
  private projection: Projection;
  private ready = false;
  private _lastDimsKey: string | null = null;
  private destroyed = false;
  private lastState: RenderState | null = null;
  private frameCounter = 0;

  // Per-layer dirty flags. update() and the animation ticker both
  // consult these to skip layers whose visual state hasn't changed,
  // which on a static map collapses the ticker into a near-noop.
  // Initialized to all true so the first paint actually draws.
  private dirty: Record<LayerName, boolean> = {
    ground: true,
    overlay: true,
    fringe: true,
    passability: true,
    elevation: true,
    entities: true,
    objects: true,
  };

  // Per-cell animated-tile tracking. When animation is enabled, tiles
  // that are color-cycling (animatedTiles, e.g. water/lava) or sprite-
  // driven (spriteTiles) are NOT drawn into the static layer bucket.
  // Instead they are recorded here and drawn into the layer's *Anim
  // container, which the ticker clears + redraws every ~100ms without
  // touching the static layer containers. Empty arrays ⇒ ticker no-op.
  // See recalcAnimCells() — recomputed on every state update.
  private animGroundCells: Array<{x: number, y: number, tileId: number}> = [];
  private animOverlayCells: Array<{x: number, y: number, tileId: number}> = [];
  private animFringeCells: Array<{x: number, y: number, tileId: number}> = [];

  private hasAnyAnimCells(): boolean {
    return (
      this.animGroundCells.length > 0 ||
      this.animOverlayCells.length > 0 ||
      this.animFringeCells.length > 0
    );
  }

  // Cached projection data from the last full update() pass. The
  // animation ticker reuses these to draw animated cells at their
  // current screen positions without recomputing offsets. When the
  // camera moves, diffAndMarkDirty calls markAllDirty() and the next
  // update() re-establishes fresh cached values.
  private _animStep = 0;
  private _animOffsetX = 0;
  private _animOffsetY = 0;
  // Cached Pixi import for the animation ticker (avoids re-import on each tick).
  private _cachedPixi: typeof import("pixi.js") | null = null;

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

    // Coerce dimensions to positive integers. Browsers reject any
    // non-integer assignment to `canvas.width` / `canvas.height`. Pixi
    // computes `canvas.width = width * resolution` internally, so we
    // also need an integer resolution — fractional DPRs (1.25, 1.5) on
    // retina displays multiply through to a float and crash the canvas.
    const safeWidth = Math.max(1, Math.floor(Number(width) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 0));

    const isOffscreen =
      typeof OffscreenCanvas !== "undefined" &&
      this.opts.canvas instanceof OffscreenCanvas;

    const detectedDpr =
      this.opts.resolution ??
      (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);

    // OffscreenCanvas has no CSS sizing, so DPR scaling can't be
    // visually compensated for — round to an integer to keep the
    // backing buffer assignable. On main-thread canvases keep the raw
    // DPR so retina displays stay sharp.
    const resolution = isOffscreen
      ? Math.max(1, Math.round(Number(detectedDpr) || 1))
      : (Number(detectedDpr) || 1);

    const app = new PIXI.Application();
    const initOpts: Parameters<typeof app.init>[0] = {
      width: safeWidth,
      height: safeHeight,
      backgroundAlpha: this.opts.backgroundAlpha ?? 0,
      antialias: false,
      resolution,
      autoDensity: !isOffscreen,
    };

    // If the caller pre-created a canvas, hand it to Pixi.
    if (this.opts.canvas) {
      (initOpts as Record<string, unknown>).canvas = this.opts.canvas;
    }

    await app.init(initOpts);

    if (this.destroyed) {
      app.destroy(true);
      return;
    }

    // Mount the auto-created canvas only when we have a container.
    // When a canvas was provided directly (worker mode), Pixi already
    // owns the right canvas and there's no DOM to mount into.
    if (this.opts.container) {
      this.opts.container.innerHTML = "";
      this.opts.container.appendChild(app.canvas as HTMLCanvasElement);
    }
    this.app = app;

    // D15-v2: dedicated background layer drawn behind everything.
    // Two zones: outside-map tint (zinc-950) + inside-map tint (zinc-900)
    // so the user can see the canvas extents AND where the painted world
    // ends. Filled fresh each update() since the map area moves on resize.
    const background = new PIXI.Container();
    background.label = "background";
    const ground = new PIXI.Container();
    ground.label = "ground";
    const groundAnim = new PIXI.Container();
    groundAnim.label = "groundAnim";
    const walls = new PIXI.Container();
    walls.label = "walls";
    const overlayAnim = new PIXI.Container();
    overlayAnim.label = "overlayAnim";
    const objects = new PIXI.Container();
    objects.label = "objects";
    const entities = new PIXI.Container();
    entities.label = "entities";
    const player = new PIXI.Container();
    player.label = "player";
    const fringe = new PIXI.Container();
    fringe.label = "fringe";
    const fringeAnim = new PIXI.Container();
    fringeAnim.label = "fringeAnim";
    const fog = new PIXI.Container();
    fog.label = "fog";

    app.stage.addChild(background, ground, groundAnim, walls, overlayAnim, objects, entities, player, fringe, fringeAnim, fog);
    this.layers = { background, ground, groundAnim, walls, overlayAnim, objects, entities, player, fringe, fringeAnim, fog };

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

    // Animation ticker — per-cell animated redraw. Only the *Anim
    // containers are cleared + redrawn; static layer containers are
    // never touched by the ticker. When animateTiles is off, the
    // ticker is a true no-op (all anim cell arrays are empty).
    let animFrameAccum = 0;
    app.ticker.add((tickerArg: unknown) => {
      const delta = typeof tickerArg === "number"
        ? tickerArg
        : (tickerArg as { deltaTime?: number })?.deltaTime ?? 1;
      animFrameAccum += delta;
      if (animFrameAccum < 6) return; // ~10fps at 60fps ticker
      animFrameAccum = 0;

      if (!this.lastState || !this.layers) return;
      if (!this.hasAnyAnimCells()) return;

      this.frameCounter++;

      // Animated objects (sprite-animated props/chests) still need a
      // full dirty-objects pass. But tile-layer *Anim containers only
      // need the cells redrawn — no markDirty, no state diffing.
      const hasAnimatedObjects = (this.lastState.objects || []).some(
        (o) => (o.sprite_anim_urls && o.sprite_anim_urls.length > 1) ||
               (o.anim_frames && o.anim_frames.length > 1)
      );

      const PIXI = this._cachedPixi || null;
      if (!PIXI) return;
      const layers = this.layers;

      const clearChildren = (c: Container): void => {
        for (const ch of c.removeChildren()) ch.destroy();
      };

      if (this.animGroundCells.length > 0) {
        clearChildren(layers.groundAnim);
        this.drawAnimCells(layers.groundAnim, this.animGroundCells, PIXI, false);
      }
      if (this.animOverlayCells.length > 0) {
        clearChildren(layers.overlayAnim);
        this.drawAnimCells(layers.overlayAnim, this.animOverlayCells, PIXI, true);
      }
      if (this.animFringeCells.length > 0) {
        clearChildren(layers.fringeAnim);
        this.drawAnimCells(layers.fringeAnim, this.animFringeCells, PIXI, false);
      }

      if (hasAnimatedObjects) {
        this.markLayerDirty("objects");
        void this.drawDirtyOnly();
      }
    });

    this.ready = true;

    // O-v3: drain any resize/tileSize calls that arrived during init.
    // The LV hook's fitToScreen() fires on the first map:state push and
    // races our async init(); without this drain the backing buffer
    // stays at the init-time dimensions and clicks miss the actual map.
    if (this._pendingResize) {
      const { w, h } = this._pendingResize;
      this._pendingResize = null;
      this.app.renderer.resize(w, h);
      // O-v3.2: same canvas CSS sync as resize() — see comment there.
      const canvasEl = (this.app.renderer as { canvas?: HTMLCanvasElement }).canvas;
      if (canvasEl && typeof canvasEl === "object" && "style" in canvasEl) {
        canvasEl.style.width = w + "px";
        canvasEl.style.height = h + "px";
      }
      // O-v3.5: WebGL viewport reset — same as resize() path.
      try {
        const gl =
          canvasEl &&
          ((canvasEl.getContext("webgl2") as WebGL2RenderingContext | null) ||
            (canvasEl.getContext("webgl") as WebGLRenderingContext | null));
        if (gl) gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      } catch (_e) {}
      this.markAllDirty();
    }

    if (this._pendingTileSize !== null) {
      const ts = this._pendingTileSize;
      this._pendingTileSize = null;
      if (ts !== this.opts.tileSize) {
        this.opts.tileSize = ts;
        this.projection = makeProjection(this.opts.renderMode, ts);
        if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, ts);
        this.markAllDirty();
      }
    }

    // Replay last state if update() was called before init() completed
    if (this.lastState) void this.update(this.lastState);
  }

  /** Push a new render state. Diffs against the previous state and
   * redraws only the layers whose data actually changed. The animation
   * ticker calls `drawDirtyOnly()` which routes through this same
   * function with the same lastState, relying on pre-set dirty flags
   * to drive what re-paints. */
  async update(state: RenderState): Promise<void> {
    // Diff before replacing lastState — the diff helper consults both.
    this.diffAndMarkDirty(state);
    this.lastState = state;
    if (!this.ready || this.destroyed || !this.app || !this.layers) {
      // Drop a single console marker per reason so callers can see WHY
      // their update was ignored (lost the canvas, called before init,
      // etc.). Gated behind RENDER_DEBUG so production stays quiet.
      if ((globalThis as { RENDER_DEBUG?: boolean }).RENDER_DEBUG) {
        console.warn("[render] update bailed", {
          ready: this.ready, destroyed: this.destroyed,
          hasApp: !!this.app, hasLayers: !!this.layers,
        });
      }
      return;
    }
    const PIXI = await loadPixi();
    this._cachedPixi = PIXI;
    if (this.destroyed || !this.layers) return;

    // Update palette caches if the state carries a new palette.
    // ingestPalette internally calls markAllDirty() — palette can remap
    // any tile so every cached bucket is potentially stale.
    if (state.tilePalette) this.ingestPalette(state.tilePalette);

    // Scan tile data for animated cells — populates animGroundCells /
    // animOverlayCells / animFringeCells so the ticker knows which
    // *Anim containers need redraws. When animation is disabled the
    // arrays stay empty and the ticker is a true no-op.
    this.recalcAnimCells(state);

    const layers = this.layers;
    // Per-layer conditional clear. The container holding the visual
    // children for a given data layer only gets `removeChildren()` if
    // that layer is dirty — otherwise its existing Graphics stay on
    // screen and we skip the entire repaint below.
    //
    // Container ↔ data-layer mapping (some containers host more than
    // one data layer, so we OR the relevant flags):
    //   layers.background → always cleared (cheap, follows camera)
    //   layers.ground     → state.layers.ground
    //   layers.walls      → state.layers.overlay (+ ground in 2.5d for wall extrusion)
    //   layers.fringe     → state.layers.fringe
    //   layers.objects    → state.objects
    //   layers.entities   → state.entities (+ companions/groundItems/structures/battles)
    //   layers.player     → state.playerX/Y (tied to entities for V1)
    //   layers.fog        → fog of war + passability/elevation overlays
    // Pixi v8's removeChildren() DETACHES children but does not free their
    // GPU geometry / GraphicsContext. The animation ticker repaints any
    // layer containing an animated tile (Water/Lava — present on nearly
    // every map) ~10x/sec, so leaking the detached Graphics each repaint
    // compounds into WebGL context loss → a frozen/blank/garbled canvas
    // after seconds of real use. It is INVISIBLE in a one-shot headless
    // screenshot (one frame, then exit), which is why this survived months
    // of "looks fine in the test" verification. Destroy on removal.
    const clearChildren = (c: Container): void => {
      for (const ch of c.removeChildren()) ch.destroy();
    };
    const wallsContainerDirty =
      this.dirty.overlay ||
      (this.opts.renderMode === "2.5d" && this.dirty.ground);
    clearChildren(layers.background);
    if (this.dirty.ground) clearChildren(layers.ground);
    if (wallsContainerDirty) clearChildren(layers.walls);
    if (this.dirty.fringe) clearChildren(layers.fringe);
    if (this.dirty.objects) clearChildren(layers.objects);
    if (this.dirty.entities) {
      // EntityRenderer reconciles its own visuals — do NOT clearChildren
      // here. clearChildren destroys all Pixi children, but EntityRenderer
      // holds references to those containers. Destroying them would leave
      // stale refs → reproject crashes on null container.
      clearChildren(layers.player);
    }
    if (this.dirty.passability || this.dirty.elevation) {
      clearChildren(layers.fog);
    }

    // Counters for the diagnostic emit at the end of update().
    let drawnGround = 0;
    let skippedOffscreen = 0;

    // D15-v2 / O-v2: paint the two-zone background AND draw a visible
    // border around the map area. Earlier shipping had the right zones
    // but the contrast between outside (0x0a0a0a) and inside (0x111111)
    // was invisible at typical monitor brightness — users couldn't tell
    // where the map ended. Solution: lift inside-map to 0x1a1a1a (~3×
    // the brightness gap) AND stroke a 1px amber-grey border at the
    // map edge so the boundary is obvious even on bright displays.
    {
      const offsets = this.computeOffsets(state);
      // O-v3: same Retina/HiDPI fix as computeOffsets — divide by resolution
      // so canvasW/H are CSS pixels matching where the centered map draws.
      const resolution =
        (this.app && this.app.renderer && (this.app.renderer as { resolution?: number }).resolution) || 1;
      const canvasW =
        ((this.app && this.app.renderer && this.app.renderer.width) || offsets.vpPxW) / resolution;
      const canvasH =
        ((this.app && this.app.renderer && this.app.renderer.height) || offsets.vpPxH) / resolution;
      const mapW = offsets.vpPxW;
      const mapH = offsets.vpPxH;
      const mapX = Math.max(0, (canvasW - mapW) / 2);
      const mapY = Math.max(0, (canvasH - mapH) / 2);

      const bg = new PIXI.Graphics();
      // Outside-map: near-black (visibly off-pure-black at high brightness).
      bg.rect(0, 0, canvasW, canvasH);
      bg.fill(0x080808);
      // Inside-map: amber-tinted dark so the painted area reads as a
      // distinct "world canvas" even when most tiles are dim wasteland
      // colours (ash, bog, peat). Without enough contrast vs the
      // outside-map tint, low-saturation maps look like empty canvases.
      bg.rect(mapX, mapY, mapW, mapH);
      bg.fill(0x2a2520);
      // 2px amber border at the map edge — explicit "this is the world" frame.
      bg.rect(mapX - 1, mapY - 1, mapW + 2, mapH + 2);
      bg.stroke({ color: 0xb38b3a, width: 2, alpha: 0.85 });
      layers.background.addChild(bg);
    }

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
    // Single source of truth for camera offsets, shared with screenToTile/
    // tileToScreen via currentOffsets(). Diverging copies of this math
    // between render and click conversion is the canonical Twisted
    // canvas footgun — keep them unified.
    const { tileSize } = this.opts;
    const off = this.computeOffsets(state);
    const { step, offsetX, offsetY } = off;
    // Cache for the animation ticker's drawAnimCells pass
    this._animStep = step;
    this._animOffsetX = offsetX;
    this._animOffsetY = offsetY;
    const vpPxW = off.vpPxW;
    const vpPxH = off.vpPxH;

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
      opts: { skipNegative: boolean; hideUnderPlayer: boolean; colorOverride?: (id: number) => number; isGround?: boolean; skipAnim?: boolean }
    ): void => {
      const buckets = new Map<number, Array<{ sx: number; sy: number }>>();
      const skipAnimated = opts.skipAnim === true;

      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) {
            if (opts.isGround) skippedOffscreen++;
            continue;
          }
          if (opts.isGround) drawnGround++;

          const idx = y * mapWidth + x;
          const tileId = tiles[idx] ?? 0;
          if (opts.skipNegative && tileId < 0) continue;
          if (opts.hideUnderPlayer && hideFringeNear(x, y)) continue;

          // When animation is enabled, skip animated tiles in the static
          // bucket pass — they'll be drawn into the *Anim container after.
          if (skipAnimated && (this.animatedTiles.has(tileId) || this.spriteTiles.has(tileId))) continue;

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

    // Ground: always drawn, tile 0 is default grass (never skipped).
    // Animated tiles (water/lava) are split into a separate *Anim container
    // so the ticker can redraw them without touching the static layer.
    if (this.dirty.ground) {
      const animEnabled = this.opts.animateTiles !== false;
      drawLayer(state.layers.ground, layers.ground, {
        skipNegative: false,
        hideUnderPlayer: false,
        isGround: true,
        skipAnim: animEnabled,
      });
      if (animEnabled && this.animGroundCells.length > 0) {
        clearChildren(layers.groundAnim);
        this.drawAnimCells(layers.groundAnim, this.animGroundCells, PIXI, false);
      }
      this.dirty.ground = false;
    }

    if (
      (globalThis as { RENDER_DEBUG?: boolean }).RENDER_DEBUG &&
      drawnGround > 0
    ) {
      const gfxCount = layers.ground.children.length;
      console.info("[render] drawLayer ground", {
        drawn: drawnGround,
        skippedOffscreen,
        gfxBuckets: gfxCount,
        paletteSize: this.paletteColors.size,
        spriteTiles: this.spriteTiles.size,
        animatedLayers: [this.animGroundCells.length > 0 ? "ground" : "", this.animOverlayCells.length > 0 ? "overlay" : "", this.animFringeCells.length > 0 ? "fringe" : ""].filter(Boolean),
        canvas: { w: this.app.renderer.width, h: this.app.renderer.height },
        cam: [state.camX, state.camY],
        vp: [state.viewportW, state.viewportH],
      });
    }

    // 2.5D wall extrusion — for every ground tile with elevation>0 draw
    // front/right/top/left/shadow/gradient faces on the walls layer.
    // Only redraws when ground (tile ids drive wall colour) OR overlay
    // (we cleared the shared walls container) is dirty.
    if (this.opts.renderMode === "2.5d" && wallsContainerDirty) {
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

    // Overlay: sparse, skip -1 (empty). Lives in the same Pixi container
    // as the 2.5d wall extrusion above; both flip on `wallsContainerDirty`.
    if (this.dirty.overlay) {
      const animEnabled = this.opts.animateTiles !== false;
      drawLayer(state.layers.overlay, layers.walls, {
        skipNegative: true,
        hideUnderPlayer: false,
        skipAnim: animEnabled,
      });
      if (animEnabled && this.animOverlayCells.length > 0) {
        clearChildren(layers.overlayAnim);
        this.drawAnimCells(layers.overlayAnim, this.animOverlayCells, PIXI, true);
      }
      this.dirty.overlay = false;
    }

    // Fringe: roof tiles, hide near player so they don't obscure the sprite.
    // Uses state.hiddenFringeTiles (set of tile indices) to dim tiles the
    // player is standing under without fully removing them.
    if (this.dirty.fringe) {
      const animEnabled = this.opts.animateTiles !== false;
      const hiddenFringe = state.hiddenFringeTiles;
      if (hiddenFringe && hiddenFringe.size > 0) {
        for (let i = 0; i < state.layers.fringe.length; i++) {
          const tileId = state.layers.fringe[i] ?? -1;
          if (tileId < 0) continue;
          // Skip animated tiles in the static pass — drawn into fringeAnim
          const isAnimTile = animEnabled &&
            (this.animatedTiles.has(tileId) || this.spriteTiles.has(tileId));
          if (isAnimTile) continue;
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
          skipAnim: animEnabled,
        });
      }
      if (animEnabled && this.animFringeCells.length > 0) {
        clearChildren(layers.fringeAnim);
        this.drawAnimCells(layers.fringeAnim, this.animFringeCells, PIXI, false);
      }
      this.dirty.fringe = false;
    }

    // ── Map objects (props, lights) ────────────────────────
    if (this.dirty.objects) {
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
    this.dirty.objects = false;
    }
    // ── End if (this.dirty.objects) ────────────────────────

    // The blocks below all paint into layers.entities (or layers.player
    // for the player marker). Gate them on dirty.entities — if nothing
    // moved, the previous frame's sprites stay on stage.
    if (this.dirty.entities) {

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
    }
    // ── End if (this.dirty.entities) — first segment ───────

    // Passability overlay (editor debug view only)
    if (this.dirty.passability && passabilityVisible) {
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

    this.dirty.passability = false;

    // Elevation overlay (editor debug view) — draws a number label per tile
    if (this.dirty.elevation && elevationVisible) {
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
    this.dirty.elevation = false;

    // ── Player marker ─────────────────────────────────────
    // If a sprite URL is provided, load and display it (async, cached).
    // Otherwise draw a ring+dot in the player's team color.
    if (this.dirty.entities) {
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
    // textures aren't reloaded per frame. Gated on dirty.entities AND we
    // clear the flag here as the final entity-related step in update().
    if (this.dirty.entities) {
      // EntityRenderer owns the entities container — don't blind-destroy
      // its children via clearChildren(), which would leave stale
      // references in EntityRenderer.visuals. Instead, let it reconcile
      // its own visuals against the new entity list.
      if (this.entityRenderer && state.entities) {
        this.entityRenderer.update(state.entities, 16);
      } else if (this.entityRenderer) {
        // No entities in state — clear all visuals.
        this.entityRenderer.update([], 16);
      }
      this.dirty.entities = false;
    }

    // Advance the animation frame counter on every update so sprite
    // cycles (water, torches, animated tiles) progress whenever the
    // ticker triggers a repaint. Static frames don't depend on this.
    this.frameCounter++;
  }

  /** Switch to a different render mode at runtime. Rebuilds the projection strategy. */
  setRenderMode(mode: RenderMode): void {
    this.opts.renderMode = mode;
    this.projection = makeProjection(mode, this.opts.tileSize);
    if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, this.opts.tileSize);
    // Projection swap changes how every tile lands on screen — bust everything.
    this.markAllDirty();
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

  /**
   * Single source of truth for camera transform. Both the render loop
   * (update()) and the screen↔tile helpers (screenToTile / tileToScreen)
   * MUST go through this method — diverging math here causes clicks to
   * land on different tiles than the renderer drew.
   *
   * Convention: state.camX / camY is the world tile that should appear
   * at the center of the viewport. The offsets translate world→screen so
   * that camera tile lands centered in the projection's viewport pixel
   * box. Isometric is special-cased because its tile shape isn't axis-
   * aligned (diamond), so vertical centering uses tileSize*2 instead of
   * vpPxH/2.
   */
  private computeOffsets(state: RenderState): {
    step: number;
    vpPxW: number;
    vpPxH: number;
    offsetX: number;
    offsetY: number;
  } {
    const { tileSize, renderMode } = this.opts;
    const step = tileSize + 1;
    const vp = this.projection.viewportSize(state.viewportW, state.viewportH, step);
    const vpPxW = vp.w;
    const vpPxH = vp.h;

    // D15-v2 / O-v3: canvas fills host container, map renders centered.
    // mapOffsetX/Y is the gutter from canvas edge to map's top-left.
    //
    // CRITICAL: on HiDPI/Retina displays, `app.renderer.width` returns
    // the BUFFER size (CSS pixels × resolution). Click events arrive in
    // CSS pixels, so we have to use CSS-pixel canvas dimensions here —
    // otherwise the offset is 2× too large and clicks miss the map
    // everywhere except the bottom-right corner where buffer-offset and
    // CSS-coord happen to overlap. Divide buffer width by resolution.
    const resolution =
      (this.app && this.app.renderer && (this.app.renderer as { resolution?: number }).resolution) || 1;
    const canvasW =
      ((this.app && this.app.renderer && this.app.renderer.width) || vpPxW) / resolution;
    const canvasH =
      ((this.app && this.app.renderer && this.app.renderer.height) || vpPxH) / resolution;
    const mapOffsetX = Math.max(0, (canvasW - vpPxW) / 2);
    const mapOffsetY = Math.max(0, (canvasH - vpPxH) / 2);

    // O-v3 diagnostic state retained for future re-enablement; logs
    // currently silenced — the inViewport convention bug is fixed and
    // the offset math has been verified against three independent
    // logging captures.
    const _dimsKey = `${canvasW}x${canvasH}/${tileSize}`;
    if (this._lastDimsKey !== _dimsKey) this._lastDimsKey = _dimsKey;

    if (renderMode === "isometric") {
      return {
        step,
        vpPxW,
        vpPxH,
        offsetX: -state.camX * step + vpPxW / 2 + mapOffsetX,
        offsetY: -state.camY * step + tileSize * 2 + mapOffsetY,
      };
    }

    return {
      step,
      vpPxW,
      vpPxH,
      offsetX: -state.camX * step + vpPxW / 2 - step / 2 + mapOffsetX,
      offsetY: -state.camY * step + vpPxH / 2 - step / 2 + mapOffsetY,
    };
  }

  /** Backward-compatible wrapper — currentOffsets() lives on for any
   * external caller that imported it. Always delegates to computeOffsets. */
  private currentOffsets(): { step: number; offsetX: number; offsetY: number } {
    const o = this.computeOffsets(this.lastState!);
    return { step: o.step, offsetX: o.offsetX, offsetY: o.offsetY };
  }

  /**
   * Resize the Pixi backing canvas. Call when the host container changes
   * size (window resize, panel toggle, fit-to-screen). Re-renders the
   * last state with the new dimensions so the camera math stays correct.
   */
  /**
   * O-v3: queue resize requests that arrive before Pixi's `init()`
   * Promise resolves. Without this, the LiveView hook's `fitToScreen()`
   * fires immediately on the first map:state push but `init()` is still
   * mid-flight — the resize call hits `!this.ready`, returns silently,
   * and the Pixi backing buffer stays at the init-time dimensions
   * (viewport × step) instead of growing to fill the container. Same
   * bug class Butterfingers fixed for the player client (Ticket N).
   */
  private _pendingResize: { w: number; h: number } | null = null;

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    const w = Math.max(1, Math.floor(Number(width) || 0));
    const h = Math.max(1, Math.floor(Number(height) || 0));

    if (!this.app || !this.ready) {
      // Queue for application once init() finishes.
      this._pendingResize = { w, h };
      return;
    }

    this.app.renderer.resize(w, h);

    // Buffer resized → every layer's screen position is potentially
    // stale (offsets centre around vpPxW/vpPxH). Mark all dirty so
    // the follow-up update() actually repaints them.
    this.markAllDirty();

    // O-v3.2: Pixi's `renderer.resize()` updates the BUFFER size but in
    // some autoDensity configs leaves the <canvas>'s CSS dims at their
    // init-time values. Force-sync the DOM element so click-coord rects
    // match what the user sees (otherwise getBoundingClientRect on the
    // canvas returns 504×504 even after a 1086×1102 buffer resize, and
    // pointer→tile math lands every click in the same 504-px corner).
    const canvasEl = (this.app.renderer as { canvas?: HTMLCanvasElement }).canvas;
    if (canvasEl && typeof canvasEl === "object" && "style" in canvasEl) {
      canvasEl.style.width = w + "px";
      canvasEl.style.height = h + "px";
    }

    // O-v3.5: explicitly reset the WebGL viewport. Pixi v8's resize()
    // sometimes leaves gl.viewport stuck at the init-time framebuffer
    // dims, which clips ALL rendering to the original 504×504 corner
    // regardless of canvas size — visible as "map shoved into a corner
    // of a much larger canvas" with empty space everywhere else.
    try {
      const gl =
        canvasEl &&
        ((canvasEl.getContext("webgl2") as WebGL2RenderingContext | null) ||
          (canvasEl.getContext("webgl") as WebGLRenderingContext | null));
      if (gl) gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    } catch (_e) {
      // Pixi may have lost/replaced the context — ticker will re-establish.
    }

    this._pendingResize = null;
    this.markAllDirty();

    // O-v3.3: Pixi v8's auto-render-on-ticker doesn't always flush after
    // a manual renderer.resize() — the framebuffer keeps showing the
    // pre-resize content even though new graphics are added to the stage.
    // Force a synchronous render of the stage to push the new dimensions
    // to the actual framebuffer pixels.
    if (this.lastState) {
      void this.update(this.lastState).then(() => {
        if (this.app && !this.destroyed) {
          try {
            this.app.renderer.render({ container: this.app.stage });
          } catch (_e) {
            // Some Pixi v8 builds use renderer.render(stage) directly.
            try {
              (this.app.renderer as { render: (s: unknown) => void }).render(this.app.stage);
            } catch (_e2) {
              // Last resort: nudge the ticker.
              if (this.app.ticker && typeof this.app.ticker.update === "function") {
                this.app.ticker.update();
              }
            }
          }
        }
      });
    }
  }

  /**
   * Update the per-tile pixel size and re-render. Pixi's projection
   * captures tileSize at creation, so we recreate it. EntityRenderer
   * reads tileSize through its constructor opts, which we update too.
   * Use case: Fit-to-Screen — scale rendered tiles so the whole map
   * fills the available canvas, instead of resizing the canvas around
   * a fixed-size map.
   */
  private _pendingTileSize: number | null = null;

  setTileSize(newTileSize: number): void {
    if (this.destroyed) return;
    const ts = Math.max(1, Math.floor(Number(newTileSize) || 0));

    // O-v3: queue if init hasn't finished. Drained at the end of init().
    if (!this.ready) {
      this._pendingTileSize = ts;
      return;
    }

    if (ts === this.opts.tileSize) return;
    this.opts.tileSize = ts;
    this.projection = makeProjection(this.opts.renderMode, ts);
    if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, ts);
    // Tile size affects every screen-space coordinate — bust everything.
    this.markAllDirty();
    if (this.lastState) void this.update(this.lastState);
  }

  /** Read-only view of the current tile size. */
  getTileSize(): number {
    return this.opts.tileSize;
  }

  // ── Dirty-flag system (Phase 2 of the redraw-loop ticket) ─────
  // Public surface: callers in the player/admin can request specific
  // layers redraw on next frame instead of triggering a full update().
  // The internal animation ticker uses markAnimatedDirty() to repaint
  // only layers that actually contain animated tile ids.

  /** Flag a single layer for redraw on the next render pass. */
  markLayerDirty(layer: LayerName): void {
    this.dirty[layer] = true;
  }

  /** Flag every layer dirty — used by viewport/camera/palette mutations
   * that affect screen-space positions or colour mappings. */
  markAllDirty(): void {
    for (const k of Object.keys(this.dirty) as LayerName[]) {
      this.dirty[k] = true;
    }
  }

  /** Legacy — no longer used by the per-cell ticker. Kept for API compat. */
  markAnimatedDirty(): void {
    if (this.animGroundCells.length > 0) this.dirty.ground = true;
    if (this.animOverlayCells.length > 0) this.dirty.overlay = true;
    if (this.animFringeCells.length > 0) this.dirty.fringe = true;
  }

  /** True if any layer needs redrawing. The ticker uses this to short-
   * circuit before scheduling a paint pass. */
  private hasDirtyLayer(): boolean {
    for (const k of Object.keys(this.dirty) as LayerName[]) {
      if (this.dirty[k]) return true;
    }
    return false;
  }

  /** Repaint only the layers currently marked dirty, using the cached
   * lastState. The animation ticker uses this — no state mutation, just
   * a re-paint pass. update(lastState) routes through the same body
   * but with the diff against lastState being a no-op (same reference),
   * so any flags pre-set by markAnimatedDirty/markLayerDirty stay set. */
  drawDirtyOnly(): Promise<void> {
    if (!this.lastState) return Promise.resolve();
    if (!this.hasDirtyLayer()) return Promise.resolve();
    return this.update(this.lastState);
  }

  /** Walk each tile-data layer once and record per-CELL which tiles are
   * animated. Results stored in animGroundCells / animOverlayCells /
   * animFringeCells. The animation ticker uses these arrays to only
   * redraw the *Anim containers (a handful of cells) instead of the
   * entire layer (hundreds of cells). */
  private recalcAnimCells(state: RenderState): void {
    this.animGroundCells = [];
    this.animOverlayCells = [];
    this.animFringeCells = [];

    const enabled = this.opts.animateTiles !== false;
    if (!enabled) return;
    if (this.animatedTiles.size === 0 && this.spriteTiles.size === 0) return;

    const isAnim = (id: number) =>
      this.animatedTiles.has(id) || this.spriteTiles.has(id);

    const scan = (
      tiles: number[] | undefined,
      layer: "ground" | "overlay" | "fringe",
    ): void => {
      if (!tiles) return;
      const mw = state.mapWidth;
      for (let i = 0; i < tiles.length; i++) {
        const id = tiles[i] ?? 0;
        if (id < 0) continue;
        if (isAnim(id)) {
          const cell = { x: i % mw, y: Math.floor(i / mw), tileId: id };
          if (layer === "ground") this.animGroundCells.push(cell);
          else if (layer === "overlay") this.animOverlayCells.push(cell);
          else this.animFringeCells.push(cell);
        }
      }
    };

    scan(state.layers.ground, "ground");
    scan(state.layers.overlay, "overlay");
    scan(state.layers.fringe, "fringe");
  }

  /** Diff incoming state against `lastState` and set per-layer dirty
   * flags by reference identity. Caller is responsible for replacing
   * the layer arrays (not mutating in place) when content changes —
   * which is how the player/admin already build state via fresh
   * arrays in buildRenderState / render_state. */
  private diffAndMarkDirty(state: RenderState): void {
    const last = this.lastState;
    if (!last) {
      this.markAllDirty();
      return;
    }
    if (state.layers.ground !== last.layers.ground) this.dirty.ground = true;
    if (state.layers.overlay !== last.layers.overlay) this.dirty.overlay = true;
    if (state.layers.fringe !== last.layers.fringe) this.dirty.fringe = true;
    if (state.layers.passability !== last.layers.passability) this.dirty.passability = true;
    if (state.layers.elevation !== last.layers.elevation) this.dirty.elevation = true;
    if (state.entities !== last.entities) this.dirty.entities = true;
    if (state.objects !== last.objects) this.dirty.objects = true;
    // Player movement, camera shift, viewport size — every screen-space
    // tile position changes, so every layer needs to repaint.
    if (
      state.camX !== last.camX ||
      state.camY !== last.camY ||
      state.viewportW !== last.viewportW ||
      state.viewportH !== last.viewportH ||
      state.playerX !== last.playerX ||
      state.playerY !== last.playerY
    ) {
      this.markAllDirty();
    }
    // Editor toggles — passability/elevation overlays appear/disappear.
    if (state.showPassability !== last.showPassability) this.dirty.passability = true;
    if (state.showElevation !== last.showElevation) this.dirty.elevation = true;
    // Hidden-fringe tile set changes (player walks under a roof) → fringe.
    if (state.hiddenFringeTiles !== last.hiddenFringeTiles) this.dirty.fringe = true;
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

  /** Draw animated tile cells into a target container.
   * Uses the cached step/offsetX/offsetY from the last full paint
   * (valid because the ticker only fires when the camera hasn't moved —
   * otherwise a dirty flag triggers a full update()). */
  private drawAnimCells(
    target: Container,
    cells: Array<{x: number; y: number; tileId: number}>,
    PIXI: typeof import("pixi.js"),
    isOverlay: boolean,
  ): void {
    const ts = this.opts.tileSize;
    const step = this._animStep || (ts + 1);
    const ox = this._animOffsetX;
    const oy = this._animOffsetY;

    for (const c of cells) {
      const { sx, sy } = this.projection.toScreen(c.x, c.y, 0, step, ox, oy);

      // Sprite-animated tile
      const sprite = this.spriteTiles.get(c.tileId);
      if (sprite) {
        const frameIdx = Math.floor(this.frameCounter / (60 / sprite.fps)) % sprite.urls.length;
        const frame = sprite.urls[frameIdx];
        const tex = frame ? this.getObjectTexture(frame) : null;
        if (tex) {
          const s = new PIXI.Sprite(tex as import("pixi.js").Texture);
          s.width = ts;
          s.height = ts;
          s.position.set(sx, sy);
          target.addChild(s);
          continue;
        }
        // Texture still loading — draw color fallback
      }

      // Color-cycle animated tile
      const gfx = new PIXI.Graphics();
      this.projection.drawTile(gfx, sx, sy, ts);
      gfx.fill(isOverlay ? { color: this.tileColor(c.tileId), alpha: 0.5 } : this.tileColor(c.tileId));
      target.addChild(gfx);
    }
  }

  private ingestPalette(palette: TilePaletteEntry[]): void {
    // Palette change can remap any tile id's colour or sprite — every
    // layer's bucketed Graphics is potentially stale.
    this.markAllDirty();
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
          return DEFAULT_TILE_COLORS[fid] ?? 0x1f2937;
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
      this.paletteColors.get(id) ?? DEFAULT_TILE_COLORS[id] ?? 0x1f2937
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
