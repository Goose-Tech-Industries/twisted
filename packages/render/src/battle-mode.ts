/**
 * Battle mode infrastructure — INLINE / TRANSITION / HYBRID.
 *
 * Lives in @twisted/render so the same code path works for both the
 * Next.js player client and the Phoenix LiveView admin preview.
 *
 * Three presentation modes:
 *
 *   - **INLINE**: battle happens where the trigger fired. Camera reframes
 *     the participants, HUD fades in, no scene change. BG3/DOS2/Legend-of-
 *     Legaia real-time / MMO style.
 *
 *   - **TRANSITION**: fade out current map, load a dedicated battle scene
 *     with its own backdrop, compose combatants on it, fade back on victory.
 *     FF1-10 / Chrono Trigger / Pokemon classic JRPG style. Implemented by
 *     snapshotting the current renderer output to an offscreen RenderTexture
 *     as a backdrop and drawing the battle stage composed over top.
 *
 *   - **HYBRID**: per-ruleset default + per-encounter override. Random
 *     encounters default to INLINE; scripted boss fights force TRANSITION
 *     with a specific battle scene id.
 *
 * See project_battle_modes.md for the full design.
 */

import type { Container, Application } from "pixi.js";
import type { Camera, BattleFraming } from "./camera.js";

export type BattlePresentationMode = "INLINE" | "TRANSITION" | "HYBRID";

export interface BattleTransitionOptions {
  /** The Pixi Application — needed to snapshot the current stage. */
  app: Application;
  /** The Pixi namespace. */
  pixi: typeof import("pixi.js");
  /** Container to compose the battle scene into (typically stage). */
  composeInto: Container;
}

export interface BattleContext {
  battleId: number | string;
  mode: BattlePresentationMode;
  /** Scene id if TRANSITION mode; null for INLINE. */
  battleSceneId?: number | null;
  /** Participant positions to frame (for INLINE camera). */
  participants: Array<{ x: number; y: number }>;
  /** If set, forces TRANSITION with this scene. Per-encounter override. */
  forceTransitionSceneId?: number | null;
}

/**
 * BattleSession — the runtime state for one active battle's presentation.
 * Owned by the TwistedRenderer; spun up when a battle begins and torn down
 * when it ends.
 */
export class BattleSession {
  private ctx: BattleContext;
  private transitionOpts: BattleTransitionOptions | null = null;
  private backdropSprite: import("pixi.js").Sprite | null = null;
  private fadeOverlay: import("pixi.js").Graphics | null = null;
  private fadeT = 0;
  private fadeDir: "in" | "out" | null = null;
  private fadeLifetime = 600;
  private active = true;

  constructor(ctx: BattleContext, transitionOpts?: BattleTransitionOptions) {
    this.ctx = ctx;
    this.transitionOpts = transitionOpts ?? null;
  }

  /** Resolve the effective presentation for this session. */
  get effectiveMode(): "INLINE" | "TRANSITION" {
    if (this.ctx.forceTransitionSceneId != null) return "TRANSITION";
    if (this.ctx.mode === "TRANSITION") return "TRANSITION";
    if (this.ctx.mode === "INLINE") return "INLINE";
    // HYBRID: default to inline unless battleSceneId is set
    return this.ctx.battleSceneId != null ? "TRANSITION" : "INLINE";
  }

  /**
   * Framing data the camera should use. For INLINE, frame all participants.
   * For TRANSITION, the battle scene has its own formation anchors — the
   * camera recenters on the composed backdrop.
   */
  getFraming(): BattleFraming {
    return {
      participants: this.ctx.participants,
    };
  }

  /**
   * Called when the battle begins. For INLINE mode this is essentially
   * a no-op beyond camera framing. For TRANSITION mode this snapshots the
   * current stage to a backdrop sprite, begins a fade-out → backdrop swap →
   * fade-in sequence.
   */
  async begin(camera: Camera): Promise<void> {
    camera.setMode("battle");
    camera.frameBattle(this.getFraming());

    if (this.effectiveMode === "TRANSITION" && this.transitionOpts) {
      await this.beginTransition();
    }
  }

  /** Called every frame while the battle is active. */
  tick(dtMs: number): void {
    if (this.fadeDir && this.fadeOverlay) {
      this.fadeT += dtMs;
      const progress = Math.min(1, this.fadeT / this.fadeLifetime);
      this.fadeOverlay.alpha = this.fadeDir === "in" ? 1 - progress : progress;
      if (progress >= 1) {
        if (this.fadeDir === "out") {
          // Fade-out complete; swap backdrop and start fade-in.
          this.fadeDir = "in";
          this.fadeT = 0;
        } else {
          // Fade-in complete; remove overlay.
          this.fadeOverlay.destroy();
          this.fadeOverlay = null;
          this.fadeDir = null;
        }
      }
    }
  }

  /** Called when the battle ends. Fades back out and cleans up backdrop. */
  end(camera: Camera): void {
    camera.setMode("play");
    this.active = false;
    if (this.backdropSprite) {
      this.backdropSprite.destroy();
      this.backdropSprite = null;
    }
  }

  /** True if the battle is still running. */
  get isActive(): boolean {
    return this.active;
  }

  // ── Internals ──────────────────────────────────────────────

  private async beginTransition(): Promise<void> {
    if (!this.transitionOpts) return;
    const PIXI = this.transitionOpts.pixi;
    const app = this.transitionOpts.app;
    const compose = this.transitionOpts.composeInto;

    // Snapshot the current rendered stage into an offscreen texture.
    // For Pixi v8, use `app.renderer.extract.texture(app.stage)`.
    try {
      const tex = app.renderer.extract.texture(app.stage);
      const sprite = new PIXI.Sprite(tex);
      sprite.label = "battle-backdrop";
      compose.addChildAt(sprite, 0);
      this.backdropSprite = sprite;
    } catch (err) {
      // Snapshot failed (headless, destroyed context, etc.) — proceed
      // without a backdrop. INLINE-ish fallback.
      console.warn("[BattleSession] backdrop snapshot failed", err);
    }

    // Fade overlay — starts opaque, will fade out over `fadeLifetime` ms.
    const overlay = new PIXI.Graphics()
      .rect(0, 0, app.screen.width, app.screen.height)
      .fill(0x000000);
    overlay.alpha = 0;
    compose.addChild(overlay);
    this.fadeOverlay = overlay;
    this.fadeDir = "out";
    this.fadeT = 0;
  }
}
