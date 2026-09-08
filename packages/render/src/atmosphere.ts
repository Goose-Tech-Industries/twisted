import type { Container } from "pixi.js";

export interface AtmosphereOptions {
  container: Container;
  pixi: typeof import("pixi.js");
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  life: number;
  maxLife: number;
  phase: number;
}

export class AtmosphereRenderer {
  private container: Container;
  private PIXI: typeof import("pixi.js");
  private graphics: import("pixi.js").Graphics | null = null;
  private particles: Particle[] = [];
  private theme: "embers" | "ash" | "spores" | "none" = "none";
  private time = 0;
  private mapWidthPx = 800;
  private mapHeightPx = 600;

  constructor(opts: AtmosphereOptions) {
    this.container = opts.container;
    this.PIXI = opts.pixi;
    this.graphics = new this.PIXI.Graphics();
    this.container.addChild(this.graphics);
  }

  setTheme(theme: "embers" | "ash" | "spores" | "none" | null | undefined, widthPx: number, heightPx: number) {
    const nextTheme = theme || "none";
    this.mapWidthPx = Math.max(100, widthPx);
    this.mapHeightPx = Math.max(100, heightPx);

    if (this.theme !== nextTheme) {
      this.theme = nextTheme;
      this.initParticles();
    }
  }

  private initParticles() {
    this.particles = [];
    if (this.theme === "none") {
      if (this.graphics) this.graphics.clear();
      return;
    }

    const count = this.theme === "embers" ? 60 : 40;
    for (let i = 0; i < count; i++) {
      this.particles.push(this.createParticle(true));
    }
  }

  private createParticle(randomAge = false): Particle {
    const isEmber = this.theme === "embers";
    const colors = isEmber
      ? [0xff8800, 0xff5500, 0xffaa22, 0xffcc44, 0xdd3300]
      : [0x888888, 0xaaaaaa, 0x666666, 0x777777];

    const maxLife = 120 + Math.random() * 180;
    const life = randomAge ? Math.random() * maxLife : 0;

    return {
      x: Math.random() * this.mapWidthPx,
      y: randomAge ? Math.random() * this.mapHeightPx : this.mapHeightPx + 10,
      vx: (Math.random() - 0.5) * 0.4,
      vy: isEmber ? -(0.5 + Math.random() * 0.8) : -(0.2 + Math.random() * 0.4),
      size: isEmber ? 1.5 + Math.random() * 2.0 : 2.0 + Math.random() * 2.5,
      color: colors[Math.floor(Math.random() * colors.length)] ?? 0xff8800,
      alpha: 0.2 + Math.random() * 0.6,
      life,
      maxLife,
      phase: Math.random() * Math.PI * 2,
    };
  }

  update(delta = 1) {
    if (this.theme === "none" || !this.graphics || this.particles.length === 0) return;

    this.time += 0.05 * delta;
    this.graphics.clear();

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]!;
      p.life += delta;

      if (p.life >= p.maxLife || p.y < -10) {
        this.particles[i] = this.createParticle(false);
        continue;
      }

      // Drift & sway
      p.y += p.vy * delta;
      p.x += (p.vx + Math.sin(this.time + p.phase) * 0.5) * delta;

      // Wrap around horizontal edges
      if (p.x < 0) p.x += this.mapWidthPx;
      if (p.x > this.mapWidthPx) p.x -= this.mapWidthPx;

      // Fade envelope
      const progress = p.life / p.maxLife;
      const fadeAlpha = progress < 0.2
        ? (progress / 0.2) * p.alpha
        : progress > 0.8
        ? ((1 - progress) / 0.2) * p.alpha
        : p.alpha;

      // Draw glowing particle
      this.graphics.circle(p.x, p.y, p.size);
      this.graphics.fill({ color: p.color, alpha: fadeAlpha });
    }
  }

  destroy() {
    this.particles = [];
    if (this.graphics) {
      this.graphics.destroy();
      this.graphics = null;
    }
  }
}
