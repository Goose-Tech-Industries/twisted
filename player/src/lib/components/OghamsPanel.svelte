<script lang="ts">
  import { onMount } from 'svelte'
  import { oghams, type Ogham, type OghamSlot } from '$stores/oghams.svelte'

  interface Props { charId: number }
  let { charId }: Props = $props()

  let editingSlot = $state<number | null>(null)
  let selectedOgham = $state<Ogham | null>(null)

  onMount(() => void oghams.load(charId))

  function oghamOf(id: number | null): Ogham | null {
    if (id === null) return null
    return oghams.library.find(o => o.id === id) ?? null
  }

  function pickFor(slot: number, ogham: Ogham | null) {
    void oghams.socket(slot, ogham?.id ?? null)
    editingSlot = null
    selectedOgham = null
  }

  function rankTitle(rank: number = 1): string {
    if (rank >= 3) return 'Bloodbound (Rank 3)'
    if (rank === 2) return 'Inscribed (Rank 2)'
    return 'Carved (Rank 1)'
  }

  // Active slotted oghams
  const slottedList = $derived(
    oghams.slots
      .map(s => ({ slot: s, ogham: oghamOf(s.ogham_id) }))
      .filter((x): x is { slot: OghamSlot; ogham: Ogham } => x.ogham !== null)
  )

  // Active family counts & set bonuses
  const activeSetBonuses = $derived.by(() => {
    const counts: Record<string, { count: number; ogham: Ogham }> = {}
    for (const item of slottedList) {
      const fam = item.ogham.family_name || 'Unbound'
      if (fam !== 'Unbound') {
        if (!counts[fam]) counts[fam] = { count: 0, ogham: item.ogham }
        counts[fam].count++
      }
    }
    return Object.entries(counts)
      .filter(([_, data]) => data.count >= (data.ogham.set_bonus?.min_count ?? 2) && data.ogham.set_bonus?.label)
      .map(([fam, data]) => ({ family: fam, count: data.count, bonus: data.ogham.set_bonus! }))
  })

  // Group library by family
  const groupedLibrary = $derived.by(() => {
    const map = new Map<string, { familyName: string; icon: string; setBonus?: string; list: Ogham[] }>()
    for (const o of oghams.library) {
      const fam = o.family_name || 'Unbound'
      if (!map.has(fam)) {
        map.set(fam, {
          familyName: fam,
          icon: o.family_icon || '🩸',
          setBonus: o.set_bonus?.label,
          list: []
        })
      }
      map.get(fam)!.list.push(o)
    }
    return Array.from(map.values())
  })
</script>

