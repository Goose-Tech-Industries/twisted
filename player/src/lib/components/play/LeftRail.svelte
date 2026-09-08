<script lang="ts">
  import { character } from '$stores/character.svelte'
  import { quests } from '$stores/quests.svelte'
  import { statusEffects } from '$stores/status_effects.svelte'
  import { companion } from '$stores/companion.svelte'
  import { inventory } from '$stores/inventory.svelte'
  import { debug } from '$stores/debug.svelte'

  interface Props {
    collapsed: boolean
    onOpenAscension?: () => void
  }
  let { collapsed, onOpenAscension }: Props = $props()

  const char = $derived(character.active)
  const heroHpPct = $derived(
    char ? Math.max(0, Math.min(100, (Number(char.current_hp ?? 100) / Math.max(1, Number(char.max_hp ?? 100))) * 100)) : 100
  )
  const heroMpPct = $derived(
    char ? Math.max(0, Math.min(100, (Number(char.current_mp ?? 50) / Math.max(1, Number(char.max_mp ?? 50))) * 100)) : 100
  )

  function getHeroPortrait(c: typeof character.active): string {
    if (!c) return '/portraits/portrait_warrior.png'
    if (c.portrait_url) return c.portrait_url
    const cls = (c.class_name || '').toLowerCase()
    if (cls.includes('mage') || cls.includes('wizard') || cls.includes('sorcerer')) return '/portraits/portrait_mage.png'
    if (cls.includes('rogue') || cls.includes('thief') || cls.includes('assassin')) return '/portraits/portrait_rogue.png'
    if (cls.includes('cleric') || cls.includes('priest')) return '/portraits/portrait_cleric.png'
    return '/portraits/portrait_warrior.png'
  }

  const tracked = $derived(quests.tracked ?? quests.active[0] ?? null)
  const objective = $derived(tracked?.objectives?.find(o => !o.completed) ?? tracked?.objectives?.[0] ?? null)

  debug.register('Hero Portrait', 'real')
  debug.register('Quest Tracker', 'stub')
  debug.register('Active Statuses', 'stub')
  debug.register('Companion', 'stub')

  let bootedAt = Date.now()
  $effect(() => {
    if (quests.active.length > 0) debug.update('Quest Tracker', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Quest Tracker', 'empty')
  })
  $effect(() => {
    if (statusEffects.active.length > 0) debug.update('Active Statuses', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Active Statuses', 'empty')
  })
  $effect(() => {
    if (companion.active) debug.update('Companion', 'real')
    else if (Date.now() - bootedAt > 2000) debug.update('Companion', 'empty')
  })

  const tactics: Array<'aggressive' | 'defensive' | 'support'> = ['aggressive', 'defensive', 'support']
  async function cycleTactic(ev: MouseEvent) {
    ev.stopPropagation()
    if (!companion.active) return
    const cur = companion.active.tactic || 'aggressive'
    const nextIdx = (tactics.indexOf(cur as 'aggressive') + 1) % tactics.length
    const next = tactics[nextIdx] ?? 'aggressive'
    await companion.setTactic(companion.active.id, next)
  }
</script>

<aside class="left-rail" class:collapsed>
  {#if collapsed}
    <!-- BG3 Collapsed Compact Tokens -->
    <div class="strip">
      <div class="token hero-token" title="{char?.name || 'Hero'} (Lv.{char?.level || 1})">
        <img src={getHeroPortrait(char)} alt="Hero" class="token-img" />
        <span class="token-badge">{char?.level || 1}</span>
      </div>

      {#if companion.active}
        <div class="token comp-token" title="{companion.active.name}">
          <img src="/portraits/portrait_companion_wolf.png" alt="Companion" class="token-img" />
        </div>
      {/if}

      <div class="strip-divider"></div>
      <span class="strip-icon" title="Quest Tracker">📜</span>
      <span class="strip-icon" title="Statuses">✨</span>
    </div>
  {:else}
    <!-- BG3 Party Column: Hero Card -->
    <section class="card hero-card">
      <div class="hero-header">
        <div class="portrait-box">
          <img src={getHeroPortrait(char)} alt={char?.name || 'Hero'} class="portrait-img" />
          <span class="level-tag">Lv.{char?.level || 1}</span>
        </div>
        <div class="hero-identity">
          <div class="hero-name" title={char?.name || 'Nameless Wanderer'}>
            {char?.name || 'Nameless Wanderer'}
          </div>
          <div class="hero-sub">
            <span class="race-class">{char?.race_name || 'Human'} {char?.class_name || 'Warrior'}</span>
            {#if char?.subclass_name}
              <span class="subclass-badge" title={char?.subclass_title || char?.subclass_name}>⚡ {char.subclass_name}</span>
            {/if}
            {#if char?.bg_name}
              <span class="bg-badge" title={char?.bg_name}>{char.bg_icon || '📜'} {char.bg_name}</span>
            {/if}
          </div>
          {#if onOpenAscension && (char?.level || 1) >= 3 && !char?.subclass_name}
            <button class="rail-ascend-btn" onclick={onOpenAscension} type="button">
              ✨ Specialize Archetype
            </button>
          {/if}
        </div>
      </div>

      <!-- Vitals Bars -->
      <div class="vitals">
        <div class="vital-row">
          <div class="vital-label"><span>HP</span><span>{char?.current_hp ?? 100}/{char?.max_hp ?? 100}</span></div>
          <div class="bar bar-hp"><div class="fill" style="width: {heroHpPct}%"></div></div>
        </div>
        <div class="vital-row">
          <div class="vital-label"><span>MP</span><span>{char?.current_mp ?? 50}/{char?.max_mp ?? 50}</span></div>
          <div class="bar bar-mp"><div class="fill" style="width: {heroMpPct}%"></div></div>
        </div>
      </div>

      <!-- Equipped Gear Paperdoll Quickstrip -->
      {#if inventory.equipment.weapon || inventory.equipment.chest || inventory.equipment.offhand || inventory.equipment.helmet}
        <div class="equip-strip">
          {#if inventory.equipment.weapon}
            <span class="equip-pill" title="Weapon: {inventory.equipment.weapon.name}">
              <span class="pill-icon">{inventory.equipment.weapon.icon || '⚔️'}</span>
              <span class="pill-name">{inventory.equipment.weapon.name}</span>
            </span>
          {/if}
          {#if inventory.equipment.chest}
            <span class="equip-pill" title="Armor: {inventory.equipment.chest.name}">
              <span class="pill-icon">{inventory.equipment.chest.icon || '🛡️'}</span>
              <span class="pill-name">{inventory.equipment.chest.name}</span>
            </span>
          {/if}
          {#if inventory.equipment.offhand}
            <span class="equip-pill" title="Offhand: {inventory.equipment.offhand.name}">
              <span class="pill-icon">{inventory.equipment.offhand.icon || '🛡️'}</span>
              <span class="pill-name">{inventory.equipment.offhand.name}</span>
            </span>
          {/if}
          {#if inventory.equipment.helmet}
            <span class="equip-pill" title="Head: {inventory.equipment.helmet.name}">
              <span class="pill-icon">{inventory.equipment.helmet.icon || '⛑️'}</span>
              <span class="pill-name">{inventory.equipment.helmet.name}</span>
            </span>
          {/if}
        </div>
      {/if}
    </section>

    <!-- BG3 Party Column: Companion Card -->
    <section class="card companion-card">
      <div class="card-head">
        <h4>🐾 Companion</h4>
        {#if companion.active}
          <button class="tactic-btn" onclick={cycleTactic} title="Cycle Companion Tactic">
            {#if (companion.active.tactic || 'aggressive') === 'aggressive'}
              ⚔️ ATK
            {:else if companion.active.tactic === 'defensive'}
              🛡️ DEF
            {:else}
              💚 SUP
            {/if}
          </button>
        {/if}
      </div>

      {#if companion.active}
        {@const c = companion.active}
        {@const compHpPct = Math.max(0, Math.min(100, (Number(c.current_hp ?? c.max_hp ?? 0) / Math.max(1, Number(c.max_hp ?? 1))) * 100))}
        <div class="comp-box">
          <div class="comp-portrait-frame">
            <img src="/portraits/portrait_companion_wolf.png" alt={c.name} class="comp-img" />
          </div>
          <div class="comp-info">
            <div class="comp-name-line">
              <span class="comp-name">{c.name}</span>
              <span class="comp-species">{c.species || 'Shadow Wolf'}</span>
            </div>
            <div class="bar bar-hp comp-hp-bar">
              <div class="fill" style="width: {compHpPct}%"></div>
            </div>
            <div class="comp-hp-text">{c.current_hp ?? '?'} / {c.max_hp ?? '?'} HP</div>
          </div>
        </div>
      {:else}
        <p class="empty">No companion bonded. Visit a Shrine to bind one.</p>
      {/if}
    </section>

    <!-- Active Statuses -->
    <section class="card">
      <h4>✨ Active Statuses</h4>
      {#if statusEffects.active.length > 0}
        <div class="chips">
          {#each statusEffects.active as st (st.id)}
            <span class="chip" class:debuff={st.type === 'debuff'} class:buff={st.type !== 'debuff'}>
              <span class="chip-icon">{st.icon ?? '✦'}</span>
              <span class="chip-name">{st.name}</span>
            </span>
          {/each}
        </div>
      {:else}
        <p class="empty">Steady. Nothing afflicting you.</p>
      {/if}
    </section>

    <!-- Quest Tracker -->
    <section class="card">
      <h4>📜 Quest Tracker</h4>
      {#if tracked}
        <div class="quest">
          <div class="quest-name">{tracked.name}</div>
          {#if objective}
            <div class="quest-obj">
              <span class="obj-text">{objective.description}</span>
              <span class="obj-progress">{objective.current}/{objective.required}</span>
            </div>
          {/if}
          <div class="waypoint">📍 Waypoint set</div>
        </div>
      {:else}
        <p class="empty">No active quests. Find an NPC with a 🪙 marker.</p>
      {/if}
    </section>
  {/if}
</aside>

<style>
  .left-rail {
    grid-area: left;
    width: 230px;
    height: 100%;
    background: #0a0a0e;
    border-right: 1px solid #23222a;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem;
    overflow-y: auto;
    transition: width 180ms ease;
  }
  .left-rail.collapsed {
    width: 44px;
    padding: 0.5rem 0;
    align-items: center;
  }
  .strip {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    width: 100%;
  }
  .strip-divider {
    width: 20px;
    height: 1px;
    background: #2a2a35;
    margin: 0.25rem 0;
  }
  .strip-icon {
    font-size: 1.1rem;
    cursor: default;
    opacity: 0.7;
    transition: opacity 120ms ease;
  }
  .strip-icon:hover { opacity: 1; }

  /* Compact Collapsed Tokens */
  .token {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid #b38b3a;
    position: relative;
    cursor: pointer;
    overflow: hidden;
    background: #15151e;
    box-shadow: 0 0 6px rgba(179, 139, 58, 0.25);
    transition: transform 140ms ease, border-color 140ms ease;
  }
  .token:hover {
    transform: scale(1.08);
    border-color: #ffd700;
  }
  .token-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .token-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    background: #111;
    color: #ffd700;
    font-size: 0.55rem;
    font-weight: 700;
    padding: 0 3px;
    border-radius: 4px;
    border: 1px solid #b38b3a;
  }
  .comp-token {
    border-color: #4a779d;
  }

  /* Cards */
  .card {
    background: #121218;
    border: 1px solid #23222d;
    border-radius: 0.375rem;
    padding: 0.5rem 0.625rem;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.375rem;
  }
  h4 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c9a14a;
    margin: 0;
    font-weight: 700;
  }

  /* Hero Card */
  .hero-card {
    border: 1px solid #3d3420;
    background: linear-gradient(180deg, #181512 0%, #100f14 100%);
    box-shadow: 0 0 12px rgba(179, 139, 58, 0.12);
  }
  .hero-header {
    display: flex;
    gap: 0.625rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .portrait-box {
    width: 54px;
    height: 54px;
    flex-shrink: 0;
    border: 2px solid #b38b3a;
    border-radius: 0.375rem;
    overflow: hidden;
    position: relative;
    background: #08080a;
    box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.8), 0 0 8px rgba(179, 139, 58, 0.25);
  }
  .portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .level-tag {
    position: absolute;
    bottom: 0;
    right: 0;
    background: rgba(10, 10, 14, 0.85);
    color: #ffd700;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.05rem 0.25rem;
    border-top-left-radius: 0.25rem;
    border-top: 1px solid #b38b3a;
    border-left: 1px solid #b38b3a;
    line-height: 1;
  }
  .hero-identity {
    flex: 1;
    min-width: 0;
  }
  .hero-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.875rem;
    font-weight: 700;
    color: #f3efe6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .hero-sub {
    font-size: 0.7rem;
    color: #a39e8b;
    margin-top: 0.125rem;
  }
  .race-class {
    color: #c9a14a;
    font-weight: 600;
  }
  .subclass-badge {
    display: inline-block;
    color: #e5b95c;
    background: rgba(229, 185, 92, 0.12);
    border: 1px solid rgba(229, 185, 92, 0.35);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    font-size: 0.625rem;
    font-weight: 600;
    margin-left: 0.25rem;
  }
  .bg-badge {
    display: inline-block;
    color: #8da4b8;
    background: rgba(141, 164, 184, 0.1);
    border: 1px solid rgba(141, 164, 184, 0.25);
    padding: 0.05rem 0.3rem;
    border-radius: 3px;
    font-size: 0.625rem;
    margin-top: 0.2rem;
  }
  .rail-ascend-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    width: 100%;
    margin-top: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.2), rgba(120, 90, 30, 0.4));
    border: 1px solid #c9a14a;
    border-radius: 4px;
    color: #ffd700;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.25);
    animation: pulse-glow 2.5s infinite ease-in-out;
    transition: all 150ms ease;
  }
  .rail-ascend-btn:hover {
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.4), rgba(140, 105, 35, 0.6));
    border-color: #ffd700;
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.45);
    transform: translateY(-1px);
  }
  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 6px rgba(201, 161, 74, 0.2); }
    50% { box-shadow: 0 0 14px rgba(255, 215, 0, 0.45); }
  }

  /* Vitals */
  .vitals {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .vital-row {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .vital-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.625rem;
    font-weight: 600;
    color: #a39e8b;
  }
  .bar {
    height: 6px;
    background: #08080c;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid #22222c;
  }
  .bar-hp .fill {
    height: 100%;
    background: linear-gradient(90deg, #8b1818, #dc3545);
    transition: width 240ms ease;
  }
  .bar-mp .fill {
    height: 100%;
    background: linear-gradient(90deg, #1b538c, #0d6efd);
    transition: width 240ms ease;
  }
  .equip-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.375rem;
    border-top: 1px solid rgba(201, 161, 74, 0.15);
  }
  .equip-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid #332d20;
    border-radius: 4px;
    padding: 0.125rem 0.375rem;
    font-size: 0.65rem;
    color: #dfd8c8;
    max-width: 100%;
    overflow: hidden;
  }
  .pill-icon {
    font-size: 0.75rem;
    flex-shrink: 0;
  }
  .pill-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.625rem;
  }

  /* Companion Card */
  .companion-card {
    border-color: #1e2632;
  }
  .tactic-btn {
    background: #18202c;
    border: 1px solid #334458;
    color: #8bb5d8;
    font-size: 0.6rem;
    font-weight: 700;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .tactic-btn:hover {
    background: #253346;
    color: #c5e0f8;
    border-color: #557599;
  }
  .comp-box {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.25rem;
  }
  .comp-portrait-frame {
    width: 40px;
    height: 40px;
    border-radius: 0.25rem;
    border: 1px solid #4a688a;
    overflow: hidden;
    background: #0a0e14;
    flex-shrink: 0;
  }
  .comp-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .comp-info {
    flex: 1;
    min-width: 0;
  }
  .comp-name-line {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.25rem;
  }
  .comp-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: #e5edf5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .comp-species {
    font-size: 0.625rem;
    color: #728a9f;
  }
  .comp-hp-bar {
    margin: 0.25rem 0;
  }
  .comp-hp-text {
    font-size: 0.625rem;
    color: #728a9f;
  }

  /* Quest & Statuses */
  .quest-name { font-weight: 600; font-size: 0.8125rem; color: #ece6e3; margin-bottom: 0.25rem; }
  .quest-obj {
    display: flex; justify-content: space-between; gap: 0.5rem;
    font-size: 0.7rem; color: #a39e8b;
  }
  .obj-progress { color: #c9a14a; font-variant-numeric: tabular-nums; flex-shrink: 0; }
  .waypoint { font-size: 0.65rem; color: #6a665b; margin-top: 0.375rem; }

  .chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .chip {
    display: inline-flex; align-items: center; gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    border: 1px solid #c9a14a;
    background: rgba(201, 161, 74, 0.08);
    color: #c9a14a;
  }
  .chip.debuff { border-color: #c93838; color: #c93838; background: rgba(201, 56, 56, 0.08); }

  .empty {
    font-size: 0.7rem;
    color: #6a665b;
    font-style: italic;
    margin: 0;
    line-height: 1.4;
  }
</style>
