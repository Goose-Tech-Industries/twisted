"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Droplets, Shield } from "lucide-react"
import { EntityManager } from "./entity-manager"

type StatusTab = "effects" | "immunities"

const TABS: Array<{ id: StatusTab; label: string; icon: React.ElementType }> = [
  { id: "effects",    label: "Status Effects", icon: Droplets },
  { id: "immunities", label: "Immunities",     icon: Shield },
]

export function StatusHubPanel() {
  const [tab, setTab] = useState<StatusTab>("effects")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Droplets className="w-5 h-5 text-blue-400 mr-2" />
        <h2 className="text-lg font-bold mr-3">Status Effects</h2>
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
        {tab === "effects"    && <EntityManager section="status" />}
        {tab === "immunities" && <EntityManager section="status_immunities" />}
      </div>
    </div>
  )
}
