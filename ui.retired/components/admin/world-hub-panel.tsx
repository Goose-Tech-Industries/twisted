"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Globe, Flame, Zap } from "lucide-react"
import { WorldForgePanel } from "./world-forge-panel"
import { WorldStatePanel } from "./world-state-panel"
import { EntityManager } from "./entity-manager"

type WorldTab = "state" | "forge" | "events"

const TABS: Array<{ id: WorldTab; label: string; icon: React.ElementType }> = [
  { id: "state",  label: "World State", icon: Globe },
  { id: "forge",  label: "World Forge", icon: Flame },
  { id: "events", label: "World Events", icon: Zap },
]

export function WorldHubPanel() {
  const [tab, setTab] = useState<WorldTab>("state")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Globe className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">World</h2>
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
        {tab === "state"  && <WorldStatePanel />}
        {tab === "forge"  && <WorldForgePanel />}
        {tab === "events" && <EntityManager section="world_events" />}
      </div>
    </div>
  )
}
