"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { BarChart3, Zap, Shield, Swords, BookOpen } from "lucide-react"
import { StatEnginePanel } from "./stat-engine-panel"
import { EntityManager } from "./entity-manager"

type StatsTab = "stats" | "stat_caps" | "abilities" | "ability_effects" | "race_bonuses" | "class_bonuses" | "bg_bonuses"

const TABS: Array<{ id: StatsTab; label: string; icon: React.ElementType }> = [
  { id: "stats",          label: "Definitions", icon: BarChart3 },
  { id: "stat_caps",      label: "Caps",        icon: Shield },
  { id: "abilities",      label: "Abilities",   icon: Zap },
  { id: "ability_effects",label: "Effects",      icon: Swords },
  { id: "race_bonuses",   label: "Race",         icon: Shield },
  { id: "class_bonuses",  label: "Class",        icon: Swords },
  { id: "bg_bonuses",     label: "BG",           icon: BookOpen },
]

export function StatsHubPanel() {
  const [tab, setTab] = useState<StatsTab>("stats")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <BarChart3 className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Stats & Abilities</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "stats"           && <StatEnginePanel />}
        {tab === "stat_caps"       && <EntityManager section="stat_caps" />}
        {tab === "abilities"       && <EntityManager section="ability_scores" />}
        {tab === "ability_effects" && <EntityManager section="ability_effects" />}
        {tab === "race_bonuses"    && <EntityManager section="race_ability_bonuses" />}
        {tab === "class_bonuses"   && <EntityManager section="class_ability_bonuses" />}
        {tab === "bg_bonuses"      && <EntityManager section="bg_ability_bonuses" />}
      </div>
    </div>
  )
}
