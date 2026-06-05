<script lang="ts">
  import { page } from '$app/stores'
  import { debug, type WiringStatus } from '$stores/debug.svelte'

  // Render only when ?debug=1 is set on the URL. Cheap escape hatch —
  // no auth gate; production users who guess the param will see a
  // wiring matrix, which is harmless intel.
  const visible = $derived($page.url.searchParams.has('debug') && !debug.dismissed)

  function icon(s: WiringStatus): string {
    switch (s) {
      case 'real': return '✅'
      case 'empty': return '○'
      case 'stub': return '⚠'
      case 'unknown': return '?'
    }
  }
  function colorClass(s: WiringStatus): string {
    switch (s) {
      case 'real': return 'real'
      case 'empty': return 'empty'
      case 'stub': return 'stub'
      case 'unknown': return 'unknown'
    }
  }
  function label(s: WiringStatus): string {
    switch (s) {
      case 'real': return 'REAL'
      case 'empty': return 'EMPTY'
      case 'stub': return 'STUB'
      case 'unknown': return 'UNKNOWN'
    }
  }
</script>

{#if visible}
  <aside class="debug-overlay" role="status" aria-label="Wiring debug overlay">
    <header>
      <span class="title">⚜ WIRING</span>
      <button type="button" class="close" onclick={() => debug.dismiss()} aria-label="Dismiss debug overlay">✕</button>
    </header>

    {#if debug.entries.length === 0}
      <div class="empty-row">No panels registered yet.</div>
    {:else}
      <ul>
        {#each debug.entries as e (e.name)}
          <li class={colorClass(e.status)}>
            <span class="ico">{icon(e.status)}</span>
            <span class="name">{e.name}</span>
            <span class="status">{label(e.status)}</span>
          </li>
        {/each}
      </ul>
    {/if}

    <footer>?debug=1 · close clears until refresh</footer>
  </aside>
{/if}

<style>
  .debug-overlay {
    position: fixed;
    top: 8px;
    right: 8px;
    z-index: 9999;
    width: 260px;
    background: rgba(0, 0, 0, 0.88);
    border: 1px solid #c93838;
    border-radius: 0.25rem;
    color: #c9a14a;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 0.7rem;
    line-height: 1.4;
    pointer-events: auto;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid #2a2a2a;
  }
  .title {
    font-family: 'Cinzel', Georgia, serif;
    color: #c9a14a;
    letter-spacing: 0.16em;
    font-weight: 700;
  }
  .close {
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #a39e8b;
    width: 20px; height: 20px;
    border-radius: 0.125rem;
    cursor: pointer;
    font-size: 0.7rem;
    line-height: 1;
    padding: 0;
  }
  .close:hover { color: #c93838; border-color: #c93838; }

  ul { list-style: none; margin: 0; padding: 0.25rem 0; }
  li {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    align-items: center;
    gap: 0.375rem;
    padding: 0.125rem 0.5rem;
    border-bottom: 1px dashed #1a1a1a;
  }
  li:last-child { border-bottom: none; }
  .ico { text-align: center; }
  .name { color: #ece6e3; font-family: 'JetBrains Mono', ui-monospace, monospace; }
  .status { font-weight: 700; font-size: 0.65rem; letter-spacing: 0.06em; }

  li.real .status, li.real .ico { color: #4caf75; }
  li.empty .status, li.empty .ico { color: #a39e8b; }
  li.stub .status, li.stub .ico { color: #c93838; }
  li.unknown .status, li.unknown .ico { color: #c9a14a; }

  .empty-row {
    padding: 0.5rem;
    text-align: center;
    color: #6a665b;
    font-style: italic;
  }
  footer {
    padding: 0.25rem 0.5rem;
    border-top: 1px solid #2a2a2a;
    color: #6a665b;
    font-size: 0.6rem;
    text-align: center;
  }
</style>
