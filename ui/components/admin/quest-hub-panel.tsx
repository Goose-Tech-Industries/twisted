"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { ScrollText, GitBranch, ClipboardList } from "lucide-react"
import { EntityManager } from "./entity-manager"
import { QuestBuilderPanel } from "./quest-builder-panel"
import { QuestBoardPanel } from "./questboard-panel"

type QuestTab = "list" | "builder" | "board"

const TABS: Array<{ id: QuestTab; label: string; icon: React.ElementType; description: string }> = [
  { id: "list",    label: "Quest List",    icon: ScrollText,    description: "All quests — create, edit, toggle" },
  { id: "builder", label: "Quest Builder", icon: GitBranch,     description: "Visual quest chain editor" },
  { id: "board",   label: "Quest Board",   icon: ClipboardList, description: "Board postings — bounties, events, faction quests" },
]

export function QuestHubPanel() {
  const [tab, setTab] = useState<QuestTab>("list")

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <ScrollText className="w-5 h-5 text-primary mr-2" />
        <h2 className="text-lg font-bold mr-4">Quests</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "list"    && <EntityManager section="quests" />}
        {tab === "builder" && <QuestBuilderPanel />}
        {tab === "board"   && <QuestBoardPanel />}
      </div>
    </div>
  )
}
