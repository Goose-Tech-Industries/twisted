<script lang="ts">
  import { dialogue } from '$stores/dialogue.svelte'
  import { livingVoice } from '$stores/living_voice.svelte'

  interface Props {
    onchoice: (choiceId: string) => void
    onclose: () => void
    ontalk?: (message: string) => void
  }
  let { onchoice, onclose, ontalk }: Props = $props()

  let talkInput = $state('')
  let showTalk = $state(false)

  $effect(() => {
    if (dialogue.line) {
      showTalk = dialogue.line.body.includes('awaits your words')
      talkInput = ''
    }
  })

  function submitTalk() {
    const msg = talkInput.trim()
    if (!msg) return
    ontalk?.(msg)
    talkInput = ''
  }
</script>

{#if dialogue.line}
  {@const line = dialogue.line}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="card">
      <header>
        <span class="portrait">{line.portrait ?? '🧙'}</span>
        <div class="speaker-col">
          <strong class="speaker">{line.speaker}</strong>
          {#if livingVoice.isPlaying}
            <div class="voice-indicator" title="Living Voice active">
              <span class="voice-wave" style="height: {8 + livingVoice.level * 10}px;"></span>
              <span class="voice-wave" style="height: {5 + livingVoice.level * 14}px;"></span>
              <span class="voice-wave" style="height: {7 + livingVoice.level * 8}px;"></span>
              <span class="voice-label">Living Voice</span>
            </div>
          {/if}
        </div>
        <div class="voice-actions">
          <button
            class="voice-btn"
            title={livingVoice.isMuted ? "Unmute Voice" : "Mute Voice"}
            onclick={() => livingVoice.toggleMute()}
          >
            {livingVoice.isMuted ? "🔇" : "🔊"}
          </button>
          <button
            class="voice-btn"
            title="Replay Voice"
            onclick={() => livingVoice.play(line)}
          >
            ▶
          </button>
          <button class="close" onclick={onclose} aria-label="Close">×</button>
        </div>
      </header>
      <p class="body">{line.body}</p>

      {#if showTalk}
        <div class="talk-row">
          <input
            type="text"
            class="talk-input"
            bind:value={talkInput}
            placeholder="Type your message..."
            onkeydown={(e) => { if (e.key === 'Enter') submitTalk() }}
            autofocus
          />
          <button class="continue" onclick={submitTalk}>Send</button>
        </div>
      {:else if line.choices?.length}
        <ul class="choices">
          {#each line.choices as c (c.id)}
            <li>
              <button disabled={c.locked} onclick={() => onchoice(c.id)} title={c.reason}>
                {c.label}
                {#if c.locked && c.reason}<span class="lock">({c.reason})</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <button class="continue" onclick={onclose}>Continue</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0;
    display: flex; align-items: flex-end; justify-content: center;
    padding: 1rem;
    background: linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0));
    z-index: 200;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--accent);
    border-radius: 0.5rem;
    width: 100%;
    max-width: 640px;
    padding: 1rem;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
  }
  header { display: flex; align-items: center; gap: 0.625rem; margin-bottom: 0.5rem; }
  .portrait { font-size: 2rem; }
  .speaker-col { display: flex; flex-direction: column; flex: 1; gap: 0.125rem; }
  .speaker { color: var(--accent); }
  .voice-indicator {
    display: inline-flex;
    align-items: flex-end;
    gap: 3px;
    height: 14px;
    background: rgba(245, 158, 11, 0.15);
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
  .voice-wave {
    width: 2px;
    background: var(--accent);
    border-radius: 1px;
    transition: height 0.05s ease;
  }
  .voice-label {
    font-size: 0.625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--accent);
    margin-left: 4px;
    line-height: 1;
  }
  .voice-actions { display: flex; align-items: center; gap: 0.25rem; }
  .voice-btn {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--fg);
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .voice-btn:hover { border-color: var(--accent); color: var(--accent); }
  .close {
    background: transparent; border: none; padding: 0 0.5rem;
    color: var(--fg-muted); font-size: 1.25rem; line-height: 1;
    cursor: pointer;
  }
  .close:hover { color: var(--fg); }
  .body { font-size: 0.9375rem; line-height: 1.5; margin: 0 0 0.75rem; }
  .choices { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
  .choices button {
    width: 100%; text-align: left;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 0.5rem 0.75rem; border-radius: 0.375rem;
    font-size: 0.875rem;
  }
  .choices button:hover:not(:disabled) { border-color: var(--accent); }
  .choices .lock { color: var(--fg-muted); font-size: 0.75rem; margin-left: 0.25rem; }
  .continue { display: block; margin-left: auto; background: var(--accent); color: #1a1208; border: none; font-weight: 600; padding: 0.375rem 1rem; cursor: pointer; }
  .talk-row { display: flex; gap: 0.5rem; align-items: center; }
  .talk-input {
    flex: 1;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-family: inherit;
  }
  .talk-input:focus { outline: none; border-color: var(--accent); }
</style>
