<script lang="ts">
  import { battle } from '$stores/battle.svelte'
  import { audio } from '$stores/audio.svelte'

  interface Props {
    onaction: (payload: object) => void
  }
  let { onaction }: Props = $props()

  let selectedSkill = $state<number | null>(null)
  let pickingTarget = $state(false)
  let comboMode = $state(false)
  let comboSequence = $state<string[]>([])
  let selectedEnemyId = $state<number | null>(null)

  // Combat Juice State
  interface FloatingCombatText {
    id: number
    targetId: number
    text: string
    type: 'damage' | 'crit' | 'heal' | 'stagger' | 'miss'
  }
  let floatingTexts = $state<FloatingCombatText[]>([])
  let screenShaking = $state(false)
  let flashedEnemyId = $state<number | null>(null)
  let nextFloatId = 1
  let lastLogLength = $state(0)

  const DIR_ICONS: Record<string, string> = {
    H: '⬆️',
    L: '⬇️',
    R: '➡️',
    U: '🌀'
  }

  const DIR_NAMES: Record<string, string> = {
    H: 'High',
    L: 'Low',
    R: 'Strike',
    U: 'Rising'
  }

  interface ComboArtMeta {
    name: string
    sequence: string[]
    cost: number
    icon: string
    formula: string
    desc: string
  }

  const KNOWN_ARTS: ComboArtMeta[] = [
    { name: 'Cross Cut', sequence: ['H', 'H'], cost: 2, icon: '⚔️', formula: 'ATK*2.2', desc: 'Swift dual slash' },
    { name: 'Somersault', sequence: ['H', 'H', 'L'], cost: 3, icon: '🌀', formula: 'ATK*3.0', desc: 'Rising kick into overhead axe' },
    { name: 'Tornado Dance', sequence: ['L', 'R', 'L', 'R'], cost: 4, icon: '🌪️', formula: 'ATK*3.5', desc: 'Rapid alternating strikes' },
    { name: 'Rising Upper', sequence: ['L', 'L', 'H'], cost: 3, icon: '👊', formula: 'ATK*2.8', desc: 'Low sweep into uppercut' },
    { name: 'Hyper Elbow', sequence: ['H', 'L', 'H'], cost: 3, icon: '💪', formula: 'ATK*3.0', desc: 'High-low feint charge' },
    { name: 'Hurricane Kick', sequence: ['L', 'R', 'L', 'R', 'H'], cost: 5, icon: '🌊', formula: 'ATK*4.5', desc: '5-hit tempest blitz' },
    { name: 'Mystic Arte', sequence: ['H', 'L', 'H', 'L', 'H'], cost: 5, icon: '✨', formula: 'ATK*5+MO*2', desc: 'Ancient ether combo' }
  ]

  const maxAp = $derived(battle.me?.max_ap ?? 6)
  const currentAp = $derived(battle.me?.current_ap ?? 6)
  const apRemaining = $derived(Math.max(0, currentAp - comboSequence.length))

  const isComboEnabled = $derived(battle.snapshot?.settings?.enable_combo_input ?? true)
  const isStaggerEnabled = $derived(battle.snapshot?.settings?.enable_stagger_system ?? true)
  const isLimbTargetingEnabled = $derived(battle.snapshot?.settings?.enable_limb_targeting ?? true)
  const effectiveComboMode = $derived(isComboEnabled && comboMode)

  const matchedArt = $derived.by(() => {
    if (comboSequence.length === 0) return null
    const seqStr = comboSequence.join(',')
    return KNOWN_ARTS.find(a => a.sequence.join(',') === seqStr) ?? null
  })

  const enemies = $derived(battle.snapshot?.combatants.filter(c =>
    !c.is_player || c.team !== battle.snapshot?.combatants.find(x => x.charId === battle.snapshot?.myCharId)?.team
  ) ?? [])

  function triggerJuice(targetId: number, text: string, type: 'damage' | 'crit' | 'heal' | 'stagger' | 'miss') {
    const fid = nextFloatId++
    floatingTexts = [...floatingTexts, { id: fid, targetId, text, type }]
    setTimeout(() => {
      floatingTexts = floatingTexts.filter(f => f.id !== fid)
    }, 900)

    // Hit flash
    flashedEnemyId = targetId
    setTimeout(() => {
      if (flashedEnemyId === targetId) flashedEnemyId = null
    }, 150)

    // Screen shake on heavy hits, crits, or stagger
    if (type === 'crit' || type === 'stagger') {
      screenShaking = true
      setTimeout(() => { screenShaking = false }, 250)
    }
  }

  // Monitor incoming combat log lines to play sound reactions and triggers
  $effect(() => {
    const log = battle.snapshot?.log ?? []
    if (log.length > lastLogLength) {
      const latest = log[log.length - 1]?.toLowerCase() || ''
      lastLogLength = log.length

      if (latest.includes('critical') || latest.includes('crit')) {
        audio.play('crit')
        screenShaking = true
        setTimeout(() => { screenShaking = false }, 250)
      } else if (latest.includes('heal') || latest.includes('restored')) {
        audio.play('heal')
      } else if (latest.includes('stagger') || latest.includes('broken')) {
        audio.play('stagger')
        screenShaking = true
        setTimeout(() => { screenShaking = false }, 300)
      } else if (latest.includes('victory') || latest.includes('defeated') && !latest.includes('you were')) {
        audio.play('victory')
      } else if (latest.includes('wiped') || latest.includes('fallen') || latest.includes('you were defeated')) {
        audio.play('defeat')
      }
    }
  })

  function attack(targetCharId: number) {
    audio.play('hit')
    triggerJuice(targetCharId, 'SLASH!', 'damage')
    onaction({ kind: 'attack', target_id: targetCharId, target_char_id: targetCharId })
  }

  function useSkill(targetCharId: number) {
    if (selectedSkill === null) return
    audio.play('spell')
    triggerJuice(targetCharId, 'MAGIC!', 'crit')
    onaction({ kind: 'skill', skill_id: selectedSkill, target_id: targetCharId, target_char_id: targetCharId })
    selectedSkill = null
    pickingTarget = false
  }

  function defend() {
    audio.play('click')
    if (battle.me) triggerJuice(battle.me.charId, 'GUARD!', 'heal')
    onaction({ kind: 'defend' })
  }

  function flee() {
    audio.play('flee')
    onaction({ kind: 'flee' })
  }

  function addComboDir(dir: 'H' | 'L' | 'R' | 'U') {
    if (apRemaining <= 0) return
    audio.play('click')
    comboSequence = [...comboSequence, dir]
  }

  function clearCombo() {
    comboSequence = []
  }

  function fillArt(art: ComboArtMeta) {
    if (art.cost > currentAp) return
    audio.play('click')
    comboSequence = [...art.sequence]
  }

  function executeCombo() {
    if (comboSequence.length === 0) return
    const targetId = selectedEnemyId ?? enemies.find(e => !e.knocked_out)?.charId
    if (!targetId) return

    const isSpecial = matchedArt !== null
    if (isSpecial) {
      audio.play('crit')
      triggerJuice(targetId, `${matchedArt.name.toUpperCase()}!`, 'crit')
    } else {
      audio.play('hit')
      triggerJuice(targetId, `COMBO x${comboSequence.length}!`, 'damage')
    }

    onaction({
      kind: 'combo',
      combo_input: comboSequence.join(','),
      target_id: targetId,
      target_char_id: targetId
    })
    comboSequence = []
  }

  function handleEnemyClick(enemyId: number) {
    if (comboMode) {
      selectedEnemyId = enemyId
    } else if (pickingTarget && selectedSkill !== null) {
      useSkill(enemyId)
    } else {
      attack(enemyId)
    }
  }
