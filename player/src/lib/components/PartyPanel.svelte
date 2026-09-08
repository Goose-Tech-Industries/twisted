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

  onMount(() => {
    void social.loadParty()
    if (character.active?.id) {
      void companion.load(character.active.id)
    }
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
  </div>

  <!-- Underworld Encounters Drawer -->
  {#if showUnderworldDrawer}
    <div class="underworld-drawer">
      <div class="drawer-header">
        <span class="drawer-title">🏮 Lowtown & Underworld Shadows</span>
        <button type="button" class="btn-spot-stalker" onclick={() => voiceChat.spotStalker(1)}>
          👁️ Spot Stalker
        </button>
      </div>

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

      <!-- Cascading Tavern Brawl Trigger -->
      <div class="brawl-card">
        <div class="brawl-header">
          <span class="brawl-icon">🍻</span>
          <div class="brawl-title">
            <strong>The Rusty Anchor Tavern</strong>
            <span class="brawl-sub">Rowdy Sailors & Cutthroats</span>
          </div>
        </div>
        <button
          type="button"
          class="btn-cascade-brawl"
          onclick={() => voiceChat.cascadeBrawl(1)}
          title="Slam a table and fling a tankard to trigger a full-scale tavern brawl!"
        >
          💥 Trigger Tavern Brawl Cascade
        </button>
      </div>
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
                </div>
              </div>
            {/if}
          </div>
        {/each}
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
  .btn-spot-stalker { font-size: 0.6875rem; font-weight: 600; padding: 0.2rem 0.45rem; background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; border-radius: 0.25rem; color: #fef08a; cursor: pointer; }
  .btn-spot-stalker:hover { background: rgba(245, 158, 11, 0.4); }

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
</style>
