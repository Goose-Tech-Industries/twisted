<script lang="ts">
  import { auth } from '$stores/auth.svelte'
  import { character } from '$stores/character.svelte'
  import { world } from '$stores/world.svelte'
  import { debug } from '$stores/debug.svelte'
  import { goto } from '$app/navigation'

  interface Props {
    onToggleLeft: () => void
    onToggleRight: () => void
    leftCollapsed: boolean
    rightCollapsed: boolean
  }
  let { onToggleLeft, onToggleRight, leftCollapsed, rightCollapsed }: Props = $props()

  const mapName = $derived(world.map?.name ?? 'The Wilds')
  const weather = $derived(world.weather === 'clear' ? '☀' : world.weather === 'rain' ? '🌧' : '⛅')

  // Time is locally generated (no backend clock yet) — STUB.
  // Weather flips REAL if the server pushes a non-default value via
  // world.setWeather; otherwise it sticks at the default 'clear' STUB.
  debug.register('Time', 'stub')
  debug.register('Weather', 'stub')
  let bootedAt = Date.now()
  $effect(() => {
    // Weather is REAL only if it was explicitly set by the server. The
    // store's default is 'clear', so if the server pushed 'clear' too we
    // can't tell. Conservative: anything other than the default = REAL.
    if (world.weather && world.weather !== 'clear') debug.update('Weather', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Weather', 'empty')
  })

  let now = $state(new Date())
  $effect(() => {
    const t = setInterval(() => { now = new Date() }, 30_000)
    return () => clearInterval(t)
  })
  const time = $derived(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
</script>

<header class="play-header">
  <div class="left">
    <button class="rail-toggle" onclick={onToggleLeft} aria-label="Toggle left rail" title="Toggle quests/statuses panel">
      {leftCollapsed ? '▶' : '◀'}
    </button>
    <span class="logo">⚜ TWISTED ENGINE</span>
  </div>

  <div class="center">
    <span class="map-name">{mapName}</span>
  </div>

  <div class="right">
    <span class="weather">{weather} {time}</span>
    {#if character.active}
      <span class="who">
        {character.active.name} · Lv {character.active.level}
        {#if character.active.subclass_name}
          <span class="subclass-pill" title={character.active.subclass_title || character.active.subclass_name}>⚡ {character.active.subclass_name}</span>
        {/if}
      </span>
    {/if}
    <button class="signout" type="button" onclick={async () => { await auth.logout(); goto('/login', { replaceState: true }) }}>
      Sign out
    </button>
    <button class="rail-toggle" onclick={onToggleRight} aria-label="Toggle right rail" title="Toggle minimap/chat panel">
      {rightCollapsed ? '◀' : '▶'}
    </button>
  </div>
</header>

<style>
  .play-header {
    grid-area: header;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.5rem;
    height: 36px;
    padding: 0 0.5rem;
    background: linear-gradient(180deg, #0a0a0a, #15151a);
    border-bottom: 1px solid #2a2a2a;
    box-shadow: 0 2px 8px rgba(0,0,0,0.6), inset 0 -1px 0 rgba(201, 161, 74, 0.06);
    font-size: 0.75rem;
    user-select: none;
  }
  .left, .right { display: flex; align-items: center; gap: 0.5rem; }
  .right { justify-content: flex-end; }
  .center { justify-self: center; }
  .logo {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    color: #c9a14a;
    letter-spacing: 0.18em;
    text-shadow: 0 0 8px rgba(201, 161, 74, 0.25);
    white-space: nowrap;
  }
  .map-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.95rem;
    color: #ece6e3;
    letter-spacing: 0.06em;
    text-shadow: 0 0 12px rgba(201, 161, 74, 0.18);
  }
  .weather { color: #a39e8b; font-variant-numeric: tabular-nums; }
  .who {
    color: #c9a14a;
    font-weight: 600;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
  }
  .subclass-pill {
    background: rgba(201, 161, 74, 0.15);
    border: 1px solid rgba(201, 161, 74, 0.4);
    color: #ffd700;
    font-size: 0.65rem;
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
    font-weight: normal;
  }
  .rail-toggle {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #a39e8b;
    width: 24px; height: 24px;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1;
    padding: 0;
  }
  .rail-toggle:hover { color: #c9a14a; border-color: #c9a14a; }
  .signout {
    padding: 0.125rem 0.625rem;
    font-size: 0.7rem;
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #a39e8b;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .signout:hover { color: #c93838; border-color: #c93838; }

  @media (max-width: 720px) {
    .center { display: none; }
    .who { display: none; }
  }
</style>
