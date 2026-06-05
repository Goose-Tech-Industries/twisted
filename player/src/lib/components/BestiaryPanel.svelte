<script lang="ts">
  import { onMount } from 'svelte'
  import { bestiary, type BestiaryEntry } from '$stores/bestiary.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  let selected = $state<BestiaryEntry | null>(null)

  onMount(() => void bestiary.load(charId))
</script>

<div class="bestiary">
  <header>
    <h2>Bestiary</h2>
    <span class="count">{bestiary.discoveredCount} / {bestiary.entries.length}</span>
  </header>

  <ul class="grid">
    {#each bestiary.entries as e (e.id)}
      <li>
        <button class="entry" class:undisc={!e.discovered} onclick={() => (selected = e)}>
          <span class="icon">{e.discovered ? (e.icon ?? '👹') : '?'}</span>
          <span class="name">{e.discovered ? e.name : '???'}</span>
          {#if e.defeated_count}<span class="count">×{e.defeated_count}</span>{/if}
        </button>
      </li>
    {/each}
    {#if bestiary.entries.length === 0}<p class="empty">Defeat enemies to fill your bestiary.</p>{/if}
  </ul>

  {#if selected && selected.discovered}
    <article class="detail">
      <header>
        <strong>{selected.icon ?? '👹'} {selected.name}</strong>
        <button class="close" onclick={() => (selected = null)}>×</button>
      </header>
      {#if selected.description}<p class="desc">{selected.description}</p>{/if}
      {#if selected.habitat}<p class="meta">Habitat: <strong>{selected.habitat}</strong></p>{/if}
      {#if selected.weakness?.length}<p class="meta">Weak to: {selected.weakness.join(', ')}</p>{/if}
      {#if selected.resistances?.length}<p class="meta">Resists: {selected.resistances.join(', ')}</p>{/if}
    </article>
  {/if}
</div>

<style>
  .bestiary { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; }
  header h2 { margin: 0; font-size: 1rem; }
  .count { color: var(--accent); font-size: 0.75rem; }
  .grid { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 0.25rem; }
  .entry {
    width: 100%; aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.25rem; padding: 0.25rem;
    position: relative;
  }
  .entry.undisc { opacity: 0.5; }
  .entry .icon { font-size: 1.5rem; }
  .entry .name { font-size: 0.625rem; color: var(--fg-muted); text-align: center; }
  .entry .count { position: absolute; bottom: 2px; right: 4px; font-size: 0.625rem; color: var(--accent); font-weight: 700; }
  .empty { color: var(--fg-muted); padding: 1rem; grid-column: 1 / -1; text-align: center; }
  .detail { border-top: 1px solid var(--border); padding: 0.75rem 1rem; background: var(--surface-2); }
  .detail header { padding: 0; border: none; }
  .close { background: transparent; border: none; padding: 0 0.5rem; font-size: 1.25rem; line-height: 1; }
  .desc { font-size: 0.875rem; }
  .meta { font-size: 0.75rem; color: var(--fg-muted); margin: 0.125rem 0; }
</style>
