"use client"

import { useGame } from "@/lib/game-context"
import { GameSidebar } from "./game-sidebar"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { MobileChatSheet } from "./mobile-chat-sheet"
import { CharacterPanel } from "./character-panel"
import { InventoryPanel } from "./inventory-panel"
import { QuestPanel } from "./quest-panel"
import { BattleArena } from "./battle-arena"
import { MapPanel } from "./map-panel"
import { OghamsPanel } from "./oghams-panel"
import { PartyPanel } from "./party-panel"
import { CompanionPanel } from "./companion-panel"
import { GuildPanel } from "./guild-panel"
import { DialogueOverlay } from "./dialogue-overlay"
import { NotificationToast } from "./notification-toast"
import { TradePanel } from "./trade-panel"
import { WorldMapOverlay } from "./world-map-overlay"
import { ChatPanel } from "./chat-panel"
import { Minimap } from "./minimap"
import { BestiaryPanel } from "./bestiary-panel"
import { AchievementsPanel } from "./achievements-panel"
import { LeaderboardsPanel } from "./leaderboards-panel"
import { SkillTreePanel } from "./skill-tree-panel"
import { SettingsPanel } from "./settings-panel"
import { QuickSlots } from "./quick-slots"
import { TouchControls } from "./touch-controls"
import { CombatEffectsLayer } from "./combat-effects"
import { CraftingPanel } from "./crafting-panel"
import { ShopPanel } from "./shop-panel"
import { AuctionPanel } from "./auction-panel"
import { ProfilePanel } from "./profile-panel"
import { MailPanel } from "./mail-panel"
import { FriendsPanel } from "./friends-panel"
import { LfpPanel } from "./lfp-panel"
import { BankPanel, BountyBoardPanel, MountPanel, CreaturePanel, JobPanel, CardGamePanel, APPanel } from "./gameplay-panels"
import { TournamentPanel } from "./tournament-panel"
import { WorldEventsPanel } from "./world-events-panel"
import { DMPanel } from "./dm-panel"
import { WorldEventTicker } from "./world-event-ticker"
import { DuelRequestToast, useDuelSystem } from "./duel-challenge"
import { useState, useCallback } from "react"
import { Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import { ViewTransition } from "./view-transition"
import { usePullRefresh } from "@/hooks/use-pull-refresh"
import { PullRefreshIndicator } from "./pull-refresh-indicator"

function ContentPanel({ view }: { view: string }) {
  const { state, dispatch } = useGame()
  switch (view) {
    case 'character':    return <><APPanel /><CharacterPanel /></>
    case 'inventory':    return <InventoryPanel />
    case 'quests':       return <QuestPanel />
    case 'battle':       return <BattleArena />
    case 'map':          return <MapPanel />
    case 'oghams':       return <OghamsPanel />
    case 'party':        return <PartyPanel />
    case 'companions':   return <CompanionPanel />
    case 'guild':        return <GuildPanel />
    case 'bestiary':     return <BestiaryPanel />
    case 'achievements': return <AchievementsPanel />
    case 'leaderboards': return <LeaderboardsPanel />
    case 'skills':       return <SkillTreePanel />
    case 'crafting':     return <CraftingPanel />
    case 'shop':         return state.activeShopId ? <ShopPanel shopId={state.activeShopId} onClose={() => { dispatch({ type: 'SET_ACTIVE_SHOP', payload: null }); dispatch({ type: 'SET_VIEW', payload: 'map' }) }} /> : <CharacterPanel />
    case 'auction':      return <AuctionPanel />
    case 'mail':         return <MailPanel />
    case 'friends':      return <FriendsPanel />
    case 'lfp':          return <LfpPanel />
    case 'bank':         return <BankPanel />
    case 'bounties':     return <BountyBoardPanel />
    case 'mounts':       return <MountPanel />
    case 'creatures':    return <CreaturePanel />
    case 'jobs':         return <JobPanel />
    case 'cards':        return <CardGamePanel />
    case 'tournaments':  return <TournamentPanel />
    case 'world_events': return <WorldEventsPanel />
    case 'dm':           return <DMPanel />
    case 'profile':      return <ProfilePanel charId={state.viewProfileCharId || state.character?.charId || state.character?.id || 0} onClose={() => dispatch({ type: 'SET_VIEW', payload: 'character' })} onViewProfile={(id) => { dispatch({ type: 'SET_VIEW_PROFILE', payload: id }) }} />
    default:             return <CharacterPanel />
  }
}

export function GameLayout() {
  const game = useGame()
  const { state } = game
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileChatOpen, setMobileChatOpen] = useState(false)
  const { incomingRequest, acceptDuel, declineDuel } = useDuelSystem()
  const ch = state.character

  // Pull-to-refresh: re-emit socket init to reload all data
  const handleRefresh = useCallback(async () => {
    const socket = (game as any).socket
    if (socket) {
      socket.emit('request_refresh')
      // Give server time to respond
      await new Promise(r => setTimeout(r, 800))
    }
  }, [game])

  const { containerRef, pullDistance, refreshing, isPulledPastThreshold } = usePullRefresh({
    onRefresh: handleRefresh,
  })

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════
          MOBILE LAYOUT (< md)
          Bottom tab nav, full-screen panels, no floating clutter
          ════════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col h-[100dvh] bg-background overflow-hidden">
        {/* Mobile Header — slim, just HP/MP bars */}
        <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-border bg-card/80">
          <span className="text-xs font-bold text-primary truncate max-w-[100px]">
            {ch?.name || 'Hero'}
          </span>
          {ch && (
            <div className="flex-1 flex items-center gap-2 min-w-0">
              {/* HP bar */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[9px] text-[oklch(0.55_0.20_140)] font-bold w-3">HP</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-[oklch(0.55_0.20_140)] transition-all duration-300"
                    style={{ width: `${(ch.currentHp / ch.maxHp) * 100}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-right">{ch.currentHp}</span>
              </div>
              {/* MP bar */}
              <div className="flex-1 flex items-center gap-1">
                <span className="text-[9px] text-[oklch(0.55_0.18_260)] font-bold w-3">MP</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-[oklch(0.55_0.18_260)] transition-all duration-300"
                    style={{ width: `${(ch.currentMp / ch.maxMp) * 100}%` }} />
                </div>
                <span className="text-[9px] text-muted-foreground tabular-nums w-8 text-right">{ch.currentMp}</span>
              </div>
            </div>
          )}
        </header>

        {/* Content — full screen, scrollable, pull-to-refresh */}
        <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 overscroll-contain">
          <PullRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} isPulledPastThreshold={isPulledPastThreshold} />
          <ViewTransition viewKey={state.currentView} mode="slide" className="min-h-full">
            <ContentPanel view={state.currentView} />
          </ViewTransition>
        </div>

        {/* Touch controls — only on map view */}
        <TouchControls />

        {/* Bottom Tab Bar */}
        <MobileBottomNav
          onOpenChat={() => setMobileChatOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Mobile Chat — full sheet, not a floating window */}
        <MobileChatSheet open={mobileChatOpen} onOpenChange={setMobileChatOpen} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          DESKTOP LAYOUT (>= md)
          Classic sidebar + floating chat/minimap
          ════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex h-screen overflow-hidden bg-background">
        <GameSidebar />

        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          <WorldEventTicker />

          <header className="h-12 border-b border-border bg-card/50 flex items-center px-4 justify-between shrink-0">
            <h2 className="text-sm font-medium capitalize truncate">
              {state.currentView.replace('_', ' ')}
            </h2>
            <div className="flex items-center gap-4 shrink-0">
              {ch && (
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-[oklch(0.55_0.20_140)]">HP</span>
                    <span className="tabular-nums text-muted-foreground">{ch.currentHp}/{ch.maxHp}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[oklch(0.55_0.18_260)]">MP</span>
                    <span className="tabular-nums text-muted-foreground">{ch.currentMp}/{ch.maxMp}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[oklch(0.75_0.15_85)]">G</span>
                    <span className="tabular-nums text-muted-foreground">{ch.gold.toLocaleString()}</span>
                  </div>
                </div>
              )}
              <button onClick={() => setSettingsOpen(true)}
                className="p-2 hover:bg-secondary rounded transition-colors" title="Settings">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
            <ViewTransition viewKey={state.currentView} mode="fade" className="min-h-full">
              <ContentPanel view={state.currentView} />
            </ViewTransition>
          </div>

          <QuickSlots />
        </main>

        <ChatPanel />
        <Minimap />
        <CombatEffectsLayer />
      </div>

      {/* ── Shared overlays (both layouts) ── */}
      <DialogueOverlay />
      <TradePanel />
      <WorldMapOverlay />
      <NotificationToast />
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {incomingRequest && (
        <DuelRequestToast request={incomingRequest} onAccept={acceptDuel} onDecline={declineDuel} />
      )}
    </>
  )
}
