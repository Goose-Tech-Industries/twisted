<script lang="ts">
  import { onMount } from 'svelte'
  import { companion, type Companion } from '$stores/companion.svelte'

  interface Props {
    charId: number
    onsummon?: (companionId: number) => void
    ondismiss?: (companionId: number) => void
    ontactic?: (companionId: number, tactic: Companion['tactic']) => void
  }
  let { charId, onsummon, ondismiss, ontactic }: Props = $props()

  const tactics: Companion['tactic'][] = ['aggressive', 'defensive', 'support', 'passive']

  onMount(() => void companion.load(charId))
</script>

<div class="companions">
  <header><h2>Companions</h2></header>

  <ul class="list">
    {#each companion.companions as c (c.id)}
      <li class:active={c.active}>
        <span class="icon">{c.icon ?? '🐾'}</span>
        <div class="meta">
          <strong>{c.name}</strong>
          <span class="sub">Lv {c.level}{c.species ? ` · ${c.species}` : ''}</span>
          <div class="bar"><div class="fill" style="width: {(c.current_hp / Math.max(1, c.max_hp)) * 100}%"></div></div>
        </div>
        <div class="actions">
          {#if c.active}
            <select value={c.tactic ?? 'defensive'} onchange={(e) => ontactic?.(c.id, (e.target as HTMLSelectElement).value as Companion['tactic'])}>
              {#each tactics as t}<option value={t}>{t}</option>{/each}
            </select>
            <button class="rm" onclick={() => ondismiss?.(c.id)}>Dismiss</button>
          {:else}
            <button class="primary" onclick={() => onsummon?.(c.id)}>Summon</button>
          {/if}
        </div>
      </li>
    {/each}
    {#if companion.companions.length === 0}<p class="empty">No companions bonded yet.</p>{/if}
  </ul>
</div>

<style>
  .companions { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.375rem; }
  .list li { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .list li.active { border-color: var(--accent); }
  .icon { font-size: 1.5rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .bar { height: 4px; background: var(--surface); border-radius: 2px; overflow: hidden; margin-top: 0.25rem; }
  .bar .fill { height: 100%; background: var(--success); }
  .actions { display: flex; flex-direction: column; gap: 0.25rem; align-items: stretch; }
  .actions select, .actions button { font-size: 0.75rem; padding: 0.25rem 0.5rem; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
  .rm { color: var(--danger); }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
