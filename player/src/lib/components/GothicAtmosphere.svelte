<script lang="ts">
  // GothicAtmosphere — purely decorative full-screen background for the
  // pre-game pages. Layers:
  //   1. Deep crimson radial gradients (static, breathing)
  //   2. SVG blood drips that animate downward
  //   3. Drifting fog (CSS gradients, parallaxed)
  //   4. Floating embers (DOM-based particles, randomized)
  //   5. Faint Celtic-knot sigil pulse
  //   6. SVG noise grain overlay
  //
  // Self-contained. Drop into any page that wants the atmosphere; the
  // host controls the overall background color underneath.

  import { onMount } from 'svelte'

  interface Props {
    /** How many ember particles to spawn. 0 = disabled. */
    embers?: number
    /** How many blood-rain streaks to spawn. 0 = no rain. */
    rain?: number
    /** 0..1 master opacity multiplier. */
    intensity?: number
  }
  let { embers = 28, rain = 80, intensity = 1 }: Props = $props()

  // Pre-randomize particle properties once so reactive updates don't
  // jitter. All values are local DOM-only — zero server cost,
  // GPU-composited transforms, no per-frame CPU work.
  type Ember = { x: number; delay: number; dur: number; size: number; drift: number; hue: number }
  type Drop = { x: number; delay: number; dur: number; len: number; opacity: number; thick: number; tilt: number }

  let particles = $state<Ember[]>([])
  let drops = $state<Drop[]>([])

  onMount(() => {
    const eArr: Ember[] = []
    for (let i = 0; i < embers; i++) {
      eArr.push({
        x: Math.random() * 100,
        delay: -Math.random() * 14,
        dur: 8 + Math.random() * 10,
        size: 2 + Math.random() * 3,
        drift: (Math.random() - 0.5) * 60,
        hue: 0 + Math.random() * 20  // narrow band: red → orange-red
      })
    }
    particles = eArr

    const dArr: Drop[] = []
    for (let i = 0; i < rain; i++) {
      dArr.push({
        x: Math.random() * 100,
        delay: -Math.random() * 4,
        dur: 0.7 + Math.random() * 1.4,    // 0.7–2.1s — varied speeds
        len: 30 + Math.random() * 70,      // streak length px
        opacity: 0.35 + Math.random() * 0.5,
        thick: 1 + Math.random() * 1.5,    // 1–2.5px line width
        tilt: (Math.random() - 0.5) * 14   // -7°..+7° — wind-blown angle
      })
    }
    drops = dArr
  })
</script>

