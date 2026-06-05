/**
 * Combat effects — damage numbers, screen shake, color flashes.
 *
 * Ported from /root/twisted/ui/components/game/combat-effects.tsx
 * (364 lines, React-portal-based imperative API).
 *
 * Presents a framework-agnostic imperative API so any renderer consumer
 * can call `combatFx.damage(x, y, amount, type)` without having to manage
 * sprite lifecycle. Damage numbers get physics-based arcs, color-coded
 * by damage type, and auto-destruct after their animation completes.
 *
 * All FX live in a dedicated Container passed in at construction time.
 * Caller typically uses the TwistedRenderer's "fog" layer (top-most) or
 * a fresh overlay container.
 */

import type { Container, Text } from "pixi.js";

export type DamageType =
  | "damage"
  | "crit"
  | "heal"
  | "miss"
  | "block"
  | "poison"
  | "burn"
  | "mp";

const DAMAGE_COLORS: Record<DamageType, number> = {
  damage: 0xffffff,
  crit: 0xffd700,
  heal: 0x00ff88,
  miss: 0x888888,
  block: 0x88aaff,
  poison: 0xaa00ff,
  burn: 0xff4400,
  mp: 0x00aaff,
};

export interface CombatFxOptions {
  container: Container;
  pixi: typeof import("pixi.js");
}

interface ActivePop {
  text: Text;
  startX: number;
  startY: number;
  vy: number;
  age: number;
  lifetime: number;
}

interface ActiveFlash {
  overlay: import("pixi.js").Graphics;
  age: number;
  lifetime: number;
  color: number;
}

/**
 * Imperative combat FX manager. Call methods from anywhere; call tick()
 * once per frame from the renderer.
 */
export class CombatFx {
  private opts: CombatFxOptions;
  private pops: ActivePop[] = [];
  private flashes: ActiveFlash[] = [];

  constructor(opts: CombatFxOptions) {
    this.opts = opts;
  }

  /** Spawn a floating damage number at (x, y) in screen-space pixels. */
  damage(x: number, y: number, amount: number | string, type: DamageType = "damage"): void {
    const PIXI = this.opts.pixi;
    const color = DAMAGE_COLORS[type];
    const isNumeric = typeof amount === "number";
    const displayText = typeof amount === "string" ? amount : String(amount);

    const text = new PIXI.Text({
      text: displayText,
      style: {
        fontFamily: "monospace",
        fontSize: type === "crit" ? 28 : 20,
        fontWeight: "bold",
        fill: color,
        stroke: { color: 0x000000, width: 3 },
        dropShadow: {
          color: 0x000000,
          blur: 4,
          distance: 2,
          alpha: 0.8,
        },
      },
    });
    text.anchor.set(0.5, 0.5);
    text.x = x;
    text.y = y;
    this.opts.container.addChild(text);

    const pop: ActivePop = {
      text,
      startX: x,
      startY: y,
      vy: type === "crit" ? -3.5 : -2.5,
      age: 0,
      lifetime: type === "crit" || !isNumeric ? 1400 : 1000,
    };
    this.pops.push(pop);
  }

  /** Spawn a floating text label (for "MISS!", "BLOCKED!", etc.). */
  floatText(x: number, y: number, text: string, color = 0xffffff): void {
    this.damage(x, y, text, "damage");
    // Override color on the last pop
    const last = this.pops[this.pops.length - 1];
    if (last) {
      (last.text.style as { fill: number }).fill = color;
    }
  }

  /** Full-screen color flash (white for crits, red for damage, etc.). */
  flash(color: number, durationMs = 150): void {
    const PIXI = this.opts.pixi;
    const parent = this.opts.container;
    const w = (parent as Container & { width: number }).width || 2000;
    const h = (parent as Container & { height: number }).height || 2000;
    const overlay = new PIXI.Graphics().rect(0, 0, w, h).fill(color);
    overlay.alpha = 0.5;
    parent.addChild(overlay);
    this.flashes.push({ overlay, age: 0, lifetime: durationMs, color });
  }

  /** Advance all active FX by dtMs. Call once per frame. */
  tick(dtMs: number): void {
    // Damage pops: arc upward, fade out
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (!p) continue;
      p.age += dtMs;
      const t = p.age / p.lifetime;
      if (t >= 1) {
        p.text.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      // Physics arc: initial upward velocity + gravity
      const gravity = 0.15;
      p.text.y = p.startY + p.vy * p.age * 0.05 + gravity * p.age * p.age * 0.0005;
      p.text.alpha = 1 - t * t;
      // Slight random horizontal drift for variety
      p.text.x = p.startX + Math.sin(p.age * 0.01) * 3;
    }

    // Color flashes: decay alpha
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.age += dtMs;
      const t = f.age / f.lifetime;
      if (t >= 1) {
        f.overlay.destroy();
        this.flashes.splice(i, 1);
        continue;
      }
      f.overlay.alpha = 0.5 * (1 - t);
    }
  }

  /** Drop everything — called on scene teardown. */
  destroy(): void {
    for (const p of this.pops) p.text.destroy();
    for (const f of this.flashes) f.overlay.destroy();
    this.pops = [];
    this.flashes = [];
  }
}