<div class="oghams-panel">
  <header class="panel-header">
    <div class="title-wrap">
      <h2>᚛ Blood Oghams</h2>
      <span class="sub">{slottedList.length} / {oghams.maxSlots} Runes Carved</span>
    </div>
    {#if activeSetBonuses.length > 0}
      <div class="active-synergies">
        {#each activeSetBonuses as syn}
          <span class="synergy-badge" title={syn.bonus.label}>
            ⚡ {syn.family} Synergy ({syn.count}x): {syn.bonus.label}
          </span>
        {/each}
      </div>
    {/if}
  </header>

  <!-- Active Weapon / Soul Grooves -->
  <section class="section">
    <h3 class="section-title">Active Sockets</h3>
    <div class="sockets-grid">
      {#each Array(oghams.maxSlots) as _, i}
        {@const slot = oghams.slots.find(s => s.index === i)}
        {@const ogh = oghamOf(slot?.ogham_id ?? null)}
        <div class="socket-card" class:socket-empty={!ogh} class:socket-active={!!ogh}>
          <div class="socket-header">
            <span class="socket-num">Groove #{i + 1}</span>
            {#if ogh}
              <span class="socket-rank">{rankTitle(slot?.current_rank ?? 1)}</span>
            {/if}
          </div>

          {#if ogh}
            <div class="socket-content">
              <span class="socket-glyph">{ogh.glyph}</span>
              <div class="socket-info">
                <div class="socket-name">{ogh.name}</div>
                <div class="socket-fam">{ogh.family_name || 'Unbound'}</div>
                {#if ogh.element_attack}
                  <span class="tag elem-tag">+{ogh.element_attack}</span>
                {/if}
                {#if ogh.on_hit_status}
                  <span class="tag proc-tag">{ogh.on_hit_chance ?? 20}% {ogh.on_hit_status}</span>
                {/if}
              </div>
            </div>

            <!-- AP / Kill Progress Bar -->
            <div class="ap-progress-wrap">
              <div class="ap-label">
                <span>Rune Power</span>
                <span>{slot?.kill_count ?? 0} / {ogh.kills_to_rank_up ?? 50} Kills</span>
              </div>
              <div class="ap-bar-track">
                <div
                  class="ap-bar-fill"
                  style="width: {Math.min(100, Math.round(((slot?.kill_count ?? 0) / (ogh.kills_to_rank_up ?? 50)) * 100))}%"
                ></div>
              </div>
            </div>

            <div class="socket-actions">
              <button class="btn-sm" onclick={() => editingSlot = editingSlot === i ? null : i}>
                Replace
              </button>
              <button class="btn-sm btn-danger" onclick={() => pickFor(i, null)}>
                Extract
              </button>
            </div>
          {:else}
            <div class="empty-groove">
              <span class="empty-icon">+</span>
              <p>Empty Socket</p>
              <button class="btn-sm btn-primary" onclick={() => editingSlot = editingSlot === i ? null : i}>
                Carve Ogham
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Modal / Picker if editing a socket -->
  {#if editingSlot !== null}
    <div
      class="modal-overlay"
      role="presentation"
      onclick={() => editingSlot = null}
      onkeydown={(e) => { if (e.key === 'Escape') editingSlot = null }}
    >
      <div
        class="modal-body"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        onclick={e => e.stopPropagation()}
        onkeydown={e => e.stopPropagation()}
      >
        <div class="modal-header">
          <h3>Carve Rune into Socket #{editingSlot + 1}</h3>
          <button class="btn-close" onclick={() => editingSlot = null}>✕</button>
        </div>
        <div class="modal-content">
          <button class="picker-item empty-opt" onclick={() => pickFor(editingSlot!, null)}>
            (Leave Socket Empty)
          </button>
          {#each oghams.library as o (o.id)}
            <button class="picker-item" onclick={() => pickFor(editingSlot!, o)}>
              <span class="picker-glyph">{o.glyph}</span>
              <div class="picker-details">
                <div class="picker-name">
                  {o.name} <span class="picker-fam">({o.family_name || 'Unbound'})</span>
                </div>
                <div class="picker-desc">{o.description}</div>
                <div class="picker-meta">
                  {#if o.element_attack}<span class="tag elem-tag">+{o.element_attack}</span>{/if}
                  {#if o.on_hit_status}<span class="tag proc-tag">{o.on_hit_chance}% {o.on_hit_status}</span>{/if}
                  {#if o.effects}
                    {#each Object.entries(o.effects) as [k, v]}
                      <span class="tag stat-tag">+{v} {k.toUpperCase()}</span>
                    {/each}
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}

  <!-- Rune Codex / Vault grouped by Family -->
  <section class="section vault-section">
    <h3 class="section-title">Ogham Library & Rune Families</h3>
    {#each groupedLibrary as group}
      <div class="family-card">
        <div class="family-header">
          <span class="family-icon">{group.icon}</span>
          <div class="family-title-wrap">
            <h4 class="family-name">{group.familyName}</h4>
            {#if group.setBonus}
              <div class="family-synergy-hint">
                <span class="synergy-label">Set Bonus (2+ Equipped):</span> {group.setBonus}
              </div>
            {/if}
          </div>
        </div>
        <div class="family-runes">
          {#each group.list as r (r.id)}
            {@const isSlotted = oghams.slots.some(s => s.ogham_id === r.id)}
            <div class="rune-card" class:is-slotted={isSlotted}>
              <div class="rune-top">
                <span class="rune-glyph">{r.glyph}</span>
                <span class="rune-name">{r.name}</span>
                {#if isSlotted}
                  <span class="slotted-indicator">Socketed</span>
                {/if}
              </div>
              <p class="rune-desc">{r.description}</p>
              <div class="rune-tags">
                {#if r.element_attack}<span class="tag elem-tag">+{r.element_attack}</span>{/if}
                {#if r.on_hit_status}<span class="tag proc-tag">{r.on_hit_chance}% {r.on_hit_status}</span>{/if}
                {#if r.effects}
                  {#each Object.entries(r.effects) as [k, v]}
                    <span class="tag stat-tag">+{v} {k.toUpperCase()}</span>
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </section>
</div>

<style>
  .oghams-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
    background: #0f1217;
    color: #e2e8f0;
    font-family: inherit;
    padding: 1rem;
    gap: 1.25rem;
  }

  .panel-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    padding-bottom: 0.75rem;
  }
  .title-wrap {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .title-wrap h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: #f1f5f9;
  }
  .sub {
    font-size: 0.8125rem;
    color: #94a3b8;
  }

  .active-synergies {
    margin-top: 0.5rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }
  .synergy-badge {
    background: rgba(234, 179, 8, 0.15);
    border: 1px solid rgba(234, 179, 8, 0.4);
    color: #fef08a;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
  }

  .section-title {
    margin: 0 0 0.625rem 0;
    font-size: 0.8125rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }

  /* Sockets Grid */
  .sockets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.75rem;
  }

  .socket-card {
    background: #181d26;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    transition: all 0.2s ease;
  }
  .socket-active {
    border-color: rgba(217, 119, 6, 0.5);
    box-shadow: inset 0 0 12px rgba(217, 119, 6, 0.08);
  }
  .socket-empty {
    border-style: dashed;
    background: rgba(255, 255, 255, 0.02);
  }

  .socket-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
  }
  .socket-num {
    color: #64748b;
    font-weight: 600;
  }
  .socket-rank {
    color: #fbbf24;
    font-weight: 600;
    font-size: 0.6875rem;
    background: rgba(251, 191, 36, 0.1);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .socket-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .socket-glyph {
    font-size: 2rem;
    color: #f59e0b;
    line-height: 1;
    filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4));
  }
  .socket-name {
    font-size: 0.9375rem;
    font-weight: 600;
    color: #f8fafc;
  }
  .socket-fam {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-bottom: 0.25rem;
  }

  .ap-progress-wrap {
    background: rgba(0, 0, 0, 0.25);
    border-radius: 4px;
    padding: 0.35rem 0.5rem;
  }
  .ap-label {
    display: flex;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: #94a3b8;
    margin-bottom: 0.2rem;
  }
  .ap-bar-track {
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }
  .ap-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #ef4444);
    transition: width 0.3s ease;
  }

  .socket-actions {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .empty-groove {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 0.5rem;
    text-align: center;
    gap: 0.375rem;
  }
  .empty-icon {
    font-size: 1.5rem;
    color: #64748b;
  }
  .empty-groove p {
    margin: 0;
    font-size: 0.8125rem;
    color: #64748b;
  }

  /* Buttons */
  .btn-sm {
    padding: 0.25rem 0.625rem;
    font-size: 0.75rem;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: #27303f;
    color: #f8fafc;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-sm:hover {
    background: #334155;
  }
  .btn-primary {
    background: #b45309;
    border-color: #d97706;
  }
  .btn-primary:hover {
    background: #d97706;
  }
  .btn-danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #fca5a5;
  }
  .btn-danger:hover {
    background: rgba(239, 68, 68, 0.3);
  }

  /* Tags */
  .tag {
    display: inline-block;
    font-size: 0.6875rem;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
    margin-right: 0.25rem;
    font-weight: 500;
  }
  .elem-tag { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); }
  .proc-tag { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.3); }
  .stat-tag { background: rgba(34, 197, 94, 0.2); color: #86efac; border: 1px solid rgba(34, 197, 94, 0.3); }

  /* Family Library Vault */
  .vault-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .family-card {
    background: #141820;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    padding: 0.875rem;
  }
  .family-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-bottom: 0.75rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding-bottom: 0.5rem;
  }
  .family-icon {
    font-size: 1.25rem;
  }
  .family-name {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: #f1f5f9;
  }
  .family-synergy-hint {
    font-size: 0.75rem;
    color: #94a3b8;
    margin-top: 0.1rem;
  }
  .synergy-label {
    color: #fbbf24;
    font-weight: 600;
  }

  .family-runes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.625rem;
  }
  .rune-card {
    background: #1a202c;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 0.625rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .rune-card.is-slotted {
    border-color: rgba(245, 158, 11, 0.5);
    background: rgba(245, 158, 11, 0.05);
  }
  .rune-top {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .rune-glyph {
    font-size: 1.25rem;
    color: #f59e0b;
  }
  .rune-name {
    font-weight: 600;
    font-size: 0.8125rem;
    color: #f8fafc;
    flex: 1;
  }
  .slotted-indicator {
    font-size: 0.625rem;
    background: #b45309;
    color: #fef3c7;
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-weight: 600;
  }
  .rune-desc {
    margin: 0;
    font-size: 0.75rem;
    color: #94a3b8;
    line-height: 1.3;
  }
  .rune-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.25rem;
  }

  /* Modal Picker */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .modal-body {
    background: #181d26;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  }
  .modal-header {
    padding: 0.75rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .modal-header h3 {
    margin: 0;
    font-size: 0.9375rem;
  }
  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1rem;
    cursor: pointer;
  }
  .modal-content {
    padding: 0.75rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }
  .picker-item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    background: #11151c;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    padding: 0.625rem;
    text-align: left;
    color: #f1f5f9;
    cursor: pointer;
    transition: background 0.15s;
  }
  .picker-item:hover {
    background: #1e2532;
    border-color: rgba(245, 158, 11, 0.4);
  }
  .picker-item.empty-opt {
    justify-content: center;
    color: #94a3b8;
    font-style: italic;
  }
  .picker-glyph {
    font-size: 1.5rem;
    color: #f59e0b;
    line-height: 1;
  }
  .picker-details {
    flex: 1;
  }
  .picker-name {
    font-weight: 600;
    font-size: 0.875rem;
  }
  .picker-fam {
    font-size: 0.75rem;
    color: #94a3b8;
    font-weight: 400;
  }
  .picker-desc {
    font-size: 0.75rem;
    color: #94a3b8;
    margin: 0.15rem 0 0.35rem 0;
  }
  .picker-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
</style>
