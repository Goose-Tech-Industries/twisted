<script lang="ts">
  import { onMount } from 'svelte'
  import { leaderboard, type LeaderboardType } from '$stores/leaderboard.svelte'

  const types: Array<{ id: LeaderboardType; label: string }> = [
    { id: 'level', label: 'Level' },
    { id: 'gold', label: 'Gold' },
    { id: 'pvp', label: 'PvP' },
    { id: 'achievements', label: 'Achievements' },
    { id: 'kills', label: 'Kills' }
  ]

  onMount(() => void leaderboard.load('level'))
</script>

<div class="leaderboard">
  <header><h2>Leaderboard</h2></header>

  <nav class="tabs">
    {#each types as t}
      <button class:active={leaderboard.active === t.id} onclick={() => leaderboard.load(t.id)}>{t.label}</button>
    {/each}
  </nav>

  <ol class="list">
    {#each leaderboard.rows as r (r.charId)}
      <li>
        <span class="rank">#{r.rank}</span>
        <span class="name">{r.name}</span>
        {#if r.guild_name}<span class="guild">⟨{r.guild_name}⟩</span>{/if}
        <span class="lvl">Lv {r.level}</span>
        <span class="val">{r.value.toLocaleString()}</span>
      </li>
    {/each}
    {#if leaderboard.rows.length === 0}<p class="empty">Loading…</p>{/if}
  </ol>
</div>

<style>
  .leaderboard { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .tabs { display: flex; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--border); overflow-x: auto; gap: 0.125rem; }
  .tabs button { padding: 0.375rem 0.75rem; font-size: 0.75rem; background: transparent; border: none; border-radius: 0; color: var(--fg-muted); border-bottom: 2px solid transparent; flex-shrink: 0; }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.125rem; }
  .list li {
    display: grid; grid-template-columns: 2.5rem 1fr auto auto auto; gap: 0.5rem; align-items: center;
    padding: 0.375rem 0.625rem; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.375rem; font-size: 0.8125rem;
  }
  .rank { color: var(--accent); font-weight: 700; }
  .name { font-weight: 600; }
  .guild { color: var(--fg-muted); font-size: 0.75rem; }
  .lvl { color: var(--fg-muted); font-size: 0.75rem; }
  .val { color: var(--accent); font-weight: 600; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
