<script lang="ts">
  import { onMount } from 'svelte'
  import { quests, type Quest } from '$stores/quests.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  let tab = $state<'active' | 'completed' | 'board'>('active')
  let selected = $state<Quest | null>(null)

  onMount(() => { void quests.load(); void quests.loadBoard() })

  const visible = $derived.by(() => {
    if (tab === 'active')    return quests.active
    if (tab === 'completed') return quests.completed
    return quests.board
  })

  function pct(o: { current: number; required: number }) {
    return Math.min(100, Math.round((o.current / Math.max(1, o.required)) * 100))
  }
</script>

<div class="quests">
  <header>
    <h2>Quests</h2>
    {#if quests.tracked}
      <span class="tracked">📍 {quests.tracked.name}</span>
    {/if}
  </header>

  <nav class="tabs">
    <button class:active={tab === 'active'}    onclick={() => (tab = 'active')}>Active</button>
    <button class:active={tab === 'completed'} onclick={() => (tab = 'completed')}>Completed</button>
    <button class:active={tab === 'board'}     onclick={() => (tab = 'board')}>Board</button>
  </nav>

  <ul class="list">
    {#each visible as q (q.id)}
      <li>
        <button class:selected={selected?.id === q.id} onclick={() => (selected = q)}>
          <span class="icon">{q.icon ?? '📜'}</span>
          <span class="name">{q.name}</span>
          {#if q.status === 'completed'}<span class="badge done">✓</span>{/if}
          {#if q.level_required}<span class="lvl">Lv {q.level_required}+</span>{/if}
        </button>
      </li>
    {/each}
    {#if visible.length === 0}
      <p class="empty">{quests.loading ? 'Loading…' : 'No quests in this view.'}</p>
    {/if}
  </ul>

  {#if selected}
    <div class="detail">
      <header>
        <strong>{selected.name}</strong>
        <button class="close" onclick={() => (selected = null)}>×</button>
      </header>
      {#if selected.description}<p class="desc">{selected.description}</p>{/if}

      {#if selected.objectives?.length}
        <div class="objs">
          <p class="lbl">Objectives</p>
          {#each selected.objectives as o (o.key)}
            <div class="obj">
              <div class="obj-line">
                <span>{o.description}</span>
                <span class="count">{o.current}/{o.required}</span>
              </div>
              <div class="bar"><div class="fill" style="width: {pct(o)}%"></div></div>
            </div>
          {/each}
        </div>
      {/if}

      {#if selected.rewards}
        <div class="rewards">
          <p class="lbl">Rewards</p>
          <div class="reward-list">
            {#if selected.rewards.xp}<span>✨ {selected.rewards.xp} XP</span>{/if}
            {#if selected.rewards.gold}<span>💰 {selected.rewards.gold}g</span>{/if}
            {#each selected.rewards.items ?? [] as it}<span>📦 #{it.item_id} ×{it.qty}</span>{/each}
          </div>
        </div>
      {/if}

      <div class="actions">
        {#if selected.status === 'active'}
          <button onclick={() => quests.track(quests.tracked?.id === selected!.id ? null : selected!.id)}>
            {quests.tracked?.id === selected!.id ? 'Untrack' : 'Track'}
          </button>
          <button class="primary" onclick={async () => {
            const r = await quests.complete(charId, selected!.id)
            if (r.success) selected = null
          }}>Turn in</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .quests { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.75rem 1rem; border-bottom: 1px solid var(--border);
  }
  header h2 { margin: 0; font-size: 1rem; }
  .tracked { font-size: 0.75rem; color: var(--accent); }
  .tabs { display: flex; gap: 0.125rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--border); }
  .tabs button {
    flex: 1; padding: 0.375rem; font-size: 0.8125rem;
    background: transparent; border: none; border-radius: 0;
    color: var(--fg-muted); border-bottom: 2px solid transparent;
  }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .list {
    list-style: none; margin: 0; padding: 0.5rem;
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .list button {
    width: 100%; text-align: left;
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 0.5rem 0.75rem; border-radius: 0.375rem;
  }
  .list button.selected { border-color: var(--accent); }
  .list .name { flex: 1; }
  .list .badge.done { color: var(--success); font-weight: 700; }
  .list .lvl { font-size: 0.75rem; color: var(--fg-muted); }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }

  .detail {
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    padding: 0.75rem 1rem;
    display: flex; flex-direction: column; gap: 0.5rem;
    max-height: 60%;
    overflow-y: auto;
  }
  .detail header { padding: 0; border: none; }
  .close {
    background: transparent; border: none;
    padding: 0 0.5rem;
    color: var(--fg-muted);
    font-size: 1.25rem; line-height: 1;
  }
  .close:hover { background: transparent; color: var(--fg); }
  .desc { font-size: 0.8125rem; color: var(--fg-muted); margin: 0; }

  .lbl { font-size: 0.6875rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; margin: 0; }
  .obj { margin-bottom: 0.375rem; }
  .obj-line { display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 0.125rem; }
  .obj .count { color: var(--fg-muted); }
  .bar { height: 4px; background: var(--surface); border-radius: 2px; overflow: hidden; }
  .bar .fill { height: 100%; background: var(--accent); }

  .rewards .reward-list { display: flex; gap: 0.5rem; flex-wrap: wrap; font-size: 0.75rem; }
  .actions { display: flex; gap: 0.5rem; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
</style>
