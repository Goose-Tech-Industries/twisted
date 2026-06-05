<script lang="ts">
  import { onMount } from 'svelte'
  import { lfp, type LfpListing } from '$stores/lfp.svelte'

  interface Props {
    oninvite?: (charId: number, name: string) => void
  }
  let { oninvite }: Props = $props()

  let role = $state<LfpListing['role']>('any')
  let note = $state('')

  onMount(() => void lfp.load())

  const roles: LfpListing['role'][] = ['any', 'tank', 'healer', 'dps', 'support']
</script>

<div class="lfp">
  <header><h2>Looking for Party</h2></header>

  <ul class="list">
    {#each lfp.listings as l (l.id)}
      <li>
        <div class="meta">
          <strong>{l.name}</strong>
          <span class="role">{l.role}</span>
          <span class="lvl">Lv {l.level}</span>
        </div>
        {#if l.note}<p class="note">{l.note}</p>{/if}
        {#if oninvite}
          <button onclick={() => oninvite?.(l.charId, l.name)}>Invite</button>
        {/if}
      </li>
    {/each}
    {#if lfp.listings.length === 0}<p class="empty">No-one is LFP right now.</p>{/if}
  </ul>

  <form class="post" onsubmit={(e) => { e.preventDefault(); void lfp.list(role, note); note = '' }}>
    <select bind:value={role}>
      {#each roles as r}<option value={r}>{r}</option>{/each}
    </select>
    <input bind:value={note} placeholder="What are you looking for?" maxlength="120" />
    <button type="submit" class="primary">Post</button>
    <button type="button" onclick={() => lfp.delist()}>Stop</button>
  </form>
</div>

<style>
  .lfp { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.375rem; }
  .list li { padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; }
  .meta { display: flex; gap: 0.5rem; align-items: baseline; }
  .meta strong { flex: 1; font-size: 0.875rem; }
  .role { color: var(--accent); font-size: 0.75rem; text-transform: uppercase; }
  .lvl { color: var(--fg-muted); font-size: 0.75rem; }
  .note { margin: 0.25rem 0 0.5rem; color: var(--fg-muted); font-size: 0.75rem; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
  .post { display: grid; grid-template-columns: auto 1fr auto auto; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
</style>
