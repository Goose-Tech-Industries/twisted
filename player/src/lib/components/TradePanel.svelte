<script lang="ts">
  import { trade } from '$stores/trade.svelte'

  interface Props {
    onaccept?: () => void
    onlock?: () => void
    oncancel?: () => void
    onsetgold?: (n: number) => void
  }
  let { onaccept, onlock, oncancel, onsetgold }: Props = $props()
</script>

<div class="trade">
  <header><h2>Trade</h2></header>

  {#if !trade.active}
    <p class="empty">No active trade.</p>
  {:else}
    {@const t = trade.active}
    <div class="grid">
      <section class="me">
        <h3>You give</h3>
        <ul class="items">
          {#each t.me.items as e}
            <li>{e.item.icon ?? '📦'} {e.item.name} ×{e.qty}</li>
          {/each}
          {#if t.me.items.length === 0}<li class="empty">drag items here</li>{/if}
        </ul>
        <label>Gold <input type="number" min="0" value={t.me.gold} oninput={(e) => onsetgold?.(Number((e.target as HTMLInputElement).value))} /></label>
        <button class:locked={t.me.locked} onclick={() => onlock?.()}>{t.me.locked ? 'Locked' : 'Lock'}</button>
      </section>

      <section class="them">
        <h3>{t.partnerName} gives</h3>
        <ul class="items">
          {#each t.them.items as e}
            <li>{e.item.icon ?? '📦'} {e.item.name} ×{e.qty}</li>
          {/each}
          {#if t.them.items.length === 0}<li class="empty">they haven't added anything</li>{/if}
        </ul>
        <p>Gold: <strong>{t.them.gold}</strong></p>
        <p class="status">{t.them.locked ? 'Locked' : 'Adjusting…'}</p>
      </section>
    </div>

    <footer>
      <button onclick={oncancel}>Cancel</button>
      <button class="primary" disabled={!t.me.locked || !t.them.locked} onclick={onaccept}>Accept</button>
    </footer>
  {/if}
</div>

<style>
  .trade { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .empty { color: var(--fg-muted); padding: 1.5rem; text-align: center; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; padding: 0.75rem; flex: 1; overflow-y: auto; }
  section { background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.625rem; display: flex; flex-direction: column; gap: 0.375rem; }
  section h3 { margin: 0; font-size: 0.75rem; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .items { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 80px; display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.8125rem; }
  .items .empty { color: var(--fg-muted); padding: 0.5rem 0; text-align: center; }
  label { font-size: 0.75rem; color: var(--fg-muted); }
  label input { width: 100%; }
  button.locked { background: var(--accent); color: #1a1208; }
  .status { font-size: 0.75rem; color: var(--fg-muted); margin: 0; }
  footer { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid var(--border); justify-content: flex-end; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
</style>
