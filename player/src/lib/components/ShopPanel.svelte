<script lang="ts">
  import { shop } from '$stores/shop.svelte'

  let buyQty = $state<Record<number, number>>({})
  let msg = $state<string | null>(null)

  async function buy(itemId: number) {
    const qty = buyQty[itemId] ?? 1
    const r = await shop.buy(itemId, qty)
    msg = r.success ? 'Purchased.' : (r.message ?? 'Failed.')
  }
</script>

<div class="shop">
  <header>
    <h2>{shop.open?.name ?? 'Shop'}</h2>
    {#if shop.open}<button class="close" onclick={() => shop.close()}>×</button>{/if}
  </header>

  {#if !shop.open}
    <p class="empty">Talk to a shopkeeper to open their shop.</p>
  {:else}
    <ul class="list">
      {#each shop.open.inventory as it (it.id)}
        <li>
          <span class="icon">{it.icon ?? '📦'}</span>
          <div class="meta">
            <strong>{it.name}</strong>
            <span class="sub">{it.rarity}{it.stock !== undefined ? ` · ${it.stock} in stock` : ''}</span>
          </div>
          <span class="price">{it.shop_price}g</span>
          <input
            type="number" min="1" max={it.stock ?? 99}
            value={buyQty[it.id] ?? 1}
            oninput={(e) => buyQty = { ...buyQty, [it.id]: Math.max(1, Number((e.target as HTMLInputElement).value)) }}
          />
          <button class="primary" onclick={() => buy(it.id)}>Buy</button>
        </li>
      {/each}
      {#if shop.open.inventory.length === 0}<p class="empty">Sold out.</p>{/if}
    </ul>
    {#if msg}<p class="msg">{msg}</p>{/if}
  {/if}
</div>

<style>
  .shop { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
  header h2 { margin: 0; font-size: 1rem; }
  .close { background: transparent; border: none; padding: 0 0.5rem; font-size: 1.25rem; line-height: 1; }
  .empty { color: var(--fg-muted); padding: 1.5rem; text-align: center; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: grid; grid-template-columns: auto 1fr auto 4rem auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .icon { font-size: 1.25rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .price { color: var(--accent); font-weight: 600; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; padding: 0.25rem 0.625rem; font-size: 0.8125rem; }
  .msg { font-size: 0.75rem; color: var(--fg-muted); padding: 0 1rem 0.5rem; margin: 0; }
</style>
