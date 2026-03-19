"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Store, Hammer, Gavel } from "lucide-react"
import { ShopSupplyPanel } from "./shop-supply-panel"
import { CraftManagerPanel } from "./craft-manager-panel"
import { AuctionPanel } from "./auction-panel"

type CommerceTab = "shops" | "crafting" | "auction"

const TABS: Array<{ id: CommerceTab; label: string; icon: React.ElementType }> = [
  { id: "shops",    label: "Shops",        icon: Store },
  { id: "crafting", label: "Crafting",     icon: Hammer },
  { id: "auction",  label: "Auction House", icon: Gavel },
]

export function CommerceHubPanel() {
  const [tab, setTab] = useState<CommerceTab>("shops")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0">
        <Store className="w-5 h-5 text-yellow-500 mr-2" />
        <h2 className="text-lg font-bold mr-3">Commerce</h2>
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
        {tab === "shops"    && <ShopSupplyPanel />}
        {tab === "crafting" && <CraftManagerPanel />}
        {tab === "auction"  && <AuctionPanel />}
      </div>
    </div>
  )
}