</script>

{#if battle.snapshot}
  <div class="battle" class:screen-shaking={screenShaking}>
    <div class="combatants">
      <div class="row enemies">
        <h3>Enemies</h3>
        <ul>
          {#each enemies as c (c.charId)}
            <li class:dead={c.knocked_out}>
              <button
                class="combatant"
                class:targeted={effectiveComboMode && selectedEnemyId === c.charId}
                class:hit-flashing={flashedEnemyId === c.charId}
                disabled={c.knocked_out}
                onclick={() => handleEnemyClick(c.charId)}
              >
                {#if effectiveComboMode && selectedEnemyId === c.charId}
                  <span class="target-badge">🎯 TARGET</span>
                {/if}
                {#each floatingTexts.filter(f => f.targetId === c.charId) as f (f.id)}
                  <span class="combat-float float-{f.type}">{f.text}</span>
                {/each}
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
          <div class="me-card" class:hit-flashing={flashedEnemyId === battle.me.charId}>
            {#each floatingTexts.filter(f => f.targetId === battle.me?.charId) as f (f.id)}
              <span class="combat-float float-{f.type}">{f.text}</span>
            {/each}
            <div class="line">
              <strong>{battle.me.name}</strong> · Lv {battle.me.level}
              {#if effectiveComboMode}
                <span class="ap-pill">⚡ AP: {apRemaining}/{maxAp}</span>
              {/if}
            </div>
            <div class="bars">
              <div class="bar hp"><div class="fill" style="width: {(battle.me.current_hp / battle.me.max_hp) * 100}%"></div><span>HP {battle.me.current_hp}/{battle.me.max_hp}</span></div>
              <div class="bar mp"><div class="fill" style="width: {(battle.me.current_mp / battle.me.max_mp) * 100}%"></div><span>MP {battle.me.current_mp}/{battle.me.max_mp}</span></div>
              {#if isComboEnabled}
                <div class="bar ap"><div class="fill" style="width: {(currentAp / maxAp) * 100}%"></div><span>AP {currentAp}/{maxAp}</span></div>
              {/if}
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

    {#if isComboEnabled}
      <!-- Mode Selector Tabs -->
      <div class="mode-bar">
        <button
          class="mode-tab"
          class:active={!effectiveComboMode}
          onclick={() => { comboMode = false; }}
        >
          ⚔️ Classic Action
        </button>
        <button
          class="mode-tab combo-tab"
          class:active={effectiveComboMode}
          onclick={() => { comboMode = true; pickingTarget = false; selectedSkill = null; }}
        >
          🥋 Combo Arts (AP)
        </button>
      </div>
    {/if}

    {#if !effectiveComboMode}
      <!-- Classic Commands -->
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
    {:else}
      <!-- Tactical Combo Arts Builder -->
      <div class="combo-console">
        <!-- AP Dial & Pip Tracker -->
        <div class="combo-header">
          <div class="ap-dial">
            <span class="ap-label">⚡ AP DIAL</span>
            <div class="pips">
              {#each Array(maxAp) as _, i}
                <span class="pip" class:spent={i >= apRemaining} class:filled={i < apRemaining}></span>
              {/each}
            </div>
            <span class="ap-count">{apRemaining} / {maxAp} AP Available</span>
          </div>

          {#if comboSequence.length > 0}
            <button class="clear-btn" onclick={clearCombo} title="Clear sequence">
              ⌫ Reset
            </button>
          {/if}
        </div>

        <!-- Sequence Staging Bar -->
        <div class="sequence-strip">
          {#if comboSequence.length === 0}
            <span class="sequence-empty">Tap directions below to assemble your combo arts...</span>
          {:else}
            <div class="staged-inputs">
              {#each comboSequence as dir, i (i)}
                <div class="staged-node">
                  <span class="node-icon">{DIR_ICONS[dir]}</span>
                  <span class="node-label">{DIR_NAMES[dir]}</span>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Matched Art Banner -->
        {#if matchedArt}
          <div class="art-banner">
            <span class="art-icon">{matchedArt.icon}</span>
            <div class="art-info">
              <strong>{matchedArt.name}</strong>
              <small>{matchedArt.desc} · {matchedArt.formula}</small>
            </div>
            <span class="art-ready">⚡ ART READY!</span>
          </div>
        {/if}

        <!-- Directional Input Controls -->
        <div class="directional-pad">
          <button
            class="dir-btn up"
            disabled={!battle.isMyTurn || apRemaining <= 0}
            onclick={() => addComboDir('H')}
          >
            <span class="icon">⬆️</span>
            <span class="label">HIGH (H)</span>
            <span class="cost">1 AP</span>
          </button>
          <div class="dir-row">
            <button
              class="dir-btn left"
              disabled={!battle.isMyTurn || apRemaining <= 0}
              onclick={() => addComboDir('U')}
            >
              <span class="icon">🌀</span>
              <span class="label">RISING (U)</span>
              <span class="cost">1 AP</span>
            </button>
            <button
              class="dir-btn right"
              disabled={!battle.isMyTurn || apRemaining <= 0}
              onclick={() => addComboDir('R')}
            >
              <span class="icon">➡️</span>
              <span class="label">STRIKE (R)</span>
              <span class="cost">1 AP</span>
            </button>
          </div>
          <button
            class="dir-btn down"
            disabled={!battle.isMyTurn || apRemaining <= 0}
            onclick={() => addComboDir('L')}
          >
            <span class="icon">⬇️</span>
            <span class="label">LOW (L)</span>
            <span class="cost">1 AP</span>
          </button>
        </div>

        <!-- Discovered Arts Quick-Select & Execute -->
        <div class="combo-actions">
          <details class="arts-drawer">
            <summary class="arts-summary">📖 Discovered Arts ({KNOWN_ARTS.length})</summary>
            <div class="arts-grid">
              {#each KNOWN_ARTS as art}
                <button
                  class="art-card"
                  disabled={!battle.isMyTurn || art.cost > currentAp}
                  onclick={() => fillArt(art)}
                >
                  <span class="art-chip-icon">{art.icon}</span>
                  <div class="art-chip-body">
                    <strong>{art.name}</strong>
                    <span class="seq">{art.sequence.map(d => DIR_ICONS[d]).join(' ')}</span>
                  </div>
                  <span class="art-cost">{art.cost} AP</span>
                </button>
              {/each}
            </div>
          </details>

          <button
            class="cmd execute-btn"
            disabled={!battle.isMyTurn || comboSequence.length === 0}
            onclick={executeCombo}
          >
            🔥 Execute Arts ({comboSequence.length} Hits)
          </button>
        </div>
      </div>
    {/if}

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
    grid-template-rows: 1fr auto auto auto;
    background: #0a0a0e;
    color: var(--fg);
    overflow: hidden;
  }
  .combatants { padding: 1rem; display: grid; grid-template-rows: 1fr auto; gap: 1rem; min-height: 0; }
  .row h3 { margin: 0 0 0.5rem; color: var(--fg-muted); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.06em; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .combatant {
    position: relative;
    display: flex; flex-direction: column; gap: 0.25rem;
    background: var(--surface); border: 1px solid var(--border);
    padding: 0.5rem 0.75rem; border-radius: 0.375rem;
    min-width: 120px; text-align: left;
    transition: all 180ms ease;
  }
  .combatant:hover:not(:disabled) { border-color: var(--danger); }
  .combatant.targeted {
    border-color: #ffd700;
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.4);
  }
  .target-badge {
    position: absolute;
    top: -8px;
    right: -4px;
    background: #ffd700;
    color: #111;
    font-size: 0.625rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.04em;
  }
  .combatant .icon { font-size: 1.5rem; }
  .combatant .name { font-weight: 600; font-size: 0.875rem; }
  .combatant .hp { color: var(--fg-muted); font-size: 0.75rem; }
  .combatant .hp-bar { height: 4px; background: var(--surface-2); border-radius: 2px; overflow: hidden; }
  .combatant .hp-bar .fill { height: 100%; background: var(--danger); transition: width 240ms; }
  li.dead .combatant { opacity: 0.4; text-decoration: line-through; }

  .me-card { background: var(--surface); border: 1px solid var(--border); padding: 0.625rem; border-radius: 0.375rem; }
  .me-card .line { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 0.875rem; }
  .ap-pill { font-size: 0.75rem; font-weight: 700; color: #ffd700; background: rgba(255, 215, 0, 0.12); padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.3); }
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
  .me-card .ap .fill { background: linear-gradient(90deg, #e67e22, #f39c12); }

  .log {
    background: rgba(0,0,0,0.4);
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
    max-height: 7rem; overflow-y: auto;
    font-size: 0.8125rem;
  }
  .log p { margin: 0.125rem 0; color: var(--fg-muted); }

  /* Mode Switcher */
  .mode-bar {
    display: flex;
    background: #111116;
    border-top: 1px solid var(--border);
  }
  .mode-tab {
    flex: 1;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    font-weight: 600;
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .mode-tab.active {
    color: #fff;
    border-bottom-color: var(--accent);
    background: rgba(255, 255, 255, 0.04);
  }
  .mode-tab.combo-tab.active {
    color: #ffd700;
    border-bottom-color: #ffd700;
  }

  /* Classic Commands */
  .commands {
    display: flex; align-items: stretch; gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--surface);
  }
  .cmd {
    flex: 1;
    padding: 0.5rem 1rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--fg);
    font-weight: 600;
    cursor: pointer;
  }
  .cmd:hover:not(:disabled) {
    border-color: var(--accent);
  }
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
    font-weight: 600;
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
  .skills button { width: 100%; text-align: left; border-radius: 0; border: none; padding: 0.4rem 0.6rem; }
  .skills em { color: var(--fg-muted); font-style: normal; font-size: 0.75rem; }

  /* Tactical Combo Arts Console */
  .combo-console {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #0f1015;
    border-top: 1px solid var(--border);
  }
  .combo-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ap-dial {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .ap-label {
    font-size: 0.6875rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #ffd700;
  }
  .pips {
    display: flex;
    gap: 3px;
  }
  .pip {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(255, 215, 0, 0.4);
    transition: all 200ms ease;
  }
  .pip.filled {
    background: linear-gradient(135deg, #ffd700, #ff9f1c);
    box-shadow: 0 0 6px rgba(255, 215, 0, 0.5);
  }
  .pip.spent {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }
  .ap-count {
    font-size: 0.75rem;
    color: var(--fg-muted);
  }
  .clear-btn {
    padding: 2px 8px;
    background: rgba(230, 76, 76, 0.15);
    border: 1px solid rgba(230, 76, 76, 0.3);
    color: #ff6b6b;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
  }

  .sequence-strip {
    min-height: 2.25rem;
    background: #171821;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    padding: 0.25rem 0.5rem;
    overflow-x: auto;
  }
  .sequence-empty {
    font-size: 0.75rem;
    color: var(--fg-muted);
    font-style: italic;
  }
  .staged-inputs {
    display: flex;
    gap: 0.375rem;
  }
  .staged-node {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(255, 215, 0, 0.15);
    border: 1px solid rgba(255, 215, 0, 0.4);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.75rem;
    color: #fff;
  }
  .node-icon { font-size: 0.875rem; }
  .node-label { font-weight: 700; font-size: 0.6875rem; }

  .art-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.15), rgba(255, 159, 28, 0.05));
    border: 1px solid #ffd700;
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    animation: glow-pulse 1.6s infinite alternate;
  }
  @keyframes glow-pulse {
    from { box-shadow: 0 0 4px rgba(255, 215, 0, 0.3); }
    to { box-shadow: 0 0 12px rgba(255, 215, 0, 0.6); }
  }
  .art-icon { font-size: 1.25rem; }
  .art-info { flex: 1; display: flex; flex-direction: column; }
  .art-info strong { font-size: 0.8125rem; color: #ffd700; }
  .art-info small { font-size: 0.6875rem; color: var(--fg-muted); }
  .art-ready {
    font-size: 0.6875rem;
    font-weight: 800;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.2);
    padding: 2px 6px;
    border-radius: 3px;
  }

  .directional-pad {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    margin: 0.25rem 0;
  }
  .dir-row {
    display: flex;
    gap: 0.75rem;
  }
  .dir-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    min-width: 90px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .dir-btn:hover:not(:disabled) {
    border-color: #ffd700;
    transform: translateY(-1px);
    background: rgba(255, 215, 0, 0.08);
  }
  .dir-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .dir-btn .icon { font-size: 1.125rem; }
  .dir-btn .label { font-size: 0.6875rem; font-weight: 700; }
  .dir-btn .cost { font-size: 0.625rem; color: #ffd700; }

  .combo-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .arts-drawer {
    flex: 1;
    position: relative;
  }
  .arts-summary {
    cursor: pointer;
    list-style: none;
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: center;
  }
  .arts-grid {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    margin-bottom: 0.25rem;
    padding: 0.375rem;
    display: grid;
    gap: 0.25rem;
    max-height: 12rem;
    overflow-y: auto;
    z-index: 10;
  }
  .art-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface-2);
    border: 1px solid transparent;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    text-align: left;
    cursor: pointer;
  }
  .art-card:hover:not(:disabled) {
    border-color: #ffd700;
    background: rgba(255, 215, 0, 0.06);
  }
  .art-chip-icon { font-size: 1rem; }
  .art-chip-body { flex: 1; display: flex; flex-direction: column; }
  .art-chip-body strong { font-size: 0.75rem; }
  .art-chip-body .seq { font-size: 0.6875rem; color: #ffd700; }
  .art-cost { font-size: 0.6875rem; font-weight: 700; color: var(--fg-muted); }

  .execute-btn {
    flex: 1.5;
    background: linear-gradient(135deg, #e67e22, #d35400);
    border: 1px solid #f39c12;
    color: #fff;
    font-weight: 700;
    font-size: 0.8125rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    box-shadow: 0 0 10px rgba(230, 126, 34, 0.3);
    cursor: pointer;
  }
  .execute-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #f39c12, #e67e22);
    box-shadow: 0 0 15px rgba(230, 126, 34, 0.6);
  }
  .execute-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 3rem; font-weight: 700;
    background: rgba(0,0,0,0.6);
  }
  .overlay.win { color: var(--accent); }
  .overlay.lose { color: var(--danger); }

  /* ── Combat Juice: Shake, Flash & Floating Numbers ── */
  .screen-shaking {
    animation: screen-shake 0.25s cubic-bezier(.36,.07,.19,.97) both;
  }
  @keyframes screen-shake {
    10%, 90% { transform: translate3d(-2px, 0, 0); }
    20%, 80% { transform: translate3d(3px, -2px, 0); }
    30%, 50%, 70% { transform: translate3d(-3px, 2px, 0); }
    40%, 60% { transform: translate3d(3px, 1px, 0); }
  }

  .hit-flashing {
    filter: brightness(2.2) contrast(1.4) !important;
    transform: scale(0.96) !important;
    transition: all 60ms ease;
  }

  .combatant, .me-card {
    position: relative;
  }

  .combat-float {
    position: absolute;
    top: 20%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-weight: 900;
    font-size: 1.15rem;
    text-shadow: 0 0 8px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,1);
    animation: float-up-burst 0.9s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards;
    letter-spacing: 0.05em;
    pointer-events: none;
    z-index: 30;
    white-space: nowrap;
  }
  .float-damage { color: #f87171; }
  .float-crit { color: #fbbf24; font-size: 1.35rem; text-shadow: 0 0 10px #d97706, 0 0 4px #000; }
  .float-heal { color: #4ade80; }
  .float-stagger { color: #c084fc; font-size: 1.25rem; }
  .float-miss { color: #94a3b8; font-style: italic; }

  @keyframes float-up-burst {
    0% { opacity: 0; transform: translate(-50%, 0) scale(0.6); }
    20% { opacity: 1; transform: translate(-50%, -15px) scale(1.25); }
    70% { opacity: 1; transform: translate(-50%, -28px) scale(1.0); }
    100% { opacity: 0; transform: translate(-50%, -42px) scale(0.85); }
  }
</style>
