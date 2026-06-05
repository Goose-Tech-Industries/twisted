<script lang="ts">
  import { onMount } from 'svelte'
  import { mail } from '$stores/mail.svelte'

  let composing = $state(false)
  let to = $state(''); let subject = $state(''); let body = $state('')
  let sendMsg = $state<string | null>(null)

  onMount(() => void mail.load())

  async function send(e: Event) {
    e.preventDefault()
    const r = await mail.send(to.trim(), subject.trim(), body.trim())
    sendMsg = r.success ? 'Sent.' : (r.message ?? 'Failed.')
    if (r.success) {
      to = subject = body = ''
      composing = false
      void mail.load()
    }
  }
</script>

<div class="mail">
  <header>
    <h2>Mail {#if mail.unread > 0}<span class="badge">{mail.unread}</span>{/if}</h2>
    <button class="compose" onclick={() => (composing = !composing)}>
      {composing ? 'Cancel' : '✉ Compose'}
    </button>
  </header>

  {#if composing}
    <form class="compose-form" onsubmit={send}>
      <label><span>To</span><input bind:value={to} required maxlength="20" /></label>
      <label><span>Subject</span><input bind:value={subject} required maxlength="64" /></label>
      <label><span>Body</span><textarea bind:value={body} rows="5" maxlength="2000" required></textarea></label>
      {#if sendMsg}<p class="msg">{sendMsg}</p>{/if}
      <button class="primary" type="submit">Send</button>
    </form>
  {:else if mail.opened}
    <article class="open">
      <header>
        <strong>{mail.opened.subject}</strong>
        <button class="close" onclick={() => mail.close()}>×</button>
      </header>
      <p class="from">From <strong>{mail.opened.sender_name}</strong> · {new Date(mail.opened.sent_at).toLocaleString()}</p>
      <p class="body">{mail.opened.body}</p>
      {#if mail.opened.attached_gold}<p class="atch">💰 {mail.opened.attached_gold}g</p>{/if}
      {#if mail.opened.attached_items?.length}
        <p class="atch">
          Items:
          {#each mail.opened.attached_items as it}<span>📦 #{it.item_id} ×{it.qty}</span>{/each}
        </p>
      {/if}
      <div class="actions">
        <button class="rm" onclick={() => mail.deleteMessage(mail.opened!.id)}>Delete</button>
      </div>
    </article>
  {:else}
    <ul class="list">
      {#each mail.mail as m (m.id)}
        <li class:unread={!m.read}>
          <button onclick={() => mail.open(m.id)}>
            <span class="from">{m.sender_name}</span>
            <span class="subj">{m.subject}</span>
            <span class="ts">{new Date(m.sent_at).toLocaleDateString()}</span>
          </button>
        </li>
      {/each}
      {#if mail.mail.length === 0}<p class="empty">Inbox empty.</p>{/if}
    </ul>
  {/if}
</div>

<style>
  .mail { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
  header h2 { margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 0.5rem; }
  .badge { background: var(--danger); color: white; font-size: 0.625rem; padding: 0 0.375rem; border-radius: 0.5rem; }
  .compose { font-size: 0.75rem; }

  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li button {
    width: 100%; text-align: left;
    display: grid; grid-template-columns: 1fr 2fr auto; gap: 0.5rem;
    padding: 0.5rem 0.75rem; background: var(--surface-2);
    border: 1px solid var(--border); border-radius: 0.375rem;
    font-size: 0.8125rem;
  }
  .list li.unread button { font-weight: 600; border-color: var(--accent); }
  .list .from { color: var(--accent); }
  .list .ts { color: var(--fg-muted); font-size: 0.75rem; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }

  .open { padding: 0.75rem 1rem; flex: 1; overflow-y: auto; }
  .open header { padding: 0; border: none; }
  .close { background: transparent; border: none; padding: 0 0.5rem; font-size: 1.25rem; line-height: 1; color: var(--fg-muted); }
  .from { font-size: 0.75rem; color: var(--fg-muted); margin: 0.25rem 0 0.75rem; }
  .body { font-size: 0.875rem; white-space: pre-wrap; }
  .atch { font-size: 0.8125rem; color: var(--accent); margin: 0.25rem 0; }
  .atch span { margin-left: 0.5rem; }
  .actions { margin-top: 1rem; }
  .rm { color: var(--danger); border-color: rgba(208,72,72,0.4); }

  .compose-form { padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1; overflow-y: auto; }
  .compose-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; }
  .compose-form label span { color: var(--fg-muted); }
  .compose-form textarea { resize: vertical; }
  .msg { font-size: 0.75rem; color: var(--fg-muted); margin: 0; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; align-self: flex-end; }
</style>
