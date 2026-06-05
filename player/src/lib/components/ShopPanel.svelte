<script lang="ts">
  import { shop, type ShopState } from '$stores/shop.svelte'

  let sellQty = $state<Record<number, number>>({})
  let tab = $state<'buy' | 'sell'>('buy')

  function buy(itemId: number) {
    const qty = sellQty[itemId] ?? 1
    shop.buy(itemId, qty)
  }

  function sell(itemId: number) {
    const qty = sellQty[itemId] ?? 1
    shop.sell(itemId, qty)
  }
</script>

<div class="shop">
  <header>
    <h2>{shop.open?.name ?? 'Shop'}</h2>
    {#if shop.open}
      <span class="gold">{shop.open.gold}g</span>
      <button class="close" onclick={() => shop.close()}>×</button>
    {/if}
  </header>

  {#if !shop.open}
    <p class="empty">Talk to a shopkeeper to open their shop.</p>
  {:else}
    <div class="tabs">
      <button class:active={tab === 'buy'} onclick={() => tab = 'buy'}>Buy</button>
      <button class:active={tab === 'sell'} onclick={() => tab = 'sell'}>Sell</button>
    </div>

    {#if tab === 'buy'}
      <ul class="list">
        {#each shop.open.items as it (it.supply_id)}
          <li>
            <span class="icon">{it.icon ?? '📦'}</span>
            <div class="meta">
              <strong>{it.name}</strong>
              <span class="sub">{it.rarity}{it.stock > 0 ? ` · ${it.stock} in stock` : it.stock === -1 ? ' · unlimited' : ''}</span>
            </div>
            <span class="price">{it.buy_price}g</span>
            <input
              type="number" min="1" max={it.stock > 0 ? it.stock : 99}
              value={sellQty[it.supply_id] ?? 1}
              oninput={(e) => sellQty = { ...sellQty, [it.supply_id]: Math.max(1, Number((e.target as HTMLInputElement).value)) }}
            />
            <button class="primary" disabled={it.stock === 0} onclick={() => buy(it.item_id)}>Buy</button>
          </li>
        {/each}
        {#if shop.open.items.length === 0}<p class="empty">Nothing for sale.</p>{/if}
      </ul>
    {:else}
      <ul class="list">
        {#each shop.open.playerInventory as it (it.item_id)}
          <li>
            <span class="icon">{it.icon ?? '📦'}</span>
            <div class="meta">
              <strong>{it.name}</strong>
              <span class="sub">{it.rarity} · {it.quantity} owned</span>
            </div>
            <span class="price">{it.sell_price}g</span>
            <input
              type="number" min="1" max={it.quantity}
              value={sellQty[it.item_id] ?? 1}
              oninput={(e) => sellQty = { ...sellQty, [it.item_id]: Math.max(1, Math.min(it.quantity, Number((e.target as HTMLInputElement).value))) }}
            />
            <button class="primary" onclick={() => sell(it.item_id)}>Sell</button>
          </li>
        {/each}
        {#if shop.open.playerInventory.length === 0}<p class="empty">Nothing to sell.</p>{/if}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .shop { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  header h2 { margin: 0; font-size: 1rem; flex: 1; }
  .gold { color: var(--accent); font-weight: 600; font-size: 0.8125rem; }
  .close { background: transparent; border: none; padding: 0 0.5rem; font-size: 1.25rem; line-height: 1; color: var(--fg-muted); cursor: pointer; }
  .empty { color: var(--fg-muted); padding: 1.5rem; text-align: center; }
  .tabs { display: flex; border-bottom: 1px solid var(--border); }
  .tabs button { flex: 1; padding: 0.5rem; background: transparent; border: none; color: var(--fg-muted); cursor: pointer; font-size: 0.8125rem; }
  .tabs button.active { color: var(--accent); border-bottom: 2px solid var(--accent); }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: grid; grid-template-columns: auto 1fr auto 4rem auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .icon { font-size: 1.25rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .price { color: var(--accent); font-weight: 600; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; padding: 0.25rem 0.625rem; font-size: 0.8125rem; cursor: pointer; }
  .primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .msg { font-size: 0.75rem; color: var(--fg-muted); padding: 0 1rem 0.5rem; margin: 0; }
</style>
