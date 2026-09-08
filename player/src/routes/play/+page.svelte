<script lang="ts">
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import { character } from '$stores/character.svelte'
  import { api } from '$phoenix/api'

  interface RaceOption {
    id: number
    name: string
    description?: string | null
    icon?: string
    bonus_hp?: number
    bonus_mp?: number
    bonus_atk?: number
    bonus_def?: number
    bonus_mo?: number
    bonus_md?: number
    bonus_speed?: number
    bonus_luck?: number
  }

  interface ClassOption {
    id: number
    name: string
    description?: string | null
    icon?: string
    base_hp?: number
    base_mp?: number
    base_atk?: number
    base_def?: number
    base_mo?: number
    base_md?: number
    base_speed?: number
    base_luck?: number
  }

  interface BackgroundOption {
    id: number
    name: string
    tag?: string
    icon?: string
    description?: string | null
    bonus_hp?: number
    bonus_str?: string | null
    npc_reaction?: string | null
    companion_reaction?: string | null
    enemy_reaction?: string | null
  }

  interface OptionsResp {
    success: boolean
    races?: RaceOption[]
    classes?: ClassOption[]
    backgrounds?: BackgroundOption[]
  }

  let races = $state<RaceOption[]>([])
  let classes = $state<ClassOption[]>([])
  let backgrounds = $state<BackgroundOption[]>([])

  let creating = $state(false)
  let step = $state<1 | 2 | 3 | 4>(1)
  let newName = $state('')
  let raceId = $state<number>(1)
  let classId = $state<number>(1)
  let backgroundId = $state<number>(1)
  let visualPrompt = $state('')
  let createError = $state<string | null>(null)

  // Visual Studio Customizer State
  let previewMode = $state<'portrait' | 'fullbody'>('portrait')
  let selectedMask = $state<string>('None')
  let selectedHairStyle = $state<string>('Braided Dreadlocks')
  let selectedHairColor = $state<string>('Raven Black')
  let selectedEyeColor = $state<string>('Misting Silver Glow')
  let selectedScar = $state<string>('Crossed Blade Cheek Scar')
  let selectedEmote = $state<string>('Victory Groove')
  let previewEmoteActive = $state<boolean>(false)
  let previewEmoteTimeout: ReturnType<typeof setTimeout> | null = null

  const masks = [
    { id: 'None', label: 'Bare Visage', icon: '👤' },
    { id: 'Silk Assassin Half-Mask', label: 'Silk Half-Mask', icon: '🥷' },
    { id: 'Plague Doctor Beak Mask', label: 'Plague Beak Mask', icon: '🦅' },
    { id: 'Gilded Venetian Masquerade', label: 'Gilded Masquerade', icon: '🎭' },
    { id: 'Eyepatch & Brow Scar', label: 'Eyepatch & Scar', icon: '👁️' },
    { id: 'Crimson War Paint', label: 'Crimson War Paint', icon: '🎨' },
  ]

  const hairStyles = [
    'Braided Dreadlocks',
    'Silver Elven Mane',
    'Close Crop Buzzcut',
    'Wild Windblown',
    'Crowned Topknot',
    'Arcane Shaved Runic',
  ]

  const hairColors = [
    { name: 'Raven Black', color: '#1a1a1f' },
    { name: 'Silver Platinum', color: '#d0d4dc' },
    { name: 'Crimson Auburn', color: '#882222' },
    { name: 'Golden Blonde', color: '#ffd700' },
    { name: 'Void Purple', color: '#8a2be2' },
    { name: 'Emerald Tint', color: '#2e8b57' },
    { name: 'Snow White', color: '#f5f5f5' },
  ]

  const eyeColors = [
    { name: 'Misting Silver Glow', icon: '⚪' },
    { name: 'Piercing Amber', icon: '🟡' },
    { name: 'Deep Void Amethyst', icon: '🟣' },
    { name: 'Emerald Feline', icon: '🟢' },
    { name: 'Solar Flare Gold', icon: '🟠' },
    { name: 'Natural Hazel', icon: '🟤' },
  ]

  const scars = [
    'None',
    'Crossed Blade Cheek Scar',
    'Blind Eye Slash',
    'Arcane Runic Tattoos',
    'Frostbite Frosting',
    'War Ashes',
  ]

  const emotesList = [
    { id: 'Victory Groove', icon: '🕺', shout: 'Moves like thunder!' },
    { id: 'Blade Twirl',    icon: '⚔️', shout: 'Locked & ready for battle!' },
    { id: 'Spell Surge',    icon: '🧙', shout: 'Arcane fury awaits!' },
    { id: 'Cozy Rest',      icon: '☕', shout: 'Toasting by the fire...' },
    { id: 'Courtly Bow',    icon: '🎭', shout: "At your honor's service." },
    { id: 'Titan Flex',     icon: '💪', shout: 'Unstoppable power!' },
  ]

  const promptTags = [
    'Battle-scarred',
    'Misting silver eyes',
    'Clockwork brass gears',
    'Ironwood barkskin',
    'Bioluminescent gills',
    'Feathered wings',
    'Chitin carapace',
    'Solar plasma corona',
    'Runed cloak',
    'Shadow hood',
    'Braided silver hair',
    'Obsidian daggers',
    'Bone staff',
    'Blood runes',
    'Gold filigree armor'
  ]

  onMount(async () => {
    void character.loadList()
    try {
      const r = await api.get<OptionsResp>('/api/character-options')
      if (r.success) {
        if (r.races?.length) races = r.races
        if (r.classes?.length) classes = r.classes
        if (r.backgrounds?.length) backgrounds = r.backgrounds
      }
    } catch { /* fallback */ }
  })

  async function pick(charId: number) {
    await character.loadActive(charId)
    goto(`/play/${charId}`)
  }

  const selectedRace = $derived(races.find(r => r.id === raceId) ?? races[0])
  const selectedClass = $derived(classes.find(c => c.id === classId) ?? classes[0])
  const selectedBg = $derived(backgrounds.find(b => b.id === backgroundId) ?? backgrounds[0])

  function previewPortrait(clsName: string | undefined): string {
    const name = (clsName || '').toLowerCase()
    if (name.includes('mage') || name.includes('wizard') || name.includes('sorcerer') || name.includes('warlock') || name.includes('necro') || name.includes('chrono') || name.includes('glyph') || name.includes('storm')) {
      return '/portraits/portrait_mage.png'
    }
    if (name.includes('rogue') || name.includes('ranger') || name.includes('monk') || name.includes('thief') || name.includes('assassin') || name.includes('shadow') || name.includes('hunter') || name.includes('artificer')) {
      return '/portraits/portrait_rogue.png'
    }
    if (name.includes('cleric') || name.includes('druid')) {
      return '/portraits/portrait_mage.png'
    }
    return '/portraits/portrait_warrior.png'
  }

  function getHeroPaperdollByClass(clsName: string | undefined): string {
    const name = (clsName || '').toLowerCase()
    if (name.includes('mage') || name.includes('wizard') || name.includes('sorcerer') || name.includes('necro') || name.includes('glyph') || name.includes('chrono') || name.includes('storm')) {
      return '/paperdoll/mage.jpg'
    }
    if (name.includes('rogue') || name.includes('thief') || name.includes('assassin') || name.includes('shadow') || name.includes('hunter') || name.includes('artificer') || name.includes('scout')) {
      return '/paperdoll/rogue.jpg'
    }
    if (name.includes('cleric') || name.includes('priest') || name.includes('paladin') || name.includes('templar') || name.includes('inquisitor') || name.includes('druid')) {
      return '/paperdoll/cleric.jpg'
    }
    if (name.includes('ranger') || name.includes('archer') || name.includes('beast') || name.includes('monk')) {
      return '/paperdoll/ranger.jpg'
    }
    return '/paperdoll/warrior.jpg'
  }

  function testCreatorEmote(emName: string) {
    selectedEmote = emName
    previewEmoteActive = true
    if (previewEmoteTimeout) clearTimeout(previewEmoteTimeout)
    previewEmoteTimeout = setTimeout(() => {
      previewEmoteActive = false
    }, 3500)
  }

  const creatorEmoteClass = $derived.by(() => {
    if (!previewEmoteActive) return ''
    if (selectedEmote.includes('Groove')) return 'emote-dance'
    if (selectedEmote.includes('Twirl')) return 'emote-twirl'
    if (selectedEmote.includes('Surge')) return 'emote-surge'
    if (selectedEmote.includes('Rest')) return 'emote-rest'
    if (selectedEmote.includes('Bow')) return 'emote-bow'
    if (selectedEmote.includes('Flex')) return 'emote-flex'
    return ''
  })

  const currentEmoteDef = $derived(emotesList.find(e => e.id === selectedEmote) || emotesList[0])

  const combinedStats = $derived.by(() => {
    const r = selectedRace
    const c = selectedClass
    const b = selectedBg
    const hp = (c?.base_hp ?? 100) + (r?.bonus_hp ?? 0) + (b?.bonus_hp ?? 0)
    const mp = (c?.base_mp ?? 50) + (r?.bonus_mp ?? 0)
    const atk = (c?.base_atk ?? 10) + (r?.bonus_atk ?? 0)
    const def = (c?.base_def ?? 5) + (r?.bonus_def ?? 0)
    const mo = (c?.base_mo ?? 5) + (r?.bonus_mo ?? 0)
    const spd = (c?.base_speed ?? 10) + (r?.bonus_speed ?? 0)
    return { hp, mp, atk, def, mo, spd }
  })

  const fullVisualSummary = $derived.by(() => {
    const parts: string[] = []
    if (selectedMask && selectedMask !== 'None') parts.push(`Mask: ${selectedMask}`)
    if (selectedHairStyle) parts.push(`Hair: ${selectedHairColor} ${selectedHairStyle}`)
    if (selectedEyeColor) parts.push(`Eyes: ${selectedEyeColor}`)
    if (selectedScar && selectedScar !== 'None') parts.push(`Marking: ${selectedScar}`)
    if (selectedEmote) parts.push(`Signature Emote: ${selectedEmote}`)
    if (visualPrompt.trim()) parts.push(visualPrompt.trim())
    return parts.join(' | ')
  })

  function addTag(tag: string) {
    if (!visualPrompt) {
      visualPrompt = tag
    } else if (!visualPrompt.toLowerCase().includes(tag.toLowerCase())) {
      visualPrompt += `, ${tag.toLowerCase()}`
    }
  }

  async function createDirect(ev: Event) {
    ev.preventDefault()
    createError = null
    try {
      const res = await api.post<{ success: boolean; charId?: number; message?: string }>(
        '/api/characters/create',
        {
          name: newName,
          raceId,
          classId,
          backgroundId,
          visualPrompt: fullVisualSummary,
          visualTraits: {
            mask: selectedMask,
            hair_style: selectedHairStyle,
            hair_color: selectedHairColor,
            eyes: selectedEyeColor,
            scar: selectedScar,
            signature_emote: selectedEmote,
            custom_notes: visualPrompt
          },
          portraitUrl: previewPortrait(selectedClass?.name)
        }
      )
      if (!res.success || !res.charId) {
        createError = res.message ?? 'Create failed'
        return
      }
      newName = ''
      visualPrompt = ''
      creating = false
      step = 1
      await character.loadList()
      await pick(res.charId)
    } catch (err) {
      createError = (err as Error).message
    }
  }
