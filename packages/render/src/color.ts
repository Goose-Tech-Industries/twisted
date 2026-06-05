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
export function darkenColor(hex: number, factor: number): number {
  const r = Math.floor(((hex >> 16) & 0xff) * factor);
  const g = Math.floor(((hex >> 8) & 0xff) * factor);
  const b = Math.floor((hex & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

/** Multiply each RGB channel by `factor`, clamped to 255. Used for light halos, crits, heals. */
export function lightenColor(hex: number, factor: number): number {
  const r = Math.min(255, Math.floor(((hex >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.floor(((hex >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.floor((hex & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}

/** Linear interpolation between two RGB colors. `t` = 0..1. */
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Convert `#RRGGBB` / `rgb(r,g,b)` / packed number to packed 24-bit. */
export function parseColor(input: string | number): number {
  if (typeof input === "number") return input;
  const s = input.trim();
  if (s.startsWith("#")) return parseInt(s.slice(1), 16);
  if (s.startsWith("0x")) return parseInt(s.slice(2), 16);
  const m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) {
    const r = parseInt(m[1] ?? "0", 10);
    const g = parseInt(m[2] ?? "0", 10);
    const b = parseInt(m[3] ?? "0", 10);
    return (r << 16) | (g << 8) | b;
  }
  return 0x000000;
}
