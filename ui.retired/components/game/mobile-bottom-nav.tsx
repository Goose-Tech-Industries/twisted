"use client"

import { useGame } from "@/lib/game-context"
import type { GameView } from "@/lib/game-types"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { useHaptics } from "@/hooks/use-haptics"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  User, Backpack, Map, Swords, MessageSquare,
  ScrollText, Droplets, Zap, Users, UserPlus,
  Shield, BookOpen, Trophy, Crown, Hammer, Gavel, Mail,
  Settings, LogOut, MoreHorizontal, Globe, Flame
} from "lucide-react"

const PRIMARY_TABS: { id: GameView['type']; label: string; icon: React.ElementType }[] = [
  { id: 'character', label: 'Hero',  icon: User },
  { id: 'inventory', label: 'Items', icon: Backpack },
  { id: 'map',       label: 'Map',   icon: Map },
  { id: 'battle',    label: 'Arena', icon: Swords },
]

const MORE_ITEMS: { id: GameView['type']; label: string; icon: React.ElementType; section?: string }[] = [
  { id: 'oghams',       label: 'Blood Oghams',  icon: Droplets,  section: 'Magic & Skills' },
  { id: 'skills',       label: 'Skill Tree',    icon: Zap },
  { id: 'quests',       label: 'Quest Log',     icon: ScrollText, section: 'Journey' },
  { id: 'bestiary',     label: 'Codex',         icon: BookOpen },
  { id: 'crafting',     label: 'Crafting',      icon: Hammer },
  { id: 'auction',      label: 'Auction House', icon: Gavel },
  { id: 'profile',      label: 'My Profile',    icon: User },
  { id: 'mail',         label: 'Mail',           icon: Mail,      section: 'Social' },
  { id: 'friends',      label: 'Friends',       icon: UserPlus },
  { id: 'party',        label: 'Party',         icon: Users },
  { id: 'lfp',          label: 'LFP Board',     icon: Shield },
  { id: 'companions',   label: 'Companions',    icon: UserPlus },
  { id: 'guild',        label: 'Guild',         icon: Shield },
  { id: 'achievements', label: 'Achievements',  icon: Trophy,    section: 'Progress' },
  { id: 'leaderboards', label: 'Leaderboards',  icon: Crown },
  { id: 'tournaments',  label: 'Tournaments',   icon: Flame },
  { id: 'world_events', label: 'World Events',  icon: Globe },
  { id: 'dm',           label: 'Campaigns',     icon: BookOpen, section: 'DM' },
]

interface MobileBottomNavProps {
  onOpenChat: () => void
  onOpenSettings: () => void
}

export function MobileBottomNav({ onOpenChat, onOpenSettings }: MobileBottomNavProps) {
  const { state, dispatch, logout } = useGame()
  const [moreOpen, setMoreOpen] = useState(false)
  const haptics = useHaptics()

  const navigate = (id: GameView['type']) => {
    haptics.tap()
    dispatch({ type: 'SET_VIEW', payload: id })
    setMoreOpen(false)
  }

  const isActive = (id: GameView['type']) => state.currentView === id
  const isMoreActive = MORE_ITEMS.some(item => isActive(item.id))

  return (
    <>
      {/* ── Bottom Tab Bar ── */}
      <nav className="shrink-0 border-t border-border bg-card/95 backdrop-blur safe-bottom z-50">
        <div className="flex items-stretch">
          {PRIMARY_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              disabled={!!state.battle && state.currentView === 'battle' && tab.id !== 'battle'}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors min-h-[56px]",
                isActive(tab.id)
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground",
                state.battle && state.currentView === 'battle' && tab.id !== 'battle'
                  && "opacity-30"
              )}
            >
              <tab.icon className={cn("w-5 h-5", isActive(tab.id) && "drop-shadow-[0_0_4px_var(--primary)]")} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}

          {/* Chat tab */}
          <button
            onClick={onOpenChat}
            className="flex-1 flex flex-col items-center gap-0.5 py-2 text-muted-foreground active:text-foreground min-h-[56px]"
          >
            <MessageSquare className="w-5 h-5" />
            <span className="text-[10px] font-medium">Chat</span>
          </button>

          {/* More tab */}
          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors min-h-[56px]",
              isMoreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
            )}
          >
            <MoreHorizontal className={cn("w-5 h-5", isMoreActive && "drop-shadow-[0_0_4px_var(--primary)]")} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* ── More Sheet ── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="p-0 bg-card border-border rounded-t-2xl max-h-[70dvh] [&>button:last-child]:hidden">
          <div className="flex flex-col">
            {/* Drag handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Navigation grid */}
            <div className="overflow-y-auto px-4 pb-6 space-y-4">
              {(() => {
                let currentSection = ''
                return MORE_ITEMS.map(item => {
                  const showSection = item.section && item.section !== currentSection
                  if (item.section) currentSection = item.section
                  return (
                    <div key={item.id}>
                      {showSection && (
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-bold mb-2 mt-2 first:mt-0">
                          {item.section}
                        </p>
                      )}
                      <button
                        onClick={() => navigate(item.id)}
                        disabled={!!state.battle && state.currentView === 'battle'}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors",
                          isActive(item.id)
                            ? "bg-primary/10 text-primary"
                            : "text-foreground active:bg-secondary"
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                        {item.id === 'oghams' && (
                          <span className="ml-auto text-[10px] text-primary">
                            {state.oghams.filter(o => o.slotted).length}/{state.oghams.length}
                          </span>
                        )}
                        {item.id === 'quests' && (
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {state.quests.filter(q => q.status === 'active').length}
                          </span>
                        )}
                      </button>
                    </div>
                  )
                })
              })()}

              {/* Settings + Logout */}
              <div className="border-t border-border pt-3 mt-3 space-y-1">
                <button
                  onClick={() => { setMoreOpen(false); onOpenSettings() }}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-muted-foreground active:bg-secondary"
                >
                  <Settings className="w-5 h-5" />
                  <span className="text-sm">Settings</span>
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-destructive active:bg-destructive/10"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-sm">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
