<script lang="ts">
  import { onMount } from 'svelte'
  import { api } from '$phoenix/api'
  import { character } from '$stores/character.svelte'
  import { notifications } from '$stores/notifications.svelte'

  interface SubclassInfo {
    id: number
    class_id: number
    name: string
    archetype_title: string
    description: string
    level_req: number
    icon: string
    passive_name: string
    passive_desc: string
    signature_ability: string
    stat_bonuses: Record<string, number>
  }

  interface Props {
    open: boolean
    charId: number
    classId: number
    className: string
    charLevel: number
    onClose: () => void
    onSpecializeSuccess?: (subclass: SubclassInfo) => void
  }

  let { open, charId, classId, className, charLevel, onClose, onSpecializeSuccess }: Props = $props()

  let subclasses = $state<SubclassInfo[]>([])
  let loading = $state(false)
  let selectedId = $state<number | null>(null)
  let submitting = $state(false)
  let errorMsg = $state<string | null>(null)

  $effect(() => {
    if (open && classId) {
      loadSubclasses(classId)
    }
  })

  async function loadSubclasses(cid: number) {
    loading = true
    errorMsg = null
    try {
      const res = await api.get<{ success: boolean; subclasses: SubclassInfo[] }>(`/api/subclasses?class_id=${cid}`)
      if (res.success && res.subclasses?.length) {
        subclasses = res.subclasses
        if (!selectedId && subclasses.length > 0) {
          selectedId = subclasses[0].id
        }
      } else {
        errorMsg = 'No archetypes found for this class.'
      }
    } catch (e) {
      errorMsg = (e as Error).message || 'Failed to load archetypes.'
    } finally {
      loading = false
    }
  }

  const selectedSubclass = $derived(subclasses.find(s => s.id === selectedId) ?? subclasses[0])

  async function confirmAscension() {
    if (!selectedId || submitting) return
    submitting = true
    errorMsg = null

    try {
      const res = await api.post<{ success: boolean; message: string; subclass: SubclassInfo }>(
        `/api/characters/${charId}/subclass`,
        { subclassId: selectedId }
      )

      if (res.success) {
        notifications.push('success', res.message || 'Ascension Complete!')
        await character.loadActive(charId)
        if (onSpecializeSuccess) {
          onSpecializeSuccess(res.subclass)
        }
        onClose()
      } else {
        errorMsg = res.message || 'Ascension failed.'
      }
    } catch (e) {
      errorMsg = (e as Error).message || 'Error completing ascension.'
    } finally {
      submitting = false
    }
  }
</script>

