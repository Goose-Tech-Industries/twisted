<script lang="ts">
  import type { PanelKey } from './PanelHost.svelte'

  interface Item { key: PanelKey; label: string; icon: string; group: 'core' | 'social' | 'progression' | 'system' }

  const ITEMS: Item[] = [
    { key: 'sheet',         label: 'Character',    icon: '🛡️', group: 'core' },
    { key: 'inventory',     label: 'Inventory',    icon: '🎒', group: 'core' },
    { key: 'camp',          label: 'Camp / Rest',  icon: '⛺', group: 'core' },
    { key: 'quests',        label: 'Quests',       icon: '📜', group: 'core' },
    { key: 'skill_tree',    label: 'Skills',       icon: '✦',  group: 'core' },
    { key: 'oghams',        label: 'Oghams',       icon: '᚛',  group: 'core' },
    { key: 'companion',     label: 'Companions',   icon: '🐾', group: 'core' },

    { key: 'chat',          label: 'Chat',         icon: '💬', group: 'social' },
    { key: 'party',         label: 'Party',        icon: '👥', group: 'social' },
    { key: 'friends',       label: 'Friends',      icon: '🤝', group: 'social' },
    { key: 'guild',         label: 'Guild',        icon: '🏰', group: 'social' },
    { key: 'mail',          label: 'Mail',         icon: '✉',  group: 'social' },
    { key: 'lfp',           label: 'LFP',          icon: '📣', group: 'social' },
    { key: 'profile',       label: 'Profile',      icon: '🪪', group: 'social' },
    { key: 'campaigns',     label: 'TTRPG Campaigns', icon: '🎲', group: 'social' },
    { key: 'party_games',   label: 'Party & Minigames', icon: '🎭', group: 'social' },

    { key: 'tournament',    label: 'Battle',       icon: '⚔️', group: 'progression' },
    { key: 'auction',       label: 'Auction',      icon: '💰', group: 'progression' },
    { key: 'crafting',      label: 'Crafting',     icon: '🔨', group: 'progression' },
    { key: 'shop',          label: 'Shop',         icon: '🏪', group: 'progression' },
    { key: 'htc',           label: 'Training',     icon: '⏳', group: 'progression' },
    { key: 'bestiary',      label: 'Bestiary',     icon: '👹', group: 'progression' },
    { key: 'achievements',  label: 'Achievements', icon: '🏆', group: 'progression' },
    { key: 'leaderboard',   label: 'Leaderboard',  icon: '📈', group: 'progression' },
    { key: 'world_events',  label: 'World',        icon: '🌑', group: 'progression' },
    { key: 'trade',         label: 'Trade',        icon: '🤝', group: 'progression' },
    { key: 'cards',         label: 'Card Duel',    icon: '🎴', group: 'progression' },

    { key: 'settings',      label: 'Settings',     icon: '⚙',  group: 'system' }
  ]

  interface Props {
    active: PanelKey
    onpick: (key: PanelKey) => void
  }
  let { active, onpick }: Props = $props()

  let groupOpen = $state<string | null>(null)

  const groups = ['core', 'social', 'progression', 'system'] as const
  function itemsIn(g: string) { return ITEMS.filter(i => i.group === g) }

  function pick(k: PanelKey) {
    onpick(k)
    groupOpen = null
  }
</script>

<nav class="menu">
  {#each groups as g}
    <div class="group" class:open={groupOpen === g}>
      <button class="head" onclick={() => groupOpen = groupOpen === g ? null : g}>
        {g === 'core' ? '⚔ Core'
          : g === 'social' ? '👥 Social'
          : g === 'progression' ? '⭐ Progression'
          : '⚙ System'}
      </button>
      {#if groupOpen === g}
        <div class="items">
          {#each itemsIn(g) as it}
            <button class:active={active === it.key} onclick={() => pick(it.key)}>
              <span class="icon">{it.icon}</span>
              <span class="lbl">{it.label}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</nav>

<style>
  .menu { display: flex; gap: 0.25rem; flex-wrap: wrap; position: relative; }
  .group { position: relative; }
  .group .head { font-size: 0.75rem; padding: 0.25rem 0.625rem; }
  .group.open .head { background: var(--accent); color: #1a1208; }
  .items {
    position: absolute; bottom: calc(100% + 4px); left: 0;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 0.375rem; padding: 0.25rem;
    display: grid; grid-template-columns: repeat(2, minmax(110px, 1fr));
    gap: 0.125rem;
    z-index: 30;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .items button {
    display: flex; align-items: center; gap: 0.375rem;
    background: transparent; border: 1px solid transparent;
    padding: 0.375rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem;
    text-align: left;
  }
  .items button:hover { background: var(--surface-2); }
  .items button.active { background: var(--accent); color: #1a1208; }
  .items .icon { font-size: 0.875rem; }
  .items .lbl { white-space: nowrap; }
</style>
