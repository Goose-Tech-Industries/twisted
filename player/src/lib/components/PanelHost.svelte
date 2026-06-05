<script lang="ts">
  // PanelHost — single switchboard for every side-panel in the game.
  // Add new panels here so they're available from the StatusBar / hotkeys
  // without touching the route file.

  import InventoryPanel from './InventoryPanel.svelte'
  import ChatPanel from './ChatPanel.svelte'
  import QuestPanel from './QuestPanel.svelte'
  import PartyPanel from './PartyPanel.svelte'
  import FriendsPanel from './FriendsPanel.svelte'
  import GuildPanel from './GuildPanel.svelte'
  import MailPanel from './MailPanel.svelte'
  import AuctionPanel from './AuctionPanel.svelte'
  import AchievementsPanel from './AchievementsPanel.svelte'
  import LeaderboardPanel from './LeaderboardPanel.svelte'
  import LfpPanel from './LfpPanel.svelte'
  import TournamentPanel from './TournamentPanel.svelte'
  import TradePanel from './TradePanel.svelte'
  import CompanionPanel from './CompanionPanel.svelte'
  import WorldEventsPanel from './WorldEventsPanel.svelte'
  import CharacterSheet from './CharacterSheet.svelte'
  import ProfilePanel from './ProfilePanel.svelte'
  import SettingsPanel from './SettingsPanel.svelte'
  import ShopPanel from './ShopPanel.svelte'
  import CraftingPanel from './CraftingPanel.svelte'
  import SkillTreePanel from './SkillTreePanel.svelte'
  import HtcPanel from './HtcPanel.svelte'
  import BestiaryPanel from './BestiaryPanel.svelte'
  import OghamsPanel from './OghamsPanel.svelte'
  import type { Character } from '$stores/character.svelte'
  import type { Item, Equipment } from '$stores/inventory.svelte'
  import type { LfpListing } from '$stores/lfp.svelte'
  import type { Companion as CompanionType } from '$stores/companion.svelte'

  export type PanelKey =
    | 'none'
    | 'inventory' | 'chat' | 'quests' | 'party' | 'friends' | 'guild'
    | 'mail' | 'auction' | 'achievements' | 'leaderboard' | 'lfp'
    | 'tournament' | 'trade' | 'companion' | 'world_events'
    | 'sheet' | 'profile' | 'settings' | 'shop' | 'crafting'
    | 'skill_tree' | 'htc' | 'bestiary' | 'oghams'

  interface Props {
    panel: PanelKey
    charId: number
    character: Character | null
    inventoryItems: Item[]
    equipment: Equipment
    gold: number

    onuse: (id: number) => void
    onequip: (id: number) => void
    onsendchat: (channel: string, body: string) => void
    onqueue?: (format: string) => void
    onleavequeue?: () => void
    oninvite?: (charId: number, name: string) => void
    onpartyinvite?: (name: string) => void
    onleaveparty?: () => void
    onwhisper?: (name: string) => void
    oncompanionsummon?: (companionId: number) => void
    oncompaniondismiss?: (companionId: number) => void
    oncompaniontactic?: (companionId: number, tactic: CompanionType['tactic']) => void
    ontradeaccept?: () => void
    ontradelock?: () => void
    ontradecancel?: () => void
    ontradesetgold?: (n: number) => void
  }
  let p: Props = $props()
</script>

{#if p.panel === 'inventory'}
  <InventoryPanel
    items={p.inventoryItems}
    equipment={p.equipment}
    gold={p.gold}
    onuse={p.onuse}
    onequip={p.onequip}
  />
{:else if p.panel === 'chat'}
  <ChatPanel onsend={p.onsendchat} />
{:else if p.panel === 'quests'}
  <QuestPanel charId={p.charId} />
{:else if p.panel === 'party'}
  <PartyPanel onleaveparty={p.onleaveparty} oninvite={p.onpartyinvite} />
{:else if p.panel === 'friends'}
  <FriendsPanel onwhisper={p.onwhisper} />
{:else if p.panel === 'guild'}
  <GuildPanel />
{:else if p.panel === 'mail'}
  <MailPanel />
{:else if p.panel === 'auction'}
  <AuctionPanel />
{:else if p.panel === 'achievements'}
  <AchievementsPanel charId={p.charId} />
{:else if p.panel === 'leaderboard'}
  <LeaderboardPanel />
{:else if p.panel === 'lfp'}
  <LfpPanel oninvite={p.oninvite} />
{:else if p.panel === 'tournament'}
  <TournamentPanel onqueue={p.onqueue} onleavequeue={p.onleavequeue} />
{:else if p.panel === 'trade'}
  <TradePanel
    onaccept={p.ontradeaccept}
    onlock={p.ontradelock}
    oncancel={p.ontradecancel}
    onsetgold={p.ontradesetgold}
  />
{:else if p.panel === 'companion'}
  <CompanionPanel
    charId={p.charId}
    onsummon={p.oncompanionsummon}
    ondismiss={p.oncompaniondismiss}
    ontactic={p.oncompaniontactic}
  />
{:else if p.panel === 'world_events'}
  <WorldEventsPanel />
{:else if p.panel === 'sheet'}
  {#if p.character}<CharacterSheet character={p.character} />{:else}<p class="empty">Loading…</p>{/if}
{:else if p.panel === 'profile'}
  <ProfilePanel charId={p.charId} editable={true} />
{:else if p.panel === 'settings'}
  <SettingsPanel />
{:else if p.panel === 'shop'}
  <ShopPanel />
{:else if p.panel === 'crafting'}
  <CraftingPanel />
{:else if p.panel === 'skill_tree'}
  <SkillTreePanel charId={p.charId} />
{:else if p.panel === 'htc'}
  <HtcPanel charId={p.charId} />
{:else if p.panel === 'bestiary'}
  <BestiaryPanel charId={p.charId} />
{:else if p.panel === 'oghams'}
  <OghamsPanel charId={p.charId} />
{/if}

<style>
  .empty { padding: 1rem; color: var(--fg-muted); text-align: center; }
</style>