</script>

<div class="wrap">
  {#if !creating}
    <div class="head-bar">
      <h1>Choose your hero</h1>
      <button class="primary forge-trigger-btn" onclick={() => { creating = true; step = 1; }}>
        ✨ Forge New Hero
      </button>
    </div>

    {#if character.loading && character.list.length === 0}
      <p class="muted">Loading characters…</p>
    {:else if character.error}
      <p class="error">{character.error}</p>
    {/if}

    <ul class="char-list">
      {#each character.list as c (c.id)}
        <li>
          <button class="char-card" onclick={() => pick(c.id)}>
            <div class="char-portrait-frame">
              <img src={c.portrait_url || previewPortrait(c.class_name || undefined)} alt={c.name} class="char-portrait-img" />
              <span class="char-lvl">Lv.{c.level}</span>
            </div>
            <div class="char-details">
              <span class="char-name">{c.name}</span>
              <span class="char-meta">
                {c.race_name || 'Human'} · {c.subclass_name ? c.subclass_name : (c.class_name || 'Warrior')}
                {#if c.subclass_title}
                  <span class="card-subclass-title">({c.subclass_title})</span>
                {/if}
              </span>
              {#if c.bg_name}
                <div class="card-bg-pill">
                  <span>{c.bg_icon || '📜'} {c.bg_name}</span>
                </div>
              {/if}
            </div>
          </button>
        </li>
      {/each}

      <li>
        <button class="char-card create" onclick={() => { creating = true; step = 1; }}>
          <span class="plus-icon">＋</span>
          <span class="create-label">Forge New Hero</span>
        </button>
      </li>
    </ul>
  {:else}
    <!-- MULTI-STEP CRPG CHARACTER CREATOR -->
    <div class="creator-container">
      <div class="creator-nav">
        <div class="steps-breadcrumbs">
          <button type="button" class="step-btn" class:active={step === 1} onclick={() => (step = 1)}>
            <span class="step-num">1</span> Lineage
          </button>
          <span class="step-arrow">➔</span>
          <button type="button" class="step-btn" class:active={step === 2} onclick={() => (step = 2)}>
            <span class="step-num">2</span> Class
          </button>
          <span class="step-arrow">➔</span>
          <button type="button" class="step-btn" class:active={step === 3} onclick={() => (step = 3)}>
            <span class="step-num">3</span> Origin
          </button>
          <span class="step-arrow">➔</span>
          <button type="button" class="step-btn" class:active={step === 4} onclick={() => (step = 4)}>
            <span class="step-num">4</span> Hero Forge
          </button>
        </div>
        <button type="button" class="cancel-btn" onclick={() => (creating = false)}>✕ Close</button>
      </div>

      <form onsubmit={createDirect} class="creator-body">
        <!-- STEP 1: LINEAGE & RACE -->
        {#if step === 1}
          <div class="step-panel">
            <div class="panel-header">
              <h2>Select Ancestry & Lineage</h2>
              <p class="panel-desc">Choose your character's race and planar origin. Each lineage grants distinct physical and magical attributes.</p>
            </div>

            <div class="options-grid">
              {#each races as r (r.id)}
                <div
                  class="option-card"
                  class:selected={raceId === r.id}
                  onclick={() => (raceId = r.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => { if (e.key === 'Enter') raceId = r.id }}
                >
                  <div class="opt-head">
                    <span class="opt-icon">{r.icon || '👤'}</span>
                    <span class="opt-title">{r.name}</span>
                  </div>
                  <p class="opt-desc">{r.description || ''}</p>
                  <div class="opt-bonuses">
                    {#if (r.bonus_hp ?? 0) > 0}<span class="badge hp">+{r.bonus_hp} HP</span>{/if}
                    {#if (r.bonus_mp ?? 0) > 0}<span class="badge mp">+{r.bonus_mp} MP</span>{/if}
                    {#if (r.bonus_atk ?? 0) > 0}<span class="badge atk">+{r.bonus_atk} ATK</span>{/if}
                    {#if (r.bonus_def ?? 0) > 0}<span class="badge def">+{r.bonus_def} DEF</span>{/if}
                    {#if (r.bonus_mo ?? 0) > 0}<span class="badge mo">+{r.bonus_mo} MAG</span>{/if}
                    {#if (r.bonus_speed ?? 0) > 0}<span class="badge spd">+{r.bonus_speed} SPD</span>{/if}
                  </div>
                </div>
              {/each}
            </div>

            <div class="nav-actions">
              <div></div>
              <button type="button" class="primary next-btn" onclick={() => (step = 2)}>
                Next: Vocation & Class ➔
              </button>
            </div>
          </div>
        {/if}

        <!-- STEP 2: CLASS & VOCATION -->
        {#if step === 2}
          <div class="step-panel">
            <div class="panel-header">
              <h2>Select Vocation & Class</h2>
              <p class="panel-desc">Determine your combat discipline, battle actions, starting arsenal, and tactical skills.</p>
            </div>

            <div class="options-grid">
              {#each classes as c (c.id)}
                <div
                  class="option-card"
                  class:selected={classId === c.id}
                  onclick={() => (classId = c.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => { if (e.key === 'Enter') classId = c.id }}
                >
                  <div class="opt-head">
                    <span class="opt-icon">{c.icon || '⚔️'}</span>
                    <span class="opt-title">{c.name}</span>
                  </div>
                  <p class="opt-desc">{c.description || ''}</p>
                  <div class="opt-bonuses">
                    <span class="badge hp">{c.base_hp || 100} HP</span>
                    <span class="badge mp">{c.base_mp || 50} MP</span>
                    <span class="badge atk">{c.base_atk || 10} ATK</span>
                    <span class="badge def">{c.base_def || 5} DEF</span>
                  </div>
                </div>
              {/each}
            </div>

            <div class="nav-actions">
              <button type="button" class="secondary" onclick={() => (step = 1)}>⬅ Back: Lineage</button>
              <button type="button" class="primary next-btn" onclick={() => (step = 3)}>Next: Origin Background ➔</button>
            </div>
          </div>
        {/if}

        <!-- STEP 3: BACKGROUND & ORIGIN (20 ARCHETYPES) -->
        {#if step === 3}
          <div class="step-panel">
            <div class="panel-header">
              <h2>Select Origin & Background (20 Archetypes)</h2>
              <p class="panel-desc">Where did your hero forge their resolve? Your background grants permanent attribute bonuses and shapes how NPCs, companions, and enemies react to you in the world.</p>
            </div>

            <div class="options-grid backgrounds-grid">
              {#each backgrounds as b (b.id)}
                <div
                  class="option-card bg-card"
                  class:selected={backgroundId === b.id}
                  onclick={() => (backgroundId = b.id)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => { if (e.key === 'Enter') backgroundId = b.id }}
                >
                  <div class="opt-head">
                    <span class="opt-icon">{b.icon || '📜'}</span>
                    <span class="opt-title">{b.name}</span>
                  </div>
                  <p class="opt-desc">{b.description || ''}</p>

                  {#if b.bonus_str}
                    <div class="opt-bonuses">
                      <span class="badge perk">{b.bonus_str}</span>
                    </div>
                  {/if}

                  <!-- World Reactions Tiers -->
                  <div class="reaction-preview">
                    {#if b.npc_reaction}
                      <div class="reaction-row">
                        <span class="r-icon">🗣️</span>
                        <span class="r-text"><strong>NPCs:</strong> {b.npc_reaction}</span>
                      </div>
                    {/if}
                    {#if b.companion_reaction}
                      <div class="reaction-row">
                        <span class="r-icon">🤝</span>
                        <span class="r-text"><strong>Companions:</strong> {b.companion_reaction}</span>
                      </div>
                    {/if}
                    {#if b.enemy_reaction}
                      <div class="reaction-row">
                        <span class="r-icon">⚔️</span>
                        <span class="r-text"><strong>Enemies:</strong> {b.enemy_reaction}</span>
                      </div>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <div class="nav-actions">
              <button type="button" class="secondary" onclick={() => (step = 2)}>⬅ Back: Class</button>
              <button type="button" class="primary next-btn" onclick={() => (step = 4)}>Next: Hero Forge & Visuals ➔</button>
            </div>
          </div>
        {/if}

        <!-- STEP 4: MODULAR CHARACTER CREATOR VISUAL STUDIO -->
        {#if step === 4}
          <div class="step-panel forge-panel visual-studio-panel">
            <div class="panel-header">
              <h2>Modular Character Creator Visual Studio</h2>
              <p class="panel-desc">Customize your hero's facial features, masks, hairstyle, arcane eye radiance, battle scars, signature emote pose, and custom visual nuance.</p>
            </div>

            <div class="studio-layout">
              <!-- LEFT COLUMN: VISUAL CUSTOMIZER MODULES -->
              <div class="studio-customizer">
                <!-- Character Name -->
                <div class="customizer-block">
                  <label for="char-name" class="block-label">
                    <span class="lbl-icon">🏷️</span> Character Name
                  </label>
                  <input
                    id="char-name"
                    type="text"
                    bind:value={newName}
                    placeholder="Name your hero..."
                    required
                    minlength="2"
                    maxlength="20"
                    pattern="[A-Za-z][A-Za-z0-9 '\-]*"
                    class="hero-name-input"
                  />
                </div>

                <!-- Visage & Face Mask -->
                <div class="customizer-block">
                  <div class="block-header">
                    <span class="block-label"><span class="lbl-icon">🎭</span> Visage & Face Mask (Face Slot)</span>
                    <span class="selected-pill">{selectedMask}</span>
                  </div>
                  <div class="chips-grid">
                    {#each masks as m}
                      <button
                        type="button"
                        class="feature-chip"
                        class:active={selectedMask === m.id}
                        onclick={() => (selectedMask = m.id)}
                      >
                        <span class="chip-icon">{m.icon}</span>
                        <span class="chip-label">{m.label}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Hairstyle & Hair Color -->
                <div class="customizer-block">
                  <div class="block-header">
                    <span class="block-label"><span class="lbl-icon">💇</span> Hairstyle & Color</span>
                    <span class="selected-pill">{selectedHairColor} · {selectedHairStyle}</span>
                  </div>
                  <div class="chips-grid">
                    {#each hairStyles as style}
                      <button
                        type="button"
                        class="feature-chip"
                        class:active={selectedHairStyle === style}
                        onclick={() => (selectedHairStyle = style)}
                      >
                        <span class="chip-label">{style}</span>
                      </button>
                    {/each}
                  </div>
                  <!-- Hair Color Swatches -->
                  <div class="color-swatches-row">
                    <span class="swatch-label">Hair Tone:</span>
                    {#each hairColors as c}
                      <button
                        type="button"
                        class="color-swatch-btn"
                        class:active={selectedHairColor === c.name}
                        style="background-color: {c.color};"
                        onclick={() => (selectedHairColor = c.name)}
                        title="{c.name}"
                      ></button>
                    {/each}
                  </div>
                </div>

                <!-- Eyes & Arcane Radiance -->
                <div class="customizer-block">
                  <div class="block-header">
                    <span class="block-label"><span class="lbl-icon">👁️</span> Eyes & Arcane Radiance</span>
                    <span class="selected-pill">{selectedEyeColor}</span>
                  </div>
                  <div class="chips-grid">
                    {#each eyeColors as eye}
                      <button
                        type="button"
                        class="feature-chip"
                        class:active={selectedEyeColor === eye.name}
                        onclick={() => (selectedEyeColor = eye.name)}
                      >
                        <span class="chip-icon">{eye.icon}</span>
                        <span class="chip-label">{eye.name}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Battle Scars & Skin Markings -->
                <div class="customizer-block">
                  <div class="block-header">
                    <span class="block-label"><span class="lbl-icon">⚡</span> Battle Scars & Markings</span>
                    <span class="selected-pill">{selectedScar}</span>
                  </div>
                  <div class="chips-grid">
                    {#each scars as scar}
                      <button
                        type="button"
                        class="feature-chip"
                        class:active={selectedScar === scar}
                        onclick={() => (selectedScar = scar)}
                      >
                        <span class="chip-label">{scar}</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Signature Emote Pose (Fortnite / MMO Style) -->
                <div class="customizer-block">
                  <div class="block-header">
                    <span class="block-label"><span class="lbl-icon">🕺</span> Signature Emote Pose</span>
                    <span class="selected-pill">{selectedEmote}</span>
                  </div>
                  <div class="chips-grid emotes-chips-grid">
                    {#each emotesList as em}
                      <button
                        type="button"
                        class="feature-chip emote-chip"
                        class:active={selectedEmote === em.id}
                        onclick={() => testCreatorEmote(em.id)}
                        title="Click to preview animation: {em.shout}"
                      >
                        <span class="chip-icon">{em.icon}</span>
                        <span class="chip-label">{em.id}</span>
                        <span class="test-play-badge">▶</span>
                      </button>
                    {/each}
                  </div>
                </div>

                <!-- Visual Nuance Dialogue Box -->
                <div class="customizer-block">
                  <label for="visual-prompt" class="block-label">
                    <span class="lbl-icon">✍️</span> Freeform Dialogue & Visual Nuance (Sweet Spot)
                  </label>
                  <p class="customizer-hint">
                    Type any extra details, quirks, personal relics, or outfit nuances for DM interactions and AI generation:
                  </p>
                  <textarea
                    id="visual-prompt"
                    bind:value={visualPrompt}
                    placeholder="Describe custom details (e.g. 'Wears a dark amethyst scarf over cuirass, blind in right eye, golden filigree on shoulder pauldrons')..."
                    rows="3"
                    class="prompt-textarea"
                  ></textarea>

                  <div class="prompt-pills">
                    <span class="pill-label">Quick Accents:</span>
                    {#each promptTags as tag}
                      <button type="button" class="tag-pill" onclick={() => addTag(tag)}>+ {tag}</button>
                    {/each}
                  </div>
                </div>
              </div>

              <!-- RIGHT COLUMN: LIVE VISUAL STUDIO PREVIEW & STAT SHEET -->
              <div class="studio-preview-card">
                <!-- Camera View Switcher -->
                <div class="studio-camera-bar">
                  <button
                    type="button"
                    class="cam-toggle"
                    class:active={previewMode === 'portrait'}
                    onclick={() => (previewMode = 'portrait')}
                  >
                    🔍 Inspect Visage
                  </button>
                  <button
                    type="button"
                    class="cam-toggle"
                    class:active={previewMode === 'fullbody'}
                    onclick={() => (previewMode = 'fullbody')}
                  >
                    🛡️ Full Pedestal
                  </button>
                </div>

                <!-- Dynamic Avatar Render Frame -->
                <div class="studio-render-container" class:fullbody-mode={previewMode === 'fullbody'}>
                  <div class="avatar-frame {creatorEmoteClass}">
                    {#if previewMode === 'portrait'}
                      <img
                        src={previewPortrait(selectedClass?.name)}
                        alt="Character Portrait Preview"
                        class="avatar-portrait-img"
                      />
                    {:else}
                      <img
                        src={getHeroPaperdollByClass(selectedClass?.name)}
                        alt="Character Full Body Preview"
                        class="avatar-paperdoll-img"
                      />
                    {/if}

                    <!-- Comic Emote Shout Bubble -->
                    {#if previewEmoteActive}
                      <div class="creator-emote-shout-bubble">
                        <span class="bubble-icon">{currentEmoteDef.icon}</span>
                        <span class="bubble-text">"{currentEmoteDef.shout}"</span>
                      </div>
                    {/if}
                  </div>
                </div>

                <!-- Hero Meta Summary -->
                <div class="preview-summary">
                  <div class="summary-name">{newName || 'Nameless Legend'}</div>
                  <div class="summary-line">
                    <span class="sum-tag ancestry">{selectedRace?.name || 'Human'}</span>
                    <span class="sum-tag class-tag">{selectedClass?.name || 'Warrior'}</span>
                    <span class="sum-tag bg-tag">{selectedBg?.name || 'Outlander'}</span>
                  </div>

                  <!-- Chosen Traits Pills -->
                  <div class="traits-summary-strip">
                    {#if selectedMask && selectedMask !== 'None'}
                      <span class="trait-tag mask-trait">🎭 {selectedMask}</span>
                    {/if}
                    <span class="trait-tag hair-trait">💇 {selectedHairColor} {selectedHairStyle}</span>
                    <span class="trait-tag eye-trait">👁️ {selectedEyeColor}</span>
                    {#if selectedScar && selectedScar !== 'None'}
                      <span class="trait-tag scar-trait">⚡ {selectedScar}</span>
                    {/if}
                    <span class="trait-tag emote-trait">🕺 {selectedEmote}</span>
                  </div>

                  <!-- Combined Starting Stats Sheet -->
                  <div class="combined-stats-sheet">
                    <div class="stats-header">Starting Base Attributes</div>
                    <div class="stats-grid">
                      <div class="cstat"><span class="ck">❤️ HP:</span> <span class="cv">{combinedStats.hp}</span></div>
                      <div class="cstat"><span class="ck">💙 MP:</span> <span class="cv">{combinedStats.mp}</span></div>
                      <div class="cstat"><span class="ck">⚔️ ATK:</span> <span class="cv">{combinedStats.atk}</span></div>
                      <div class="cstat"><span class="ck">🛡️ DEF:</span> <span class="cv">{combinedStats.def}</span></div>
                      <div class="cstat"><span class="ck">🔮 MAG:</span> <span class="cv">{combinedStats.mo}</span></div>
                      <div class="cstat"><span class="ck">⚡ SPD:</span> <span class="cv">{combinedStats.spd}</span></div>
                    </div>
                    {#if selectedBg?.bonus_str}
                      <div class="bg-perk-line">
                        <span class="perk-badge">Origin Perk:</span> {selectedBg.bonus_str}
                      </div>
                    {/if}
                  </div>

                  <!-- Synthesized Nuance Prompt Preview -->
                  {#if fullVisualSummary}
                    <div class="summary-prompt">
                      <em>"{fullVisualSummary}"</em>
                    </div>
                  {/if}
                </div>
              </div>
            </div>

            {#if createError}<p class="error">{createError}</p>{/if}

            <div class="nav-actions">
              <button type="button" class="secondary" onclick={() => (step = 3)}>⬅ Back: Origin</button>
              <button type="submit" class="primary forge-btn" disabled={character.loading || !newName.trim()}>
                ✨ Forge Hero & Enter World
              </button>
            </div>
          </div>
        {/if}
      </form>
    </div>
  {/if}
</div>

<style>
  .wrap {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1rem;
    color: #e5edf5;
  }
  .head-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }
  h1 {
    font-family: 'Cinzel', Georgia, serif;
    color: #c9a14a;
    margin: 0;
    font-size: 1.75rem;
    letter-spacing: 0.05em;
  }
  .forge-trigger-btn {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.875rem;
    padding: 0.625rem 1.25rem;
    font-weight: 700;
  }
  .muted { color: var(--fg-muted); }
  .error { color: #dc3545; font-weight: 600; margin: 0.5rem 0; }

  /* Character Cards List */
  .char-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 1.25rem;
  }
  .char-card {
    width: 100%;
    text-align: left;
    background: #101017;
    border: 1px solid #282736;
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 0.875rem;
    cursor: pointer;
    transition: all 160ms ease;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .char-card:hover {
    border-color: #b38b3a;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(179, 139, 58, 0.2);
  }
  .char-portrait-frame {
    width: 52px;
    height: 52px;
    border-radius: 0.375rem;
    border: 2px solid #b38b3a;
    overflow: hidden;
    position: relative;
    background: #08080c;
    flex-shrink: 0;
  }
  .char-portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .char-lvl {
    position: absolute;
    bottom: 0;
    right: 0;
    background: rgba(10, 10, 14, 0.9);
    color: #ffd700;
    font-size: 0.55rem;
    font-weight: 700;
    padding: 1px 3px;
    border-top-left-radius: 3px;
    border-top: 1px solid #b38b3a;
    border-left: 1px solid #b38b3a;
  }
  .char-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .char-name {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 0.95rem;
    color: #f3efe6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .char-meta {
    color: #c9a14a;
    font-size: 0.75rem;
    font-weight: 600;
    margin-top: 0.125rem;
  }
  .char-card.create {
    border-style: dashed;
    border-color: #383648;
    justify-content: center;
    flex-direction: column;
    min-height: 100px;
    gap: 0.25rem;
  }
  .char-card.create:hover {
    border-color: #ffd700;
  }
  .plus-icon { font-size: 1.5rem; color: #c9a14a; }
  .create-label { font-family: 'Cinzel', Georgia, serif; font-size: 0.8rem; font-weight: 700; color: #c9a14a; }

  /* Creator Container */
  .creator-container {
    background: #0f0f15;
    border: 1px solid #332f22;
    border-radius: 0.625rem;
    padding: 1.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(179, 139, 58, 0.1);
  }
  .creator-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2734;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }
  .steps-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex-wrap: wrap;
  }
  .step-btn {
    background: none;
    border: none;
    color: #727284;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    transition: color 120ms ease;
  }
  .step-btn:hover { color: #e5edf5; }
  .step-btn.active {
    color: #ffd700;
    font-weight: 700;
  }
  .step-num {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #1c1c28;
    border: 1px solid #3d3a4c;
    font-size: 0.7rem;
  }
  .step-btn.active .step-num {
    background: #b38b3a;
    color: #111;
    border-color: #ffd700;
  }
  .step-arrow { color: #434050; font-size: 0.75rem; }
  .cancel-btn {
    background: #181822;
    border: 1px solid #323244;
    color: #8c8ca0;
    font-size: 0.75rem;
    padding: 0.375rem 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .cancel-btn:hover { color: #fff; border-color: #666; }

  /* Step Panels */
  .panel-header {
    margin-bottom: 1.25rem;
  }
  .panel-header h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.35rem;
    color: #f3efe6;
    margin: 0 0 0.25rem;
  }
  .panel-desc {
    color: #8e8a9d;
    font-size: 0.85rem;
    margin: 0;
  }

  /* Options Grid */
  .options-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
    max-height: 480px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }
  .option-card {
    background: #13131b;
    border: 1px solid #272635;
    border-radius: 0.5rem;
    padding: 1rem;
    cursor: pointer;
    transition: all 140ms ease;
    display: flex;
    flex-direction: column;
  }
  .option-card:hover {
    border-color: #726b52;
    background: #171722;
  }
  .option-card.selected {
    border-color: #b38b3a;
    background: linear-gradient(180deg, #1b1916 0%, #13131b 100%);
    box-shadow: 0 0 12px rgba(179, 139, 58, 0.25);
  }
  .opt-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.375rem;
  }
  .opt-icon { font-size: 1.4rem; }
  .opt-title {
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 0.95rem;
    color: #f3efe6;
  }
  .opt-desc {
    font-size: 0.75rem;
    color: #928e9e;
    line-height: 1.35;
    margin: 0 0 0.625rem;
    flex: 1;
  }
  .opt-bonuses {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .badge {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    background: #1e1e28;
    border: 1px solid #363446;
    color: #bbb;
  }
  .badge.hp { color: #dc3545; border-color: #5c1820; background: rgba(220, 53, 69, 0.08); }
  .badge.mp { color: #0d6efd; border-color: #123d7a; background: rgba(13, 110, 253, 0.08); }
  .badge.atk { color: #fd7e14; border-color: #7a3e0b; background: rgba(253, 126, 20, 0.08); }
  .badge.def { color: #20c997; border-color: #105943; background: rgba(32, 201, 151, 0.08); }
  .badge.mo { color: #d63384; border-color: #691740; background: rgba(214, 51, 132, 0.08); }
  .badge.spd { color: #ffc107; border-color: #755903; background: rgba(255, 193, 7, 0.08); }
  .badge.perk { color: #c9a14a; border-color: #614c20; background: rgba(201, 161, 74, 0.1); }

  /* Background Card & World Reactions */
  .bg-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .reaction-preview {
    margin-top: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: rgba(8, 9, 12, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    padding: 0.5rem;
  }
  .reaction-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.72rem;
    line-height: 1.3;
    color: #cbd5e1;
  }
  .r-icon { font-size: 0.85rem; flex-shrink: 0; margin-top: -1px; }
  .r-text strong { color: #f7d488; }

  .card-subclass-title {
    color: #ffd700;
    font-size: 0.75rem;
    margin-left: 0.25rem;
  }
  .card-bg-pill {
    margin-top: 0.25rem;
    display: inline-flex;
    font-size: 0.7rem;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  /* MODULAR CHARACTER CREATOR VISUAL STUDIO */
  .visual-studio-panel {
    max-width: 1060px;
    margin: 0 auto;
  }
  .studio-layout {
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 860px) {
    .studio-layout { grid-template-columns: 1fr; }
  }

  .studio-customizer {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    max-height: 560px;
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .customizer-block {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    background: #12121a;
    border: 1px solid #282636;
    border-radius: 0.5rem;
    padding: 0.85rem 1rem;
  }
  .block-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .block-label {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.825rem;
    font-weight: 700;
    color: #c9a14a;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .lbl-icon { font-size: 1rem; }
  .selected-pill {
    font-size: 0.6875rem;
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid rgba(255, 215, 0, 0.25);
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-weight: 600;
  }
  .customizer-hint {
    font-size: 0.72rem;
    color: #8a8595;
    margin: 0;
  }

  .chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .feature-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: #1a1924;
    border: 1px solid #323044;
    border-radius: 6px;
    padding: 0.3rem 0.6rem;
    color: #cbd5e1;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .feature-chip:hover {
    border-color: #c9a14a;
    color: #fff;
    background: #232230;
  }
  .feature-chip.active {
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.25), rgba(130, 95, 30, 0.35));
    border-color: #ffd700;
    color: #ffd700;
    font-weight: 700;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.25);
  }
  .chip-icon { font-size: 0.85rem; }

  /* Hair Color Swatches */
  .color-swatches-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid #232230;
  }
  .swatch-label {
    font-size: 0.7rem;
    color: #8a8595;
  }
  .color-swatch-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid #3c394c;
    cursor: pointer;
    transition: all 140ms ease;
    padding: 0;
  }
  .color-swatch-btn:hover {
    transform: scale(1.15);
    border-color: #fff;
  }
  .color-swatch-btn.active {
    border-color: #ffd700;
    transform: scale(1.25);
    box-shadow: 0 0 8px #ffd700;
  }

  /* Emote Chips Grid */
  .emotes-chips-grid .emote-chip {
    padding: 0.35rem 0.65rem;
  }
  .test-play-badge {
    font-size: 0.6rem;
    color: #8b8374;
    margin-left: 0.2rem;
    opacity: 0.7;
  }
  .emote-chip:hover .test-play-badge,
  .emote-chip.active .test-play-badge {
    color: #ffd700;
    opacity: 1;
  }

  .hero-name-input {
    background: #14141d;
    border: 1px solid #3a3748;
    border-radius: 0.375rem;
    color: #fff;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1rem;
    font-weight: 700;
    padding: 0.625rem 0.75rem;
  }
  .hero-name-input:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.25);
  }
  .prompt-textarea {
    background: #14141d;
    border: 1px solid #3a3748;
    border-radius: 0.375rem;
    color: #e5edf5;
    font-size: 0.85rem;
    line-height: 1.4;
    padding: 0.625rem 0.75rem;
    resize: vertical;
  }
  .prompt-textarea:focus {
    outline: none;
    border-color: #ffd700;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.25);
  }
  .prompt-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    align-items: center;
    margin-top: 0.375rem;
  }
  .pill-label { font-size: 0.7rem; color: #727284; }
  .tag-pill {
    background: #1c1c28;
    border: 1px solid #3a374c;
    color: #c0b8d0;
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .tag-pill:hover {
    background: #28283a;
    border-color: #b38b3a;
    color: #ffd700;
  }

  /* RIGHT COLUMN: PREVIEW CARD */
  .studio-preview-card {
    background: #12121a;
    border: 1px solid #3c3422;
    border-radius: 0.625rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .studio-camera-bar {
    display: flex;
    gap: 0.35rem;
    background: rgba(14, 13, 20, 0.9);
    padding: 0.2rem;
    border-radius: 999px;
    border: 1px solid #2d261e;
    margin-bottom: 0.85rem;
  }
  .cam-toggle {
    background: transparent;
    border: 1px solid transparent;
    color: #8a8274;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .cam-toggle:hover { color: #e5edf5; }
  .cam-toggle.active {
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.25), rgba(130, 95, 30, 0.4));
    border-color: #c9a14a;
    color: #ffd700;
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.3);
  }

  .studio-render-container {
    width: 140px;
    height: 140px;
    border-radius: 0.5rem;
    border: 2px solid #b38b3a;
    overflow: visible;
    position: relative;
    background: radial-gradient(circle at 50% 40%, #1e1b28 0%, #08080a 100%);
    margin-bottom: 0.875rem;
    box-shadow: 0 0 20px rgba(179, 139, 58, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 250ms ease;
  }
  .studio-render-container.fullbody-mode {
    width: 170px;
    height: 220px;
  }

  .avatar-frame {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .avatar-portrait-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 0.375rem;
  }
  .avatar-paperdoll-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.9));
  }

  /* Creator Emote Shout Bubble */
  .creator-emote-shout-bubble {
    position: absolute;
    top: -28px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(18, 16, 26, 0.95);
    border: 2px solid #ffd700;
    border-radius: 12px;
    padding: 0.25rem 0.6rem;
    color: #ffffff;
    font-size: 0.6875rem;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 0 14px rgba(255, 215, 0, 0.6), 0 4px 10px rgba(0,0,0,0.8);
    display: flex;
    align-items: center;
    gap: 0.25rem;
    z-index: 20;
    animation: shoutPop 300ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  }
  .creator-emote-shout-bubble::after {
    content: '';
    position: absolute;
    bottom: -5px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 5px 5px 0;
    border-style: solid;
    border-color: #ffd700 transparent;
  }

  /* Creator Keyframe Animations */
  .avatar-frame.emote-dance { animation: emoteGroove 1.6s ease-in-out infinite; }
  .avatar-frame.emote-twirl { animation: emoteBladeTwirl 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
  .avatar-frame.emote-surge { animation: emoteSpellSurge 1.4s ease-in-out infinite alternate; }
  .avatar-frame.emote-rest { animation: emoteCozyRest 2.5s ease-in-out infinite alternate; }
  .avatar-frame.emote-bow { animation: emoteCourtlyBow 2s ease-in-out infinite alternate; }
  .avatar-frame.emote-flex { animation: emoteTitanFlex 1.2s ease-in-out infinite; }

  /* Summary Section in Studio */
  .preview-summary {
    width: 100%;
  }
  .summary-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.1rem;
    font-weight: 700;
    color: #f3efe6;
    margin-bottom: 0.375rem;
  }
  .summary-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
  }
  .sum-tag {
    font-size: 0.7rem;
    color: #b38b3a;
    font-weight: 600;
    background: rgba(179, 139, 58, 0.12);
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    border: 1px solid rgba(179, 139, 58, 0.25);
  }
  .traits-summary-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem;
    margin: 0.4rem 0 0.65rem;
  }
  .trait-tag {
    font-size: 0.65rem;
    background: #191824;
    border: 1px solid #343048;
    color: #a5b4fc;
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }
  .trait-tag.mask-trait { color: #f472b6; border-color: #831843; }
  .trait-tag.hair-trait { color: #facc15; border-color: #713f12; }
  .trait-tag.eye-trait { color: #38bdf8; border-color: #075985; }
  .trait-tag.scar-trait { color: #fb7185; border-color: #881337; }
  .trait-tag.emote-trait { color: #4ade80; border-color: #14532d; }

  /* Combined Stats Sheet */
  .combined-stats-sheet {
    background: #0d0c14;
    border: 1px solid #272436;
    border-radius: 6px;
    padding: 0.5rem;
    margin: 0.5rem 0;
  }
  .stats-header {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.6875rem;
    color: #c9a14a;
    letter-spacing: 0.05em;
    margin-bottom: 0.35rem;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    font-size: 0.7rem;
  }
  .cstat {
    display: flex;
    justify-content: center;
    gap: 0.2rem;
  }
  .ck { color: #8e889a; }
  .cv { color: #f3efe6; font-weight: 700; }
  .bg-perk-line {
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid #1f1e2c;
    font-size: 0.6875rem;
    color: #94a3b8;
  }
  .perk-badge {
    color: #ffd700;
    font-weight: 700;
  }
  .summary-prompt {
    font-size: 0.7rem;
    color: #9c98a8;
    line-height: 1.35;
    margin-top: 0.25rem;
    max-height: 80px;
    overflow-y: auto;
  }

  /* Nav Actions */
  .nav-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #252432;
    padding-top: 1.25rem;
  }
  .next-btn, .forge-btn {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.9rem;
    font-weight: 700;
    padding: 0.625rem 1.5rem;
  }
  .secondary {
    background: #1c1c28;
    border: 1px solid #3a374c;
    color: #c0b8d0;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.85rem;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
  }
  .secondary:hover { background: #282838; color: #fff; }
  .primary {
    background: #c9a14a;
    color: #15100a;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .primary:hover {
    background: #dfb559;
    box-shadow: 0 0 12px rgba(201, 161, 74, 0.4);
  }
  .primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
