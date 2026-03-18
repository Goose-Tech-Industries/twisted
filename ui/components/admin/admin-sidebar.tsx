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
  | 'dashboard' | 'templates' | 'quest_builder' | 'dialogue_builder' | 'players' | 'economy' | 'gm_tools'
  | 'world_forge' | 'world' | 'maps' | 'regions' | 'spawns' | 'map_connections' | 'scheduler'
  | 'items' | 'npcs' | 'quests' | 'questboard' | 'shop_supply' | 'loot_tables' | 'crafting' | 'auction'
  | 'classes' | 'races' | 'feats' | 'stat' | 'class_skill' | 'character_creator'
  | 'battle_config' | 'battle_cmd' | 'limit' | 'status' | 'arenas'
  | 'oghams' | 'ogham_family' | 'artifacts' | 'skills'
  | 'gm_notes' | 'live_social' | 'reports' | 'referrals' | 'achievements' | 'event_log'
  | 'settings' | 'modules'

interface NavItem { id: AdminSection; label: string; icon: React.ElementType }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: 'Overview', items: [
    { id: 'dashboard',        label: 'Dashboard',         icon: LayoutDashboard },
    { id: 'templates',         label: 'Game Templates',    icon: Layers },
    { id: 'players',          label: 'Players',           icon: Users },
    { id: 'economy',          label: 'Economy',           icon: BarChart3 },
  ]},
  { title: 'World', items: [
    { id: 'world_forge',      label: 'World Forge ✨',    icon: Flame },
    { id: 'world',            label: 'World State',       icon: Globe },
    { id: 'maps',             label: 'Map Editor',        icon: Map },
    { id: 'regions',          label: 'Regions',           icon: Flag },
    { id: 'spawns',           label: 'Spawns',            icon: Target },
    { id: 'map_connections',  label: 'Map Links',         icon: Network },
    { id: 'scheduler',        label: 'Scheduler',         icon: Clock },
  ]},
  { title: 'Content', items: [
    { id: 'items',            label: 'Items',             icon: Package },
    { id: 'npcs',             label: 'NPCs & Enemies',    icon: Skull },
    { id: 'quests',           label: 'Quests',            icon: ScrollText },
    { id: 'quest_builder',    label: 'Quest Builder',     icon: GitBranch },
    { id: 'dialogue_builder', label: 'Dialogue Builder',  icon: Network },
    { id: 'questboard',       label: 'Quest Board',       icon: ClipboardList },
    { id: 'shop_supply',      label: 'Shops',             icon: Store },
    { id: 'loot_tables',      label: 'Loot Tables',       icon: Layers },
    { id: 'crafting',         label: 'Crafting',          icon: Hammer },
    { id: 'auction',          label: 'Auction House',     icon: Gavel },
  ]},
  { title: 'Character', items: [
    { id: 'classes',          label: 'Classes',           icon: Shield },
    { id: 'races',            label: 'Races',             icon: UserCog },
    { id: 'feats',            label: 'Feats',             icon: Trophy },
    { id: 'stat',             label: 'Stat Engine',       icon: BarChart3 },
    { id: 'class_skill',      label: 'Skill Assign',      icon: ListChecks },
    { id: 'character_creator',label: 'Creator Preview',   icon: Users2 },
  ]},
  { title: 'Combat', items: [
    { id: 'battle_config',    label: 'Battle Config',     icon: Settings },
    { id: 'battle_cmd',       label: 'Battle Commands',   icon: Swords },
    { id: 'limit',            label: 'Limit Breaks',      icon: Zap },
    { id: 'status',           label: 'Status Effects',    icon: Droplets },
    { id: 'arenas',           label: 'Arenas',            icon: Swords },
  ]},
  { title: 'Magic', items: [
    { id: 'oghams',           label: 'Blood Oghams',      icon: Wand2 },
    { id: 'ogham_family',     label: 'Ogham Families',    icon: GitBranch },
    { id: 'artifacts',        label: 'Artifacts',         icon: Gem },
    { id: 'skills',           label: 'Skills',            icon: Sparkles },
  ]},
  { title: 'Staff', items: [
    { id: 'gm_tools',         label: 'GM Tools',          icon: Megaphone },
    { id: 'gm_notes',         label: 'GM Notepad',        icon: PenTool },
    { id: 'live_social',      label: 'Live Social',       icon: Users2 },
    { id: 'reports',          label: 'Reports',           icon: Flag },
    { id: 'referrals',        label: 'Referrals',         icon: Link },
    { id: 'achievements',     label: 'Achievements',      icon: Award },
    { id: 'event_log',        label: 'Event Log',         icon: Activity },
  ]},
  { title: 'Config', items: [
    { id: 'settings',         label: 'Settings & Labels', icon: Settings },
    { id: 'modules',          label: 'Modules',           icon: ToggleLeft },
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
