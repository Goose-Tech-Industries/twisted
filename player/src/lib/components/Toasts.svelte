<script lang="ts">
  import type { Notification } from '$stores/notifications.svelte'

  interface Props {
    items: Notification[]
    ondismiss: (id: number) => void
  }
  let { items, ondismiss }: Props = $props()

  const colors: Record<string, string> = {
    info: '#5b8def',
    success: '#4caf75',
    warning: '#e6a23c',
    error: '#d04848',
    item: '#a07cd9',
    heal: '#4caf75',
    damage: '#d04848',
    xp: '#e6a23c',
    gold: '#c5a572'
  }
</script>

<div class="toast-stack">
  {#each items as note (note.id)}
    <div class="toast" style="border-left-color: {colors[note.type] ?? '#5b8def'}">
      <span>{note.message}</span>
      <button class="dismiss" aria-label="dismiss" onclick={() => ondismiss(note.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 9999;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left-width: 4px;
    border-radius: 0.375rem;
    padding: 0.75rem 1rem;
    min-width: 240px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  .dismiss {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: 1.25rem;
    line-height: 1;
    padding: 0 0.25rem;
  }
  .dismiss:hover { background: transparent; color: var(--fg); }
</style>
