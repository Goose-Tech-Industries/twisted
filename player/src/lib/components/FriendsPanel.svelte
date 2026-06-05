<script lang="ts">
  import { onMount } from 'svelte'
  import { social } from '$stores/social.svelte'

  interface Props {
    onwhisper?: (name: string) => void
  }
  let { onwhisper }: Props = $props()

  let addName = $state('')
  let busy = $state(false)
  let msg = $state<string | null>(null)

  onMount(() => void social.loadFriends())

  async function add(e: Event) {
    e.preventDefault()
    if (!addName.trim()) return
    busy = true
    msg = null
    try {
      const r = await social.addFriend(addName.trim())
      msg = r.success ? `Sent friend request to ${addName}` : (r.message ?? 'Failed')
      if (r.success) addName = ''
    } finally { busy = false }
  }
</script>

<div class="friends">
  <header><h2>Friends</h2></header>

  <ul class="list">
    {#each social.friends as f (f.charId)}
      <li class:online={f.online}>
        <span class="dot" class:on={f.online}></span>
        <div class="meta">
          <strong>{f.name}</strong>
          <span class="sub">Lv {f.level}{f.status ? ` · ${f.status}` : ''}</span>
        </div>
        <div class="actions">
          {#if onwhisper}<button onclick={() => onwhisper?.(f.name)} title="Whisper">💬</button>{/if}
          <button class="rm" onclick={() => social.removeFriend(f.charId)} title="Remove">×</button>
        </div>
      </li>
    {/each}
    {#if social.friends.length === 0 && !social.loading}
      <p class="empty">No friends yet.</p>
    {/if}
  </ul>

  <form class="add" onsubmit={add}>
    <input type="text" bind:value={addName} placeholder="Add by character name…" maxlength="20" />
    <button type="submit" disabled={busy || !addName.trim()}>Add</button>
  </form>
  {#if msg}<p class="msg">{msg}</p>{/if}
</div>

<style>
  .friends { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fg-muted); }
  .dot.on { background: var(--success); }
  .meta { flex: 1; min-width: 0; }
  .meta strong { display: block; font-size: 0.875rem; }
  .meta .sub { font-size: 0.75rem; color: var(--fg-muted); }
  .actions { display: flex; gap: 0.25rem; }
  .actions button { padding: 0.25rem 0.5rem; font-size: 0.8125rem; }
  .actions .rm { color: var(--danger); }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
  .add { display: flex; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  .add input { flex: 1; }
  .msg { font-size: 0.75rem; color: var(--fg-muted); padding: 0 1rem 0.5rem; margin: 0; }
</style>
