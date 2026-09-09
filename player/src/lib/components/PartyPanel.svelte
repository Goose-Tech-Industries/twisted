<script lang="ts">
  import { onMount } from 'svelte'
  import { social } from '$stores/social.svelte'
  import { character } from '$stores/character.svelte'
  import { companion } from '$stores/companion.svelte'
  import { voiceChat } from '$stores/voice_chat.svelte'

  interface Props {
    onleaveparty?: () => void
    oninvite?: (name: string) => void
  }
  let { onleaveparty, oninvite }: Props = $props()

  let inviteName = $state('')
  let planInput = $state('')
  let isThoughtMode = $state(false)
  let showTacticalLog = $state(false)
  let showPropertiesModal = $state(false)
  let showUnderworldDrawer = $state(false)
  let defenestrateTargetId = $state(1)
  let defenestrateTargetName = $state('Rival Cutpurse')
  let godsEyeWhisperMsg = $state('')
  let showColossusDeck = $state(false)
  let underworldTab = $state<'drama' | 'bounties' | 'fence' | 'schedules'>('drama')
  let stashGoldAmount = $state<number>(50)
  let stashItemKey = $state<string>('skeleton_key')
  let stashItemName = $state<string>('Masterwork Skeleton Key')
  let selectedTrophyKey = $state<string>('colossus_skull')

  let showSettingsModal = $state(false)
  let showWorkshopDeck = $state(false)
  let showCatacombsDeck = $state(false)
  let showTerritoriesDeck = $state(false)
  let showForensicsDeck = $state(false)
  let showVoiceCombatBar = $state(false)

  let catacombPrompt = $state('ancient forgotten crypt of the shadow king')
  let customSpellPhrase = $state('Ignis Tempest')
  let workshopTab = $state<'runes' | 'alchemy' | 'dispatches'>('runes')

  onMount(() => {
    void social.loadParty()
    if (character.active?.id) {
      void companion.load(character.active.id)
    }
    void voiceChat.getFeatureFlags()
  })

  function invite(e: Event) {
    e.preventDefault()
    if (!inviteName.trim()) return
    oninvite?.(inviteName.trim())
    inviteName = ''
  }

  function handleVoiceConnect() {
    const pId = social.party?.id || character.active?.id || 1
    const cId = character.active?.id || 1
    const cName = character.active?.name || 'Player'
    const mapId = character.active?.map_id || 1
    void voiceChat.join(pId, cId, cName, mapId)
  }

  function sendPlan(e: Event) {
    e.preventDefault()
    if (!planInput.trim()) return
    const coords = {
      map_id: character.active?.map_id || 1,
      x: character.active?.x || 10,
      y: character.active?.y || 10
    }
    voiceChat.sendPartySpeech(planInput.trim(), isThoughtMode, coords)
    planInput = ''
  }

  function handleBattleCry() {
    const coords = {
      map_id: character.active?.map_id || 1,
      x: character.active?.x || 10,
      y: character.active?.y || 10
    }
    voiceChat.shoutBattleCry(undefined, coords)
  }
</script>

