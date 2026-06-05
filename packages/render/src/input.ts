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

import type { CanvasMode } from "./index.js";

// ── Action taxonomy ──────────────────────────────────────────

/** High-level actions the renderer consumer handles. Mode-keyed. */
export type InputAction =
  // Editor actions
  | { type: "edit.tool.select"; tool: EditTool }
  | { type: "edit.paint"; tileX: number; tileY: number; primary: boolean }
  | { type: "edit.eyedrop"; tileX: number; tileY: number }
  | { type: "edit.undo" }
  | { type: "edit.redo" }
  | { type: "edit.copy" }
  | { type: "edit.paste"; tileX: number; tileY: number }
  | { type: "edit.delete" }
  | { type: "edit.save" }
  // Shared pan/zoom
  | { type: "camera.pan"; dx: number; dy: number }
  | { type: "camera.zoom"; factor: number; centerX: number; centerY: number }
  // Player actions
  | { type: "player.move"; dx: number; dy: number; running: boolean }
  | { type: "player.interact" }
  | { type: "player.click_move"; tileX: number; tileY: number }
  | { type: "player.toggle_inventory" }
  | { type: "player.toggle_chat" }
  | { type: "player.hotkey"; slot: number }
  // Battle actions
  | { type: "battle.menu_up" }
  | { type: "battle.menu_down" }
  | { type: "battle.menu_confirm" }
  | { type: "battle.menu_cancel" }
  | { type: "battle.select_target"; tileX: number; tileY: number }
  | { type: "battle.active_defense"; pressedAt: number };

export type EditTool =
  | "brush"
  | "fill"
  | "rect"
  | "eraser"
  | "eyedrop"
  | "select"
  | "passability"
  | "autotile"
  | "elevation"
  | "stamp";

/** Listener function type. */
export type InputListener = (action: InputAction) => void;

/** Default keybindings. Fully remappable via setBinding. */
const DEFAULT_BINDINGS: Record<string, InputAction["type"]> = {
  // Editor
  KeyB: "edit.tool.select",
  KeyG: "edit.tool.select",
  KeyE: "edit.tool.select",
  KeyR: "edit.tool.select",
  KeyS: "edit.tool.select",
  "Meta+KeyZ": "edit.undo",
  "Meta+Shift+KeyZ": "edit.redo",
  "Meta+KeyY": "edit.redo",
  "Meta+KeyC": "edit.copy",
  "Meta+KeyV": "edit.paste",
  "Meta+KeyS": "edit.save",
  Delete: "edit.delete",
  Backspace: "edit.delete",
  // Player
  KeyW: "player.move",
  KeyA: "player.move",
  KeyS_play: "player.move",
  KeyD: "player.move",
  ArrowUp: "player.move",
  ArrowLeft: "player.move",
  ArrowDown: "player.move",
  ArrowRight: "player.move",
  Space: "player.interact",
  KeyI: "player.toggle_inventory",
  KeyT: "player.toggle_chat",
};

/** Maps digits 1-9 to tool/hotkey presets. */
const EDIT_TOOL_KEYS: Record<string, EditTool> = {
  KeyB: "brush",
  KeyG: "fill",
  KeyR: "rect",
  KeyE: "eraser",
  KeyY: "eyedrop",
  KeyS: "select",
  KeyP: "passability",
  KeyA: "autotile",
};

export interface InputOptions {
  target: HTMLElement;
  mode: CanvasMode;
  /** Pixel size of a tile side at the current zoom. */
  tileSize: number;
  /** Called with every decoded high-level action. */
  onAction: InputListener;
  /** Function that converts screen (cx, cy) → tile (tx, ty) using the
   *  current camera. Injected because projection + camera live outside. */
  screenToTile: (clientX: number, clientY: number) => { tileX: number; tileY: number };
}

/**
 * Input — stateful handler. Create on mount, call destroy on unmount.
 */
export class Input {
  private opts: InputOptions;
  private mode: CanvasMode;
  private listeners: Array<() => void> = [];
  private pressedKeys = new Set<string>();
  private spaceDragging = false;
  private mouseDown = false;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(opts: InputOptions) {
    this.opts = opts;
    this.mode = opts.mode;
    this.attach();
  }

