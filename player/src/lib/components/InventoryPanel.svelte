<script lang="ts">
  import type { Item, Equipment, EquipSlot } from '$stores/inventory.svelte'

  interface Props {
    items: Item[]
    equipment: Equipment
    gold: number
    onuse: (id: number) => void
    onequip: (id: number) => void
  }
  let { items, equipment, gold, onuse, onequip }: Props = $props()

  let selected = $state<Item | null>(null)
  let filter = $state<'all' | string>('all')

  const types = $derived(Array.from(new Set(items.map(i => i.type))))
  const filtered = $derived(filter === 'all' ? items : items.filter(i => i.type === filter))

  const slots: EquipSlot[] = ['weapon', 'offhand', 'helmet', 'chest', 'gloves', 'boots', 'ring1', 'ring2', 'amulet']
</script>

<div class="inventory">
  <header>
    <h2>Inventory</h2>
    <span class="gold">💰 {gold}</span>
  </header>

  <div class="equip">
    {#each slots as slot}
      <div class="slot" title={slot}>
        {#if equipment[slot]}
          <span class="icon">{equipment[slot]?.icon ?? '⚔️'}</span>
        {:else}
          <span class="empty">{slot}</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="filters">
    <button class:active={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
    {#each types as t}
      <button class:active={filter === t} onclick={() => (filter = t)}>{t}</button>
    {/each}
  </div>

  <ul class="items">
    {#each filtered as item (item.inventory_id ?? item.id)}
      <li>
        <button class:selected={selected?.id === item.id} onclick={() => (selected = item)}>
          <span class="icon">{item.icon ?? '📦'}</span>
          <span class="name">{item.name}</span>
          {#if (item.qty ?? 1) > 1}<span class="qty">×{item.qty}</span>{/if}
        </button>
      </li>
    {/each}
    {#if filtered.length === 0}
      <p class="empty-state">Nothing here.</p>
    {/if}
  </ul>

  {#if selected}
    <div class="detail">
      <div class="detail-head">
        <span class="icon big">{selected.icon ?? '📦'}</span>
        <div>
          <strong>{selected.name}</strong>
          <span class="rarity {selected.rarity}">{selected.rarity}</span>
        </div>
      </div>
      {#if selected.description}<p class="desc">{selected.description}</p>{/if}
      <div class="bonuses">
        {#if selected.bonus_atk}<span>+{selected.bonus_atk} ATK</span>{/if}
        {#if selected.bonus_def}<span>+{selected.bonus_def} DEF</span>{/if}
        {#if selected.bonus_hp}<span>+{selected.bonus_hp} HP</span>{/if}
      </div>
      <div class="actions">
        {#if selected.type === 'consumable'}
          <button class="primary" onclick={() => { onuse(selected!.id); selected = null }}>Use</button>
        {:else}
          <button class="primary" onclick={() => { onequip(selected!.id); selected = null }}>Equip</button>
        {/if}
        <button onclick={() => (selected = null)}>Close</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .inventory { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .gold { color: var(--accent); font-weight: 600; }

  .equip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  .slot {
    aspect-ratio: 1;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    font-size: 1.25rem;
  }
  .slot .empty { font-size: 0.625rem; color: #555; text-transform: uppercase; }

  .filters { display: flex; flex-wrap: wrap; gap: 0.25rem; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); }
  .filters button { padding: 0.25rem 0.625rem; font-size: 0.75rem; }
  .filters button.active { background: var(--accent); color: #1a1208; }

  .items {
    list-style: none; margin: 0; padding: 0.5rem;
    overflow-y: auto;
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 0.25rem;
    align-content: flex-start;
  }
  .items button {
    width: 100%;
    aspect-ratio: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.125rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    padding: 0.25rem;
    position: relative;
  }
  .items button.selected { border-color: var(--accent); }
  .items .icon { font-size: 1.5rem; }
  .items .name { font-size: 0.625rem; color: var(--fg-muted); text-align: center; line-clamp: 1; }
  .items .qty { position: absolute; bottom: 2px; right: 4px; font-size: 0.625rem; color: var(--accent); font-weight: 700; }
  .empty-state { color: var(--fg-muted); padding: 1rem; text-align: center; grid-column: 1 / -1; }

  .detail {
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    padding: 0.75rem 1rem;
  }
  .detail-head { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.5rem; }
  .detail-head .big { font-size: 2rem; }
  .detail-head strong { display: block; }
  .rarity { font-size: 0.6875rem; text-transform: uppercase; }
  .rarity.common { color: #aaa; }
  .rarity.uncommon { color: #4caf75; }
  .rarity.rare { color: #5b8def; }
  .rarity.epic { color: #a07cd9; }
  .rarity.legendary { color: var(--accent); }
  .desc { font-size: 0.8125rem; color: var(--fg-muted); margin: 0 0 0.5rem; }
  .bonuses { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.625rem; font-size: 0.75rem; color: var(--success); }
  .actions { display: flex; gap: 0.5rem; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
</style>
