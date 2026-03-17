"use client"

import { useState } from "react"
import { AdminSidebar, AdminSection } from "@/components/admin/admin-sidebar"
import { DashboardPanel } from "@/components/admin/dashboard-panel"
import { PlayerManager } from "@/components/admin/player-manager"
import { EntityManager } from "@/components/admin/entity-manager"
import { GmToolsPanel } from "@/components/admin/gm-tools-panel"
import { EconomyPanel } from "@/components/admin/economy-panel"

export default function AdminPage() {
  const [currentSection, setCurrentSection] = useState<AdminSection>('dashboard')

  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return <DashboardPanel />
      case 'players':
        return <PlayerManager />
      case 'economy':
        return <EconomyPanel />
      case 'gm_tools':
        return <GmToolsPanel />
      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Server Settings</h2>
            <p className="text-muted-foreground">Configure game parameters, rates, and server behavior.</p>
            <div className="p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground">
              Settings panel coming soon - connect to a server to configure
            </div>
          </div>
        )
      // All entity managers
      case 'items':
      case 'skills':
      case 'npcs':
      case 'quests':
      case 'classes':
      case 'races':
      case 'maps':
      case 'shops':
      case 'arenas':
      case 'oghams':
      case 'status':
      case 'feats':
      case 'artifacts':
        return <EntityManager section={currentSection} />
      case 'loot':
        return <EntityManager section="npcs" /> // Loot tables are on NPCs
      case 'spawns':
        return <EntityManager section="maps" /> // Spawns are on maps
      default:
        return (
          <div className="p-8 border border-dashed border-border rounded-lg text-center text-muted-foreground">
            Section not implemented: {currentSection}
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
      <main className="flex-1 overflow-y-auto p-6">
        {renderContent()}
      </main>
    </div>
  )
}