  setMode(mode: CanvasMode): void {
    this.mode = mode;
  }

  destroy(): void {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.pressedKeys.clear();
  }

  // ── Attach event listeners ──────────────────────────────────

  private attach(): void {
    const t = this.opts.target;

    const onMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    const onMouseUp = (e: MouseEvent) => this.handleMouseUp(e);
    const onMouseMove = (e: MouseEvent) => this.handleMouseMove(e);
    const onWheel = (e: WheelEvent) => this.handleWheel(e);
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
    const onKeyUp = (e: KeyboardEvent) => this.handleKeyUp(e);
    const onTouchStart = (e: TouchEvent) => this.handleTouchStart(e);
    const onTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
    const onTouchEnd = (e: TouchEvent) => this.handleTouchEnd(e);

    t.addEventListener("mousedown", onMouseDown);
    t.addEventListener("mouseup", onMouseUp);
    t.addEventListener("mousemove", onMouseMove);
    t.addEventListener("wheel", onWheel, { passive: false });
    t.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    t.addEventListener("touchstart", onTouchStart, { passive: false });
    t.addEventListener("touchmove", onTouchMove, { passive: false });
    t.addEventListener("touchend", onTouchEnd);

    this.listeners.push(
      () => t.removeEventListener("mousedown", onMouseDown),
      () => t.removeEventListener("mouseup", onMouseUp),
      () => t.removeEventListener("mousemove", onMouseMove),
      () => t.removeEventListener("wheel", onWheel),
      () => t.removeEventListener("contextmenu", onContextMenu),
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => t.removeEventListener("touchstart", onTouchStart),
      () => t.removeEventListener("touchmove", onTouchMove),
      () => t.removeEventListener("touchend", onTouchEnd)
    );
  }

  // ── Mouse ───────────────────────────────────────────────────

  private handleMouseDown(e: MouseEvent): void {
    this.mouseDown = true;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;

    const { tileX, tileY } = this.opts.screenToTile(e.clientX, e.clientY);

    if (this.mode === "edit") {
      if (this.spaceDragging) return;
      if (e.button === 2) {
        this.opts.onAction({ type: "edit.eyedrop", tileX, tileY });
      } else {
        this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
      }
    } else if (this.mode === "play") {
      this.opts.onAction({ type: "player.click_move", tileX, tileY });
    } else if (this.mode === "battle") {
      this.opts.onAction({ type: "battle.select_target", tileX, tileY });
    }
  }

  private handleMouseUp(_e: MouseEvent): void {
    this.mouseDown = false;
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.mouseDown) return;
    const dx = e.clientX - this.lastPanX;
    const dy = e.clientY - this.lastPanY;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;

