"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Swords, Trophy, History, BarChart3, Calendar, Film, Zap } from "lucide-react"
import { EntityManager } from "./entity-manager"

type ArenaTab = "arenas" | "tournaments" | "seasons" | "conditions" | "rankings" | "replays" | "history"

const TABS: Array<{ id: ArenaTab; label: string; icon: React.ElementType }> = [
  { id: "arenas",      label: "Arenas",      icon: Swords },
  { id: "tournaments", label: "Tourneys",    icon: Trophy },
  { id: "seasons",     label: "Seasons",     icon: Calendar },
  { id: "conditions",  label: "Conditions",  icon: Zap },
  { id: "rankings",    label: "Rankings",    icon: BarChart3 },
  { id: "replays",     label: "Replays",     icon: Film },
  { id: "history",     label: "History",     icon: History },
]

export function ArenaHubPanel() {
  const [tab, setTab] = useState<ArenaTab>("arenas")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Swords className="w-5 h-5 text-yellow-500 mr-2" />
        <h2 className="text-lg font-bold mr-3">Arenas & Tournaments</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "arenas"      && <EntityManager section="arenas" />}
        {tab === "tournaments" && <EntityManager section="tournaments" />}
        {tab === "seasons"     && <EntityManager section="arena_seasons" />}
        {tab === "conditions"  && <EntityManager section="battle_conditions" />}
        {tab === "rankings"    && <EntityManager section="arena_rankings" />}
        {tab === "replays"     && <EntityManager section="battle_replays" />}
        {tab === "history"     && <EntityManager section="tourney_history" />}
      </div>
    </div>
  )
}
