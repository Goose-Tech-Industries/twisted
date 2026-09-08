<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { api } from '$phoenix/api'
  import { audio } from '$stores/audio.svelte'
  import type { Character } from '$stores/character.svelte'

  interface Props {
    character: Character | null
    charId: number
  }
  let { character, charId }: Props = $props()

  // Tab navigation
  let activeTab = $state<'party' | 'social_deduction'>('party')

  // Available modes from backend
  let partyModes = $state<any[]>([])
  let socialRoles = $state<any[]>([])
  let isLoading = $state(false)
  let errorMessage = $state<string | null>(null)

  // Room state
  let currentRoom = $state<any | null>(null)
  let roomCodeInput = $state('')
  let selectedModeKey = $state('cah')
  let customRounds = $state(8)
  let joinAsSpectator = $state(false)
  let customName = $state('')
  let playerName = $derived(customName || character?.name || 'Adventurer')

  // In-Game submission / voting state
  let textSubmission = $state('')
  let isSubmitting = $state(false)
  let hasSubmitted = $state(false)
  let hasVoted = $state(false)

  // Social Deduction state
  let revealedRole = $state(false)
  let myRole = $state<any | null>(null)
  let emergencyActive = $state(false)
  let activeSabotage = $state<string | null>(null)

  // Auto-polling interval for room updates
  let pollInterval: ReturnType<typeof setInterval> | null = null

  onMount(async () => {
    await fetchModesAndRoles()
  })

  onDestroy(() => {
    stopPolling()
  })

  async function fetchModesAndRoles() {
    try {
      isLoading = true
      errorMessage = null
      const modesResp: any = await api.get('/api/party-games/modes')
      if (modesResp?.ok && modesResp.modes) {
        partyModes = modesResp.modes
      }

      const rolesResp: any = await api.get('/api/social-deduction/roles')
      if (rolesResp?.ok && rolesResp.roles) {
        socialRoles = rolesResp.roles
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Failed to load game modes.'
    } finally {
      isLoading = false
    }
  }

  function startPolling(code: string) {
    stopPolling()
    pollInterval = setInterval(async () => {
      if (!currentRoom || !code) return
      try {
        const resp: any = await api.get(`/api/party-games/rooms/${code}`)
        if (resp?.ok && resp.room) {
          const prevPhase = currentRoom.phase
          currentRoom = resp.room
          currentRoom.players = resp.players || []

          if (prevPhase !== currentRoom.phase) {
            audio.play('card_flip')
            hasSubmitted = false
            hasVoted = false
          }
        }
      } catch (e) {
        // silent polling error
      }
    }, 2000)
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  async function handleCreateRoom() {
    try {
      isLoading = true
      errorMessage = null
      audio.play('click')

      const resp: any = await api.post('/api/party-games/rooms/create', {
        mode: selectedModeKey,
        player_id: charId,
        name: character?.name || playerName,
        rounds: customRounds
      })

      if (resp?.ok && resp.room) {
        audio.play('victory')
        await handleJoinRoomByCode(resp.room.code)
      } else {
        errorMessage = resp?.error || 'Failed to create room.'
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error creating room.'
    } finally {
      isLoading = false
    }
  }

  async function handleJoinRoomByCode(codeToJoin: string) {
    if (!codeToJoin.trim()) return
    try {
      isLoading = true
      errorMessage = null
      audio.play('click')

      const cleanCode = codeToJoin.trim().toUpperCase()
      const resp: any = await api.post('/api/party-games/rooms/join', {
        code: cleanCode,
        player_id: charId,
        name: character?.name || playerName,
        spectator: joinAsSpectator
      })

      if (resp?.ok) {
        audio.play('card')
        // Fetch full room data
        const roomResp: any = await api.get(`/api/party-games/rooms/${cleanCode}`)
        if (roomResp?.ok) {
          currentRoom = roomResp.room
          currentRoom.players = roomResp.players || []
          startPolling(cleanCode)
        }
      } else {
        errorMessage = resp?.error || 'Failed to join room.'
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error joining room.'
    } finally {
      isLoading = false
    }
  }

  async function handleStartGame() {
    if (!currentRoom) return
    try {
      audio.play('crit')
      const resp: any = await api.post(`/api/party-games/rooms/${currentRoom.code}/start`, {
        player_id: charId
      })
      if (resp?.ok) {
        currentRoom.phase = 'prompt'
        hasSubmitted = false
        hasVoted = false
      } else {
        errorMessage = resp?.error || 'Failed to start game.'
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error starting game.'
    }
  }

  async function handleAdvancePhase() {
    if (!currentRoom) return
    try {
      audio.play('click')
      const resp: any = await api.post(`/api/party-games/rooms/${currentRoom.code}/advance`, {})
      if (resp?.ok) {
        currentRoom.phase = resp.phase
        hasSubmitted = false
        hasVoted = false
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error advancing phase.'
    }
  }

  async function handleSubmitResponse() {
    if (!currentRoom || !textSubmission.trim()) return
    try {
      isSubmitting = true
      audio.play('card')
      const resp: any = await api.post(`/api/party-games/rooms/${currentRoom.code}/submit`, {
        player_id: charId,
        response: textSubmission.trim()
      })
      if (resp?.ok) {
        hasSubmitted = true
        textSubmission = ''
      } else {
        errorMessage = resp?.error || 'Failed to submit.'
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error submitting.'
    } finally {
      isSubmitting = false
    }
  }

  async function handleVote(submissionIndex: number) {
    if (!currentRoom || hasVoted) return
    try {
      audio.play('dice')
      const resp: any = await api.post(`/api/party-games/rooms/${currentRoom.code}/vote`, {
        player_id: charId,
        submission_index: submissionIndex
      })
      if (resp?.ok) {
        hasVoted = true
      } else {
        errorMessage = resp?.error || 'Failed to cast vote.'
      }
    } catch (e: any) {
      errorMessage = e?.message || 'Error voting.'
    }
  }

  function handleLeaveRoom() {
    stopPolling()
    currentRoom = null
    audio.play('flee')
  }

  function triggerEmergencyMeeting() {
    emergencyActive = true
    audio.play('stagger')
    setTimeout(() => {
      audio.play('crit')
    }, 400)
  }

  function pickRandomRole() {
    if (socialRoles.length > 0) {
      const idx = Math.floor(Math.random() * socialRoles.length)
      myRole = socialRoles[idx]
      revealedRole = false
      audio.play('card')
    }
  }

  const isHost = $derived(currentRoom && currentRoom.host_id === charId)
  const activeMode = $derived(partyModes.find(m => m.key === selectedModeKey))
</script>

<div class="party-hub">
  <!-- Header Bar -->
  <header class="hub-header">
    <div class="header-left">
      <h2 class="title">🎭 Party Games & Social Deduction</h2>
      <span class="subtitle">Jackbox & Among Us style multiplayer game rooms</span>
    </div>

    <div class="nav-tabs">
      <button
        class="tab-btn"
        class:active={activeTab === 'party'}
        onclick={() => { activeTab = 'party'; audio.play('click'); }}
      >
        🃏 Party Card Games
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'social_deduction'}
        onclick={() => {
          activeTab = 'social_deduction';
          audio.play('click');
          if (!myRole) pickRandomRole();
        }}
      >
        🚀 Social Deduction
      </button>
    </div>
  </header>

  {#if errorMessage}
    <div class="error-banner">
      <span>⚠️ {errorMessage}</span>
      <button class="dismiss-btn" onclick={() => errorMessage = null}>×</button>
    </div>
  {/if}

  <!-- TAB 1: PARTY GAMES (JACKBOX / CARDS AGAINST HUMANITY) -->
  {#if activeTab === 'party'}
    {#if !currentRoom}
      <!-- LOBBY BROWSER / ROOM CREATION -->
      <div class="lobby-grid">
        <!-- Left: Create Room -->
        <div class="card create-box">
          <h3 class="card-title">✨ Host a Game Room</h3>
          <p class="desc">Create a private game room and share the 4-letter code with your friends or party.</p>

          <div class="form-group">
            <label for="mode-select">Game Mode</label>
            <select id="mode-select" bind:value={selectedModeKey} class="select-input">
              {#each partyModes as mode}
                <option value={mode.key}>{mode.name}</option>
              {/each}
            </select>
          </div>

          {#if activeMode}
            <div class="mode-info-box">
              <span class="mode-badge">{activeMode.voting_type.toUpperCase()} VOTING</span>
              <p class="mode-desc">{activeMode.description}</p>
              <div class="mode-meta">
                <span>👥 {activeMode.min_players}-{activeMode.max_players} Players</span>
                <span>⏱️ {activeMode.rounds} Rounds</span>
                {#if activeMode.has_judge}<span>⚖️ Rotating Judge</span>{/if}
              </div>
            </div>
          {/if}

          <div class="form-row">
            <div class="form-group half">
              <label for="rounds-input">Rounds</label>
              <input id="rounds-input" type="number" min="3" max="20" bind:value={customRounds} class="text-input" />
            </div>
            <div class="form-group half">
              <label for="host-name">Host Name</label>
              <input id="host-name" type="text" placeholder={character?.name || 'Adventurer'} bind:value={customName} class="text-input" />
            </div>
          </div>

          <button class="btn btn-primary" onclick={handleCreateRoom} disabled={isLoading}>
            {isLoading ? 'Creating Room…' : '🚀 Create Game Room'}
          </button>
        </div>

        <!-- Right: Join Room -->
        <div class="card join-box">
          <h3 class="card-title">🔑 Join with Room Code</h3>
          <p class="desc">Enter the 4-character code displayed on the host's screen.</p>

          <div class="code-entry">
            <input
              type="text"
              maxlength="4"
              placeholder="CODE"
              bind:value={roomCodeInput}
              class="code-input"
              onkeydown={(e) => { if (e.key === 'Enter') handleJoinRoomByCode(roomCodeInput); }}
            />
          </div>

          <div class="form-group">
            <label for="player-name">Your Display Name</label>
            <input id="player-name" type="text" placeholder={character?.name || 'Adventurer'} bind:value={customName} class="text-input" />
          </div>

          <div class="spectator-toggle">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={joinAsSpectator} />
              <span>Join as Spectator / Audience (Vote only)</span>
            </label>
          </div>

          <button
            class="btn btn-secondary"
            onclick={() => handleJoinRoomByCode(roomCodeInput)}
            disabled={isLoading || !roomCodeInput.trim()}
          >
            Enter Room
          </button>
        </div>
      </div>
    {:else}
      <!-- ACTIVE ROOM VIEW -->
      <div class="active-room-view">
        <div class="room-top-bar">
          <div class="room-code-tag">
            <span class="label">ROOM CODE</span>
            <span class="code">{currentRoom.code}</span>
          </div>

          <div class="room-meta">
            <span class="mode-tag">🎮 {currentRoom.mode_info?.name || currentRoom.mode}</span>
            <span class="phase-tag">Phase: <strong>{currentRoom.phase.toUpperCase()}</strong></span>
            {#if currentRoom.round}
              <span class="round-tag">Round {currentRoom.round}</span>
            {/if}
          </div>

          <div class="room-actions">
            {#if isHost && currentRoom.status === 'waiting'}
              <button class="btn btn-success" onclick={handleStartGame}>▶ Start Game</button>
            {/if}
            {#if isHost && currentRoom.status === 'playing'}
              <button class="btn btn-secondary btn-sm" onclick={handleAdvancePhase}>⏭ Next Phase</button>
            {/if}
            <button class="btn btn-outline btn-sm" onclick={handleLeaveRoom}>Leave</button>
          </div>
        </div>

        <div class="game-stage-grid">
          <!-- Game Canvas / Phase Area -->
          <div class="stage-main">
            {#if currentRoom.phase === 'waiting'}
              <div class="waiting-screen">
                <div class="waiting-icon">⏳</div>
                <h3>Waiting for Host to Start...</h3>
                <p>Share the room code <strong>{currentRoom.code}</strong> with other players.</p>
                <div class="player-count">Players: {currentRoom.players?.length || 0}</div>
              </div>
            {:else if currentRoom.phase === 'prompt' || currentRoom.phase === 'submit'}
              <div class="prompt-screen">
                <div class="phase-header">
                  <span class="phase-title">ROUND {currentRoom.round}: SUBMISSION PHASE</span>
                  {#if currentRoom.time_remaining > 0}
                    <span class="timer-badge">⏱ {currentRoom.time_remaining}s</span>
                  {/if}
                </div>

                <!-- Prompt Card -->
                <div class="card prompt-card">
                  <span class="prompt-icon">📜</span>
                  <p class="prompt-text">
                    {currentRoom.prompt?.text || "The court jester was banished after presenting ______ to the high king."}
                  </p>
                </div>

                <!-- Submission Box -->
                {#if !hasSubmitted}
                  <div class="submission-box">
                    <input
                      type="text"
                      placeholder="Type your witty answer here..."
                      bind:value={textSubmission}
                      class="text-input"
                      onkeydown={(e) => { if (e.key === 'Enter') handleSubmitResponse(); }}
                    />
                    <button class="btn btn-primary" onclick={handleSubmitResponse} disabled={isSubmitting || !textSubmission.trim()}>
                      {isSubmitting ? 'Sending…' : 'Submit Answer'}
                    </button>
                  </div>
                {:else}
                  <div class="submitted-confirmation">
                    <span>✅ Answer submitted! Waiting for others to finish...</span>
                  </div>
                {/if}
              </div>
            {:else if currentRoom.phase === 'reveal' || currentRoom.phase === 'vote'}
              <div class="voting-screen">
                <div class="phase-header">
                  <span class="phase-title">VOTING ROUND: PICK YOUR FAVORITE</span>
                  {#if currentRoom.time_remaining > 0}
                    <span class="timer-badge">⏱ {currentRoom.time_remaining}s</span>
                  {/if}
                </div>

                <div class="submissions-grid">
                  {#each currentRoom.submissions || [] as sub, idx}
                    <div class="submission-card">
                      <div class="card-number">#{idx + 1}</div>
                      <p class="sub-text">{sub.text}</p>
                      {#if currentRoom.phase === 'vote'}
                        <button
                          class="vote-btn"
                          class:voted={hasVoted}
                          onclick={() => handleVote(sub.index !== undefined ? sub.index : idx)}
                          disabled={hasVoted}
                        >
                          {hasVoted ? 'Voted' : '🗳️ Vote This'}
                        </button>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {:else if currentRoom.phase === 'score' || currentRoom.phase === 'ended'}
              <div class="score-screen">
                <div class="victory-banner">
                  <h3>🏆 Round Results</h3>
                </div>
                <div class="leaderboard-table">
                  {#each currentRoom.players || [] as p, i}
                    <div class="player-rank-row" class:gold={i === 0}>
                      <span class="rank-pos">#{i + 1}</span>
                      <span class="rank-name">{p.name}</span>
                      <span class="rank-score">{p.score} pts</span>
                    </div>
                  {/each}
                </div>
                {#if isHost}
                  <button class="btn btn-primary next-round-btn" onclick={handleAdvancePhase}>
                    {currentRoom.phase === 'ended' ? 'Finished' : '▶ Next Round'}
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Right: Player Roster -->
          <div class="stage-sidebar">
            <h4 class="sidebar-title">👥 Roster ({currentRoom.players?.length || 0})</h4>
            <div class="roster-list">
              {#each currentRoom.players || [] as p}
                <div class="roster-item" class:self={p.player_id === charId}>
                  <span class="player-avatar">🧙</span>
                  <div class="player-details">
                    <span class="name">{p.name} {#if p.player_id === currentRoom.host_id}👑{/if}</span>
                    <span class="score-sub">{p.score || 0} pts</span>
                  </div>
                  {#if p.is_spectator}
                    <span class="spectator-badge">Audience</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- TAB 2: SOCIAL DEDUCTION (AMONG US / WEREWOLF) -->
  {#if activeTab === 'social_deduction'}
    <div class="social-deduction-view">
      <div class="emergency-hud">
        <button class="emergency-siren-btn" onclick={triggerEmergencyMeeting}>
          🚨 CALL EMERGENCY MEETING
        </button>

        {#if activeSabotage}
          <div class="sabotage-alert">
            <span>⚠️ CRITICAL SABOTAGE: {activeSabotage} (Repair Immediately!)</span>
          </div>
        {/if}
      </div>

      <div class="sd-grid">
        <!-- Secret Role Card -->
        <div class="card role-card">
          <h3 class="card-title">🕵️ Your Confidential Role</h3>
          <p class="role-hint">Keep this hidden from other crewmates at the table.</p>

          <button type="button" class="role-reveal-container" onclick={() => { revealedRole = !revealedRole; audio.play('card_flip'); }}>
            {#if revealedRole && myRole}
              <div class="role-revealed" class:impostor={myRole.team === 'impostor'}>
                <span class="team-tag">{myRole.team.toUpperCase()} TEAM</span>
                <h4 class="role-name">{myRole.name}</h4>
                <p class="role-desc">{myRole.description}</p>
                <div class="abilities-list">
                  <strong>Abilities:</strong>
                  {#each myRole.abilities || [] as ab}
                    <span class="ability-tag">✦ {ab}</span>
                  {/each}
                </div>
              </div>
            {:else}
              <div class="role-hidden">
                <span class="hidden-icon">🔒</span>
                <span>Click to Reveal Role</span>
              </div>
            {/if}
          </button>

          <button class="btn btn-secondary btn-sm" onclick={pickRandomRole}>
            🎲 Reroll Role (Debug/Practice)
          </button>
        </div>

        <!-- Role Catalog -->
        <div class="card roles-overview">
          <h3 class="card-title">📖 Operative Dossiers</h3>
          <p class="desc">Known roles active in social deduction matches:</p>
          <div class="roles-roster">
            {#each socialRoles as r}
              <div class="role-item" class:impostor-bg={r.team === 'impostor'}>
                <div class="role-header">
                  <strong>{r.name}</strong>
                  <span class="team-badge" class:impostor={r.team === 'impostor'}>{r.team}</span>
                </div>
                <p class="r-desc">{r.description}</p>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .party-hub {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.25rem;
    color: #e2e8f0;
    min-height: 580px;
    background: radial-gradient(circle at top right, #1a1e2e 0%, #0c0d12 100%);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .hub-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 1rem;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .title {
    font-size: 1.35rem;
    font-weight: 700;
    margin: 0;
    color: #f8fafc;
  }

  .subtitle {
    font-size: 0.85rem;
    color: #94a3b8;
  }

  .nav-tabs {
    display: flex;
    gap: 0.5rem;
  }

  .tab-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #94a3b8;
    padding: 0.5rem 0.9rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.85rem;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
  }

  .tab-btn.active {
    background: #3b82f6;
    color: #ffffff;
    border-color: #60a5fa;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #fca5a5;
    padding: 0.6rem 1rem;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .dismiss-btn {
    background: none;
    border: none;
    color: #fca5a5;
    font-size: 1.2rem;
    cursor: pointer;
  }

  /* Lobby Grid */
  .lobby-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.25rem;
  }

  @media (max-width: 768px) {
    .lobby-grid { grid-template-columns: 1fr; }
  }

  .card {
    background: rgba(18, 22, 34, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-title {
    font-size: 1.1rem;
    margin: 0;
    color: #f1f5f9;
  }

  .desc {
    font-size: 0.85rem;
    color: #94a3b8;
    margin: 0;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .form-group label {
    font-size: 0.8rem;
    color: #cbd5e1;
    font-weight: 600;
  }

  .form-row {
    display: flex;
    gap: 0.75rem;
  }

  .half { flex: 1; }

  .select-input, .text-input {
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: #f8fafc;
    padding: 0.5rem 0.75rem;
    font-size: 0.9rem;
    outline: none;
  }

  .select-input:focus, .text-input:focus {
    border-color: #3b82f6;
  }

  .mode-info-box {
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .mode-badge {
    align-self: flex-start;
    font-size: 0.65rem;
    background: #3b82f6;
    color: #fff;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
    font-weight: 700;
  }

  .mode-desc {
    font-size: 0.8rem;
    color: #cbd5e1;
    margin: 0;
  }

  .mode-meta {
    display: flex;
    gap: 0.75rem;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .code-entry {
    display: flex;
    justify-content: center;
    margin: 0.5rem 0;
  }

  .code-input {
    background: #000;
    border: 2px solid #3b82f6;
    border-radius: 8px;
    color: #fbbf24;
    font-size: 1.8rem;
    font-family: monospace;
    font-weight: 800;
    text-align: center;
    letter-spacing: 0.5rem;
    width: 200px;
    padding: 0.5rem;
  }

  .spectator-toggle {
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }

  .btn {
    border: none;
    border-radius: 8px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0.65rem 1.25rem;
  }

  .btn-primary { background: #3b82f6; color: #fff; }
  .btn-primary:hover { background: #2563eb; }
  .btn-secondary { background: #4f46e5; color: #fff; }
  .btn-secondary:hover { background: #4338ca; }
  .btn-success { background: #10b981; color: #fff; }
  .btn-success:hover { background: #059669; }
  .btn-outline { background: transparent; border: 1px solid rgba(255, 255, 255, 0.2); color: #cbd5e1; }
  .btn-outline:hover { background: rgba(255, 255, 255, 0.05); }
  .btn-sm { padding: 0.4rem 0.75rem; font-size: 0.8rem; }

  /* Active Room */
  .active-room-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .room-top-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: rgba(0, 0, 0, 0.4);
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .room-code-tag {
    display: flex;
    flex-direction: column;
  }

  .room-code-tag .label { font-size: 0.65rem; color: #94a3b8; font-weight: 700; }
  .room-code-tag .code { font-size: 1.4rem; font-family: monospace; font-weight: 900; color: #fbbf24; }

  .room-meta { display: flex; gap: 0.75rem; align-items: center; }
  .mode-tag, .phase-tag, .round-tag {
    font-size: 0.8rem;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
  }

  .game-stage-grid {
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 1rem;
  }

  @media (max-width: 800px) {
    .game-stage-grid { grid-template-columns: 1fr; }
  }

  .stage-main {
    background: rgba(14, 17, 26, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 1.5rem;
    min-height: 400px;
    display: flex;
    flex-direction: column;
  }

  .stage-sidebar {
    background: rgba(14, 17, 26, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 1rem;
  }

  .sidebar-title {
    font-size: 0.85rem;
    margin: 0 0 0.75rem 0;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .roster-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .roster-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
  }

  .roster-item.self {
    border: 1px solid rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.05);
  }

  .player-details { display: flex; flex-direction: column; flex: 1; }
  .player-details .name { font-size: 0.85rem; font-weight: 600; color: #f1f5f9; }
  .player-details .score-sub { font-size: 0.75rem; color: #fbbf24; }

  /* Prompt Card */
  .prompt-card {
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border: 2px solid #3b82f6;
    padding: 2rem;
    text-align: center;
    margin: 1.5rem 0;
  }

  .prompt-text {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.5;
    color: #f8fafc;
  }

  .submission-box {
    display: flex;
    gap: 0.75rem;
  }

  .submission-box input { flex: 1; }

  .submissions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }

  .submission-card {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .vote-btn {
    background: #10b981;
    color: #fff;
    border: none;
    border-radius: 6px;
    padding: 0.4rem;
    font-weight: 700;
    cursor: pointer;
  }

  .vote-btn.voted {
    background: #475569;
    cursor: default;
  }

  /* Social Deduction */
  .emergency-hud {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 1rem;
  }

  .emergency-siren-btn {
    background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%);
    color: #fff;
    font-size: 1.2rem;
    font-weight: 900;
    padding: 1rem 2rem;
    border-radius: 12px;
    border: 2px solid #f87171;
    cursor: pointer;
    box-shadow: 0 0 25px rgba(239, 68, 68, 0.4);
    transition: transform 0.1s;
  }

  .emergency-siren-btn:hover {
    transform: scale(1.03);
  }

  .sd-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .role-reveal-container {
    background: rgba(0, 0, 0, 0.6);
    border: 2px dashed rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 1rem;
  }

  .role-hidden {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .role-revealed {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .role-name {
    font-size: 1.5rem;
    margin: 0;
    color: #38bdf8;
  }

  .role-revealed.impostor .role-name {
    color: #ef4444;
  }

  .team-tag {
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05rem;
  }

  .roles-roster {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 380px;
    overflow-y: auto;
  }

  .role-item {
    background: rgba(255, 255, 255, 0.03);
    padding: 0.6rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .team-badge {
    font-size: 0.65rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    background: #3b82f6;
    color: #fff;
    text-transform: uppercase;
  }

  .team-badge.impostor {
    background: #ef4444;
  }
</style>
