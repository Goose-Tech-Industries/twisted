<script lang="ts">
  import { onMount } from 'svelte'
  import { cards, type RealmCard, type DuelCard } from '$stores/cards.svelte'
  import { audio } from '$stores/audio.svelte'

  interface Props {
    charId: number
  }
  let { charId }: Props = $props()

  let activeTab = $state<'duel' | 'vault'>('duel')
  let selectedOpponent = $state<string>('Card Master')
  let prevFlippedCount = $state(0)

  const OPPONENTS = [
    { name: 'Tavern Gambler', diff: 'Novice', icon: '🍺' },
    { name: 'Card Master', diff: 'Adept', icon: '🃏' },
    { name: 'Highland Druid', diff: 'Expert', icon: '🌿' },
    { name: 'Astral Duelist', diff: 'Master', icon: '🌌' }
  ]

  onMount(() => {
    cards.loadCollection()
  })

  // Watch for flips and victory sounds
  $effect(() => {
    if (cards.lastFlipped.length > prevFlippedCount) {
      audio.play('card_flip')
      prevFlippedCount = cards.lastFlipped.length
    } else if (cards.lastFlipped.length === 0) {
      prevFlippedCount = 0
    }

    if (cards.status === 'completed') {
      if (cards.playerScore > cards.npcScore) {
        audio.play('victory')
      } else if (cards.npcScore > cards.playerScore) {
        audio.play('defeat')
      }
    }
  })

  function formatRank(val: number | undefined): string {
    if (!val) return '1'
    if (val >= 10) return 'A'
    return String(val)
  }

  function rarityClass(rarity: string | undefined): string {
    switch (rarity) {
      case 'legendary': return 'rarity-legendary'
      case 'epic': return 'rarity-epic'
      case 'rare': return 'rarity-rare'
      case 'uncommon': return 'rarity-uncommon'
      default: return 'rarity-common'
    }
  }

  function handleChallenge(npcName: string) {
    audio.play('click')
    selectedOpponent = npcName
    cards.challenge(npcName)
    activeTab = 'duel'
  }

  function handleCellClick(index: number) {
    if (cards.status !== 'active') return
    if (cards.board[index] !== null) return
    if (cards.selectedHandIndex === null) return
    audio.play('card')
    cards.placeCard(index)
  }
</script>

