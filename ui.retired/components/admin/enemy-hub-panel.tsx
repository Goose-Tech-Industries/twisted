"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Skull, Layers, TrendingUp } from "lucide-react"
import { NpcEditorPanel } from "./npc-editor-panel"
import { EntityManager } from "./entity-manager"

type EnemyTab = "enemies" | "loot" | "scaling"

const TABS: Array<{ id: EnemyTab; label: string; icon: React.ElementType }> = [
  { id: "enemies", label: "Enemies",     icon: Skull },
  { id: "loot",    label: "Loot Tables", icon: Layers },
  { id: "scaling", label: "Scaling",     icon: TrendingUp },
]

export function EnemyHubPanel() {
  const [tab, setTab] = useState<EnemyTab>("enemies")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Skull className="w-5 h-5 text-destructive mr-2" />
        <h2 className="text-lg font-bold mr-3">Enemies</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
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
        {tab === "enemies" && <NpcEditorPanel filterMode="enemy" />}
        {tab === "loot"    && <EntityManager section="loot_tables" />}
        {tab === "scaling" && <EntityManager section="enemy_scaling" />}
      </div>
    </div>
  )
}
