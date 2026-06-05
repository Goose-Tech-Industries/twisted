<script lang="ts">
  import { onMount } from 'svelte'
  import { htc } from '$stores/htc.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  onMount(() => void htc.load(charId))

  function fmtTime(secs: number): string {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }
</script>

<div class="htc">
  <header>
    <h2>Hyperbolic Training</h2>
  </header>

  {#if htc.session}
    {@const s = htc.session}
    <div class="active">
      <p class="big">{fmtTime(s.remaining_secs)}</p>
      <p class="sub">{s.multiplier}× XP / stat gain</p>
      {#if s.tick_xp}<p>+{s.tick_xp} XP per tick</p>{/if}
      <button class="rm" onclick={() => htc.stop()}>End early</button>
    </div>
  {:else if htc.config}
    <div class="tiers">
      {#each htc.config.costs as c}
        <button class="tier" onclick={() => htc.start(c.tier)}>
          <strong>{c.tier}</strong>
          <span>{c.multiplier}× · {fmtTime(c.duration_secs)}</span>
          <span class="cost">💰 {c.gold}g</span>
        </button>
      {/each}
    </div>
  {:else}
    <p class="empty">Training chamber unavailable.</p>
  {/if}
</div>

<style>
  .htc { display: flex; flex-direction: column; height: 100%; min-height: 0; padding: 1rem; gap: 0.75rem; overflow-y: auto; }
  header h2 { margin: 0 0 0.5rem; font-size: 1rem; }
  .active { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 1rem; background: var(--surface-2); border: 1px solid var(--accent); border-radius: 0.5rem; }
  .big { font-size: 2.5rem; color: var(--accent); margin: 0; font-variant-numeric: tabular-nums; font-weight: 700; }
  .sub { color: var(--fg-muted); margin: 0; }
  .rm { color: var(--danger); border-color: rgba(208,72,72,0.4); margin-top: 0.5rem; }
  .tiers { display: flex; flex-direction: column; gap: 0.375rem; }
  .tier { display: grid; grid-template-columns: 1fr 2fr auto; gap: 0.5rem; align-items: center; padding: 0.625rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; text-align: left; font-size: 0.875rem; }
  .tier strong { color: var(--accent); }
  .cost { color: var(--accent); font-weight: 600; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
