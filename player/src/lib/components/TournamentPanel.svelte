<script lang="ts">
  import { onMount } from 'svelte'
  import { tournament } from '$stores/tournament.svelte'

  interface Props {
    onqueue?: (format: string) => void
    onleavequeue?: () => void
  }
  let { onqueue, onleavequeue }: Props = $props()

  const formats = [
    { id: '1v1_duel',     label: '1v1 Duel'      },
    { id: '2v2_arena',    label: '2v2 Arena'     },
    { id: '3v3_arena',    label: '3v3 Arena'     },
    { id: 'horde',        label: 'Horde Survival' },
    { id: 'free_for_all', label: 'Free-for-All'  }
  ]

  onMount(() => void tournament.load())

  function fmtTime(s: string) {
    return new Date(s).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }
</script>

<div class="tournament">
  <header><h2>Battle</h2></header>

  <section>
    <h3>Quick match</h3>
    <div class="formats">
      {#each formats as f}
        <button
          class:active={tournament.queued === f.id}
          onclick={() => tournament.queued === f.id ? onleavequeue?.() : onqueue?.(f.id)}
        >
          <strong>{f.label}</strong>
          {#if tournament.queued === f.id}<span class="status">In queue · {tournament.queueWait}s</span>{/if}
        </button>
      {/each}
    </div>
  </section>

  <section>
    <h3>Tournaments</h3>
    <ul class="list">
      {#each tournament.list as t (t.id)}
        <li>
          <div class="meta">
            <strong>{t.name}</strong>
            <span class="format">{t.format}</span>
          </div>
          <div class="sub">
            <span>{fmtTime(t.starts_at)}</span>
            <span>{t.participants ?? 0}/{t.max_participants ?? '?'}</span>
            <span class="status {t.status}">{t.status}</span>
          </div>
          {#if t.prize_pool}<span class="prize">🏆 {t.prize_pool}</span>{/if}
        </li>
      {/each}
      {#if tournament.list.length === 0}<p class="empty">No scheduled tournaments.</p>{/if}
    </ul>
  </section>
</div>

<style>
  .tournament { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  section { padding: 0.75rem 1rem; }
  section h3 { margin: 0 0 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; }
  .formats { display: grid; grid-template-columns: 1fr 1fr; gap: 0.375rem; }
  .formats button { display: flex; flex-direction: column; align-items: flex-start; padding: 0.625rem; text-align: left; }
  .formats button.active { background: var(--accent); color: #1a1208; }
  .formats .status { font-size: 0.6875rem; font-weight: normal; }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
  .list li { padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; }
  .meta { display: flex; gap: 0.5rem; align-items: baseline; }
  .meta strong { flex: 1; }
  .format { color: var(--accent); font-size: 0.75rem; }
  .sub { display: flex; gap: 0.625rem; font-size: 0.75rem; color: var(--fg-muted); margin-top: 0.25rem; }
  .status.upcoming { color: var(--fg-muted); }
  .status.open { color: var(--success); }
  .status.running { color: var(--accent); }
  .status.finished { color: var(--fg-muted); }
  .prize { display: block; margin-top: 0.25rem; color: var(--accent); }
  .empty { color: var(--fg-muted); padding: 0.5rem 0; text-align: center; margin: 0; }
</style>