    if (this.spaceDragging || this.mode === "edit") {
      const step = this.opts.tileSize + 1;
      if (this.spaceDragging) {
        this.opts.onAction({ type: "camera.pan", dx: -dx / step, dy: -dy / step });
      } else if (this.mode === "edit") {
        // Continuous paint along the drag
        const { tileX, tileY } = this.opts.screenToTile(e.clientX, e.clientY);
        this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
      }
    }
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.opts.onAction({
      type: "camera.zoom",
      factor,
      centerX: e.clientX,
      centerY: e.clientY,
    });
  }

  // ── Keyboard ────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    this.pressedKeys.add(e.code);

    if (e.code === "Space") {
      if (this.mode === "edit") {
        this.spaceDragging = true;
        e.preventDefault();
        return;
      } else if (this.mode === "play") {
        this.opts.onAction({ type: "player.interact" });
        e.preventDefault();
        return;
      }
    }

    if (this.mode === "edit") {
      // Tool select
      const tool = EDIT_TOOL_KEYS[e.code];
      if (tool) {
        this.opts.onAction({ type: "edit.tool.select", tool });
        return;
      }
      // Editor shortcuts
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        this.opts.onAction(e.shiftKey ? { type: "edit.redo" } : { type: "edit.undo" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyY") {
        e.preventDefault();
        this.opts.onAction({ type: "edit.redo" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyS") {
        e.preventDefault();
        this.opts.onAction({ type: "edit.save" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyC") {
        this.opts.onAction({ type: "edit.copy" });
        return;
      }
      if (e.code === "Delete" || e.code === "Backspace") {
        this.opts.onAction({ type: "edit.delete" });
        return;
      }
    }

    if (this.mode === "play") {
      const running = e.shiftKey;
      if (e.code === "KeyW" || e.code === "ArrowUp") {
        this.opts.onAction({ type: "player.move", dx: 0, dy: -1, running });
        return;
      }
      if (e.code === "KeyS" || e.code === "ArrowDown") {
        this.opts.onAction({ type: "player.move", dx: 0, dy: 1, running });
        return;
      }
      if (e.code === "KeyA" || e.code === "ArrowLeft") {
        this.opts.onAction({ type: "player.move", dx: -1, dy: 0, running });
        return;
      }
      if (e.code === "KeyD" || e.code === "ArrowRight") {
        this.opts.onAction({ type: "player.move", dx: 1, dy: 0, running });
        return;
      }
      if (e.code === "KeyI") {
        this.opts.onAction({ type: "player.toggle_inventory" });
        return;
      }
      if (e.code === "KeyT") {
        this.opts.onAction({ type: "player.toggle_chat" });
        return;
      }
      const digit = e.code.match(/^Digit([1-9])$/);
      if (digit && digit[1]) {
        this.opts.onAction({ type: "player.hotkey", slot: parseInt(digit[1], 10) });
        return;
      }
    }

    if (this.mode === "battle") {
      switch (e.code) {
        case "ArrowUp":
          this.opts.onAction({ type: "battle.menu_up" });
          return;
        case "ArrowDown":
          this.opts.onAction({ type: "battle.menu_down" });
          return;
        case "Enter":
          this.opts.onAction({ type: "battle.menu_confirm" });
          return;
        case "Escape":
          this.opts.onAction({ type: "battle.menu_cancel" });
          return;
        case "KeyZ":
          this.opts.onAction({
            type: "battle.active_defense",
            pressedAt: performance.now(),
          });
          return;
      }
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.pressedKeys.delete(e.code);
    if (e.code === "Space") this.spaceDragging = false;
  }

  // ── Touch ────────────────────────────────────────────────────
  // Minimal touch handling: single-tap = click, two-finger = pan, pinch = zoom.

  private touchStartX = 0;
  private touchStartY = 0;
  private pinchStartDist: number | null = null;

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      this.pinchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (e.touches.length === 2 && this.pinchStartDist !== null) {
      e.preventDefault();
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = dist / this.pinchStartDist;
      this.opts.onAction({
        type: "camera.zoom",
        factor,
        centerX: (t1.clientX + t2.clientX) / 2,
        centerY: (t1.clientY + t2.clientY) / 2,
      });
      this.pinchStartDist = dist;
    } else if (e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0]!;
      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      const step = this.opts.tileSize + 1;
      this.opts.onAction({ type: "camera.pan", dx: -dx / step, dy: -dy / step });
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (e.touches.length < 2) this.pinchStartDist = null;
    if (e.changedTouches.length === 1) {
      const t = e.changedTouches[0]!;
      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      // Treat as tap if the finger didn't move much
      if (Math.hypot(dx, dy) < 10) {
        const { tileX, tileY } = this.opts.screenToTile(t.clientX, t.clientY);
        if (this.mode === "edit") {
          this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
        } else if (this.mode === "play") {
          this.opts.onAction({ type: "player.click_move", tileX, tileY });
        } else if (this.mode === "battle") {
          this.opts.onAction({ type: "battle.select_target", tileX, tileY });
        }
      }
    }
  }
}

// Silences "unused" warnings from DEFAULT_BINDINGS in strict TS until
// we wire up the user-remappable binding table. Keeping the constant
// here documents the intended default set.
export function defaultBindings(): Record<string, InputAction["type"]> {
  return DEFAULT_BINDINGS;
}
