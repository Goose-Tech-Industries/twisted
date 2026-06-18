"use client"

import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  Users, 
  Swords, 
  Package, 
  Sparkles,
  Map,
  ScrollText,
  Store,
  Skull,
  Trophy,
  Shield,
  Wand2,
  Settings,
  Megaphone,
  Gem,
  Target,
  Layers,
  UserCog,
  Palette,
  Droplets
} from "lucide-react"

export type AdminSection = 
  | 'dashboard' 
  | 'players' 
  | 'items' 
  | 'skills' 
  | 'npcs' 
  | 'maps' 
  | 'quests'
  | 'classes'
  | 'races'
  | 'shops'
  | 'arenas'
  | 'oghams'
  | 'artifacts'
  | 'loot'
  | 'spawns'
  | 'status'
  | 'feats'
  | 'gm_tools'
  | 'settings'
  | 'economy'

interface NavItem {
  id: AdminSection
  label: string
  icon: React.ElementType
  category?: string
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, category: 'Overview' },
  { id: 'players', label: 'Players', icon: Users },
  { id: 'economy', label: 'Economy', icon: Gem },
  
  { id: 'items', label: 'Items', icon: Package, category: 'Content' },
  { id: 'skills', label: 'Skills', icon: Sparkles },
  { id: 'npcs', label: 'NPCs & Enemies', icon: Skull },
  { id: 'quests', label: 'Quests', icon: ScrollText },
  { id: 'classes', label: 'Classes', icon: Shield },
  { id: 'races', label: 'Races', icon: UserCog },
  { id: 'feats', label: 'Feats', icon: Trophy },
  { id: 'status', label: 'Status Effects', icon: Droplets },
  
  { id: 'maps', label: 'Maps', icon: Map, category: 'World' },
  { id: 'spawns', label: 'Spawns', icon: Target },
  { id: 'shops', label: 'Shops', icon: Store },
  { id: 'arenas', label: 'Arenas', icon: Swords },
  { id: 'loot', label: 'Loot Tables', icon: Layers },
  
  { id: 'oghams', label: 'Blood Oghams', icon: Wand2, category: 'Magic' },
  { id: 'artifacts', label: 'Artifacts', icon: Gem },
  
  { id: 'gm_tools', label: 'GM Tools', icon: Megaphone, category: 'Tools' },
  { id: 'settings', label: 'Settings', icon: Settings },
]

interface AdminSidebarProps {
  currentSection: AdminSection
  onSectionChange: (section: AdminSection) => void
}

export function AdminSidebar({ currentSection, onSectionChange }: AdminSidebarProps) {
  let currentCategory = ''
  
  return (
    <aside className="w-56 bg-sidebar border-r border-sidebar-border flex flex-col h-screen">
      <div className="p-4 border-b border-sidebar-border">
        <h1 className="text-lg font-bold text-primary blood-text">AdminSauce</h1>
        <p className="text-xs text-muted-foreground">Twisted Engine GM Portal</p>
      </div>
      
      <nav className="flex-1 overflow-y-auto py-2">
        {navItems.map((item) => {
          const showCategory = item.category && item.category !== currentCategory
          if (item.category) currentCategory = item.category
          
          return (
            <div key={item.id}>
              {showCategory && (
                <div className="px-4 py-2 mt-2 first:mt-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {item.category}
                  </span>
                </div>
              )}
              <button
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm transition-all",
                  currentSection === item.id
                    ? "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 border-l-2 border-transparent"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            </div>
          )
        })}
      </nav>
      
      <div className="p-4 border-t border-sidebar-border">
        <a 
          href="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Palette className="w-4 h-4" />
          <span>Back to Game</span>
        </a>
      </div>
    </aside>
  )
}
