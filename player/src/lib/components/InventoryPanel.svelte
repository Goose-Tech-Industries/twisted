<script lang="ts">
  import type { Character } from '$stores/character.svelte'
  import type { Item, Equipment, EquipSlot } from '$stores/inventory.svelte'

  interface Props {
    character?: Character | null
    items: Item[]
    equipment: Equipment
    gold: number
    onuse: (id: number) => void
    onequip: (id: number) => void
    onunequip?: (slotKey: EquipSlot) => void
    onopencamp?: () => void
  }
  let { character, items, equipment, gold, onuse, onequip, onunequip, onopencamp }: Props = $props()

  let selected = $state<Item | null>(null)
  let filter = $state<'all' | 'weapon' | 'armor' | 'accessory' | 'consumable'>('all')
  let inspectingSlot = $state<EquipSlot | null>(null)
  let hoveredSlot = $state<EquipSlot | null>(null)
  let cameraMode = $state<'full' | 'face'>('full')
  let equipBurstKey = $state<number>(0)
  let wardrobeMode = $state<'battle' | 'camp'>('battle')

  const slots: EquipSlot[] = [
    'helmet', 'face', 'chest', 'gloves', 'belt', 'boots', 'ring1',
    'shoulders', 'cloak', 'amulet', 'weapon', 'offhand', 'trinket', 'ring2'
  ]

  const leftSlotKeys: EquipSlot[] = ['helmet', 'face', 'chest', 'gloves', 'belt', 'boots', 'ring1']
  const rightSlotKeys: EquipSlot[] = ['shoulders', 'cloak', 'amulet', 'weapon', 'offhand', 'trinket', 'ring2']

  const slotLabels: Record<EquipSlot, { label: string; placeholderIcon: string; bodyPart: string }> = {
    helmet:    { label: 'Head',       placeholderIcon: '⛑️', bodyPart: 'Head & Brow' },
    face:      { label: 'Face Mask',  placeholderIcon: '🎭', bodyPart: 'Visage & Mask' },
    chest:     { label: 'Chest Armor',placeholderIcon: '🥋', bodyPart: 'Torso' },
    gloves:    { label: 'Gloves',     placeholderIcon: '🧤', bodyPart: 'Hands' },
    belt:      { label: 'Waist Belt', placeholderIcon: '🥋', bodyPart: 'Waist' },
    boots:     { label: 'Boots',      placeholderIcon: '👢', bodyPart: 'Feet' },
    ring1:     { label: 'Left Ring',  placeholderIcon: '💍', bodyPart: 'Left Hand' },
    shoulders: { label: 'Pauldrons',  placeholderIcon: '🛡️', bodyPart: 'Shoulders' },
    cloak:     { label: 'Cloak',      placeholderIcon: '🧥', bodyPart: 'Back & Cape' },
    amulet:    { label: 'Amulet',     placeholderIcon: '📿', bodyPart: 'Neck' },
    weapon:    { label: 'Main Hand',  placeholderIcon: '⚔️', bodyPart: 'Right Hand' },
    offhand:   { label: 'Off-Hand',   placeholderIcon: '🛡️', bodyPart: 'Left Hand' },
    trinket:   { label: 'Trinket',    placeholderIcon: '🧿', bodyPart: 'Pocket Relic' },
    ring2:     { label: 'Right Ring', placeholderIcon: '💍', bodyPart: 'Right Hand' },
  }

  const campSlotLabels: Partial<Record<EquipSlot, { label: string; placeholderIcon: string; bodyPart: string }>> = {
    chest:     { label: 'Arming Doublet', placeholderIcon: '👘', bodyPart: 'Gambeson & Under-Armor' },
    boots:     { label: 'Camp Slippers',  placeholderIcon: '🥿', bodyPart: 'Feet (Lounging)' },
    belt:      { label: 'Cloth Sash',     placeholderIcon: '🎗️', bodyPart: 'Waist' },
    cloak:     { label: 'Camp Shawl',     placeholderIcon: '🧣', bodyPart: 'Shoulders & Shawl' },
    face:      { label: 'Bare Visage',    placeholderIcon: '😊', bodyPart: 'Visage' },
    helmet:    { label: 'Resting Brow',   placeholderIcon: '🧢', bodyPart: 'Head' },
    gloves:    { label: 'Bare Hands',     placeholderIcon: '🖐️', bodyPart: 'Hands' },
    shoulders: { label: 'Relaxed Mantle', placeholderIcon: '🧥', bodyPart: 'Shoulders' },
    weapon:    { label: 'Camp Knife',     placeholderIcon: '🔪', bodyPart: 'Carving Tool' },
    offhand:   { label: 'Drinking Flagon',placeholderIcon: '🍺', bodyPart: 'Drinking Horn' },
    trinket:   { label: 'Keepsake Relic', placeholderIcon: '🧿', bodyPart: 'Pocket Charm' },
    amulet:    { label: 'Lucky Talisman', placeholderIcon: '📿', bodyPart: 'Neck' },
    ring1:     { label: 'Signet Ring',    placeholderIcon: '💍', bodyPart: 'Left Hand' },
    ring2:     { label: 'Band of Rest',   placeholderIcon: '💍', bodyPart: 'Right Hand' },
  }

  function getSlotMeta(slotKey: EquipSlot) {
    if (wardrobeMode === 'camp' && campSlotLabels[slotKey]) {
      return campSlotLabels[slotKey]!
    }
    return slotLabels[slotKey]
  }

  interface EmoteDef {
    id: string
    name: string
    icon: string
    animClass: string
    particleColor: string
    shout: string
  }

  const emotes: EmoteDef[] = [
    { id: 'dance',    name: 'Victory Groove',  icon: '🕺', animClass: 'emote-dance',   particleColor: '#ffd700', shout: 'Moves like thunder!' },
    { id: 'combat',   name: 'Blade Twirl',    icon: '⚔️', animClass: 'emote-twirl',   particleColor: '#00e5ff', shout: 'Locked & ready for battle!' },
    { id: 'spell',    name: 'Spell Surge',    icon: '🧙', animClass: 'emote-surge',   particleColor: '#b344ff', shout: 'Arcane fury awaits!' },
    { id: 'camp',     name: 'Cozy Rest',      icon: '☕', animClass: 'emote-rest',    particleColor: '#ff8833', shout: 'Toasting by the fire...' },
    { id: 'bow',      name: 'Courtly Bow',    icon: '🎭', animClass: 'emote-bow',     particleColor: '#c9a14a', shout: 'At your honor\'s service.' },
    { id: 'flex',     name: 'Titan Flex',     icon: '💪', animClass: 'emote-flex',    particleColor: '#ff3366', shout: 'Unstoppable power!' },
  ]

  let activeEmote = $state<EmoteDef | null>(null)
  let emoteTimeout: ReturnType<typeof setTimeout> | null = null

  function triggerEmote(em: EmoteDef) {
    if (emoteTimeout) clearTimeout(emoteTimeout)
    activeEmote = em
    emoteTimeout = setTimeout(() => {
      activeEmote = null
    }, 4000)
  }

  function getSlotForItem(item: Item): EquipSlot {
    const rawSlot = ((item as unknown as { slot?: string }).slot || '').toLowerCase()
    if (rawSlot && slots.includes(rawSlot as EquipSlot)) return rawSlot as EquipSlot
    const t = (item.type || '').toUpperCase()
    if (t === 'WEAPON') return 'weapon'
    if (t === 'ARMOR') return 'chest'
    if (t === 'HELMET') return 'helmet'
    if (t === 'BOOTS') return 'boots'
    if (t === 'ACCESSORY') return 'amulet'
    return 'weapon'
  }

  const filteredItems = $derived.by(() => {
    if (filter === 'all') return items
    return items.filter(i => {
      const t = (i.type || '').toLowerCase()
      const s = ((i as unknown as { slot?: string }).slot || '').toLowerCase()
      if (filter === 'weapon') return t === 'weapon' || s === 'weapon'
      if (filter === 'armor') return t === 'armor' || t === 'helmet' || t === 'boots' || s === 'chest' || s === 'helmet' || s === 'boots' || s === 'gloves' || s === 'shoulders' || s === 'cloak' || s === 'belt'
      if (filter === 'accessory') return t === 'accessory' || t === 'ring' || t === 'amulet' || s === 'amulet' || s === 'ring1' || s === 'ring2' || s === 'face' || s === 'trinket' || s === 'offhand'
      if (filter === 'consumable') return t === 'consumable' || t === 'potion'
      return t === filter || s === filter
    })
  })

  // Cumulative equipment stat bonuses
  const equipBonuses = $derived.by(() => {
    let atk = 0, def = 0, hp = 0, mp = 0, mo = 0, md = 0, spd = 0, luck = 0
    for (const s of slots) {
      const it = equipment[s]
      if (!it) continue
      atk  += Number(it.bonus_atk ?? 0)
      def  += Number(it.bonus_def ?? 0)
      hp   += Number(it.bonus_hp ?? 0)
      const raw = it as unknown as { bonus_mp?: number; bonus_mo?: number; bonus_md?: number; bonus_speed?: number; bonus_luck?: number }
      mp   += Number(raw.bonus_mp ?? 0)
      mo   += Number(raw.bonus_mo ?? 0)
      md   += Number(raw.bonus_md ?? 0)
      spd  += Number(raw.bonus_speed ?? 0)
      luck += Number(raw.bonus_luck ?? 0)
    }
    return { atk, def, hp, mp, mo, md, spd, luck }
  })

  // The item currently equipped in the target slot for comparison
  const targetSlotForSelected = $derived(selected ? getSlotForItem(selected) : null)
  const itemInTargetSlot = $derived(targetSlotForSelected ? equipment[targetSlotForSelected] : null)

  function diffLabel(newVal: number = 0, curVal: number = 0): { diff: number; text: string; cls: string } {
    const diff = newVal - curVal
    if (diff > 0) return { diff, text: `+${diff}`, cls: 'pos' }
    if (diff < 0) return { diff, text: `${diff}`, cls: 'neg' }
    return { diff: 0, text: '0', cls: 'zero' }
  }

  function getHeroPaperdoll(c: typeof character): string {
    if (!c) return '/paperdoll/warrior.jpg'
    const cls = (c.class_name || '').toLowerCase()
    const title = (c.subclass_name || '').toLowerCase()

    if (cls.includes('mage') || cls.includes('wizard') || cls.includes('sorcerer') || cls.includes('necro') || cls.includes('element') || title.includes('arcane') || title.includes('void')) {
      return '/paperdoll/mage.jpg'
    }
    if (cls.includes('rogue') || cls.includes('assassin') || cls.includes('thief') || cls.includes('shadow') || cls.includes('ninja') || cls.includes('scout') || title.includes('shadow')) {
      return '/paperdoll/rogue.jpg'
    }
    if (cls.includes('cleric') || cls.includes('priest') || cls.includes('paladin') || cls.includes('templar') || cls.includes('inquisitor') || title.includes('radiant')) {
      return '/paperdoll/cleric.jpg'
    }
    if (cls.includes('ranger') || cls.includes('hunter') || cls.includes('archer') || cls.includes('druid') || cls.includes('beast') || title.includes('warden')) {
      return '/paperdoll/ranger.jpg'
    }
    return '/paperdoll/warrior.jpg'
  }

  function getItemElement(item: Item | null | undefined): string | null {
    if (!item) return null
    const text = `${item.name} ${(item as any).description || ''} ${(item as any).element || ''}`.toLowerCase()
    if (text.includes('fire') || text.includes('flame') || text.includes('pyre') || text.includes('cinder') || text.includes('inferno') || text.includes('lava') || text.includes('ember')) return 'fire'
    if (text.includes('frost') || text.includes('ice') || text.includes('glacial') || text.includes('blizzard') || text.includes('chill') || text.includes('frozen')) return 'frost'
    if (text.includes('lightning') || text.includes('shock') || text.includes('thunder') || text.includes('spark') || text.includes('volt') || text.includes('storm')) return 'lightning'
    if (text.includes('void') || text.includes('shadow') || text.includes('dark') || text.includes('eclipse') || text.includes('abyss') || text.includes('necro')) return 'void'
    if (text.includes('holy') || text.includes('radiant') || text.includes('sacred') || text.includes('divine') || text.includes('sun') || text.includes('blessed')) return 'holy'
    if (text.includes('poison') || text.includes('venom') || text.includes('acid') || text.includes('toxic') || text.includes('rot')) return 'poison'
    return null
  }

  interface SocketCoord {
    slot: EquipSlot
    label: string
    top: string
    left: string
  }

  const socketCoords: SocketCoord[] = [
    { slot: 'helmet',    label: 'Head',       top: '11%', left: '50%' },
    { slot: 'face',      label: 'Face Mask',  top: '20%', left: '50%' },
    { slot: 'amulet',    label: 'Neck',       top: '29%', left: '50%' },
    { slot: 'shoulders', label: 'Pauldrons',  top: '27%', left: '26%' },
    { slot: 'cloak',     label: 'Cloak',      top: '27%', left: '74%' },
    { slot: 'chest',     label: 'Torso',      top: '39%', left: '50%' },
    { slot: 'offhand',   label: 'Off-Hand',   top: '47%', left: '16%' },
    { slot: 'weapon',    label: 'Main Hand',  top: '47%', left: '84%' },
    { slot: 'gloves',    label: 'Hands',      top: '56%', left: '50%' },
    { slot: 'belt',      label: 'Belt',       top: '64%', left: '50%' },
    { slot: 'ring1',     label: 'Ring L',     top: '64%', left: '24%' },
    { slot: 'ring2',     label: 'Ring R',     top: '64%', left: '76%' },
    { slot: 'trinket',   label: 'Trinket',    top: '74%', left: '50%' },
    { slot: 'boots',     label: 'Feet',       top: '86%', left: '50%' },
  ]

  function handleEquip(item: Item) {
    equipBurstKey = Date.now()
    onequip(item.id)
    selected = null
    inspectingSlot = null
  }

  function handleUnequip(slotKey: EquipSlot) {
    if (onunequip) onunequip(slotKey)
    inspectingSlot = null
  }

  function handleSlotClick(slotKey: EquipSlot) {
    if (equipment[slotKey]) {
      inspectingSlot = inspectingSlot === slotKey ? null : slotKey
      selected = null
    } else {
      // Auto-filter backpack to this slot so player can equip right away!
      inspectingSlot = null
      if (slotKey === 'weapon') filter = 'weapon'
      else if (slotKey === 'chest' || slotKey === 'helmet' || slotKey === 'boots' || slotKey === 'gloves' || slotKey === 'shoulders' || slotKey === 'cloak' || slotKey === 'belt') filter = 'armor'
      else if (slotKey === 'amulet' || slotKey === 'ring1' || slotKey === 'ring2' || slotKey === 'offhand' || slotKey === 'face' || slotKey === 'trinket') filter = 'accessory'
    }
  }
