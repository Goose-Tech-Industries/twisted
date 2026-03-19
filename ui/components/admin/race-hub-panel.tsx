"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { UserCog, Sparkles, BookOpen } from "lucide-react"
import { EntityManager } from "./entity-manager"

type RaceTab = "races" | "racial_abilities" | "backgrounds"

const TABS: Array<{ id: RaceTab; label: string; icon: React.ElementType }> = [
  { id: "races",             label: "Races",       icon: UserCog },
  { id: "racial_abilities",  label: "Abilities",   icon: Sparkles },
  { id: "backgrounds",       label: "Backgrounds", icon: BookOpen },
]

export function RaceHubPanel() {
  const [tab, setTab] = useState<RaceTab>("races")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <UserCog className="w-5 h-5 text-primary mr-2" />
        <h2 className="text-lg font-bold mr-3">Races</h2>
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
        {tab === "races"            && <EntityManager section="races" />}
        {tab === "racial_abilities" && <EntityManager section="racial_abilities" />}
        {tab === "backgrounds"      && <EntityManager section="backgrounds" />}
      </div>
    </div>
  )
}
