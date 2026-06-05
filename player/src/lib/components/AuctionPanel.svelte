<script lang="ts">
  import { onMount } from 'svelte'
  import { auction } from '$stores/auction.svelte'

  let q = $state('')
  let buying = $state<number | null>(null)

  onMount(() => void auction.load())

  const filtered = $derived(
    q.trim()
      ? auction.listings.filter(l => l.name.toLowerCase().includes(q.toLowerCase()))
      : auction.listings
  )

  async function buy(id: number) {
    buying = id
    try { await auction.buy(id) } finally { buying = null }
  }
</script>

<div class="auction">
  <header>
    <h2>Auction House</h2>
    <input type="search" bind:value={q} placeholder="Search…" />
  </header>

  <ul class="list">
    {#each filtered as l (l.id)}
      <li>
        <span class="icon">{l.icon ?? '📦'}</span>
        <div class="meta">
          <strong>{l.name}</strong>
          <span class="sub">{l.seller_name} · ×{l.qty}</span>
        </div>
        <span class="price">{l.price}g</span>
        <button class="primary" disabled={buying === l.id} onclick={() => buy(l.id)}>
          {buying === l.id ? '…' : 'Buy'}
        </button>
      </li>
    {/each}
    {#if filtered.length === 0}
      <p class="empty">{auction.loading ? 'Loading…' : 'No listings.'}</p>
    {/if}
  </ul>
</div>

<style>
  .auction { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 0.5rem; }
  header h2 { margin: 0; font-size: 1rem; flex: 1; }
  header input { width: 140px; padding: 0.25rem 0.5rem; font-size: 0.8125rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: grid; grid-template-columns: auto 1fr auto auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .icon { font-size: 1.25rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .price { color: var(--accent); font-weight: 600; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
