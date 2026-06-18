"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import {
  LayoutDashboard, Users, Swords, Package, Map, ScrollText,
  Store, Skull, Trophy, Shield, Wand2, Settings, Megaphone, Gem,
  UserCog, Droplets, BarChart3, Globe, Sparkles,
  Clock, PenTool, Users2, Link, Award,
  ChevronRight, Activity, Menu, Gamepad2, Palette,
} from "lucide-react"

export type AdminSection =
  // Overview
  | 'dashboard' | 'players' | 'economy' | 'gm_tools'
  // World
  | 'world_forge' | 'world' | 'maps' | 'map_connections' | 'regions' | 'spawns'
  | 'spawn_waves' | 'npc_patrols' | 'region_weather' | 'region_rep_gates'
  | 'world_events' | 'scheduler'
  // Content
  | 'items' | 'item_sets' | 'npcs' | 'enemies' | 'quests' | 'quest_builder' | 'dialogue_builder' | 'questboard'
  | 'shop_supply' | 'loot_tables' | 'crafting' | 'auction' | 'achievements'
  | 'npc_schedules' | 'enemy_scaling' | 'subclass' | 'racial_ability' | 'backgrounds'
  | 'artifact_rivalry'
  // Character
  | 'classes' | 'races' | 'feats' | 'skills' | 'ability_scores' | 'race_class_access'
  | 'stat' | 'class_skill' | 'character_creator' | 'titles'
  // Combat
  | 'battle_config' | 'battle_cmd' | 'limit' | 'status' | 'arenas'
  // Gameplay
  | 'gameplay'
  // Magic
  | 'oghams' | 'ogham_family' | 'artifacts'
  // Staff
  | 'gm_notes' | 'live_social' | 'reports' | 'referrals' | 'event_log' | 'moderation'
  // AI Tools & Appearance
  | 'ai_tools' | 'themes'
  // Config
  | 'settings' | 'modules' | 'templates' | 'assets' | 'rulesets' | 'techniques'

interface NavItem { id: AdminSection; label: string; icon: React.ElementType }
interface NavGroup { title: string; items: NavItem[] }

// ─── CLEAN SIDEBAR: One entry per hub panel ──────────────────────
// Each item opens a hub with tabs inside. No duplicates.
const NAV_GROUPS: NavGroup[] = [
  { title: 'Overview', items: [
    { id: 'dashboard',        label: 'Dashboard',         icon: LayoutDashboard },
    { id: 'players',          label: 'Players',           icon: Users },
    { id: 'gm_tools',         label: 'GM Tools',          icon: Megaphone },
  ]},
  { title: 'World Building', items: [
    { id: 'maps',             label: 'Maps & World',      icon: Map },
    { id: 'world_forge',      label: 'World Forge (AI)',   icon: Globe },
    { id: 'ai_tools',          label: 'AI Tools',           icon: Wand2 },
    { id: 'npc_patrols',      label: 'NPC Patrols',       icon: Users },
    { id: 'scheduler',        label: 'Scheduler',         icon: Clock },
  ]},
  { title: 'Content', items: [
    { id: 'npcs',             label: 'NPCs',              icon: Users },
    { id: 'enemies',          label: 'Enemies & Loot',    icon: Skull },
    { id: 'items',            label: 'Items',             icon: Package },
    { id: 'quests',           label: 'Quests',            icon: ScrollText },
    { id: 'dialogue_builder', label: 'Dialogue Builder',  icon: ScrollText },
    { id: 'shop_supply',      label: 'Shops & Commerce',  icon: Store },
  ]},
  { title: 'Characters', items: [
    { id: 'classes',          label: 'Classes & Jobs',    icon: Shield },
    { id: 'races',            label: 'Races',             icon: UserCog },
    { id: 'stat',             label: 'Stats & Abilities', icon: BarChart3 },
    { id: 'character_creator',label: 'Creator Preview',   icon: Users2 },
  ]},
  { title: 'Combat', items: [
    { id: 'battle_config',    label: 'Battle System',     icon: Swords },
    { id: 'status',           label: 'Status & Elements', icon: Droplets },
    { id: 'arenas',           label: 'Arenas & PvP',      icon: Trophy },
  ]},
  { title: 'Gameplay', items: [
    { id: 'gameplay',         label: 'Systems & Minigames', icon: Gamepad2 },
    { id: 'achievements',     label: 'Achievements',      icon: Award },
  ]},
  { title: 'Magic & Lore', items: [
    { id: 'oghams',           label: 'Oghams & Magic',    icon: Wand2 },
    { id: 'artifacts',        label: 'Artifacts',         icon: Gem },
  ]},
  { title: 'Administration', items: [
    { id: 'gm_notes',         label: 'GM Notes',          icon: PenTool },
    { id: 'moderation',       label: 'Moderation',        icon: Shield },
    { id: 'live_social',      label: 'Live Social',       icon: Users2 },
    { id: 'event_log',        label: 'Activity Log',      icon: Activity },
    { id: 'referrals',        label: 'Referrals',         icon: Link },
    { id: 'themes',            label: 'Themes & Skins',    icon: Palette },
    { id: 'settings',         label: 'Settings',          icon: Settings },
    { id: 'rulesets',          label: 'Campaign Rulesets', icon: Settings },
    { id: 'techniques',        label: 'Techniques',        icon: Swords },
  ]},
]

interface SidebarProps {
  currentSection: AdminSection
  onSectionChange: (section: AdminSection) => void
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, dispatch, logout } = useGame()
  const character = state.character

  let currentSection = ''

  return null // Will be replaced below
}

// ── Actual sidebar component ─────────────────────────────────────
function useGame() {
  // Stub — sidebar doesn't need game context
  return { state: { character: null }, dispatch: () => {}, logout: () => {} }
}

export function AdminSidebar({ currentSection, onSectionChange }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false)

  const navContent = (onClose?: () => void) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-bold text-primary flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          AdminSauce
        </h1>
        <p className="text-[10px] text-muted-foreground mt-0.5">Twisted Engine Control Panel</p>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map(group => (
          <div key={group.title} className="mb-1">
            <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {group.title}
            </div>
            {group.items.map(item => {
              const isActive = currentSection === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => { onSectionChange(item.id); onClose?.() }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary border-r-2 border-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-primary/50" />}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border shrink-0 text-[10px] text-muted-foreground/40">
        Twisted Engine v28 · AdminSauce
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 border-r border-border bg-card/50 flex-col h-screen">
        {navContent()}
      </aside>

      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 w-10 h-10 rounded-lg bg-card/90 backdrop-blur border border-border flex items-center justify-center shadow-lg md:hidden"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          {navContent(() => setMobileOpen(false))}
        </SheetContent>
      </Sheet>
    </>
  )
}
