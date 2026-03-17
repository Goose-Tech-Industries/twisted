"use client"

import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, Swords, Package, Sparkles, Map, ScrollText,
  Store, Skull, Trophy, Shield, Wand2, Settings, Megaphone, Gem, Target,
  Layers, UserCog, Droplets, BarChart3, Globe, Star,
  GitBranch, Clock, Flame, Hammer, Gavel, ClipboardList,
  Network, PenTool, ListChecks, Flag, Users2, Link, Award, ToggleLeft,
  ChevronRight, Zap,
} from "lucide-react"
import { useState } from "react"

export type AdminSection =
  | 'dashboard' | 'players' | 'economy' | 'gm_tools'
  | 'classes' | 'races' | 'feats' | 'status' | 'arenas' | 'artifacts' | 'skills'
  | 'v:map' | 'v:spawn' | 'v:region' | 'v:map_connections' | 'v:world' | 'v:world_forge'
  | 'v:scheduler' | 'v:stat' | 'v:setting' | 'v:module' | 'v:class_skill' | 'v:battle_cmd'
  | 'v:limit' | 'v:ogham' | 'v:ogham_family' | 'v:craft' | 'v:auction' | 'v:loot_manager'
  | 'v:shop_supply' | 'v:quest' | 'v:questboard' | 'v:item' | 'v:npc' | 'v:player_manager'
  | 'v:gm_tools' | 'v:gm_notes' | 'v:live_social' | 'v:reports_manager' | 'v:referral_manager'
  | 'v:achievement' | 'v:economy' | 'v:event_log' | 'v:character_creator'
  | 'v:artifact' | 'v:artifact_power'

interface NavItem { id: AdminSection; label: string; icon: React.ElementType; vanilla?: boolean }
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  { title: 'Overview', items: [
    { id: 'dashboard',      label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'players',        label: 'Players',          icon: Users },
    { id: 'economy',        label: 'Economy',          icon: BarChart3 },
  ]},
  { title: 'World', items: [
    { id: 'v:world_forge',  label: 'World Forge ✨',   icon: Flame,        vanilla: true },
    { id: 'v:world',        label: 'World State',      icon: Globe,        vanilla: true },
    { id: 'v:map',          label: 'Map Editor',       icon: Map,          vanilla: true },
    { id: 'v:region',       label: 'Regions',          icon: Flag,         vanilla: true },
    { id: 'v:spawn',        label: 'Spawns',           icon: Target,       vanilla: true },
    { id: 'v:map_connections',label: 'Map Links',      icon: Network,      vanilla: true },
    { id: 'v:scheduler',    label: 'Scheduler',        icon: Clock,        vanilla: true },
  ]},
  { title: 'Content', items: [
    { id: 'v:item',         label: 'Items',            icon: Package,      vanilla: true },
    { id: 'v:npc',          label: 'NPCs & Enemies',   icon: Skull,        vanilla: true },
    { id: 'v:quest',        label: 'Quests',           icon: ScrollText,   vanilla: true },
    { id: 'v:questboard',   label: 'Quest Board',      icon: ClipboardList,vanilla: true },
    { id: 'v:shop_supply',  label: 'Shops',            icon: Store,        vanilla: true },
    { id: 'v:loot_manager', label: 'Loot Tables',      icon: Layers,       vanilla: true },
    { id: 'v:craft',        label: 'Crafting',         icon: Hammer,       vanilla: true },
    { id: 'v:auction',      label: 'Auction House',    icon: Gavel,        vanilla: true },
  ]},
  { title: 'Character', items: [
    { id: 'classes',        label: 'Classes',          icon: Shield },
    { id: 'races',          label: 'Races',            icon: UserCog },
    { id: 'feats',          label: 'Feats',            icon: Trophy },
    { id: 'v:stat',         label: 'Stat Engine',      icon: BarChart3,    vanilla: true },
    { id: 'v:class_skill',  label: 'Skill Assign',     icon: ListChecks,   vanilla: true },
    { id: 'v:character_creator',label:'Creator Preview',icon: Users2,      vanilla: true },
  ]},
  { title: 'Combat', items: [
    { id: 'v:battle_cmd',   label: 'Battle Commands',  icon: Swords,       vanilla: true },
    { id: 'v:limit',        label: 'Limit Breaks',     icon: Zap,          vanilla: true },
    { id: 'status',         label: 'Status Effects',   icon: Droplets },
    { id: 'arenas',         label: 'Arenas',           icon: Swords },
  ]},
  { title: 'Magic', items: [
    { id: 'v:ogham',        label: 'Blood Oghams',     icon: Wand2,        vanilla: true },
    { id: 'v:ogham_family', label: 'Ogham Families',   icon: GitBranch,    vanilla: true },
    { id: 'artifacts',      label: 'Artifacts',        icon: Gem },
    { id: 'v:artifact_power',label:'Art. Powers',      icon: Star,         vanilla: true },
    { id: 'skills',         label: 'Skills',           icon: Sparkles },
  ]},
  { title: 'Staff', items: [
    { id: 'gm_tools',       label: 'GM Tools',         icon: Megaphone },
    { id: 'v:gm_notes',     label: 'GM Notepad',       icon: PenTool,      vanilla: true },
    { id: 'v:live_social',  label: 'Live Social',      icon: Users2,       vanilla: true },
    { id: 'v:reports_manager',label:'Reports',         icon: Flag,         vanilla: true },
    { id: 'v:referral_manager',label:'Referrals',      icon: Link,         vanilla: true },
    { id: 'v:achievement',  label: 'Achievements',     icon: Award,        vanilla: true },
    { id: 'v:event_log',    label: 'Event Log',        icon: ClipboardList,vanilla: true },
  ]},
  { title: 'Config', items: [
    { id: 'v:setting',      label: 'Settings & Labels',icon: Settings,     vanilla: true },
    { id: 'v:module',       label: 'Modules & Toggles',icon: ToggleLeft,   vanilla: true },
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
                  {item.vanilla && (
                    <span className="ml-auto text-[9px] text-muted-foreground/30 flex-shrink-0">◆</span>
                  )}
                </button>
              ))}
            </div>
          )
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border flex-shrink-0">
        <p className="text-[9px] text-muted-foreground/30 mb-2">◆ = vanilla editor</p>
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>← Back to Game</span>
        </a>
      </div>
    </aside>
  )
}
