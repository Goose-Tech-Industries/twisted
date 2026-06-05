<script lang="ts">
  import { onMount } from 'svelte'
  import { profile } from '$stores/profile.svelte'

  interface Props { charId: number; editable?: boolean }
  let { charId, editable = false }: Props = $props()

  let editing = $state(false)
  let bio = $state('')
  let quote = $state('')
  let banner = $state('')

  onMount(async () => {
    await profile.load(charId)
    if (profile.viewing) {
      bio = profile.viewing.profile_bio ?? ''
      quote = profile.viewing.profile_favorite_quote ?? ''
      banner = profile.viewing.profile_banner_emoji ?? ''
    }
  })

  async function save() {
    await profile.update({
      profile_bio: bio,
      profile_favorite_quote: quote,
      profile_banner_emoji: banner
    })
    editing = false
  }
</script>

<div class="profile">
  {#if !profile.viewing}
    <p class="empty">Loading…</p>
  {:else}
    {@const p = profile.viewing}
    <header style="background: linear-gradient(135deg, {p.profile_color ?? '#bb86fc'}40, transparent)">
      <span class="banner">{p.profile_banner_emoji ?? '⚔️'}</span>
      <div>
        <h2>{p.name}</h2>
        <span class="sub">Lv {p.level}{p.race_name ? ` · ${p.race_name}` : ''}{p.class_name ? ` ${p.class_name}` : ''}</span>
      </div>
      {#if editable}
        <button onclick={() => (editing = !editing)}>{editing ? 'Cancel' : 'Edit'}</button>
      {/if}
    </header>

    {#if editing}
      <form class="edit" onsubmit={(e) => { e.preventDefault(); void save() }}>
        <label><span>Banner emoji</span><input bind:value={banner} maxlength="4" /></label>
        <label><span>Quote</span><input bind:value={quote} maxlength="120" /></label>
        <label><span>Bio</span><textarea bind:value={bio} rows="4" maxlength="1000"></textarea></label>
        <button class="primary" type="submit">Save</button>
      </form>
    {:else}
      {#if p.profile_favorite_quote}<blockquote>"{p.profile_favorite_quote}"</blockquote>{/if}
      {#if p.profile_bio}<p class="bio">{p.profile_bio}</p>{/if}
      <footer>
        {#if p.profile_views !== undefined}<span>👁 {p.profile_views} views</span>{/if}
        {#if p.profile_signature}<span class="sig">— {p.profile_signature}</span>{/if}
      </footer>
    {/if}
  {/if}
</div>

<style>
  .profile { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow-y: auto; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
  header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem; border-bottom: 1px solid var(--border); }
  .banner { font-size: 2.5rem; }
  header h2 { margin: 0; font-size: 1.125rem; }
  .sub { font-size: 0.8125rem; color: var(--fg-muted); }
  blockquote { margin: 0; padding: 0.75rem 1rem; color: var(--accent); font-style: italic; }
  .bio { padding: 0 1rem; font-size: 0.875rem; white-space: pre-wrap; }
  footer { display: flex; gap: 1rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--fg-muted); margin-top: auto; }
  .sig { font-style: italic; }
  .edit { padding: 0.75rem 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
  .edit label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8125rem; }
  .edit label span { color: var(--fg-muted); }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; align-self: flex-end; }
</style>
