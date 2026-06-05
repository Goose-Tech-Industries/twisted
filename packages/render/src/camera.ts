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

import type { CanvasMode } from "./index.js";

export interface CameraState {
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

export interface ShakeConfig {
  /** Max pixel offset. */
  intensity: number;
  /** Duration in ms. */
  duration: number;
}

export interface FollowTarget {
  /** Tile-space coordinates to follow. */
  x: number;
  y: number;
}

export interface BattleFraming {
  /** World-space positions of all participants to frame. */
  participants: Array<{ x: number; y: number }>;
  /** Optional single actor to zoom into (for turn-based cuts). */
  activeActor?: { x: number; y: number };
}

export class Camera {
  private state: CameraState = {
    x: 0,
    y: 0,
    zoom: 1,
    shakeX: 0,
    shakeY: 0,
  };
  private target: CameraState = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
  private mode: CanvasMode = "edit";
  private follow: FollowTarget | null = null;
  private lastBattleFraming: BattleFraming | null = null;

  private shake: {
    intensity: number;
    remainingMs: number;
  } | null = null;

  /** Smoothing factor 0..1 per frame. Higher = snappier. */
  private smoothness = 0.12;

  setMode(mode: CanvasMode): void {
    this.mode = mode;
  }

  /** Set a target for the camera to track (play mode). */
  setFollow(target: FollowTarget | null): void {
    this.follow = target;
    if (target && this.mode === "play") {
      this.target.x = target.x;
      this.target.y = target.y;
    }
  }

  /** Jump instantly to a world position (editor mode, fast-travel). */
  jumpTo(x: number, y: number): void {
    this.state.x = x;
    this.state.y = y;
    this.target.x = x;
    this.target.y = y;
  }

  /** Pan by a relative amount (editor drag). */
  pan(dx: number, dy: number): void {
    this.target.x += dx;
    this.target.y += dy;
  }

  /** Set zoom. Clamped to [0.5, 4.0]. */
  setZoom(z: number): void {
    this.target.zoom = Math.max(0.5, Math.min(4.0, z));
  }

  /** Trigger screen shake (battle hits, explosions, earthquake). */
  triggerShake(intensity: number, durationMs: number): void {
    if (!this.shake || intensity > this.shake.intensity) {
      this.shake = { intensity, remainingMs: durationMs };
    }
  }

  /** Frame a set of battle participants, optionally focusing on one. */
  frameBattle(framing: BattleFraming): void {
    this.lastBattleFraming = framing;
    if (framing.activeActor) {
      this.target.x = framing.activeActor.x;
      this.target.y = framing.activeActor.y;
      this.target.zoom = 1.25;
    } else if (framing.participants.length > 0) {
      // Center on the bounding box of all participants
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of framing.participants) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      this.target.x = (minX + maxX) / 2;
      this.target.y = (minY + maxY) / 2;

      // Zoom out if the spread is wide
      const spread = Math.max(maxX - minX, maxY - minY);
      this.target.zoom = Math.max(0.6, Math.min(1.2, 10 / Math.max(spread, 5)));
    }
  }

  /** Advance camera state by dt milliseconds — call once per frame. */
  tick(dtMs: number): void {
    // Mode-specific target updates
    if (this.mode === "play" && this.follow) {
      this.target.x = this.follow.x;
      this.target.y = this.follow.y;
    }

    // Smooth lerp toward target
    const factor = 1 - Math.pow(1 - this.smoothness, dtMs / 16);
    this.state.x += (this.target.x - this.state.x) * factor;
    this.state.y += (this.target.y - this.state.y) * factor;
    this.state.zoom += (this.target.zoom - this.state.zoom) * factor;

    // Screen shake
    if (this.shake) {
      this.shake.remainingMs -= dtMs;
      if (this.shake.remainingMs <= 0) {
        this.shake = null;
        this.state.shakeX = 0;
        this.state.shakeY = 0;
      } else {
        const decay = Math.max(0, this.shake.remainingMs / 300);
        const amp = this.shake.intensity * decay;
        this.state.shakeX = (Math.random() * 2 - 1) * amp;
        this.state.shakeY = (Math.random() * 2 - 1) * amp;
      }
    }
  }

  /** Get current camera world position (after smoothing + shake). */
  get position(): { x: number; y: number; zoom: number } {
    return {
      x: this.state.x,
      y: this.state.y,
      zoom: this.state.zoom,
    };
  }

  /** Get current shake offset in pixels. */
  get shakeOffset(): { x: number; y: number } {
    return { x: this.state.shakeX, y: this.state.shakeY };
  }

  /** Compute screen-space offset for the tile renderer. */
  getScreenOffset(tileStep: number, viewportPxW: number, viewportPxH: number): {
    x: number;
    y: number;
  } {
    const centerX = viewportPxW / 2;
    const centerY = viewportPxH / 2;
    return {
      x: -this.state.x * tileStep + centerX + this.state.shakeX,
      y: -this.state.y * tileStep + centerY + this.state.shakeY,
    };
  }
}
