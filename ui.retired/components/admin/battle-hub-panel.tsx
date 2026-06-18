"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Settings, Swords, Zap, Sparkles, Link2, Users, Flame, Skull, Package, Merge, Layers, Mountain, Shield, Map, Crown, Crosshair, Briefcase, BookOpen, Castle } from "lucide-react"
import { BattleConfigPanel } from "./battle-config-panel"
import { BattleCmdPanel, LimitBreakPanel } from "./limit-battle-panels"
import { EntityManager } from "./entity-manager"

type BattleTab = "templates" | "config" | "commands" | "limits" | "ki_moves" | "sig_techs" | "combos" | "finishers" | "summons" | "fusions" | "battle_items" | "terrain" | "conditions" | "formations" | "raids" | "jobs" | "job_skills" | "terrain_rules" | "siege"

const TABS: Array<{ id: BattleTab; label: string; icon: React.ElementType }> = [
  { id: "templates",    label: "Templates",   icon: Layers },
  { id: "config",       label: "Settings",    icon: Settings },
  { id: "commands",     label: "Commands",    icon: Swords },
  { id: "limits",       label: "Limits",      icon: Zap },
  { id: "ki_moves",     label: "Ki",          icon: Flame },
  { id: "sig_techs",    label: "Sig Techs",   icon: Sparkles },
  { id: "combos",       label: "Combos",      icon: Link2 },
  { id: "finishers",    label: "Finishers",    icon: Skull },
  { id: "fusions",      label: "Fusions",      icon: Merge },
  { id: "summons",      label: "Summons",      icon: Users },
  { id: "battle_items", label: "Items",        icon: Package },
  { id: "terrain",      label: "Terrain",      icon: Mountain },
  { id: "conditions",   label: "Conditions",   icon: Shield },
  { id: "formations",   label: "Formations",   icon: Map },
  { id: "raids",        label: "Raids",        icon: Crown },
  { id: "jobs",         label: "Jobs",         icon: Briefcase },
  { id: "terrain_rules",label: "Terrain Rules", icon: Crosshair },
  { id: "job_skills",   label: "Job Skills",   icon: BookOpen },
  { id: "siege",        label: "Siege",        icon: Castle },
]

export function BattleHubPanel() {
  const [tab, setTab] = useState<BattleTab>("config")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Swords className="w-5 h-5 text-destructive mr-2" />
        <h2 className="text-lg font-bold mr-3">Battle System</h2>
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
        {tab === "templates" && <EntityManager section="battle_templates" />}
        {tab === "config"    && <BattleConfigPanel />}
        {tab === "commands"  && <BattleCmdPanel />}
        {tab === "limits"    && <LimitBreakPanel />}
        {tab === "ki_moves"  && <EntityManager section="ki_moves" />}
        {tab === "sig_techs" && <EntityManager section="sig_techs" />}
        {tab === "combos"    && <EntityManager section="combo_chains" />}
        {tab === "finishers" && <EntityManager section="finishing_moves" />}
        {tab === "fusions"   && <EntityManager section="fusions" />}
        {tab === "summons"   && <EntityManager section="summons" />}
        {tab === "battle_items" && <EntityManager section="battle_items" />}
        {tab === "terrain"      && <EntityManager section="battle_terrain" />}
        {tab === "conditions"   && <EntityManager section="battle_conditions" />}
        {tab === "formations"   && <EntityManager section="formation_shapes" />}
        {tab === "raids"        && <EntityManager section="raid_boss" />}
        {tab === "jobs"         && <EntityManager section="job" />}
        {tab === "terrain_rules" && <EntityManager section="terrain_interaction" />}
        {tab === "job_skills"    && <EntityManager section="job_skill" />}
        {tab === "siege"         && <EntityManager section="siege_structure" />}
      </div>
    </div>
  )
}
