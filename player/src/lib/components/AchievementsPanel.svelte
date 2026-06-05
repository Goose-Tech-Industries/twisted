<script lang="ts">
  import { onMount } from 'svelte'
  import { achievements } from '$stores/achievements.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  let filter = $state<'all' | 'unlocked' | 'locked'>('all')

  onMount(async () => {
    await Promise.all([achievements.loadAll(), achievements.loadCharacter(charId)])
  })

  const unlockedIds = $derived(new Set(achievements.unlocked.map(a => a.id)))

  const visible = $derived.by(() => {
    if (filter === 'unlocked') return achievements.unlocked
    if (filter === 'locked') return achievements.all.filter(a => !unlockedIds.has(a.id))
    return achievements.all
  })
</script>

<div class="achievements">
  <header>
    <h2>Achievements</h2>
    <span class="pct">{achievements.unlocked.length} / {achievements.all.length} ({achievements.pct}%)</span>
  </header>

  <nav class="tabs">
    <button class:active={filter === 'all'}      onclick={() => (filter = 'all')}>All</button>
    <button class:active={filter === 'unlocked'} onclick={() => (filter = 'unlocked')}>Unlocked</button>
    <button class:active={filter === 'locked'}   onclick={() => (filter = 'locked')}>Locked</button>
  </nav>

  <ul class="list">
    {#each visible as a (a.id)}
      {@const isUnlocked = unlockedIds.has(a.id)}
      <li class:unlocked={isUnlocked}>
        <span class="icon">{a.icon ?? (isUnlocked ? '🏆' : '🔒')}</span>
        <div class="meta">
          <strong>{a.name}</strong>
          <span class="desc">{a.description}</span>
          {#if a.progress !== undefined && !isUnlocked}
            <div class="bar"><div class="fill" style="width: {Math.min(100, a.progress * 100)}%"></div></div>
          {/if}
        </div>
      </li>
    {/each}
    {#if visible.length === 0}<p class="empty">Nothing here yet.</p>{/if}
  </ul>
</div>

<style>
  .achievements { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; }
  header h2 { margin: 0; font-size: 1rem; }
  .pct { font-size: 0.75rem; color: var(--accent); }
  .tabs { display: flex; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--border); }
  .tabs button { flex: 1; padding: 0.375rem; font-size: 0.8125rem; background: transparent; border: none; border-radius: 0; color: var(--fg-muted); border-bottom: 2px solid transparent; }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: flex; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; opacity: 0.6; }
  .list li.unlocked { opacity: 1; border-color: var(--accent); }
  .icon { font-size: 1.5rem; flex-shrink: 0; }
  .meta { flex: 1; min-width: 0; }
  .meta strong { display: block; font-size: 0.875rem; }
  .desc { font-size: 0.75rem; color: var(--fg-muted); }
  .bar { height: 3px; background: var(--surface); border-radius: 2px; overflow: hidden; margin-top: 0.25rem; }
  .bar .fill { height: 100%; background: var(--accent); }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
