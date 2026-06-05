<script lang="ts">
  import { quests } from '$stores/quests.svelte'
  import { statusEffects } from '$stores/status_effects.svelte'
  import { companion } from '$stores/companion.svelte'
  import { debug } from '$stores/debug.svelte'

  interface Props {
    collapsed: boolean
  }
  let { collapsed }: Props = $props()

  const tracked = $derived(quests.tracked ?? quests.active[0] ?? null)
  const objective = $derived(tracked?.objectives?.find(o => !o.completed) ?? tracked?.objectives?.[0] ?? null)

  debug.register('Quest Tracker', 'stub')
  debug.register('Active Statuses', 'stub')
  debug.register('Companion', 'stub')
  // Track first-arrival of each store. 'real' once any payload lands;
  // 'empty' if the page has been alive >2s and the store is still bare
  // (server replied with an explicit empty list).
  let bootedAt = Date.now()
  $effect(() => {
    if (quests.active.length > 0) debug.update('Quest Tracker', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Quest Tracker', 'empty')
  })
  $effect(() => {
    if (statusEffects.active.length > 0) debug.update('Active Statuses', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Active Statuses', 'empty')
  })
  $effect(() => {
    if (companion.active) debug.update('Companion', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Companion', 'empty')
  })
</script>

<aside class="left-rail" class:collapsed>
  {#if collapsed}
    <div class="strip">
      <span class="strip-icon" title="Quest Tracker">📜</span>
      <span class="strip-icon" title="Statuses">✨</span>
      <span class="strip-icon" title="Companion">🐾</span>
    </div>
  {:else}
    <section class="card">
      <h4>📜 Quest Tracker</h4>
      {#if tracked}
        <div class="quest">
          <div class="quest-name">{tracked.name}</div>
          {#if objective}
            <div class="quest-obj">
              <span class="obj-text">{objective.description}</span>
              <span class="obj-progress">{objective.current}/{objective.required}</span>
            </div>
          {/if}
          <div class="waypoint">📍 Waypoint set</div>
        </div>
      {:else}
        <p class="empty">No active quests. Find an NPC with a 🪙 marker.</p>
      {/if}
    </section>

    <section class="card">
      <h4>✨ Active Statuses</h4>
      {#if statusEffects.active.length > 0}
        <div class="chips">
          {#each statusEffects.active as st (st.id)}
            <span class="chip" class:debuff={st.type === 'debuff'} class:buff={st.type !== 'debuff'}>
              <span class="chip-icon">{st.icon ?? '✦'}</span>
              <span class="chip-name">{st.name}</span>
            </span>
          {/each}
        </div>
      {:else}
        <p class="empty">Steady. Nothing afflicting you.</p>
      {/if}
    </section>

    <section class="card">
      <h4>🐾 Companion</h4>
      {#if companion.active}
        {@const c = companion.active}
        {@const hpPct = Math.max(0, Math.min(100, (Number(c.current_hp ?? c.max_hp ?? 0) / Math.max(1, Number(c.max_hp ?? 1))) * 100))}
        <div class="comp">
          <div class="comp-portrait">{c.icon ?? '🐺'}</div>
          <div class="comp-info">
            <div class="comp-name">{c.name}</div>
            <div class="bar comp-bar"><div class="fill" style="width: {hpPct}%"></div></div>
            <div class="comp-hp">{c.current_hp ?? '?'} / {c.max_hp ?? '?'} HP</div>
          </div>
        </div>
      {:else}
        <p class="empty">No companion bonded. Visit a Shrine to bind one.</p>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .left-rail {
    grid-area: left;
    width: 220px;
    height: 100%;
    background: #0d0d11;
    border-right: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
    transition: width 180ms ease;
  }
  .left-rail.collapsed {
    width: 32px;
    padding: 0.5rem 0;
    align-items: center;
  }
  .strip { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
  .strip-icon { font-size: 1.1rem; cursor: default; opacity: 0.7; }
  .strip-icon:hover { opacity: 1; }

  .card {
    background: #15151a;
    border: 1px solid #2a2a2a;
    border-radius: 0.25rem;
    padding: 0.5rem 0.625rem;
  }
  h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c9a14a;
    margin: 0 0 0.375rem;
    font-weight: 700;
  }

  .quest-name { font-weight: 600; font-size: 0.8125rem; color: #ece6e3; margin-bottom: 0.25rem; }
  .quest-obj {
    display: flex; justify-content: space-between; gap: 0.5rem;
    font-size: 0.7rem; color: #a39e8b;
  }
  .obj-progress { color: #c9a14a; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .waypoint { font-size: 0.65rem; color: #6a665b; margin-top: 0.375rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    border: 1px solid #c9a14a;
    background: rgba(201, 161, 74, 0.08);
    color: #c9a14a;
  }
  .chip.debuff { border-color: #c93838; color: #c93838; background: rgba(201, 56, 56, 0.08); }

  .comp { display: flex; align-items: center; gap: 0.5rem; }
  .comp-portrait {
    width: 36px; height: 36px;
    background: #050505;
    border: 1px solid #2a2a2a;
    border-radius: 0.25rem;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
  }
  .comp-info { flex: 1; min-width: 0; }
  .comp-name { font-size: 0.75rem; font-weight: 600; color: #ece6e3; }
  .bar.comp-bar {
    height: 6px;
    background: #050505;
    border-radius: 999px;
    overflow: hidden;
    margin: 0.25rem 0;
  }
  .bar .fill {
    height: 100%;
    background: linear-gradient(90deg, #7a1c1c, #c93838);
    transition: width 240ms ease;
  }
  .comp-hp { font-size: 0.65rem; color: #6a665b; }

  .empty {
    font-size: 0.7rem;
    color: #6a665b;
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }
</style>
