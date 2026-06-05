<script lang="ts">
  import { onMount } from 'svelte'
  import { guild } from '$stores/guild.svelte'

  let tab = $state<'members' | 'news' | 'browse'>('members')
  let newPost = $state('')
  let creating = $state(false)
  let newName = $state(''); let newDesc = $state(''); let createMsg = $state<string | null>(null)

  onMount(async () => {
    await guild.loadDirectory()
    // If the player is in a guild we can find them via /api/party? No —
    // there's no "my guild" REST endpoint exposed. We rely on a future
    // channel push (`init_self.guild_id`) to tell us. For now, browse
    // mode opens to the directory.
  })

  async function post() {
    if (!guild.mine || !newPost.trim()) return
    await guild.postNews(guild.mine.id, newPost.trim())
    newPost = ''
  }

  async function create() {
    if (!newName.trim()) return
    const r = await guild.create(newName.trim(), newDesc.trim())
    createMsg = r.success ? 'Guild created!' : (r.message ?? 'Failed')
    if (r.success) creating = false
  }
</script>

<div class="guild">
  <header><h2>{guild.mine?.name ?? 'Guilds'}</h2></header>

  {#if guild.mine}
    <nav class="tabs">
      <button class:active={tab === 'members'} onclick={() => (tab = 'members')}>Members</button>
      <button class:active={tab === 'news'}    onclick={() => (tab = 'news')}>News</button>
      <button class:active={tab === 'browse'}  onclick={() => (tab = 'browse')}>Browse</button>
    </nav>

    {#if tab === 'members'}
      <ul class="list">
        {#each guild.mine.members ?? [] as m (m.charId)}
          <li>
            <span class="dot" class:on={m.online}></span>
            <span class="name">{m.name}</span>
            <span class="rank">{m.rank}</span>
            <span class="lvl">Lv {m.level}</span>
          </li>
        {/each}
      </ul>
    {:else if tab === 'news'}
      <ul class="news">
        {#each guild.news as n (n.id)}
          <li>
            <header><strong>{n.posted_by}</strong> <time>{new Date(n.posted_at).toLocaleString()}</time></header>
            <p>{n.body}</p>
          </li>
        {/each}
        {#if guild.news.length === 0}<p class="empty">No news yet.</p>{/if}
      </ul>

      <form class="post" onsubmit={(e) => { e.preventDefault(); post() }}>
        <textarea bind:value={newPost} maxlength="500" placeholder="Post guild news…" rows="2"></textarea>
        <button type="submit" disabled={!newPost.trim()}>Post</button>
      </form>
    {:else}
      <ul class="list">
        {#each guild.directory as g (g.id)}
          <li><span class="name">{g.name}</span><span class="lvl">{g.member_count ?? 0} members</span></li>
        {/each}
      </ul>
    {/if}
  {:else}
    <div class="no-guild">
      <p class="empty">You are not in a guild.</p>
      {#if !creating}
        <button class="primary" onclick={() => (creating = true)}>Found a guild</button>
      {:else}
        <form class="create" onsubmit={(e) => { e.preventDefault(); create() }}>
          <label><span>Name</span><input bind:value={newName} required maxlength="32" /></label>
          <label><span>Description</span><textarea bind:value={newDesc} rows="2" maxlength="200"></textarea></label>
          {#if createMsg}<p class="msg">{createMsg}</p>{/if}
          <div class="row">
            <button type="button" onclick={() => (creating = false)}>Cancel</button>
            <button class="primary" type="submit">Create</button>
          </div>
        </form>
      {/if}

      {#if guild.directory.length}
        <h3>Browse</h3>
        <ul class="list">
          {#each guild.directory.slice(0, 20) as g (g.id)}
            <li>
              <button class="browse-row" onclick={() => guild.load(g.id)}>
                <span class="name">{g.name}</span>
                <span class="lvl">{g.member_count ?? 0} members</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .guild { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .tabs { display: flex; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--border); gap: 0.125rem; }
  .tabs button { flex: 1; padding: 0.375rem; font-size: 0.8125rem; background: transparent; border: none; border-radius: 0; color: var(--fg-muted); border-bottom: 2px solid transparent; }
  .tabs button.active { color: var(--accent); border-bottom-color: var(--accent); }

  .list { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.25rem; }
  .list li { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.875rem; }
  .browse-row { width: 100%; display: flex; justify-content: space-between; padding: 0; background: transparent; border: none; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--fg-muted); }
  .dot.on { background: var(--success); }
  .name { flex: 1; }
  .rank { font-size: 0.75rem; color: var(--accent); margin-right: 0.5rem; }
  .lvl { font-size: 0.75rem; color: var(--fg-muted); }

  .news { list-style: none; margin: 0; padding: 0.5rem 1rem; flex: 1; overflow-y: auto; }
  .news li { background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
  .news header { padding: 0; border: none; display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--fg-muted); margin-bottom: 0.25rem; }
  .news p { margin: 0; font-size: 0.8125rem; }

  .post { display: flex; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  .post textarea { flex: 1; resize: none; }

  .no-guild { padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem; }
  .no-guild .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; align-self: flex-start; }
  .empty { color: var(--fg-muted); margin: 0; }
  .create { display: flex; flex-direction: column; gap: 0.5rem; }
  .create label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; }
  .create label span { color: var(--fg-muted); }
  .create .row { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .msg { font-size: 0.75rem; color: var(--fg-muted); margin: 0; }
  h3 { margin: 0.75rem 0 0; font-size: 0.875rem; color: var(--fg-muted); }
</style>
