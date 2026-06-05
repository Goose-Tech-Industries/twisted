<script lang="ts">
  import { chat, type ChatChannel } from '$stores/chat.svelte'

  interface Props {
    onsend: (channel: ChatChannel, body: string) => void
  }
  let { onsend }: Props = $props()

  let draft = $state('')

  const channels: ChatChannel[] = ['global', 'local', 'party', 'guild', 'whisper', 'system']

  function submit(e: Event) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    onsend(chat.active, body)
    draft = ''
  }
</script>

<div class="chat">
  <header>
    <h2>Chat</h2>
  </header>

  <nav class="tabs">
    {#each channels as c}
      <button class:active={chat.active === c} onclick={() => chat.setActive(c)}>
        {c}
        {#if chat.unread[c] > 0}<span class="badge">{chat.unread[c]}</span>{/if}
      </button>
    {/each}
  </nav>

  <ul class="messages">
    {#each chat.messages as msg (msg.id)}
      <li>
        <span class="from" style:color={msg.fromColor ?? undefined}>{msg.from}</span>
        <span class="body">{msg.body}</span>
      </li>
    {/each}
    {#if chat.messages.length === 0}
      <p class="empty">No messages in #{chat.active} yet.</p>
    {/if}
  </ul>

  <form onsubmit={submit}>
    <input
      type="text"
      bind:value={draft}
      placeholder="Send to #{chat.active}…"
      maxlength="500"
    />
    <button type="submit" disabled={!draft.trim()}>Send</button>
  </form>
</div>

<style>
  .chat { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .tabs {
    display: flex; gap: 0.125rem;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
  }
  .tabs button {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    color: var(--fg-muted);
    position: relative;
  }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }
  .badge {
    background: var(--danger); color: white;
    font-size: 0.625rem; font-weight: 700;
    padding: 0 0.25rem;
    border-radius: 0.625rem;
    margin-left: 0.25rem;
  }

  .messages {
    list-style: none; margin: 0; padding: 0.5rem 1rem;
    flex: 1; overflow-y: auto;
    display: flex; flex-direction: column; gap: 0.25rem;
    font-size: 0.8125rem;
  }
  .messages li { display: flex; gap: 0.375rem; }
  .from { color: var(--accent); font-weight: 600; flex-shrink: 0; }
  .body { color: var(--fg); word-break: break-word; }
  .empty { color: var(--fg-muted); text-align: center; margin: auto 0; }

  form { display: flex; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  form input { flex: 1; }
  form button { font-size: 0.8125rem; }
</style>