</script>

<div class="inventory-shell">
  <!-- Header Bar -->
  <header class="inv-header">
    <div class="header-titles">
      <h2>Hero Arsenal & Equipment</h2>
      <span class="header-sub">
        {character?.name || 'Hero'} · Lv.{character?.level || 1} {character?.race_name || 'Human'} {character?.class_name || 'Warrior'}
      </span>
    </div>

    <!-- Dual Wardrobe Toggle: Combat Armor vs Camp Clothes / Gambeson -->
    <div class="header-center">
      <div class="wardrobe-toggle-bar">
        <button
          type="button"
          class="wardrobe-btn"
          class:active={wardrobeMode === 'battle'}
          onclick={() => (wardrobeMode = 'battle')}
          title="Combat Armor & 14 Battle Sockets"
        >
          ⚔️ Battle Gear
        </button>
        <button
          type="button"
          class="wardrobe-btn"
          class:active={wardrobeMode === 'camp'}
          onclick={() => (wardrobeMode = 'camp')}
          title="Camp Loungewear & Padded Under-Armor Gambeson"
        >
          ⛺ Camp Clothes & Gambeson
        </button>
      </div>

      {#if onopencamp}
        <button
          type="button"
          class="camp-trigger-btn"
          onclick={onopencamp}
          title="Pitch Wilderness Camp or Rest at Town Inn (Triggers Cutscenes)"
        >
          🔥 Rest at Camp / Inn
        </button>
      {/if}
    </div>

    <div class="gold-badge">
      <span class="coin-icon">🪙</span>
      <span class="coin-amt">{gold.toLocaleString()} Gold</span>
    </div>
  </header>

  <div class="inv-main">
    <!-- LEFT PANE: FULL-BODY PAPERDOLL & SLOTS -->
    <section class="paperdoll-quadrant">
      <div class="quadrant-title">
        <span>Active Paperdoll ({wardrobeMode === 'battle' ? 'Battle Armor' : 'Camp Loungewear'})</span>
        <span class="slot-count">
          {Object.values(equipment).filter(Boolean).length} / {slots.length} Slotted
        </span>
      </div>

      <div class="paperdoll-stage">
        <!-- Left Slots Column (7 Sockets) -->
        <div class="slots-col left-slots">
          {#each leftSlotKeys as slotKey (slotKey)}
            {@const eq = equipment[slotKey]}
            {@const meta = getSlotMeta(slotKey)}
            {@const elem = getItemElement(eq)}
            <button
              type="button"
              class="slot-card"
              class:equipped={!!eq}
              class:inspecting={inspectingSlot === slotKey}
              class:targeted={hoveredSlot === slotKey || targetSlotForSelected === slotKey}
              class:glow-fire={elem === 'fire'}
              class:glow-frost={elem === 'frost'}
              class:glow-lightning={elem === 'lightning'}
              class:glow-void={elem === 'void'}
              class:glow-holy={elem === 'holy'}
              class:glow-poison={elem === 'poison'}
              onclick={() => handleSlotClick(slotKey)}
              onmouseenter={() => (hoveredSlot = slotKey)}
              onmouseleave={() => (hoveredSlot = null)}
              title="{meta.label} ({meta.bodyPart}): {eq?.name || 'Empty'}"
            >
              <div class="slot-icon-box" class:elem-flare={!!elem}>{eq?.icon ?? meta.placeholderIcon}</div>
              <div class="slot-meta">
                <span class="slot-name">{meta.label}</span>
                <span class="slot-item-title">{eq?.name || 'Empty'}</span>
                {#if elem}
                  <span class="slot-elem-tag elem-{elem}">✦ {elem.toUpperCase()}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>

        <!-- Center: Full-Body Hero Mannequin Stage -->
        <div class="mannequin-stage-wrapper">
          <!-- Top Control Header: Camera Zoom & Fortnite-Style Emotes -->
          <div class="stage-control-header">
            <!-- Camera View Switcher -->
            <div class="camera-mode-bar">
              <button
                type="button"
                class="cam-toggle"
                class:active={cameraMode === 'full'}
                onclick={() => (cameraMode = 'full')}
                title="Full Body Pedestal Stance"
              >
                🛡️ Full
              </button>
              <button
                type="button"
                class="cam-toggle"
                class:active={cameraMode === 'face'}
                onclick={() => (cameraMode = 'face')}
                title="Close-Up Visage & Facial Features"
              >
                🔍 Visage
              </button>
            </div>

            <!-- Fortnite/MMO-Style Emote Poses Quickbar -->
            <div class="emote-bar">
              {#each emotes as em (em.id)}
                <button
                  type="button"
                  class="emote-btn"
                  class:active={activeEmote?.id === em.id}
                  onclick={() => triggerEmote(em)}
                  title="{em.name}: {em.shout}"
                >
                  <span class="emote-btn-icon">{em.icon}</span>
                  <span class="emote-btn-label">{em.name}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="mannequin-container" class:visage-zoom={cameraMode === 'face'} class:camp-hearth={wardrobeMode === 'camp'}>
            <!-- Atmospheric Pedestal Background & Arcane Rim -->
            <div class="gothic-arch"></div>
            <div class="plinth-ambient-glow"></div>
            {#if wardrobeMode === 'camp'}
              <div class="camp-hearth-embers" title="Campfire Hearth Active"></div>
            {/if}

            <!-- High-Res Hero Paperdoll Image with Emote Animations -->
            <div class="hero-render-frame {activeEmote?.animClass || ''}">
              <img
                src={getHeroPaperdoll(character)}
                alt="{character?.name || 'Hero'} Full Body"
                class="hero-avatar-img"
              />

              <!-- Emote Comic Speech Bubble -->
              {#if activeEmote}
                <div class="emote-shout-bubble" style="--bubble-border: {activeEmote.particleColor}">
                  <span class="bubble-icon">{activeEmote.icon}</span>
                  <span class="bubble-text">{activeEmote.shout}</span>
                </div>
              {/if}

              <!-- Equip Burst Particle Pulse -->
              {#key equipBurstKey}
                {#if equipBurstKey > 0}
                  <div class="equip-burst-ring"></div>
                {/if}
              {/key}
            </div>

            <!-- INTERACTIVE BODY SOCKET RETICLES (All 14 Sockets) -->
            {#each socketCoords as s (s.slot)}
              {@const isEquipped = !!equipment[s.slot]}
              {@const isTargeted = inspectingSlot === s.slot || hoveredSlot === s.slot || targetSlotForSelected === s.slot}
              {@const currentMeta = getSlotMeta(s.slot)}
              {@const nodeElem = getItemElement(equipment[s.slot])}
              <button
                type="button"
                class="body-socket-node node-{s.slot}"
                class:equipped={isEquipped}
                class:targeted={isTargeted}
                class:node-glow-fire={nodeElem === 'fire'}
                class:node-glow-frost={nodeElem === 'frost'}
                class:node-glow-lightning={nodeElem === 'lightning'}
                class:node-glow-void={nodeElem === 'void'}
                class:node-glow-holy={nodeElem === 'holy'}
                class:node-glow-poison={nodeElem === 'poison'}
                style="top: {s.top}; left: {s.left};"
                onclick={() => handleSlotClick(s.slot)}
                onmouseenter={() => (hoveredSlot = s.slot)}
                onmouseleave={() => (hoveredSlot = null)}
                title="{currentMeta.label}: {equipment[s.slot]?.name || 'Empty (Click to filter bag)'}"
              >
                <div class="node-disc">
                  {#if isEquipped}
                    <span class="node-icon">{equipment[s.slot]?.icon || currentMeta.placeholderIcon}</span>
                  {:else}
                    <span class="node-placeholder">{currentMeta.placeholderIcon}</span>
                  {/if}
                </div>
                {#if s.slot === 'weapon' && nodeElem}
                  <div class="weapon-elemental-burst burst-{nodeElem}"></div>
                {/if}
                {#if isTargeted}
                  <div class="socket-reticle-ping"></div>
                {/if}
              </button>
            {/each}
          </div>

          <!-- Active Slot Quick-Inspector -->
          {#if inspectingSlot && equipment[inspectingSlot]}
            {@const eq = equipment[inspectingSlot]!}
            {@const inspectMeta = getSlotMeta(inspectingSlot)}
            <div class="active-slot-inspect-card">
              <div class="inspect-row">
                <div class="inspect-icon-box">{eq.icon || inspectMeta.placeholderIcon}</div>
                <div class="inspect-info">
                  <div class="inspect-slot-tag">{inspectMeta.label}</div>
                  <div class="inspect-item-name">{eq.name}</div>
                </div>
                <button
                  type="button"
                  class="unequip-btn"
                  onclick={() => handleUnequip(inspectingSlot!)}
                >
                  Unequip
                </button>
              </div>
              <div class="inspect-stats-mini">
                {#if eq.bonus_atk}<span class="istat">⚔️ +{eq.bonus_atk} ATK</span>{/if}
                {#if eq.bonus_def}<span class="istat">🛡️ +{eq.bonus_def} DEF</span>{/if}
                {#if eq.bonus_hp}<span class="istat">❤️ +{eq.bonus_hp} HP</span>{/if}
                {#if (eq as any).bonus_mp}<span class="istat">💙 +{(eq as any).bonus_mp} MP</span>{/if}
                {#if (eq as any).bonus_mo}<span class="istat">🔮 +{(eq as any).bonus_mo} MAG</span>{/if}
                {#if (eq as any).bonus_speed}<span class="istat">⚡ +{(eq as any).bonus_speed} SPD</span>{/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Right Slots Column (7 Sockets) -->
        <div class="slots-col right-slots">
          {#each rightSlotKeys as slotKey (slotKey)}
            {@const eq = equipment[slotKey]}
            {@const meta = getSlotMeta(slotKey)}
            {@const elem = getItemElement(eq)}
            <button
              type="button"
              class="slot-card"
              class:equipped={!!eq}
              class:inspecting={inspectingSlot === slotKey}
              class:targeted={hoveredSlot === slotKey || targetSlotForSelected === slotKey}
              class:glow-fire={elem === 'fire'}
              class:glow-frost={elem === 'frost'}
              class:glow-lightning={elem === 'lightning'}
              class:glow-void={elem === 'void'}
              class:glow-holy={elem === 'holy'}
              class:glow-poison={elem === 'poison'}
              onclick={() => handleSlotClick(slotKey)}
              onmouseenter={() => (hoveredSlot = slotKey)}
              onmouseleave={() => (hoveredSlot = null)}
              title="{meta.label} ({meta.bodyPart}): {eq?.name || 'Empty'}"
            >
              <div class="slot-icon-box" class:elem-flare={!!elem}>{eq?.icon ?? meta.placeholderIcon}</div>
              <div class="slot-meta">
                <span class="slot-name">{meta.label}</span>
                <span class="slot-item-title">{eq?.name || 'Empty'}</span>
                {#if elem}
                  <span class="slot-elem-tag elem-{elem}">✦ {elem.toUpperCase()}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      </div>

      <!-- Live Gear Bonus Summary -->
      <div class="bonuses-strip">
        <div class="stat-pill" title="Total Physical Attack Bonus">
          <span class="pill-k">⚔️ ATK</span>
          <span class="pill-v">+{equipBonuses.atk}</span>
        </div>
        <div class="stat-pill" title="Total Physical Defense Bonus">
          <span class="pill-k">🛡️ DEF</span>
          <span class="pill-v">+{equipBonuses.def}</span>
        </div>
        <div class="stat-pill" title="Total Health Bonus">
          <span class="pill-k">❤️ HP</span>
          <span class="pill-v">+{equipBonuses.hp}</span>
        </div>
        <div class="stat-pill" title="Total Mana Bonus">
          <span class="pill-k">💙 MP</span>
          <span class="pill-v">+{equipBonuses.mp}</span>
        </div>
        <div class="stat-pill" title="Total Magic Power Bonus">
          <span class="pill-k">🔮 MAG</span>
          <span class="pill-v">+{equipBonuses.mo}</span>
        </div>
        <div class="stat-pill" title="Total Speed Bonus">
          <span class="pill-k">⚡ SPD</span>
          <span class="pill-v">+{equipBonuses.spd}</span>
        </div>
      </div>
    </section>

    <!-- RIGHT PANE: BACKPACK GRID & ITEM INSPECTOR -->
    <section class="backpack-quadrant">
      <!-- Filter Bar -->
      <div class="filter-row">
        <button type="button" class="tab-btn" class:active={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
        <button type="button" class="tab-btn" class:active={filter === 'weapon'} onclick={() => (filter = 'weapon')}>Weapons</button>
        <button type="button" class="tab-btn" class:active={filter === 'armor'} onclick={() => (filter = 'armor')}>Armor</button>
        <button type="button" class="tab-btn" class:active={filter === 'accessory'} onclick={() => (filter = 'accessory')}>Jewelry</button>
        <button type="button" class="tab-btn" class:active={filter === 'consumable'} onclick={() => (filter = 'consumable')}>Potions</button>
      </div>

      <!-- Items Grid -->
      <div class="items-scroll">
        <ul class="backpack-grid">
          {#each filteredItems as item (item.inventory_id ?? item.id)}
            {@const tileElem = getItemElement(item)}
            <li>
              <button
                type="button"
                class="item-tile"
                class:selected={selected?.id === item.id}
                class:tile-glow-fire={tileElem === 'fire'}
                class:tile-glow-frost={tileElem === 'frost'}
                class:tile-glow-lightning={tileElem === 'lightning'}
                class:tile-glow-void={tileElem === 'void'}
                class:tile-glow-holy={tileElem === 'holy'}
                class:tile-glow-poison={tileElem === 'poison'}
                onclick={() => { selected = item; inspectingSlot = null; }}
              >
                <span class="tile-icon">{item.icon ?? '📦'}</span>
                <span class="tile-title">{item.name}</span>
                {#if tileElem}
                  <span class="tile-elem-badge elem-{tileElem}">✦</span>
                {/if}
                {#if (item.qty ?? 1) > 1}
                  <span class="tile-qty">×{item.qty}</span>
                {/if}
              </button>
            </li>
          {/each}

          {#if filteredItems.length === 0}
            <li class="empty-backpack-note">
              No items in this category. Slay foes or visit a merchant to acquire gear.
            </li>
          {/if}
        </ul>
      </div>

      <!-- ITEM INSPECTION & COMPARISON RIG -->
      {#if selected}
        {@const selElem = getItemElement(selected)}
        <div class="inspector-card" class:inspect-glow-fire={selElem === 'fire'} class:inspect-glow-frost={selElem === 'frost'} class:inspect-glow-lightning={selElem === 'lightning'} class:inspect-glow-void={selElem === 'void'} class:inspect-glow-holy={selElem === 'holy'} class:inspect-glow-poison={selElem === 'poison'}>
          <div class="inspector-header">
            <span class="ins-icon">{selected.icon ?? '📦'}</span>
            <div class="ins-titles">
              <h3>{selected.name}</h3>
              <span class="ins-sub">{selected.type} · Slot: {targetSlotForSelected ? slotLabels[targetSlotForSelected].label : 'Inventory'}</span>
            </div>
            {#if selected.rarity}
              <span class="rarity-badge {selected.rarity.toLowerCase()}">{selected.rarity}</span>
            {/if}
            {#if selElem}
              <span class="elem-infusion-pill elem-{selElem}">✦ {selElem.toUpperCase()} ENCHANTED</span>
            {/if}
          </div>

          {#if selected.description}
            <p class="ins-desc">{selected.description}</p>
          {/if}

          <!-- Equipment Stat Comparison Card -->
          {#if selected.type !== 'CONSUMABLE' && selected.type !== 'consumable'}
            <div class="comparison-grid">
              <div class="comp-col">
                <span class="comp-hdr">Selected Item</span>
                <div class="comp-stat">
                  <span>ATK: +{selected.bonus_atk ?? 0}</span>
                  {#if itemInTargetSlot}
                    {@const d = diffLabel(selected.bonus_atk ?? 0, itemInTargetSlot.bonus_atk ?? 0)}
                    <span class="diff-badge {d.cls}">({d.text})</span>
                  {/if}
                </div>
                <div class="comp-stat">
                  <span>DEF: +{selected.bonus_def ?? 0}</span>
                  {#if itemInTargetSlot}
                    {@const d = diffLabel(selected.bonus_def ?? 0, itemInTargetSlot.bonus_def ?? 0)}
                    <span class="diff-badge {d.cls}">({d.text})</span>
                  {/if}
                </div>
                <div class="comp-stat">
                  <span>HP: +{selected.bonus_hp ?? 0}</span>
                  {#if itemInTargetSlot}
                    {@const d = diffLabel(selected.bonus_hp ?? 0, itemInTargetSlot.bonus_hp ?? 0)}
                    <span class="diff-badge {d.cls}">({d.text})</span>
                  {/if}
                </div>
              </div>

              <div class="comp-col current">
                <span class="comp-hdr">Currently Equipped</span>
                {#if itemInTargetSlot}
                  <div class="cur-title">{itemInTargetSlot.name}</div>
                  <div class="cur-stat">ATK: +{itemInTargetSlot.bonus_atk ?? 0}</div>
                  <div class="cur-stat">DEF: +{itemInTargetSlot.bonus_def ?? 0}</div>
                  <div class="cur-stat">HP: +{itemInTargetSlot.bonus_hp ?? 0}</div>
                {:else}
                  <div class="cur-empty">Slot is currently empty</div>
                {/if}
              </div>
            </div>
          {/if}

          <div class="inspector-actions">
            {#if selected.type === 'CONSUMABLE' || selected.type === 'consumable'}
              <button type="button" class="btn-primary" onclick={() => { onuse(selected!.id); selected = null; }}>
                🧪 Consume / Use
              </button>
            {:else}
              <button type="button" class="btn-primary" onclick={() => handleEquip(selected!)}>
                ✨ Equip to {targetSlotForSelected ? slotLabels[targetSlotForSelected].label : 'Hero'}
              </button>
            {/if}
            <button type="button" class="btn-secondary" onclick={() => (selected = null)}>Close</button>
          </div>
        </div>
      {:else if inspectingSlot && equipment[inspectingSlot]}
        <!-- SLOT INSPECTOR (WHEN CLICKING AN EQUIPPED SLOT ON THE PAPERDOLL) -->
        {@const eqItem = equipment[inspectingSlot]!}
        <div class="inspector-card">
          <div class="inspector-header">
            <span class="ins-icon">{eqItem.icon ?? '⚔️'}</span>
            <div class="ins-titles">
              <h3>{eqItem.name}</h3>
              <span class="ins-sub">Equipped in {slotLabels[inspectingSlot].label} ({slotLabels[inspectingSlot].bodyPart})</span>
            </div>
          </div>

          {#if eqItem.description}
            <p class="ins-desc">{eqItem.description}</p>
          {/if}

          <div class="stat-bonuses-row">
            {#if eqItem.bonus_atk}<span class="stat-tag atk">+{eqItem.bonus_atk} ATK</span>{/if}
            {#if eqItem.bonus_def}<span class="stat-tag def">+{eqItem.bonus_def} DEF</span>{/if}
            {#if eqItem.bonus_hp}<span class="stat-tag hp">+{eqItem.bonus_hp} HP</span>{/if}
          </div>

          <div class="inspector-actions">
            {#if onunequip}
              <button type="button" class="btn-danger" onclick={() => handleUnequip(inspectingSlot!)}>
                🔻 Unequip to Bag
              </button>
            {/if}
            <button type="button" class="btn-secondary" onclick={() => (inspectingSlot = null)}>Close</button>
          </div>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .inventory-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: #e5edf5;
    background: #0d0d12;
    font-family: inherit;
  }

  .inv-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.25rem;
    background: #14131b;
    border-bottom: 1px solid #2d261e;
  }
  .header-titles h2 {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.15rem;
    color: #c9a14a;
    margin: 0;
    letter-spacing: 0.05em;
  }
  .header-sub {
    font-size: 0.75rem;
    color: #928b80;
  }
  .gold-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    background: #1e1b12;
    border: 1px solid #5a4724;
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 700;
    color: #ffd700;
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .wardrobe-toggle-bar {
    display: flex;
    gap: 0.25rem;
    background: #0d0c12;
    border: 1px solid #363040;
    padding: 0.2rem;
    border-radius: 999px;
  }
  .wardrobe-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #8a8274;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 140ms ease;
  }
  .wardrobe-btn:hover { color: #fff; }
  .wardrobe-btn.active {
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.3), rgba(130, 95, 30, 0.45));
    border-color: #c9a14a;
    color: #ffd700;
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.3);
  }
  .camp-trigger-btn {
    background: linear-gradient(135deg, #a63a18 0%, #6d220b 100%);
    color: #ffffff;
    border: 1px solid #d45828;
    font-size: 0.6875rem;
    font-weight: 700;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 140ms ease;
    box-shadow: 0 0 8px rgba(212, 88, 40, 0.4);
    white-space: nowrap;
  }
  .camp-trigger-btn:hover {
    background: #c2461f;
    box-shadow: 0 0 14px rgba(212, 88, 40, 0.7);
    transform: translateY(-1px);
  }

  .mannequin-container.camp-hearth {
    background: radial-gradient(circle at 50% 35%, rgba(45, 30, 20, 0.7) 0%, rgba(14, 11, 10, 0.95) 100%);
    border: 1px solid #5a3d1c;
  }
  .camp-hearth-embers {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    background: radial-gradient(ellipse at 50% 100%, rgba(255, 120, 30, 0.35) 0%, transparent 75%);
    pointer-events: none;
    z-index: 2;
    animation: fireFlicker 2s infinite alternate ease-in-out;
  }
  @keyframes fireFlicker {
    0% { opacity: 0.7; transform: scaleY(0.95); }
    100% { opacity: 1; transform: scaleY(1.05); }
  }

  .inv-main {
    flex: 1;
    display: grid;
    grid-template-columns: 460px 1fr;
    min-height: 0;
    overflow: hidden;
  }
  @media (max-width: 820px) {
    .inv-main {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
  }

  /* LEFT QUADRANT: PAPERDOLL STAGE */
  .paperdoll-quadrant {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    background: #100f16;
    border-right: 1px solid #262220;
    overflow-y: auto;
  }
  .quadrant-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: 'Cinzel', Georgia, serif;
    font-size: 0.85rem;
    color: #bfa879;
    letter-spacing: 0.05em;
    margin-bottom: 0.75rem;
  }
  .slot-count {
    font-family: monospace;
    font-size: 0.75rem;
    color: #7b7569;
  }

  .paperdoll-stage {
    display: grid;
    grid-template-columns: 105px 1fr 105px;
    gap: 0.5rem;
    align-items: stretch;
    position: relative;
    background: radial-gradient(circle at 50% 40%, #1e1b26 0%, #0d0c11 100%);
    border: 1px solid #2d261e;
    border-radius: 8px;
    padding: 0.75rem 0.5rem;
    min-height: 440px;
  }

  .slots-col {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    z-index: 2;
  }

  .slot-card {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(18, 17, 24, 0.85);
    border: 1px solid #2e2836;
    border-radius: 6px;
    padding: 0.35rem 0.45rem;
    text-align: left;
    cursor: pointer;
    transition: all 150ms ease;
    color: inherit;
  }
  .slot-card:hover {
    border-color: #c9a14a;
    background: rgba(30, 27, 40, 0.9);
  }
  .slot-card.equipped {
    border-color: #554427;
    background: rgba(28, 24, 18, 0.85);
  }
  .slot-card.inspecting {
    border-color: #ffd700;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.3);
  }
  .slot-card.targeted {
    border-color: #00e5ff;
    box-shadow: 0 0 10px rgba(0, 229, 255, 0.4);
    background: rgba(12, 28, 42, 0.9);
  }
  .slot-icon-box {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.15rem;
    background: #171520;
    border-radius: 4px;
    border: 1px solid #383040;
    flex-shrink: 0;
  }
  .slot-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .slot-name {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: #8a8274;
    letter-spacing: 0.04em;
  }
  .slot-item-title {
    font-size: 0.65rem;
    font-weight: 600;
    color: #e5edf5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* MANNEQUIN STAGE WRAPPER */
  .mannequin-stage-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    width: 100%;
    min-width: 0;
  }

  .stage-control-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
    width: 100%;
    z-index: 10;
  }

  /* Camera Mode Switcher */
  .camera-mode-bar {
    display: flex;
    gap: 0.35rem;
    background: rgba(14, 13, 20, 0.9);
    padding: 0.2rem;
    border-radius: 999px;
    border: 1px solid #2d261e;
  }

  /* Emote Quickbar */
  .emote-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    background: rgba(14, 13, 20, 0.9);
    padding: 0.2rem 0.35rem;
    border-radius: 999px;
    border: 1px solid #2d261e;
  }
  .emote-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    background: transparent;
    border: 1px solid transparent;
    color: #9c9488;
    font-size: 0.625rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 150ms ease;
  }
  .emote-btn:hover {
    color: #ffd700;
    background: rgba(255, 215, 0, 0.1);
    border-color: rgba(255, 215, 0, 0.3);
  }
  .emote-btn.active {
    background: linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(201, 161, 74, 0.4));
    border-color: #ffd700;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
  }
  .emote-btn-icon {
    font-size: 0.75rem;
  }

  /* Emote Shout Speech Bubble */
  .emote-shout-bubble {
    position: absolute;
    top: 6%;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 14, 22, 0.95);
    border: 2px solid var(--bubble-border, #ffd700);
    border-radius: 12px;
    padding: 0.35rem 0.75rem;
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: 0 0 16px var(--bubble-border, #ffd700), 0 4px 12px rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    gap: 0.35rem;
    z-index: 20;
    animation: shoutPop 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    pointer-events: none;
  }
  .emote-shout-bubble::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-width: 6px 6px 0;
    border-style: solid;
    border-color: var(--bubble-border, #ffd700) transparent;
    display: block;
    width: 0;
  }
  @keyframes shoutPop {
    0% { transform: translate(-50%, 10px) scale(0.6); opacity: 0; }
    70% { transform: translate(-50%, -4px) scale(1.08); opacity: 1; }
    100% { transform: translate(-50%, 0) scale(1); opacity: 1; }
  }

  /* FORTNITE / MMO EMOTE ANIMATIONS */
  .hero-render-frame.emote-dance {
    animation: emoteGroove 1.6s ease-in-out infinite;
  }
  @keyframes emoteGroove {
    0%, 100% { transform: translateY(0) rotate(0deg); }
    20% { transform: translateY(-8px) rotate(-3deg) scale(1.02); }
    40% { transform: translateY(0) rotate(2deg); }
    60% { transform: translateY(-10px) rotate(3deg) scale(1.03); }
    80% { transform: translateY(0) rotate(-2deg); }
  }

  .hero-render-frame.emote-twirl {
    animation: emoteBladeTwirl 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  @keyframes emoteBladeTwirl {
    0% { transform: rotateY(0deg) scale(1); filter: drop-shadow(0 0 0px #00e5ff); }
    50% { transform: rotateY(180deg) scale(1.08); filter: drop-shadow(0 0 16px #00e5ff); }
    100% { transform: rotateY(360deg) scale(1); filter: drop-shadow(0 0 0px #00e5ff); }
  }

  .hero-render-frame.emote-surge {
    animation: emoteSpellSurge 1.4s ease-in-out infinite alternate;
  }
  @keyframes emoteSpellSurge {
    0% { transform: translateY(0) scale(1); filter: drop-shadow(0 0 6px #b344ff); }
    100% { transform: translateY(-16px) scale(1.06); filter: drop-shadow(0 0 24px #e040fb); }
  }

  .hero-render-frame.emote-rest {
    animation: emoteCozyRest 2.5s ease-in-out infinite alternate;
  }
  @keyframes emoteCozyRest {
    0% { transform: translateY(14px) scale(0.95); filter: drop-shadow(0 0 8px #ff8833); }
    100% { transform: translateY(18px) scale(0.93) rotate(1deg); filter: drop-shadow(0 0 16px #ffaa44); }
  }

  .hero-render-frame.emote-bow {
    animation: emoteCourtlyBow 2s ease-in-out infinite alternate;
  }
  @keyframes emoteCourtlyBow {
    0% { transform: rotate(0deg) scale(1); }
    40%, 70% { transform: translateY(12px) rotate(6deg) scale(0.96); filter: drop-shadow(0 0 10px #c9a14a); }
    100% { transform: rotate(0deg) scale(1); }
  }

  .hero-render-frame.emote-flex {
    animation: emoteTitanFlex 1.2s ease-in-out infinite;
  }
  @keyframes emoteTitanFlex {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 4px #ff3366); }
    30% { transform: scale(1.08) translateY(-4px); filter: drop-shadow(0 0 20px #ff1744); }
    60% { transform: scale(1.06) translateY(-2px); filter: drop-shadow(0 0 16px #ff5252); }
  }
  .cam-toggle {
    background: transparent;
    border: 1px solid transparent;
    color: #8a8274;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    cursor: pointer;
    transition: all 160ms ease;
  }
  .cam-toggle:hover {
    color: #e5edf5;
  }
  .cam-toggle.active {
    background: linear-gradient(135deg, rgba(201, 161, 74, 0.25), rgba(130, 95, 30, 0.4));
    border-color: #c9a14a;
    color: #ffd700;
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.3);
  }

  /* MANNEQUIN CONTAINER */
  .mannequin-container {
    position: relative;
    width: 100%;
    height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 8px;
    background: radial-gradient(circle at 50% 35%, rgba(30, 26, 40, 0.6) 0%, rgba(10, 9, 14, 0.9) 100%);
    box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.85);
  }

  .plinth-ambient-glow {
    position: absolute;
    bottom: 5px;
    left: 10%;
    right: 10%;
    height: 60px;
    background: radial-gradient(ellipse at 50% 80%, rgba(201, 161, 74, 0.25) 0%, transparent 70%);
    pointer-events: none;
    z-index: 1;
  }

  /* Hero Render Frame */
  .hero-render-frame {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 350ms cubic-bezier(0.2, 0.8, 0.2, 1);
    transform-origin: 50% 22%;
  }

  .hero-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center bottom;
    filter: drop-shadow(0 4px 16px rgba(0, 0, 0, 0.85));
    user-select: none;
    pointer-events: none;
  }

  /* Close-Up Visage Zoom (Face / Head / Neck inspection) */
  .mannequin-container.visage-zoom .hero-render-frame {
    transform: scale(2.4) translateY(24%);
  }

  /* BODY SOCKET RETICLES */
  .body-socket-node {
    position: absolute;
    transform: translate(-50%, -50%);
    z-index: 6;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    transition: all 180ms ease;
  }
  .node-disc {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(14, 13, 20, 0.85);
    border: 1px solid rgba(201, 161, 74, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
    transition: all 180ms ease;
  }
  .node-icon {
    font-size: 1.1rem;
    line-height: 1;
  }
  .node-placeholder {
    font-size: 0.85rem;
    opacity: 0.4;
    filter: grayscale(1);
    transition: opacity 150ms ease;
  }
  .body-socket-node:hover .node-disc {
    border-color: #ffd700;
    background: rgba(28, 24, 38, 0.95);
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.5);
    transform: scale(1.15);
  }
  .body-socket-node:hover .node-placeholder {
    opacity: 0.85;
    filter: none;
  }
  .body-socket-node.equipped .node-disc {
    border-color: #c9a14a;
    background: radial-gradient(circle at 35% 35%, rgba(45, 38, 25, 0.9), rgba(16, 14, 12, 0.95));
    box-shadow: 0 0 8px rgba(201, 161, 74, 0.4);
  }
  .body-socket-node.targeted .node-disc {
    border-color: #00e5ff;
    box-shadow: 0 0 16px rgba(0, 229, 255, 0.7);
    transform: scale(1.2);
  }

  .socket-reticle-ping {
    position: absolute;
    top: -4px; left: -4px; right: -4px; bottom: -4px;
    border-radius: 50%;
    border: 2px solid #00e5ff;
    animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
    pointer-events: none;
  }
  @keyframes ping {
    75%, 100% {
      transform: scale(1.6);
      opacity: 0;
    }
  }

  /* Equip Burst Ring */
  .equip-burst-ring {
    position: absolute;
    top: 50%; left: 50%;
    width: 140px; height: 140px;
    margin-top: -70px; margin-left: -70px;
    border-radius: 50%;
    border: 2px solid #ffd700;
    box-shadow: 0 0 24px #ffd700;
    animation: burstOut 450ms ease-out forwards;
    pointer-events: none;
    z-index: 5;
  }
  @keyframes burstOut {
    0% { transform: scale(0.2); opacity: 1; }
    100% { transform: scale(2.2); opacity: 0; }
  }

  /* Active Slot Inspect Card */
  .active-slot-inspect-card {
    margin-top: 0.5rem;
    width: 100%;
    background: rgba(20, 18, 27, 0.95);
    border: 1px solid #c9a14a;
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    animation: slideUp 180ms ease;
    z-index: 8;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .inspect-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .inspect-icon-box {
    font-size: 1.25rem;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #14121a;
    border: 1px solid #3d3527;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .inspect-info {
    flex: 1;
    min-width: 0;
  }
  .inspect-slot-tag {
    font-size: 0.6rem;
    text-transform: uppercase;
    color: #c9a14a;
    letter-spacing: 0.05em;
  }
  .inspect-item-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: #f3efe6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .unequip-btn {
    background: rgba(180, 40, 40, 0.2);
    border: 1px solid #a32a2a;
    color: #ff8888;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 120ms ease;
    white-space: nowrap;
  }
  .unequip-btn:hover {
    background: rgba(220, 50, 50, 0.4);
    border-color: #dc3545;
    color: #ffffff;
  }
  .inspect-stats-mini {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.35rem;
    padding-top: 0.35rem;
    border-top: 1px solid rgba(201, 161, 74, 0.15);
  }
  .istat {
    font-size: 0.65rem;
    color: #70d890;
    background: rgba(76, 175, 117, 0.1);
    border: 1px solid rgba(76, 175, 117, 0.25);
    padding: 0.05rem 0.35rem;
    border-radius: 3px;
  }

  /* BONUSES STRIP */
  .bonuses-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #2d261e;
  }
  .stat-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #16151f;
    border: 1px solid #2f2a3a;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
  }
  .pill-k { color: #9c9488; }
  .pill-v { font-weight: 700; color: #4caf75; }

  /* RIGHT QUADRANT: BACKPACK */
  .backpack-quadrant {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    min-height: 0;
    overflow: hidden;
  }

  .filter-row {
    display: flex;
    gap: 0.35rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #262220;
  }
  .tab-btn {
    background: #14131a;
    border: 1px solid #282430;
    color: #9c9488;
    border-radius: 4px;
    padding: 0.3rem 0.75rem;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 120ms ease;
  }
  .tab-btn:hover {
    color: #e5edf5;
    border-color: #4a4255;
  }
  .tab-btn.active {
    background: #c9a14a;
    color: #1a1208;
    font-weight: 700;
    border-color: #c9a14a;
  }

  .items-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem 0;
  }
  .backpack-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 0.5rem;
  }
  .item-tile {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    background: #15141e;
    border: 1px solid #2d263a;
    border-radius: 6px;
    padding: 0.25rem;
    position: relative;
    cursor: pointer;
    transition: all 150ms ease;
    color: inherit;
  }
  .item-tile:hover {
    border-color: #c9a14a;
    background: #1d1b2a;
  }
  .item-tile.selected {
    border-color: #ffd700;
    background: #242036;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.25);
  }
  .tile-icon { font-size: 1.65rem; }
  .tile-title {
    font-size: 0.6rem;
    color: #a49e92;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
  }
  .tile-qty {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 0.625rem;
    font-weight: 700;
    color: #ffd700;
  }
  .empty-backpack-note {
    grid-column: 1 / -1;
    padding: 2rem 1rem;
    text-align: center;
    color: #6a6458;
    font-size: 0.8125rem;
  }

  /* ITEM INSPECTION & COMPARISON MODAL */
  .inspector-card {
    background: #16141f;
    border: 1px solid #3d3420;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    margin-top: 0.5rem;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    animation: fadeIn 150ms ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .inspector-header {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 0.5rem;
  }
  .ins-icon { font-size: 1.75rem; }
  .ins-titles h3 {
    margin: 0;
    font-size: 0.95rem;
    color: #e5edf5;
    font-weight: 700;
  }
  .ins-sub {
    font-size: 0.6875rem;
    color: #8c8578;
  }
  .rarity-badge {
    margin-left: auto;
    font-size: 0.625rem;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    text-transform: uppercase;
    font-weight: 700;
    background: #252230;
    color: #ffd700;
  }

  .ins-desc {
    font-size: 0.75rem;
    color: #b0a99c;
    margin: 0 0 0.65rem 0;
    line-height: 1.4;
  }

  /* COMPARISON GRID */
  .comparison-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    background: #111018;
    border: 1px solid #23202c;
    border-radius: 6px;
    padding: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .comp-col {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
  }
  .comp-hdr {
    font-size: 0.625rem;
    text-transform: uppercase;
    color: #8b8374;
    letter-spacing: 0.05em;
    margin-bottom: 0.2rem;
  }
  .comp-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #e5edf5;
  }
  .diff-badge {
    font-weight: 700;
    font-size: 0.7rem;
  }
  .diff-badge.pos { color: #4caf75; }
  .diff-badge.neg { color: #e05252; }
  .diff-badge.zero { color: #6a6458; }

  .comp-col.current {
    border-left: 1px solid #221f2b;
    padding-left: 0.5rem;
  }
  .cur-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: #bfa879;
  }
  .cur-stat { color: #8e887d; }
  .cur-empty { font-size: 0.7rem; color: #5f5a50; font-style: italic; }

  .stat-bonuses-row {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.65rem;
  }
  .stat-tag {
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    background: #1f1b29;
    border: 1px solid #3a3246;
  }
  .stat-tag.atk { color: #e57373; }
  .stat-tag.def { color: #64b5f6; }
  .stat-tag.hp { color: #81c784; }

  .inspector-actions {
    display: flex;
    gap: 0.5rem;
  }
  .btn-primary {
    background: #c9a14a;
    color: #1a1208;
    border: none;
    font-weight: 700;
    padding: 0.45rem 1rem;
    font-size: 0.8125rem;
    border-radius: 4px;
    cursor: pointer;
    transition: background 120ms ease;
  }
  .btn-primary:hover { background: #dfb356; }
  .btn-danger {
    background: #8b2525;
    color: #ffffff;
    border: none;
    font-weight: 600;
    padding: 0.45rem 1rem;
    font-size: 0.8125rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-danger:hover { background: #a63131; }
  .btn-secondary {
    background: #1f1d29;
    color: #aaa497;
    border: 1px solid #332d3e;
    padding: 0.45rem 0.85rem;
    font-size: 0.8125rem;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-secondary:hover { color: #ffffff; }

  .rarity.common { color: #aaa; }
  .rarity.uncommon { color: #4caf75; }
  .rarity.rare { color: #5b8def; }
  .rarity.epic { color: #a07cd9; }
  .rarity.legendary { color: var(--accent); }
  .bonuses { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.625rem; font-size: 0.75rem; color: var(--success); }
  .actions { display: flex; gap: 0.5rem; }
  .primary { background: var(--accent); color: #1a1208; border: none; font-weight: 600; }

  /* ══════════════════════════════════════════════════════════════════
     ELEMENTAL AURA GLOWS & WEAPON RIGGING (SOTA VISUALS)
     ══════════════════════════════════════════════════════════════════ */
  .slot-elem-tag {
    font-size: 0.58rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    margin-top: 0.15rem;
    display: inline-block;
  }
  .tile-elem-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    font-size: 0.65rem;
    font-weight: 900;
  }
  .elem-infusion-pill {
    font-size: 0.65rem;
    font-weight: 800;
    padding: 0.2rem 0.55rem;
    border-radius: 999px;
    letter-spacing: 0.06em;
    border: 1px solid;
    animation: pulseInfusion 2s infinite ease-in-out;
  }

  /* Fire Aura */
  .glow-fire {
    border-color: #f97316 !important;
    box-shadow: 0 0 10px rgba(249, 115, 22, 0.45), inset 0 0 8px rgba(239, 68, 68, 0.2) !important;
  }
  .node-glow-fire {
    border-color: #f97316 !important;
    box-shadow: 0 0 14px #f97316, inset 0 0 6px #ef4444 !important;
  }
  .tile-glow-fire {
    border-color: rgba(249, 115, 22, 0.7) !important;
    background: rgba(249, 115, 22, 0.08) !important;
  }
  .elem-fire {
    color: #ff7733 !important;
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(249, 115, 22, 0.4);
    text-shadow: 0 0 6px rgba(249, 115, 22, 0.6);
  }
  .burst-fire {
    background: radial-gradient(circle, rgba(249,115,22,0.8) 0%, rgba(239,68,68,0) 70%);
  }

  /* Frost Aura */
  .glow-frost {
    border-color: #38bdf8 !important;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.45), inset 0 0 8px rgba(103, 232, 249, 0.2) !important;
  }
  .node-glow-frost {
    border-color: #38bdf8 !important;
    box-shadow: 0 0 14px #38bdf8, inset 0 0 6px #67e8f9 !important;
  }
  .tile-glow-frost {
    border-color: rgba(56, 189, 248, 0.7) !important;
    background: rgba(56, 189, 248, 0.08) !important;
  }
  .elem-frost {
    color: #38bdf8 !important;
    background: rgba(56, 189, 248, 0.15);
    border-color: rgba(56, 189, 248, 0.4);
    text-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
  }
  .burst-frost {
    background: radial-gradient(circle, rgba(56,189,248,0.8) 0%, rgba(103,232,249,0) 70%);
  }

  /* Lightning Aura */
  .glow-lightning {
    border-color: #eab308 !important;
    box-shadow: 0 0 10px rgba(234, 179, 8, 0.5), inset 0 0 8px rgba(56, 189, 248, 0.2) !important;
  }
  .node-glow-lightning {
    border-color: #eab308 !important;
    box-shadow: 0 0 14px #eab308, inset 0 0 6px #fde047 !important;
  }
  .tile-glow-lightning {
    border-color: rgba(234, 179, 8, 0.7) !important;
    background: rgba(234, 179, 8, 0.08) !important;
  }
  .elem-lightning {
    color: #facc15 !important;
    background: rgba(234, 179, 8, 0.15);
    border-color: rgba(234, 179, 8, 0.4);
    text-shadow: 0 0 6px rgba(234, 179, 8, 0.6);
  }
  .burst-lightning {
    background: radial-gradient(circle, rgba(234,179,8,0.8) 0%, rgba(56,189,248,0) 70%);
  }

  /* Void Aura */
  .glow-void {
    border-color: #a855f7 !important;
    box-shadow: 0 0 10px rgba(168, 85, 247, 0.5), inset 0 0 8px rgba(99, 102, 241, 0.2) !important;
  }
  .node-glow-void {
    border-color: #a855f7 !important;
    box-shadow: 0 0 14px #a855f7, inset 0 0 6px #c084fc !important;
  }
  .tile-glow-void {
    border-color: rgba(168, 85, 247, 0.7) !important;
    background: rgba(168, 85, 247, 0.08) !important;
  }
  .elem-void {
    color: #c084fc !important;
    background: rgba(168, 85, 247, 0.15);
    border-color: rgba(168, 85, 247, 0.4);
    text-shadow: 0 0 6px rgba(168, 85, 247, 0.6);
  }
  .burst-void {
    background: radial-gradient(circle, rgba(168,85,247,0.8) 0%, rgba(99,102,241,0) 70%);
  }

  /* Holy Aura */
  .glow-holy {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 12px rgba(251, 191, 36, 0.55), inset 0 0 8px rgba(254, 240, 138, 0.25) !important;
  }
  .node-glow-holy {
    border-color: #fbbf24 !important;
    box-shadow: 0 0 14px #fbbf24, inset 0 0 6px #fef08a !important;
  }
  .tile-glow-holy {
    border-color: rgba(251, 191, 36, 0.7) !important;
    background: rgba(251, 191, 36, 0.08) !important;
  }
  .elem-holy {
    color: #fef08a !important;
    background: rgba(251, 191, 36, 0.18);
    border-color: rgba(251, 191, 36, 0.5);
    text-shadow: 0 0 8px rgba(251, 191, 36, 0.7);
  }
  .burst-holy {
    background: radial-gradient(circle, rgba(251,191,36,0.85) 0%, rgba(254,240,138,0) 70%);
  }

  /* Poison Aura */
  .glow-poison {
    border-color: #10b981 !important;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.5), inset 0 0 8px rgba(34, 197, 94, 0.2) !important;
  }
  .node-glow-poison {
    border-color: #10b981 !important;
    box-shadow: 0 0 14px #10b981, inset 0 0 6px #4ade80 !important;
  }
  .tile-glow-poison {
    border-color: rgba(16, 185, 129, 0.7) !important;
    background: rgba(16, 185, 129, 0.08) !important;
  }
  .elem-poison {
    color: #34d399 !important;
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.4);
    text-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }
  .burst-poison {
    background: radial-gradient(circle, rgba(16,185,129,0.8) 0%, rgba(34,197,94,0) 70%);
  }

  .weapon-elemental-burst {
    position: absolute;
    top: -12px;
    left: -12px;
    right: -12px;
    bottom: -12px;
    border-radius: 50%;
    pointer-events: none;
    animation: burstPulse 2s infinite ease-in-out;
    opacity: 0.75;
    z-index: 1;
  }

  @keyframes burstPulse {
    0%, 100% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.35); opacity: 0.95; }
  }

  @keyframes pulseInfusion {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.04); }
  }
</style>
