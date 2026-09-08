<script lang="ts">
  import { onMount } from 'svelte'
  import {
    dmCampaigns,
    type DmCampaign,
    type DmCharacterSheet
  } from '$stores/dm_campaigns.svelte'
  import { character } from '$stores/character.svelte'
  import { audio } from '$stores/audio.svelte'

  interface Props {
    charId: number
  }
  let { charId }: Props = $props()

  let activeTab = $state<'campaigns' | 'sheet' | 'session' | 'gm_tools'>('campaigns')
  let isCreating = $state(false)

  // Campaign creation form state
  let newName = $state('')
  let newDescription = $state('')
  let newMaxPlayers = $state(6)
  let newWorldTone = $state('dark fantasy')
  let newRulesetId = $state(1)
  let newIsOneshot = $state(false)

  // Local editing copy of the d20 character sheet
  let editSheet = $state<DmCharacterSheet>({
    campaign_id: 1,
    name: '',
    race: 'Human',
    class_name: 'Warrior',
    level: 1,
    str: 14,
    dex: 12,
    con: 14,
    int_score: 10,
    wis: 12,
    cha: 10,
    max_hp: 24,
    current_hp: 24,
    armor_class: 15,
    background: 'Outlander',
    alignment: 'Neutral Good',
    backstory: 'A wandering soul seeking ancient relics and glory.',
    equipment_json: ['Longsword', 'Chainmail', "Explorer's Pack", 'Torch (x3)'],
    skills_json: ['Athletics', 'Perception', 'Survival'],
    spells_json: ['Shield', 'Magic Missile']
  })

  // Action input in session log
  let playerActionText = $state('')
  let gmNarrateText = $state('')
  let gmWeatherText = $state('storm')
  let targetCharId = $state<number>(0)

  // Dice roller state
  let selectedDice = $state<number>(20)
  let diceModifier = $state<number>(0)
  let rollMode = $state<'normal' | 'advantage' | 'disadvantage'>('normal')
  let lastRollResult = $state<{
    die: number
    rolls: number[]
    chosen: number
    mod: number
    total: number
    label: string
  } | null>(null)

  onMount(() => {
    targetCharId = charId
    dmCampaigns.listCampaigns()
    if (character.active) {
      if (!editSheet.name) editSheet.name = character.active.name
      if (character.active.level) editSheet.level = character.active.level
    }
  })

  // Synchronize editSheet when active campaign sheets change
  $effect(() => {
    const found = dmCampaigns.sheets.find(s => s.user_id === charId || s.name === character.active?.name)
    if (found) {
      editSheet = { ...found }
    } else if (dmCampaigns.activeCampaign) {
      editSheet.campaign_id = dmCampaigns.activeCampaign.id
    }
  })

  // Helper for d20 ability modifiers
  function calcMod(score: number): string {
    const mod = Math.floor((score - 10) / 2)
    return mod >= 0 ? `+${mod}` : `${mod}`
  }

  function handleSelectCampaign(c: DmCampaign) {
    dmCampaigns.setActive(c)
    editSheet.campaign_id = c.id
    activeTab = 'session'
  }

  function handleCreateCampaign(e: Event) {
    e.preventDefault()
    if (!newName.trim()) return
    dmCampaigns.createCampaign({
      name: newName.trim(),
      description: newDescription.trim(),
      maxPlayers: newMaxPlayers,
      worldTone: newWorldTone,
      rulesetId: newRulesetId,
      isOneshot: newIsOneshot
    })
    isCreating = false
    newName = ''
    newDescription = ''
    // Refresh campaign list
    setTimeout(() => dmCampaigns.listCampaigns(), 300)
  }

  function handleSaveSheet() {
    if (!dmCampaigns.activeCampaign) return
    dmCampaigns.saveSheet(dmCampaigns.activeCampaign.id, {
      ...editSheet,
      campaign_id: dmCampaigns.activeCampaign.id
    })
  }

  function handleSendAction(e: Event) {
    e.preventDefault()
    if (!playerActionText.trim() || !dmCampaigns.activeCampaign) return
    const text = playerActionText.trim()
    playerActionText = ''
    dmCampaigns.sendAction(text, dmCampaigns.activeCampaign.id)
  }

  function handleSendGmNarrate(e: Event) {
    e.preventDefault()
    if (!gmNarrateText.trim() || !dmCampaigns.activeCampaign) return
    const text = gmNarrateText.trim()
    gmNarrateText = ''
    dmCampaigns.sendNarrate(text, dmCampaigns.activeCampaign.id)
  }

  function rollDice(sides: number) {
    audio.play('dice')
    selectedDice = sides
    const r1 = Math.floor(Math.random() * sides) + 1
    const r2 = Math.floor(Math.random() * sides) + 1
    let chosen = r1
    let label = `Rolled 1d${sides}`

    if (sides === 20) {
      if (rollMode === 'advantage') {
        chosen = Math.max(r1, r2)
        label = `d20 with Advantage [${r1}, ${r2}]`
      } else if (rollMode === 'disadvantage') {
        chosen = Math.min(r1, r2)
        label = `d20 with Disadvantage [${r1}, ${r2}]`
      }

      if (chosen === 20) {
        setTimeout(() => audio.play('crit'), 250)
      } else if (chosen === 1) {
        setTimeout(() => audio.play('defeat'), 250)
      }
    }

    const total = chosen + diceModifier
    const modStr = diceModifier > 0 ? `+${diceModifier}` : diceModifier < 0 ? `${diceModifier}` : ''
    lastRollResult = {
      die: sides,
      rolls: sides === 20 && rollMode !== 'normal' ? [r1, r2] : [r1],
      chosen,
      mod: diceModifier,
      total,
      label: `${label}${modStr} = ${total}`
    }

    // Broadcast roll to active DM session
    if (dmCampaigns.activeCampaign) {
      const charName = character.active?.name || 'Player'
      const critText = sides === 20 && chosen === 20 ? ' (Natural 20! Critical Success!)' : sides === 20 && chosen === 1 ? ' (Natural 1! Critical Fumble!)' : ''
      dmCampaigns.sendAction(`rolls ${sides === 20 && rollMode !== 'normal' ? `d20 (${rollMode})` : `1d${sides}`}${modStr}: [${chosen}]${modStr} = ${total}${critText}`, dmCampaigns.activeCampaign.id)
    }
  }
