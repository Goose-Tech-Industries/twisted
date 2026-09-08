/**
 * Shared type definitions for @twisted/render consumers.
 * Ported from /root/twisted/ui/components/game/map-renderers/types.ts
 * and upgraded to support the new CanvasMode + edit-mode use cases.
 */

import type { RenderMode, CanvasMode } from "./index.js";

export type { RenderMode, CanvasMode };

/** One entry in the DB-driven tile palette. */
export interface TilePaletteEntry {
  id: number;
  name: string;
  color: string; // "#RRGGBB" format from DB
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
export interface MapObject {
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
export interface MapEntity {
  id: string | number;
  kind: "player" | "npc" | "enemy" | "projectile" | "companion";
  x: number;
  y: number;
  facing?: number;
  name?: string;
  spriteUrl?: string;
  /** For layered characters: map of layer name → sprite URL. */
  layers?: Partial<
    Record<"body" | "head" | "hair" | "armor" | "weapon" | "acc", string>
  >;
  /** Normalized health 0..1 for the nameplate bar. */
  hp?: number;
  animation?: "idle" | "walk" | "attack" | "hurt" | "ko";
}

/** A loose visual element without its own EntityRenderer slot. */
export interface MapPlayerMarker {
  id: string | number;
  x: number;
  y: number;
  name?: string;
  isOffline?: boolean;
}

/** A loot/ground item drop drawn on the entities layer. */
export interface GroundItem {
  id: number;
  x: number;
  y: number;
  icon?: string;
}

/** A player-built deployed structure drawn on the entities layer. */
export interface DeployedStructure {
  id: number;
  x: number;
  y: number;
  icon?: string;
}

/** An in-progress battle marker drawn on the entities layer. */
export interface MapBattleMarker {
  battleId: number;
  x: number;
  y: number;
}

/** Per-frame render state pushed into TwistedRenderer.update(). */
export interface RenderState {
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
  companions?: Array<MapPlayerMarker & { icon?: string }>;
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
  /** Optional layered paperdoll sprite URLs for the player. */
  playerLayers?: Partial<Record<"body" | "head" | "hair" | "armor" | "weapon" | "acc", string>>;
  /** Optional equipped icons/metadata for HUD and canvas fallback. */
  playerEquipped?: {
    weaponIcon?: string;
    weaponName?: string;
    armorIcon?: string;
    shieldIcon?: string;
  };
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
  /** Tactical grid overlay toggle (crisp 1px semi-transparent grid lines). */
  showGrid?: boolean;

  /** Tactical ruler measurement line between two tiles (VTT campaign feature). */
  ruler?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    color?: number;
  } | null;

  /** Area-of-Effect tactical spell / blast template overlay. */
  aoeTemplate?: {
    type: "circle" | "cone" | "box" | "line";
    originX: number;
    originY: number;
    targetX: number;
    targetY: number;
    radiusTiles: number;
    color?: number;
  } | null;

  /** DB-driven tile palette — optional, falls back to hardcoded defaults. */
  tilePalette?: TilePaletteEntry[];

  /** Tileset atlas configuration for sprite-based tiles (single-sheet texture slicing). */
  tileset?: {
    url: string;
    tileWidth?: number;
    tileHeight?: number;
    columns?: number;
    rows?: number;
  } | null;

  /** Illustrated pre-rendered background image backdrop (continuous scene art). */
  backdropUrl?: string | null;
  /** Floating atmosphere particles (e.g. "embers", "ash", "spores", "none"). */
  atmosphere?: "embers" | "ash" | "spores" | "none" | null;
  /** Enable dynamic brazier / light flicker animation. */
  dynamicLighting?: boolean;

  /** Per-app background theme overrides — all optional, fall back to the
   * default amber/dark theme so existing callers see no change. */
  bgOutsideColor?: number;
  bgInsideColor?: number;
  bgBorderColor?: number;
}

/** Callback set passed into TwistedRenderer.init(). */
export interface RendererCallbacks {
  onExplore?: (tileKeys: string[]) => void;
  onTileClick?: (x: number, y: number) => void;
  onEntityClick?: (entity: MapEntity) => void;
  onObjectClick?: (object: MapObject) => void;
  onPickupItem?: (groundItemId: number) => void;
  onEnterStructure?: (structureId: number) => void;
  onBattleClick?: (battleId: number) => void;
}
