"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Shield, Sparkles, ListChecks, ToggleLeft, GitBranch, Crown } from "lucide-react"
import { EntityManager } from "./entity-manager"
import { ClassSkillPanel } from "./class-skill-panel"

type ClassTab = "classes" | "subclasses" | "mastery" | "skills" | "skill_assign" | "race_access"

const TABS: Array<{ id: ClassTab; label: string; icon: React.ElementType }> = [
  { id: "classes",      label: "Classes",      icon: Shield },
  { id: "subclasses",   label: "Subclasses",   icon: GitBranch },
  { id: "mastery",      label: "Mastery",      icon: Crown },
  { id: "skills",       label: "Skills",       icon: Sparkles },
  { id: "skill_assign", label: "Assign",       icon: ListChecks },
  { id: "race_access",  label: "Access",       icon: ToggleLeft },
]

export function ClassHubPanel() {
  const [tab, setTab] = useState<ClassTab>("classes")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Shield className="w-5 h-5 text-primary mr-2" />
        <h2 className="text-lg font-bold mr-3">Classes</h2>
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
        {tab === "classes"      && <EntityManager section="classes" />}
        {tab === "subclasses"   && <EntityManager section="subclasses" />}
        {tab === "mastery"      && <EntityManager section="class_mastery" />}
        {tab === "skills"       && <EntityManager section="skills" />}
        {tab === "skill_assign" && <ClassSkillPanel />}
        {tab === "race_access"  && <EntityManager section="race_class_access" />}
      </div>
    </div>
  )
}
