<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { character } from '$stores/character.svelte'
  import { api } from '$phoenix/api'

  interface Option { id: number; name: string; description?: string | null }
  interface OptionsResp {
    success: boolean
    races?: Option[]
    classes?: Option[]
    backgrounds?: Option[]
    feats?: Option[]
  }

  // Fallback to the four DB-canonical races/classes if Phoenix doesn't
  // yet expose /api/character-options (released only after this session).
  const FALLBACK_RACES: Option[] = [
    { id: 1, name: 'Human' }, { id: 2, name: 'Elf' },
    { id: 3, name: 'Dwarf' }, { id: 4, name: 'Orc' }
  ]
  const FALLBACK_CLASSES: Option[] = [
    { id: 1, name: 'Warrior' }, { id: 2, name: 'Mage' },
    { id: 3, name: 'Rogue' }, { id: 4, name: 'Cleric' }
  ]

  let races = $state<Option[]>(FALLBACK_RACES)
  let classes = $state<Option[]>(FALLBACK_CLASSES)

  let creating = $state(false)
  let newName = $state('')
  let raceId = $state<number>(1)
  let classId = $state<number>(1)
  let createError = $state<string | null>(null)

  onMount(async () => {
    void character.loadList()
    try {
      const r = await api.get<OptionsResp>('/api/character-options')
      if (r.success) {
        if (r.races?.length) races = r.races
        if (r.classes?.length) classes = r.classes
      }
    } catch { /* fallback list works fine */ }
  })

  async function pick(charId: number) {
    await character.loadActive(charId)
    goto(`/play/${charId}`)
  }

  async function create(e: Event) {
    e.preventDefault()
    createError = null
    try {
      const charId = await character.create(newName, '')
      // race/class go via the dedicated payload below — character.create
      // handles the request shape but we want raceId/classId, so call
      // the raw endpoint:
      // (Done inline for clarity — character.create signature kept generic.)
      void charId
      newName = ''
      creating = false
    } catch (err) {
      createError = (err as Error).message
    }
  }

  // Direct create call so we send the exact Phoenix shape (raceId/classId).
  async function createDirect(ev: Event) {
    ev.preventDefault()
    createError = null
    try {
      const res = await api.post<{ success: boolean; charId?: number; message?: string }>(
        '/api/characters/create',
        { name: newName, raceId, classId }
      )
      if (!res.success || !res.charId) {
        createError = res.message ?? 'Create failed'
        return
      }
      newName = ''
      creating = false
      await character.loadList()
      await pick(res.charId)
    } catch (err) {
      createError = (err as Error).message
    }
  }
  // `create` is unused now — keep the safer direct path.
  void create
</script>

<div class="wrap">
  <h1>Choose your hero</h1>

  {#if character.loading && character.list.length === 0}
    <p class="muted">Loading characters…</p>
  {:else if character.error}
    <p class="error">{character.error}</p>
  {/if}

  <ul class="char-list">
    {#each character.list as c (c.id)}
      <li>
        <button class="char-card" onclick={() => pick(c.id)}>
          <span class="icon">{c.icon ?? '🗡️'}</span>
          <span class="name">{c.name}</span>
          <span class="meta">Lv {c.level}{c.race_name ? ` · ${c.race_name}` : ''}{c.class_name ? ` ${c.class_name}` : ''}</span>
        </button>
      </li>
    {/each}

    <li>
      <button class="char-card create" onclick={() => (creating = true)}>
        <span class="icon">＋</span>
        <span class="name">New character</span>
      </button>
    </li>
  </ul>

  {#if creating}
    <form class="create-form" onsubmit={createDirect}>
      <h2>New character</h2>
      <label>
        <span>Name</span>
        <input bind:value={newName} required minlength="2" maxlength="20" pattern="[A-Za-z][A-Za-z0-9 '\-]*" />
      </label>
      <label>
        <span>Race</span>
        <select bind:value={raceId}>
          {#each races as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
        </select>
      </label>
      <label>
        <span>Class</span>
        <select bind:value={classId}>
          {#each classes as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>

      {#if createError}<p class="error">{createError}</p>{/if}

      <div class="form-actions">
        <button type="button" onclick={() => (creating = false)}>Cancel</button>
        <button type="submit" class="primary" disabled={character.loading}>Create</button>
      </div>
    </form>
  {/if}
</div>

<style>
  .wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1rem;
  }
  h1 {
    color: var(--accent);
    margin: 0 0 1.5rem;
  }
  .muted { color: var(--fg-muted); }
  .error { color: var(--danger); }
  .char-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
  }
  .char-card {
    width: 100%;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    cursor: pointer;
    transition: border-color 120ms;
  }
  .char-card:hover { border-color: var(--accent); }
  .char-card .icon { font-size: 2rem; }
  .char-card .name { font-weight: 600; }
  .char-card .meta { color: var(--fg-muted); font-size: 0.8125rem; }
  .char-card.create { border-style: dashed; align-items: center; justify-content: center; min-height: 120px; }
  .create-form {
    margin-top: 2rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 420px;
  }
  .create-form h2 { margin: 0; }
  .create-form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; }
  .create-form label span { color: var(--fg-muted); }
  .form-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }
  .primary:hover { background: #d4b783; }
</style>
