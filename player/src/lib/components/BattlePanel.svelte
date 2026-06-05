<script lang="ts">
  import { battle } from '$stores/battle.svelte'

  interface Props {
    onaction: (payload: object) => void
  }
  let { onaction }: Props = $props()

  let selectedSkill = $state<number | null>(null)
  let pickingTarget = $state(false)

  function attack(targetCharId: number) {
    onaction({ kind: 'attack', target_char_id: targetCharId })
  }

  function useSkill(targetCharId: number) {
    if (selectedSkill === null) return
    onaction({ kind: 'skill', skill_id: selectedSkill, target_char_id: targetCharId })
    selectedSkill = null
    pickingTarget = false
  }

  function defend() { onaction({ kind: 'defend' }) }
  function flee()   { onaction({ kind: 'flee' }) }

  const enemies = $derived(battle.snapshot?.combatants.filter(c =>
    !c.is_player || c.team !== battle.snapshot?.combatants.find(x => x.charId === battle.snapshot?.myCharId)?.team
  ) ?? [])
</script>

{#if battle.snapshot}
  <div class="battle">
    <div class="combatants">
      <div class="row enemies">
        <h3>Enemies</h3>
        <ul>
          {#each enemies as c (c.charId)}
            <li class:dead={c.knocked_out}>
              <button
                class="combatant"
                disabled={c.knocked_out}
                onclick={() => pickingTarget && selectedSkill !== null ? useSkill(c.charId) : attack(c.charId)}
              >
                <span class="icon">{c.icon ?? '👹'}</span>
                <span class="name">{c.name}</span>
                <span class="hp">{c.current_hp}/{c.max_hp}</span>
                <div class="hp-bar"><div class="fill" style="width: {(c.current_hp / c.max_hp) * 100}%"></div></div>
              </button>
            </li>
          {/each}
        </ul>
      </div>

      <div class="row me">
        <h3>You</h3>
        {#if battle.me}
          <div class="me-card">
            <div class="line"><strong>{battle.me.name}</strong> · Lv {battle.me.level}</div>
            <div class="bars">
              <div class="bar hp"><div class="fill" style="width: {(battle.me.current_hp / battle.me.max_hp) * 100}%"></div><span>HP {battle.me.current_hp}/{battle.me.max_hp}</span></div>
              <div class="bar mp"><div class="fill" style="width: {(battle.me.current_mp / battle.me.max_mp) * 100}%"></div><span>MP {battle.me.current_mp}/{battle.me.max_mp}</span></div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="log">
      {#each battle.snapshot.log.slice(-8) as line, i (i + line)}
        <p>{line}</p>
      {/each}
    </div>

    <div class="commands">
      <button class="cmd" disabled={!battle.isMyTurn} onclick={() => { pickingTarget = false; selectedSkill = null }}>
        Attack
      </button>

      <details class="skills">
        <summary>Skills</summary>
        <ul>
          {#each battle.snapshot.skills as s (s.id)}
            <li>
              <button
                disabled={!battle.isMyTurn || (battle.me?.current_mp ?? 0) < s.mp_cost}
                onclick={() => { selectedSkill = s.id; pickingTarget = true }}
              >
                {s.icon ?? '✨'} {s.name} <em>({s.mp_cost} MP)</em>
              </button>
            </li>
          {/each}
        </ul>
      </details>

      <button class="cmd" disabled={!battle.isMyTurn} onclick={defend}>Defend</button>
      <button class="cmd danger" disabled={!battle.isMyTurn} onclick={flee}>Flee</button>
    </div>

    {#if battle.snapshot.phase === 'won'}
      <div class="overlay win">Victory!</div>
    {:else if battle.snapshot.phase === 'lost'}
      <div class="overlay lose">Defeated…</div>
    {/if}
  </div>
{/if}

<style>
  .battle {
    width: 100%; height: 100%;
    display: grid;
    grid-template-rows: 1fr auto auto;
    background: #0a0a0e;
    color: var(--fg);
    overflow: hidden;
  }
  .combatants { padding: 1rem; display: grid; grid-template-rows: 1fr auto; gap: 1rem; min-height: 0; }
  .row h3 { margin: 0 0 0.5rem; color: var(--fg-muted); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.06em; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .combatant {
    display: flex; flex-direction: column; gap: 0.25rem;
    background: var(--surface); border: 1px solid var(--border);
    padding: 0.5rem 0.75rem; border-radius: 0.375rem;
    min-width: 120px; text-align: left;
  }
  .combatant:hover:not(:disabled) { border-color: var(--danger); }
  .combatant .icon { font-size: 1.5rem; }
  .combatant .name { font-weight: 600; font-size: 0.875rem; }
  .combatant .hp { color: var(--fg-muted); font-size: 0.75rem; }
  .combatant .hp-bar { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .combatant .hp-bar .fill { height: 100%; background: var(--danger); transition: width 240ms; }
  li.dead .combatant { opacity: 0.4; text-decoration: line-through; }

  .me-card { background: var(--surface); border: 1px solid var(--border); padding: 0.625rem; border-radius: 0.375rem; }
  .me-card .line { margin-bottom: 0.5rem; font-size: 0.875rem; }
  .me-card .bars { display: grid; gap: 0.25rem; }
  .me-card .bar {
    position: relative; height: 14px;
    background: var(--surface-2); border-radius: 0.25rem; overflow: hidden;
    font-size: 0.6875rem;
  }
  .me-card .bar .fill { position: absolute; inset: 0 auto 0 0; transition: width 240ms; }
  .me-card .bar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .me-card .hp .fill { background: linear-gradient(90deg, #d04848, #f06868); }
  .me-card .mp .fill { background: linear-gradient(90deg, #5b8def, #7baaff); }

  .log {
    background: rgba(0,0,0,0.4);
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    max-height: 8rem; overflow-y: auto;
    font-size: 0.8125rem;
  }
  .log p { margin: 0.125rem 0; color: var(--fg-muted); }

  .commands {
    display: flex; align-items: stretch; gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
  }
  .cmd { flex: 1; }
  .cmd.danger { color: var(--danger); }
  .skills { flex: 1; position: relative; }
  .skills summary {
    cursor: pointer;
    list-style: none;
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    text-align: center;
  }
  .skills[open] ul {
    position: absolute;
    bottom: 100%;
    left: 0; right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    margin-bottom: 0.25rem;
    flex-direction: column;
    max-height: 14rem; overflow-y: auto;
    z-index: 5;
  }
  .skills li { width: 100%; }
  .skills button { width: 100%; text-align: left; border-radius: 0; border: none; }
  .skills em { color: var(--fg-muted); font-style: normal; font-size: 0.75rem; }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 3rem; font-weight: 700;
    background: rgba(0,0,0,0.6);
  }
  .overlay.win { color: var(--accent); }
  .overlay.lose { color: var(--danger); }
</style>
