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

export const VERSION = "0.1.0";

/**
 * Mode the canvas is operating in. Determines camera behavior, input routing,
 * and which HUD overlays render.
 */
export type CanvasMode = "edit" | "play" | "battle";

/**
 * Supported projection strategies for MMO RPG map rendering:
 * - "classic": 2D top-down grid (Classic RPG / Tabletop map)
 * - "2.5d": Top-down with extruded elevation walls (Elevated Depth / ARPG)
 * - "isometric": Tactical diamond grid (Isometric Strategy / Turn-Based)
 */
export type RenderMode =
  | "classic"
  | "2.5d"
  | "isometric";

/**
 * Sanity check export so consumers can verify the package is wired correctly.
 * Returns a one-line status string including the package version.
 */
export function sanityCheck(): string {
  return `@twisted/render v${VERSION} — loaded OK`;
}

export { makeProjection, WALL_HEIGHT_PX } from "./projections/index.js";
export type { Projection, TileDrawContext } from "./projections/index.js";
export { darkenColor, lightenColor, mixColor, parseColor } from "./color.js";
export { TwistedRenderer, type TwistedRendererOptions } from "./renderer.js";
export type {
  RenderState,
  RendererCallbacks,
  MapObject,
  MapEntity,
  TilePaletteEntry,
} from "./types.js";
export {
  EntityRenderer,
  CHAR_LAYER_ORDER,
  type CharLayerName,
  type EntityRendererOptions,
} from "./entities.js";
export {
  Camera,
  type CameraState,
  type FollowTarget,
  type BattleFraming,
  type ShakeConfig,
} from "./camera.js";
export {
  Input,
  defaultBindings,
  type InputAction,
  type InputListener,
  type InputOptions,
  type EditTool,
} from "./input.js";
export {
  CombatFx,
  type CombatFxOptions,
  type DamageType,
} from "./combat-fx.js";
export {
  BattleSession,
  type BattleContext,
  type BattlePresentationMode,
  type BattleTransitionOptions,
} from "./battle-mode.js";
export { generateProceduralTileset } from "./procedural-tileset.js";
export { AtmosphereRenderer, type AtmosphereOptions } from "./atmosphere.js";
export * as shaders from "./shaders/index.js";
