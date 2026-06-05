import * as pixi_js from 'pixi.js';
import { Container, Application } from 'pixi.js';
import '../index-It4QYTdQ.js';

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

/**
 * Minimal drawing primitive interface. Matches the subset of Pixi v8 Graphics
 * API that the projection drawTile() methods need. Any renderer that can
 * implement these five methods can accept a Projection.
 *
 * For Pixi: a Graphics instance satisfies this natively.
 * For tests: a fake that records calls works.
 */
interface TileDrawContext {
    rect(x: number, y: number, w: number, h: number): TileDrawContext | void;
    poly(points: number[]): TileDrawContext | void;
    moveTo(x: number, y: number): TileDrawContext | void;
    lineTo(x: number, y: number): TileDrawContext | void;
    closePath(): TileDrawContext | void;
}
/**
 * Every projection strategy implements this interface.
 */
interface Projection {
    readonly mode: RenderMode;
    /**
     * Project map-space tile coordinate to screen-space pixel coordinate,
     * accounting for elevation (for 2.5D and iso wall extrusion) and camera offsets.
     */
    toScreen(tileX: number, tileY: number, elevation: number, step: number, offsetX: number, offsetY: number): {
        sx: number;
        sy: number;
    };
    /**
     * Inverse of toScreen — project a screen-space pixel back to a tile
     * coordinate. Used by the editor to translate pointer events into tile
     * clicks under any projection.
     *
     * Elevation is not inverted (click-through at elevation 0); callers that
     * need an elevated pick should iterate candidate elevations externally.
     */
    toMap(sx: number, sy: number, step: number, offsetX: number, offsetY: number): {
        tileX: number;
        tileY: number;
    };
    /**
     * Draw the tile shape at screen coordinates (sx, sy) into the given context.
     * For classic/2.5D/side-scroll/fp: a rect. For iso: a diamond. For hex: a hexagon.
     */
    drawTile(gfx: TileDrawContext, sx: number, sy: number, tileSize: number): void;
    /**
     * Compute the pixel dimensions a tile viewport (vpW × vpH tiles) will occupy
     * in screen space. Used to size the root Container / set scissors.
     */
    viewportSize(vpW: number, vpH: number, step: number): {
        w: number;
        h: number;
    };
    /**
     * Viewport culling — is tile (tx, ty) inside the visible camera rect?
     */
    inViewport(tileX: number, tileY: number, camX: number, camY: number, vpW: number, vpH: number): boolean;
}
/**
 * Height in pixels added per elevation level. Matches the legacy renderer.
 * Used by 2.5D and isometric projections for wall/cliff extrusion.
 */
declare const WALL_HEIGHT_PX = 24;
/**
 * Factory: build the projection strategy for a given render mode.
 * `tileSize` is the logical tile side in pixels at the current zoom.
 */
declare function makeProjection(mode: RenderMode, tileSize: number): Projection;

/**
 * Color utilities for tile rendering.
 *
 * Ported from /root/twisted/ui/components/game/map-renderers/pixi-renderer.tsx
 * (darkenColor / lightenColor at lines 32-44).
 *
 * Colors are represented as packed 24-bit integers (0xRRGGBB) — the
 * format Pixi's Graphics API consumes directly.
 */
/** Multiply each RGB channel by `factor` (0..1). Used for wall shadows, ambient darkness. */
declare function darkenColor(hex: number, factor: number): number;
/** Multiply each RGB channel by `factor`, clamped to 255. Used for light halos, crits, heals. */
declare function lightenColor(hex: number, factor: number): number;
/** Linear interpolation between two RGB colors. `t` = 0..1. */
declare function mixColor(a: number, b: number, t: number): number;
/** Convert `#RRGGBB` / `rgb(r,g,b)` / packed number to packed 24-bit. */
declare function parseColor(input: string | number): number;