<div class="atmos" style="--intensity: {intensity}" aria-hidden="true">
  <!-- Layer 1: deep radials, breathing -->
  <div class="layer mist"></div>

  <!-- Layer 2: blood drips with slow downward animation -->
  <div class="layer drips">
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMin slice" width="100%" height="100%">
      <defs>
        <linearGradient id="dripFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8b0000" stop-opacity="0.85" />
          <stop offset="100%" stop-color="#3a0606" stop-opacity="0" />
        </linearGradient>
      </defs>
      <g class="drip-pack a">
        <path d="M50 0 Q 50 80 56 130 T 50 280 Q 48 320 56 360 L 44 360 Q 52 320 50 280 T 44 130 Q 50 80 50 0 Z" fill="url(#dripFade)" />
        <path d="M180 0 Q 180 60 176 110 T 180 220 L 184 220 Q 180 60 184 0 Z" fill="url(#dripFade)" />
        <path d="M320 0 Q 322 100 326 180 T 320 320 Q 318 360 324 410 L 312 410 Q 318 360 320 320 T 326 180 Q 322 100 320 0 Z" fill="url(#dripFade)" />
      </g>
      <g class="drip-pack b">
        <path d="M520 0 Q 520 50 524 90 L 516 90 Q 520 50 520 0 Z" fill="url(#dripFade)" />
        <path d="M720 0 Q 718 110 722 200 T 720 360 Q 716 410 724 460 L 712 460 Q 716 410 720 360 T 722 200 Q 718 110 720 0 Z" fill="url(#dripFade)" />
        <path d="M880 0 Q 880 70 884 130 T 880 240 L 884 240 Q 880 70 884 0 Z" fill="url(#dripFade)" />
      </g>
      <g class="drip-pack c">
        <path d="M1020 0 Q 1024 90 1020 170 T 1024 290 Q 1018 320 1024 350 L 1012 350 Q 1018 320 1020 290 T 1020 170 Q 1024 90 1020 0 Z" fill="url(#dripFade)" />
        <path d="M380 0 Q 380 50 384 90 L 376 90 Q 380 50 380 0 Z" fill="url(#dripFade)" />
        <path d="M650 0 Q 648 70 652 130 T 650 230 L 654 230 Q 648 70 654 0 Z" fill="url(#dripFade)" />
      </g>
    </svg>
  </div>

  <!-- Layer 3: drifting fog -->
  <div class="layer fog fog-a"></div>
  <div class="layer fog fog-b"></div>

  <!-- Layer 4: pulsing red halo behind content -->
  <div class="layer glow"></div>

  <!-- Layer 5: faint Celtic sigil rotating slowly -->
  <div class="layer sigil">
    <svg viewBox="-100 -100 200 200" width="600" height="600">
      <g class="sigil-spin" stroke="#6b0d0d" stroke-width="0.8" fill="none" stroke-linecap="round" opacity="0.18">
        <!-- Outer ring -->
        <circle cx="0" cy="0" r="80" />
        <circle cx="0" cy="0" r="60" />
        <!-- Inner pentacle-like rune -->
        <path d="M0 -70 L67 22 L-41 -22 L41 -22 L-67 22 Z" />
        <!-- Triskele arms -->
        <path d="M0 0 L0 -45 M0 0 L39 22 M0 0 L-39 22" stroke-width="1.5" />
        <!-- Ogham-inspired tick marks -->
        <path d="M-90 -40 L-95 -40 M-90 -30 L-100 -30 M-90 -20 L-95 -20 M-90 -10 L-100 -10" />
        <path d="M90 -40 L95 -40 M90 -30 L100 -30 M90 -20 L95 -20 M90 -10 L100 -10" />
      </g>
    </svg>
  </div>

  <!-- Layer 6: ember particles (rising) -->
  <div class="layer embers">
    {#each particles as p, i (i)}
      <span
        class="ember"
        style="
          left: {p.x}%;
          width: {p.size}px;
          height: {p.size}px;
          --drift: {p.drift}px;
          animation-delay: {p.delay}s;
          animation-duration: {p.dur}s;
          background: hsl({p.hue}, 80%, 55%);
          box-shadow: 0 0 6px hsl({p.hue}, 90%, 60%);
        "
      ></span>
    {/each}
  </div>

  <!-- Layer 7: blood rain (falling streaks) -->
  <div class="layer rain">
    {#each drops as d, i (i)}
      <span
        class="drop"
        style="
          left: {d.x}%;
          width: {d.thick}px;
          height: {d.len}px;
          opacity: {d.opacity};
          --tilt: {d.tilt}deg;
          animation-delay: {d.delay}s;
          animation-duration: {d.dur}s;
        "
      ></span>
    {/each}
  </div>

  <!-- Layer 8: SVG noise grain -->
  <div class="layer grain"></div>

  <!-- Top-edge shadow, anchors the drips visually -->
  <div class="layer top-shadow"></div>
</div>

<style>
  .atmos {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    opacity: var(--intensity, 1);
  }
  .layer {
    position: absolute;
    inset: 0;
  }

  /* ── Mist ─────────────────────────────────────────────────────── */
  .mist {
    background:
      radial-gradient(ellipse 1100px 700px at 50% -10%, rgba(178, 34, 34, 0.32), transparent 60%),
      radial-gradient(ellipse 900px 600px at 18% 90%, rgba(107, 13, 13, 0.22), transparent 65%),
      radial-gradient(ellipse 800px 600px at 88% 50%, rgba(216, 58, 58, 0.10), transparent 60%);
    animation: breathe 14s ease-in-out infinite alternate;
  }
  @keyframes breathe {
    0%   { transform: scale(1) translate(0, 0);     opacity: 0.85; }
    100% { transform: scale(1.06) translate(-2%, 1%); opacity: 1; }
  }

  /* ── Drips ────────────────────────────────────────────────────── */
  .drips {
    height: 75%;
    mix-blend-mode: screen;
    opacity: 0.9;
  }
  .drip-pack { transform-origin: top center; }
  .drip-pack.a { animation: drip-a 22s ease-in infinite; }
  .drip-pack.b { animation: drip-b 30s ease-in infinite; animation-delay: -7s; }
  .drip-pack.c { animation: drip-c 26s ease-in infinite; animation-delay: -13s; }
  @keyframes drip-a {
    0%   { transform: translateY(-6%); opacity: 0.4; }
    20%  { opacity: 1; }
    100% { transform: translateY(8%); opacity: 0.6; }
  }
  @keyframes drip-b {
    0%   { transform: translateY(-3%); opacity: 0.3; }
    25%  { opacity: 0.95; }
    100% { transform: translateY(10%); opacity: 0.5; }
  }
  @keyframes drip-c {
    0%   { transform: translateY(-4%); opacity: 0.45; }
    30%  { opacity: 1; }
    100% { transform: translateY(7%); opacity: 0.55; }
  }

  /* ── Fog drift ────────────────────────────────────────────────── */
  .fog {
    background:
      radial-gradient(ellipse 600px 200px at 30% 60%, rgba(50, 10, 14, 0.45), transparent 70%),
      radial-gradient(ellipse 400px 150px at 70% 70%, rgba(30, 6, 10, 0.4), transparent 70%);
    filter: blur(14px);
  }
  .fog-a { animation: fog-drift-a 38s linear infinite; }
  .fog-b {
    animation: fog-drift-b 52s linear infinite;
    transform: scale(1.4);
    opacity: 0.7;
  }
  @keyframes fog-drift-a {
    0%   { transform: translateX(-20%); }
    100% { transform: translateX(20%); }
  }
  @keyframes fog-drift-b {
    0%   { transform: translateX(25%) scale(1.4); }
    100% { transform: translateX(-25%) scale(1.4); }
  }

  /* ── Glow halo ────────────────────────────────────────────────── */
  .glow {
    background: radial-gradient(ellipse 550px 420px at 50% 50%, rgba(178, 34, 34, 0.22), transparent 70%);
    animation: pulseGlow 5s ease-in-out infinite;
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.85; transform: scale(1); }
    50%      { opacity: 1; transform: scale(1.05); }
  }

  /* ── Sigil rotation ───────────────────────────────────────────── */
  .sigil {
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.55;
  }
  .sigil-spin {
    transform-origin: center;
    animation: spin 80s linear infinite;
  }
  @keyframes spin {
    0%   { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  /* ── Blood rain ───────────────────────────────────────────────── */
  /* Streaks fall top→bottom, slightly tilted as if wind-blown. The
     gradient gives each drop a head + tapered tail — looks far more
     liquid than a flat line at the same cost. GPU-composited via
     transform, no per-frame CPU work. Set `rain={0}` to disable. */
  .rain { mix-blend-mode: screen; }
  .drop {
    position: absolute;
    top: -120px;
    background: linear-gradient(
      to bottom,
      rgba(216, 58, 58, 0) 0%,
      rgba(178, 34, 34, 0.6) 30%,
      rgba(139, 0, 0, 0.95) 70%,
      rgba(80, 0, 0, 1) 100%
    );
    border-radius: 50%;
    transform: rotate(var(--tilt));
    will-change: transform;
    animation-name: rain-fall;
    animation-iteration-count: infinite;
    animation-timing-function: linear;
    pointer-events: none;
  }
  .drop::after {
    /* Splash glow at the bottom of the streak — a small radial pop
       that follows the drop down. */
    content: '';
    position: absolute;
    bottom: -2px; left: 50%;
    width: 8px; height: 8px;
    transform: translateX(-50%);
    border-radius: 50%;
    background: radial-gradient(circle, rgba(216, 58, 58, 0.85), transparent 70%);
    filter: blur(1px);
  }
  @keyframes rain-fall {
    0%   { transform: translateY(0)     rotate(var(--tilt)); }
    100% { transform: translateY(110vh) rotate(var(--tilt)); }
  }

  /* ── Embers ───────────────────────────────────────────────────── */
  /* Container is just a positioning surface; particles do the work. */
  .ember {
    position: absolute;
    bottom: -10px;
    border-radius: 50%;
    opacity: 0;
    will-change: transform, opacity;
    animation-name: rise;
    animation-iteration-count: infinite;
    animation-timing-function: ease-out;
  }
  @keyframes rise {
    0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
    8%   { opacity: 1; }
    50%  { transform: translate(calc(var(--drift) * 0.5), -50vh) scale(1); }
    100% { transform: translate(var(--drift), -110vh) scale(0.4); opacity: 0; }
  }

  /* ── Grain ────────────────────────────────────────────────────── */
  .grain {
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    opacity: 0.16;
    mix-blend-mode: overlay;
  }

  /* ── Top shadow ───────────────────────────────────────────────── */
  .top-shadow {
    height: 200px;
    inset: 0 0 auto 0;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent);
    pointer-events: none;
  }
</style>
