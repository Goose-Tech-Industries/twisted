"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Shield, Flag, AlertTriangle, MessageSquare, Lock, Megaphone } from "lucide-react"
import { ReportsPanel } from "./social-reports-referral-panels"
import { EntityManager } from "./entity-manager"

type ModTab = "reports" | "warnings" | "appeals" | "auto_mod" | "permissions" | "broadcasts"

const TABS: Array<{ id: ModTab; label: string; icon: React.ElementType }> = [
  { id: "reports",     label: "Reports",     icon: Flag },
  { id: "warnings",    label: "Warnings",    icon: AlertTriangle },
  { id: "appeals",     label: "Appeals",     icon: MessageSquare },
  { id: "auto_mod",    label: "Auto-Mod",    icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
  { id: "broadcasts",  label: "Broadcasts",  icon: Megaphone },
]

export function ModerationHubPanel() {
  const [tab, setTab] = useState<ModTab>("reports")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <Shield className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Moderation</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap",
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
        {tab === "reports"     && <ReportsPanel />}
        {tab === "warnings"    && <EntityManager section="player_warnings" />}
        {tab === "appeals"     && <EntityManager section="player_appeals" />}
        {tab === "auto_mod"    && <EntityManager section="auto_mod_rules" />}
        {tab === "permissions" && <EntityManager section="staff_permissions" />}
        {tab === "broadcasts"  && <EntityManager section="broadcast_templates" />}
      </div>
    </div>
  )
}
