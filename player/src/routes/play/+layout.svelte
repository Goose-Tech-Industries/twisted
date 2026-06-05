<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { auth } from '$stores/auth.svelte'
  import { connection } from '$phoenix/connection.svelte'

  let { children } = $props()

  // /play/[charId] renders its own PlayHeader (logo + map name + char chip
  // + sign out). Suppress this layout's topbar there to avoid the duplicate
  // header bar. Other /play/* routes (e.g., the character picker at /play
  // with no charId) keep the topbar.
  const isCharRoute = $derived($page.route.id === '/play/[charId]')

  // Auth gate. The store hydrates `token` synchronously from localStorage,
  // but `user` only lands after /api/auth/me resolves. If we redirect on
  // raw `isAuthed` we race the restore call — kick restore ourselves and
  // only redirect once we know the answer.
  //
  // Also: ensure the Phoenix socket actually connects. `restore()` calls
  // `connection.connect()` internally — but if `auth.user` is already
  // populated (e.g., the user came from /login in this session, or the
  // store survived a soft navigation), restore is skipped and the socket
  // is never opened. The explicit connect call below covers that path.
  // `connection.connect` is idempotent on (token, healthy state).
  let resolved = $state(false)
  onMount(async () => {
    if (auth.token && !auth.user) {
      try { await auth.restore() } catch { /* token cleared in catch */ }
    }
    if (auth.isAuthed && auth.token) {
      connection.connect(auth.token, 0)
    }
    resolved = true
    if (!auth.isAuthed) goto('/login', { replaceState: true })
  })

  // Tiny status pill in the corner so the connection state is always visible.
  const statusColor = $derived(
    connection.state === 'connected' ? '#4caf75' :
    connection.state === 'connecting' ? '#e6a23c' :
    connection.state === 'error' ? '#d04848' :
    '#6c6c75'
  )
</script>

{#if !resolved}
  <p class="redirect">Loading session…</p>
{:else if auth.isAuthed}
  {#if !isCharRoute}
    <header class="topbar">
      <strong class="brand">Twisted Engine</strong>
      <div class="who">
        <span class="status" style="background: {statusColor}" title={connection.state}></span>
        <span>{auth.user?.username}</span>
        <button class="logout" type="button" onclick={() => auth.logout()}>Sign out</button>
      </div>
    </header>
  {/if}

  <main>
    {@render children()}
  </main>
{:else}
  <p class="redirect">Redirecting…</p>
{/if}

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid var(--border-strong);
    background: linear-gradient(180deg, #0a0608, var(--surface));
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 -1px 0 rgba(178, 34, 34, 0.08);
  }
  .brand {
    font-family: 'Cinzel', Georgia, serif;
    color: var(--accent);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 700;
    text-shadow: 0 0 10px rgba(178, 34, 34, 0.4), 0 2px 0 #000;
  }
  .who { display: flex; align-items: center; gap: 0.75rem; font-size: 0.875rem; }
  .status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .logout {
    padding: 0.25rem 0.625rem;
    font-size: 0.8125rem;
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .redirect {
    padding: 2rem;
    color: var(--fg-muted);
    text-align: center;
  }
</style>
