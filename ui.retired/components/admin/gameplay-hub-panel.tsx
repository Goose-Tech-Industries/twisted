"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Hammer, Box, Bug, Sun, Key, Target, MapPin, Zap, Home, Package, Layers, BookOpen, Dices, Fish, Puzzle, Settings } from "lucide-react"
import { EntityManager } from "./entity-manager"

type GameplayTab = "gathering_skills" | "gathering_nodes" | "bank" | "capture" | "creatures" | "seasons" | "bounty_boards" | "bounty_tasks" | "treasure" | "mounts" | "housing" | "furniture" | "cards" | "card_rules" | "dice" | "fishing" | "puzzles" | "minigame_registry"

const TABS: Array<{ id: GameplayTab; label: string; icon: React.ElementType }> = [
  { id: "gathering_skills", label: "Skills",     icon: Hammer },
  { id: "gathering_nodes",  label: "Nodes",      icon: MapPin },
  { id: "bank",             label: "Bank",       icon: Box },
  { id: "capture",          label: "Capture",    icon: Bug },
  { id: "seasons",          label: "Seasons",    icon: Sun },
  { id: "bounty_boards",    label: "Bounties",   icon: Target },
  { id: "bounty_tasks",     label: "Tasks",      icon: Target },
  { id: "treasure",         label: "Treasure",   icon: Key },
  { id: "mounts",           label: "Mounts",     icon: Zap },
  { id: "housing",          label: "Plots",      icon: Home },
  { id: "furniture",        label: "Furniture",  icon: Package },
  { id: "cards",            label: "Cards",      icon: Layers },
  { id: "card_rules",      label: "Card Rules", icon: BookOpen },
  { id: "dice",            label: "Dice",       icon: Dices },
  { id: "fishing",         label: "Fishing",    icon: Fish },
  { id: "puzzles",         label: "Puzzles",    icon: Puzzle },
  { id: "minigame_registry", label: "Registry", icon: Settings },
]

export function GameplayHubPanel() {
  const [tab, setTab] = useState<GameplayTab>("gathering_skills")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <Hammer className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Gameplay Systems</h2>
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
        {tab === "gathering_skills" && <EntityManager section="gathering_skill" />}
        {tab === "gathering_nodes"  && <EntityManager section="gathering_node" />}
        {tab === "bank"             && <div className="p-6"><h3 className="text-lg font-bold mb-2">Bank / Vault</h3><p className="text-sm text-muted-foreground">Bank settings are in Battle Config → Gameplay Systems. Each character has {50} slots by default. Players deposit/withdraw at bank NPCs or housing storage chests.</p></div>}
        {tab === "capture"          && <EntityManager section="capture_item" />}
        {tab === "seasons"          && <EntityManager section="season_effect" />}
        {tab === "bounty_boards"    && <EntityManager section="bounty_board" />}
        {tab === "bounty_tasks"     && <EntityManager section="bounty_task" />}
        {tab === "treasure"         && <EntityManager section="treasure_trail" />}
        {tab === "mounts"           && <EntityManager section="mount" />}
        {tab === "housing"          && <EntityManager section="housing_plot" />}
        {tab === "furniture"        && <EntityManager section="furniture" />}
        {tab === "cards"            && <EntityManager section="card" />}
        {tab === "card_rules"      && <EntityManager section="card_rule" />}
        {tab === "dice"            && <EntityManager section="dice_table" />}
        {tab === "fishing"         && <EntityManager section="fishing_spot" />}
        {tab === "puzzles"         && <EntityManager section="puzzle" />}
        {tab === "minigame_registry" && <EntityManager section="minigame" />}
      </div>
    </div>
  )
}
