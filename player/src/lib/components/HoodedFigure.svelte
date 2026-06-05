<script lang="ts">
  // HoodedFigure — a static, near-monochrome silhouette of a cloaked
  // figure standing in the distance. Pure SVG, no animation cost beyond
  // a single 6-second "breathing" rise/fall. Two pinpricks of red where
  // the eyes would be — visible but never the focal point.
  //
  // Sized to render small (~140px tall) and intended to sit toward the
  // bottom of the splash, slightly off-center, partly veiled by the
  // existing fog layer.

  interface Props {
    /** Horizontal placement: '0%' = far left, '100%' = far right. */
    x?: string
    /** Vertical placement: '0%' = top, '100%' = bottom. */
    y?: string
    /** Override the eye-glow color. Defaults to the splash accent. */
    eyeColor?: string
    /** Subtle scale; the default is small enough to read as "distant". */
    scale?: number
  }
  let { x = '62%', y = '78%', eyeColor = 'currentColor', scale = 1 }: Props = $props()
</script>

<div class="figure-wrap" style="left: {x}; top: {y}; --eye: {eyeColor}; transform: translate(-50%, -50%) scale({scale});">
  <svg viewBox="0 0 100 200" width="80" height="160" aria-hidden="true">
    <defs>
      <!-- Cloak gradient: near-black at the top (under the hood),
           fading to a faint reflected red at the hem. Sells "this thing
           absorbs light, except where the storm strikes it." -->
      <linearGradient id="cloak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stop-color="#000" stop-opacity="1" />
        <stop offset="60%" stop-color="#0a0204" stop-opacity="0.95" />
        <stop offset="100%" stop-color="#1a0608" stop-opacity="0.85" />
      </linearGradient>
      <radialGradient id="eyeGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%"  stop-color="var(--eye)" stop-opacity="1" />
        <stop offset="60%" stop-color="var(--eye)" stop-opacity="0.4" />
        <stop offset="100%" stop-color="var(--eye)" stop-opacity="0" />
      </radialGradient>
    </defs>

    <!-- Cloak silhouette: hood narrowing to head, shoulders, robe widening to base. -->
    <path
      d="M50 6
         C 36 6, 28 18, 28 32
         L 28 50
         C 22 52, 18 58, 16 66
         L 12 130
         L 8 196
         L 92 196
         L 88 130
         L 84 66
         C 82 58, 78 52, 72 50
         L 72 32
         C 72 18, 64 6, 50 6 Z"
      fill="url(#cloak)"
    />

    <!-- Inner hood shadow — gives the head a deeper void. -->
    <path
      d="M36 30 C 36 22, 42 18, 50 18 C 58 18, 64 22, 64 30 L 64 46 L 36 46 Z"
      fill="#000"
      opacity="0.75"
    />

    <!-- Eye glows — two small red pinpricks. -->
    <circle cx="44" cy="36" r="6" fill="url(#eyeGlow)" />
    <circle cx="56" cy="36" r="6" fill="url(#eyeGlow)" />
    <circle cx="44" cy="36" r="1.4" fill="var(--eye)" />
    <circle cx="56" cy="36" r="1.4" fill="var(--eye)" />

    <!-- Faint base shadow on the ground. -->
    <ellipse cx="50" cy="198" rx="38" ry="3" fill="#000" opacity="0.55" />
  </svg>
</div>

<style>
  .figure-wrap {
    position: absolute;
    pointer-events: none;
    /* Sits at the .atmos layer — never above brand-stack/CTA. */
    z-index: 0;
    /* Very faint atmospheric blur — distant figure shouldn't be sharp.
       Negligible cost; the SVG is tiny. */
    filter: drop-shadow(0 0 16px rgba(0, 0, 0, 0.7))
            drop-shadow(0 0 6px rgba(178, 34, 34, 0.18));
    color: #b22222;
    /* Slow breathing. Pause via prefers-reduced-motion is fine — the
       figure reads as a still silhouette either way. */
    animation: breathe 6s ease-in-out infinite;
    transform-origin: center;
  }
  @keyframes breathe {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.92; }
    50%      { transform: translate(-50%, -49%) scale(1.012); opacity: 1; }
  }
</style>
