<script lang="ts">
  import { onMount } from 'svelte'
  import { social } from '$stores/social.svelte'

  interface Props {
    onleaveparty?: () => void
    oninvite?: (name: string) => void
  }
  let { onleaveparty, oninvite }: Props = $props()

  let inviteName = $state('')

  onMount(() => void social.loadParty())

  function invite(e: Event) {
    e.preventDefault()
    if (!inviteName.trim()) return
    oninvite?.(inviteName.trim())
    inviteName = ''
  }
</script>

<div class="party">
  <header>
    <h2>Party</h2>
    {#if social.party}
      <button class="leave" onclick={onleaveparty}>Leave</button>
    {/if}
  </header>

  {#if social.party}
    <ul class="members">
      {#each social.party.members as m (m.charId)}
        <li class:leader={m.isLeader}>
          <div class="name">
            {m.isLeader ? '👑 ' : ''}{m.name}
            <span class="lvl">Lv {m.level}</span>
          </div>
          {#if m.current_hp !== undefined && m.max_hp}
            <div class="hp-bar">
              <div class="fill" style="width: {(m.current_hp / m.max_hp) * 100}%"></div>
              <span>{m.current_hp}/{m.max_hp}</span>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">You aren't in a party.</p>
  {/if}

  <form class="invite" onsubmit={invite}>
    <input type="text" bind:value={inviteName} placeholder="Invite by character name…" maxlength="20" />
    <button type="submit" disabled={!inviteName.trim()}>Invite</button>
  </form>
</div>

<style>
  .party { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1rem; }
  .leave { font-size: 0.75rem; color: var(--danger); border-color: rgba(208,72,72,0.4); }
  .members { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  .members li { background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.625rem 0.75rem; }
  .members li.leader { border-color: var(--accent); }
  .name { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; }
  .lvl { color: var(--fg-muted); font-weight: normal; font-size: 0.75rem; }
  .hp-bar { position: relative; height: 14px; background: var(--surface); border-radius: 0.25rem; overflow: hidden; font-size: 0.6875rem; }
  .hp-bar .fill { position: absolute; inset: 0 auto 0 0; background: var(--danger); transition: width 240ms; }
  .hp-bar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .empty { color: var(--fg-muted); padding: 1rem; text-align: center; }
  .invite { display: flex; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  .invite input { flex: 1; }
</style>
