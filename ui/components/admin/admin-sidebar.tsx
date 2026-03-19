"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, Swords, Package, Sparkles, Map, ScrollText,
  Store, Skull, Trophy, Shield, Wand2, Settings, Megaphone, Gem, Target,
  Layers, UserCog, Droplets, BarChart3, Globe,
  GitBranch, Clock, Flame, Hammer, Gavel, ClipboardList,
  Network, PenTool, ListChecks, Flag, Users2, Link, Award, ToggleLeft,
  ChevronRight, Zap, Activity,
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
  // Magic
  | 'oghams' | 'ogham_family' | 'artifacts'
  // Staff
  | 'gm_notes' | 'live_social' | 'reports' | 'referrals' | 'event_log' | 'moderation'
  // Config
  | 'settings' | 'modules' | 'templates' | 'assets'

interface NavItem { id: AdminSection; label: string; icon: React.ElementType }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: 'Overview', items: [
    { id: 'dashboard',        label: 'Dashboard',         icon: LayoutDashboard },
    { id: 'players',          label: 'Players',           icon: Users },
    { id: 'economy',          label: 'Economy',           icon: BarChart3 },
    { id: 'gm_tools',         label: 'GM Tools',          icon: Megaphone },
  ]},
  { title: 'World', items: [
    { id: 'world',            label: 'World',             icon: Globe },
    { id: 'maps',             label: 'Maps',              icon: Map },
    { id: 'npc_patrols',      label: 'NPC Patrols',       icon: Activity },
    { id: 'scheduler',        label: 'Scheduler',         icon: Clock },
  ]},
  { title: 'Content', items: [
    { id: 'items',            label: 'Items',             icon: Package },
    { id: 'npcs',             label: 'NPCs',              icon: Users },
    { id: 'enemies',          label: 'Enemies',           icon: Skull },
    { id: 'quests',           label: 'Quests',            icon: ScrollText },
    { id: 'dialogue_builder', label: 'Dialogue Builder',  icon: Network },
    { id: 'shop_supply',      label: 'Commerce',          icon: Store },
    { id: 'achievements',     label: 'Achievements',      icon: Award },
  ]},
  { title: 'Character', items: [
    { id: 'classes',          label: 'Classes',           icon: Shield },
    { id: 'races',            label: 'Races',             icon: UserCog },
    { id: 'feats',            label: 'Feats',             icon: Trophy },
    { id: 'stat',             label: 'Stats & Abilities', icon: BarChart3 },
    { id: 'titles',           label: 'Titles',            icon: Award },
    { id: 'character_creator',label: 'Creator Preview',   icon: Users2 },
  ]},
  { title: 'Combat', items: [
    { id: 'battle_config',    label: 'Battle System',     icon: Swords },
    { id: 'status',           label: 'Status Effects',    icon: Droplets },
    { id: 'arenas',           label: 'Arenas & Tourneys', icon: Trophy },
  ]},
  { title: 'Magic', items: [
    { id: 'oghams',           label: 'Oghams',            icon: Wand2 },
    { id: 'artifacts',        label: 'Artifacts',         icon: Gem },
  ]},
  { title: 'Staff', items: [
    { id: 'gm_notes',         label: 'GM Notes',          icon: PenTool },
    { id: 'moderation',       label: 'Moderation',        icon: Shield },
    { id: 'live_social',      label: 'Live Social',       icon: Users2 },
    { id: 'referrals',        label: 'Referrals',         icon: Link },
    { id: 'event_log',        label: 'Event Log',         icon: Activity },
  ]},
  { title: 'Config', items: [
    { id: 'settings',         label: 'Config',            icon: Settings },
  ]},
]

interface AdminSidebarProps {
  currentSection: AdminSection
  onSectionChange: (section: AdminSection) => void
}

export function AdminSidebar({ currentSection, onSectionChange }: AdminSidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleGroup = (title: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(title) ? next.delete(title) : next.add(title)
      return next
    })
  }

  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      <div className="p-4 border-b border-sidebar-border flex-shrink-0">
        <h1 className="text-lg font-bold text-primary">AdminSauce</h1>
        <p className="text-xs text-muted-foreground">Twisted Engine GM Portal</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => {
          const isCollapsed = collapsed.has(group.title)
          return (
            <div key={group.title}>
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-4 py-2 mt-1"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  {group.title}
                </span>
                <ChevronRight className={cn(
                  "w-3 h-3 text-muted-foreground/40 transition-transform",
                  !isCollapsed && "rotate-90"
                )} />
              </button>

              {!isCollapsed && group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm transition-all border-l-2",
                    currentSection === item.id
                      ? "bg-sidebar-accent text-sidebar-primary border-sidebar-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-transparent"
                  )}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>← Back to Game</span>
        </a>
      </div>
    </aside>
  )
}