{#if open}
  <div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) onClose() }} role="presentation">
    <div class="ascension-card" role="dialog" aria-modal="true" aria-labelledby="ascension-title">
      <!-- Header -->
      <div class="modal-header">
        <div class="header-left">
          <span class="sacred-crest">⚜️</span>
          <div>
            <h2 id="ascension-title" class="ascension-heading">The Ascension Rite</h2>
            <p class="ascension-subheading">Level {charLevel} Milestone · Choose your {className} Specialization</p>
          </div>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">✕</button>
      </div>

      <!-- Main Body -->
      <div class="modal-body">
        {#if loading}
          <div class="loading-state">
            <div class="spinner"></div>
            <p>Communing with ancient class masters...</p>
          </div>
        {:else if errorMsg && subclasses.length === 0}
          <div class="error-box">
            <p>{errorMsg}</p>
            <button class="retry-btn" onclick={() => loadSubclasses(classId)}>Retry</button>
          </div>
        {:else}
          <div class="archetypes-grid">
            {#each subclasses as sub (sub.id)}
              <div
                class="archetype-card"
                class:active={selectedId === sub.id}
                onclick={() => (selectedId = sub.id)}
                role="button"
                tabindex="0"
                onkeydown={(e) => { if (e.key === 'Enter') selectedId = sub.id }}
              >
                <div class="arch-top">
                  <div class="arch-icon-box">{sub.icon || '⚡'}</div>
                  <div class="arch-titles">
                    <span class="arch-name">{sub.name}</span>
                    <span class="arch-tagline">{sub.archetype_title}</span>
                  </div>
                  {#if selectedId === sub.id}
                    <span class="chosen-badge">✓ Selected</span>
                  {/if}
                </div>

                <p class="arch-desc">{sub.description}</p>

                <!-- Signature Passive Feature -->
                <div class="feature-block passive">
                  <div class="feature-label">
                    <span class="feat-type">🌟 PASSIVE AURA</span>
                    <span class="feat-name">{sub.passive_name}</span>
                  </div>
                  <p class="feat-desc">{sub.passive_desc}</p>
                </div>

                <!-- Signature Active Skill -->
                <div class="feature-block active-skill">
                  <div class="feature-label">
                    <span class="feat-type">⚔️ SIGNATURE ABILITY</span>
                    <span class="feat-name">{sub.signature_ability}</span>
                  </div>
                </div>

                <!-- Stat Boosts -->
                {#if sub.stat_bonuses && Object.keys(sub.stat_bonuses).length > 0}
                  <div class="stat-pill-row">
                    {#each Object.entries(sub.stat_bonuses) as [stat, val]}
                      {#if val > 0}
                        <span class="stat-pill">+{val} {stat.toUpperCase()}</span>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer & Action -->
      <div class="modal-footer">
        {#if errorMsg && subclasses.length > 0}
          <p class="footer-error">{errorMsg}</p>
        {/if}

        <div class="footer-info">
          {#if selectedSubclass}
            <span class="chosen-summary">
              Commit to <strong>{selectedSubclass.name}</strong> ({selectedSubclass.archetype_title})
            </span>
          {/if}
        </div>

        <div class="action-buttons">
          <button type="button" class="btn-cancel" onclick={onClose}>Ponder Later</button>
          <button
            type="button"
            class="btn-ascend"
            disabled={submitting || !selectedId}
            onclick={confirmAscension}
          >
            {#if submitting}
              Awakening...
            {:else}
              ✨ Awaken Archetype
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(4, 5, 8, 0.88);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem;
    animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ascension-card {
    background: radial-gradient(circle at 50% 0%, #1c1712 0%, #0d0e12 100%);
    border: 1px solid #c9a14a;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(201, 161, 74, 0.2);
    border-radius: 12px;
    width: 100%;
    max-width: 1040px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e5edf5;
    animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.75rem;
    background: linear-gradient(180deg, #241c13 0%, #151419 100%);
    border-bottom: 1px solid rgba(201, 161, 74, 0.3);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .sacred-crest {
    font-size: 2rem;
    filter: drop-shadow(0 0 8px #c9a14a);
  }

  .ascension-heading {
    font-family: 'Cinzel', Georgia, serif;
    color: #f7d488;
    margin: 0;
    font-size: 1.5rem;
    letter-spacing: 0.08em;
    text-shadow: 0 0 12px rgba(201, 161, 74, 0.4);
  }

  .ascension-subheading {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: #b0a89c;
  }

  .close-btn {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #b0a89c;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }
  .close-btn:hover {
    color: #fff;
    border-color: #c9a14a;
    background: rgba(201, 161, 74, 0.15);
  }

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.75rem;
  }

  .loading-state {
    text-align: center;
    padding: 4rem 1rem;
    color: #a39e8b;
  }
  .spinner {
    width: 36px;
    height: 36px;
    border: 3px solid rgba(201, 161, 74, 0.2);
    border-top-color: #c9a14a;
    border-radius: 50%;
    margin: 0 auto 1rem;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .archetypes-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.25rem;
  }
  @media (max-width: 768px) {
    .archetypes-grid {
      grid-template-columns: 1fr;
    }
  }

  .archetype-card {
    background: rgba(20, 22, 28, 0.85);
    border: 1px solid rgba(201, 161, 74, 0.25);
    border-radius: 8px;
    padding: 1.25rem;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    position: relative;
  }

  .archetype-card:hover {
    border-color: rgba(201, 161, 74, 0.6);
    background: rgba(32, 28, 24, 0.9);
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }

  .archetype-card.active {
    border-color: #f7d488;
    background: radial-gradient(circle at top left, rgba(201, 161, 74, 0.18) 0%, rgba(20, 22, 28, 0.95) 100%);
    box-shadow: 0 0 20px rgba(201, 161, 74, 0.35), inset 0 0 15px rgba(201, 161, 74, 0.1);
  }

  .arch-top {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .arch-icon-box {
    width: 44px;
    height: 44px;
    background: #090a0d;
    border: 1px solid #c9a14a;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
    box-shadow: 0 0 10px rgba(201, 161, 74, 0.2);
  }

  .arch-titles {
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .arch-name {
    font-family: 'Cinzel', Georgia, serif;
    font-size: 1.15rem;
    font-weight: 700;
    color: #f7d488;
    letter-spacing: 0.05em;
  }

  .arch-tagline {
    font-size: 0.78rem;
    color: #94a3b8;
    letter-spacing: 0.03em;
  }

  .chosen-badge {
    background: #c9a14a;
    color: #0d0e12;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .arch-desc {
    font-size: 0.82rem;
    line-height: 1.4;
    color: #cbd5e1;
    margin: 0;
  }

  .feature-block {
    background: rgba(10, 12, 16, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 6px;
    padding: 0.6rem 0.75rem;
  }

  .feature-block.passive {
    border-left: 3px solid #60a5fa;
  }

  .feature-block.active-skill {
    border-left: 3px solid #f87171;
  }

  .feature-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
    margin-bottom: 0.25rem;
  }

  .feat-type {
    color: #94a3b8;
    font-weight: 600;
    letter-spacing: 0.05em;
  }

  .feat-name {
    color: #f7d488;
    font-weight: 700;
  }

  .feat-desc {
    font-size: 0.75rem;
    color: #cbd5e1;
    margin: 0;
    line-height: 1.35;
  }

  .stat-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: auto;
  }

  .stat-pill {
    background: rgba(34, 197, 94, 0.15);
    border: 1px solid rgba(34, 197, 94, 0.4);
    color: #4ade80;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 0.15rem 0.45rem;
    border-radius: 4px;
    font-family: monospace;
  }

  .modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.75rem;
    background: #090a0e;
    border-top: 1px solid rgba(201, 161, 74, 0.25);
    gap: 1rem;
    flex-wrap: wrap;
  }

  .chosen-summary {
    font-size: 0.85rem;
    color: #cbd5e1;
  }
  .chosen-summary strong {
    color: #f7d488;
  }

  .footer-error {
    color: #ef4444;
    font-size: 0.85rem;
    margin: 0;
    width: 100%;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
    margin-left: auto;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid #475569;
    color: #94a3b8;
    padding: 0.6rem 1.25rem;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all 0.15s;
  }
  .btn-cancel:hover {
    color: #e2e8f0;
    border-color: #64748b;
  }

  .btn-ascend {
    background: linear-gradient(180deg, #e5b95c 0%, #a67c2e 100%);
    color: #0b0c10;
    border: 1px solid #ffe8aa;
    padding: 0.6rem 1.75rem;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'Cinzel', Georgia, serif;
    font-weight: 700;
    font-size: 0.95rem;
    letter-spacing: 0.06em;
    box-shadow: 0 4px 15px rgba(201, 161, 74, 0.4);
    transition: all 0.2s;
  }
  .btn-ascend:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(201, 161, 74, 0.6);
    filter: brightness(1.1);
  }
  .btn-ascend:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleUp {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
