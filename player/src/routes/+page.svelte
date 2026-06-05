<script lang="ts">
  import { goto } from '$app/navigation'
  import { auth } from '$stores/auth.svelte'
  import { branding } from '$stores/branding.svelte'
  import { settings } from '$stores/settings.svelte'
  import GothicAtmosphere from '$components/GothicAtmosphere.svelte'
  import AmbientWeather from '$components/AmbientWeather.svelte'
  import HoodedFigure from '$components/HoodedFigure.svelte'

  function scrollToLanding() {
    const el = document.getElementById('landing')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Audio is gated behind a user gesture (browser autoplay policy).
  // The first interaction — clicking Enter, toggling sound on, or
  // the auto-redirect timer firing — flips this true.
  let audioOn = $state(false)

  // Detect a privacy browser advertising reduce-motion against the
  // user's actual preference (Brave Shields, Firefox RFP). When this
  // is true and the user hasn't already opted into forceMotion, show
  // a one-tap "wake the splash" button.
  let prmDetected = $state(false)
  $effect(() => {
    if (typeof window === 'undefined') return
    prmDetected = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // Auto-redirect after the configured hold (set in /sauce/branding,
  // default 0 = require an explicit click). When >0, kick off a
  // setTimeout that bounces to /play or /login.
  $effect(() => {
    if (auth.loading) return
    if (!branding.loaded) return
    const ms = branding.values.splash_auto_redirect_ms
    if (ms <= 0) return
    const dest = auth.isAuthed ? '/play' : '/login'
    const t = setTimeout(() => goto(dest, { replaceState: true }), ms)
    return () => clearTimeout(t)
  })

  function enterNow() {
    audioOn = true   // unlock audio engine before navigating
    goto(auth.isAuthed ? '/play' : '/login', { replaceState: true })
  }

  function toggleAudio() {
    audioOn = !audioOn
  }

  const atmosphere = $derived(branding.values.splash_atmosphere)
  const showEmbers = $derived(
    branding.values.splash_show_embers && atmosphere !== 'none'
  )
</script>

<section
  class="splash"
  style="
    --splash-bg-top: {branding.values.splash_bg_color_top};
    --splash-bg-mid: {branding.values.splash_bg_color_mid};
    --splash-accent: {branding.values.splash_accent_color};
  "
>
  {#if atmosphere === 'gothic'}
    <!-- Fixed-position atmosphere so the rain + drips + figure stay
         painted behind the page as the user scrolls into the landing
         section below the fold. -->
    <div class="bg-fixed" aria-hidden="true">
      <GothicAtmosphere
        embers={showEmbers ? branding.values.splash_embers_count : 0}
        rain={showEmbers ? 90 : 0}
        intensity={1}
      />
      <!-- The lone figure stands far back at the horizon — partly veiled
           by the existing fog layer, two faint red eyes the only thing
           that catches you on a second look. -->
      <HoodedFigure x="64%" y="74%" eyeColor={branding.values.splash_accent_color} scale={0.95} />
    </div>
    <AmbientWeather enabled={audioOn} thunderInterval={22} rainGain={0.18} />
  {:else if atmosphere === 'minimal'}
    <div class="bg-fixed" aria-hidden="true"><div class="minimal-bg"></div></div>
  {/if}

  <!-- Corner toggles: sound + (when reduce-motion is detected) a
       motion-override button. Both are off by default. -->
  <div class="corner-toggles">
    {#if prmDetected && !settings.prefs.forceMotion}
      <button
        type="button"
        class="motion-toggle"
        onclick={() => settings.set('forceMotion', true)}
        title="Your browser is requesting reduced motion. Click to play full splash animations."
      >
        ✨ Wake the storm
      </button>
    {/if}
    <button
      type="button"
      class="audio-toggle"
      onclick={toggleAudio}
      aria-label={audioOn ? 'Mute ambient' : 'Enable ambient sound'}
      title={audioOn ? 'Mute ambient' : 'Enable ambient sound'}
    >
      {audioOn ? '🔊' : '🔇'}
    </button>
  </div>

  <div class="brand-stack">
    {#if branding.values.splash_logo_url}
      <img class="logo" src={branding.values.splash_logo_url} alt="" />
    {:else}
      <div class="sigil" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="120" height="120">
          <defs>
            <radialGradient id="sigilGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color={branding.values.splash_accent_color} stop-opacity="0.5" />
              <stop offset="100%" stop-color={branding.values.splash_accent_color} stop-opacity="0" />
            </radialGradient>
          </defs>
          <circle cx="60" cy="60" r="55" fill="url(#sigilGlow)" />
          <path d="M60 18 L96 42 L96 78 L60 102 L24 78 L24 42 Z"
                fill="none" stroke={branding.values.splash_accent_color} stroke-width="2" stroke-linejoin="round" />
          <path d="M60 28 L60 92 M30 46 L90 74 M90 46 L30 74"
                stroke={branding.values.splash_accent_color} stroke-width="1.5" stroke-linecap="round" />
          <circle cx="60" cy="60" r="6" fill={branding.values.splash_accent_color} />
        </svg>
      </div>
    {/if}

    <h1 class="title">{branding.values.splash_title}</h1>
    {#if branding.values.splash_tagline}
      <p class="tagline">{branding.values.splash_tagline}</p>
    {/if}

    <button class="enter" type="button" onclick={enterNow}>
      {auth.isAuthed ? 'Continue' : 'Enter'}
    </button>

    {#if branding.values.splash_auto_redirect_ms > 0}
      <div class="loader" aria-hidden="true">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    {:else}
      <p class="hint">Click to enter</p>
    {/if}

    <!-- "Learn more" lives inside the brand-stack, centered with
         everything else, so users who don't look at the bottom edge
         still see it. Bouncing chevron pulls the eye downward. -->
    <button class="learn-more" type="button" onclick={scrollToLanding}>
      Learn more
      <span class="chev" aria-hidden="true">▾</span>
    </button>
  </div>
</section>

<!-- ── Below-the-fold landing ───────────────────────────────────── -->
<section id="landing" class="landing">
  <div class="landing-inner">

    <!-- Pitch -->
    <div class="pitch">
      <h2>A no-code creator platform meets dark Celtic fantasy MMO.</h2>
      <p>
        Forge your own RPG with whatever rules you dream — races, classes, abilities,
        maps, AI, dialogues, battle modes — and run it live, real-time, with your friends.
      </p>
    </div>

    <!-- Three pillars -->
    <div class="pillars">
      <article class="pillar">
        <span class="icon">🛠</span>
        <h3>Creation Suite</h3>
        <p>
          Design every system without writing code. AdminSauce ships with 17+ live editors
          covering combat rules, dialogue trees, scripts, world maps, items, NPCs, and more.
        </p>
      </article>
      <article class="pillar">
        <span class="icon">⚔</span>
        <h3>Live Battles</h3>
        <p>
          Real-time tactical combat with limb targeting, knockouts, RP flavor, line-of-sight,
          status effects, and 191 effect handlers. Toggle any rule on or off per ruleset.
        </p>
      </article>
      <article class="pillar">
        <span class="icon">🌍</span>
        <h3>Your World</h3>
        <p>
          Single-player, parties, raids, PvP arenas, scheduled tournaments, world events,
          DM campaigns. Run hosted or self-host the engine — your saga, your rules.
        </p>
      </article>
    </div>

    <!-- Status -->
    <div class="status">
      <span class="dot"></span>
      <strong>Alpha — playable, built every day.</strong>
      <span class="muted">Phoenix &middot; Svelte 5 &middot; Pixi v8</span>
    </div>

    <!-- CTAs -->
    <div class="ctas">
      <button class="primary" type="button" onclick={enterNow}>
        {auth.isAuthed ? 'Return to your saga' : 'Enter the realm'}
      </button>
      <a class="secondary" href="https://discord.gg/" target="_blank" rel="noopener noreferrer">
        💬 Join the Discord
      </a>
      <a class="ghost" href="https://github.com/" target="_blank" rel="noopener noreferrer">
        ⌥ GitHub
      </a>
    </div>

    <footer class="foot">
      <span>{branding.values.splash_title} · 2026</span>
      <span class="dot-sep">·</span>
      <span>Tales from beneath the cairns</span>
    </footer>
  </div>
</section>

<style>
  /* The splash hero is the first viewport; the landing scrolls below.
     The atmosphere is wrapped in a fixed-positioned container so it
     stays painted behind the entire page as the user scrolls. */
  .bg-fixed {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: radial-gradient(ellipse at center, var(--splash-bg-top, #110608) 0%, var(--splash-bg-mid, #050204) 70%, #000 100%);
  }

  .splash {
    position: relative;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    z-index: 1;
  }

  .minimal-bg {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 800px 500px at 50% 0%, rgba(255, 255, 255, 0.04), transparent 70%),
      radial-gradient(ellipse 600px 400px at 50% 100%, rgba(255, 255, 255, 0.02), transparent 70%);
  }

  .brand-stack {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.875rem;
    padding: 0 1.5rem;
    text-align: center;
  }

  .logo {
    max-height: 140px;
    max-width: 280px;
    filter: drop-shadow(0 0 24px var(--splash-accent));
  }

  .sigil {
    filter: drop-shadow(0 0 22px var(--splash-accent));
    animation: pulse 3.6s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1);   opacity: 1; }
    50%      { transform: scale(1.04); opacity: 0.92; }
  }

  .title {
    font-family: 'Cinzel', Georgia, serif;
    font-size: clamp(1.8rem, 4vw, 3rem);
    color: #ece6e3;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0;
    text-shadow:
      0 0 14px var(--splash-accent),
      0 0 30px var(--splash-accent),
      0 2px 0 #000;
  }

  .tagline {
    color: var(--splash-accent);
    font-style: italic;
    letter-spacing: 0.14em;
    font-size: 0.875rem;
    margin: 0;
    opacity: 0.92;
    text-shadow: 0 0 10px var(--splash-accent);
  }

  .enter {
    margin-top: 0.75rem;
    padding: 0.7rem 2.4rem;
    border: 1px solid var(--splash-accent);
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--splash-accent) 80%, white 0%),
      color-mix(in srgb, var(--splash-accent) 60%, black 30%));
    color: #fff;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 20px color-mix(in srgb, var(--splash-accent) 40%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.12);
    cursor: pointer;
    transition: all 160ms ease;
  }
  .enter:hover {
    transform: translateY(-1px);
    box-shadow:
      0 0 30px color-mix(in srgb, var(--splash-accent) 60%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
  }
  .enter:active { transform: translateY(0); }

  .loader { display: flex; gap: 0.5rem; margin-top: 0.25rem; }
  .loader .dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--splash-accent);
    box-shadow: 0 0 8px var(--splash-accent);
    animation: bob 1.2s infinite ease-in-out;
    opacity: 0.6;
  }
  .loader .dot:nth-child(2) { animation-delay: 0.15s; }
  .loader .dot:nth-child(3) { animation-delay: 0.30s; }
  @keyframes bob {
    0%, 100% { opacity: 0.25; transform: translateY(0); }
    50%      { opacity: 0.9;  transform: translateY(-3px); }
  }

  .hint {
    margin: 0.25rem 0 0;
    font-size: 0.6875rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--splash-accent);
    opacity: 0.6;
    animation: hint-pulse 2.4s ease-in-out infinite;
  }
  @keyframes hint-pulse {
    0%, 100% { opacity: 0.4; }
    50%      { opacity: 0.9; }
  }

  .corner-toggles {
    position: absolute;
    top: 1rem; right: 1rem;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .audio-toggle, .motion-toggle {
    padding: 0;
    border: 1px solid var(--splash-accent);
    background: rgba(0, 0, 0, 0.5);
    color: var(--splash-accent);
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    transition: all 160ms ease;
    font-family: inherit;
  }
  .audio-toggle {
    width: 40px; height: 40px;
    border-radius: 50%;
    font-size: 1.1rem;
  }
  .motion-toggle {
    height: 40px;
    padding: 0 0.875rem;
    border-radius: 20px;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    box-shadow: 0 0 16px color-mix(in srgb, var(--splash-accent) 30%, transparent);
  }
  .audio-toggle:hover, .motion-toggle:hover {
    background: rgba(0, 0, 0, 0.75);
    box-shadow: 0 0 18px var(--splash-accent);
  }

  /* ── Learn-more pill ────────────────────────────────────────────
     Lives inside the brand-stack so it sits in the center of the
     composition — exactly where the user is already looking. Style:
     parchment-white pill with a translucent dark fill and a red border,
     bouncing red chevron at the right. Reads against any rain density. */
  .learn-more {
    margin-top: 1.25rem;
    padding: 0.5rem 1.25rem 0.5rem 1.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(6px);
    border: 1px solid color-mix(in srgb, var(--splash-accent) 55%, transparent);
    border-radius: 999px;
    color: #ece6e3;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    text-shadow:
      0 0 1px #000,
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 14px rgba(178, 34, 34, 0.45);
    cursor: pointer;
    transition: all 200ms ease;
  }
  .learn-more:hover {
    background: rgba(0, 0, 0, 0.65);
    border-color: var(--splash-accent);
    transform: translateY(-1px);
    box-shadow: 0 0 22px color-mix(in srgb, var(--splash-accent) 45%, transparent);
  }
  .learn-more .chev {
    color: var(--splash-accent);
    font-size: 1rem;
    line-height: 1;
    text-shadow: 0 0 10px var(--splash-accent);
    animation: chev-bob 2s ease-in-out infinite;
  }
  @keyframes chev-bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(3px); }
  }

  /* ── Below-the-fold landing ────────────────────────────────────── */
  .landing {
    position: relative;
    min-height: 100vh;
    padding: 6rem 1.5rem 4rem;
    /* The atmosphere stays painted behind via its own fixed positioning,
       but a translucent veil makes the text legible without losing the
       mood. */
    background: linear-gradient(180deg, rgba(5, 2, 4, 0.85), rgba(0, 0, 0, 0.95) 20%);
    color: var(--fg, #ece6e3);
  }
  .landing-inner {
    max-width: 1080px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .pitch {
    text-align: center;
    max-width: 760px;
    margin: 0 auto;
  }
  .pitch h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: clamp(1.4rem, 3vw, 2.2rem);
    margin: 0 0 1rem;
    color: #ece6e3;
    letter-spacing: 0.04em;
    line-height: 1.3;
    text-shadow: 0 0 14px rgba(178, 34, 34, 0.25);
  }
  .pitch p {
    font-size: 1rem;
    color: var(--fg-muted, #a99a92);
    line-height: 1.7;
    margin: 0;
  }

  .pillars {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }
  .pillar {
    background: linear-gradient(180deg, rgba(20, 8, 10, 0.7), rgba(8, 4, 5, 0.7));
    border: 1px solid var(--border-strong, #4a1a1c);
    border-radius: 0.5rem;
    padding: 1.5rem;
    backdrop-filter: blur(6px);
    transition: transform 240ms ease, border-color 240ms ease;
  }
  .pillar:hover {
    transform: translateY(-3px);
    border-color: var(--splash-accent);
  }
  .pillar .icon {
    display: inline-block;
    font-size: 1.6rem;
    margin-bottom: 0.5rem;
    filter: drop-shadow(0 0 8px var(--splash-accent));
  }
  .pillar h3 {
    font-family: 'Cinzel', Georgia, serif;
    color: var(--splash-accent);
    margin: 0 0 0.5rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: 0.95rem;
  }
  .pillar p {
    font-size: 0.875rem;
    color: var(--fg-muted, #a99a92);
    line-height: 1.6;
    margin: 0;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--border, #2a1416);
    border-radius: 999px;
    max-width: 540px;
    margin: 0 auto;
    font-size: 0.8125rem;
  }
  .status .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--splash-accent);
    box-shadow: 0 0 8px var(--splash-accent);
    animation: status-pulse 2s ease-in-out infinite;
  }
  @keyframes status-pulse {
    0%, 100% { opacity: 0.5; transform: scale(1); }
    50%      { opacity: 1;   transform: scale(1.2); }
  }
  .status strong { color: var(--fg, #ece6e3); font-weight: 600; }
  .status .muted { color: var(--fg-dim, #6a4a40); }

  .ctas {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  .ctas .primary,
  .ctas .secondary,
  .ctas .ghost {
    padding: 0.7rem 1.5rem;
    border-radius: 0.25rem;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-size: 0.8125rem;
    cursor: pointer;
    text-decoration: none;
    transition: all 160ms ease;
  }
  .ctas .primary {
    background: linear-gradient(180deg,
      color-mix(in srgb, var(--splash-accent) 80%, white 0%),
      color-mix(in srgb, var(--splash-accent) 60%, black 30%));
    color: #fff;
    border: 1px solid var(--splash-accent);
    box-shadow: 0 0 16px color-mix(in srgb, var(--splash-accent) 35%, transparent);
  }
  .ctas .primary:hover {
    box-shadow: 0 0 24px color-mix(in srgb, var(--splash-accent) 60%, transparent);
    transform: translateY(-1px);
  }
  .ctas .secondary {
    background: rgba(0, 0, 0, 0.4);
    color: var(--splash-accent);
    border: 1px solid var(--splash-accent);
  }
  .ctas .secondary:hover {
    background: rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 12px var(--splash-accent);
  }
  .ctas .ghost {
    background: transparent;
    color: var(--fg-muted, #a99a92);
    border: 1px solid var(--border-strong, #4a1a1c);
  }
  .ctas .ghost:hover {
    color: var(--fg, #ece6e3);
    border-color: var(--fg-muted, #a99a92);
  }

  .foot {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 1rem;
    padding-top: 2rem;
    border-top: 1px solid var(--border, #2a1416);
    color: var(--fg-dim, #6a4a40);
    font-size: 0.6875rem;
    letter-spacing: 0.08em;
  }
  .foot .dot-sep { opacity: 0.5; }

  /* Smooth scroll for the chevron jump. */
  :global(html) { scroll-behavior: smooth; }
</style>