</script>

<div class="campaigns-container">
  <!-- Header -->
  <header class="panel-header">
    <div class="title-row">
      <span class="icon">🎲</span>
      <div>
        <h2>Tabletop Campaigns</h2>
        <span class="subtitle">d20 System • Game Master Sessions • Custom Rulesets</span>
      </div>
    </div>

    <!-- Active Campaign Badge -->
    {#if dmCampaigns.activeCampaign}
      <div class="active-badge">
        <span class="pulse"></span>
        <span class="active-name">{dmCampaigns.activeCampaign.name}</span>
        <button class="leave-btn" onclick={() => dmCampaigns.setActive(null)}>Exit</button>
      </div>
    {/if}
  </header>

  <!-- Navigation Tabs -->
  <nav class="tabs">
    <button class:active={activeTab === 'campaigns'} onclick={() => activeTab = 'campaigns'}>
      📜 Campaigns ({dmCampaigns.list.length})
    </button>
    <button class:active={activeTab === 'sheet'} onclick={() => activeTab = 'sheet'}>
      🛡️ d20 Character Sheet
    </button>
    <button class:active={activeTab === 'session'} onclick={() => activeTab = 'session'}>
      💬 Session Log {#if dmCampaigns.sessionFeed.length > 0}({dmCampaigns.sessionFeed.length}){/if}
    </button>
    <button class:active={activeTab === 'gm_tools'} onclick={() => activeTab = 'gm_tools'}>
      👑 GM Toolkit
    </button>
  </nav>

  <!-- Tab 1: Campaigns Browser -->
  {#if activeTab === 'campaigns'}
    <div class="tab-content campaigns-tab">
      <div class="browser-actions">
        <button class="refresh-btn" onclick={() => dmCampaigns.listCampaigns()}>↻ Refresh</button>
        <button class="primary-btn" onclick={() => isCreating = !isCreating}>
          {isCreating ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>

      {#if isCreating}
        <form class="create-form" onsubmit={handleCreateCampaign}>
          <h3>Forge a New Tabletop Campaign</h3>
          <div class="form-grid">
            <label>
              <span>Campaign Title</span>
              <input type="text" bind:value={newName} placeholder="e.g. The Crypt of the Ashveil Wyrm" required />
            </label>

            <label>
              <span>World Tone</span>
              <select bind:value={newWorldTone}>
                <option value="dark fantasy">Dark Fantasy (Grim, Perilous)</option>
                <option value="high fantasy">High Fantasy (Heroic, Mythic)</option>
                <option value="eldritch">Eldritch Cosmic (Madness, Horror)</option>
                <option value="steampunk">Arcane Steampunk (Aether & Iron)</option>
              </select>
            </label>

            <label>
              <span>Ruleset System</span>
              <select bind:value={newRulesetId}>
                <option value={1}>Tabletop d20 Classic (Standard 5E/OGL rules)</option>
                <option value={2}>Standard Realm RPG (Eight primary attributes)</option>
                <option value={3}>Tactical Grid Strategy (Hex & Diamond movement)</option>
              </select>
            </label>

            <label>
              <span>Max Players</span>
              <input type="number" min="2" max="12" bind:value={newMaxPlayers} />
            </label>

            <label class="full-width">
              <span>Prologue & DM Pitch</span>
              <textarea rows="3" bind:value={newDescription} placeholder="Describe the adventure hook, setting, and stakes..."></textarea>
            </label>
          </div>

          <div class="form-actions">
            <button type="submit" class="confirm-btn">Create Campaign</button>
            <button type="button" class="cancel-btn" onclick={() => isCreating = false}>Cancel</button>
          </div>
        </form>
      {/if}

      <div class="campaign-list">
        {#each dmCampaigns.list as c}
          <div class="campaign-card" class:selected={dmCampaigns.activeCampaign?.id === c.id}>
            <div class="card-header">
              <div class="card-title-group">
                <h4>{c.name}</h4>
                <span class="tone-tag">{c.world_tone || 'dark fantasy'}</span>
              </div>
              <span class="status-pill status-{c.status || 'recruiting'}">{c.status || 'recruiting'}</span>
            </div>

            <p class="description">{c.description || 'No adventure notes provided by the Game Master.'}</p>

            <div class="card-meta">
              <span>👑 GM: <strong>{c.dm_name || 'Game Master'}</strong></span>
              <span>👥 Party: <strong>{c.player_count || 0} / {c.max_players || 6}</strong></span>
              <span>📜 Sessions: <strong>{c.session_count || 0}</strong></span>
            </div>

            <div class="card-actions">
              <button class="select-btn" onclick={() => handleSelectCampaign(c)}>
                {dmCampaigns.activeCampaign?.id === c.id ? '✓ Current Session' : 'Enter Campaign'}
              </button>
            </div>
          </div>
        {:else}
          <div class="empty-state">
            <p>No active tabletop campaigns found.</p>
            <button class="primary-btn" onclick={() => isCreating = true}>Create the First Campaign</button>
          </div>
        {/each}
      </div>
    </div>

  <!-- Tab 2: d20 Character Sheet -->
  {:else if activeTab === 'sheet'}
    <div class="tab-content sheet-tab">
      <div class="sheet-header">
        <div class="char-basics">
          <label class="basic-field">
            <span>Character Name</span>
            <input type="text" bind:value={editSheet.name} />
          </label>
          <label class="basic-field">
            <span>Class & Subclass</span>
            <input type="text" bind:value={editSheet.class_name} />
          </label>
          <label class="basic-field">
            <span>Race / Ancestry</span>
            <input type="text" bind:value={editSheet.race} />
          </label>
          <label class="basic-field small">
            <span>Level</span>
            <input type="number" min="1" max="20" bind:value={editSheet.level} />
          </label>
        </div>

        <div class="vitals-row">
          <div class="vital-card hp-card">
            <span class="lbl">Hit Points</span>
            <div class="vital-val">
              <input type="number" bind:value={editSheet.current_hp} />
              <span>/</span>
              <input type="number" bind:value={editSheet.max_hp} />
            </div>
          </div>
          <div class="vital-card">
            <span class="lbl">Armor Class</span>
            <div class="vital-val">
              <input type="number" bind:value={editSheet.armor_class} />
            </div>
          </div>
          <div class="vital-card">
            <span class="lbl">Proficiency</span>
            <div class="vital-val">
              <strong>+{Math.floor((editSheet.level - 1) / 4) + 2}</strong>
            </div>
          </div>
        </div>
      </div>

      <!-- Core 6 Ability Scores with auto-calculated d20 modifiers -->
      <div class="abilities-grid">
        <div class="ability-card">
          <span class="ab-name">STR</span>
          <span class="ab-mod">{calcMod(editSheet.str)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.str} />
          <span class="ab-label">Strength</span>
        </div>

        <div class="ability-card">
          <span class="ab-name">DEX</span>
          <span class="ab-mod">{calcMod(editSheet.dex)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.dex} />
          <span class="ab-label">Dexterity</span>
        </div>

        <div class="ability-card">
          <span class="ab-name">CON</span>
          <span class="ab-mod">{calcMod(editSheet.con)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.con} />
          <span class="ab-label">Constitution</span>
        </div>

        <div class="ability-card">
          <span class="ab-name">INT</span>
          <span class="ab-mod">{calcMod(editSheet.int_score)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.int_score} />
          <span class="ab-label">Intelligence</span>
        </div>

        <div class="ability-card">
          <span class="ab-name">WIS</span>
          <span class="ab-mod">{calcMod(editSheet.wis)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.wis} />
          <span class="ab-label">Wisdom</span>
        </div>

        <div class="ability-card">
          <span class="ab-name">CHA</span>
          <span class="ab-mod">{calcMod(editSheet.cha)}</span>
          <input type="number" min="1" max="30" bind:value={editSheet.cha} />
          <span class="ab-label">Charisma</span>
        </div>
      </div>

      <!-- Details & Backstory -->
      <div class="sheet-details-grid">
        <label class="details-field">
          <span>Backstory & Allegiance</span>
          <textarea rows="4" bind:value={editSheet.backstory}></textarea>
        </label>

        <label class="details-field">
          <span>Equipment & Inventory</span>
          <textarea rows="4" value={Array.isArray(editSheet.equipment_json) ? editSheet.equipment_json.join(', ') : ''} onchange={(e) => editSheet.equipment_json = e.currentTarget.value.split(',').map(s => s.trim())}></textarea>
        </label>
      </div>

      <div class="sheet-save-bar">
        {#if !dmCampaigns.activeCampaign}
          <span class="save-hint">Select a campaign to link and persist your sheet.</span>
        {:else}
          <span class="save-hint">Linked to: <strong>{dmCampaigns.activeCampaign.name}</strong></span>
        {/if}
        <button class="save-btn" onclick={handleSaveSheet} disabled={!dmCampaigns.activeCampaign}>
          💾 Save Character Sheet
        </button>
      </div>
    </div>

  <!-- Tab 3: Session Log & Dice Roller -->
  {:else if activeTab === 'session'}
    <div class="tab-content session-tab">
      <!-- Integrated Dice Roller Bar -->
      <div class="dice-bar">
        <div class="dice-selector">
          <span class="bar-title">🎲 Dice:</span>
          {#each [4, 6, 8, 10, 12, 20, 100] as sides}
            <button class="die-btn" class:active={selectedDice === sides} onclick={() => rollDice(sides)}>
              d{sides}
            </button>
          {/each}
        </div>

        <div class="dice-options">
          <label class="mod-input">
            <span>Mod:</span>
            <input type="number" min="-10" max="20" bind:value={diceModifier} />
          </label>

          <div class="mode-toggles">
            <button class:active={rollMode === 'normal'} onclick={() => rollMode = 'normal'}>Normal</button>
            <button class:active={rollMode === 'advantage'} onclick={() => rollMode = 'advantage'}>ADV</button>
            <button class:active={rollMode === 'disadvantage'} onclick={() => rollMode = 'disadvantage'}>DIS</button>
          </div>
        </div>

        {#if lastRollResult}
          <div class="roll-banner">
            <span class="banner-lbl">{lastRollResult.label}</span>
          </div>
        {/if}
      </div>

      <!-- Live Narrative Feed -->
      <div class="narrative-feed">
        {#if !dmCampaigns.activeCampaign}
          <div class="empty-feed">
            <p>No campaign active. Pick a campaign from the Campaigns tab to join the session feed.</p>
          </div>
        {:else if dmCampaigns.sessionFeed.length === 0}
          <div class="empty-feed">
            <p>Session ready for <strong>{dmCampaigns.activeCampaign.name}</strong>. Declare an action below to begin!</p>
          </div>
        {:else}
          {#each dmCampaigns.sessionFeed as m}
            <div class="feed-entry entry-{m.speaker.toLowerCase().includes('dm') ? 'dm' : m.speaker === 'System' ? 'system' : 'player'}">
              <span class="speaker-tag">{m.speaker}:</span>
              <span class="entry-body">{m.text}</span>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Action Prompt Input -->
      <form class="action-bar" onsubmit={handleSendAction}>
        <input
          type="text"
          bind:value={playerActionText}
          placeholder="Declare an action (e.g., 'I inspect the obsidian altar for hidden runes...')"
          disabled={!dmCampaigns.activeCampaign}
        />
        <button type="submit" disabled={!dmCampaigns.activeCampaign || !playerActionText.trim()}>
          Send Action
        </button>
      </form>
    </div>

  <!-- Tab 4: GM Toolkit -->
  {:else if activeTab === 'gm_tools'}
    <div class="tab-content gm-tab">
      {#if !dmCampaigns.activeCampaign}
        <div class="empty-state">
          <p>Select an active campaign first to access Game Master session controls.</p>
        </div>
      {:else}
        <div class="gm-controls-grid">
          <!-- GM Narration Broadcast -->
          <div class="gm-card">
            <h4>📢 Game Master Narration</h4>
            <p class="card-hint">Broadcasts an authoritative narrative beat directly to all players in the session.</p>
            <form onsubmit={handleSendGmNarrate}>
              <textarea rows="3" bind:value={gmNarrateText} placeholder="Describe the scene, atmospheric tension, or incoming foe..."></textarea>
              <button type="submit" class="primary-btn" disabled={!gmNarrateText.trim()}>Narrate to Party</button>
            </form>
          </div>

          <!-- Environment & Weather -->
          <div class="gm-card">
            <h4>🌧️ Environment & Weather</h4>
            <p class="card-hint">Shift the regional atmosphere and broadcast sensory cues.</p>
            <div class="weather-row">
              <select bind:value={gmWeatherText}>
                <option value="storm">Thunderstorm & Gale</option>
                <option value="fog">Dense Mist & Fog</option>
                <option value="blood_rain">Blood Rain (Ominous)</option>
                <option value="clear">Clear Starlight</option>
                <option value="cinder_fall">Cinder Fall (Ashveil)</option>
              </select>
              <button class="action-btn" onclick={() => dmCampaigns.setEnvironment(gmWeatherText)}>
                Change Weather
              </button>
            </div>
          </div>

          <!-- Tactical Movement Lock -->
          <div class="gm-card">
            <h4>🔒 Tactical Movement Controls</h4>
            <p class="card-hint">Halt or release overworld movement during scripted roleplay or turn order.</p>
            <div class="btn-group">
              <button class="lock-btn" onclick={() => dmCampaigns.lockAll(true, dmCampaigns.activeCampaign!.id)}>
                Freeze All Movement
              </button>
              <button class="unlock-btn" onclick={() => dmCampaigns.lockAll(false, dmCampaigns.activeCampaign!.id)}>
                Resume Movement
              </button>
            </div>
          </div>

          <!-- Screen / Atmosphere FX -->
          <div class="gm-card">
            <h4>💥 Screen & Impact Effects</h4>
            <p class="card-hint">Trigger sensory camera pulses and screen tremors across all player displays.</p>
            <div class="btn-group">
              <button class="fx-btn" onclick={() => dmCampaigns.setScreenEffect('shake', dmCampaigns.activeCampaign!.id)}>
                Earthquake Shake
              </button>
              <button class="fx-btn" onclick={() => dmCampaigns.setScreenEffect('flash', dmCampaigns.activeCampaign!.id)}>
                Arcane Flash
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .campaigns-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--surface);
    color: var(--fg);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
  }
  .title-row .icon { font-size: 1.5rem; }
  .title-row h2 { margin: 0; font-size: 1rem; color: var(--accent); }
  .subtitle { font-size: 0.75rem; color: var(--fg-muted); }

  .active-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid #10b981;
    border-radius: 9999px;
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
  }
  .pulse {
    width: 6px; height: 6px;
    background: #10b981;
    border-radius: 50%;
    box-shadow: 0 0 6px #10b981;
  }
  .leave-btn {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0 0.25rem;
  }

  .tabs {
    display: flex;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--fg-muted);
    padding: 0.625rem 0.5rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .tabs button.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    background: rgba(255, 255, 255, 0.03);
    font-weight: 600;
  }

  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  /* Campaigns List */
  .browser-actions {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
  }
  .refresh-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    border-radius: 0.25rem;
    padding: 0.375rem 0.75rem;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .primary-btn {
    background: var(--accent);
    color: #1a1208;
    border: none;
    border-radius: 0.25rem;
    padding: 0.375rem 0.875rem;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.75rem;
  }

  .create-form {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }
  .create-form h3 { margin-top: 0; font-size: 0.875rem; color: var(--accent); }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .form-grid label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .form-grid .full-width { grid-column: 1 / -1; }
  .form-grid input, .form-grid select, .form-grid textarea {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  .form-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    justify-content: flex-end;
  }
  .confirm-btn {
    background: var(--accent);
    color: #1a1208;
    border: none;
    padding: 0.375rem 1rem;
    font-weight: 600;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .cancel-btn {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  .campaign-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .campaign-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .campaign-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 10px rgba(212, 163, 89, 0.2);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .card-title-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .card-title-group h4 { margin: 0; font-size: 0.875rem; color: #fff; }
  .tone-tag {
    font-size: 0.65rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    text-transform: capitalize;
  }
  .status-pill {
    font-size: 0.65rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    text-transform: uppercase;
    font-weight: bold;
  }
  .status-recruiting { background: #065f46; color: #6ee7b7; }
  .status-active { background: #1e40af; color: #93c5fd; }
  .card-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.75rem;
    color: var(--fg-muted);
  }
  .select-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    font-weight: 600;
    width: 100%;
    margin-top: 0.25rem;
  }
  .select-btn:hover { background: var(--surface-2); }

  /* d20 Character Sheet */
  .char-basics {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1.5fr 0.8fr;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  .basic-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .basic-field input {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: #fff;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
  }

  .vitals-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }
  .vital-card {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    text-align: center;
  }
  .vital-card .lbl { font-size: 0.7rem; color: var(--fg-muted); text-transform: uppercase; }
  .vital-val {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    font-size: 1.25rem;
    font-weight: bold;
    color: var(--accent);
    margin-top: 0.25rem;
  }
  .vital-val input {
    width: 3.5rem;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    color: #fff;
    border-radius: 0.25rem;
    font-size: 1.1rem;
  }

  .abilities-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .ability-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .ab-name { font-weight: bold; font-size: 0.8rem; color: #fff; }
  .ab-mod { font-size: 1.25rem; font-weight: bold; color: var(--accent); }
  .ability-card input {
    width: 2.5rem;
    text-align: center;
    background: var(--surface);
    border: 1px solid var(--border);
    color: #fff;
    border-radius: 0.25rem;
    font-size: 0.75rem;
  }
  .ab-label { font-size: 0.65rem; color: var(--fg-muted); }

  .sheet-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }
  .details-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .details-field textarea {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    resize: vertical;
  }

  .sheet-save-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--surface-2);
    border-radius: 0.375rem;
    border: 1px solid var(--border);
  }
  .save-hint { font-size: 0.75rem; color: var(--fg-muted); }
  .save-btn {
    background: var(--accent);
    color: #1a1208;
    border: none;
    padding: 0.5rem 1.25rem;
    font-weight: bold;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .save-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Session & Dice Roller */
  .session-tab {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .dice-bar {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .dice-selector {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .bar-title { font-size: 0.75rem; color: var(--fg-muted); }
  .die-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: bold;
    cursor: pointer;
  }
  .die-btn.active { background: var(--accent); color: #1a1208; }
  .dice-options {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .mod-input {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .mod-input input {
    width: 2.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    color: #fff;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
  }
  .mode-toggles {
    display: flex;
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    overflow: hidden;
  }
  .mode-toggles button {
    background: var(--surface);
    border: none;
    color: var(--fg-muted);
    font-size: 0.65rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .mode-toggles button.active {
    background: var(--accent);
    color: #1a1208;
    font-weight: bold;
  }
  .roll-banner {
    margin-left: auto;
    background: rgba(212, 163, 89, 0.15);
    border: 1px solid var(--accent);
    border-radius: 0.25rem;
    padding: 0.25rem 0.75rem;
    font-size: 0.8rem;
    color: var(--accent);
    font-weight: bold;
  }

  .narrative-feed {
    flex: 1;
    min-height: 250px;
    background: #0d0e12;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.75rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .empty-feed {
    margin: auto;
    color: var(--fg-muted);
    font-size: 0.8rem;
    text-align: center;
  }
  .feed-entry {
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .entry-dm {
    background: rgba(147, 51, 234, 0.1);
    border-left: 3px solid #a855f7;
    color: #e9d5ff;
  }
  .entry-system {
    background: rgba(234, 179, 8, 0.1);
    border-left: 3px solid #eab308;
    color: #fef08a;
  }
  .entry-player {
    background: rgba(59, 130, 246, 0.1);
    border-left: 3px solid #3b82f6;
    color: #bfdbfe;
  }
  .speaker-tag {
    font-weight: bold;
    margin-right: 0.375rem;
  }

  .action-bar {
    display: flex;
    gap: 0.5rem;
  }
  .action-bar input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: #fff;
    padding: 0.5rem 0.75rem;
    border-radius: 0.25rem;
    font-size: 0.8rem;
  }
  .action-bar button {
    background: var(--accent);
    color: #1a1208;
    border: none;
    font-weight: bold;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }

  /* GM Tools */
  .gm-controls-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }
  .gm-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .gm-card h4 { margin: 0; font-size: 0.875rem; color: var(--accent); }
  .card-hint { font-size: 0.7rem; color: var(--fg-muted); margin: 0; }
  .gm-card textarea {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    color: #fff;
    padding: 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    box-sizing: border-box;
    margin-bottom: 0.5rem;
  }
  .weather-row {
    display: flex;
    gap: 0.5rem;
  }
  .weather-row select {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    color: #fff;
    border-radius: 0.25rem;
    padding: 0.375rem;
    font-size: 0.75rem;
  }
  .action-btn {
    background: var(--accent);
    color: #1a1208;
    border: none;
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    font-weight: bold;
    cursor: pointer;
  }
  .btn-group {
    display: flex;
    gap: 0.5rem;
  }
  .lock-btn {
    flex: 1;
    background: #7f1d1d;
    color: #fca5a5;
    border: 1px solid #dc2626;
    padding: 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .unlock-btn {
    flex: 1;
    background: #064e3b;
    color: #6ee7b7;
    border: 1px solid #059669;
    padding: 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .fx-btn {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    cursor: pointer;
  }
</style>
