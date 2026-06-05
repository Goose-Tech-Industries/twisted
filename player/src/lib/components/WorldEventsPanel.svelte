<script lang="ts">
  import { onMount } from 'svelte'
  import { worldEvents, type WorldEvent } from '$stores/world_events.svelte'

  let selected = $state<WorldEvent | null>(null)

  onMount(() => void worldEvents.loadActive())

  type Phase = { name?: string }
  type Rewards = { xp?: number; gold?: number; items?: Array<{ item_id: number; qty: number }> } | null
  type Mods = Record<string, unknown> | null

  function parseSafe<T>(s: string | undefined, fallback: T): T {
    if (!s) return fallback
    try { return JSON.parse(s) as T } catch { return fallback }
  }

  function timeLeft(iso: string) {
    const ms = new Date(iso).getTime() - Date.now()
    if (ms <= 0) return 'ended'
    const m = Math.floor(ms / 60000)
    if (m < 60) return `${m}m`
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }
</script>

<div class="we">
  <header><h2>World Events</h2></header>

  {#if !selected}
    <ul class="list">
      {#each worldEvents.active as ev (ev.id)}
        <li>
          <button onclick={() => (selected = ev)}>
            <span class="icon">{ev.icon ?? '🌑'}</span>
            <div class="meta">
              <strong>{ev.name}</strong>
              <span class="sub">{timeLeft(ev.expires_at)} left · {ev.participant_count ?? 0} joined</span>
            </div>
            {#if ev.am_participating}<span class="joined">✓</span>{/if}
          </button>
        </li>
      {/each}
      {#if worldEvents.active.length === 0}<p class="empty">No active world events.</p>{/if}
    </ul>
  {:else}
    {@const phases = parseSafe<Phase[]>(selected.phases_json, [])}
    {@const rewards = parseSafe<Rewards>(selected.rewards_json, null)}
    {@const mods = parseSafe<Mods>(selected.stat_modifiers, null)}
    <article class="detail">
      <header>
        <strong>{selected.icon ?? '🌑'} {selected.name}</strong>
        <button class="close" onclick={() => (selected = null)}>×</button>
      </header>

      {#if selected.lore_text}<p class="lore">{selected.lore_text}</p>{/if}
      <p class="status">Ends in {timeLeft(selected.expires_at)} · {selected.participant_count ?? 0} joined</p>

      {#if phases.length > 1}
        <p class="lbl">Phases</p>
        <ol class="phases">
          {#each phases as p, i (i)}
            <li class:done={i < (selected.current_phase ?? 0)} class:active={i === (selected.current_phase ?? 0)}>
              {p?.name ?? `Phase ${i + 1}`}
            </li>
          {/each}
        </ol>
      {/if}

      {#if mods}
        <p class="lbl">Modifiers</p>
        <div class="mods">
          {#each Object.entries(mods) as [k, v]}
            <span><em>{k.replace(/_/g, ' ')}</em>: <strong>{String(v)}</strong></span>
          {/each}
        </div>
      {/if}

      {#if rewards}
        <p class="lbl">Rewards</p>
        <div class="rewards">
          {#if rewards.xp}<span>✨ {rewards.xp} XP</span>{/if}
          {#if rewards.gold}<span>💰 {rewards.gold}g</span>{/if}
          {#each rewards.items ?? [] as it}<span>📦 #{it.item_id} ×{it.qty}</span>{/each}
        </div>
      {/if}

      {#if !selected.am_participating}
        <button class="primary" onclick={() => worldEvents.join(selected!.id)}>Join</button>
      {:else}
        <p class="msg">You are participating.</p>
      {/if}
    </article>
  {/if}
</div>

<style>
  .we { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  header h2 { margin: 0; font-size: 1rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.375rem; }
  .list li button { width: 100%; display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; padding: 0.625rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; text-align: left; }
  .icon { font-size: 1.5rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .joined { color: var(--success); font-weight: 700; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }

  .detail { padding: 0.75rem 1rem; flex: 1; overflow-y: auto; }
  .detail header { padding: 0; border: none; }
  .close { background: transparent; border: none; padding: 0 0.5rem; font-size: 1.25rem; line-height: 1; }
  .lore { font-size: 0.8125rem; color: var(--fg-muted); font-style: italic; }
  .status { font-size: 0.75rem; color: var(--fg-muted); margin: 0.25rem 0 0.75rem; }
  .lbl { font-size: 0.6875rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; margin: 0.5rem 0 0.25rem; }
  .phases { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.8125rem; }
  .phases li { padding: 0.25rem 0.5rem; border-left: 2px solid var(--border); color: var(--fg-muted); }
  .phases li.done { color: var(--success); border-left-color: var(--success); }
  .phases li.active { color: var(--accent); border-left-color: var(--accent); font-weight: 600; }
  .mods, .rewards { display: flex; gap: 0.375rem; flex-wrap: wrap; font-size: 0.75rem; }
  .mods em { color: var(--fg-muted); font-style: normal; }
  .msg { font-size: 0.8125rem; color: var(--success); margin: 0.5rem 0 0; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; margin-top: 0.75rem; }
</style>