<div class="cards-panel">
  <header class="panel-header">
    <div class="header-left">
      <h2>🎴 Realm Cards</h2>
      <span class="subtitle">Tactical 3x3 Card Duels & Collection</span>
    </div>
    <div class="tab-switch">
      <button class="tab-btn" class:active={activeTab === 'duel'} onclick={() => activeTab = 'duel'}>
        Duel Arena
      </button>
      <button class="tab-btn" class:active={activeTab === 'vault'} onclick={() => activeTab = 'vault'}>
        Card Vault ({cards.collection.reduce((sum, c) => sum + c.quantity, 0)})
      </button>
    </div>
  </header>

  {#if cards.errorMsg}
    <div class="error-banner">
      <span>⚠️ {cards.errorMsg}</span>
    </div>
  {/if}

  {#if activeTab === 'duel'}
    <div class="duel-container">
      <!-- Match Status Bar -->
      <div class="match-status-bar">
        <div class="score-box player-score">
          <span class="score-label">YOU</span>
          <span class="score-value">{cards.playerScore}</span>
        </div>

        <div class="match-info">
          {#if cards.status === 'active'}
            <span class="status-pill active-pill">⚡ In Duel vs {cards.opponent}</span>
          {:else if cards.status === 'completed'}
            {#if cards.playerScore > cards.npcScore}
              <span class="status-pill win-pill">🏆 VICTORY!</span>
            {:else if cards.playerScore < cards.npcScore}
              <span class="status-pill loss-pill">💀 DEFEAT</span>
            {:else}
              <span class="status-pill draw-pill">🤝 DRAW</span>
            {/if}
          {:else}
            <span class="status-pill idle-pill">No Active Match</span>
          {/if}
        </div>

        <div class="score-box npc-score">
          <span class="score-label">{cards.opponent.toUpperCase()}</span>
          <span class="score-value">{cards.npcScore}</span>
        </div>
      </div>

      <!-- Match Result Reward Notification -->
      {#if cards.status === 'completed'}
        <div class="match-result-banner" class:result-win={cards.playerScore > cards.npcScore}>
          {#if cards.playerScore > cards.npcScore}
            <h4>Duel Won!</h4>
            {#if cards.rewardCard}
              <p class="reward-text">
                Captured Prize: <strong>{cards.rewardCard.icon} {cards.rewardCard.name}</strong> ({cards.rewardCard.rarity})
              </p>
            {:else}
              <p>You outmaneuvered the duelist!</p>
            {/if}
          {:else if cards.playerScore < cards.npcScore}
            <h4>Defeated</h4>
            <p>Your cards were claimed by {cards.opponent}.</p>
          {:else}
            <h4>Stalemate</h4>
            <p>A hard-fought tie on the arena grid.</p>
          {/if}
          <div class="result-actions">
            <button class="btn-action btn-primary" onclick={() => handleChallenge(selectedOpponent)}>
              Rematch
            </button>
            <button class="btn-action btn-secondary" onclick={() => cards.resetMatch()}>
              New Challenger
            </button>
          </div>
        </div>
      {/if}

      <!-- 3x3 Arena Board -->
      <div class="board-grid">
        {#each cards.board as cell, i}
          <button
            class="board-cell"
            class:cell-occupied={cell !== null}
            class:owner-player={cell?.owner === 'player'}
            class:owner-npc={cell?.owner === 'npc'}
            class:cell-targetable={cards.status === 'active' && cell === null && cards.selectedHandIndex !== null}
            onclick={() => handleCellClick(i)}
          >
            {#if cell}
              <div class="card-visual {rarityClass(cell.rarity)}">
                <span class="card-icon">{cell.icon}</span>
                <span class="card-name">{cell.name}</span>
                <div class="card-ranks">
                  <span class="rank rank-top">{formatRank(cell.value_top)}</span>
                  <div class="rank-row">
                    <span class="rank rank-left">{formatRank(cell.value_left)}</span>
                    <span class="rank-center">•</span>
                    <span class="rank rank-right">{formatRank(cell.value_right)}</span>
                  </div>
                  <span class="rank rank-bottom">{formatRank(cell.value_bottom)}</span>
                </div>
              </div>
            {:else}
              <div class="cell-empty-hint">
                {#if cards.status === 'active' && cards.selectedHandIndex !== null}
                  <span class="place-hint">Place Card</span>
                {:else}
                  <span class="empty-dot"></span>
                {/if}
              </div>
            {/if}
          </button>
        {/each}
      </div>

      <!-- Player Hand -->
      {#if cards.status === 'active'}
        <div class="hand-section">
          <div class="hand-header">
            <span>Your Duel Hand (Tap card to select):</span>
            {#if cards.selectedHandIndex !== null}
              <span class="hand-instruction">Now click an empty grid square above!</span>
            {/if}
          </div>

          <div class="hand-cards">
            {#each cards.hand as card, idx}
              <button
                class="hand-card-btn {rarityClass(card.rarity)}"
                class:selected={cards.selectedHandIndex === idx}
                onclick={() => cards.selectCard(idx)}
              >
                <span class="hand-card-icon">{card.icon}</span>
                <span class="hand-card-name">{card.name}</span>
                <div class="hand-ranks">
                  <span class="hrank hrank-t">{formatRank(card.value_top)}</span>
                  <div class="hrank-mid">
                    <span class="hrank hrank-l">{formatRank(card.value_left)}</span>
                    <span class="hrank-dot">·</span>
                    <span class="hrank hrank-r">{formatRank(card.value_right)}</span>
                  </div>
                  <span class="hrank hrank-b">{formatRank(card.value_bottom)}</span>
                </div>
              </button>
            {/each}
          </div>
        </div>
      {:else if cards.status === 'idle'}
        <div class="idle-challenge-box">
          <h3>Select a Duel Challenger</h3>
          <p>Wager your tactical wits on the 3x3 grid. Opposing edge values flip adjacent enemy cards!</p>
          <div class="opponent-list">
            {#each OPPONENTS as opp}
              <button class="opp-card" onclick={() => handleChallenge(opp.name)}>
                <span class="opp-icon">{opp.icon}</span>
                <div class="opp-info">
                  <div class="opp-name">{opp.name}</div>
                  <div class="opp-diff">Difficulty: {opp.diff}</div>
                </div>
                <span class="btn-challenge">Duel ➔</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Vault / Collection View -->
    <div class="vault-container">
      <div class="vault-hero">
        <div class="vault-summary">
          <h3>Your Card Vault</h3>
          <p>Defeat monsters, boss encounters, and card duelists to discover rare and legendary cards.</p>
        </div>
        <button class="btn-action btn-primary" onclick={() => handleChallenge('Card Master')}>
          Quick Duel ➔
        </button>
      </div>

      <!-- Card Grid -->
      <div class="vault-grid">
        {#each cards.collection as card (card.card_id)}
          <div class="vault-card {rarityClass(card.rarity)}">
            <div class="vcard-header">
              <span class="vcard-icon">{card.icon}</span>
              {#if card.quantity > 1}
                <span class="vcard-qty">x{card.quantity}</span>
              {/if}
            </div>
            <div class="vcard-name">{card.name}</div>
            <span class="vcard-rarity">{card.rarity}</span>

            <div class="vcard-ranks">
              <span class="vrank vrank-t">{formatRank(card.value_top)}</span>
              <div class="vrank-mid">
                <span class="vrank vrank-l">{formatRank(card.value_left)}</span>
                <span class="vrank-dot">·</span>
                <span class="vrank vrank-r">{formatRank(card.value_right)}</span>
              </div>
              <span class="vrank vrank-b">{formatRank(card.value_bottom)}</span>
            </div>

            {#if card.description}
              <p class="vcard-desc">{card.description}</p>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Duel Rules Guide -->
      <div class="rules-guide">
        <h4>Duel Rules & Mechanics</h4>
        <div class="rules-grid">
          <div class="rule-item">
            <strong>Orthogonal Flips</strong>
            <p>Placing a card attacks all 4 adjacent cards. If your touching edge is higher than their defending edge, their card flips to your color.</p>
          </div>
          <div class="rule-item">
            <strong>Same & Plus</strong>
            <p>Matching numbers or equal sums trigger combo flips across touching borders.</p>
          </div>
          <div class="rule-item">
            <strong>Elemental Tiles</strong>
            <p>Cards matching the tile element gain +1 to all ranks; mismatched elements suffer -1.</p>
          </div>
          <div class="rule-item">
            <strong>Victory Spoils</strong>
            <p>Win with 5 or more controlled tiles at end of match to claim a random card drop.</p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .cards-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: #0d1017;
    color: #e2e8f0;
    padding: 1rem;
    gap: 1rem;
    font-family: inherit;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .header-left h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f8fafc;
  }
  .subtitle {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .tab-switch {
    display: flex;
    background: #181f2b;
    border-radius: 6px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .tab-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 0.35rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn.active {
    background: #2563eb;
    color: #ffffff;
  }

  .error-banner {
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    color: #fca5a5;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.8125rem;
  }

  /* Duel Layout */
  .duel-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
  }

  .match-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    background: #141923;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.5rem 1rem;
  }
  .score-box {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .score-label {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .score-value {
    font-size: 1.5rem;
    font-weight: 800;
    line-height: 1.1;
  }
  .player-score .score-label, .player-score .score-value { color: #60a5fa; }
  .npc-score .score-label, .npc-score .score-value { color: #f87171; }

  .status-pill {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
  }
  .active-pill { background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
  .win-pill { background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.4); }
  .loss-pill { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); }
  .draw-pill { background: rgba(234, 179, 8, 0.2); color: #fef08a; border: 1px solid rgba(234, 179, 8, 0.4); }
  .idle-pill { background: rgba(255, 255, 255, 0.08); color: #94a3b8; }

  /* 3x3 Arena Grid */
  .board-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    width: 100%;
    max-width: 360px;
    aspect-ratio: 1 / 1;
    background: #111622;
    padding: 0.5rem;
    border-radius: 12px;
    border: 2px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  }

  .board-cell {
    aspect-ratio: 1 / 1;
    background: #18202d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: default;
    position: relative;
    padding: 0;
    transition: all 0.2s ease;
  }
  .board-cell.cell-targetable {
    cursor: pointer;
    border: 1px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.08);
  }
  .board-cell.cell-targetable:hover {
    background: rgba(59, 130, 246, 0.2);
    border-color: #60a5fa;
    transform: scale(1.02);
  }
  .board-cell.owner-player {
    border: 2px solid #3b82f6;
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(30, 58, 138, 0.4));
    box-shadow: 0 0 12px rgba(59, 130, 246, 0.3);
  }
  .board-cell.owner-npc {
    border: 2px solid #ef4444;
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(127, 29, 29, 0.4));
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.3);
  }

  .card-visual {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0.25rem;
  }
  .card-icon {
    font-size: 1.5rem;
    line-height: 1;
  }
  .card-name {
    font-size: 0.625rem;
    font-weight: 700;
    color: #f1f5f9;
    max-width: 90%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 0.1rem;
  }
  .card-ranks {
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: monospace;
    font-weight: 800;
    font-size: 0.6875rem;
    color: #fbbf24;
    line-height: 0.9;
    margin-top: 0.15rem;
  }
  .rank-row {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .rank-center {
    font-size: 0.5rem;
    color: #64748b;
  }

  .cell-empty-hint {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .place-hint {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #93c5fd;
  }
  .empty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Player Hand */
  .hand-section {
    width: 100%;
    background: #141923;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
  }
  .hand-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 0.5rem;
  }
  .hand-instruction {
    color: #fbbf24;
    font-weight: 600;
  }

  .hand-cards {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding-bottom: 0.25rem;
  }
  .hand-card-btn {
    flex: 0 0 72px;
    background: #1e2635;
    border: 2px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    padding: 0.35rem 0.25rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .hand-card-btn:hover {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.3);
  }
  .hand-card-btn.selected {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
    box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
    transform: translateY(-4px);
  }
  .hand-card-icon {
    font-size: 1.25rem;
  }
  .hand-card-name {
    font-size: 0.5625rem;
    font-weight: 700;
    color: #f1f5f9;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin: 0.1rem 0;
  }
  .hand-ranks {
    font-family: monospace;
    font-weight: 800;
    font-size: 0.625rem;
    color: #fbbf24;
    line-height: 0.9;
  }
  .hrank-mid {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }
  .hrank-dot {
    font-size: 0.5rem;
    color: #64748b;
  }

  /* Result Banner */
  .match-result-banner {
    width: 100%;
    background: #18202d;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0.875rem;
    text-align: center;
  }
  .match-result-banner.result-win {
    border-color: rgba(34, 197, 94, 0.5);
    background: rgba(34, 197, 94, 0.08);
  }
  .match-result-banner h4 {
    margin: 0;
    font-size: 1.125rem;
    color: #f8fafc;
  }
  .reward-text {
    color: #86efac;
    font-size: 0.8125rem;
    margin: 0.25rem 0 0.5rem 0;
  }
  .result-actions {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  /* Idle Challengers list */
  .idle-challenge-box {
    width: 100%;
    background: #141923;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
  }
  .idle-challenge-box h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1rem;
  }
  .idle-challenge-box p {
    margin: 0 0 1rem 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }
  .opponent-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .opp-card {
    display: flex;
    align-items: center;
    background: #1c2433;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    color: #f8fafc;
  }
  .opp-card:hover {
    background: #253043;
    border-color: #3b82f6;
  }
  .opp-icon {
    font-size: 1.5rem;
    margin-right: 0.75rem;
  }
  .opp-info {
    flex: 1;
    text-align: left;
  }
  .opp-name {
    font-weight: 700;
    font-size: 0.875rem;
  }
  .opp-diff {
    font-size: 0.6875rem;
    color: #94a3b8;
  }
  .btn-challenge {
    font-size: 0.75rem;
    font-weight: 700;
    color: #60a5fa;
  }

  /* Vault Styles */
  .vault-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .vault-hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #141923;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .vault-summary h3 {
    margin: 0;
    font-size: 1rem;
  }
  .vault-summary p {
    margin: 0.15rem 0 0 0;
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .vault-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.625rem;
  }
  .vault-card {
    background: #18202d;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.625rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .vcard-header {
    display: flex;
    justify-content: space-between;
    width: 100%;
    align-items: center;
  }
  .vcard-icon {
    font-size: 1.5rem;
  }
  .vcard-qty {
    font-size: 0.6875rem;
    font-weight: 700;
    color: #94a3b8;
    background: rgba(255, 255, 255, 0.06);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
  }
  .vcard-name {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #f8fafc;
    margin: 0.25rem 0 0.1rem 0;
  }
  .vcard-rarity {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .vcard-ranks {
    font-family: monospace;
    font-weight: 800;
    font-size: 0.75rem;
    color: #fbbf24;
    line-height: 1;
    background: rgba(0, 0, 0, 0.3);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    margin-bottom: 0.35rem;
  }
  .vrank-mid {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .vrank-dot {
    font-size: 0.5rem;
    color: #64748b;
  }
  .vcard-desc {
    margin: 0;
    font-size: 0.6875rem;
    color: #94a3b8;
    line-height: 1.2;
  }

  /* Rarity Colors */
  .rarity-common .vcard-rarity { color: #94a3b8; }
  .rarity-uncommon { border-color: rgba(34, 197, 94, 0.4); }
  .rarity-uncommon .vcard-rarity { color: #4ade80; }
  .rarity-rare { border-color: rgba(59, 130, 246, 0.4); }
  .rarity-rare .vcard-rarity { color: #60a5fa; }
  .rarity-epic { border-color: rgba(168, 85, 247, 0.4); }
  .rarity-epic .vcard-rarity { color: #c084fc; }
  .rarity-legendary {
    border-color: rgba(245, 158, 11, 0.6);
    box-shadow: inset 0 0 10px rgba(245, 158, 11, 0.1);
  }
  .rarity-legendary .vcard-rarity { color: #fbbf24; }

  /* Rules Guide */
  .rules-guide {
    background: #141923;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 1rem;
  }
  .rules-guide h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.875rem;
    color: #f1f5f9;
  }
  .rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }
  .rule-item strong {
    font-size: 0.75rem;
    color: #fbbf24;
    display: block;
    margin-bottom: 0.2rem;
  }
  .rule-item p {
    margin: 0;
    font-size: 0.6875rem;
    color: #94a3b8;
    line-height: 1.3;
  }

  /* Actions */
  .btn-action {
    padding: 0.35rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
    border: 1px solid transparent;
  }
  .btn-primary {
    background: #2563eb;
    color: #ffffff;
    border-color: #3b82f6;
  }
  .btn-primary:hover {
    background: #1d4ed8;
  }
  .btn-secondary {
    background: #27303f;
    color: #f8fafc;
    border-color: rgba(255, 255, 255, 0.1);
  }
  .btn-secondary:hover {
    background: #334155;
  }
</style>
