"use client"

import { useState } from "react"
import { AdminSidebar, AdminSection } from "@/components/admin/admin-sidebar"
import { DashboardPanel } from "@/components/admin/dashboard-panel"
import { PlayerManager } from "@/components/admin/player-manager"
import { EntityManager } from "@/components/admin/entity-manager"
import { GmToolsPanel } from "@/components/admin/gm-tools-panel"
import { EconomyPanel } from "@/components/admin/economy-panel"
import { VanillaPanel } from "@/components/admin/vanilla-panel"

export default function AdminSaucePage() {
  const [currentSection, setCurrentSection] = useState<AdminSection>("dashboard")

  // Vanilla sections are prefixed with "v:" — strip the prefix to get the manager key
  const isVanilla = currentSection.startsWith('v:')
  const vanillaKey = isVanilla ? currentSection.slice(2) : null

  const renderContent = () => {
    // ── Vanilla iframe sections ─────────────────────────────────
    // These load the full vanilla AdminSauce editor inside a styled iframe.
    // The vanilla app handles all the no-code editing: map tile canvas,
    // spawn zones, world forge, stat engine, module toggles, etc.
    if (isVanilla && vanillaKey) {
      return <VanillaPanel section={vanillaKey} />
    }

    // ── React-native sections ───────────────────────────────────
    switch (currentSection) {
      case "dashboard": return <DashboardPanel />
      case "players":   return <PlayerManager />
      case "economy":   return <EconomyPanel />
      case "gm_tools":  return <GmToolsPanel />

      // Simple CRUD — React EntityManager handles these cleanly
      case "items":
      case "skills":
      case "npcs":
      case "quests":
      case "classes":
      case "races":
      case "feats":
      case "shops":
      case "arenas":
      case "oghams":
      case "status":
      case "artifacts":
        return <EntityManager section={currentSection} />

      default:
        return (
          <div className="p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground">
            <p>Unknown section: {currentSection}</p>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
      />
      <main className="flex-1 overflow-y-auto p-4">
        {renderContent()}
      </main>
    </div>
  )
}
