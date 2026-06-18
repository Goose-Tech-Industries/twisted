"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Wand2, GitBranch, Merge, Gem, Sparkles, Skull, BookOpen } from "lucide-react"
import { OghamPanel } from "./ogham-panel"
import { OghamFamilyPanel } from "./ogham-family-panel"
import { EntityManager } from "./entity-manager"

type OghamTab = "oghams" | "families" | "awakenings" | "shards" | "recipes" | "fusions" | "corruption" | "tomes" | "affinities" | "curses" | "enchantments" | "schools" | "rituals" | "resistances"

const TABS: Array<{ id: OghamTab; label: string; icon: React.ElementType }> = [
  { id: "oghams",       label: "Oghams",      icon: Wand2 },
  { id: "families",      label: "Families",    icon: GitBranch },
  { id: "awakenings",    label: "Awaken",      icon: Sparkles },
  { id: "shards",        label: "Shards",      icon: Gem },
  { id: "recipes",       label: "Recipes",     icon: Sparkles },
  { id: "fusions",       label: "Fusions",     icon: Merge },
  { id: "corruption",    label: "Corrupt",     icon: Skull },
  { id: "tomes",         label: "Tomes",       icon: BookOpen },
  { id: "affinities",    label: "Affinity",    icon: Gem },
  { id: "curses",        label: "Curses",      icon: Skull },
  { id: "enchantments",  label: "Enchant",     icon: Sparkles },
  { id: "schools",       label: "Schools",     icon: BookOpen },
  { id: "rituals",       label: "Rituals",     icon: Wand2 },
  { id: "resistances",   label: "Resist",      icon: GitBranch },
]

export function OghamHubPanel() {
  const [tab, setTab] = useState<OghamTab>("oghams")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Wand2 className="w-5 h-5 text-purple-400 mr-2" />
        <h2 className="text-lg font-bold mr-3">Oghams</h2>
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
        {tab === "oghams"       && <OghamPanel />}
        {tab === "families"     && <OghamFamilyPanel />}
        {tab === "awakenings"   && <EntityManager section="ogham_awakenings" />}
        {tab === "shards"       && <EntityManager section="ogham_shards" />}
        {tab === "recipes"      && <EntityManager section="shard_recipes" />}
        {tab === "fusions"      && <EntityManager section="ogham_fusions" />}
        {tab === "corruption"   && <EntityManager section="corruption_tiers" />}
        {tab === "tomes"        && <EntityManager section="spell_tomes" />}
        {tab === "affinities"   && <EntityManager section="elemental_affinities" />}
        {tab === "curses"       && <EntityManager section="item_curses" />}
        {tab === "enchantments" && <EntityManager section="enchantments" />}
        {tab === "schools"      && <EntityManager section="magic_schools" />}
        {tab === "rituals"      && <EntityManager section="rituals" />}
        {tab === "resistances"  && <EntityManager section="magic_resistances" />}
      </div>
    </div>
  )
}
