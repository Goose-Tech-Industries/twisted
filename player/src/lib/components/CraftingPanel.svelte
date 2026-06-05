<script lang="ts">
  import { onMount } from 'svelte'
  import { crafting } from '$stores/crafting.svelte'

  let q = $state('')

  onMount(() => void crafting.load())

  const filtered = $derived(
    q.trim()
      ? crafting.recipes.filter(r => r.name.toLowerCase().includes(q.toLowerCase()))
      : crafting.recipes
  )
</script>

<div class="crafting">
  <header>
    <h2>Crafting</h2>
    <input type="search" bind:value={q} placeholder="Search…" />
  </header>

  <ul class="list">
    {#each filtered as r (r.id)}
      <li class:undisc={r.discovered === false}>
        <span class="icon">{r.result_icon ?? '🔨'}</span>
        <div class="meta">
          <strong>{r.discovered === false ? '???' : r.name}</strong>
          <span class="sub">
            {#each r.ingredients as ing, i}
              {ing.qty}× {ing.name}{i < r.ingredients.length - 1 ? ' + ' : ''}
            {/each}
          </span>
        </div>
        <button
          class="primary"
          disabled={r.discovered === false || crafting.crafting === r.id}
          onclick={() => crafting.craft(r.id, 1)}
        >
          {crafting.crafting === r.id ? '…' : 'Craft'}
        </button>
      </li>
    {/each}
    {#if filtered.length === 0}<p class="empty">No recipes match.</p>{/if}
  </ul>
</div>

<style>
  .crafting { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; gap: 0.5rem; align-items: center; }
  header h2 { margin: 0; font-size: 1rem; flex: 1; }
  header input { width: 140px; padding: 0.25rem 0.5rem; font-size: 0.8125rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: grid; grid-template-columns: auto 1fr auto; gap: 0.5rem; align-items: center; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .list li.undisc { opacity: 0.5; }
  .icon { font-size: 1.25rem; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
</style>