<div class="party">
  <header>
    <div class="header-left">
      <h2>Party & Squad</h2>
      <span class="circadian-badge" class:night={['night', 'midnight', 'dusk'].includes(voiceChat.timeOfDay)} title="Circadian Phase">
        {#if ['night', 'midnight', 'dusk'].includes(voiceChat.timeOfDay)}
          🌙 Nightfall (1.5x Sound)
        {:else}
          ☀️ {voiceChat.timeOfDay === 'dawn' ? 'Dawn' : 'Daylight'}
        {/if}
      </span>
      {#if voiceChat.inVoice}
        <span class="voice-badge" title="Voice Chat Connected">
          <span class="pulse-dot"></span> Voice Live
        </span>
      {/if}
    </div>
    {#if social.party}
      <button class="leave" onclick={onleaveparty}>Leave</button>
    {/if}
  </header>

  <!-- Voice Chat Deck -->
  <div class="voice-deck">
    {#if !voiceChat.inVoice}
      <button class="btn-voice-join" onclick={handleVoiceConnect}>
        <span>🎙️ Connect Voice (Party, Footsteps & 3D Proximity)</span>
      </button>
    {:else}
      <div class="voice-controls">
        <button
          class="btn-voice-ctrl"
          class:muted={voiceChat.isMuted}
          onclick={() => voiceChat.toggleMute()}
          title={voiceChat.isMuted ? "Unmute Mic" : "Mute Mic"}
        >
          {voiceChat.isMuted ? "🔇 Unmute" : "🎙️ Mute"}
        </button>
        <button
          class="btn-voice-ctrl"
          class:deafened={voiceChat.isDeafened}
          onclick={() => voiceChat.toggleDeafen()}
          title={voiceChat.isDeafened ? "Undeafen Audio" : "Deafen Audio"}
        >
          {voiceChat.isDeafened ? "🔕 Undeafen" : "🎧 Deafen"}
        </button>
        <button
          class="btn-voice-cry"
          onclick={handleBattleCry}
          title="Shout LEEROY JENKINS to the entire sector & sound war horns!"
        >
          🔥 LEEROY!
        </button>
        <button
          class="btn-voice-leave"
          onclick={() => voiceChat.leave()}
          title="Disconnect from Voice"
        >
          ✕
        </button>
      </div>

      <!-- Transmission Band Switcher (Privacy & Acoustic Range Controls) -->
      <div class="band-bar" role="radiogroup" aria-label="Transmission Band">
        <button
          type="button"
          class="btn-band"
          class:active={voiceChat.transmissionBand === 'party'}
          onclick={() => voiceChat.setTransmissionBand('party')}
          title="Party Encrypted: 100% private squad link. Enemies, dungeon sentries & outside players CANNOT overhear!"
        >
          🔒 Party
        </button>
        <button
          type="button"
          class="btn-band"
          class:active={voiceChat.transmissionBand === 'proximity'}
          onclick={() => voiceChat.setTransmissionBand('proximity')}
          title="Proximity: 16-tile ARC Raiders 3D audio. Nearby random players, denizens, and guards hear you physically."
        >
          🌐 Proximity
        </button>
        <button
          type="button"
          class="btn-band"
          class:active={voiceChat.transmissionBand === 'whisper'}
          onclick={() => voiceChat.setTransmissionBand('whisper')}
          title="Whisper: 4-tile stealth range. Quiet acoustic footprint for sneaking past sentries and sleeping denizens."
        >
          🤫 Whisper
        </button>
        <button
          type="button"
          class="btn-band"
          class:active={voiceChat.transmissionBand === 'shout'}
          onclick={() => voiceChat.setTransmissionBand('shout')}
          title="Shout: 32-tile booming echo. Reaches across map sectors, awakens sleeping folk, and alerts sentries!"
        >
          📢 Shout
        </button>
      </div>

      <!-- Acoustic Privacy Status Chip -->
      <div class="band-status {voiceChat.transmissionBand}">
        {#if voiceChat.transmissionBand === 'party'}
          <span class="status-icon">🔒</span>
          <span class="status-text"><strong>Encrypted Party:</strong> Zero overhear. Enemies and sentries cannot hear you.</span>
        {:else if voiceChat.transmissionBand === 'proximity'}
          <span class="status-icon">🌐</span>
          <span class="status-text"><strong>3D Proximity (16 Tiles):</strong> Open air. Bards, merchants, sentries & players hear you.</span>
        {:else if voiceChat.transmissionBand === 'whisper'}
          <span class="status-icon">🤫</span>
          <span class="status-text"><strong>Stealth Whisper (4 Tiles):</strong> Tight footprint. Sentries &gt;4 tiles cannot hear.</span>
        {:else if voiceChat.transmissionBand === 'shout'}
          <span class="status-icon">📢</span>
          <span class="status-text"><strong>Sector Shout (32 Tiles):</strong> Booming broadcast! Echoes across map, awakens sleepers & alerts sentries.</span>
        {/if}
      </div>

      <!-- Plan Speech & Telepathic Thought Input -->
      <form class="plan-form" onsubmit={sendPlan}>
        <button
          type="button"
          class="btn-thought-toggle"
          class:thought={isThoughtMode}
          onclick={() => { isThoughtMode = !isThoughtMode }}
          title={isThoughtMode ? "Mode: Inner Thought (Silent to normal guards, heard by companions, sleeping dreamers & psionic bosses)" : "Mode: Spoken Voice (Subject to current transmission band & acoustic range)"}
        >
          {isThoughtMode ? "🧠 Mind" : "🎙️ Voice"}
        </button>
        <input
          type="text"
          bind:value={planInput}
          placeholder={isThoughtMode
            ? "Project a telepathic thought (companions hear, echoes in sleeping dreams)..."
            : voiceChat.transmissionBand === 'party'
              ? "Speak to party privately (encrypted, safe from guards)..."
              : voiceChat.transmissionBand === 'whisper'
                ? "Whisper a plan (4 tiles stealth radius, don't wake sleepers)..."
                : voiceChat.transmissionBand === 'shout'
                  ? "Shout aloud (32 tiles echo, sentries alert, sleepers awaken)..."
                  : "Speak in proximity (16 tiles 3D audio, bards/merchants/NPCs hear)..."}
          maxlength="90"
        />
        <button type="submit" disabled={!planInput.trim()}>
          {isThoughtMode ? "Project" : "Discuss"}
        </button>
      </form>
    {/if}
  </div>

  <!-- Battle Cry Notification Banner -->
  {#if voiceChat.lastBattleCry && (Date.now() - voiceChat.lastBattleCry.ts < 4500)}
    <div class="battle-cry-banner">
      <span class="cry-icon">📢</span>
      <div class="cry-text">
        <strong>{voiceChat.lastBattleCry.speaker}:</strong>
        <span>"{voiceChat.lastBattleCry.cry}"</span>
      </div>
    </div>
  {/if}

  <!-- Nearby Peer Spatial Speech Banner (ARC Raiders Proximity) -->
  {#if voiceChat.lastSpatialPeerSpeech && (Date.now() - voiceChat.lastSpatialPeerSpeech.ts < 6000)}
    <div class="spatial-peer-banner">
      <span class="peer-icon">🗣️</span>
      <div class="peer-content">
        <div class="peer-title">
          <strong>{voiceChat.lastSpatialPeerSpeech.name}</strong>
          <span class="peer-badge">{voiceChat.lastSpatialPeerSpeech.mode.toUpperCase()}</span>
          <span class="peer-dist">
            {voiceChat.lastSpatialPeerSpeech.distanceTiles} tiles away
            {#if voiceChat.lastSpatialPeerSpeech.pan < -0.2}
              (Left ◂)
            {:else if voiceChat.lastSpatialPeerSpeech.pan > 0.2}
              (Right ▸)
            {:else}
              (Center ▴)
            {/if}
          </span>
        </div>
        <p>"{voiceChat.lastSpatialPeerSpeech.text}"</p>
      </div>
    </div>
  {/if}

  <!-- Nearby Footstep Radar Banner (Acoustic Locomotion) -->
  {#if voiceChat.lastFootstep && (Date.now() - voiceChat.lastFootstep.ts < 3500)}
    <div class="spatial-footstep-banner">
      <span class="footstep-icon">👣</span>
      <div class="footstep-content">
        <div class="footstep-title">
          <strong>{voiceChat.lastFootstep.name}</strong>
          <span class="footstep-stance-badge">{voiceChat.lastFootstep.stance.toUpperCase()}</span>
          <span class="footstep-surface-badge">{voiceChat.lastFootstep.surface.toUpperCase()}</span>
          <span class="footstep-dist">
            {voiceChat.lastFootstep.distanceTiles} tiles away
            {#if voiceChat.lastFootstep.pan < -0.2}
              (Left ◂)
            {:else if voiceChat.lastFootstep.pan > 0.2}
              (Right ▸)
            {:else}
              (Center ▴)
            {/if}
          </span>
        </div>
        <p>Heard movement across the {voiceChat.lastFootstep.surface}.</p>
      </div>
    </div>
  {/if}

  <!-- Awakened Denizen Alert Banner -->
  {#if voiceChat.lastAwakenedNpc && (Date.now() - voiceChat.lastAwakenedNpc.ts < 6000)}
    <div class="awakened-npc-banner">
      <span class="awakened-icon">{voiceChat.lastAwakenedNpc.icon}</span>
      <div class="awakened-content">
        <div class="awakened-title">
          <strong>{voiceChat.lastAwakenedNpc.name}</strong>
          <span class="awakened-badge">STARTLED AWAKE</span>
        </div>
        <p>{voiceChat.lastAwakenedNpc.reaction}</p>
      </div>
    </div>
  {/if}

  <!-- Companion Spoken Voice Reaction Bubble -->
  {#if voiceChat.lastCompanionSpeech && (Date.now() - voiceChat.lastCompanionSpeech.ts < 6500)}
    <div class="companion-voice-bubble">
      <span class="bubble-icon">{voiceChat.lastCompanionSpeech.icon}</span>
      <div class="bubble-content">
        <div class="bubble-title">
          <strong>{voiceChat.lastCompanionSpeech.name}</strong>
          <span class="bubble-badge">
            {voiceChat.lastCompanionSpeech.isThought ? "Telepathic Voice" : "Spoke in Voice"}
          </span>
        </div>
        <p>"{voiceChat.lastCompanionSpeech.text}"</p>
      </div>
    </div>
  {/if}

  <!-- Companion Physical Tactical Action Banner -->
  {#if voiceChat.lastCompanionAction && (Date.now() - voiceChat.lastCompanionAction.ts < 6500)}
    <div class="companion-action-banner">
      <span class="action-icon">{voiceChat.lastCompanionAction.icon}</span>
      <div class="action-content">
        <div class="action-title">
          <strong>{voiceChat.lastCompanionAction.companionName}</strong>
          <span class="action-badge">{voiceChat.lastCompanionAction.actionName}</span>
        </div>
        <p>{voiceChat.lastCompanionAction.description}</p>
        {#if voiceChat.lastCompanionAction.buff}
          <div class="buff-chip">
            ⚡ +{voiceChat.lastCompanionAction.buff.value} {voiceChat.lastCompanionAction.buff.stat.toUpperCase()}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- World NPC Overheard / Non-Hostile Dynamic Reaction Banner -->
  {#if voiceChat.lastNpcReaction && (Date.now() - voiceChat.lastNpcReaction.ts < 6500)}
    <div class="npc-overheard-banner" class:enemy={voiceChat.lastNpcReaction.isEnemy}>
      <span class="npc-icon">{voiceChat.lastNpcReaction.icon}</span>
      <div class="npc-content">
        <div class="npc-title">
          <strong>{voiceChat.lastNpcReaction.name}</strong>
          <span class="npc-badge">
            {#if voiceChat.lastNpcReaction.isThoughtIntercept}
              Mind Overheard
            {:else}
              Overheard ({voiceChat.lastNpcReaction.distanceTiles || 5} tiles)
            {/if}
          </span>
          {#if voiceChat.lastNpcReaction.throughWindow}
            <span class="window-badge">🪟 Window Bleed</span>
          {/if}
          {#if voiceChat.lastNpcReaction.isNocturnal}
            <span class="nocturnal-badge">🌙 Nocturnal</span>
          {/if}
          {#if voiceChat.lastNpcReaction.isSleeping}
            <span class="sleep-badge">💤 Dreaming</span>
          {/if}
        </div>
        <p>"{voiceChat.lastNpcReaction.text}"</p>
        {#if voiceChat.lastNpcAction?.description}
          <div class="npc-action-desc">
            {#if voiceChat.lastNpcAction.buff}
              <span class="npc-buff-chip">⚡ +{voiceChat.lastNpcAction.buff.value} {voiceChat.lastNpcAction.buff.stat.toUpperCase()}</span>
            {/if}
            <span>{voiceChat.lastNpcAction.description}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Belligerent Drunk Altercation Card & Silver Tongue De-escalation Controls -->
  {#if voiceChat.lastDrunkConfrontation}
    <div class="drunk-altercation-card">
      <div class="altercation-header">
        <span class="altercation-icon">{voiceChat.lastDrunkConfrontation.icon}</span>
        <div class="altercation-title">
          <strong>{voiceChat.lastDrunkConfrontation.npcName}</strong>
          <span class="altercation-badge">⚠️ BRAWL CONFRONTATION</span>
        </div>
        <button
          type="button"
          class="btn-dismiss-confrontation"
          onclick={() => voiceChat.dismissDrunkConfrontation()}
          title="Dismiss Confrontation Banner"
        >
          ✕
        </button>
      </div>

      <p class="altercation-text">"{voiceChat.lastDrunkConfrontation.text}"</p>

      <!-- De-escalation D20 Result Banner if present -->
      {#if voiceChat.lastDeescalateResult}
        <div class="deescalate-result-box" class:success={voiceChat.lastDeescalateResult.success} class:fail={!voiceChat.lastDeescalateResult.success}>
          <div class="roll-breakdown">
            {#if voiceChat.lastDeescalateResult.roll !== undefined}
              <span class="roll-badge">
                🎲 D20 ({voiceChat.lastDeescalateResult.roll}) + Mod ({(voiceChat.lastDeescalateResult.modifier ?? 0) >= 0 ? '+' : ''}{voiceChat.lastDeescalateResult.modifier ?? 0}) = <strong>{voiceChat.lastDeescalateResult.total_roll ?? voiceChat.lastDeescalateResult.roll}</strong> vs DC {voiceChat.lastDeescalateResult.dc ?? 10}
              </span>
            {:else}
              <span class="roll-badge">
                🍺 Auto-Resolution ({voiceChat.lastDeescalateResult.approach})
              </span>
            {/if}
            {#if voiceChat.lastDeescalateResult.crit}
              <span class="crit-badge">⭐ CRITICAL SUCCESS!</span>
            {:else if voiceChat.lastDeescalateResult.crit_fail}
              <span class="crit-fail-badge">💀 CRITICAL FAILURE!</span>
            {/if}
          </div>
          <p class="deescalate-dialogue">"{voiceChat.lastDeescalateResult.dialogue}"</p>
        </div>
      {/if}

      <!-- Interactive Silver Tongue Action Buttons -->
      <div class="deescalation-actions">
        <button
          type="button"
          class="btn-approach buy-drink"
          onclick={() => voiceChat.attemptDeescalation(voiceChat.lastDrunkConfrontation!.npcId, 'buy_drink')}
          title="Buy Olaf a frothing ale (5 Gold) — 100% auto-success for tavern brawlers!"
        >
          🍺 Buy Ale (5g)
        </button>
        <button
          type="button"
          class="btn-approach persuasion"
          onclick={() => voiceChat.attemptDeescalation(voiceChat.lastDrunkConfrontation!.npcId, 'persuasion')}
          title="Roll Persuasion (D20 + CHA/Diplomacy bonus) to calm the angry drunk"
        >
          🗣️ Persuade
        </button>
        <button
          type="button"
          class="btn-approach intimidation"
          onclick={() => voiceChat.attemptDeescalation(voiceChat.lastDrunkConfrontation!.npcId, 'intimidation')}
          title="Roll Intimidation (D20 + STR bonus) to frighten them into backing down"
        >
          ⚔️ Intimidate
        </button>
        <button
          type="button"
          class="btn-approach bribe"
          onclick={() => voiceChat.attemptDeescalation(voiceChat.lastDrunkConfrontation!.npcId, 'bribe')}
          title="Offer a 15 gold pouch (+5 Roll Bonus) to look the other way"
        >
          💰 Bribe (15g)
        </button>
        <button
          type="button"
          class="btn-approach deception"
          onclick={() => voiceChat.attemptDeescalation(voiceChat.lastDrunkConfrontation!.npcId, 'deception')}
          title="Roll Deception (D20 + AGI/Syndicate bonus) to spin an elaborate excuse"
        >
          🎭 Bluff
        </button>
      </div>
    </div>
  {/if}

  <!-- Window Portal Station (Acoustic Aperture, Peeking & Infiltration) -->
  {#if voiceChat.nearbyWindow}
    <div class="window-station-card">
      <div class="station-header">
        <span class="station-icon">🪟</span>
        <div class="station-title">
          <strong>{voiceChat.nearbyWindow.buildingName} Window</strong>
          <span class="window-state-tag {voiceChat.nearbyWindow.state}">
            {#if voiceChat.nearbyWindow.state === 'open'}
              🟢 OPEN (95% Audio, Direct Sightline, Infiltration Ready)
            {:else if voiceChat.nearbyWindow.state === 'cracked'}
              🟡 CRACKED (75% Audio, Low Muffle)
            {:else if voiceChat.nearbyWindow.state === 'closed'}
              🔵 GLASS PANE (35% Audio, Muffled Murmur)
            {:else if voiceChat.nearbyWindow.state === 'shuttered'}
              🪵 SHUTTERED (15% Audio, Heavy Occlusion)
            {:else if voiceChat.nearbyWindow.state === 'broken'}
              🔴 SHATTERED GLASS (100% Audio, Jagged Entry)
            {/if}
          </span>
        </div>
      </div>

      <div class="window-actions">
        <button
          type="button"
          class="btn-win-action toggle"
          onclick={() => voiceChat.toggleWindow(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY)}
          title="Toggle window open/closed (Agility stealth roll vs rusty hinge noise)"
        >
          🖐️ {voiceChat.nearbyWindow.state === 'open' ? 'Close Window' : 'Open Window'}
        </button>

        <button
          type="button"
          class="btn-win-action peek"
          onclick={() => voiceChat.peekWindow(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY)}
          title="Peer through the window to inspect interior occupants and room activities"
        >
          👁️ Peek Inside
        </button>

        {#if voiceChat.nearbyWindow.canClimb}
          <button
            type="button"
            class="btn-win-action climb"
            onclick={() => voiceChat.climbWindow(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY)}
            title="Climb through the window into the building (bypasses locked doors!)"
          >
            🧗 Climb Inside
          </button>
        {/if}

        <button
          type="button"
          class="btn-win-action eavesdrop"
          onclick={() => voiceChat.eavesdropWindow(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY)}
          title="Eavesdrop on interior conversations to gather secret rumors and quest leads"
        >
          👂 Eavesdrop Rumors
        </button>

        <button
          type="button"
          class="btn-win-action pebble"
          onclick={() => voiceChat.throwDistraction(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY, 'copper coin')}
          title="Flick a coin/pebble through the window to distract guards and NPCs"
        >
          🪙 Toss Coin
        </button>

        {#if voiceChat.nearbyWindow.state !== 'broken'}
          <button
            type="button"
            class="btn-win-action break"
            onclick={() => voiceChat.breakWindow(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY)}
            title="Smash the window pane! (Loud noise, alerts guards, creates jagged opening)"
          >
            🔨 Smash Glass
          </button>
        {/if}

        <button
          type="button"
          class="btn-win-action defenestrate"
          onclick={() => voiceChat.defenestrateTarget(defenestrateTargetId, voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY, defenestrateTargetName)}
          title="Hurl target through the window pane to street below (STR contest, glass bleed, fall damage, knocks prone)"
        >
          🥊 Defenestrate
        </button>

        <button
          type="button"
          class="btn-win-action gas-sleep"
          onclick={() => voiceChat.deployWindowGas(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY, 'sleeping_gas')}
          title="Lob Sleeping Gas canister through window (CON save or unconscious for 3 turns)"
        >
          💤 Sleep Gas
        </button>

        <button
          type="button"
          class="btn-win-action gas-smoke"
          onclick={() => voiceChat.deployWindowGas(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY, 'smoke_grenade')}
          title="Throw Smoke Bomb through window (obscures sightline to 1 tile, granting stealth)"
        >
          💨 Smoke Bomb
        </button>

        <button
          type="button"
          class="btn-win-action gas-tear"
          onclick={() => voiceChat.deployWindowGas(voiceChat.nearbyWindow!.windowX, voiceChat.nearbyWindow!.windowY, 'skunkweed_tear_gas')}
          title="Toss Skunkweed Tear Gas through window (evacuates occupants outside immediately)"
        >
          🦨 Skunkweed Gas
        </button>
      </div>
    </div>
  {/if}

  <!-- Defenestration Combat Result Alert Modal -->
  {#if voiceChat.lastDefenestration}
    <div class="defenestration-modal-card" class:success={voiceChat.lastDefenestration.success} class:fail={!voiceChat.lastDefenestration.success}>
      <div class="defen-header">
        <span class="defen-icon">🪟💥</span>
        <div class="defen-title">
          <strong>{voiceChat.lastDefenestration.success ? 'DEFENESTRATION SUCCESS!' : 'DEFENESTRATION BLOCKED!'}</strong>
          <span class="defen-target">{voiceChat.lastDefenestration.target_name || 'Target'}</span>
        </div>
        <button type="button" class="btn-dismiss-defen" onclick={() => voiceChat.dismissDefenestration()}>✕</button>
      </div>
      <p class="defen-narrative">{voiceChat.lastDefenestration.message}</p>
      <div class="defen-stats">
        {#if voiceChat.lastDefenestration.success}
          {#if voiceChat.lastDefenestration.glass_damage}
            <span class="stat-badge glass">💥 Shards: {voiceChat.lastDefenestration.glass_damage} Dmg</span>
          {/if}
          {#if voiceChat.lastDefenestration.fall_damage}
            <span class="stat-badge fall">⬇️ Fall: {voiceChat.lastDefenestration.fall_damage} Dmg</span>
          {/if}
          {#if voiceChat.lastDefenestration.bleeding}
            <span class="stat-badge bleed">🩸 Bleeding</span>
          {/if}
          {#if voiceChat.lastDefenestration.prone}
            <span class="stat-badge prone">💫 Prone</span>
          {/if}
          {#if voiceChat.lastDefenestration.dest_map_id}
            <span class="stat-badge loc">📍 Ejected to Map #{voiceChat.lastDefenestration.dest_map_id}</span>
          {/if}
        {:else}
          <span class="stat-badge fail">
            STR Contest: Rolled {voiceChat.lastDefenestration.str_roll ?? 0} vs DC {voiceChat.lastDefenestration.target_dc ?? 14}
          </span>
          {#if voiceChat.lastDefenestration.blocked_by_bars}
            <span class="stat-badge bars">⛓️ Blocked by Iron Fortification Bars!</span>
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  <!-- Chemical Gas Dispersion Result Banner -->
  {#if voiceChat.lastGasDeploy}
    <div class="gas-modal-card">
      <div class="gas-header">
        <span class="gas-icon">⚗️</span>
        <div class="gas-title">
          <strong>Gas Deployed: {voiceChat.lastGasDeploy.gas_name}</strong>
          <span class="gas-badge">{voiceChat.lastGasDeploy.duration_turns} TURNS ACTIVE</span>
        </div>
        <button type="button" class="btn-dismiss-gas" onclick={() => voiceChat.dismissGasDeploy()}>✕</button>
      </div>
      <p class="gas-narrative">{voiceChat.lastGasDeploy.message}</p>
      {#if (voiceChat.lastGasDeploy.affected_occupants ?? 0) > 0}
        <div class="gas-affected">
          <span>👥 {voiceChat.lastGasDeploy.affected_occupants} Occupant(s) Overcome by Gas</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Window Sightline Peek Result Modal / Drawer -->
  {#if voiceChat.lastPeekResult}
    <div class="peek-modal-card">
      <div class="peek-header">
        <span class="peek-icon">👁️</span>
        <div class="peek-title">
          <strong>Sightline: {voiceChat.lastPeekResult.buildingName}</strong>
          <span class="peek-clarity-badge {voiceChat.lastPeekResult.clarity || 'clear'}">
            {voiceChat.lastPeekResult.clarity === 'distorted' ? 'Distorted (Glass Pane)' : 'Clear Sightline'}
          </span>
        </div>
        <button type="button" class="btn-dismiss-peek" onclick={() => voiceChat.dismissPeek()}>✕</button>
      </div>

      <p class="peek-narrative">{voiceChat.lastPeekResult.message}</p>

      {#if voiceChat.lastPeekResult.occupants && voiceChat.lastPeekResult.occupants.length > 0}
        <div class="peek-occupants-list">
          <div class="occupants-title">OCCUPANTS VISIBLE INSIDE:</div>
          {#each voiceChat.lastPeekResult.occupants as occ (occ.id)}
            <div class="peek-occupant-item">
              <span class="occ-icon">{occ.icon}</span>
              <span class="occ-name">{occ.name} ({occ.role})</span>
              <span class="occ-activity" class:asleep={occ.isSleeping}>{occ.activity}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Sovereign Rumor Intel Card -->
  {#if voiceChat.lastRumorResult}
    <div class="rumor-intel-card" class:success={voiceChat.lastRumorResult.success}>
      <div class="rumor-header">
        <span class="rumor-icon">📜</span>
        <div class="rumor-title">
          <strong>{voiceChat.lastRumorResult.buildingName} — Sovereign Rumor</strong>
          <span class="rumor-badge">INTEL GATHERED</span>
        </div>
        <button type="button" class="btn-dismiss-rumor" onclick={() => voiceChat.dismissRumor()}>✕</button>
      </div>

      {#if voiceChat.lastRumorResult.eavesdropped}
        <div class="rumor-speakers">
          🗣️ Overheard: <em>{voiceChat.lastRumorResult.speakerA}</em> &amp; <em>{voiceChat.lastRumorResult.speakerB}</em>
        </div>
        <p class="rumor-dialogue">"{voiceChat.lastRumorResult.dialogue}"</p>
        {#if voiceChat.lastRumorResult.perk}
          <div class="rumor-perk-chip">
            ⭐ {voiceChat.lastRumorResult.perk} (+{voiceChat.lastRumorResult.rewardXp || 35} XP)
          </div>
        {/if}
      {:else}
        <p class="rumor-dialogue fail">{voiceChat.lastRumorResult.dialogue}</p>
      {/if}
    </div>
  {/if}

  <!-- Uile Reality Warp Banner -->
  {#if voiceChat.lastUileWarp && (Date.now() - voiceChat.lastUileWarp.ts < 7500)}
    <div class="uile-warp-banner">
      <span class="uile-icon">✨</span>
      <div class="uile-content">
        <div class="uile-title">
          <strong>{voiceChat.lastUileWarp.speaker}</strong>
          <span class="uile-badge">{voiceChat.lastUileWarp.title}</span>
        </div>
        <p>{voiceChat.lastUileWarp.message}</p>
      </div>
    </div>
  {/if}

  <!-- Tactical Action Feed Toggle -->
  {#if voiceChat.tacticalLog.length > 0}
    <div class="tactical-log-drawer">
      <button class="log-toggle-btn" onclick={() => { showTacticalLog = !showTacticalLog }}>
        <span>⚡ Tactical Action Feed ({voiceChat.tacticalLog.length})</span>
        <span>{showTacticalLog ? '▲' : '▼'}</span>
      </button>

      {#if showTacticalLog}
        <ul class="tactical-log-list">
          {#each voiceChat.tacticalLog as item (item.id)}
            <li class="log-item {item.source}">
              <span class="log-icon">{item.icon}</span>
              <div class="log-text">
                <span class="log-title">{item.title}</span>
                <span class="log-desc">{item.desc}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <!-- Underworld & Real Estate Hub Bar -->
  <div class="hub-bar">
    <button
      type="button"
      class="btn-hub underworld"
      class:active={showUnderworldDrawer}
      onclick={() => { showUnderworldDrawer = !showUnderworldDrawer }}
    >
      <span>🕵️ Underworld Shadows {#if voiceChat.activeStalker?.spotted}<span class="alert-dot"></span>{/if}</span>
      <span>{showUnderworldDrawer ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub property"
      class:active={showPropertiesModal}
      onclick={() => {
        showPropertiesModal = !showPropertiesModal
        if (showPropertiesModal) voiceChat.getProperties()
      }}
    >
      <span>🏡 Real Estate & Deeds ({voiceChat.propertiesList.length || '3'})</span>
      <span>{showPropertiesModal ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub godseye"
      class:active={voiceChat.godsEyeActive}
      onclick={() => voiceChat.toggleGodsEye()}
      title="Toggle God's Eye Surveillance Grid & Tactical Sonar Matrix (Hotkeys: G to toggle, P to ping sonar)"
    >
      <span>👁️ God's Eye {#if voiceChat.godsEyeSonarResult?.threat_count}<span class="alert-dot red"></span>{/if}</span>
      <span>{voiceChat.godsEyeActive ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub colossus"
      class:active={showColossusDeck}
      onclick={() => {
        showColossusDeck = !showColossusDeck
        if (showColossusDeck) voiceChat.getColossusState()
      }}
      title="Engage the Ashveil Colossus Apex Boss Raid & Planet Mado Active Defense Matrix"
    >
      <span>⚔️ Colossus Raid {#if voiceChat.colossusTelegraph}<span class="alert-dot red pulse"></span>{/if}</span>
      <span>{showColossusDeck ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub workshop"
      class:active={showWorkshopDeck}
      onclick={() => {
        showWorkshopDeck = !showWorkshopDeck
        if (showWorkshopDeck) voiceChat.getSafehouseWorkshop(1)
      }}
      title="Bastion Workshop: Runeforging, Alchemy Alembic & Smuggler Dispatches"
    >
      <span>⚒️ Workshop</span>
      <span>{showWorkshopDeck ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub catacombs"
      class:active={showCatacombsDeck}
      onclick={() => {
        showCatacombsDeck = !showCatacombsDeck
        if (showCatacombsDeck) voiceChat.getCatacombState()
      }}
      title="Spoken Catacombs On-Demand Manifestation"
    >
      <span>🗺️ Catacombs</span>
      <span>{showCatacombsDeck ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub territory"
      class:active={showTerritoriesDeck}
      onclick={() => {
        showTerritoriesDeck = !showTerritoriesDeck
        if (showTerritoriesDeck) voiceChat.getFactionTerritories()
      }}
      title="Dynamic Faction Territory Wars & Turf Control"
    >
      <span>🚩 Turf Wars</span>
      <span>{showTerritoriesDeck ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub forensics"
      class:active={showForensicsDeck}
      onclick={() => {
        showForensicsDeck = !showForensicsDeck
        if (showForensicsDeck) voiceChat.getForensicCases()
      }}
      title="Forensic Murder Mysteries & Magistrate Trials"
    >
      <span>🔍 Forensics</span>
      <span>{showForensicsDeck ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub voicecombat"
      class:active={showVoiceCombatBar}
      onclick={() => {
        showVoiceCombatBar = !showVoiceCombatBar
        if (showVoiceCombatBar) voiceChat.getVoiceCombatCapabilities()
      }}
      title="Real-Time Spoken Incantations & Squad Voice Tactics"
    >
      <span>🎙️ Spoken Magic</span>
      <span>{showVoiceCombatBar ? '▲' : '▼'}</span>
    </button>
    <button
      type="button"
      class="btn-hub matrix"
      class:active={showSettingsModal}
      onclick={() => {
        showSettingsModal = !showSettingsModal
        if (showSettingsModal) voiceChat.getFeatureFlags()
      }}
      title="Master Engine Systems Feature Flag Matrix"
    >
      <span>⚙️ Settings ({voiceChat.featureFlags.length || '10'})</span>
      <span>{showSettingsModal ? '▲' : '▼'}</span>
    </button>
  </div>

  <!-- God's Eye Surveillance Grid & Tactical Sonar Deck -->
  {#if voiceChat.godsEyeActive}
    <div class="godseye-deck">
      <div class="godseye-header">
        <div class="godseye-brand">
          <span class="godseye-eye-icon">👁️</span>
          <div>
            <div class="godseye-title">
              <strong>AN TSÚIL UILE // GOD'S EYE</strong>
              <span class="godseye-badge">ACTIVE SONAR RADAR</span>
            </div>
            <p class="godseye-sub">Acoustic Sonar Matrix • Conscious Soul Wiretap • Ramsey Threat Scanner • Orbital Interventions</p>
          </div>
        </div>
        <div class="godseye-header-actions">
          <button
            type="button"
            class="btn-sonar-ping"
            onclick={() => voiceChat.pingGodsEyeSonar(15)}
            title="Dispatch 15m localized acoustic sonar ping (Hotkey: P)"
          >
            📡 Ping Sonar (15m)
          </button>
          <button
            type="button"
            class="btn-sonar-scan"
            onclick={() => voiceChat.scanGodsEye()}
            title="Perform full realm radar scan"
          >
            🔄 Refresh Scan
          </button>
          <button
            type="button"
            class="btn-close-godseye"
            onclick={() => voiceChat.toggleGodsEye(false)}
            title="Close God's Eye"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Radar Scope Viewport + Target Wiretap -->
      <div class="godseye-viewport-row">
        <!-- Circular Sonar Radar Scope -->
        <div class="radar-scope-container">
          <div class="radar-scope">
            <!-- Concentric acoustic distance circles -->
            <div class="range-ring r-15m" title="15m Sonar Range Limit"></div>
            <div class="range-ring r-10m" title="10m Range"></div>
            <div class="range-ring r-5m" title="5m Proximity"></div>

            <!-- Rotating Radar Sweep Beam -->
            <div class="radar-sweep-beam"></div>

            <!-- Compass markers -->
            <span class="compass-mark n">N</span>
            <span class="compass-mark e">E</span>
            <span class="compass-mark s">S</span>
            <span class="compass-mark w">W</span>

            <!-- Center Origin (Player) -->
            <div class="player-origin-blip" title="Self (Ping Origin)">
              <div class="origin-ping-dot"></div>
            </div>

            <!-- Detected Blips on Sonar -->
            {#if voiceChat.godsEyeSonarResult?.blips}
              {#each voiceChat.godsEyeSonarResult.blips as blip}
                {@const dist = blip.distance ?? 5}
                {@const bearing = blip.bearing ?? 0}
                {@const rad = (bearing - 90) * (Math.PI / 180)}
                {@const radiusPct = Math.min(46, Math.max(8, (dist / 15) * 44))}
                {@const left = 50 + radiusPct * Math.cos(rad)}
                {@const top = 50 + radiusPct * Math.sin(rad)}
                {@const isSelected = voiceChat.godsEyeWiretap?.id === blip.id}
                <button
                  type="button"
                  class="radar-blip {blip.type}"
                  class:selected={isSelected}
                  class:apex={blip.threat_level === 'apex'}
                  style="left: {left}%; top: {top}%;"
                  onclick={() => voiceChat.wiretapEntity(blip.type === 'player' ? 'player' : 'npc', blip.id)}
                  title="{blip.name} ({blip.role || blip.type}) - {blip.distance}m away [{blip.threat_level}]"
                >
                  <span class="blip-core"></span>
                  <span class="blip-label">{blip.name}</span>
                </button>
              {/each}
            {:else if voiceChat.godsEyeRadar?.players || voiceChat.godsEyeRadar?.npcs}
              {#each (voiceChat.godsEyeRadar.players || []).concat(voiceChat.godsEyeRadar.npcs || []).slice(0, 15) as ent, i}
                {@const angle = (i / 15) * 2 * Math.PI}
                {@const left = 50 + 35 * Math.cos(angle)}
                {@const top = 50 + 35 * Math.sin(angle)}
                <button
                  type="button"
                  class="radar-blip {ent.type}"
                  style="left: {left}%; top: {top}%;"
                  onclick={() => voiceChat.wiretapEntity(ent.type === 'player' ? 'player' : 'npc', ent.id)}
                  title="{ent.name} ({ent.role || ent.type})"
                >
                  <span class="blip-core"></span>
                  <span class="blip-label">{ent.name}</span>
                </button>
              {/each}
            {/if}
          </div>

          <!-- Radar Legend & Quick Stats -->
          <div class="radar-legend">
            <span class="legend-item player"><span class="legend-dot"></span>Ally</span>
            <span class="legend-item npc"><span class="legend-dot"></span>Neutral</span>
            <span class="legend-item enemy"><span class="legend-dot"></span>Hostile / Boss</span>
            <span class="radar-metric">
              Tracked: <strong>{voiceChat.godsEyeSonarResult?.total_detected ?? voiceChat.godsEyeRadar?.total_tracked ?? 0}</strong>
            </span>
          </div>
        </div>

        <!-- Right Side: Conscious Soul Wiretap Dossier -->
        <div class="wiretap-dossier">
          {#if voiceChat.godsEyeWiretap}
            <div class="dossier-card">
              <div class="dossier-header">
                <span class="dossier-lock">📡 LOCKED // {voiceChat.godsEyeWiretap.type.toUpperCase()}</span>
                <button
                  type="button"
                  class="btn-dossier-dismiss"
                  onclick={() => voiceChat.dismissGodsEyeWiretap()}
                  title="Unlock signal"
                >
                  ✕
                </button>
              </div>

              <div class="dossier-entity-info">
                <div class="dossier-name-row">
                  <h4 class="dossier-name">{voiceChat.godsEyeWiretap.name}</h4>
                  <span class="dossier-coords">Coords: ({voiceChat.godsEyeWiretap.coords?.[0] ?? 10}, {voiceChat.godsEyeWiretap.coords?.[1] ?? 10})</span>
                </div>
                <div class="dossier-meta">
                  <span>Level {voiceChat.godsEyeWiretap.level}</span>
                  {#if voiceChat.godsEyeWiretap.role}
                    <span>• {voiceChat.godsEyeWiretap.role}</span>
                  {/if}
                  {#if voiceChat.godsEyeWiretap.faction}
                    <span>• {voiceChat.godsEyeWiretap.faction}</span>
                  {/if}
                </div>
              </div>

              <!-- Subconscious Telemetry -->
              <div class="subconscious-box">
                <div class="subconscious-title">
                  <span>🧠 Subconscious Telemetry</span>
                  <span class="sse-status">Sovereign Soul Sync</span>
                </div>

                {#if voiceChat.godsEyeWiretap.soul?.emotional_state}
                  {@const emo = voiceChat.godsEyeWiretap.soul.emotional_state}
                  <div class="emotion-meter-grid">
                    <div class="meter-col">
                      <div class="meter-label">
                        <span>Confidence</span>
                        <strong>{emo.confidence ?? 70}%</strong>
                      </div>
                      <div class="meter-track">
                        <div class="meter-fill conf" style="width: {emo.confidence ?? 70}%"></div>
                      </div>
                    </div>

                    <div class="meter-col">
                      <div class="meter-label">
                        <span>Stress</span>
                        <strong>{emo.stress ?? 30}%</strong>
                      </div>
                      <div class="meter-track">
                        <div class="meter-fill stress" style="width: {emo.stress ?? 30}%"></div>
                      </div>
                    </div>

                    <div class="meter-col">
                      <div class="meter-label">
                        <span>Anger</span>
                        <strong>{emo.anger ?? 20}%</strong>
                      </div>
                      <div class="meter-track">
                        <div class="meter-fill anger" style="width: {emo.anger ?? 20}%"></div>
                      </div>
                    </div>

                    <div class="meter-col">
                      <div class="meter-label">
                        <span>Gratitude</span>
                        <strong>{emo.gratitude ?? 50}%</strong>
                      </div>
                      <div class="meter-track">
                        <div class="meter-fill grat" style="width: {emo.gratitude ?? 50}%"></div>
                      </div>
                    </div>
                  </div>
                {/if}

                {#if voiceChat.godsEyeWiretap.soul?.soul_profile}
                  {@const prof = voiceChat.godsEyeWiretap.soul.soul_profile}
                  <div class="personality-row">
                    <span class="pers-badge">Attachment: {prof.attachment_style || 'Secure'}</span>
                    {#if prof.motto}
                      <span class="pers-motto">"{prof.motto}"</span>
                    {/if}
                  </div>
                {/if}

                {#if voiceChat.godsEyeWiretap.soul?.active_thoughts?.length}
                  <div class="thoughts-box">
                    <span class="thoughts-label">💭 Active Thoughts:</span>
                    <ul class="thoughts-list">
                      {#each voiceChat.godsEyeWiretap.soul.active_thoughts as thought}
                        <li>"{thought}"</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>

              <!-- Orbital Interventions -->
              <div class="orbital-command-box">
                <span class="orbital-title">⚡ Orbital Interventions</span>
                <div class="orbital-btns">
                  <button
                    type="button"
                    class="btn-orbital strike"
                    onclick={() => voiceChat.requestOrbitalStrike(voiceChat.godsEyeWiretap!.map_id, voiceChat.godsEyeWiretap!.coords[0], voiceChat.godsEyeWiretap!.coords[1])}
                    title="Dispatch celestial lightning beam onto coordinates"
                  >
                    ⚡ Strike Target
                  </button>
                  <button
                    type="button"
                    class="btn-orbital supply"
                    onclick={() => voiceChat.requestSupplyDrop(voiceChat.godsEyeWiretap!.map_id, voiceChat.godsEyeWiretap!.coords[0], voiceChat.godsEyeWiretap!.coords[1])}
                    title="Drop divine supply cache at coordinates"
                  >
                    🎁 Supply Drop
                  </button>
                </div>

                {#if voiceChat.godsEyeWiretap.type === 'player'}
                  <div class="whisper-input-row">
                    <input
                      type="text"
                      bind:value={godsEyeWhisperMsg}
                      placeholder="Transmit omnipresent whisper..."
                      class="godseye-whisper-input"
                    />
                    <button
                      type="button"
                      class="btn-send-whisper"
                      onclick={() => {
                        if (godsEyeWhisperMsg.trim()) {
                          voiceChat.sendOrbitalWhisper(voiceChat.godsEyeWiretap!.id, godsEyeWhisperMsg.trim())
                          godsEyeWhisperMsg = ''
                        }
                      }}
                    >
                      Whisper
                    </button>
                  </div>
                {/if}
              </div>
            </div>
          {:else}
            <div class="wiretap-empty">
              <span class="empty-icon">📡</span>
              <p class="empty-title">NO TARGET SIGNAL LOCKED</p>
              <p class="empty-desc">Click any blip on the tactical radar scope to lock onto their conscious thoughts, observe real-time emotional telemetry, or trigger orbital interventions.</p>
            </div>
          {/if}

          <!-- Predictive Threat Scanner Feed -->
          <div class="threat-matrix-card">
            <div class="threat-header">
              <span class="threat-title">🚨 Ramsey Threat Matrix</span>
              <span class="threat-status-tag">REALM SCAN</span>
            </div>
            {#if voiceChat.godsEyeRadar?.critical_events?.length}
              <div class="threat-list">
                {#each voiceChat.godsEyeRadar.critical_events as alert}
                  <div class="threat-item {alert.severity}">
                    <span class="threat-icon">{alert.severity === 'critical' ? '🔴' : '⚠️'}</span>
                    <div class="threat-body">
                      <strong>{alert.target}</strong>: {alert.message}
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="threat-clear">✅ All sectors stabilized. No imminent squad casualties or rogue apex breaches.</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Underworld Encounters Drawer -->
  {#if showUnderworldDrawer}
    <div class="underworld-drawer">
      <div class="drawer-header">
        <span class="drawer-title">🏮 Lowtown & Underworld Shadows</span>
        <div class="drawer-header-actions">
          <button type="button" class="btn-spot-stalker" onclick={() => voiceChat.spotStalker(1)} title="Roll perception to spot hidden shadows">
            👁️ Spot Stalker
          </button>
          <button type="button" class="btn-drama-trigger" onclick={() => voiceChat.triggerNocturnalStalking()} title="Simulate autonomous nocturnal stalker altercation">
            🗡️ Stalking Event
          </button>
        </div>
      </div>

      <!-- Underworld Navigation Tabs -->
      <div class="underworld-tabs">
        <button
          type="button"
          class="underworld-tab"
          class:active={underworldTab === 'drama'}
          onclick={() => underworldTab = 'drama'}
        >
          🗡️ Nocturnal Stalking
        </button>
        <button
          type="button"
          class="underworld-tab"
          class:active={underworldTab === 'bounties'}
          onclick={() => {
            underworldTab = 'bounties'
            voiceChat.getBountyBoards()
          }}
        >
          🎯 Bounty Notices ({voiceChat.bountyTasks.length || '4'})
        </button>
        <button
          type="button"
          class="underworld-tab"
          class:active={underworldTab === 'fence'}
          onclick={() => underworldTab = 'fence'}
        >
          💰 Silas the Fence
        </button>
        <button
          type="button"
          class="underworld-tab"
          class:active={underworldTab === 'schedules'}
          onclick={() => {
            underworldTab = 'schedules'
            voiceChat.getNpcSchedules()
          }}
        >
          ⏰ Town Routines ({voiceChat.npcSchedulesList.length || '5'})
        </button>
      </div>

      {#if underworldTab === 'drama'}
      <!-- Autonomous NPC-Stalking-NPC Drama Card (Deadpool Interventions) -->
      {#if voiceChat.activeDrama}
        <div class="drama-card" class:murdered={voiceChat.activeDrama.stage === 'murdered'} class:rescued={voiceChat.activeDrama.stage === 'rescued'}>
          <div class="drama-header">
            <span class="drama-icon">
              {voiceChat.activeDrama.stage === 'murdered' ? '🩸' : (voiceChat.activeDrama.stage === 'rescued' ? '✨' : '🗡️')}
            </span>
            <div class="drama-title">
              <strong>{voiceChat.activeDrama.stalker_name} ➔ {voiceChat.activeDrama.victim_name}</strong>
              <span class="drama-badge" class:danger={voiceChat.activeDrama.stage === 'ambush_imminent'} class:murder={voiceChat.activeDrama.stage === 'murdered'} class:safe={voiceChat.activeDrama.stage === 'rescued'}>
                {voiceChat.activeDrama.stage === 'murdered' ? 'CRIME SCENE' : (voiceChat.activeDrama.stage === 'rescued' ? 'RESCUED' : (voiceChat.activeDrama.stage === 'ambush_imminent' ? 'AMBUSH IMMINENT' : 'STALKING'))}
              </span>
            </div>
            <button type="button" class="btn-dismiss-drama" onclick={() => voiceChat.dismissDrama()}>✕</button>
          </div>

          <p class="drama-desc">
            <span class="stalker-tag">{voiceChat.activeDrama.stalker_icon} {voiceChat.activeDrama.stalker_name}</span> is shadowing <span class="victim-tag">{voiceChat.activeDrama.victim_icon} {voiceChat.activeDrama.victim_name}</span> through {voiceChat.activeDrama.location_desc}.
          </p>
          <div class="drama-motive">
            <strong>Motive:</strong> {voiceChat.activeDrama.motive}
          </div>

          {#if voiceChat.activeDrama.stage !== 'murdered' && voiceChat.activeDrama.stage !== 'rescued'}
            <div class="drama-timer-bar">
              <span>⏳ {voiceChat.activeDrama.turns_remaining} turn{voiceChat.activeDrama.turns_remaining === 1 ? '' : 's'} before assassin strikes!</span>
              <button type="button" class="btn-tick-turn" onclick={() => voiceChat.tickNpcDrama(voiceChat.activeDrama!.id)} title="Advance turn without intervening">
                Skip Turn ⏩
              </button>
            </div>

            <!-- Deadpool Intervention Actions -->
            <div class="drama-actions">
              <button
                type="button"
                class="btn-drama-act deadpool"
                onclick={() => voiceChat.interveneNpcDrama(voiceChat.activeDrama!.id, 'deadpool_talkdown')}
                title="Use sarcastic, fourth-wall Deadpool banter to baffle the assassin into dropping the hit contract!"
              >
                🔴 Deadpool Talkdown (DC 12)
              </button>
              <button
                type="button"
                class="btn-drama-act tackle"
                onclick={() => voiceChat.interveneNpcDrama(voiceChat.activeDrama!.id, 'tackle')}
                title="Athletics tackle ambush to pin the assassin and disarm them (STR/AGI vs DC 12)"
              >
                💥 Tackle Ambush
              </button>
              <button
                type="button"
                class="btn-drama-act eavesdrop"
                onclick={() => voiceChat.interveneNpcDrama(voiceChat.activeDrama!.id, 'eavesdrop')}
                title="Quietly shadow the assassin to discover the syndicate client's name (Stealth vs DC 11)"
              >
                👂 Eavesdrop Shadows
              </button>
              <button
                type="button"
                class="btn-drama-act attack"
                onclick={() => voiceChat.interveneNpcDrama(voiceChat.activeDrama!.id, 'attack')}
                title="Draw steel and charge into direct combat!"
              >
                ⚔️ Draw Steel
              </button>
              <button
                type="button"
                class="btn-drama-act shout"
                onclick={() => voiceChat.interveneNpcDrama(voiceChat.activeDrama!.id, 'shout')}
                title="Blow a 90 dB city watch whistle to scare the stalker off"
              >
                📣 Watch Whistle
              </button>
            </div>
          {/if}

          <!-- Intervention Result Box -->
          {#if voiceChat.lastDramaIntervention}
            <div class="drama-result-box" class:success={voiceChat.lastDramaIntervention.success}>
              {#if voiceChat.lastDramaIntervention.quote}
                <p class="deadpool-quote">{voiceChat.lastDramaIntervention.quote}</p>
              {/if}
              <p class="result-narrative">"{voiceChat.lastDramaIntervention.message}"</p>
              <div class="drama-chips">
                {#if voiceChat.lastDramaIntervention.roll}
                  <span class="drama-chip roll">🎲 D20: {voiceChat.lastDramaIntervention.roll} (Total: {voiceChat.lastDramaIntervention.total} vs DC {voiceChat.lastDramaIntervention.dc})</span>
                {/if}
                {#if voiceChat.lastDramaIntervention.bounty_gold}
                  <span class="drama-chip gold">🪙 +{voiceChat.lastDramaIntervention.bounty_gold} Gold</span>
                {/if}
                {#if voiceChat.lastDramaIntervention.xp_awarded}
                  <span class="drama-chip xp">⚡ +{voiceChat.lastDramaIntervention.xp_awarded} XP</span>
                {/if}
                {#if voiceChat.lastDramaIntervention.contract_intel}
                  <span class="drama-chip intel">📜 Hit Contract Secured!</span>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Crime Scene Investigation (when murdered) -->
          {#if voiceChat.activeDrama.stage === 'murdered'}
            <div class="crime-scene-box">
              <div class="crime-banner">
                <span class="chalk-icon">🚷</span>
                <p>A pool of dark blood and chalk markings outline where {voiceChat.activeDrama.victim_name} was slain. The killer fled into the dark alleys.</p>
              </div>
              <button
                type="button"
                class="btn-investigate-crime"
                onclick={() => voiceChat.investigateCrimeScene(voiceChat.activeDrama!.id)}
              >
                🔍 Forensic Investigation (Roll Intellect DC 10)
              </button>

              {#if voiceChat.lastCrimeScene}
                <div class="crime-results" class:success={voiceChat.lastCrimeScene.success}>
                  <p>"{voiceChat.lastCrimeScene.message}"</p>
                  {#if voiceChat.lastCrimeScene.clues_found}
                    <div class="clues-list">
                      {#each voiceChat.lastCrimeScene.clues_found as clue}
                        <span class="clue-tag">🔎 {clue}</span>
                      {/each}
                    </div>
                  {/if}
                  {#if voiceChat.lastCrimeScene.bounty_active}
                    <span class="bounty-active-badge">🎯 Active City Watch Bounty Hunt Issued!</span>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Active Stalker Encounter -->
      {#if voiceChat.activeStalker && voiceChat.activeStalker.spotted}
        <div class="stalker-card">
          <div class="stalker-header">
            <span class="stalker-icon">🕵️</span>
            <div class="stalker-title">
              <strong>{voiceChat.activeStalker.name}</strong>
              <span class="stalker-badge">SHADOWING YOU</span>
            </div>
            <button type="button" class="btn-dismiss-stalker" onclick={() => voiceChat.dismissStalker()}>✕</button>
          </div>
          <p class="stalker-narrative">{voiceChat.activeStalker.message}</p>
          {#if voiceChat.lastStalkerAction}
            <div class="stalker-result-box">
              <p>"{voiceChat.lastStalkerAction.message}"</p>
            </div>
          {/if}
          <div class="stalker-actions">
            <button
              type="button"
              class="btn-stalker-act interrogate"
              onclick={() => voiceChat.interactStalker(voiceChat.activeStalker?.id || 1, 'interrogate')}
              title="Pin the stalker against the stone wall and interrogate who sent them"
            >
              🔍 Interrogate
            </button>
            <button
              type="button"
              class="btn-stalker-act bribe"
              onclick={() => voiceChat.interactStalker(voiceChat.activeStalker?.id || 1, 'bribe')}
              title="Offer 25 gold coins to buy their loyalty and flip the contract"
            >
              💰 Bribe (25g)
            </button>
            <button
              type="button"
              class="btn-stalker-act attack"
              onclick={() => voiceChat.interactStalker(voiceChat.activeStalker?.id || 1, 'attack')}
              title="Draw steel and lunge at the stalker!"
            >
              ⚔️ Attack
            </button>
          </div>
        </div>
      {/if}

      <!-- Gutter Addict / Lotus Fiend Encounter -->
      <div class="addict-card">
        <div class="addict-header">
          <span class="addict-icon">🥀</span>
          <div class="addict-title">
            <strong>Gutter Addict (Lotus Fiend)</strong>
            <span class="addict-badge">DELIRIUM</span>
          </div>
          {#if voiceChat.lastAddictResult}
            <button type="button" class="btn-dismiss-addict" onclick={() => voiceChat.dismissAddict()}>✕</button>
          {/if}
        </div>
        <p class="addict-desc">A shivering figure huddled in filthy rags mutters about glowing sewer symbols and secret smuggler caches.</p>
        {#if voiceChat.lastAddictResult}
          <div class="addict-result-box" class:alerted={voiceChat.lastAddictResult.guards_alerted}>
            <p>"{voiceChat.lastAddictResult.message}"</p>
            {#if voiceChat.lastAddictResult.intel_reward}
              <div class="addict-reward-chip">
                🔑 Intel: {voiceChat.lastAddictResult.intel_reward}
              </div>
            {/if}
            {#if voiceChat.lastAddictResult.pickpocket_gold}
              <div class="addict-reward-chip gold">
                🪙 Lifted {voiceChat.lastAddictResult.pickpocket_gold} Gold
              </div>
            {/if}
          </div>
        {/if}
        <div class="addict-actions">
          <button
            type="button"
            class="btn-addict-act alms"
            onclick={() => voiceChat.interactAddict(1, 'offer_fix')}
            title="Give 5 gold alms to satisfy their craving in exchange for secret sewer cache intel"
          >
            🪙 Give 5g Alms
          </button>
          <button
            type="button"
            class="btn-addict-act threaten"
            onclick={() => voiceChat.interactAddict(1, 'threaten')}
            title="Rough up the addict for free intel (risks screeching and alerting town guards)"
          >
            ⚠️ Threaten
          </button>
          <button
            type="button"
            class="btn-addict-act pickpocket"
            onclick={() => voiceChat.interactAddict(1, 'pickpocket_check')}
            title="Attempt a sleight-of-hand check to pick their pocket"
          >
            👜 Pickpocket
          </button>
        </div>
      </div>

      <!-- Cascading Tavern Brawl & Defenestration Card -->
      <div class="brawl-card" class:active-brawl={!!voiceChat.activeBrawl}>
        <div class="brawl-header">
          <span class="brawl-icon">🍻</span>
          <div class="brawl-title">
            <strong>{voiceChat.activeBrawl ? '💥 TAVERN BRAWL IN PROGRESS!' : 'The Rusty Anchor Tavern'}</strong>
            <span class="brawl-sub">{voiceChat.activeBrawl ? '80 dB Flying Tankards & Overturned Tables' : 'Rowdy Sailors & Cutthroats'}</span>
          </div>
          {#if voiceChat.activeBrawl}
            <button type="button" class="btn-dismiss-brawl" onclick={() => voiceChat.dismissBrawl()}>✕</button>
          {/if}
        </div>

        {#if voiceChat.activeBrawl}
          <p class="brawl-narrative">{voiceChat.activeBrawl.description}</p>

          <!-- Active Brawlers with Defenestration Action -->
          <div class="brawlers-list">
            {#each voiceChat.activeBrawl.brawlers as brawler}
              <div class="brawler-row">
                <span class="brawler-icon">{brawler.icon || '🥊'}</span>
                <div class="brawler-info">
                  <span class="brawler-name">{brawler.name}</span>
                  <span class="brawler-hp">HP: {brawler.hp}</span>
                </div>
                <button
                  type="button"
                  class="btn-defenestrate-brawler"
                  onclick={() => voiceChat.defenestrateBrawler(brawler.id, voiceChat.nearbyWindow?.windowX, voiceChat.nearbyWindow?.windowY, brawler.name)}
                  title="Hurl this brawler through the tavern window out onto the cobblestone street!"
                >
                  💥 Defenestrate!
                </button>
              </div>
            {/each}
          </div>

          <!-- Brawl Chaos Controls -->
          <div class="brawl-controls">
            <button
              type="button"
              class="btn-brawl-tick"
              onclick={() => voiceChat.triggerBrawlTick()}
              title="Simulate autonomous round of flying mugs, chair smashes, or brawler defenestration"
            >
              🍺 Brawl Round Chaos (Next Tick)
            </button>
          </div>

          {#if voiceChat.lastBrawlAction}
            <div class="brawl-action-alert">
              <span>💥 {voiceChat.lastBrawlAction.description}</span>
            </div>
          {/if}
        {:else}
          <button
            type="button"
            class="btn-cascade-brawl"
            onclick={() => voiceChat.cascadeBrawl(1)}
            title="Slam a table and fling a tankard to trigger a full-scale tavern brawl!"
          >
            💥 Trigger Tavern Brawl Cascade
          </button>
        {/if}
      </div>
      {/if}

      <!-- TAB 2: LOWTOWN BOUNTY NOTICE BOARD -->
      {#if underworldTab === 'bounties'}
        <div class="bounty-deck">
          <div class="bounty-header">
            <div class="bounty-intro">
              <strong>📜 Lowtown Syndicate & Magistrate Bounties</strong>
              <p>Live criminal warrants. Fulfill contracts alive (via non-lethal subdual or sleeping gas) for bonus payouts!</p>
            </div>
            <button type="button" class="btn-refresh-bounties" onclick={() => voiceChat.getBountyBoards()}>
              🔄 Refresh Notice
            </button>
          </div>

          <!-- Contract Result Banner -->
          {#if voiceChat.lastBountyResult}
            <div class="bounty-result-banner" class:success={voiceChat.lastBountyResult.success}>
              <span>{voiceChat.lastBountyResult.success ? '🎉' : '⚠️'}</span>
              <div class="result-text">
                <p>{voiceChat.lastBountyResult.message || (voiceChat.lastBountyResult.error)}</p>
              </div>
              <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissBountyResult()}>✕</button>
            </div>
          {/if}

          <div class="bounty-cards-grid">
            {#each voiceChat.bountyTasks as task (task.id)}
              <div class="bounty-card" class:accepted={task.claim_status === 'accepted'} class:completed={task.claim_status === 'completed'}>
                <div class="bounty-card-top">
                  <div class="bounty-target-info">
                    <span class="bounty-icon">{task.target_icon}</span>
                    <div>
                      <strong class="bounty-target-name">{task.target_name}</strong>
                      <span class="bounty-board-tag">{task.board_name || 'Syndicate Notice'}</span>
                    </div>
                  </div>
                  <div class="bounty-badges">
                    <span class="bounty-badge contract" class:alive={task.contract_type === 'wanted_alive'} class:dead={task.contract_type === 'wanted_dead'}>
                      {task.contract_type === 'wanted_alive' ? '🟢 WANTED ALIVE' : (task.contract_type === 'wanted_dead' ? '🔴 WANTED DEAD' : '🟡 DEAD OR ALIVE')}
                    </span>
                    <span class="bounty-badge diff {task.difficulty}">{task.difficulty.toUpperCase()}</span>
                  </div>
                </div>

                <p class="bounty-crime">{task.crime_desc}</p>
                <div class="bounty-hint">📍 Hint: {task.location_hint}</div>

                <div class="bounty-rewards-row">
                  <span class="bounty-reward gold">💰 {task.reward_gold}g</span>
                  <span class="bounty-reward xp">⭐ {task.reward_xp} XP</span>
                  <span class="bounty-reward rep">🛡️ +{task.reward_rep} Rep</span>
                </div>

                <div class="bounty-action-buttons">
                  {#if task.claim_status === 'completed'}
                    <span class="bounty-status-done">✅ CONTRACT FULFILLED</span>
                  {:else if task.claim_status === 'accepted'}
                    <div class="turnin-btn-group">
                      <button
                        type="button"
                        class="btn-turnin alive"
                        onclick={() => voiceChat.turnInBounty(task.id, 'sleeping_gas')}
                        title="Deliver target unconscious via sleeping gas or blunt strike (+15% subdual bonus)"
                      >
                        ✨ Subdue & Turn In (Alive)
                      </button>
                      <button
                        type="button"
                        class="btn-turnin dead"
                        onclick={() => voiceChat.turnInBounty(task.id, 'executed')}
                        title="Turn in target eliminated"
                      >
                        💀 Turn In (Dead)
                      </button>
                    </div>
                  {:else}
                    <button
                      type="button"
                      class="btn-accept-bounty"
                      onclick={() => voiceChat.acceptBounty(task.id)}
                    >
                      📜 Accept Contract
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- TAB 3: SILAS THE SHADOW FENCE -->
      {#if underworldTab === 'fence'}
        <div class="fence-deck">
          <div class="fence-header">
            <span class="fence-icon">🗡️</span>
            <div>
              <strong>Silas's Contraband Pawn & Black Market</strong>
              <p class="fence-sub">"I turn hot merchandise and bloody trinkets into cold coin. No questions asked."</p>
            </div>
          </div>

          {#if voiceChat.lastFenceResult}
            <div class="fence-result-banner" class:success={voiceChat.lastFenceResult.success}>
              <span>{voiceChat.lastFenceResult.success ? '💰' : '⚠️'}</span>
              <div class="result-text">
                <p>{voiceChat.lastFenceResult.message || voiceChat.lastFenceResult.error}</p>
              </div>
              <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissFenceResult()}>✕</button>
            </div>
          {/if}

          <!-- Quick Sell Forensic Loot -->
          <div class="fence-section">
            <div class="fence-sec-title">📦 Fence Forensic Loot & Hot Goods:</div>
            <div class="fence-grid">
              <button type="button" class="btn-fence-sell" onclick={() => voiceChat.fenceSellLoot('bloodstained_dagger', 1)}>
                <span>🗡️ Bloodstained Dagger</span>
                <span class="fence-price">+65g</span>
              </button>
              <button type="button" class="btn-fence-sell" onclick={() => voiceChat.fenceSellLoot('stolen_gold_watch', 1)}>
                <span>⏱️ Stolen Gold Watch</span>
                <span class="fence-price">+120g</span>
              </button>
              <button type="button" class="btn-fence-sell" onclick={() => voiceChat.fenceSellLoot('forged_city_seal', 1)}>
                <span>📜 Forged City Seal</span>
                <span class="fence-price">+180g</span>
              </button>
              <button type="button" class="btn-fence-sell" onclick={() => voiceChat.fenceSellLoot('contraband_valyrian_tincture', 1)}>
                <span>🧪 Valyrian Tincture</span>
                <span class="fence-price">+250g</span>
              </button>
            </div>
          </div>

          <!-- Black Market Covert Gear -->
          <div class="fence-section">
            <div class="fence-sec-title">🗝️ Illicit Tools & Underworld Gear:</div>
            <div class="fence-grid">
              <button type="button" class="btn-fence-buy" onclick={() => voiceChat.fenceBuyContraband('skeleton_key')} title="Picks locked chests and safehouse doors without breaking">
                <div>
                  <strong>🔑 Skeleton Key</strong>
                  <small>Picks locked chests & doors</small>
                </div>
                <span class="fence-cost">50g</span>
              </button>
              <button type="button" class="btn-fence-buy" onclick={() => voiceChat.fenceBuyContraband('chloroform_knockout_vial')} title="Instant silent subdual weapon for Wanted Alive bounties">
                <div>
                  <strong>🧴 Chloroform Knockout</strong>
                  <small>Subdues bounty targets alive</small>
                </div>
                <span class="fence-cost">45g</span>
              </button>
              <button type="button" class="btn-fence-buy" onclick={() => voiceChat.fenceBuyContraband('skunkweed_tear_gas')} title="Blinds occupants in interior rooms through open windows">
                <div>
                  <strong>💨 Skunkweed Gas</strong>
                  <small>Blinds indoor occupants</small>
                </div>
                <span class="fence-cost">40g</span>
              </button>
              <button type="button" class="btn-fence-buy" onclick={() => voiceChat.fenceBuyContraband('forged_identity_papers')} title="Wipes criminal infamy and resets city watch bounty">
                <div>
                  <strong>📜 Forged Papers</strong>
                  <small>Wipes city watch warrants</small>
                </div>
                <span class="fence-cost">120g</span>
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 4: TOWN LIVING SCHEDULES -->
      {#if underworldTab === 'schedules'}
        <div class="schedules-deck">
          <div class="schedules-header">
            <div>
              <strong>⏰ Autonomous Town Circadian Routines</strong>
              <p class="schedules-sub">Living townspeople pathing between work stalls, taverns, and homes.</p>
            </div>
            <div class="phase-buttons-row">
              <button type="button" class="btn-phase dawn" onclick={() => voiceChat.forceCircadianSchedule('dawn')}>☀️ Dawn</button>
              <button type="button" class="btn-phase day" onclick={() => voiceChat.forceCircadianSchedule('day')}>🌞 Day</button>
              <button type="button" class="btn-phase dusk" onclick={() => voiceChat.forceCircadianSchedule('dusk')}>🌅 Dusk</button>
              <button type="button" class="btn-phase night" onclick={() => voiceChat.forceCircadianSchedule('night')}>🌙 Night</button>
              <button type="button" class="btn-phase midnight" onclick={() => voiceChat.forceCircadianSchedule('midnight')}>⭐ Midnight</button>
            </div>
          </div>

          <div class="schedules-list">
            {#each voiceChat.npcSchedulesList as npc (npc.id)}
              <div class="schedule-card" class:sleeping={npc.is_sleeping}>
                <div class="schedule-card-left">
                  <span class="sched-icon">{npc.is_sleeping ? '💤' : (npc.is_nocturnal ? '👤' : '🚶')}</span>
                  <div>
                    <strong class="sched-name">{npc.name}</strong>
                    <span class="sched-role">{npc.role}</span>
                  </div>
                </div>
                <div class="schedule-card-center">
                  <span class="sched-activity">📍 {npc.current_activity || 'Idling in town'}</span>
                </div>
                <div class="schedule-card-right">
                  <span class="sched-coords">({npc.x}, {npc.y})</span>
                  {#if npc.is_sleeping}
                    <span class="sched-badge sleep">ASLEEP</span>
                  {:else if npc.is_nocturnal}
                    <span class="sched-badge nocturnal">NOCTURNAL</span>
                  {:else}
                    <span class="sched-badge awake">ACTIVE</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Real Estate Deeds & Fortifications Modal -->
  {#if showPropertiesModal}
    <div class="properties-modal-card">
      <div class="prop-modal-header">
        <span class="prop-icon">🏡</span>
        <div class="prop-modal-title">
          <strong>Haven Real Estate & Deeds</strong>
          <span class="prop-badge">FORTIFIED SANCTUARY</span>
        </div>
        <button type="button" class="btn-dismiss-prop" onclick={() => { showPropertiesModal = false }}>✕</button>
      </div>

      <!-- Draft Status if checked -->
      {#if voiceChat.lastDraftResult}
        <div class="draft-result-banner" class:extinguished={voiceChat.lastDraftResult.candlesExtinguished}>
          <span class="draft-icon">{voiceChat.lastDraftResult.candlesExtinguished ? '🕯️💨' : '🌬️'}</span>
          <div class="draft-text">
            <strong>Gale Draft Assessment:</strong>
            <p>{voiceChat.lastDraftResult.message}</p>
            {#if voiceChat.lastDraftResult.stealthBonus}
              <span class="draft-stealth-badge">🥷 +{voiceChat.lastDraftResult.stealthBonus} Stealth Bonus in Darkness</span>
            {/if}
          </div>
          <button type="button" class="btn-dismiss-draft" onclick={() => voiceChat.dismissDraft()}>✕</button>
        </div>
      {/if}

      <div class="properties-list">
        {#each voiceChat.propertiesList as prop (prop.id)}
          <div class="property-card" class:owned={prop.is_owned}>
            <div class="prop-card-header">
              <span class="prop-card-name">{prop.name}</span>
              <span class="prop-ownership-tag" class:owned={prop.is_owned}>
                {prop.is_owned ? '👑 YOUR PROPERTY' : `FOR SALE (${prop.deed_cost}g)`}
              </span>
            </div>
            <div class="prop-location">
              <span>📍 {prop.building_key}</span>
              <span>🔒 Security: {prop.security_rating}/100</span>
            </div>

            {#if !prop.is_owned}
              <button
                type="button"
                class="btn-buy-deed"
                onclick={() => voiceChat.purchaseProperty(prop.id)}
                title="Purchase the permanent legal deed to this property"
              >
                📜 Buy Deed ({prop.deed_cost} Gold)
              </button>
            {:else}
              <!-- Fortification Management for Owned Property -->
              <div class="fortifications-deck">
                <div class="fort-deck-title">🛡️ Fortifications:</div>
                <div class="fort-grid">
                  <!-- Iron Bars -->
                  <div class="fort-item">
                    <span>⛓️ Iron Window Bars</span>
                    {#if prop.has_iron_bars}
                      <span class="fort-installed">Installed</span>
                    {:else}
                      <button
                        type="button"
                        class="btn-install-fort"
                        onclick={() => voiceChat.addFortification(prop.id, 'iron_bars')}
                      >
                        + Install (150g)
                      </button>
                    {/if}
                  </div>

                  <!-- Velvet Soundproof Curtains -->
                  <div class="fort-item">
                    <span>🧵 Soundproof Curtains</span>
                    {#if prop.has_soundproof_curtains}
                      <button
                        type="button"
                        class="btn-toggle-curtains"
                        class:drawn={prop.curtains_drawn}
                        onclick={() => voiceChat.toggleCurtains(prop.id, !prop.curtains_drawn)}
                      >
                        {prop.curtains_drawn ? '🪟 Curtains Drawn (98% Soundproof)' : '🪟 Curtains Open'}
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="btn-install-fort"
                        onclick={() => voiceChat.addFortification(prop.id, 'soundproof_curtains')}
                      >
                        + Install (80g)
                      </button>
                    {/if}
                  </div>

                  <!-- Alarm Glyphs -->
                  <div class="fort-item">
                    <span>⚡ Alarm Glyphs</span>
                    {#if prop.has_alarm_glyphs}
                      <span class="fort-installed">Armed</span>
                    {:else}
                      <button
                        type="button"
                        class="btn-install-fort"
                        onclick={() => voiceChat.addFortification(prop.id, 'alarm_glyphs')}
                      >
                        + Install (200g)
                      </button>
                    {/if}
                  </div>
                </div>

                <div class="property-actions-row">
                  <button
                    type="button"
                    class="btn-prop-rest"
                    onclick={() => voiceChat.restInProperty(prop.id)}
                    title="Sleep in your fortified sanctuary (Full HP/MP heal + 'Well Rested' buff)"
                  >
                    🛏️ Sanctuary Rest
                  </button>
                  <button
                    type="button"
                    class="btn-check-draft"
                    onclick={() => voiceChat.checkIndoorDraft(prop.building_id || prop.building_key || 1)}
                    title="Check if gale winds are howling through open windows and blowing out indoor candles"
                  >
                    🌬️ Check Draft
                  </button>
                  <button
                    type="button"
                    class="btn-check-draft"
                    onclick={() => voiceChat.getSafehouseStash(prop.id)}
                    title="Open your private loot vault and trophy inventory"
                  >
                    🔒 Open Vault
                  </button>
                </div>

                <!-- Safehouse Stash Vault -->
                <div class="safehouse-vault-card">
                  <div class="vault-header">
                    <span class="vault-icon">🔒</span>
                    <div>
                      <strong>Safehouse Iron Loot Vault</strong>
                      <span class="vault-gold">💰 {voiceChat.safehouseStash?.stash_gold ?? prop.stash_gold ?? 0}g Stored</span>
                    </div>
                  </div>
                  <div class="vault-controls-row">
                    <button type="button" class="btn-vault-action" onclick={() => voiceChat.depositSafehouseGold(prop.id, 50)}>+ Deposit 50g</button>
                    <button type="button" class="btn-vault-action" onclick={() => voiceChat.depositSafehouseGold(prop.id, 100)}>+ Deposit 100g</button>
                    <button type="button" class="btn-vault-action" onclick={() => voiceChat.withdrawSafehouseGold(prop.id, 50)}>- Withdraw 50g</button>
                    <button type="button" class="btn-vault-action stash" onclick={() => voiceChat.depositSafehouseItem(prop.id, 'skeleton_key', 'Masterwork Skeleton Key', 1)}>+ Stash Key</button>
                  </div>

                  {#if voiceChat.safehouseStash?.items && voiceChat.safehouseStash.items.length > 0}
                    <div class="vault-items-list">
                      {#each voiceChat.safehouseStash.items as item (item.id)}
                        <div class="vault-item-row">
                          <span>📦 {item.item_name} (x{item.quantity})</span>
                          <button type="button" class="btn-vault-retrieve" onclick={() => voiceChat.withdrawSafehouseItem(prop.id, item.id)}>Retrieve</button>
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>

                <!-- Wall Mount Trophy Rack -->
                <div class="trophy-rack-card">
                  <div class="trophy-header">
                    <span class="trophy-icon">🏆</span>
                    <div>
                      <strong>Wall Mount Trophy Displays</strong>
                      <small>Permanent sanctuary buffs in town</small>
                    </div>
                  </div>

                  {#if voiceChat.safehouseStash?.trophies && voiceChat.safehouseStash.trophies.length > 0}
                    <div class="trophies-grid">
                      {#each voiceChat.safehouseStash.trophies as t (t.id)}
                        <div class="trophy-item-badge">
                          <span class="trophy-badge-icon">{t.icon}</span>
                          <div class="trophy-badge-text">
                            <strong>{t.name}</strong>
                            <small>{t.description}</small>
                          </div>
                          <button type="button" class="btn-rm-trophy" onclick={() => voiceChat.removeSafehouseTrophy(prop.id, t.id)}>✕</button>
                        </div>
                      {/each}
                    </div>
                  {:else}
                    <p class="no-trophies-hint">No trophies mounted yet. Slay the Ashveil Colossus or earn syndicate honors to decorate your sanctuary walls!</p>
                  {/if}

                  <div class="trophy-mount-row">
                    <button type="button" class="btn-mount-opt" onclick={() => voiceChat.mountSafehouseTrophy(prop.id, 'colossus_skull')}>
                      💀 Mount Colossus Skull (+15 Def)
                    </button>
                    <button type="button" class="btn-mount-opt" onclick={() => voiceChat.mountSafehouseTrophy(prop.id, 'syndicate_crest')}>
                      🗡️ Mount Syndicate Crest (+20 Stealth)
                    </button>
                    <button type="button" class="btn-mount-opt" onclick={() => voiceChat.mountSafehouseTrophy(prop.id, 'golden_skeleton_key')}>
                      🔑 Mount Master Key (+15% Fence)
                    </button>
                    <button type="button" class="btn-mount-opt" onclick={() => voiceChat.mountSafehouseTrophy(prop.id, 'masterwork_lute')}>
                      🪕 Mount Rowan's Lute (+30% XP)
                    </button>
                  </div>
                </div>

                <!-- Safehouse Companion Guard Stationing -->
                <div class="safehouse-guard-card">
                  <div class="guard-header">
                    <span>🛡️ Safehouse Sentry Guard:</span>
                    <strong>{prop.guard_companion_name || voiceChat.safehouseStash?.guard_companion || 'Unassigned'}</strong>
                  </div>
                  <button
                    type="button"
                    class="btn-station-guard"
                    onclick={() => voiceChat.assignSafehouseGuard(prop.id, 42, 'Valeria the Shieldmaiden')}
                    title="Station your squad companion to defend your safehouse from cutpurses and break-ins"
                  >
                    🛡️ Station Companion as Home Guard (+30% Security)
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Ashveil Colossus Apex Raid & Planet Mado Active Defense Deck -->
  {#if showColossusDeck}
    <div class="colossus-deck">
      <div class="colossus-header">
        <div class="colossus-brand">
          <span class="colossus-icon">🗿</span>
          <div>
            <div class="colossus-title">
              <strong>THE ASHVEIL COLOSSUS // APEX RAID</strong>
              <span class="colossus-badge phase-{voiceChat.colossusRaid?.phase || 1}">
                {voiceChat.colossusRaid?.phase_name || 'Phase 1: Granite Aegis'}
              </span>
            </div>
            <p class="colossus-sub">Planet Mado Multi-Limb Engine • 150ms Active Parry/Dodge Matrix • Raid Boss Raid</p>
          </div>
        </div>
        <div class="colossus-header-actions">
          <button
            type="button"
            class="btn-colossus-telegraph-test"
            onclick={() => voiceChat.triggerColossusTelegraph('overhead_slam')}
            title="Trigger a telegraphed 1.2s overhead smash to test Active Defense timing!"
          >
            ⚠️ Trigger Overhead Slam
          </button>
          <button
            type="button"
            class="btn-colossus-close"
            onclick={() => { showColossusDeck = false }}
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Boss Global HP Bar -->
      <div class="colossus-hp-section">
        <div class="colossus-hp-labels">
          <span>💥 Boss Life Force</span>
          <strong>{voiceChat.colossusRaid?.boss_hp ?? 5000} / {voiceChat.colossusRaid?.boss_max_hp ?? 5000} HP ({Math.round(((voiceChat.colossusRaid?.boss_hp ?? 5000) / (voiceChat.colossusRaid?.boss_max_hp ?? 5000)) * 100)}%)</strong>
        </div>
        <div class="colossus-hp-track">
          <div class="colossus-hp-fill phase-{voiceChat.colossusRaid?.phase || 1}" style="width: {((voiceChat.colossusRaid?.boss_hp ?? 5000) / (voiceChat.colossusRaid?.boss_max_hp ?? 5000)) * 100}%"></div>
        </div>
      </div>

      <!-- Real-Time Planet Mado Active Defense Prompt (QTE) -->
      {#if voiceChat.colossusTelegraph}
        <div class="active-defense-prompt pulse">
          <div class="telegraph-top">
            <span class="telegraph-icon">{voiceChat.colossusTelegraph.icon}</span>
            <div class="telegraph-text">
              <strong>{voiceChat.colossusTelegraph.name}</strong>
              <p>{voiceChat.colossusTelegraph.desc}</p>
            </div>
            <div class="telegraph-damage-badge">⚠️ {voiceChat.colossusTelegraph.damage} DMG</div>
          </div>
          <div class="defense-actions-row">
            <button
              type="button"
              class="btn-act-def parry"
              onclick={() => voiceChat.reactColossusActiveDefense('parry', 90)}
              title="Time your parry within 150ms window! Deflects 100% damage and staggers the boss!"
            >
              ⚡ PERFECT PARRY (90ms)
            </button>
            <button
              type="button"
              class="btn-act-def dodge"
              onclick={() => voiceChat.reactColossusActiveDefense('dodge', 110)}
              title="Dive roll to avoid damage completely!"
            >
              💨 PERFECT DODGE (110ms)
            </button>
            <button
              type="button"
              class="btn-act-def block"
              onclick={() => voiceChat.reactColossusActiveDefense('block', 200)}
              title="Brace shield to mitigate partial damage"
            >
              🧱 BRACE BLOCK (Mitigate)
            </button>
          </div>
        </div>
      {/if}

      <!-- Defense Result Banner -->
      {#if voiceChat.colossusDefenseResult}
        <div class="defense-result-card" class:perfect={voiceChat.colossusDefenseResult.staggered_boss} class:failed={!voiceChat.colossusDefenseResult.success}>
          <span>{voiceChat.colossusDefenseResult.staggered_boss ? '⚡' : (voiceChat.colossusDefenseResult.success ? '🛡️' : '💥')}</span>
          <div class="defense-result-text">
            <strong>{voiceChat.colossusDefenseResult.action.toUpperCase()} ({voiceChat.colossusDefenseResult.timing_ms}ms)</strong>
            <p>{voiceChat.colossusDefenseResult.message}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissColossusDefense()}>✕</button>
        </div>
      {/if}

      <!-- Multi-Limb Targeting Deck -->
      <div class="limbs-deck">
        <div class="limbs-title">🎯 Planet Mado Multi-Limb Targeting:</div>
        <div class="limbs-grid">
          {#each Object.entries(voiceChat.colossusRaid?.limbs || {
            head: { hp: 800, max_hp: 800, broken: false, icon: '🗿', name: 'Runic Granite Helm' },
            core: { hp: 2000, max_hp: 2000, broken: false, icon: '🔮', name: 'Arcane Flame Core' },
            left_arm: { hp: 600, max_hp: 600, broken: false, icon: '🛡️', name: 'Aegis Gauntlet' },
            right_arm: { hp: 600, max_hp: 600, broken: false, icon: '🔨', name: 'Crusher Fist' },
            legs: { hp: 1000, max_hp: 1000, broken: false, icon: '🦿', name: 'Monolithic Pillars' }
          }) as [limbKey, limb]}
            <div class="limb-card" class:broken={limb.broken}>
              <div class="limb-header">
                <span class="limb-icon">{limb.icon}</span>
                <div>
                  <strong class="limb-name">{limb.name}</strong>
                  <span class="limb-broken-badge" class:broken={limb.broken}>
                    {limb.broken ? 'SHATTERED' : 'INTACT'}
                  </span>
                </div>
              </div>
              <div class="limb-hp-track">
                <div class="limb-hp-fill" style="width: {(limb.hp / limb.max_hp) * 100}%"></div>
              </div>
              <div class="limb-hp-text">
                <span>{limb.hp}/{limb.max_hp} HP</span>
                {#if !limb.broken && (voiceChat.colossusRaid?.boss_hp ?? 5000) > 0}
                  <button
                    type="button"
                    class="btn-strike-limb"
                    onclick={() => voiceChat.strikeColossusLimb(limbKey, 180)}
                    title="Target attack on this limb"
                  >
                    ⚔️ Strike (-180)
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Victory Claim Deck -->
      {#if (voiceChat.colossusRaid?.boss_hp ?? 5000) <= 0 || voiceChat.colossusRaid?.status === 'defeated'}
        <div class="colossus-victory-deck">
          <div class="victory-banner">
            <span>👑</span>
            <div>
              <strong>THE COLOSSUS HAS FALLEN!</strong>
              <p>Carve the legendary Skull of the Ashveil Colossus to mount on your safehouse trophy wall!</p>
            </div>
          </div>
          <button
            type="button"
            class="btn-claim-colossus-loot"
            onclick={() => voiceChat.claimColossusLoot()}
          >
            🏆 Claim Victory Loot & Skull Trophy (+500g, +1200 XP)
          </button>
        </div>
      {/if}

      {#if voiceChat.colossusLootResult}
        <div class="loot-result-card">
          <span>🎁</span>
          <div class="loot-text">
            <strong>Raid Spoils Acquired:</strong>
            <p>{voiceChat.colossusLootResult.message}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissColossusLoot()}>✕</button>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 1. Master Engine Systems Feature Flag Matrix -->
  {#if showSettingsModal}
    <div class="matrix-modal-card">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">⚙️</span>
          <div>
            <div class="deck-title">
              <strong>GAME ENGINE SYSTEMS MATRIX</strong>
              <span class="deck-badge">FEATURE SWITCHBOARD</span>
            </div>
            <p class="deck-sub">Real-time MariaDB persistence &amp; zero-nanosecond persistent_term cache toggles</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getFeatureFlags()}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showSettingsModal = false }}>✕</button>
        </div>
      </div>

      <div class="flag-matrix-grid">
        {#each voiceChat.featureFlags as flag (flag.feature_key)}
          <div class="flag-card" class:enabled={flag.is_enabled} class:disabled={!flag.is_enabled}>
            <div class="flag-info">
              <div class="flag-title-row">
                <span class="flag-name">{flag.label}</span>
                <span class="flag-status-pill" class:active={flag.is_enabled}>
                  {flag.is_enabled ? 'ACTIVE' : 'OFFLINE'}
                </span>
              </div>
              <p class="flag-desc">{flag.description}</p>
            </div>
            <button
              type="button"
              class="btn-toggle-flag"
              class:is-active={flag.is_enabled}
              onclick={() => voiceChat.toggleFeatureFlag(flag.feature_key, !flag.is_enabled)}
              title={`Toggle ${flag.label}`}
            >
              {flag.is_enabled ? '🟢 Enabled' : '🔴 Disabled'}
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 2. Safehouse Bastion Workshop Deck -->
  {#if showWorkshopDeck}
    <div class="workshop-deck">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">⚒️</span>
          <div>
            <div class="deck-title">
              <strong>SAFEHOUSE BASTION WORKSHOP</strong>
              <span class="deck-badge">TROPHIES &amp; ALCHEMY</span>
            </div>
            <p class="deck-sub">Runeforging socket altar • Smuggler dispatches • Alembic brewing</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getSafehouseWorkshop(1)}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showWorkshopDeck = false }}>✕</button>
        </div>
      </div>

      <!-- Workshop Tab Navigation -->
      <div class="workshop-tabs">
        <button
          type="button"
          class="tab-btn"
          class:active={workshopTab === 'runes'}
          onclick={() => { workshopTab = 'runes' }}
        >
          💎 Rune Sockets ({voiceChat.workshopState?.runes?.length ?? 1}/3)
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={workshopTab === 'alchemy'}
          onclick={() => { workshopTab = 'alchemy' }}
        >
          ⚗️ Underworld Alembic
        </button>
        <button
          type="button"
          class="tab-btn"
          class:active={workshopTab === 'dispatches'}
          onclick={() => { workshopTab = 'dispatches' }}
        >
          📦 Smuggler Dispatches ({voiceChat.workshopState?.dispatches?.length ?? 0})
        </button>
      </div>

      {#if voiceChat.lastWorkshopResult}
        <div class="alert-result-card" class:success={!voiceChat.lastWorkshopResult.error} class:fail={!!voiceChat.lastWorkshopResult.error}>
          <span>⚒️</span>
          <div class="alert-text">
            <strong>Workshop Operation:</strong>
            <p>{voiceChat.lastWorkshopResult.message}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissWorkshopAlert()}>✕</button>
        </div>
      {/if}

      <!-- Runes Tab -->
      {#if workshopTab === 'runes'}
        <div class="runes-container">
          <div class="section-lead">
            <span>Mount ancient trophies &amp; colossus relics into gear sockets to awaken latent combat bonuses:</span>
          </div>
          <div class="runes-list">
            {#each voiceChat.workshopState?.runes ?? [] as rune (rune.id)}
              <div class="rune-card socketed">
                <div class="rune-badge">{rune.rune_icon}</div>
                <div class="rune-details">
                  <div class="rune-header-row">
                    <strong>{rune.rune_name}</strong>
                    <span class="rune-slot-tag">{rune.socket_slot.toUpperCase()} SLOT</span>
                  </div>
                  <span class="rune-bonus">⭐ +{rune.bonus_value} {rune.bonus_stat.replace(/_/g, ' ')}</span>
                </div>
                <div class="rune-actions">
                  <button
                    type="button"
                    class="btn-unsocket"
                    onclick={() => voiceChat.unsocketWorkshopRune(1, rune.id)}
                  >
                    Unsocket
                  </button>
                </div>
              </div>
            {/each}
            {#each voiceChat.workshopState?.available_runes ?? [] as avail (avail.name)}
              <div class="rune-card">
                <div class="rune-badge">{avail.icon}</div>
                <div class="rune-details">
                  <div class="rune-header-row">
                    <strong>{avail.name}</strong>
                  </div>
                  <span class="rune-bonus">⭐ +{avail.value} {avail.stat.replace(/_/g, ' ')}</span>
                </div>
                <div class="rune-actions">
                  <button
                    type="button"
                    class="btn-socket"
                    onclick={() => voiceChat.socketWorkshopRune(1, 'weapon_1', 'Rune Blade', avail.name.toLowerCase().replace(/\s+/g, '_') + '_rune', 'primary')}
                  >
                    Socket
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Alchemy Alembic Tab -->
      {#if workshopTab === 'alchemy'}
        <div class="alchemy-container">
          {#if voiceChat.workshopState?.alembic && voiceChat.workshopState.alembic.length > 0}
            {#each voiceChat.workshopState.alembic as brew (brew.id)}
              <div class="alembic-active-banner">
                <span class="alembic-bubble-icon">{brew.icon || '⚗️'}</span>
                <div class="alembic-info">
                  <strong>Brewing: {brew.concoction_name}</strong>
                  {#if brew.seconds_remaining <= 0 || brew.status === 'ready'}
                    <span class="ready-badge">✨ CONCOCTION READY!</span>
                  {:else}
                    <span class="time-badge">⏳ {brew.seconds_remaining}s remaining</span>
                  {/if}
                </div>
                <button
                  type="button"
                  class="btn-collect-alembic"
                  onclick={() => voiceChat.claimWorkshopConcoction(1, brew.id)}
                >
                  Collect Potion
                </button>
              </div>
            {/each}
          {:else}
            <div class="alembic-idle-banner">
              <span>⚗️ The Alembic is cold and ready for distillation.</span>
            </div>
          {/if}

          <div class="recipes-grid">
            <div class="recipe-card">
              <span class="recipe-icon">🧪</span>
              <div class="recipe-meta">
                <strong>Valyrian Elixir</strong>
                <p>Restores 100 HP, +15% damage for 4 turns.</p>
              </div>
              <button type="button" class="btn-brew" onclick={() => voiceChat.brewWorkshopConcoction(1, 'valyrian_elixir')}>
                Brew (40s)
              </button>
            </div>
            <div class="recipe-card">
              <span class="recipe-icon">💤</span>
              <div class="recipe-meta">
                <strong>Chloroform Knockout Vial</strong>
                <p>Instantly renders tavern sentries unconscious.</p>
              </div>
              <button type="button" class="btn-brew" onclick={() => voiceChat.brewWorkshopConcoction(1, 'chloroform_knockout_vial')}>
                Brew (30s)
              </button>
            </div>
            <div class="recipe-card">
              <span class="recipe-icon">🦨</span>
              <div class="recipe-meta">
                <strong>Skunkweed Tear Gas</strong>
                <p>Flushes building interiors into windows/alleys.</p>
              </div>
              <button type="button" class="btn-brew" onclick={() => voiceChat.brewWorkshopConcoction(1, 'skunkweed_tear_gas')}>
                Brew (45s)
              </button>
            </div>
            <div class="recipe-card">
              <span class="recipe-icon">👻</span>
              <div class="recipe-meta">
                <strong>Ghostwalk Tincture</strong>
                <p>Complete acoustic footstep and voice dampening.</p>
              </div>
              <button type="button" class="btn-brew" onclick={() => voiceChat.brewWorkshopConcoction(1, 'ghostwalk_tincture')}>
                Brew (60s)
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- Dispatches Tab -->
      {#if workshopTab === 'dispatches'}
        <div class="dispatches-container">
          <div class="active-dispatches-list">
            {#each voiceChat.workshopState?.dispatches ?? [] as dispatch (dispatch.id)}
              <div class="dispatch-card" class:completed={dispatch.status === 'completed'}>
                <span class="dispatch-icon">{dispatch.icon}</span>
                <div class="dispatch-meta">
                  <strong>{dispatch.mission_name}</strong>
                  <span class="dispatch-runner">Agent: {dispatch.companion_name}</span>
                  <div class="dispatch-progress-row">
                    {#if dispatch.status === 'completed'}
                      <span class="dispatch-done-badge">COMPLETED</span>
                    {:else}
                      <span class="dispatch-timer">⏳ {dispatch.seconds_remaining}s remaining</span>
                    {/if}
                    <span class="dispatch-rewards">💰 {dispatch.reward_gold}g • ⭐ {dispatch.reward_xp} XP</span>
                  </div>
                </div>
                <div class="dispatch-actions">
                  {#if dispatch.status === 'completed'}
                    <button
                      type="button"
                      class="btn-claim-dispatch"
                      onclick={() => voiceChat.claimWorkshopDispatch(1, dispatch.id)}
                    >
                      Claim Spoils
                    </button>
                  {:else}
                    <span class="in-transit-badge">In Transit</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="dispatch-launch-bar">
            <span class="launch-title">Deploy Smuggler Expedition:</span>
            <div class="launch-buttons">
              <button
                type="button"
                class="btn-launch-mission"
                onclick={() => voiceChat.startWorkshopDispatch(1, 1, 'Barnaby', 'syndicate_recon')}
              >
                🕵️ Syndicate Recon (60s, +80g, +200xp)
              </button>
              <button
                type="button"
                class="btn-launch-mission"
                onclick={() => voiceChat.startWorkshopDispatch(1, 2, 'Rowan', 'contraband_heist')}
              >
                💰 Contraband Heist (120s, +180g, +450xp)
              </button>
              <button
                type="button"
                class="btn-launch-mission"
                onclick={() => voiceChat.startWorkshopDispatch(1, 3, 'Valeria', 'colossus_excavation')}
              >
                ⛏️ Colossus Dig (180s, +350g, +800xp)
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 3. Spoken Catacombs On-Demand Deck -->
  {#if showCatacombsDeck}
    <div class="catacomb-deck">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">🗺️</span>
          <div>
            <div class="deck-title">
              <strong>SPOKEN CATACOMBS ON-DEMAND</strong>
              <span class="deck-badge">UILE DUNGEON ARCHITECT</span>
            </div>
            <p class="deck-sub">Procedural 2.5D elevation • Traps, secret chambers &amp; boss lairs</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getCatacombState()}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showCatacombsDeck = false }}>✕</button>
        </div>
      </div>

      {#if voiceChat.lastCatacombResult}
        <div class="alert-result-card" class:success={!voiceChat.lastCatacombResult.error} class:fail={!!voiceChat.lastCatacombResult.error}>
          <span>🗺️</span>
          <div class="alert-text">
            <strong>Catacomb Expedition:</strong>
            <p>{voiceChat.lastCatacombResult.message}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissCatacombAlert()}>✕</button>
        </div>
      {/if}

      <!-- Manifestation Prompt Input -->
      <div class="catacomb-input-box">
        <label for="catacomb-prompt-input" class="input-label">Spoken Catacomb Concept (Speak or type to warp reality):</label>
        <div class="input-group">
          <input
            id="catacomb-prompt-input"
            type="text"
            bind:value={catacombPrompt}
            placeholder="e.g. ancient forgotten crypt beneath the burning cathedral..."
            maxlength="100"
          />
          <button
            type="button"
            class="btn-manifest-catacomb"
            disabled={!catacombPrompt.trim()}
            onclick={() => voiceChat.generateCatacomb(catacombPrompt)}
          >
            ✨ Manifest Catacomb
          </button>
        </div>
        <div class="prompt-presets">
          <button type="button" class="btn-preset" onclick={() => { catacombPrompt = 'sunken crypt of the drowned king'; voiceChat.generateCatacomb(catacombPrompt) }}>
            🌊 Sunken Crypt
          </button>
          <button type="button" class="btn-preset" onclick={() => { catacombPrompt = 'ashveil necropolis of lost embers'; voiceChat.generateCatacomb(catacombPrompt) }}>
            🔥 Ashveil Necropolis
          </button>
          <button type="button" class="btn-preset" onclick={() => { catacombPrompt = 'clockwork vault of the forgotten mechanists'; voiceChat.generateCatacomb(catacombPrompt) }}>
            ⚙️ Clockwork Vault
          </button>
        </div>
      </div>

      <!-- Active Catacomb Dungeon Map -->
      {#if voiceChat.activeCatacomb}
        <div class="dungeon-view">
          <div class="dungeon-banner">
            <div>
              <span class="dungeon-theme-tag">{voiceChat.activeCatacomb.theme.toUpperCase()}</span>
              <h3>{voiceChat.activeCatacomb.name}</h3>
              <p class="dungeon-prompt">Prompt: "{voiceChat.activeCatacomb.prompt}"</p>
            </div>
            <div class="dungeon-stats">
              <span>Depth: {voiceChat.activeCatacomb.current_floor}/{voiceChat.activeCatacomb.floors_count}</span>
              <span>Rooms: {voiceChat.activeCatacomb.rooms?.length ?? 5}</span>
            </div>
          </div>

          <div class="rooms-track">
            {#each voiceChat.activeCatacomb.rooms ?? [] as room (room.index)}
              <div
                class="room-card"
                class:cleared={room.is_cleared}
                class:boss={room.type === 'boss_chamber'}
              >
                <div class="room-header">
                  <span class="room-num">Room {room.index + 1}</span>
                  {#if room.type === 'boss_chamber'}
                    <span class="boss-tag">👑 BOSS LAIR</span>
                  {/if}
                  {#if room.is_cleared}
                    <span class="cleared-tag">✓ CLEARED</span>
                  {/if}
                </div>
                <h4 class="room-title">{room.name}</h4>
                <div class="elevation-indicator">
                  <span>Elevation: <strong>{room.elevation}</strong></span>
                  {#if room.doors?.length}
                    <span class="chest-pill">🚪 Doors: {room.doors.length}</span>
                  {/if}
                </div>
                <p class="room-sensory">"{room.description}"</p>
                {#if !room.is_cleared}
                  <button
                    type="button"
                    class="btn-clear-room"
                    onclick={() => voiceChat.clearCatacombRoom(voiceChat.activeCatacomb!.id, room.index)}
                  >
                    ⚔️ Delve &amp; Clear Room {room.index + 1}
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 4. Dynamic Faction Territory Wars Deck -->
  {#if showTerritoriesDeck}
    <div class="territory-deck">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">🚩</span>
          <div>
            <div class="deck-title">
              <strong>FACTION TURF WARS &amp; DISTRICT CONTROL</strong>
              <span class="deck-badge">CITY WARFARE</span>
            </div>
            <p class="deck-sub">Dynamic syndicate, watch, and cult influence shifts alter taxes, patrols &amp; martial law</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getFactionTerritories()}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showTerritoriesDeck = false }}>✕</button>
        </div>
      </div>

      {#if voiceChat.lastTerritoryResult}
        <div class="alert-result-card success">
          <span>🚩</span>
          <div class="alert-text">
            <strong>Territory Skirmish:</strong>
            <p>{voiceChat.lastTerritoryResult.message || voiceChat.lastTerritoryResult.reason}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissTerritoryAlert()}>✕</button>
        </div>
      {/if}

      <div class="districts-grid">
        {#each voiceChat.factionDistricts as district (district.key)}
          <div class="district-card" class:martial-law={district.martial_law_active}>
            <div class="district-header">
              <div>
                <span class="faction-controller-badge {district.controlling_faction}">
                  {district.controlling_faction.toUpperCase()}
                </span>
                <h4>{district.name}</h4>
              </div>
              <div class="tax-tag">
                Tax Rate: <strong>{district.tax_rate_pct}%</strong>
              </div>
            </div>

            <!-- Influence Distribution Bars -->
            <div class="influence-bars">
              <div class="influence-item syndicate">
                <span>🗡️ Syndicate: {district.syndicate_pct}%</span>
                <div class="meter-bar"><div class="fill" style="width: {district.syndicate_pct}%"></div></div>
              </div>
              <div class="influence-item watch">
                <span>🛡️ The Watch: {district.watch_pct}%</span>
                <div class="meter-bar"><div class="fill" style="width: {district.watch_pct}%"></div></div>
              </div>
              <div class="influence-item cult">
                <span>👁️ Cult of Mado: {district.cult_pct}%</span>
                <div class="meter-bar"><div class="fill" style="width: {district.cult_pct}%"></div></div>
              </div>
            </div>

            {#if district.martial_law_active}
              <div class="martial-law-notice">
                ⚠️ MARTIAL LAW DECLARED (Guard: {district.guard_type})
              </div>
            {/if}

            <!-- Skirmish Influence Actions -->
            <div class="influence-actions">
              <button
                type="button"
                class="btn-inf syndicate"
                onclick={() => voiceChat.shiftFactionInfluence(district.key, 'syndicate', 15, 'player_raid')}
              >
                🗡️ Back Syndicate (+15)
              </button>
              <button
                type="button"
                class="btn-inf watch"
                onclick={() => voiceChat.shiftFactionInfluence(district.key, 'watch', 15, 'guard_bribe')}
              >
                🛡️ Enforce Watch (+15)
              </button>
              <button
                type="button"
                class="btn-inf cult"
                onclick={() => voiceChat.shiftFactionInfluence(district.key, 'cult', 15, 'cult_ritual')}
              >
                👁️ Support Cult (+15)
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- 5. Forensic Murder Mystery & Courtroom Trials Deck -->
  {#if showForensicsDeck}
    <div class="forensic-deck">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">🔍</span>
          <div>
            <div class="deck-title">
              <strong>FORENSIC MYSTERIES &amp; COURTROOM TRIALS</strong>
              <span class="deck-badge">CRIME SCENE INVESTIGATION</span>
            </div>
            <p class="deck-sub">Fingerprint dusting • Interrogate suspects • Magistrate trials or hush bribes</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getForensicCases()}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showForensicsDeck = false }}>✕</button>
        </div>
      </div>

      {#if voiceChat.lastForensicResult}
        <div class="alert-result-card" class:success={!voiceChat.lastForensicResult.error} class:fail={!!voiceChat.lastForensicResult.error}>
          <span>🔍</span>
          <div class="alert-text">
            <strong>Forensic Investigation:</strong>
            <p>{voiceChat.lastForensicResult.message}</p>
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissForensicAlert()}>✕</button>
        </div>
      {/if}

      <!-- Cases List Selector -->
      <div class="cases-selector">
        {#each voiceChat.forensicCases as c (c.id)}
          <button
            type="button"
            class="case-btn"
            class:active={voiceChat.activeCaseDetails?.id === c.id}
            onclick={() => voiceChat.getForensicCaseDetails(c.id)}
          >
            <span>📜 {c.title}</span>
            <span class="case-status-badge {c.status}">{c.status.toUpperCase()}</span>
          </button>
        {/each}
      </div>

      <!-- Active Case Dossier -->
      {#if voiceChat.activeCaseDetails}
        <div class="case-dossier">
          <div class="dossier-header">
            <h3>{voiceChat.activeCaseDetails.title}</h3>
            <span class="victim-tag">Victim: {voiceChat.activeCaseDetails.victim_name} ({voiceChat.activeCaseDetails.crime_type})</span>
            <p class="case-summary">Crime Scene: {voiceChat.activeCaseDetails.location_hint}</p>
          </div>

          <!-- Forensic Evidence & Clues -->
          <div class="clues-section">
            <h4 class="section-title">Forensic Clues &amp; Crime Scene Evidence ({voiceChat.activeCaseDetails.clues.length})</h4>
            <div class="clues-grid">
              {#each voiceChat.activeCaseDetails.clues as clue (clue.id)}
                <div class="clue-card" class:analyzed={clue.is_discovered}>
                  <div class="clue-header">
                    <strong>{clue.icon} {clue.name}</strong>
                    {#if clue.is_discovered}
                      <span class="dusted-pill">🔍 DISCOVERED</span>
                    {/if}
                  </div>
                  <p class="clue-desc">{clue.clue_text}</p>
                </div>
              {/each}
            </div>
            <button
              type="button"
              class="btn-dust-clue"
              onclick={() => voiceChat.inspectCrimeSceneClues(voiceChat.activeCaseDetails!.id)}
            >
              🧪 Inspect Scene &amp; Dust for Fingerprints
            </button>
          </div>

          <!-- Suspects & Interrogation -->
          <div class="suspects-section">
            <h4 class="section-title">Suspects &amp; Witnesses ({voiceChat.activeCaseDetails.suspects.length})</h4>
            <div class="suspects-grid">
              {#each voiceChat.activeCaseDetails.suspects as suspect (suspect.id)}
                <div class="suspect-card" class:confessed={suspect.confessed}>
                  <div class="suspect-header">
                    <div>
                      <strong>{suspect.icon} {suspect.name}</strong>
                      <span class="suspect-role">({suspect.role})</span>
                    </div>
                    <span class="suspicion-tag">Interrogated: {suspect.interrogated_count}x</span>
                  </div>

                  <p class="suspect-alibi"><strong>Alibi:</strong> "{suspect.alibi}"</p>

                  {#if suspect.confessed}
                    <div class="confession-banner">
                      📜 SIGNED CONFESSION SECURED
                    </div>
                  {/if}

                  <div class="suspect-actions">
                    <button
                      type="button"
                      class="btn-interrogate pressure"
                      onclick={() => voiceChat.interrogateCaseSuspect(voiceChat.activeCaseDetails!.id, suspect.id, 'pressure')}
                    >
                      ⚡ Apply Pressure
                    </button>
                    <button
                      type="button"
                      class="btn-interrogate evidence"
                      onclick={() => voiceChat.interrogateCaseSuspect(voiceChat.activeCaseDetails!.id, suspect.id, 'evidence_confront')}
                    >
                      📄 Present Clue
                    </button>
                    <button
                      type="button"
                      class="btn-trial-accuse"
                      onclick={() => voiceChat.holdCourtroomTrial(voiceChat.activeCaseDetails!.id, suspect.id)}
                    >
                      ⚖️ Trial Accuse
                    </button>
                    <button
                      type="button"
                      class="btn-accept-bribe"
                      onclick={() => voiceChat.bribeFrameSuspect(voiceChat.activeCaseDetails!.id, suspect.id, 350)}
                    >
                      💰 Offer Bribe (350g)
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- 6. Real-Time Spoken Combat Spellcrafting & Squad Voice Tactics Deck -->
  {#if showVoiceCombatBar}
    <div class="voice-combat-deck">
      <div class="deck-header">
        <div class="deck-brand">
          <span class="deck-icon">🎙️</span>
          <div>
            <div class="deck-title">
              <strong>SPOKEN INCANTATIONS &amp; SQUAD VOICE TACTICS</strong>
              <span class="deck-badge">VOCAL COMBAT HARMONICS</span>
            </div>
            <p class="deck-sub">Microphone pitch &amp; amplitude resonance grant up to +35% damage &amp; companion tactics</p>
          </div>
        </div>
        <div class="deck-actions">
          <button type="button" class="btn-deck-refresh" onclick={() => voiceChat.getVoiceCombatCapabilities()}>🔄 Sync</button>
          <button type="button" class="btn-deck-close" onclick={() => { showVoiceCombatBar = false }}>✕</button>
        </div>
      </div>

      {#if voiceChat.lastVoiceCombatResult}
        <div class="alert-result-card success">
          <span>🎙️</span>
          <div class="alert-text">
            <strong>Vocal Combat Execution:</strong>
            <p>{voiceChat.lastVoiceCombatResult.message}</p>
            {#if voiceChat.lastVoiceCombatResult.resonance_mult && voiceChat.lastVoiceCombatResult.resonance_mult > 1.0}
              <span class="resonance-pill">⚡ Acoustic Harmonic Resonance: {Math.round(voiceChat.lastVoiceCombatResult.resonance_mult * 100)}% (+{voiceChat.lastVoiceCombatResult.bonus_pct ?? 0}%)</span>
            {/if}
          </div>
          <button type="button" class="btn-dismiss-alert" onclick={() => voiceChat.dismissVoiceCombatAlert()}>✕</button>
        </div>
      {/if}

      <!-- Spoken Spellcrafting Bar -->
      <div class="spellcraft-section">
        <h4 class="section-title">🔥 Spoken Arcane Incantations (Instant Voice Cast)</h4>
        <div class="spells-grid">
          <button
            type="button"
            class="btn-spell-chip fire"
            onclick={() => voiceChat.castIncantation('Ignis Tempest', 0.85, 320)}
          >
            <span class="spell-icon">🔥</span>
            <div class="spell-info">
              <strong>"Ignis Tempest!"</strong>
              <span class="spell-sub">Firestorm (75 Dmg, 25 Mana, 320Hz resonance)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-spell-chip frost"
            onclick={() => voiceChat.castIncantation('Glacial Nova', 0.75, 400)}
          >
            <span class="spell-icon">❄️</span>
            <div class="spell-info">
              <strong>"Glacial Nova!"</strong>
              <span class="spell-sub">Freeze Blast (55 Dmg, 20 Mana, 400Hz resonance)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-spell-chip barrier"
            onclick={() => voiceChat.castIncantation('Aegis Barricade', 0.9, 180)}
          >
            <span class="spell-icon">🛡️</span>
            <div class="spell-info">
              <strong>"Aegis Barricade!"</strong>
              <span class="spell-sub">Kinetic Shield (+45 Guard, 15 Mana, 180Hz resonance)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-spell-chip shadow"
            onclick={() => voiceChat.castIncantation('Siphon Soul', 0.95, 240)}
          >
            <span class="spell-icon">💀</span>
            <div class="spell-info">
              <strong>"Siphon Soul!"</strong>
              <span class="spell-sub">Life Drain (65 Dmg, +40 HP, 30 Mana, 240Hz resonance)</span>
            </div>
          </button>
        </div>

        <div class="custom-spell-row">
          <input
            type="text"
            bind:value={customSpellPhrase}
            placeholder="Speak or type custom incantation..."
            maxlength="60"
          />
          <button
            type="button"
            class="btn-cast-custom"
            disabled={!customSpellPhrase.trim()}
            onclick={() => voiceChat.castIncantation(customSpellPhrase, 0.8, 300)}
          >
            Cast Incantation
          </button>
        </div>
      </div>

      <!-- Squad Voice Tactics Bar -->
      <div class="squad-tactics-section">
        <h4 class="section-title">🛡️ Squad Tactical Voice Orders (Real-Time Companion Coordination)</h4>
        <div class="squad-commands-grid">
          <button
            type="button"
            class="btn-squad-chip valeria"
            onclick={() => voiceChat.issueSquadVoiceCommand('Valeria shield')}
          >
            <span class="companion-avatar">🛡️</span>
            <div class="squad-cmd-info">
              <strong>"Valeria, shield!"</strong>
              <span class="cmd-effect">Valeria raises Tower Shield (+50% party guard)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-squad-chip barnaby"
            onclick={() => voiceChat.issueSquadVoiceCommand('Barnaby strike')}
          >
            <span class="companion-avatar">⚔️</span>
            <div class="squad-cmd-info">
              <strong>"Barnaby, strike!"</strong>
              <span class="cmd-effect">Barnaby performs Flank Backstab (90 physical dmg)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-squad-chip rowan"
            onclick={() => voiceChat.issueSquadVoiceCommand('Rowan distract')}
          >
            <span class="companion-avatar">🎯</span>
            <div class="squad-cmd-info">
              <strong>"Rowan, distract!"</strong>
              <span class="cmd-effect">Rowan fires blinding flare (-40% enemy accuracy)</span>
            </div>
          </button>
          <button
            type="button"
            class="btn-squad-chip squad"
            onclick={() => voiceChat.issueSquadVoiceCommand('Squad turtle')}
          >
            <span class="companion-avatar">🐢</span>
            <div class="squad-cmd-info">
              <strong>"Squad, turtle!"</strong>
              <span class="cmd-effect">All companions enter Phalanx stance (+35 armor)</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if social.party}
    <ul class="members">
      {#each social.party.members as m (m.charId)}
        {@const isSpeaking = voiceChat.speakingPeers.has(m.charId)}
        <li class:leader={m.isLeader} class:speaking={isSpeaking}>
          <div class="name">
            <span class="name-text">
              {m.isLeader ? '👑 ' : ''}{m.name}
              {#if isSpeaking}
                <span class="speaking-indicator" title="Speaking now">🔊</span>
              {/if}
            </span>
            <span class="lvl">Lv {m.level}</span>
          </div>
          {#if m.current_hp !== undefined && m.max_hp}
            <div class="hp-bar">
              <div class="fill" style="width: {(m.current_hp / m.max_hp) * 100}%"></div>
              <span>{m.current_hp}/{m.max_hp}</span>
            </div>
          {/if}

          <!-- If own character, render active 2-4 companion squad -->
          {#if m.charId === character.active?.id && companion.activeSquad.length > 0}
            <div class="companion-squad">
              <div class="squad-header">
                <span>🐾 Active Squad ({companion.activeSquad.length}/4)</span>
              </div>
              <div class="squad-list">
                {#each companion.activeSquad as comp (comp.id)}
                  <div class="squad-tag">
                    <span class="comp-icon">{comp.icon || '🐺'}</span>
                    <span class="comp-name">{comp.name}</span>
                    <span class="comp-tactic">[{comp.tactic || 'BAL'}]</span>
                    <button
                      class="btn-dismiss"
                      title="Dismiss companion"
                      onclick={() => void companion.toggleActive(comp.id, false)}
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {:else}
    <div class="empty">
      <p>You aren't in a party.</p>
      <p class="empty-hint">Form a party to venture into dungeons and bring up to 4 companions into combat!</p>
    </div>
  {/if}

  <!-- Solo / Pre-Party Companion Squad Drawer -->
  {#if !social.party && companion.activeSquad.length > 0}
    <div class="solo-squad-drawer">
      <div class="squad-header">
        <span>🐾 Your Active Squad ({companion.activeSquad.length}/4 companions)</span>
      </div>
      <div class="squad-list">
        {#each companion.activeSquad as comp (comp.id)}
          <div class="squad-tag">
            <span class="comp-icon">{comp.icon || '🐺'}</span>
            <span class="comp-name">{comp.name}</span>
            <span class="comp-tactic">[{comp.tactic || 'BAL'}]</span>
            <button
              class="btn-dismiss"
              title="Dismiss companion"
              onclick={() => void companion.toggleActive(comp.id, false)}
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <form class="invite" onsubmit={invite}>
    <input type="text" bind:value={inviteName} placeholder="Invite by character name…" maxlength="20" />
    <button type="submit" disabled={!inviteName.trim()}>Invite</button>
  </form>
</div>

<style>
  .party { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; border-bottom: 1px solid var(--border); }
  .header-left { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  header h2 { margin: 0; font-size: 1rem; }
  .circadian-badge { font-size: 0.65rem; color: #fbbf24; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4); padding: 1px 6px; border-radius: 9999px; font-weight: 600; }
  .circadian-badge.night { color: #818cf8; background: rgba(129, 140, 248, 0.15); border-color: rgba(129, 140, 248, 0.4); }
  .voice-badge { display: flex; align-items: center; gap: 4px; font-size: 0.6875rem; color: #34d399; background: rgba(52, 211, 153, 0.15); border: 1px solid #059669; padding: 2px 6px; border-radius: 9999px; font-weight: 600; }
  .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #34d399; animation: pulse 1.5s infinite; }

  /* Voice Deck */
  .voice-deck { padding: 0.5rem 0.75rem; background: rgba(0, 0, 0, 0.35); border-bottom: 1px solid var(--border); }
  .btn-voice-join { width: 100%; padding: 0.45rem; background: linear-gradient(135deg, #1e3a8a, #3b82f6); border: 1px solid #60a5fa; border-radius: 0.375rem; color: #fff; font-size: 0.8125rem; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn-voice-join:hover { filter: brightness(1.15); }
  .voice-controls { display: flex; align-items: center; gap: 0.35rem; }
  .btn-voice-ctrl { flex: 1; padding: 0.35rem 0.5rem; font-size: 0.75rem; font-weight: 600; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--fg); cursor: pointer; }
  .btn-voice-ctrl.muted, .btn-voice-ctrl.deafened { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #f87171; }
  .btn-voice-cry { padding: 0.35rem 0.65rem; font-size: 0.75rem; font-weight: 800; background: linear-gradient(135deg, #b91c1c, #ea580c); border: 1px solid #f97316; border-radius: 0.25rem; color: #fff; cursor: pointer; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
  .btn-voice-cry:hover { filter: brightness(1.2); }
  .btn-voice-leave { padding: 0.35rem 0.5rem; font-size: 0.75rem; background: transparent; border: 1px solid var(--border); border-radius: 0.25rem; color: var(--fg-muted); cursor: pointer; }
  .btn-voice-leave:hover { color: var(--danger); border-color: var(--danger); }

  /* Transmission Band Switcher */
  .band-bar { display: flex; gap: 0.25rem; margin-top: 0.35rem; }
  .btn-band { flex: 1; padding: 0.25rem 0.35rem; font-size: 0.6875rem; font-weight: 600; background: var(--surface); border: 1px solid var(--border); border-radius: 0.25rem; color: var(--fg-muted); cursor: pointer; transition: all 0.15s; }
  .btn-band:hover { border-color: #a78bfa; color: #fff; }
  .btn-band.active { background: rgba(59, 130, 246, 0.2); border-color: #3b82f6; color: #93c5fd; font-weight: 700; }
  .btn-band.active:first-child { background: rgba(16, 185, 129, 0.2); border-color: #10b981; color: #6ee7b7; }
  .btn-band.active:nth-child(3) { background: rgba(139, 92, 246, 0.2); border-color: #8b5cf6; color: #c4b5fd; }
  .btn-band.active:nth-child(4) { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #fca5a5; }

  /* Transmission Band Status */
  .band-status { display: flex; align-items: center; gap: 0.35rem; margin-top: 0.3rem; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.65rem; border: 1px solid transparent; }
  .band-status.party { background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #a7f3d0; }
  .band-status.proximity { background: rgba(59, 130, 246, 0.12); border-color: rgba(59, 130, 246, 0.3); color: #bfdbfe; }
  .band-status.whisper { background: rgba(139, 92, 246, 0.12); border-color: rgba(139, 92, 246, 0.3); color: #ddd6fe; }
  .band-status.shout { background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.35); color: #fecaca; }
  .status-icon { font-size: 0.8rem; }
  .status-text { flex: 1; line-height: 1.2; }

  /* Plan Form */
  .plan-form { display: flex; gap: 0.25rem; margin-top: 0.4rem; }
  .btn-thought-toggle { font-size: 0.6875rem; font-weight: 700; padding: 0.25rem 0.45rem; background: rgba(30, 58, 138, 0.5); border: 1px solid #3b82f6; border-radius: 0.25rem; color: #93c5fd; cursor: pointer; }
  .btn-thought-toggle.thought { background: rgba(139, 92, 246, 0.35); border-color: #a855f7; color: #d8b4fe; }
  .plan-form input { flex: 1; font-size: 0.75rem; padding: 0.25rem 0.5rem; background: rgba(0, 0, 0, 0.5); border: 1px solid var(--border); border-radius: 0.25rem; color: #fff; }
  .plan-form input:focus { border-color: #8b5cf6; outline: none; }
  .plan-form button { font-size: 0.6875rem; font-weight: 600; padding: 0.25rem 0.5rem; background: #6d28d9; border: 1px solid #8b5cf6; border-radius: 0.25rem; color: #fff; cursor: pointer; }
  .plan-form button:hover:not(:disabled) { background: #7c3aed; }
  .plan-form button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Spatial Peer Speech Banner */
  .spatial-peer-banner { margin: 0.4rem 0.5rem; padding: 0.45rem 0.65rem; background: linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.35)); border: 1px solid #38bdf8; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; box-shadow: 0 0 10px rgba(56, 189, 248, 0.25); }
  .peer-icon { font-size: 1.2rem; }
  .peer-content { flex: 1; }
  .peer-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem; gap: 4px; }
  .peer-title strong { font-size: 0.75rem; color: #bae6fd; }
  .peer-badge { font-size: 0.625rem; color: #38bdf8; background: rgba(56, 189, 248, 0.2); border: 1px solid #0284c7; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .peer-dist { font-size: 0.625rem; color: #7dd3fc; }
  .peer-content p { margin: 0; font-size: 0.75rem; color: #f0f9ff; font-style: italic; line-height: 1.2; }

  /* Spatial Footstep Radar Banner */
  .spatial-footstep-banner { margin: 0.4rem 0.5rem; padding: 0.4rem 0.6rem; background: linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(126, 34, 206, 0.3)); border: 1px solid #a855f7; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; }
  .footstep-icon { font-size: 1.1rem; }
  .footstep-content { flex: 1; }
  .footstep-title { display: flex; align-items: center; gap: 5px; margin-bottom: 0.15rem; }
  .footstep-title strong { font-size: 0.75rem; color: #e9d5ff; }
  .footstep-stance-badge { font-size: 0.6rem; color: #f43f5e; background: rgba(244, 63, 94, 0.2); border: 1px solid #e11d48; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .footstep-surface-badge { font-size: 0.6rem; color: #c084fc; background: rgba(192, 132, 252, 0.2); border: 1px solid #9333ea; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .footstep-dist { font-size: 0.625rem; color: #d8b4fe; margin-left: auto; }
  .footstep-content p { margin: 0; font-size: 0.7rem; color: #f3e8ff; font-style: italic; }

  /* Awakened Denizen Banner */
  .awakened-npc-banner { margin: 0.4rem 0.5rem; padding: 0.45rem 0.65rem; background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(161, 98, 7, 0.35)); border: 1px solid #facc15; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; }
  .awakened-icon { font-size: 1.2rem; }
  .awakened-content { flex: 1; }
  .awakened-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem; }
  .awakened-title strong { font-size: 0.75rem; color: #fef08a; }
  .awakened-badge { font-size: 0.625rem; color: #eab308; background: rgba(234, 179, 8, 0.2); border: 1px solid #ca8a04; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .awakened-content p { margin: 0; font-size: 0.75rem; color: #fef9c3; font-style: italic; line-height: 1.2; }

  /* Companion Voice Reaction Bubble */
  .companion-voice-bubble { margin: 0.4rem 0.5rem; padding: 0.5rem 0.75rem; background: linear-gradient(135deg, rgba(88, 28, 135, 0.85), rgba(30, 58, 138, 0.85)); border: 1px solid #c084fc; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; box-shadow: 0 0 12px rgba(192, 132, 252, 0.35); animation: bubble-glow 2s infinite alternate; }
  .bubble-icon { font-size: 1.25rem; }
  .bubble-content { flex: 1; }
  .bubble-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
  .bubble-title strong { font-size: 0.75rem; color: #f3e8ff; }
  .bubble-badge { font-size: 0.625rem; color: #4ade80; background: rgba(74, 222, 128, 0.15); border: 1px solid #22c55e; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
  .bubble-content p { margin: 0; font-size: 0.8125rem; color: #ede9fe; font-style: italic; line-height: 1.25; }

  /* Companion Tactical Action Banner */
  .companion-action-banner { margin: 0.4rem 0.5rem; padding: 0.45rem 0.65rem; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(5, 150, 105, 0.3)); border: 1px solid #10b981; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; box-shadow: 0 0 10px rgba(16, 185, 129, 0.25); }
  .action-icon { font-size: 1.2rem; }
  .action-content { flex: 1; }
  .action-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.15rem; }
  .action-title strong { font-size: 0.75rem; color: #6ee7b7; }
  .action-badge { font-size: 0.625rem; color: #a7f3d0; background: rgba(16, 185, 129, 0.25); border: 1px solid #059669; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
  .action-content p { margin: 0 0 0.25rem 0; font-size: 0.75rem; color: #ecfdf5; line-height: 1.2; }
  .buff-chip { display: inline-block; font-size: 0.625rem; font-weight: 700; color: #34d399; background: rgba(0,0,0,0.4); padding: 1px 5px; border-radius: 3px; border: 1px solid #059669; }

  /* World NPC Overheard Banner */
  .npc-overheard-banner { margin: 0.4rem 0.5rem; padding: 0.45rem 0.65rem; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(30, 58, 138, 0.35)); border: 1px solid #3b82f6; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; }
  .npc-overheard-banner.enemy { background: linear-gradient(135deg, rgba(220, 38, 38, 0.25), rgba(153, 27, 27, 0.4)); border-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.3); }
  .npc-icon { font-size: 1.2rem; }
  .npc-content { flex: 1; }
  .npc-title { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 0.15rem; }
  .npc-title strong { font-size: 0.75rem; color: #fed7aa; }
  .npc-badge { font-size: 0.625rem; color: #fb923c; background: rgba(251, 146, 60, 0.15); border: 1px solid #ea580c; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
  .nocturnal-badge { font-size: 0.625rem; color: #a5b4fc; background: rgba(99, 102, 241, 0.2); border: 1px solid #6366f1; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .sleep-badge { font-size: 0.625rem; color: #fde047; background: rgba(234, 179, 8, 0.2); border: 1px solid #eab308; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .npc-content p { margin: 0 0 0.2rem 0; font-size: 0.75rem; color: #ffedd5; font-style: italic; line-height: 1.2; }
  .npc-action-desc { display: flex; align-items: center; gap: 5px; font-size: 0.6875rem; color: #fca5a5; font-weight: 600; }
  .window-badge { font-size: 0.625rem; color: #38bdf8; background: rgba(56, 189, 248, 0.2); border: 1px solid #0284c7; padding: 1px 4px; border-radius: 3px; font-weight: 700; }

  /* Drunk Altercation & De-escalation Card */
  .drunk-altercation-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(120, 53, 15, 0.9), rgba(69, 10, 10, 0.95));
    border: 2px solid #f59e0b;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(245, 158, 11, 0.4);
    animation: cry-shake 0.4s ease-in-out;
  }
  .altercation-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }
  .altercation-icon { font-size: 1.4rem; }
  .altercation-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .altercation-title strong { font-size: 0.85rem; color: #fef3c7; }
  .altercation-badge {
    font-size: 0.625rem;
    color: #fef08a;
    background: rgba(220, 38, 38, 0.6);
    border: 1px solid #ef4444;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }
  .btn-dismiss-confrontation {
    background: transparent;
    border: none;
    color: #fca5a5;
    font-size: 0.875rem;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .btn-dismiss-confrontation:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
  .altercation-text {
    margin: 0 0 0.5rem 0;
    font-size: 0.8125rem;
    color: #fffbeb;
    font-style: italic;
    line-height: 1.3;
  }
  .deescalate-result-box {
    margin-bottom: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid var(--border);
  }
  .deescalate-result-box.success {
    border-color: #10b981;
    background: rgba(6, 78, 59, 0.5);
  }
  .deescalate-result-box.fail {
    border-color: #ef4444;
    background: rgba(127, 29, 29, 0.5);
  }
  .roll-breakdown {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.6875rem;
    color: #e2e8f0;
    margin-bottom: 0.2rem;
  }
  .roll-badge strong { color: #facc15; }
  .crit-badge { color: #4ade80; font-weight: 800; font-size: 0.6875rem; }
  .crit-fail-badge { color: #f87171; font-weight: 800; font-size: 0.6875rem; }
  .deescalate-dialogue {
    margin: 0;
    font-size: 0.75rem;
    color: #f1f5f9;
    font-style: italic;
  }
  .deescalation-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
    gap: 0.35rem;
  }
  .btn-approach {
    padding: 0.35rem 0.4rem;
    border-radius: 0.375rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.35);
    color: #f8fafc;
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
    white-space: nowrap;
  }
  .btn-approach:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .btn-approach.buy-drink {
    background: rgba(217, 119, 6, 0.4);
    border-color: #f59e0b;
    color: #fef08a;
  }
  .btn-approach.buy-drink:hover { background: rgba(217, 119, 6, 0.7); }
  .btn-approach.persuasion {
    background: rgba(59, 130, 246, 0.3);
    border-color: #60a5fa;
  }
  .btn-approach.persuasion:hover { background: rgba(59, 130, 246, 0.6); }
  .btn-approach.intimidation {
    background: rgba(220, 38, 38, 0.3);
    border-color: #f87171;
  }
  .btn-approach.intimidation:hover { background: rgba(220, 38, 38, 0.6); }
  .btn-approach.bribe {
    background: rgba(234, 179, 8, 0.3);
    border-color: #facc15;
    color: #fef9c3;
  }
  .btn-approach.bribe:hover { background: rgba(234, 179, 8, 0.6); }
  .btn-approach.deception {
    background: rgba(168, 85, 247, 0.3);
    border-color: #c084fc;
  }
  /* Window Portal Station & Controls */
  .window-station-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(30, 41, 59, 0.95));
    border: 2px solid #38bdf8;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.3);
  }
  .station-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .station-icon { font-size: 1.3rem; }
  .station-title {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .station-title strong { font-size: 0.8125rem; color: #f0f9ff; }
  .window-state-tag {
    font-size: 0.625rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    display: inline-block;
  }
  .window-state-tag.open { color: #86efac; background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; }
  .window-state-tag.cracked { color: #fef08a; background: rgba(234, 179, 8, 0.2); border: 1px solid #eab308; }
  .window-state-tag.closed { color: #93c5fd; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; }
  .window-state-tag.shuttered { color: #fdba74; background: rgba(234, 88, 12, 0.2); border: 1px solid #ea580c; }
  .window-state-tag.broken { color: #fca5a5; background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; }

  .window-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(95px, 1fr));
    gap: 0.35rem;
  }
  .btn-win-action {
    padding: 0.35rem 0.4rem;
    border-radius: 0.375rem;
    font-size: 0.6875rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(0, 0, 0, 0.35);
    color: #f8fafc;
    transition: all 0.15s;
    text-align: center;
  }
  .btn-win-action:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }
  .btn-win-action.toggle { background: rgba(56, 189, 248, 0.25); border-color: #38bdf8; color: #bae6fd; }
  .btn-win-action.toggle:hover { background: rgba(56, 189, 248, 0.5); }
  .btn-win-action.peek { background: rgba(168, 85, 247, 0.25); border-color: #c084fc; color: #f3e8ff; }
  .btn-win-action.peek:hover { background: rgba(168, 85, 247, 0.5); }
  .btn-win-action.climb { background: rgba(34, 197, 94, 0.25); border-color: #4ade80; color: #dcfce7; }
  .btn-win-action.climb:hover { background: rgba(34, 197, 94, 0.5); }
  .btn-win-action.eavesdrop { background: rgba(234, 179, 8, 0.25); border-color: #facc15; color: #fef08a; }
  .btn-win-action.eavesdrop:hover { background: rgba(234, 179, 8, 0.5); }
  .btn-win-action.pebble { background: rgba(148, 163, 184, 0.25); border-color: #cbd5e1; }
  .btn-win-action.pebble:hover { background: rgba(148, 163, 184, 0.5); }
  .btn-win-action.break { background: rgba(239, 68, 68, 0.25); border-color: #f87171; color: #fecaca; }
  .btn-win-action.break:hover { background: rgba(239, 68, 68, 0.5); }
  .btn-win-action.defenestrate { background: rgba(220, 38, 38, 0.3); border-color: #f87171; color: #fca5a5; font-weight: 700; }
  .btn-win-action.defenestrate:hover { background: rgba(220, 38, 38, 0.6); color: #fff; }
  .btn-win-action.gas-sleep { background: rgba(99, 102, 241, 0.25); border-color: #818cf8; color: #c7d2fe; }
  .btn-win-action.gas-sleep:hover { background: rgba(99, 102, 241, 0.5); }
  .btn-win-action.gas-smoke { background: rgba(100, 116, 139, 0.35); border-color: #94a3b8; color: #e2e8f0; }
  .btn-win-action.gas-smoke:hover { background: rgba(100, 116, 139, 0.6); }
  .btn-win-action.gas-tear { background: rgba(132, 204, 22, 0.25); border-color: #a3e635; color: #d9f99d; }
  .btn-win-action.gas-tear:hover { background: rgba(132, 204, 22, 0.5); }

  /* Defenestration Alert Modal */
  .defenestration-modal-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(127, 29, 29, 0.95), rgba(69, 10, 10, 0.95));
    border: 2px solid #ef4444;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.4);
    animation: cry-shake 0.4s ease-in-out;
  }
  .defenestration-modal-card.success {
    background: linear-gradient(135deg, rgba(30, 64, 175, 0.95), rgba(15, 23, 42, 0.98));
    border-color: #3b82f6;
    box-shadow: 0 0 16px rgba(59, 130, 246, 0.4);
  }
  .defen-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
  .defen-icon { font-size: 1.3rem; }
  .defen-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .defen-title strong { font-size: 0.8125rem; color: #fee2e2; }
  .defenestration-modal-card.success .defen-title strong { color: #dbeafe; }
  .defen-target { font-size: 0.625rem; color: #fecaca; background: rgba(239, 68, 68, 0.3); border: 1px solid #f87171; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
  .btn-dismiss-defen { background: transparent; border: none; color: #fca5a5; font-size: 0.875rem; cursor: pointer; }
  .defen-narrative { margin: 0 0 0.4rem 0; font-size: 0.75rem; color: #fff1f2; font-style: italic; line-height: 1.25; }
  .defen-stats { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .stat-badge { font-size: 0.625rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; }
  .stat-badge.glass { background: rgba(239, 68, 68, 0.25); border: 1px solid #ef4444; color: #fca5a5; }
  .stat-badge.fall { background: rgba(245, 158, 11, 0.25); border: 1px solid #f59e0b; color: #fde68a; }
  .stat-badge.bleed { background: rgba(185, 28, 28, 0.3); border: 1px solid #b91c1c; color: #fca5a5; }
  .stat-badge.prone { background: rgba(168, 85, 247, 0.25); border: 1px solid #a855f7; color: #e9d5ff; }
  .stat-badge.loc { background: rgba(14, 165, 233, 0.25); border: 1px solid #0ea5e9; color: #bae6fd; }
  .stat-badge.fail { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; }
  .stat-badge.bars { background: rgba(148, 163, 184, 0.3); border: 1px solid #94a3b8; color: #f1f5f9; }

  /* Chemical Gas Modal */
  .gas-modal-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(63, 98, 18, 0.9), rgba(20, 83, 45, 0.95));
    border: 2px solid #84cc16;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(132, 204, 22, 0.4);
  }
  .gas-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; }
  .gas-icon { font-size: 1.3rem; }
  .gas-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .gas-title strong { font-size: 0.8125rem; color: #ecfccb; }
  .gas-badge { font-size: 0.625rem; color: #bef264; background: rgba(132, 204, 22, 0.25); border: 1px solid #84cc16; padding: 1px 4px; border-radius: 3px; font-weight: 800; }
  .btn-dismiss-gas { background: transparent; border: none; color: #bef264; font-size: 0.875rem; cursor: pointer; }
  .gas-narrative { margin: 0 0 0.35rem 0; font-size: 0.75rem; color: #f7fee7; font-style: italic; line-height: 1.25; }
  .gas-affected { font-size: 0.6875rem; font-weight: 700; color: #facc15; }

  /* Hub Bar */
  .hub-bar { display: flex; gap: 0.35rem; margin: 0.4rem 0.5rem; }
  .btn-hub { flex: 1; display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0.6rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 700; cursor: pointer; border: 1px solid var(--border); background: var(--surface); color: var(--fg); transition: all 0.15s; }
  .btn-hub:hover { border-color: #a78bfa; }
  .btn-hub.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.15); color: #fef08a; }
  .btn-hub.property.active { border-color: #10b981; background: rgba(16, 185, 129, 0.15); color: #a7f3d0; }
  .alert-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; margin-left: 4px; animation: pulse 1s infinite; }

  /* Underworld Drawer */
  .underworld-drawer { margin: 0.4rem 0.5rem; padding: 0.5rem; background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.45rem; }
  .drawer-header { display: flex; justify-content: space-between; align-items: center; }
  .drawer-title { font-size: 0.75rem; font-weight: 800; color: #fef08a; letter-spacing: 0.05em; text-transform: uppercase; }
  .drawer-header-actions { display: flex; gap: 0.3rem; }
  .btn-spot-stalker, .btn-drama-trigger { font-size: 0.625rem; font-weight: 700; padding: 0.2rem 0.4rem; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 0.25rem; color: #fef08a; cursor: pointer; transition: all 0.15s; }
  .btn-spot-stalker:hover, .btn-drama-trigger:hover { background: rgba(245, 158, 11, 0.4); transform: translateY(-1px); }
  .btn-drama-trigger { background: rgba(239, 68, 68, 0.25); border-color: #f87171; color: #fecaca; }
  .btn-drama-trigger:hover { background: rgba(239, 68, 68, 0.45); }

  /* Autonomous NPC Drama Card */
  .drama-card { padding: 0.55rem; background: linear-gradient(135deg, rgba(30, 27, 75, 0.7), rgba(15, 23, 42, 0.9)); border: 1px solid #6366f1; border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.35rem; }
  .drama-card.murdered { border-color: #ef4444; background: linear-gradient(135deg, rgba(69, 10, 10, 0.9), rgba(15, 23, 42, 0.95)); }
  .drama-card.rescued { border-color: #10b981; background: linear-gradient(135deg, rgba(6, 78, 59, 0.8), rgba(15, 23, 42, 0.95)); }
  .drama-header { display: flex; align-items: center; gap: 0.4rem; }
  .drama-icon { font-size: 1.2rem; }
  .drama-title { flex: 1; display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
  .drama-title strong { font-size: 0.75rem; color: #e0e7ff; }
  .drama-badge { font-size: 0.5625rem; font-weight: 800; padding: 1px 5px; border-radius: 3px; background: rgba(99, 102, 241, 0.25); border: 1px solid #818cf8; color: #c7d2fe; }
  .drama-badge.danger { background: rgba(239, 68, 68, 0.3); border-color: #ef4444; color: #fca5a5; animation: pulse 1s infinite; }
  .drama-badge.murder { background: rgba(185, 28, 28, 0.4); border-color: #dc2626; color: #fecaca; }
  .drama-badge.safe { background: rgba(16, 185, 129, 0.25); border-color: #10b981; color: #a7f3d0; }
  .btn-dismiss-drama { background: transparent; border: none; color: #94a3b8; font-size: 0.75rem; cursor: pointer; }
  .drama-desc { margin: 0; font-size: 0.6875rem; color: #cbd5e1; line-height: 1.3; }
  .stalker-tag { color: #fca5a5; font-weight: 700; }
  .victim-tag { color: #93c5fd; font-weight: 700; }
  .drama-motive { font-size: 0.625rem; color: #fef08a; background: rgba(0, 0, 0, 0.3); padding: 2px 5px; border-radius: 3px; }
  .drama-timer-bar { display: flex; justify-content: space-between; align-items: center; font-size: 0.625rem; font-weight: 800; color: #fbbf24; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 2px 6px; border-radius: 3px; }
  .btn-tick-turn { font-size: 0.5625rem; font-weight: 700; padding: 1px 4px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 2px; color: #fff; cursor: pointer; }
  .btn-tick-turn:hover { background: rgba(255, 255, 255, 0.25); }

  /* Deadpool Intervention Actions */
  .drama-actions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.3rem; }
  .btn-drama-act { padding: 0.3rem 0.4rem; font-size: 0.625rem; font-weight: 800; border-radius: 0.25rem; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; text-align: center; }
  .btn-drama-act.deadpool { grid-column: 1 / -1; background: linear-gradient(135deg, rgba(220, 38, 38, 0.5), rgba(185, 28, 28, 0.8)); border-color: #ef4444; color: #fff; box-shadow: 0 0 10px rgba(239, 68, 68, 0.4); }
  .btn-drama-act.deadpool:hover { filter: brightness(1.2); transform: translateY(-1px); }
  .btn-drama-act.tackle { background: rgba(59, 130, 246, 0.3); border-color: #3b82f6; color: #bfdbfe; }
  .btn-drama-act.tackle:hover { background: rgba(59, 130, 246, 0.5); }
  .btn-drama-act.eavesdrop { background: rgba(168, 85, 247, 0.3); border-color: #c084fc; color: #f3e8ff; }
  .btn-drama-act.eavesdrop:hover { background: rgba(168, 85, 247, 0.5); }
  .btn-drama-act.attack { background: rgba(249, 115, 22, 0.3); border-color: #f97316; color: #fed7aa; }
  .btn-drama-act.attack:hover { background: rgba(249, 115, 22, 0.5); }
  .btn-drama-act.shout { background: rgba(234, 179, 8, 0.3); border-color: #eab308; color: #fef08a; }
  .btn-drama-act.shout:hover { background: rgba(234, 179, 8, 0.5); }

  /* Intervention Result Box */
  .drama-result-box { padding: 0.45rem; background: rgba(0, 0, 0, 0.4); border-left: 3px solid #ef4444; border-radius: 0.25rem; font-size: 0.6875rem; }
  .drama-result-box.success { border-left-color: #10b981; background: rgba(6, 78, 59, 0.3); }
  .deadpool-quote { font-style: italic; color: #fca5a5; margin: 0 0 0.3rem 0; font-weight: 600; line-height: 1.3; }
  .result-narrative { margin: 0 0 0.35rem 0; color: #f1f5f9; }
  .drama-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .drama-chip { font-size: 0.5625rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; }
  .drama-chip.roll { background: rgba(148, 163, 184, 0.2); border: 1px solid #94a3b8; color: #e2e8f0; }
  .drama-chip.gold { background: rgba(234, 179, 8, 0.25); border: 1px solid #eab308; color: #fef08a; }
  .drama-chip.xp { background: rgba(16, 185, 129, 0.25); border: 1px solid #10b981; color: #a7f3d0; }
  .drama-chip.intel { background: rgba(168, 85, 247, 0.25); border: 1px solid #a855f7; color: #f3e8ff; }

  /* Crime Scene Forensics Box */
  .crime-scene-box { display: flex; flex-direction: column; gap: 0.35rem; padding: 0.45rem; background: rgba(0, 0, 0, 0.5); border: 1px solid #ef4444; border-radius: 0.375rem; }
  .crime-banner { display: flex; align-items: center; gap: 0.4rem; font-size: 0.6875rem; color: #fecaca; }
  .chalk-icon { font-size: 1.3rem; }
  .btn-investigate-crime { padding: 0.3rem 0.5rem; background: linear-gradient(135deg, #1e3a8a, #312e81); border: 1px solid #60a5fa; color: #fff; font-size: 0.6875rem; font-weight: 700; border-radius: 0.25rem; cursor: pointer; }
  .btn-investigate-crime:hover { filter: brightness(1.2); }
  .crime-results { padding: 0.35rem; background: rgba(15, 23, 42, 0.8); border-left: 2px solid #3b82f6; font-size: 0.6875rem; color: #e2e8f0; }
  .clues-list { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.3rem; }
  .clue-tag { font-size: 0.5625rem; font-weight: 700; color: #fde047; background: rgba(234, 179, 8, 0.2); border: 1px solid #eab308; padding: 1px 4px; border-radius: 3px; }
  .bounty-active-badge { display: inline-block; margin-top: 0.3rem; font-size: 0.625rem; font-weight: 800; color: #4ade80; }

  /* Active Tavern Brawl Styles */
  .brawl-card.active-brawl { border-color: #ef4444; background: linear-gradient(135deg, rgba(69, 10, 10, 0.85), rgba(15, 23, 42, 0.95)); box-shadow: 0 0 12px rgba(239, 68, 68, 0.35); }
  .brawlers-list { display: flex; flex-direction: column; gap: 0.25rem; margin-top: 0.3rem; }
  .brawler-row { display: flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.4rem; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 0.25rem; }
  .brawler-icon { font-size: 1rem; }
  .brawler-info { flex: 1; display: flex; justify-content: space-between; font-size: 0.6875rem; }
  .brawler-name { font-weight: 700; color: #fca5a5; }
  .brawler-hp { font-size: 0.625rem; color: #94a3b8; }
  .btn-defenestrate-brawler { padding: 0.2rem 0.45rem; font-size: 0.625rem; font-weight: 800; background: rgba(220, 38, 38, 0.4); border: 1px solid #ef4444; color: #fff; border-radius: 0.25rem; cursor: pointer; transition: all 0.15s; }
  .btn-defenestrate-brawler:hover { background: rgba(220, 38, 38, 0.8); transform: translateY(-1px); }
  .brawl-controls { display: flex; gap: 0.3rem; margin-top: 0.3rem; }
  .btn-brawl-tick { flex: 1; padding: 0.3rem; background: rgba(245, 158, 11, 0.3); border: 1px solid #f59e0b; color: #fef08a; font-size: 0.6875rem; font-weight: 700; border-radius: 0.25rem; cursor: pointer; }
  .btn-brawl-tick:hover { background: rgba(245, 158, 11, 0.5); }
  .btn-dismiss-brawl { background: transparent; border: none; color: #fca5a5; font-size: 0.75rem; cursor: pointer; margin-left: auto; }
  .brawl-action-alert { padding: 0.3rem; background: rgba(249, 115, 22, 0.25); border: 1px solid #f97316; border-radius: 0.25rem; font-size: 0.6875rem; color: #fed7aa; font-style: italic; }

  /* Stalker Card */
  .stalker-card { padding: 0.5rem; background: rgba(0, 0, 0, 0.4); border: 1px solid #f59e0b; border-radius: 0.375rem; }
  .stalker-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem; }
  .stalker-icon { font-size: 1.1rem; }
  .stalker-title { flex: 1; display: flex; align-items: center; gap: 0.35rem; }
  .stalker-title strong { font-size: 0.75rem; color: #fed7aa; }
  .stalker-badge { font-size: 0.5625rem; color: #fbbf24; background: rgba(251, 191, 36, 0.2); border: 1px solid #d97706; padding: 1px 4px; border-radius: 3px; font-weight: 800; }
  .btn-dismiss-stalker { background: transparent; border: none; color: #cbd5e1; font-size: 0.75rem; cursor: pointer; }
  .stalker-narrative { margin: 0 0 0.35rem 0; font-size: 0.6875rem; color: #ffedd5; font-style: italic; }
  .stalker-result-box { margin-bottom: 0.35rem; padding: 0.3rem 0.45rem; background: rgba(245, 158, 11, 0.15); border-left: 2px solid #f59e0b; font-size: 0.6875rem; color: #fffbeb; font-style: italic; }
  .stalker-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25rem; }
  .btn-stalker-act { padding: 0.25rem 0.35rem; font-size: 0.625rem; font-weight: 700; border-radius: 0.25rem; cursor: pointer; border: 1px solid transparent; text-align: center; }
  .btn-stalker-act.interrogate { background: rgba(59, 130, 246, 0.25); border-color: #3b82f6; color: #93c5fd; }
  .btn-stalker-act.bribe { background: rgba(234, 179, 8, 0.25); border-color: #eab308; color: #fde047; }
  .btn-stalker-act.attack { background: rgba(239, 68, 68, 0.25); border-color: #ef4444; color: #fca5a5; }

  /* Gutter Addict Card */
  .addict-card { padding: 0.5rem; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(168, 85, 247, 0.4); border-radius: 0.375rem; }
  .addict-header { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.2rem; }
  .addict-icon { font-size: 1.1rem; }
  .addict-title { flex: 1; display: flex; align-items: center; gap: 0.35rem; }
  .addict-title strong { font-size: 0.75rem; color: #e9d5ff; }
  .addict-badge { font-size: 0.5625rem; color: #c084fc; background: rgba(192, 132, 252, 0.2); border: 1px solid #9333ea; padding: 1px 4px; border-radius: 3px; font-weight: 800; }
  .btn-dismiss-addict { background: transparent; border: none; color: #cbd5e1; font-size: 0.75rem; cursor: pointer; }
  .addict-desc { margin: 0 0 0.35rem 0; font-size: 0.6875rem; color: #cbd5e1; font-style: italic; }
  .addict-result-box { margin-bottom: 0.35rem; padding: 0.3rem 0.45rem; background: rgba(147, 51, 234, 0.15); border-left: 2px solid #a855f7; font-size: 0.6875rem; color: #f3e8ff; font-style: italic; }
  .addict-result-box.alerted { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.15); }
  .addict-reward-chip { display: inline-block; font-size: 0.625rem; font-weight: 700; color: #34d399; margin-top: 2px; }
  .addict-reward-chip.gold { color: #facc15; }
  .addict-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25rem; }
  .btn-addict-act { padding: 0.25rem 0.35rem; font-size: 0.625rem; font-weight: 700; border-radius: 0.25rem; cursor: pointer; border: 1px solid transparent; text-align: center; }
  .btn-addict-act.alms { background: rgba(16, 185, 129, 0.25); border-color: #10b981; color: #6ee7b7; }
  .btn-addict-act.threaten { background: rgba(245, 158, 11, 0.25); border-color: #f59e0b; color: #fde68a; }
  .btn-addict-act.pickpocket { background: rgba(168, 85, 247, 0.25); border-color: #a855f7; color: #d8b4fe; }

  /* Brawl Card */
  .brawl-card { padding: 0.45rem; background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 0.375rem; display: flex; flex-direction: column; gap: 0.3rem; }
  .brawl-header { display: flex; align-items: center; gap: 0.4rem; }
  .brawl-icon { font-size: 1.1rem; }
  .brawl-title { display: flex; flex-direction: column; }
  .brawl-title strong { font-size: 0.75rem; color: #fca5a5; }
  .brawl-sub { font-size: 0.625rem; color: #94a3b8; }
  .btn-cascade-brawl { width: 100%; padding: 0.3rem; background: linear-gradient(135deg, #991b1b, #c2410c); border: 1px solid #ea580c; border-radius: 0.25rem; color: #fff; font-size: 0.6875rem; font-weight: 800; cursor: pointer; }
  .btn-cascade-brawl:hover { filter: brightness(1.2); }

  /* Properties Modal */
  .properties-modal-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(6, 78, 59, 0.95), rgba(15, 23, 42, 0.98));
    border: 2px solid #10b981;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.35);
  }
  .prop-modal-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.45rem; }
  .prop-icon { font-size: 1.3rem; }
  .prop-modal-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .prop-modal-title strong { font-size: 0.8125rem; color: #d1fae5; }
  .prop-badge { font-size: 0.625rem; color: #a7f3d0; background: rgba(16, 185, 129, 0.2); border: 1px solid #059669; padding: 1px 4px; border-radius: 3px; font-weight: 800; }
  .btn-dismiss-prop { background: transparent; border: none; color: #a7f3d0; font-size: 0.875rem; cursor: pointer; }

  /* Draft Banner */
  .draft-result-banner { display: flex; gap: 0.4rem; align-items: flex-start; padding: 0.35rem 0.5rem; margin-bottom: 0.45rem; background: rgba(0, 0, 0, 0.35); border: 1px solid #38bdf8; border-radius: 0.375rem; font-size: 0.6875rem; }
  .draft-result-banner.extinguished { border-color: #facc15; }
  .draft-icon { font-size: 1rem; }
  .draft-text { flex: 1; }
  .draft-text strong { color: #bae6fd; font-size: 0.6875rem; }
  .draft-text p { margin: 2px 0; color: #f0f9ff; font-style: italic; }
  .draft-stealth-badge { display: inline-block; font-size: 0.625rem; font-weight: 700; color: #4ade80; background: rgba(34, 197, 94, 0.2); padding: 1px 4px; border-radius: 3px; border: 1px solid #22c55e; }
  .btn-dismiss-draft { background: transparent; border: none; color: #94a3b8; font-size: 0.75rem; cursor: pointer; }

  /* Properties List */
  .properties-list { display: flex; flex-direction: column; gap: 0.45rem; max-height: 280px; overflow-y: auto; }
  .property-card { padding: 0.45rem 0.6rem; background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border); border-radius: 0.375rem; }
  .property-card.owned { border-color: #10b981; background: rgba(16, 185, 129, 0.1); }
  .prop-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
  .prop-card-name { font-weight: 700; font-size: 0.75rem; color: #f8fafc; }
  .prop-ownership-tag { font-size: 0.625rem; font-weight: 800; color: #fbbf24; }
  .prop-ownership-tag.owned { color: #34d399; }
  .prop-location { display: flex; justify-content: space-between; font-size: 0.625rem; color: #94a3b8; margin-bottom: 0.35rem; }
  .btn-buy-deed { width: 100%; padding: 0.3rem; background: linear-gradient(135deg, #d97706, #b45309); border: 1px solid #f59e0b; border-radius: 0.25rem; color: #fef08a; font-size: 0.6875rem; font-weight: 800; cursor: pointer; }
  .btn-buy-deed:hover { filter: brightness(1.2); }

  /* Fortifications Deck */
  .fortifications-deck { border-top: 1px dashed rgba(16, 185, 129, 0.3); padding-top: 0.3rem; }
  .fort-deck-title { font-size: 0.625rem; font-weight: 800; color: #a7f3d0; text-transform: uppercase; margin-bottom: 0.25rem; }
  .fort-grid { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.35rem; }
  .fort-item { display: flex; justify-content: space-between; align-items: center; font-size: 0.6875rem; color: #e2e8f0; }
  .fort-installed { font-size: 0.625rem; font-weight: 800; color: #34d399; background: rgba(16, 185, 129, 0.2); padding: 1px 5px; border-radius: 3px; border: 1px solid #10b981; }
  .btn-install-fort { font-size: 0.625rem; font-weight: 700; padding: 1px 6px; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; border-radius: 3px; color: #a7f3d0; cursor: pointer; }
  .btn-install-fort:hover { background: rgba(16, 185, 129, 0.4); }
  .btn-toggle-curtains { font-size: 0.625rem; font-weight: 700; padding: 1px 6px; background: rgba(139, 92, 246, 0.2); border: 1px solid #8b5cf6; border-radius: 3px; color: #ddd6fe; cursor: pointer; }
  .btn-toggle-curtains.drawn { background: rgba(139, 92, 246, 0.5); color: #fff; }
  .property-actions-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem; }
  .btn-prop-rest { padding: 0.25rem; font-size: 0.625rem; font-weight: 700; background: linear-gradient(135deg, #059669, #047857); border: 1px solid #34d399; border-radius: 0.25rem; color: #fff; cursor: pointer; }
  .btn-prop-rest:hover { filter: brightness(1.15); }
  .btn-check-draft { padding: 0.25rem; font-size: 0.625rem; font-weight: 700; background: rgba(14, 165, 233, 0.2); border: 1px solid #0ea5e9; border-radius: 0.25rem; color: #bae6fd; cursor: pointer; }
  .btn-check-draft:hover { background: rgba(14, 165, 233, 0.4); }

  /* Sightline Peek Modal */
  .peek-modal-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(30, 27, 75, 0.95), rgba(49, 46, 129, 0.95));
    border: 2px solid #a855f7;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(168, 85, 247, 0.4);
    animation: bubble-glow 2s infinite alternate;
  }
  .peek-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }
  .peek-icon { font-size: 1.3rem; }
  .peek-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .peek-title strong { font-size: 0.8125rem; color: #f5d0fe; }
  .peek-clarity-badge {
    font-size: 0.625rem;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
  }
  .peek-clarity-badge.clear { background: rgba(34, 197, 94, 0.2); border: 1px solid #22c55e; color: #86efac; }
  .peek-clarity-badge.distorted { background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; }
  .btn-dismiss-peek {
    background: transparent;
    border: none;
    color: #e9d5ff;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .peek-narrative {
    margin: 0 0 0.4rem 0;
    font-size: 0.75rem;
    color: #ede9fe;
    font-style: italic;
    line-height: 1.25;
  }
  .peek-occupants-list {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 0.375rem;
    padding: 0.4rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .occupants-title {
    font-size: 0.625rem;
    font-weight: 800;
    color: #c084fc;
    letter-spacing: 0.05em;
  }
  .peek-occupant-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.6875rem;
  }
  .occ-icon { font-size: 0.85rem; }
  .occ-name { font-weight: 600; color: #f1f5f9; }
  .occ-activity { color: #94a3b8; font-style: italic; font-size: 0.625rem; }
  .occ-activity.asleep { color: #fde047; font-weight: 700; }

  /* Sovereign Rumor Intel Card */
  .rumor-intel-card {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(67, 56, 202, 0.9), rgba(49, 46, 129, 0.95));
    border: 2px solid #eab308;
    border-radius: 0.5rem;
    box-shadow: 0 0 16px rgba(234, 179, 8, 0.35);
  }
  .rumor-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.35rem;
  }
  .rumor-icon { font-size: 1.3rem; }
  .rumor-title { flex: 1; display: flex; align-items: center; gap: 0.5rem; }
  .rumor-title strong { font-size: 0.8125rem; color: #fef08a; }
  .rumor-badge {
    font-size: 0.625rem;
    color: #fef08a;
    background: rgba(234, 179, 8, 0.25);
    border: 1px solid #ca8a04;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 800;
  }
  .btn-dismiss-rumor {
    background: transparent;
    border: none;
    color: #fef9c3;
    font-size: 0.875rem;
    cursor: pointer;
  }
  .rumor-speakers {
    font-size: 0.6875rem;
    color: #ddd6fe;
    margin-bottom: 0.25rem;
  }
  .rumor-dialogue {
    margin: 0 0 0.35rem 0;
    font-size: 0.75rem;
    color: #fffbeb;
    font-style: italic;
    line-height: 1.3;
  }
  .rumor-dialogue.fail { color: #fca5a5; }
  .rumor-perk-chip {
    display: inline-block;
    font-size: 0.6875rem;
    font-weight: 700;
    color: #fef08a;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid #eab308;
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* Uile Reality Warp Banner */
  .uile-warp-banner { margin: 0.4rem 0.5rem; padding: 0.5rem 0.75rem; background: linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(168, 85, 247, 0.25)); border: 2px solid #facc15; border-radius: 0.375rem; display: flex; gap: 0.5rem; align-items: flex-start; box-shadow: 0 0 15px rgba(250, 204, 21, 0.4); animation: bubble-glow 1.8s infinite alternate; }
  .uile-icon { font-size: 1.3rem; }
  .uile-content { flex: 1; }
  .uile-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.2rem; }
  .uile-title strong { font-size: 0.75rem; color: #fef08a; }
  .uile-badge { font-size: 0.625rem; color: #fef08a; background: rgba(234, 179, 8, 0.3); border: 1px solid #eab308; padding: 1px 4px; border-radius: 3px; font-weight: 700; }
  .uile-content p { margin: 0; font-size: 0.75rem; color: #fffbeb; line-height: 1.25; }

  /* Tactical Log Feed */
  .tactical-log-drawer { margin: 0.35rem 0.5rem; border: 1px solid var(--border); border-radius: 0.375rem; background: rgba(0, 0, 0, 0.3); overflow: hidden; }
  .log-toggle-btn { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0.6rem; background: var(--surface-2); border: none; font-size: 0.6875rem; font-weight: 600; color: #a78bfa; cursor: pointer; }
  .tactical-log-list { list-style: none; margin: 0; padding: 0.3rem 0.5rem; display: flex; flex-direction: column; gap: 0.3rem; max-height: 110px; overflow-y: auto; }
  .log-item { display: flex; gap: 0.4rem; align-items: center; font-size: 0.6875rem; border-left: 2px solid #8b5cf6; padding-left: 0.35rem; }
  .log-item.companion { border-left-color: #10b981; }
  .log-item.npc { border-left-color: #ef4444; }
  .log-item.uile { border-left-color: #eab308; }
  .log-item.peer { border-left-color: #38bdf8; }
  .log-icon { font-size: 0.85rem; }
  .log-text { flex: 1; display: flex; flex-direction: column; }
  .log-title { font-weight: 700; color: #e2e8f0; }
  .log-desc { font-size: 0.625rem; color: var(--fg-muted); }

  /* Battle Cry Banner */
  .battle-cry-banner { margin: 0.5rem; padding: 0.5rem 0.75rem; background: linear-gradient(135deg, rgba(185, 28, 28, 0.9), rgba(234, 88, 12, 0.9)); border: 2px solid #fdba74; border-radius: 0.375rem; color: #fff; display: flex; align-items: center; gap: 0.5rem; box-shadow: 0 0 15px rgba(234, 88, 12, 0.5); animation: cry-shake 0.5s ease-in-out; }
  .cry-icon { font-size: 1.25rem; }
  .cry-text strong { display: block; font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; color: #fed7aa; }
  .cry-text span { font-size: 0.875rem; font-weight: 800; }

  .leave { font-size: 0.75rem; color: var(--danger); border-color: rgba(208,72,72,0.4); }
  .members { list-style: none; margin: 0; padding: 0.5rem; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem; }
  .members li { background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; padding: 0.625rem 0.75rem; transition: border-color 0.2s, box-shadow 0.2s; }
  .members li.leader { border-color: var(--accent); }
  .members li.speaking { border-color: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
  .name { display: flex; justify-content: space-between; font-weight: 600; font-size: 0.875rem; margin-bottom: 0.25rem; }
  .name-text { display: flex; align-items: center; gap: 4px; }
  .speaking-indicator { font-size: 0.75rem; animation: pulse 0.8s infinite; }
  .lvl { color: var(--fg-muted); font-weight: normal; font-size: 0.75rem; }
  .hp-bar { position: relative; height: 14px; background: var(--surface); border-radius: 0.25rem; overflow: hidden; font-size: 0.6875rem; }
  .hp-bar .fill { position: absolute; inset: 0 auto 0 0; background: var(--danger); transition: width 240ms; }
  .hp-bar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

  /* Companion Squad */
  .companion-squad, .solo-squad-drawer { margin-top: 0.5rem; padding-top: 0.375rem; border-top: 1px dashed var(--border); }
  .squad-header { font-size: 0.6875rem; font-weight: 600; color: #a78bfa; margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .squad-list { display: flex; flex-wrap: wrap; gap: 0.25rem; }
  .squad-tag { display: inline-flex; align-items: center; gap: 3px; background: rgba(139, 92, 246, 0.15); border: 1px solid rgba(139, 92, 246, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 0.6875rem; color: #ddd6fe; }
  .comp-icon { font-size: 0.75rem; }
  .comp-tactic { color: #c4b5fd; font-weight: 600; font-size: 0.625rem; }
  .btn-dismiss { background: transparent; border: none; color: #f87171; font-size: 0.75rem; font-weight: bold; cursor: pointer; padding: 0 2px; }
  .btn-dismiss:hover { color: #ef4444; }

  .empty { color: var(--fg-muted); padding: 1.5rem 1rem; text-align: center; }
  .empty-hint { font-size: 0.75rem; color: var(--fg-subtle); margin-top: 0.25rem; }
  .solo-squad-drawer { padding: 0.5rem 0.75rem; margin: 0 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 0.375rem; }

  .invite { display: flex; gap: 0.25rem; padding: 0.5rem; border-top: 1px solid var(--border); }
  .invite input { flex: 1; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.9); }
  }
  @keyframes cry-shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-4px); }
    40%, 80% { transform: translateX(4px); }
  }
  @keyframes bubble-glow {
    0% { filter: drop-shadow(0 0 4px rgba(192, 132, 252, 0.4)); }
    100% { filter: drop-shadow(0 0 10px rgba(192, 132, 252, 0.8)); }
  }

  /* God's Eye Deck & Tactical Sonar */
  .btn-hub.godseye {
    border-color: rgba(6, 182, 212, 0.4);
    background: rgba(6, 182, 212, 0.08);
    color: #67e8f9;
  }
  .btn-hub.godseye:hover, .btn-hub.godseye.active {
    background: rgba(6, 182, 212, 0.2);
    border-color: #06b6d4;
  }
  .alert-dot.red {
    background: #ef4444;
    box-shadow: 0 0 6px #ef4444;
  }
  .godseye-deck {
    margin: 0.5rem 0.5rem 0.75rem 0.5rem;
    padding: 0.75rem;
    background: #080c14;
    border: 1px solid rgba(6, 182, 212, 0.5);
    border-radius: 0.5rem;
    box-shadow: 0 4px 20px rgba(6, 182, 212, 0.15);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  .godseye-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(6, 182, 212, 0.3);
  }
  .godseye-brand {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .godseye-eye-icon {
    font-size: 1.5rem;
    animation: pulse 2s infinite;
  }
  .godseye-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #38bdf8;
    letter-spacing: 0.06em;
  }
  .godseye-badge {
    font-size: 0.6rem;
    padding: 1px 6px;
    background: rgba(6, 182, 212, 0.2);
    border: 1px solid #06b6d4;
    border-radius: 4px;
    color: #67e8f9;
    letter-spacing: 0.1em;
  }
  .godseye-sub {
    font-size: 0.65rem;
    color: #94a3b8;
    margin: 2px 0 0 0;
  }
  .godseye-header-actions {
    display: flex;
    gap: 0.375rem;
  }
  .btn-sonar-ping {
    padding: 4px 10px;
    font-size: 0.7rem;
    font-weight: bold;
    background: rgba(6, 182, 212, 0.25);
    border: 1px solid #06b6d4;
    color: #a5f3fc;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .btn-sonar-ping:hover {
    background: rgba(6, 182, 212, 0.45);
    box-shadow: 0 0 10px rgba(6, 182, 212, 0.4);
  }
  .btn-sonar-scan {
    padding: 4px 8px;
    font-size: 0.7rem;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid #475569;
    color: #cbd5e1;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn-sonar-scan:hover { background: #334155; }
  .btn-close-godseye {
    padding: 2px 8px;
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .btn-close-godseye:hover { color: #fff; border-color: #ef4444; }

  /* Viewport Layout */
  .godseye-viewport-row {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 0.75rem;
  }
  @media (max-width: 640px) {
    .godseye-viewport-row { grid-template-columns: 1fr; }
  }

  /* Radar Scope */
  .radar-scope-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
  .radar-scope {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle, #091a28 0%, #030712 95%);
    border: 2px solid #06b6d4;
    box-shadow: 0 0 20px rgba(6, 182, 212, 0.25), inset 0 0 25px rgba(6, 182, 212, 0.15);
    position: relative;
    overflow: hidden;
  }
  .range-ring {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 50%;
    border: 1px dashed rgba(6, 182, 212, 0.3);
    pointer-events: none;
  }
  .range-ring.r-5m { width: 33%; height: 33%; }
  .range-ring.r-10m { width: 66%; height: 66%; }
  .range-ring.r-15m { width: 94%; height: 94%; border-style: solid; border-color: rgba(6, 182, 212, 0.4); }

  .radar-sweep-beam {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: conic-gradient(from 0deg, rgba(6, 182, 212, 0.4) 0deg, transparent 60deg, transparent 360deg);
    animation: radar-sweep 4s linear infinite;
    pointer-events: none;
  }
  @keyframes radar-sweep {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .compass-mark {
    position: absolute;
    font-size: 0.55rem;
    font-weight: 800;
    color: rgba(6, 182, 212, 0.6);
    pointer-events: none;
  }
  .compass-mark.n { top: 4px; left: 50%; transform: translateX(-50%); }
  .compass-mark.s { bottom: 4px; left: 50%; transform: translateX(-50%); }
  .compass-mark.e { right: 5px; top: 50%; transform: translateY(-50%); }
  .compass-mark.w { left: 5px; top: 50%; transform: translateY(-50%); }

  .player-origin-blip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    z-index: 5;
  }
  .origin-ping-dot {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }

  .radar-blip {
    position: absolute;
    transform: translate(-50%, -50%);
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0;
    z-index: 6;
    transition: transform 0.15s ease-out;
  }
  .radar-blip:hover, .radar-blip.selected {
    transform: translate(-50%, -50%) scale(1.4);
    z-index: 10;
  }
  .blip-core {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    display: block;
    box-shadow: 0 0 6px currentColor;
  }
  .radar-blip.player .blip-core { background: #10b981; color: #10b981; }
  .radar-blip.npc .blip-core { background: #f59e0b; color: #f59e0b; }
  .radar-blip.enemy .blip-core { background: #ef4444; color: #ef4444; }
  .radar-blip.apex .blip-core {
    background: #f43f5e;
    color: #f43f5e;
    width: 12px;
    height: 12px;
    animation: pulse 0.7s infinite;
  }
  .blip-label {
    display: none;
    position: absolute;
    bottom: 100%;
    white-space: nowrap;
    font-size: 0.55rem;
    padding: 1px 4px;
    background: rgba(0, 0, 0, 0.9);
    border: 1px solid #475569;
    border-radius: 3px;
    color: #e2e8f0;
    pointer-events: none;
  }
  .radar-blip:hover .blip-label, .radar-blip.selected .blip-label { display: block; }

  .radar-legend {
    display: flex;
    gap: 0.5rem;
    font-size: 0.6rem;
    color: #94a3b8;
    align-items: center;
    flex-wrap: wrap;
  }
  .legend-item { display: flex; align-items: center; gap: 3px; }
  .legend-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
  .legend-item.player .legend-dot { background: #10b981; }
  .legend-item.npc .legend-dot { background: #f59e0b; }
  .legend-item.enemy .legend-dot { background: #ef4444; }
  .radar-metric { margin-left: auto; color: #38bdf8; }

  /* Wiretap Dossier */
  .wiretap-dossier {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .wiretap-empty {
    padding: 1.5rem;
    background: rgba(15, 23, 42, 0.6);
    border: 1px dashed rgba(6, 182, 212, 0.3);
    border-radius: 0.375rem;
    text-align: center;
    color: #64748b;
  }
  .empty-icon { font-size: 1.5rem; display: block; margin-bottom: 0.25rem; }
  .empty-title { font-size: 0.75rem; font-weight: bold; color: #94a3b8; margin: 0 0 4px 0; }
  .empty-desc { font-size: 0.65rem; line-height: 1.4; margin: 0; }

  .dossier-card {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(6, 182, 212, 0.6);
    border-radius: 0.375rem;
    padding: 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: 0 0 15px rgba(6, 182, 212, 0.1);
  }
  .dossier-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(6, 182, 212, 0.25);
    padding-bottom: 0.25rem;
  }
  .dossier-lock { font-size: 0.65rem; font-weight: 800; color: #38bdf8; letter-spacing: 0.08em; }
  .btn-dossier-dismiss { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 0.75rem; }
  .btn-dossier-dismiss:hover { color: #ef4444; }

  .dossier-name-row { display: flex; justify-content: space-between; align-items: baseline; }
  .dossier-name { font-size: 0.85rem; font-weight: 700; color: #f8fafc; margin: 0; }
  .dossier-coords { font-size: 0.65rem; color: #94a3b8; }
  .dossier-meta { font-size: 0.65rem; color: #cbd5e1; display: flex; gap: 4px; }

  /* Subconscious Telemetry */
  .subconscious-box {
    background: rgba(8, 14, 26, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.25rem;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .subconscious-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.65rem;
    font-weight: 700;
    color: #38bdf8;
    text-transform: uppercase;
  }
  .sse-status { font-size: 0.55rem; color: #10b981; font-weight: normal; }

  .emotion-meter-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.375rem 0.625rem;
  }
  .meter-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.6rem;
    color: #cbd5e1;
    margin-bottom: 2px;
  }
  .meter-track {
    height: 5px;
    background: #1e293b;
    border-radius: 3px;
    overflow: hidden;
  }
  .meter-fill { height: 100%; border-radius: 3px; }
  .meter-fill.conf { background: #10b981; }
  .meter-fill.stress { background: #f59e0b; }
  .meter-fill.anger { background: #ef4444; }
  .meter-fill.grat { background: #818cf8; }

  .personality-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: 0.25rem;
    border-top: 1px dashed rgba(148, 163, 184, 0.2);
  }
  .pers-badge { font-size: 0.6rem; color: #a78bfa; font-weight: 600; }
  .pers-motto { font-size: 0.6rem; color: #94a3b8; font-style: italic; }

  .thoughts-box {
    padding-top: 0.25rem;
    border-top: 1px dashed rgba(148, 163, 184, 0.2);
  }
  .thoughts-label { font-size: 0.6rem; font-weight: 700; color: #e2e8f0; display: block; margin-bottom: 2px; }
  .thoughts-list { margin: 0; padding-left: 1rem; font-size: 0.6rem; color: #cbd5e1; font-style: italic; }

  /* Orbital Commands */
  .orbital-command-box {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-top: 0.25rem;
    border-top: 1px solid rgba(6, 182, 212, 0.25);
  }
  .orbital-title { font-size: 0.65rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; }
  .orbital-btns {
    display: flex;
    gap: 0.375rem;
  }
  .btn-orbital {
    flex: 1;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: all 0.15s;
  }
  .btn-orbital.strike {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .btn-orbital.strike:hover { background: rgba(239, 68, 68, 0.4); }
  .btn-orbital.supply {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #6ee7b7;
  }
  .btn-orbital.supply:hover { background: rgba(16, 185, 129, 0.4); }

  .whisper-input-row {
    display: flex;
    gap: 0.25rem;
    margin-top: 2px;
  }
  .godseye-whisper-input {
    flex: 1;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 0.65rem;
    color: #f8fafc;
  }
  .godseye-whisper-input:focus { border-color: #38bdf8; outline: none; }
  .btn-send-whisper {
    padding: 3px 8px;
    background: #0369a1;
    border: 1px solid #0284c7;
    color: #e0f2fe;
    border-radius: 4px;
    font-size: 0.65rem;
    cursor: pointer;
  }
  .btn-send-whisper:hover { background: #0284c7; }

  /* Threat Matrix Card */
  .threat-matrix-card {
    background: rgba(8, 14, 26, 0.7);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.375rem;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .threat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .threat-title { font-size: 0.65rem; font-weight: 700; color: #f87171; text-transform: uppercase; }
  .threat-status-tag { font-size: 0.55rem; color: #94a3b8; }
  .threat-list { display: flex; flex-direction: column; gap: 0.25rem; }
  .threat-item {
    display: flex;
    gap: 0.375rem;
    font-size: 0.62rem;
    padding: 3px 6px;
    border-radius: 3px;
    line-height: 1.3;
  }
  .threat-item.critical {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
  .threat-item.warning {
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fde68a;
  }
  .threat-clear { font-size: 0.625rem; color: #10b981; margin: 0; }

  /* Hub Bar Colossus button */
  .btn-hub.colossus {
    border-color: rgba(239, 68, 68, 0.4);
    background: rgba(239, 68, 68, 0.08);
    color: #fca5a5;
  }
  .btn-hub.colossus:hover, .btn-hub.colossus.active {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  /* Underworld Navigation Tabs */
  .underworld-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem 0;
    border-bottom: 1px solid rgba(245, 158, 11, 0.2);
    overflow-x: auto;
  }
  .underworld-tab {
    flex: 1;
    min-width: fit-content;
    padding: 0.3rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    border-radius: 0.25rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.6);
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.15s ease-out;
    white-space: nowrap;
  }
  .underworld-tab:hover {
    color: #e2e8f0;
    border-color: rgba(245, 158, 11, 0.4);
    background: rgba(245, 158, 11, 0.1);
  }
  .underworld-tab.active {
    background: rgba(245, 158, 11, 0.2);
    border-color: #f59e0b;
    color: #fef08a;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.2);
  }

  /* Bounty Deck & Cards Grid */
  .bounty-deck {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .bounty-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .bounty-intro strong {
    font-size: 0.75rem;
    color: #fef08a;
    display: block;
  }
  .bounty-intro p {
    margin: 0;
    font-size: 0.625rem;
    color: #94a3b8;
  }
  .btn-refresh-bounties {
    font-size: 0.625rem;
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid #f59e0b;
    border-radius: 0.25rem;
    color: #fef08a;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-refresh-bounties:hover {
    background: rgba(245, 158, 11, 0.4);
  }
  .bounty-result-banner, .fence-result-banner, .defense-result-card, .loot-result-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    font-size: 0.6875rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
  }
  .bounty-result-banner.success, .fence-result-banner.success {
    background: rgba(16, 185, 129, 0.2);
    border-color: #10b981;
    color: #a7f3d0;
  }
  .btn-dismiss-alert {
    margin-left: auto;
    background: transparent;
    border: none;
    color: currentColor;
    cursor: pointer;
    font-size: 0.75rem;
    opacity: 0.7;
  }
  .btn-dismiss-alert:hover { opacity: 1; }
  .bounty-cards-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    max-height: 340px;
    overflow-y: auto;
  }
  .bounty-card {
    padding: 0.5rem 0.6rem;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    transition: all 0.15s;
  }
  .bounty-card:hover {
    border-color: rgba(245, 158, 11, 0.4);
  }
  .bounty-card.accepted {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }
  .bounty-card.completed {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.08);
    opacity: 0.8;
  }
  .bounty-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .bounty-target-info {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .bounty-icon { font-size: 1.1rem; }
  .bounty-target-name {
    display: block;
    font-size: 0.75rem;
    color: #f8fafc;
  }
  .bounty-board-tag {
    display: block;
    font-size: 0.5625rem;
    color: #94a3b8;
  }
  .bounty-badges {
    display: flex;
    gap: 0.25rem;
    align-items: center;
  }
  .bounty-badge {
    font-size: 0.5625rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.04em;
  }
  .bounty-badge.contract.alive {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #6ee7b7;
  }
  .bounty-badge.contract.dead {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .bounty-badge.diff {
    background: rgba(148, 163, 184, 0.2);
    color: #cbd5e1;
  }
  .bounty-badge.diff.easy { color: #86efac; }
  .bounty-badge.diff.medium { color: #fde047; }
  .bounty-badge.diff.hard { color: #fb923c; }
  .bounty-badge.diff.elite { color: #f43f5e; font-weight: 900; }

  .bounty-crime {
    margin: 0;
    font-size: 0.65rem;
    color: #cbd5e1;
    line-height: 1.3;
    font-style: italic;
  }
  .bounty-hint {
    font-size: 0.6rem;
    color: #93c5fd;
  }
  .bounty-rewards-row {
    display: flex;
    gap: 0.5rem;
    font-size: 0.625rem;
    font-weight: 700;
  }
  .bounty-reward.gold { color: #facc15; }
  .bounty-reward.xp { color: #a78bfa; }
  .bounty-reward.rep { color: #38bdf8; }

  .bounty-action-buttons {
    margin-top: 2px;
  }
  .btn-accept-bounty {
    width: 100%;
    padding: 0.25rem 0.5rem;
    background: linear-gradient(135deg, #d97706, #b45309);
    border: 1px solid #f59e0b;
    border-radius: 0.25rem;
    color: #fef08a;
    font-size: 0.65rem;
    font-weight: 800;
    cursor: pointer;
  }
  .btn-accept-bounty:hover { filter: brightness(1.15); }
  .turnin-btn-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
  }
  .btn-turnin {
    padding: 0.25rem 0.35rem;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: center;
  }
  .btn-turnin.alive {
    background: rgba(16, 185, 129, 0.25);
    border: 1px solid #10b981;
    color: #a7f3d0;
  }
  .btn-turnin.alive:hover { background: rgba(16, 185, 129, 0.45); }
  .btn-turnin.dead {
    background: rgba(239, 68, 68, 0.25);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .btn-turnin.dead:hover { background: rgba(239, 68, 68, 0.45); }
  .bounty-status-done {
    display: block;
    text-align: center;
    font-size: 0.625rem;
    font-weight: 800;
    color: #10b981;
    padding: 2px 0;
  }

  /* Silas the Shadow Fence Deck */
  .fence-deck {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .fence-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .fence-header strong {
    font-size: 0.75rem;
    color: #fed7aa;
  }
  .fence-icon { font-size: 1.2rem; }
  .fence-sub {
    margin: 0;
    font-size: 0.625rem;
    color: #94a3b8;
    font-style: italic;
  }
  .fence-section {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .fence-sec-title {
    font-size: 0.65rem;
    font-weight: 700;
    color: #e2e8f0;
    text-transform: uppercase;
  }
  .fence-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
  }
  .btn-fence-sell, .btn-fence-buy {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0.5rem;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 0.375rem;
    font-size: 0.65rem;
    color: #e2e8f0;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
  }
  .btn-fence-sell:hover {
    border-color: #facc15;
    background: rgba(250, 204, 21, 0.1);
  }
  .btn-fence-buy:hover {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
  }
  .fence-price {
    font-weight: 800;
    color: #4ade80;
  }
  .fence-cost {
    font-weight: 800;
    color: #facc15;
  }
  .btn-fence-buy small {
    display: block;
    font-size: 0.55rem;
    color: #94a3b8;
    font-weight: normal;
  }

  /* Town Living Schedules Deck */
  .schedules-deck {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .schedules-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .schedules-header strong {
    font-size: 0.75rem;
    color: #fef08a;
  }
  .schedules-sub {
    margin: 0;
    font-size: 0.625rem;
    color: #94a3b8;
  }
  .phase-buttons-row {
    display: flex;
    gap: 0.2rem;
    flex-wrap: wrap;
  }
  .btn-phase {
    padding: 2px 6px;
    font-size: 0.58rem;
    font-weight: 700;
    border-radius: 3px;
    cursor: pointer;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.8);
    color: #cbd5e1;
    transition: all 0.15s;
  }
  .btn-phase.dawn { border-color: #f59e0b; color: #fde68a; }
  .btn-phase.day { border-color: #eab308; color: #fef08a; }
  .btn-phase.dusk { border-color: #f97316; color: #fdba74; }
  .btn-phase.night { border-color: #8b5cf6; color: #c4b5fd; }
  .btn-phase.midnight { border-color: #3b82f6; color: #93c5fd; }
  .btn-phase:hover { filter: brightness(1.3); transform: translateY(-1px); }

  .schedules-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    max-height: 320px;
    overflow-y: auto;
  }
  .schedule-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.375rem;
  }
  .schedule-card.sleeping {
    border-color: rgba(99, 102, 241, 0.4);
    background: rgba(30, 27, 75, 0.35);
  }
  .schedule-card-left {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 130px;
  }
  .sched-icon { font-size: 1rem; }
  .sched-name {
    font-size: 0.6875rem;
    color: #f1f5f9;
    display: block;
  }
  .sched-role {
    font-size: 0.5625rem;
    color: #94a3b8;
    display: block;
  }
  .schedule-card-center {
    flex: 1;
    font-size: 0.625rem;
    color: #e2e8f0;
  }
  .schedule-card-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .sched-coords {
    font-size: 0.5625rem;
    color: #64748b;
    font-family: monospace;
  }
  .sched-badge {
    font-size: 0.5625rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .sched-badge.sleep {
    background: rgba(99, 102, 241, 0.25);
    border: 1px solid #818cf8;
    color: #c7d2fe;
  }
  .sched-badge.nocturnal {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .sched-badge.awake {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #86efac;
  }

  /* Safehouse Stash Vault & Trophy Wall Styles */
  .safehouse-vault-card, .trophy-rack-card, .safehouse-guard-card {
    margin-top: 0.45rem;
    padding: 0.45rem 0.6rem;
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(16, 185, 129, 0.4);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .vault-header, .trophy-header, .guard-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .vault-icon, .trophy-icon { font-size: 1rem; }
  .vault-header strong, .trophy-header strong {
    font-size: 0.72rem;
    color: #a7f3d0;
  }
  .vault-gold {
    font-size: 0.65rem;
    font-weight: 800;
    color: #facc15;
    margin-left: 0.5rem;
  }
  .vault-controls-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .btn-vault-action {
    padding: 2px 6px;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 3px;
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #a7f3d0;
    cursor: pointer;
  }
  .btn-vault-action:hover {
    background: rgba(16, 185, 129, 0.4);
  }
  .btn-vault-action.stash {
    background: rgba(56, 189, 248, 0.2);
    border-color: #38bdf8;
    color: #bae6fd;
  }
  .vault-items-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    border-top: 1px dashed rgba(16, 185, 129, 0.3);
    padding-top: 0.3rem;
  }
  .vault-item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.65rem;
    color: #f1f5f9;
  }
  .btn-vault-retrieve {
    padding: 1px 5px;
    font-size: 0.58rem;
    font-weight: 700;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
    border-radius: 3px;
    cursor: pointer;
  }
  .btn-vault-retrieve:hover { background: rgba(239, 68, 68, 0.4); }

  .trophies-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.3rem;
  }
  .trophy-item-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.45rem;
    background: rgba(245, 158, 11, 0.15);
    border: 1px solid rgba(245, 158, 11, 0.4);
    border-radius: 0.25rem;
  }
  .trophy-badge-icon { font-size: 1rem; }
  .trophy-badge-text {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .trophy-badge-text strong {
    font-size: 0.65rem;
    color: #fef08a;
  }
  .trophy-badge-text small {
    font-size: 0.55rem;
    color: #cbd5e1;
  }
  .btn-rm-trophy {
    background: transparent;
    border: none;
    color: #f87171;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .no-trophies-hint {
    margin: 0;
    font-size: 0.6rem;
    color: #94a3b8;
    font-style: italic;
  }
  .trophy-mount-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }
  .btn-mount-opt {
    padding: 2px 6px;
    font-size: 0.58rem;
    font-weight: 700;
    background: rgba(234, 179, 8, 0.2);
    border: 1px solid #eab308;
    color: #fef08a;
    border-radius: 3px;
    cursor: pointer;
  }
  .btn-mount-opt:hover { background: rgba(234, 179, 8, 0.4); }

  .safehouse-guard-card {
    border-color: rgba(56, 189, 248, 0.4);
  }
  .guard-header {
    justify-content: space-between;
    font-size: 0.6875rem;
    color: #bae6fd;
  }
  .btn-station-guard {
    width: 100%;
    padding: 0.25rem;
    font-size: 0.625rem;
    font-weight: 700;
    background: rgba(14, 165, 233, 0.25);
    border: 1px solid #0ea5e9;
    color: #e0f2fe;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .btn-station-guard:hover { background: rgba(14, 165, 233, 0.45); }

  /* Ashveil Colossus Apex Raid & Planet Mado Deck */
  .colossus-deck {
    margin: 0.5rem 0.5rem 0.75rem 0.5rem;
    padding: 0.75rem;
    background: #0d090a;
    border: 2px solid #ef4444;
    border-radius: 0.5rem;
    box-shadow: 0 4px 25px rgba(239, 68, 68, 0.3);
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }
  .colossus-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid rgba(239, 68, 68, 0.3);
    padding-bottom: 0.45rem;
  }
  .colossus-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .colossus-icon { font-size: 1.5rem; }
  .colossus-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .colossus-title strong {
    font-size: 0.85rem;
    color: #fca5a5;
    letter-spacing: 0.05em;
  }
  .colossus-badge {
    font-size: 0.6rem;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(239, 68, 68, 0.25);
    border: 1px solid #ef4444;
    color: #fee2e2;
  }
  .colossus-badge.phase-2 {
    background: rgba(245, 158, 11, 0.3);
    border-color: #f59e0b;
    color: #fef08a;
  }
  .colossus-badge.phase-3 {
    background: rgba(168, 85, 247, 0.3);
    border-color: #a855f7;
    color: #f3e8ff;
    animation: pulse 0.7s infinite;
  }
  .colossus-sub {
    margin: 2px 0 0 0;
    font-size: 0.6rem;
    color: #94a3b8;
  }
  .colossus-header-actions {
    display: flex;
    gap: 0.3rem;
  }
  .btn-colossus-telegraph-test {
    font-size: 0.6rem;
    font-weight: 700;
    padding: 3px 6px;
    background: rgba(239, 68, 68, 0.3);
    border: 1px solid #ef4444;
    color: #fecaca;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .btn-colossus-telegraph-test:hover { background: rgba(239, 68, 68, 0.5); }
  .btn-colossus-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .btn-colossus-close:hover { color: #ef4444; }

  /* Boss Global HP Bar */
  .colossus-hp-section {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .colossus-hp-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: #fca5a5;
  }
  .colossus-hp-track {
    height: 12px;
    background: #1e1012;
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 4px;
    overflow: hidden;
  }
  .colossus-hp-fill {
    height: 100%;
    background: linear-gradient(90deg, #dc2626, #ef4444);
    transition: width 200ms ease-out;
  }
  .colossus-hp-fill.phase-2 {
    background: linear-gradient(90deg, #ea580c, #f59e0b);
  }
  .colossus-hp-fill.phase-3 {
    background: linear-gradient(90deg, #9333ea, #c084fc);
  }

  /* Active Defense QTE Prompt */
  .active-defense-prompt {
    padding: 0.6rem 0.75rem;
    background: linear-gradient(135deg, rgba(69, 10, 10, 0.95), rgba(120, 53, 15, 0.95));
    border: 2px solid #fbbf24;
    border-radius: 0.375rem;
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .active-defense-prompt.pulse {
    animation: cry-shake 0.4s ease-in-out infinite alternate;
  }
  .telegraph-top {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .telegraph-icon { font-size: 1.4rem; }
  .telegraph-text { flex: 1; }
  .telegraph-text strong {
    font-size: 0.8rem;
    color: #fef08a;
    display: block;
  }
  .telegraph-text p {
    margin: 0;
    font-size: 0.65rem;
    color: #fed7aa;
  }
  .telegraph-damage-badge {
    font-size: 0.7rem;
    font-weight: 900;
    color: #fee2e2;
    background: rgba(220, 38, 38, 0.6);
    border: 1px solid #ef4444;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .defense-actions-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }
  .btn-act-def {
    padding: 0.4rem 0.3rem;
    font-size: 0.65rem;
    font-weight: 900;
    border-radius: 0.25rem;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.12s;
    text-align: center;
  }
  .btn-act-def.parry {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    border-color: #38bdf8;
    color: #e0f2fe;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
  }
  .btn-act-def.parry:hover {
    filter: brightness(1.25);
    transform: scale(1.03);
  }
  .btn-act-def.dodge {
    background: linear-gradient(135deg, #059669, #047857);
    border-color: #34d399;
    color: #ecfdf5;
  }
  .btn-act-def.dodge:hover {
    filter: brightness(1.25);
    transform: scale(1.03);
  }
  .btn-act-def.block {
    background: linear-gradient(135deg, #475569, #334155);
    border-color: #94a3b8;
    color: #f8fafc;
  }
  .btn-act-def.block:hover {
    filter: brightness(1.25);
    transform: scale(1.03);
  }

  .defense-result-card.perfect {
    background: rgba(14, 165, 233, 0.25);
    border-color: #38bdf8;
    color: #e0f2fe;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
  }

  /* Planet Mado Multi-Limb Grid */
  .limbs-deck {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .limbs-title {
    font-size: 0.6875rem;
    font-weight: 700;
    color: #fca5a5;
    text-transform: uppercase;
  }
  .limbs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 0.4rem;
  }
  .limb-card {
    padding: 0.45rem;
    background: rgba(24, 14, 16, 0.85);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    transition: all 0.15s;
  }
  .limb-card.broken {
    opacity: 0.5;
    border-color: rgba(100, 116, 139, 0.3);
    background: rgba(15, 23, 42, 0.4);
  }
  .limb-header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .limb-icon { font-size: 1rem; }
  .limb-name {
    font-size: 0.65rem;
    color: #f8fafc;
    display: block;
  }
  .limb-broken-badge {
    font-size: 0.5rem;
    font-weight: 800;
    color: #86efac;
  }
  .limb-broken-badge.broken { color: #f87171; }
  .limb-hp-track {
    height: 5px;
    background: #200f12;
    border-radius: 2px;
    overflow: hidden;
  }
  .limb-hp-fill {
    height: 100%;
    background: #ef4444;
    transition: width 150ms ease-out;
  }
  .limb-hp-text {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.58rem;
    color: #cbd5e1;
  }
  .btn-strike-limb {
    padding: 1px 5px;
    font-size: 0.58rem;
    font-weight: 800;
    background: rgba(220, 38, 38, 0.4);
    border: 1px solid #ef4444;
    color: #fee2e2;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-strike-limb:hover {
    background: rgba(220, 38, 38, 0.8);
    transform: scale(1.05);
  }

  /* Colossus Victory Deck */
  .colossus-victory-deck {
    padding: 0.65rem 0.75rem;
    background: linear-gradient(135deg, rgba(120, 53, 15, 0.95), rgba(20, 83, 45, 0.95));
    border: 2px solid #fbbf24;
    border-radius: 0.375rem;
    box-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .victory-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .victory-banner strong {
    font-size: 0.82rem;
    color: #fef08a;
  }
  .victory-banner p {
    margin: 0;
    font-size: 0.65rem;
    color: #d1fae5;
  }
  .btn-claim-colossus-loot {
    width: 100%;
    padding: 0.4rem;
    background: linear-gradient(135deg, #d97706, #059669);
    border: 1px solid #facc15;
    border-radius: 0.25rem;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(250, 204, 21, 0.4);
    transition: all 0.15s;
  }
  .btn-claim-colossus-loot:hover {
    filter: brightness(1.2);
    transform: translateY(-1px);
  }

  /* Hub Buttons for 6 New Systems */
  .btn-hub.workshop { border-color: #f59e0b; }
  .btn-hub.workshop.active { background: rgba(245, 158, 11, 0.25); }
  .btn-hub.catacombs { border-color: #06b6d4; }
  .btn-hub.catacombs.active { background: rgba(6, 182, 212, 0.25); }
  .btn-hub.territory { border-color: #ef4444; }
  .btn-hub.territory.active { background: rgba(239, 68, 68, 0.25); }
  .btn-hub.forensics { border-color: #8b5cf6; }
  .btn-hub.forensics.active { background: rgba(139, 92, 246, 0.25); }
  .btn-hub.voicecombat { border-color: #ec4899; }
  .btn-hub.voicecombat.active { background: rgba(236, 72, 153, 0.25); }
  .btn-hub.matrix { border-color: #10b981; }
  .btn-hub.matrix.active { background: rgba(16, 185, 129, 0.25); }

  /* Shared Deck Styling */
  .matrix-modal-card,
  .workshop-deck,
  .catacomb-deck,
  .territory-deck,
  .forensic-deck,
  .voice-combat-deck {
    margin: 0.5rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.5rem;
    background: #0f172a;
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  }

  .matrix-modal-card { border-color: #10b981; box-shadow: 0 0 15px rgba(16, 185, 129, 0.2); }
  .workshop-deck { border-color: #f59e0b; box-shadow: 0 0 15px rgba(245, 158, 11, 0.2); }
  .catacomb-deck { border-color: #06b6d4; box-shadow: 0 0 15px rgba(6, 182, 212, 0.2); }
  .territory-deck { border-color: #ef4444; box-shadow: 0 0 15px rgba(239, 68, 68, 0.2); }
  .forensic-deck { border-color: #8b5cf6; box-shadow: 0 0 15px rgba(139, 92, 246, 0.2); }
  .voice-combat-deck { border-color: #ec4899; box-shadow: 0 0 15px rgba(236, 72, 153, 0.2); }

  .deck-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .deck-brand {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
  }
  .deck-icon { font-size: 1.3rem; }
  .deck-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .deck-title strong {
    font-size: 0.82rem;
    color: #f8fafc;
    letter-spacing: 0.03em;
  }
  .deck-badge {
    font-size: 0.6rem;
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    font-weight: 700;
  }
  .deck-sub {
    margin: 0.15rem 0 0 0;
    font-size: 0.65rem;
    color: #94a3b8;
  }
  .deck-actions {
    display: flex;
    gap: 0.35rem;
  }
  .btn-deck-refresh,
  .btn-deck-close {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #cbd5e1;
    font-size: 0.68rem;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-deck-refresh:hover,
  .btn-deck-close:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  /* Shared Alert Cards */
  .alert-result-card {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    padding: 0.45rem 0.6rem;
    border-radius: 0.375rem;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid var(--border);
  }
  .alert-result-card.success {
    border-color: #10b981;
    background: rgba(6, 78, 59, 0.4);
  }
  .alert-result-card.fail {
    border-color: #ef4444;
    background: rgba(127, 29, 29, 0.4);
  }
  .alert-text {
    flex: 1;
  }
  .alert-text strong {
    font-size: 0.72rem;
    color: #f1f5f9;
  }
  .alert-text p {
    margin: 0.1rem 0 0 0;
    font-size: 0.68rem;
    color: #cbd5e1;
  }
  .btn-dismiss-alert {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.75rem;
  }
  .btn-dismiss-alert:hover { color: #fff; }

  /* Feature Flags Matrix */
  .flag-matrix-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.4rem;
  }
  .flag-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .flag-card.enabled {
    border-left: 3px solid #10b981;
  }
  .flag-card.disabled {
    border-left: 3px solid #ef4444;
    opacity: 0.75;
  }
  .flag-info {
    flex: 1;
  }
  .flag-title-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .flag-name {
    font-size: 0.72rem;
    font-weight: 700;
    color: #f8fafc;
  }
  .flag-status-pill {
    font-size: 0.58rem;
    padding: 1px 4px;
    border-radius: 3px;
    font-weight: 700;
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
    border: 1px solid #ef4444;
  }
  .flag-status-pill.active {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border-color: #10b981;
  }
  .flag-desc {
    margin: 0.1rem 0 0 0;
    font-size: 0.63rem;
    color: #94a3b8;
    line-height: 1.2;
  }
  .btn-toggle-flag {
    padding: 0.25rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    border-radius: 0.25rem;
    cursor: pointer;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
    transition: all 0.12s;
  }
  .btn-toggle-flag.is-active {
    background: rgba(16, 185, 129, 0.2);
    border-color: #10b981;
    color: #6ee7b7;
  }
  .btn-toggle-flag:hover {
    filter: brightness(1.2);
    transform: translateY(-1px);
  }

  /* Bastion Workshop */
  .workshop-tabs {
    display: flex;
    gap: 0.35rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.35rem;
  }
  .tab-btn {
    flex: 1;
    padding: 0.3rem 0.4rem;
    font-size: 0.65rem;
    font-weight: 700;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.25rem;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.12s;
  }
  .tab-btn.active {
    background: rgba(245, 158, 11, 0.25);
    border-color: #f59e0b;
    color: #fef08a;
  }
  .section-lead {
    font-size: 0.65rem;
    color: #cbd5e1;
    margin-bottom: 0.4rem;
  }
  .runes-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .rune-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
  }
  .rune-card.socketed {
    border-color: #fbbf24;
    background: rgba(120, 53, 15, 0.25);
  }
  .rune-badge { font-size: 1.2rem; }
  .rune-details { flex: 1; }
  .rune-header-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .rune-header-row strong {
    font-size: 0.72rem;
    color: #f8fafc;
  }
  .rune-slot-tag {
    font-size: 0.55rem;
    padding: 1px 3px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    color: #94a3b8;
  }
  .rune-bonus {
    display: block;
    font-size: 0.625rem;
    color: #34d399;
    font-weight: 600;
  }
  .btn-socket,
  .btn-unsocket {
    padding: 0.25rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .btn-socket {
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid #f59e0b;
    color: #fde68a;
  }
  .btn-unsocket {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
  }
  .alembic-active-banner,
  .alembic-idle-banner {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.6rem;
    border-radius: 0.375rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.68rem;
    color: #cbd5e1;
    margin-bottom: 0.5rem;
  }
  .alembic-active-banner {
    background: rgba(16, 185, 129, 0.15);
    border-color: #10b981;
  }
  .alembic-info { flex: 1; }
  .alembic-info strong { display: block; color: #f8fafc; font-size: 0.72rem; }
  .ready-badge { color: #34d399; font-weight: 800; font-size: 0.625rem; }
  .time-badge { color: #fbbf24; font-size: 0.625rem; }
  .btn-collect-alembic {
    padding: 0.3rem 0.6rem;
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 0.25rem;
    background: #10b981;
    color: #fff;
    border: none;
    cursor: pointer;
  }
  .btn-collect-alembic:disabled { opacity: 0.4; cursor: not-allowed; }
  .recipes-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }
  .recipe-card {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.45rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
  }
  .recipe-icon { font-size: 1.1rem; }
  .recipe-meta { flex: 1; min-width: 0; }
  .recipe-meta strong { display: block; font-size: 0.68rem; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .recipe-meta p { margin: 0; font-size: 0.58rem; color: #94a3b8; line-height: 1.1; }
  .btn-brew {
    padding: 0.2rem 0.4rem;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 0.25rem;
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid #f59e0b;
    color: #fef08a;
    cursor: pointer;
    white-space: nowrap;
  }
  .active-dispatches-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.5rem;
  }
  .dispatch-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
  }
  .dispatch-card.completed {
    border-color: #10b981;
    background: rgba(6, 78, 59, 0.2);
  }
  .dispatch-icon { font-size: 1.1rem; }
  .dispatch-meta { flex: 1; }
  .dispatch-meta strong { display: block; font-size: 0.72rem; color: #f8fafc; }
  .dispatch-runner { font-size: 0.6rem; color: #94a3b8; }
  .dispatch-progress-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.1rem; }
  .dispatch-done-badge { font-size: 0.58rem; color: #34d399; font-weight: 800; }
  .dispatch-timer { font-size: 0.58rem; color: #fbbf24; }
  .dispatch-rewards { font-size: 0.58rem; color: #e2e8f0; }
  .btn-claim-dispatch {
    padding: 0.25rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    background: #10b981;
    color: #fff;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .in-transit-badge {
    font-size: 0.6rem;
    color: #fbbf24;
    background: rgba(245, 158, 11, 0.15);
    padding: 2px 4px;
    border-radius: 3px;
  }
  .dispatch-launch-bar {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .launch-title { font-size: 0.65rem; color: #94a3b8; font-weight: 600; }
  .launch-buttons { display: flex; flex-direction: column; gap: 0.25rem; }
  .btn-launch-mission {
    padding: 0.3rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 700;
    text-align: left;
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.25rem;
    color: #f1f5f9;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-launch-mission:hover {
    background: rgba(245, 158, 11, 0.25);
    border-color: #f59e0b;
  }

  /* Catacombs */
  .catacomb-input-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .input-label { font-size: 0.65rem; color: #94a3b8; }
  .input-group {
    display: flex;
    gap: 0.35rem;
  }
  .input-group input {
    flex: 1;
    background: #090d16;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.25rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.72rem;
    color: #f8fafc;
  }
  .btn-manifest-catacomb {
    padding: 0.35rem 0.6rem;
    background: linear-gradient(135deg, #0284c7, #06b6d4);
    border: 1px solid #38bdf8;
    border-radius: 0.25rem;
    color: #fff;
    font-size: 0.68rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-manifest-catacomb:disabled { opacity: 0.4; cursor: not-allowed; }
  .prompt-presets {
    display: flex;
    gap: 0.3rem;
  }
  .btn-preset {
    font-size: 0.58rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    padding: 2px 5px;
    color: #cbd5e1;
    cursor: pointer;
  }
  .btn-preset:hover { background: rgba(6, 182, 212, 0.2); border-color: #06b6d4; }
  .dungeon-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
  .dungeon-banner {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 0.5rem 0.6rem;
    background: rgba(6, 182, 212, 0.1);
    border: 1px solid #06b6d4;
    border-radius: 0.375rem;
  }
  .dungeon-theme-tag {
    font-size: 0.58rem;
    font-weight: 800;
    color: #38bdf8;
    background: rgba(2, 132, 199, 0.25);
    padding: 1px 4px;
    border-radius: 2px;
  }
  .dungeon-banner h3 {
    margin: 0.2rem 0 0 0;
    font-size: 0.82rem;
    color: #f8fafc;
  }
  .dungeon-prompt {
    margin: 0.1rem 0 0 0;
    font-size: 0.625rem;
    color: #94a3b8;
    font-style: italic;
  }
  .dungeon-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
    font-size: 0.625rem;
    color: #cbd5e1;
  }
  .rooms-track {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .room-card {
    padding: 0.45rem 0.6rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .room-card.cleared {
    opacity: 0.7;
    border-left: 3px solid #10b981;
  }
  .room-card.boss {
    border-color: #f59e0b;
    background: rgba(120, 53, 15, 0.25);
  }
  .room-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .room-num { font-size: 0.65rem; color: #94a3b8; font-weight: 700; }
  .boss-tag { font-size: 0.58rem; color: #fbbf24; font-weight: 800; }
  .cleared-tag { font-size: 0.58rem; color: #34d399; font-weight: 800; }
  .room-title { margin: 0; font-size: 0.75rem; color: #f8fafc; }
  .elevation-indicator {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.6rem;
    color: #94a3b8;
  }
  .elevation-indicator strong { color: #f8fafc; }
  .trap-pill { color: #f87171; background: rgba(239, 68, 68, 0.15); padding: 1px 4px; border-radius: 2px; }
  .chest-pill { color: #fbbf24; background: rgba(245, 158, 11, 0.15); padding: 1px 4px; border-radius: 2px; }
  .room-sensory {
    margin: 0;
    font-size: 0.65rem;
    color: #cbd5e1;
    font-style: italic;
    line-height: 1.25;
  }
  .btn-clear-room {
    align-self: flex-start;
    padding: 0.25rem 0.55rem;
    font-size: 0.65rem;
    font-weight: 700;
    background: linear-gradient(135deg, #0284c7, #06b6d4);
    border: 1px solid #38bdf8;
    border-radius: 0.25rem;
    color: #fff;
    cursor: pointer;
  }

  /* Territory Wars */
  .districts-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
  .district-card {
    padding: 0.5rem 0.6rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .district-card.martial-law {
    border-color: #ef4444;
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
  }
  .district-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .district-header h4 { margin: 0.15rem 0 0 0; font-size: 0.78rem; color: #f8fafc; }
  .faction-controller-badge {
    font-size: 0.58rem;
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 2px;
  }
  .faction-controller-badge.syndicate { background: rgba(239, 68, 68, 0.25); color: #f87171; border: 1px solid #ef4444; }
  .faction-controller-badge.watch { background: rgba(59, 130, 246, 0.25); color: #60a5fa; border: 1px solid #3b82f6; }
  .faction-controller-badge.cult { background: rgba(168, 85, 247, 0.25); color: #c084fc; border: 1px solid #a855f7; }
  .faction-controller-badge.contested { background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid #f59e0b; }
  .tax-tag { font-size: 0.625rem; color: #94a3b8; }
  .tax-tag strong { color: #fbbf24; }
  .district-desc { margin: 0; font-size: 0.65rem; color: #cbd5e1; line-height: 1.2; }
  .influence-bars {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .influence-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.6rem;
  }
  .influence-item span { width: 110px; font-weight: 600; }
  .influence-item.syndicate span { color: #f87171; }
  .influence-item.watch span { color: #60a5fa; }
  .influence-item.cult span { color: #c084fc; }
  .influence-item .meter-bar {
    flex: 1;
    height: 4px;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 2px;
    overflow: hidden;
  }
  .influence-item.syndicate .fill { height: 100%; background: #ef4444; }
  .influence-item.watch .fill { height: 100%; background: #3b82f6; }
  .influence-item.cult .fill { height: 100%; background: #a855f7; }
  .martial-law-notice {
    font-size: 0.625rem;
    font-weight: 800;
    color: #fca5a5;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    padding: 2px 5px;
    border-radius: 3px;
  }
  .influence-actions {
    display: flex;
    gap: 0.3rem;
  }
  .btn-inf {
    flex: 1;
    padding: 0.25rem 0.35rem;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.12s;
  }
  .btn-inf.syndicate { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; }
  .btn-inf.watch { background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; }
  .btn-inf.cult { background: rgba(168, 85, 247, 0.2); border: 1px solid #a855f7; color: #d8b4fe; }
  .btn-inf:hover { filter: brightness(1.2); }

  /* Forensic Mysteries */
  .cases-selector {
    display: flex;
    gap: 0.3rem;
    overflow-x: auto;
  }
  .case-btn {
    padding: 0.35rem 0.55rem;
    font-size: 0.68rem;
    font-weight: 700;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.25rem;
    color: #cbd5e1;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    white-space: nowrap;
  }
  .case-btn.active {
    background: rgba(139, 92, 246, 0.25);
    border-color: #8b5cf6;
    color: #e9d5ff;
  }
  .case-status-badge {
    font-size: 0.55rem;
    padding: 1px 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.1);
  }
  .case-dossier {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .dossier-header h3 { margin: 0; font-size: 0.85rem; color: #f8fafc; }
  .victim-tag { font-size: 0.65rem; color: #f87171; font-weight: 700; }
  .case-summary { margin: 0.15rem 0 0 0; font-size: 0.68rem; color: #cbd5e1; line-height: 1.25; }
  .section-title { margin: 0.2rem 0; font-size: 0.72rem; color: #c4b5fd; font-weight: 700; }
  .clues-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
  }
  .clue-card {
    padding: 0.35rem 0.45rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .clue-card.analyzed { border-color: #8b5cf6; }
  .clue-header { display: flex; justify-content: space-between; align-items: center; }
  .clue-header strong { font-size: 0.68rem; color: #f8fafc; }
  .dusted-pill { font-size: 0.55rem; color: #a78bfa; background: rgba(139, 92, 246, 0.2); padding: 1px 3px; border-radius: 2px; }
  .clue-desc { margin: 0; font-size: 0.6rem; color: #94a3b8; line-height: 1.2; }
  .btn-dust-clue {
    align-self: flex-start;
    padding: 0.2rem 0.4rem;
    font-size: 0.6rem;
    font-weight: 700;
    background: rgba(139, 92, 246, 0.2);
    border: 1px solid #8b5cf6;
    border-radius: 0.25rem;
    color: #ddd6fe;
    cursor: pointer;
  }
  .suspects-grid {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .suspect-card {
    padding: 0.45rem 0.55rem;
    background: rgba(30, 41, 59, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .suspect-card.confessed {
    border-color: #10b981;
    background: rgba(6, 78, 59, 0.2);
  }
  .suspect-header { display: flex; justify-content: space-between; align-items: center; }
  .suspect-header strong { font-size: 0.72rem; color: #f8fafc; }
  .suspect-role { font-size: 0.6rem; color: #94a3b8; }
  .suspicion-tag { font-size: 0.6rem; color: #fbbf24; font-weight: 700; }
  .suspect-alibi { margin: 0; font-size: 0.65rem; color: #cbd5e1; font-style: italic; }
  .confession-banner { font-size: 0.625rem; font-weight: 800; color: #34d399; background: rgba(16, 185, 129, 0.2); padding: 2px 4px; border-radius: 2px; }
  .suspect-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .btn-interrogate,
  .btn-trial-accuse,
  .btn-accept-bribe {
    padding: 0.2rem 0.4rem;
    font-size: 0.6rem;
    font-weight: 700;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .btn-interrogate.pressure { background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fef08a; }
  .btn-interrogate.evidence { background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; }
  .btn-trial-accuse { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; }
  .btn-accept-bribe { background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #6ee7b7; }

  /* Voice Combat */
  .resonance-pill {
    display: inline-block;
    margin-top: 0.2rem;
    font-size: 0.625rem;
    font-weight: 800;
    color: #f472b6;
    background: rgba(236, 72, 153, 0.2);
    border: 1px solid #ec4899;
    padding: 1px 5px;
    border-radius: 3px;
  }
  .spells-grid,
  .squad-commands-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem;
    margin-bottom: 0.4rem;
  }
  .btn-spell-chip,
  .btn-squad-chip {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.5rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.375rem;
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s;
  }
  .btn-spell-chip.fire { border-color: #ef4444; }
  .btn-spell-chip.frost { border-color: #06b6d4; }
  .btn-spell-chip.barrier { border-color: #3b82f6; }
  .btn-spell-chip.shadow { border-color: #a855f7; }
  .btn-spell-chip:hover,
  .btn-squad-chip:hover {
    filter: brightness(1.25);
    transform: translateY(-1px);
  }
  .spell-icon,
  .companion-avatar { font-size: 1.2rem; }
  .spell-info,
  .squad-cmd-info { flex: 1; min-width: 0; }
  .spell-info strong,
  .squad-cmd-info strong { display: block; font-size: 0.72rem; color: #f8fafc; }
  .spell-sub,
  .cmd-effect { display: block; font-size: 0.58rem; color: #94a3b8; line-height: 1.1; }
  .custom-spell-row {
    display: flex;
    gap: 0.35rem;
  }
  .custom-spell-row input {
    flex: 1;
    background: #090d16;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.25rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.72rem;
    color: #f8fafc;
  }
  .btn-cast-custom {
    padding: 0.3rem 0.6rem;
    font-size: 0.68rem;
    font-weight: 700;
    background: linear-gradient(135deg, #ec4899, #8b5cf6);
    border: 1px solid #f472b6;
    border-radius: 0.25rem;
    color: #fff;
    cursor: pointer;
  }
  .btn-cast-custom:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