/** Default wall-tile IDs. Override per-map by setting TwistedRenderer.wallTileIds. */
declare const DEFAULT_WALL_TILE_IDS: ReadonlySet<number>;
/** Default tile color lookup — overridden by DB tile palette at runtime. */
type TileColorLookup = (tileId: number) => number;
interface FirstPersonDrawArgs {
    /** Pixi namespace (dynamically imported to keep @twisted/render tree-shakeable). */
    pixi: typeof pixi_js;
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
declare function drawFirstPerson(args: FirstPersonDrawArgs): void;

/**
 * Shared type definitions for @twisted/render consumers.
 * Ported from /root/twisted/ui/components/game/map-renderers/types.ts
 * and upgraded to support the new CanvasMode + edit-mode use cases.
 */

/** One entry in the DB-driven tile palette. */
interface TilePaletteEntry {
    id: number;
    name: string;
    color: string;
    category?: string | null;
    /** Animation frame IDs — each references another palette entry. */
    frame_tiles?: number[] | null;
    /** Animation frame URLs for sprite-based tile animation. Takes priority
     * over `frame_tiles` when present: the renderer draws a per-cell Sprite
     * instead of adding the cell to the color bucket. */
    frame_urls?: string[] | null;
    /** Static sprite URL — if set without frame_urls, the tile draws as a
     * single Sprite (not animated). */
    sprite_url?: string | null;
    fps?: number | null;
    passable?: boolean | null;
}
/** A sprite/object placed on the map (chest, torch, prop, light, NPC marker). */
interface MapObject {
    x: number;
    y: number;
    preset: string;
    icon?: string;
    label?: string;
    type: "LIGHT" | "PROP" | "DECO";
    blocking?: boolean;
    light?: {
        radius: number;
        color: string;
        flicker?: boolean;
    };
    flagKey?: string;
    sprite_url?: string;
    sprite_w?: number;
    sprite_h?: number;
    anim_frames?: number[];
    /** URLs for a sprite-frame animation (one per frame). Takes priority
     * over `anim_frames` (tile IDs) when the renderer is in sprite mode. */
    sprite_anim_urls?: string[];
    anim_fps?: number;
    battle_hp?: number;
    battle_destroy_type?: "fire_aoe" | "crush" | "remove_cover";
    battle_destroy_damage?: number;
    battle_destroy_radius?: number;
    battle_cover_value?: number;
}
/** A live entity on the map — player, NPC, enemy, projectile. */
interface MapEntity {
    id: string | number;
    kind: "player" | "npc" | "enemy" | "projectile" | "companion";
    x: number;
    y: number;
    facing?: number;
    name?: string;
    spriteUrl?: string;
    /** For layered characters: map of layer name → sprite URL. */
    layers?: Partial<Record<"body" | "head" | "hair" | "armor" | "weapon" | "acc", string>>;
    /** Normalized health 0..1 for the nameplate bar. */
    hp?: number;
    animation?: "idle" | "walk" | "attack" | "hurt" | "ko";
}
/** A loose visual element without its own EntityRenderer slot. */
interface MapPlayerMarker {
    id: string | number;
    x: number;
    y: number;
    name?: string;
    isOffline?: boolean;
}
/** A loot/ground item drop drawn on the entities layer. */
interface GroundItem {
    id: number;
    x: number;
    y: number;
    icon?: string;
}
/** A player-built deployed structure drawn on the entities layer. */
interface DeployedStructure {
    id: number;
    x: number;
    y: number;
    icon?: string;
}
/** An in-progress battle marker drawn on the entities layer. */
interface MapBattleMarker {
    battleId: number;
    x: number;
    y: number;
}
/** Per-frame render state pushed into TwistedRenderer.update(). */
interface RenderState {
    /** 5-tuple tile layers [ground, overlay, passability, fringe, elevation]. */
    layers: {
        ground: number[];
        overlay: number[];
        passability: number[];
        fringe: number[];
        elevation: number[];
    };
    mapWidth: number;
    mapHeight: number;
    objects: MapObject[];
    entities: MapEntity[];
    /** Other players nearby the camera — rendered as small dots on the entity layer. */
    nearbyPlayers?: MapPlayerMarker[];
    /** Party companions — icons on the entity layer. */
    companions?: Array<MapPlayerMarker & {
        icon?: string;
    }>;
    /** Loot drops on the ground. */
    groundItems?: GroundItem[];
    /** Player-built structures on the map. */
    deployedStructures?: DeployedStructure[];
    /** Live battle markers. */
    mapBattles?: MapBattleMarker[];
    /** Fringe-tile indices hidden because the player is standing under them. */
    hiddenFringeTiles?: ReadonlySet<number>;
    playerX: number;
    playerY: number;
    /** Optional player sprite URL — rendered on the player layer. */
    playerSpriteUrl?: string;
    /** Optional player display name. */
    playerName?: string;
    /** 0=N, 1=E, 2=S, 3=W for first-person mode. */
    playerFacing?: number;
    camX: number;
    camY: number;
    viewportW: number;
    viewportH: number;
    fogEnabled?: boolean;
    fogRadius?: number;
    exploredTiles?: ReadonlySet<string>;
    ambientDark?: number;
    nightDarkness?: number;
    /** Editor debug overlays — true shows passability as a colored tile overlay. */
    showPassability?: boolean;
    /** Editor debug overlays — true shows elevation as a numeric label per tile. */
    showElevation?: boolean;
    /** DB-driven tile palette — optional, falls back to hardcoded defaults. */
    tilePalette?: TilePaletteEntry[];
}
/** Callback set passed into TwistedRenderer.init(). */
interface RendererCallbacks {
    onExplore?: (tileKeys: string[]) => void;
    onTileClick?: (x: number, y: number) => void;
    onEntityClick?: (entity: MapEntity) => void;
    onObjectClick?: (object: MapObject) => void;
    onPickupItem?: (groundItemId: number) => void;
    onEnterStructure?: (structureId: number) => void;
    onBattleClick?: (battleId: number) => void;
}

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

/** Layer names tracked by the dirty-flag system. Each name maps to a
 * group of paint sites in update() that share a data source — so
 * marking 'ground' dirty clears + repaints layers.ground (and the 2.5d
 * wall extrusion which depends on ground tile ids), but leaves overlay
 * and fringe untouched. */
type LayerName = "ground" | "overlay" | "fringe" | "passability" | "elevation" | "entities" | "objects";
interface TwistedRendererOptions {
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
}
/**
 * Stateful Pixi renderer. Create once per canvas, call init(), then call
 * update(state) on every frame/tick. Call destroy() on teardown.
 */
declare class TwistedRenderer {
    private opts;
    private app;
    private layers;
    private projection;
    private ready;
    private _lastDimsKey;
    private destroyed;
    private lastState;
    private frameCounter;
    private dirty;
    private animatedLayers;
    private animatedTiles;
    /** Tile IDs that have a sprite-based animation or static sprite. Keyed
     * by tile id, value is the resolved frame URL list (one entry for
     * static sprites). Lookup is consulted in drawLayer to divert cells
     * to the sprite path instead of the color bucket. */
    private spriteTiles;
    private paletteColors;
    private entityRenderer;
    /** Cache of pre-loaded player/entity sprite textures, keyed by URL. */
    private playerTextureCache;
    /** Cache of loaded MapObject textures keyed by URL. Values resolve to
     * Pixi Texture instances that can be shared across many Sprite uses. */
    private objectTextureCache;
    /** Set of object URLs currently being loaded so we don't double-load. */
    private objectLoadPromises;
    constructor(opts: TwistedRendererOptions);
    /** Mount the Pixi Application into the container. Async — awaits Pixi load + init. */
    init(width: number, height: number): Promise<void>;
    /** Push a new render state. Diffs against the previous state and
     * redraws only the layers whose data actually changed. The animation
     * ticker calls `drawDirtyOnly()` which routes through this same
     * function with the same lastState, relying on pre-set dirty flags
     * to drive what re-paints. */
    update(state: RenderState): Promise<void>;
    /** Switch to a different render mode at runtime. Rebuilds the projection strategy. */
    setRenderMode(mode: RenderMode): void;
    /** Switch canvas mode (edit/play/battle). Future: adjusts camera + input routing. */
    setCanvasMode(mode: CanvasMode): void;
    /**
     * Translate a screen-space pixel (relative to the renderer's canvas
     * element) into a tile coordinate using the current projection and the
     * last-rendered camera state. Returns null when no state is available yet
     * or when the click falls outside the visible map bounds.
     */
    screenToTile(localX: number, localY: number): {
        tileX: number;
        tileY: number;
    } | null;
    /** Project a tile coordinate back to screen pixels under the current camera. */
    tileToScreen(tileX: number, tileY: number, elevation?: number): {
        sx: number;
        sy: number;
    } | null;
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
    private computeOffsets;
    /** Backward-compatible wrapper — currentOffsets() lives on for any
     * external caller that imported it. Always delegates to computeOffsets. */
    private currentOffsets;
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
    private _pendingResize;
    resize(width: number, height: number): void;
    /**
     * Update the per-tile pixel size and re-render. Pixi's projection
     * captures tileSize at creation, so we recreate it. EntityRenderer
     * reads tileSize through its constructor opts, which we update too.
     * Use case: Fit-to-Screen — scale rendered tiles so the whole map
     * fills the available canvas, instead of resizing the canvas around
     * a fixed-size map.
     */
    private _pendingTileSize;
    setTileSize(newTileSize: number): void;
    /** Read-only view of the current tile size. */
    getTileSize(): number;
    /** Flag a single layer for redraw on the next render pass. */
    markLayerDirty(layer: LayerName): void;
    /** Flag every layer dirty — used by viewport/camera/palette mutations
     * that affect screen-space positions or colour mappings. */
    markAllDirty(): void;
    /** Flag only the layers that contain currently-animated tile ids
     * (computed in recomputeAnimatedLayers()). On a static map this set
     * is empty, so the ticker becomes a no-op. */
    markAnimatedDirty(): void;
    /** True if any layer needs redrawing. The ticker uses this to short-
     * circuit before scheduling a paint pass. */
    private hasDirtyLayer;
    /** Repaint only the layers currently marked dirty, using the cached
     * lastState. The animation ticker uses this — no state mutation, just
     * a re-paint pass. update(lastState) routes through the same body
     * but with the diff against lastState being a no-op (same reference),
     * so any flags pre-set by markAnimatedDirty/markLayerDirty stay set. */
    drawDirtyOnly(): Promise<void>;
    /** Walk each tile-data layer once and record which ones reference
     * an animated tile id. Cheap: one pass per layer per state update.
     * Without this, the ticker would refire `update()` every 100ms even
     * on maps where no tile actually animates. */
    private recomputeAnimatedLayers;
    /** Diff incoming state against `lastState` and set per-layer dirty
     * flags by reference identity. Caller is responsible for replacing
     * the layer arrays (not mutating in place) when content changes —
     * which is how the player/admin already build state via fresh
     * arrays in buildRenderState / render_state. */
    private diffAndMarkDirty;
    /** Tear down the Pixi app and release GPU resources. */
    destroy(): void;
    private ingestPalette;
    /**
     * Synchronously return a loaded texture for an object sprite URL, or
     * `null` if it hasn't finished loading yet. The texture cache stores
     * **resolved** Texture values directly (via `.then(tex => cache.set)`)
     * so the hot render path never awaits — it does a single Map lookup.
     */
    private getObjectTexture;
    /**
     * Kick off a load for an object sprite URL. Idempotent — the second
     * call during a load-in-progress is a no-op. On completion we trigger
     * a re-render by calling `update` with the last state so the new
     * texture is picked up on the next frame.
     */
    private loadObjectTexture;
    private tileColor;
    private buildTile2D;
}

/** Canonical layer order — matches legacy game_engine.js CHAR_LAYER_ORDER. */
declare const CHAR_LAYER_ORDER: readonly ["body", "head", "hair", "armor", "weapon", "acc"];
type CharLayerName = (typeof CHAR_LAYER_ORDER)[number];
interface EntityRendererOptions {
    /** The Pixi container entities are drawn into — typically `layers.entities`. */
    container: Container;
    /** Projection strategy used to convert tile (x,y) → screen (sx,sy). */
    projection: Projection;
    /** Pixel size of a tile side at the current zoom. */
    tileSize: number;
    /** Camera offset computed by the outer renderer (passed every update). */
    getOffset: () => {
        x: number;
        y: number;
    };
    /** Pixi namespace (injected for framework-agnosticism). */
    pixi: typeof pixi_js;
}
/**
 * EntityRenderer — stateful reconciler for on-screen entities.
 *
 * Call `update(entities)` every frame. The renderer adds new entities,
 * updates existing ones, removes ones that have left the map, and
 * advances interpolation + animation.
 */
declare class EntityRenderer {
    private opts;
    private visuals;
    /** Lerp speed — 1.0 = snap instantly, 0.2 = smooth over ~5 frames. */
    private lerpSpeed;
    constructor(opts: EntityRendererOptions);
    /** Update the internal projection after a render-mode switch. */
    setProjection(projection: Projection, tileSize: number): void;
    /** Reconcile the on-screen state to match the input entity list. */
    update(entities: readonly MapEntity[], dtMs: number): void;
    /** Clean up all sprites + containers. */
    destroy(): void;
    private spawn;
    private updateEntity;
    /** Advance interpolation + animation for one visual. */
    private tick;
    /** Project current drawX/drawY to screen coordinates and move the container. */
    private reproject;
}

/**
 * Camera system with editor / player / battle modes.
 *
 * Tracks a logical "world position" (where the camera is looking, in
 * tile-space coordinates) and a zoom level, and produces the screen-space
 * offset the main renderer uses to draw the current frame.
 *
 * Mode behavior:
 *
 *   - **edit**: free pan + zoom. Player can drag, scroll, and jump to
 *     any point. Camera never follows anything automatically.
 *   - **play**: follows the active character with a smooth-lerp spring.
 *     Optional screen shake on hits.
 *   - **battle**: frames all participants in the current encounter.
 *     Cuts to the active actor on turn changes. Slow-mo / zoom-in on
 *     crits and finishing blows.
 *
 * All modes share the same underlying state — switching modes is a
 * single method call. Transitions are smooth via interpolation.
 */

interface CameraState {
    /** World-space tile X coordinate the camera is centered on. */
    x: number;
    /** World-space tile Y coordinate the camera is centered on. */
    y: number;
    /** Zoom factor — 1.0 = default, 2.0 = 2x in. */
    zoom: number;
    /** Current screen-shake displacement in pixels. */
    shakeX: number;
    shakeY: number;
}
interface ShakeConfig {
    /** Max pixel offset. */
    intensity: number;
    /** Duration in ms. */
    duration: number;
}
interface FollowTarget {
    /** Tile-space coordinates to follow. */
    x: number;
    y: number;
}
interface BattleFraming {
    /** World-space positions of all participants to frame. */
    participants: Array<{
        x: number;
        y: number;
    }>;
    /** Optional single actor to zoom into (for turn-based cuts). */
    activeActor?: {
        x: number;
        y: number;
    };
}
declare class Camera {
    private state;
    private target;
    private mode;
    private follow;
    private lastBattleFraming;
    private shake;
    /** Smoothing factor 0..1 per frame. Higher = snappier. */
    private smoothness;
    setMode(mode: CanvasMode): void;
    /** Set a target for the camera to track (play mode). */
    setFollow(target: FollowTarget | null): void;
    /** Jump instantly to a world position (editor mode, fast-travel). */
    jumpTo(x: number, y: number): void;
    /** Pan by a relative amount (editor drag). */
    pan(dx: number, dy: number): void;
    /** Set zoom. Clamped to [0.5, 4.0]. */
    setZoom(z: number): void;
    /** Trigger screen shake (battle hits, explosions, earthquake). */
    triggerShake(intensity: number, durationMs: number): void;
    /** Frame a set of battle participants, optionally focusing on one. */
    frameBattle(framing: BattleFraming): void;
    /** Advance camera state by dt milliseconds — call once per frame. */
    tick(dtMs: number): void;
    /** Get current camera world position (after smoothing + shake). */
    get position(): {
        x: number;
        y: number;
        zoom: number;
    };
    /** Get current shake offset in pixels. */
    get shakeOffset(): {
        x: number;
        y: number;
    };
    /** Compute screen-space offset for the tile renderer. */
    getScreenOffset(tileStep: number, viewportPxW: number, viewportPxH: number): {
        x: number;
        y: number;
    };
}

/**
 * Input abstraction layer.
 *
 * Routes mouse / touch / keyboard events to mode-appropriate handlers
 * based on the current CanvasMode. Supports:
 *
 *   - **edit**: tool selection (B=brush, G=fill, E=eraser, etc.),
 *     left-click-paint, right-click-eyedrop, wheel-zoom, space-drag-pan,
 *     selection marquee, keyboard shortcuts (Cmd+Z, Cmd+C, etc.)
 *   - **play**: WASD/arrow movement, click-to-move, interact key,
 *     inventory hotkey, chat hotkey, touch D-pad for mobile
 *   - **battle**: action menu navigation, target selection, active-defense
 *     timing window (frame-accurate key press capture)
 *
 * All key bindings are remappable via `Input.setBinding()`. Touch
 * gestures (pinch, two-finger pan, long-press) map to the same actions
 * as mouse+wheel+right-click for parity on mobile.
 *
 * The class is framework-agnostic. It takes a DOM element to listen on
 * and emits high-level Action events. The consumer (editor LiveView
 * hook, player React component, battle Svelte action) translates the
 * emitted actions into its own world model.
 */

/** High-level actions the renderer consumer handles. Mode-keyed. */
type InputAction = {
    type: "edit.tool.select";
    tool: EditTool;
} | {
    type: "edit.paint";
    tileX: number;
    tileY: number;
    primary: boolean;
} | {
    type: "edit.eyedrop";
    tileX: number;
    tileY: number;
} | {
    type: "edit.undo";
} | {
    type: "edit.redo";
} | {
    type: "edit.copy";
} | {
    type: "edit.paste";
    tileX: number;
    tileY: number;
} | {
    type: "edit.delete";
} | {
    type: "edit.save";
} | {
    type: "camera.pan";
    dx: number;
    dy: number;
} | {
    type: "camera.zoom";
    factor: number;
    centerX: number;
    centerY: number;
} | {
    type: "player.move";
    dx: number;
    dy: number;
    running: boolean;
} | {
    type: "player.interact";
} | {
    type: "player.click_move";
    tileX: number;
    tileY: number;
} | {
    type: "player.toggle_inventory";
} | {
    type: "player.toggle_chat";
} | {
    type: "player.hotkey";
    slot: number;
} | {
    type: "battle.menu_up";
} | {
    type: "battle.menu_down";
} | {
    type: "battle.menu_confirm";
} | {
    type: "battle.menu_cancel";
} | {
    type: "battle.select_target";
    tileX: number;
    tileY: number;
} | {
    type: "battle.active_defense";
    pressedAt: number;
};
type EditTool = "brush" | "fill" | "rect" | "eraser" | "eyedrop" | "select" | "passability" | "autotile" | "elevation" | "stamp";
/** Listener function type. */
type InputListener = (action: InputAction) => void;
interface InputOptions {
    target: HTMLElement;
    mode: CanvasMode;
    /** Pixel size of a tile side at the current zoom. */
    tileSize: number;
    /** Called with every decoded high-level action. */
    onAction: InputListener;
    /** Function that converts screen (cx, cy) → tile (tx, ty) using the
     *  current camera. Injected because projection + camera live outside. */
    screenToTile: (clientX: number, clientY: number) => {
        tileX: number;
        tileY: number;
    };
}
/**
 * Input — stateful handler. Create on mount, call destroy on unmount.
 */
declare class Input {
    private opts;
    private mode;
    private listeners;
    private pressedKeys;
    private spaceDragging;
    private mouseDown;
    private lastPanX;
    private lastPanY;
    constructor(opts: InputOptions);
    setMode(mode: CanvasMode): void;
    destroy(): void;
    private attach;
    private handleMouseDown;
    private handleMouseUp;
    private handleMouseMove;
    private handleWheel;
    private handleKeyDown;
    private handleKeyUp;
    private touchStartX;
    private touchStartY;
    private pinchStartDist;
    private handleTouchStart;
    private handleTouchMove;
    private handleTouchEnd;
}
declare function defaultBindings(): Record<string, InputAction["type"]>;

type DamageType = "damage" | "crit" | "heal" | "miss" | "block" | "poison" | "burn" | "mp";
interface CombatFxOptions {
    container: Container;
    pixi: typeof pixi_js;
}
/**
 * Imperative combat FX manager. Call methods from anywhere; call tick()
 * once per frame from the renderer.
 */
declare class CombatFx {
    private opts;
    private pops;
    private flashes;
    constructor(opts: CombatFxOptions);
    /** Spawn a floating damage number at (x, y) in screen-space pixels. */
    damage(x: number, y: number, amount: number | string, type?: DamageType): void;
    /** Spawn a floating text label (for "MISS!", "BLOCKED!", etc.). */
    floatText(x: number, y: number, text: string, color?: number): void;
    /** Full-screen color flash (white for crits, red for damage, etc.). */
    flash(color: number, durationMs?: number): void;
    /** Advance all active FX by dtMs. Call once per frame. */
    tick(dtMs: number): void;
    /** Drop everything — called on scene teardown. */
    destroy(): void;
}

type BattlePresentationMode = "INLINE" | "TRANSITION" | "HYBRID";
interface BattleTransitionOptions {
    /** The Pixi Application — needed to snapshot the current stage. */
    app: Application;
    /** The Pixi namespace. */
    pixi: typeof pixi_js;
    /** Container to compose the battle scene into (typically stage). */
    composeInto: Container;
}
interface BattleContext {
    battleId: number | string;
    mode: BattlePresentationMode;
    /** Scene id if TRANSITION mode; null for INLINE. */
    battleSceneId?: number | null;
    /** Participant positions to frame (for INLINE camera). */
    participants: Array<{
        x: number;
        y: number;
    }>;
    /** If set, forces TRANSITION with this scene. Per-encounter override. */
    forceTransitionSceneId?: number | null;
}
/**
 * BattleSession — the runtime state for one active battle's presentation.
 * Owned by the TwistedRenderer; spun up when a battle begins and torn down
 * when it ends.
 */
declare class BattleSession {
    private ctx;
    private transitionOpts;
    private backdropSprite;
    private fadeOverlay;
    private fadeT;
    private fadeDir;
    private fadeLifetime;
    private active;
    constructor(ctx: BattleContext, transitionOpts?: BattleTransitionOptions);
    /** Resolve the effective presentation for this session. */
    get effectiveMode(): "INLINE" | "TRANSITION";
    /**
     * Framing data the camera should use. For INLINE, frame all participants.
     * For TRANSITION, the battle scene has its own formation anchors — the
     * camera recenters on the composed backdrop.
     */
    getFraming(): BattleFraming;
    /**
     * Called when the battle begins. For INLINE mode this is essentially
     * a no-op beyond camera framing. For TRANSITION mode this snapshots the
     * current stage to a backdrop sprite, begins a fade-out → backdrop swap →
     * fade-in sequence.
     */
    begin(camera: Camera): Promise<void>;
    /** Called every frame while the battle is active. */
    tick(dtMs: number): void;
    /** Called when the battle ends. Fades back out and cleans up backdrop. */
    end(camera: Camera): void;
    /** True if the battle is still running. */
    get isActive(): boolean;
    private beginTransition;
}

/**
 * @twisted/render — Shared rendering core for Twisted Engine.
 *
 * Framework-agnostic TypeScript package wrapping Pixi v8 + Three.js.
 * Consumed by:
 *   - /root/twisted/ui (Next.js player client, React 19 bindings)
 *   - /root/twisted/te_phoenix/assets (Phoenix LiveView admin editor, JS hook bindings)
 *   - Future: ForgeNexus (SvelteKit, Svelte 5 action bindings)
 *
 * No framework imports inside this package. Only Pixi, Three, and DOM APIs.
 */
declare const VERSION = "0.1.0";
/**
 * Mode the canvas is operating in. Determines camera behavior, input routing,
 * and which HUD overlays render.
 */
type CanvasMode = "edit" | "play" | "battle";
/**
 * Supported projection strategies for 2D map rendering.
 * Matches the 6-mode set from the legacy pixi-renderer.tsx.
 */
type RenderMode = "classic" | "2.5d" | "isometric" | "hex" | "side-scroll" | "first-person" | "3d";
/**
 * Sanity check export so consumers can verify the package is wired correctly.
 * Returns a one-line status string including the package version.
 */
declare function sanityCheck(): string;

export { lightenColor as A, type BattleContext as B, CHAR_LAYER_ORDER as C, DEFAULT_WALL_TILE_IDS as D, type EditTool as E, type FirstPersonDrawArgs as F, mixColor as G, parseColor as H, Input as I, sanityCheck as J, type MapEntity as M, type Projection, type RenderMode as R, type ShakeConfig as S, type TileColorLookup as T, type TileDrawContext, VERSION as V, WALL_HEIGHT_PX, type BattleFraming as a, type BattlePresentationMode as b, BattleSession as c, type BattleTransitionOptions as d, Camera as e, type CameraState as f, type CanvasMode as g, type CharLayerName as h, CombatFx as i, type CombatFxOptions as j, type DamageType as k, EntityRenderer as l, type EntityRendererOptions as m, makeProjection, type FollowTarget as n, type InputAction as o, type InputListener as p, type InputOptions as q, type MapObject as r, type RenderState as s, type RendererCallbacks as t, type TilePaletteEntry as u, TwistedRenderer as v, type TwistedRendererOptions as w, darkenColor as x, defaultBindings as y, drawFirstPerson as z };
