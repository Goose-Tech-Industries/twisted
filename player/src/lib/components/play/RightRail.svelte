<script lang="ts">
  import { world } from '$stores/world.svelte'
  import { worldEvents } from '$stores/world_events.svelte'
  import { chat as chatStore, type ChatChannel } from '$stores/chat.svelte'
  import { debug } from '$stores/debug.svelte'
  import Minimap from './Minimap.svelte'

  interface Props {
    collapsed: boolean
    onSendChat: (channel: string, body: string) => void
  }
  let { collapsed, onSendChat }: Props = $props()

  debug.register('Online Players', 'stub')
  debug.register('World Events', 'stub')
  // Chat is 'unknown' until Ticket R verifies round-trip in two browsers.
  // The send path may work locally without the server actually broadcasting
  // back; we don't downgrade UNKNOWN→REAL on client-side echo alone.
  debug.register('Chat', 'unknown')

  let bootedAt = Date.now()
  $effect(() => {
    if (world.players.length > 0) debug.update('Online Players', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Online Players', 'empty')
  })
  $effect(() => {
    if (worldEvents.active.length > 0) debug.update('World Events', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('World Events', 'empty')
  })

  let chatTab = $state<ChatChannel>('local')
  let pending = $state('')
  function send() {
    const text = pending.trim()
    if (!text) return
    onSendChat(chatTab, text)
    pending = ''
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const mapName = $derived(world.map?.name ?? 'this place')
</script>

<aside class="right-rail" class:collapsed>
  {#if collapsed}
    <div class="strip">
      <span class="strip-icon" title="Minimap">🗺</span>
      <span class="strip-icon" title="Online players">👥</span>
      <span class="strip-icon" title="World events">🌑</span>
      <span class="strip-icon" title="Chat">💬</span>
    </div>
  {:else}
    <section class="card minimap-card">
      <h4>🗺 Minimap</h4>
      <Minimap />
    </section>

    <section class="card">
      <h4>👥 Online ({world.players.length})</h4>
      {#if world.players.length > 0}
        <ul class="players">
          {#each world.players as p (p.charId)}
            <li>
              <span class="dot online"></span>
              <span class="pname">{p.name}</span>
              <span class="plv">Lv {p.level}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">You're alone in {mapName}.</p>
      {/if}
    </section>

    <section class="card">
      <h4>🌑 World Events</h4>
      {#if worldEvents.active.length > 0}
        <ul class="events">
          {#each worldEvents.active.slice(0, 5) as e}
            <li>
              <span class="ev-name">{e.name ?? 'Unnamed event'}</span>
              {#if e.description}<span class="ev-desc">{e.description}</span>{/if}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="empty">All quiet in {mapName}… too quiet.</p>
      {/if}
    </section>

    <section class="card chat-card">
      <h4>💬 Chat</h4>
      <div class="chat-tabs">
        {#each ['local', 'party', 'guild', 'global'] as ch (ch)}
          <button
            class:active={chatTab === ch}
            onclick={() => chatTab = ch as ChatChannel}
            type="button"
          >{ch}</button>
        {/each}
      </div>
      <div class="chat-log">
        {#each chatStore.byChannel[chatTab] as msg (msg.id)}
          <div class="msg">
            <span class="from" style:color={msg.fromColor ?? '#c9a14a'}>{msg.from}</span>:
            <span class="body">{msg.body}</span>
          </div>
        {:else}
          <p class="empty">Channel quiet. Type to break the silence.</p>
        {/each}
      </div>
      <div class="chat-input">
        <input
          type="text"
          placeholder="Press Enter to send to {chatTab}…"
          bind:value={pending}
          onkeydown={onKey}
        />
      </div>
    </section>
  {/if}
</aside>

<style>
  .right-rail {
    grid-area: right;
    width: 260px;
    height: 100%;
    background: #0d0d11;
    border-left: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
    transition: width 180ms ease;
  }
  .right-rail.collapsed {
    width: 32px;
    padding: 0.5rem 0;
    align-items: center;
  }
  .strip { display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
  .strip-icon { font-size: 1.1rem; cursor: default; opacity: 0.7; }
  .strip-icon:hover { opacity: 1; }

  .card {
    background: #15151a;
    border: 1px solid #2a2a2a;
    border-radius: 0.25rem;
    padding: 0.5rem 0.625rem;
  }
  .minimap-card { padding-bottom: 0.625rem; }
  .chat-card { display: flex; flex-direction: column; flex: 1; min-height: 220px; }

  h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c9a14a;
    margin: 0 0 0.5rem;
    font-weight: 700;
  }

  .players, .events {
    list-style: none; margin: 0; padding: 0;
    display: flex; flex-direction: column; gap: 0.25rem;
  }
  .players li {
    display: flex; align-items: center; gap: 0.375rem;
    font-size: 0.75rem; color: #ece6e3;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .dot.online { background: #4caf75; box-shadow: 0 0 4px #4caf75; }
  .pname { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .plv { color: #6a665b; font-size: 0.65rem; flex-shrink: 0; }

  .events li {
    font-size: 0.7rem;
    color: #a39e8b;
    border-left: 2px solid #c9a14a;
    padding-left: 0.5rem;
  }
  .ev-name { display: block; color: #ece6e3; font-weight: 600; }
  .ev-desc { display: block; color: #6a665b; }

  .chat-tabs {
    display: flex; gap: 0.125rem; margin-bottom: 0.375rem;
  }
  .chat-tabs button {
    flex: 1;
    background: transparent;
    border: 1px solid #2a2a2a;
    color: #a39e8b;
    padding: 0.25rem;
    font-size: 0.65rem;
    text-transform: capitalize;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .chat-tabs button.active {
    border-color: #c9a14a;
    color: #c9a14a;
    background: rgba(201, 161, 74, 0.08);
  }
  .chat-log {
    flex: 1;
    overflow-y: auto;
    background: #050505;
    border: 1px solid #2a2a2a;
    border-radius: 0.25rem;
    padding: 0.375rem;
    font-size: 0.7rem;
    line-height: 1.4;
    min-height: 80px;
  }
  .msg .from { font-weight: 600; }
  .msg .body { color: #ece6e3; word-break: break-word; }
  .chat-input { margin-top: 0.375rem; }
  .chat-input input {
    width: 100%;
    background: #050505;
    border: 1px solid #2a2a2a;
    color: #ece6e3;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-family: inherit;
  }
  .chat-input input:focus {
    outline: none;
    border-color: #c9a14a;
    box-shadow: 0 0 0 2px rgba(201, 161, 74, 0.15);
  }

  .empty {
    font-size: 0.7rem;
    color: #6a665b;
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }
</style>
