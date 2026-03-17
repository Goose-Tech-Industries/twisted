"use client"

import { useGame } from "@/lib/game-context"
import { GameSidebar } from "./game-sidebar"
import { CharacterPanel } from "./character-panel"
import { InventoryPanel } from "./inventory-panel"
import { QuestPanel } from "./quest-panel"
import { BattleArena } from "./battle-arena"
import { MapPanel } from "./map-panel"
import { OghamsPanel } from "./oghams-panel"
import { PartyPanel } from "./party-panel"
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
import { WorldEventTicker } from "./world-event-ticker"
import { DuelRequestToast, useDuelSystem } from "./duel-challenge"
import { useState } from "react"
import { Settings } from "lucide-react"

export function GameLayout() {
  const { state } = useGame()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { incomingRequest, acceptDuel, declineDuel } = useDuelSystem()
  
  const renderContent = () => {
    switch (state.currentView) {
      case 'character':
        return <CharacterPanel />
      case 'inventory':
        return <InventoryPanel />
      case 'quests':
        return <QuestPanel />
      case 'battle':
        return <BattleArena />
      case 'map':
        return <MapPanel />
      case 'oghams':
        return <OghamsPanel />
      case 'party':
        return <PartyPanel />
      case 'guild':
        return <GuildPanel />
      case 'bestiary':
        return <BestiaryPanel />
      case 'achievements':
        return <AchievementsPanel />
      case 'leaderboards':
        return <LeaderboardsPanel />
      case 'skills':
        return <SkillTreePanel />
      case 'crafting':
        return <CraftingPanel />
      default:
        return <CharacterPanel />
    }
  }
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar Navigation */}
      <GameSidebar />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Top Bar */}
        <header className="h-12 border-b border-border bg-card/50 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-medium capitalize">
              {state.currentView.replace('_', ' ')}
            </h2>
          </div>
          
          {/* Settings Button */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 hover:bg-secondary rounded transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {/* Quick Stats */}
          {state.character && (
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[oklch(0.55_0.20_140)]">HP</span>
                <span className="tabular-nums text-muted-foreground">
                  {state.character.currentHp}/{state.character.maxHp}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[oklch(0.55_0.18_260)]">MP</span>
                <span className="tabular-nums text-muted-foreground">
                  {state.character.currentMp}/{state.character.maxMp}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[oklch(0.75_0.15_85)]">G</span>
                <span className="tabular-nums text-muted-foreground">
                  {state.character.gold.toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </header>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </main>
      
      {/* Overlays */}
      <DialogueOverlay />
      <TradePanel />
      <WorldMapOverlay />
      <NotificationToast />
      
      {/* Fixed UI Elements */}
      <ChatPanel />
      <Minimap />
      <QuickSlots />
      <TouchControls />
      <CombatEffectsLayer />
      
      {/* Settings Modal */}
      <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      
      {/* World Event Ticker */}
      <WorldEventTicker />
      
      {/* Duel Request Toast */}
      {incomingRequest && (
        <DuelRequestToast 
          request={incomingRequest}
          onAccept={acceptDuel}
          onDecline={declineDuel}
        />
      )}
    </div>
  )
}
