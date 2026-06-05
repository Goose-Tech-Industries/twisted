<script lang="ts">
  import { onMount } from 'svelte'
  import { oghams, type Ogham } from '$stores/oghams.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  let editingSlot = $state<number | null>(null)

  onMount(() => void oghams.load(charId))

  function nameOf(id: number | null) {
    if (id === null) return null
    return oghams.library.find(o => o.id === id) ?? null
  }

  function pickFor(slot: number, ogham: Ogham | null) {
    void oghams.socket(slot, ogham?.id ?? null)
    editingSlot = null
  }
</script>

<div class="oghams">
  <header>
    <h2>Oghams</h2>
    <span class="sub">{oghams.slots.filter(s => s.ogham_id).length} / {oghams.maxSlots} socketed</span>
  </header>

  <section class="slots">
    {#each Array(oghams.maxSlots) as _, i}
      {@const slot = oghams.slots.find(s => s.index === i)}
      {@const ogh = nameOf(slot?.ogham_id ?? null)}
      <button class="slot" class:filled={!!ogh} onclick={() => editingSlot = editingSlot === i ? null : i}>
        {#if ogh}
          <span class="glyph">{ogh.glyph}</span>
          <span class="name">{ogh.name}</span>
        {:else}
          <span class="empty">Slot {i + 1}</span>
        {/if}
      </button>
    {/each}
  </section>

  {#if editingSlot !== null}
    <section class="picker">
      <h3>Choose an Ogham — Slot {editingSlot + 1}</h3>
      <ul>
        <li>
          <button onclick={() => pickFor(editingSlot!, null)}>(Empty)</button>
        </li>
        {#each oghams.library as o (o.id)}
          <li>
            <button onclick={() => pickFor(editingSlot!, o)}>
              <span class="glyph">{o.glyph}</span>
              <span class="name">{o.name}</span>
              <span class="tier">T{o.tier}</span>
              <span class="desc">{o.description}</span>
            </button>
          </li>
        {/each}
        {#if oghams.library.length === 0}<li class="empty">No oghams discovered.</li>{/if}
      </ul>
    </section>
  {/if}
</div>

<style>
  .oghams { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; }
  header h2 { margin: 0; font-size: 1rem; }
  .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .slots { display: flex; flex-direction: column; gap: 0.375rem; padding: 0.75rem; }
  .slot {
    display: grid; grid-template-columns: auto 1fr; gap: 0.625rem; align-items: center;
    padding: 0.625rem; background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 0.375rem; text-align: left;
  }
  .slot.filled { border-color: var(--accent); }
  .slot .glyph { font-size: 1.5rem; color: var(--accent); }
  .slot .name { font-size: 0.875rem; }
  .slot .empty { color: var(--fg-muted); font-size: 0.8125rem; }
  .picker { padding: 0.5rem 1rem 1rem; }
  .picker h3 { margin: 0 0 0.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--fg-muted); letter-spacing: 0.05em; }
  .picker ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .picker button {
    width: 100%; display: grid; grid-template-columns: auto auto auto 1fr; gap: 0.5rem; align-items: center;
    padding: 0.5rem 0.75rem; text-align: left; font-size: 0.8125rem;
  }
  .picker .glyph { font-size: 1.125rem; color: var(--accent); }
  .picker .tier { color: var(--fg-muted); font-size: 0.75rem; }
  .picker .desc { color: var(--fg-muted); font-size: 0.75rem; }
  .picker .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
