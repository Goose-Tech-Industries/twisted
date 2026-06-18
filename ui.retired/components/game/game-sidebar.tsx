"use client"
import React, { useState } from 'react'

import { cn } from "@/lib/utils"
import { useGame } from "@/lib/game-context"
import { getNameColor, getNameEffect } from "@/lib/name-colors"
import type { GameView } from "@/lib/game-types"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  User,
  Backpack,
  ScrollText,
  Map,
  Swords,
  Users,
  UserPlus,
  Droplets,
  Settings,
  LogOut,
  Shield,
  BookOpen,
  Trophy,
  Crown,
  Zap,
  Menu,
  Store,
  Gavel,
  Hammer,
  Mail,
  Warehouse,
  Target,
  Bug,
  Briefcase,
  Layers
} from "lucide-react"

const NAV_ITEMS: { id: GameView['type']; label: string; icon: React.ElementType; section?: string }[] = [
  { id: 'character', label: 'Character', icon: User, section: 'Hero' },
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'inventory', label: 'Inventory', icon: Backpack },
  { id: 'oghams', label: 'Blood Oghams', icon: Droplets },
  { id: 'skills', label: 'Skill Tree', icon: Zap },
  { id: 'quests', label: 'Quest Log', icon: ScrollText, section: 'Journey' },
  { id: 'map', label: 'World Map', icon: Map },
  { id: 'bestiary', label: 'Codex', icon: BookOpen },
  { id: 'battle', label: 'Arena', icon: Swords, section: 'Combat' },
  { id: 'mail', label: 'Mail', icon: Mail, section: 'Social' },
  { id: 'friends', label: 'Friends', icon: UserPlus },
  { id: 'party', label: 'Party', icon: Users },
  { id: 'lfp', label: 'LFP Board', icon: Shield },
  { id: 'companions', label: 'Companions', icon: UserPlus },
  { id: 'guild', label: 'Guild', icon: Shield },
  { id: 'crafting', label: 'Crafting', icon: Hammer },
  { id: 'creatures', label: 'Creatures', icon: Bug },
  { id: 'mounts', label: 'Mounts', icon: Zap },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'bank', label: 'Bank', icon: Warehouse, section: 'Economy' },
  { id: 'auction', label: 'Auction House', icon: Gavel },
  { id: 'bounties', label: 'Bounties', icon: Target },
  { id: 'cards', label: 'Card Game', icon: Layers },
  { id: 'tournaments', label: 'Tournaments', icon: Trophy },
  { id: 'world_events', label: 'World Events', icon: Zap },
  { id: 'dm', label: 'Campaigns', icon: BookOpen, section: 'DM' },
  { id: 'achievements', label: 'Achievements', icon: Trophy, section: 'Progress' },
  { id: 'leaderboards', label: 'Leaderboards', icon: Crown },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, dispatch, logout } = useGame()
  const character = state.character

  let currentSection = ''

  const handleNav = (id: GameView['type']) => {
    dispatch({ type: 'SET_VIEW', payload: id })
    onNavigate?.()
  }

  return (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="p-4 border-b border-sidebar-border shrink-0">
        <h1 className="text-lg font-bold text-primary blood-text tracking-wider">
          TWISTED ENGINE
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Dark Celtic Fantasy</p>
      </div>

      {/* Character Mini Info */}
      {character && (
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded bg-primary/20 border border-primary/40 flex items-center justify-center text-primary font-bold shrink-0">
              {character.level}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-medium truncate", getNameEffect(state.role || undefined))}
                style={{ color: getNameColor(state.role || undefined, state.chatColor) || undefined }}>
                {character.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {character.raceName} {character.className}
              </p>
            </div>
          </div>

          {/* HP/MP Mini Bars */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-6">HP</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[oklch(0.55_0.20_140)] transition-all duration-300"
                  style={{ width: `${(character.currentHp / character.maxHp) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {character.currentHp}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-6">MP</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-[oklch(0.55_0.18_260)] transition-all duration-300"
                  style={{ width: `${(character.currentMp / character.maxMp) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {character.currentMp}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const showSection = item.section && item.section !== currentSection
          if (item.section) currentSection = item.section

          return (
            <div key={item.id}>
              {showSection && (
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-3 pt-4 pb-1">
                  {item.section}
                </p>
              )}
              <button
                onClick={() => handleNav(item.id)}
                disabled={!!state.battle && state.currentView === 'battle' && item.id !== 'battle'}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-all",
                  state.currentView === item.id
                    ? "bg-primary/15 text-primary border-l-2 border-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  state.battle && state.currentView === 'battle' && item.id !== 'battle'
                    && "opacity-30 cursor-not-allowed"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.id === 'oghams' && (
                  <span className="ml-auto text-[10px] text-primary font-medium">
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
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1 shrink-0">
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all">
          <Settings className="w-4 h-4" />
          <span>Settings</span>
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded text-sm text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  )
}

export function GameSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* ── Mobile: hamburger + sheet drawer ── */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 w-10 h-10 rounded-lg bg-card/90 backdrop-blur border border-border flex items-center justify-center shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border gap-0 [&>button:last-child]:hidden">
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* ── Desktop: permanent sidebar ── */}
      <aside className="hidden md:flex w-56 min-w-56 bg-sidebar border-r border-sidebar-border flex-col h-full">
        <SidebarContent />
      </aside>
    </>
  )
}
