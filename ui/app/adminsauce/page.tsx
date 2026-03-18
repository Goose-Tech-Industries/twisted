"use client"

// =================================================================
// /adminsauce — Twisted Engine Admin Panel
// File:  ui/app/adminsauce/page.tsx
// URL:   /adminsauce  (never changes)
//
// Auth: GET /auth/me → { success, role }
//       Redirects to / if role is not staff.
//
// ALL sections are now native React — the vanilla iframe (VanillaPanel)
// is no longer needed for any section.
// =================================================================

import { useEffect, useState, useCallback, Suspense } from "react"
import { AdminSidebar, type AdminSection } from "@/components/admin/admin-sidebar"

// ── Overview ──────────────────────────────────────────────────────
import { DashboardPanel }        from "@/components/admin/dashboard-panel"
import { PlayerManager }         from "@/components/admin/player-manager"
import { EconomyPanel }          from "@/components/admin/economy-panel"
import { GmToolsPanel }          from "@/components/admin/gm-tools-panel"

// ── Generic CRUD (items, quests, classes, races, feats, etc.) ─────
import { EntityManager }         from "@/components/admin/entity-manager"

// ── World ─────────────────────────────────────────────────────────
import { WorldForgePanel }       from "@/components/admin/world-forge-panel"
import { WorldStatePanel }       from "@/components/admin/world-state-panel"
import { MapManagerPanel }       from "@/components/admin/map-manager-panel"
import { RegionManagerPanel }    from "@/components/admin/region-manager-panel"
import { SpawnManagerPanel }     from "@/components/admin/spawn-manager-panel"
import { MapConnectionsPanel }   from "@/components/admin/map-connections-panel"
import { SchedulerPanel }        from "@/components/admin/scheduler-panel"

// ── Content ───────────────────────────────────────────────────────
import { NpcEditorPanel }        from "@/components/admin/npc-editor-panel"
import { QuestBoardPanel }       from "@/components/admin/questboard-panel"
import { ShopSupplyPanel }       from "@/components/admin/shop-supply-panel"
import { LootTablePanel }        from "@/components/admin/loot-table-panel"
import { CraftManagerPanel }     from "@/components/admin/craft-manager-panel"
import { AuctionPanel }          from "@/components/admin/auction-panel"

// ── Character ─────────────────────────────────────────────────────
import { StatEnginePanel }       from "@/components/admin/stat-engine-panel"
import { CharacterCreatorPanel } from "@/components/admin/character-creator-panel"
import { ClassSkillPanel }       from "@/components/admin/class-skill-panel"

// ── Combat ────────────────────────────────────────────────────────
import { LimitBreakPanel }       from "@/components/admin/limit-battle-panels"
import { BattleCmdPanel }        from "@/components/admin/limit-battle-panels"
import { BattleConfigPanel }     from "@/components/admin/battle-config-panel"
import { TemplatePickerPanel }   from "@/components/admin/template-picker-panel"
import { AssetManagerPanel }     from "@/components/admin/asset-manager-panel"
import { QuestBuilderPanel }     from "@/components/admin/quest-builder-panel"
import { DialogueBuilderPanel }  from "@/components/admin/dialogue-builder-panel"

// ── Magic ─────────────────────────────────────────────────────────
import { OghamPanel }            from "@/components/admin/ogham-panel"
import { OghamFamilyPanel }      from "@/components/admin/ogham-family-panel"
import { ArtifactManagerPanel }  from "@/components/admin/artifact-manager-panel"

// ── Staff ─────────────────────────────────────────────────────────
import { GmNotesPanel }          from "@/components/admin/gm-notes-panel"
import { LiveSocialPanel }       from "@/components/admin/social-reports-referral-panels"
import { ReportsPanel }          from "@/components/admin/social-reports-referral-panels"
import { ReferralPanel }         from "@/components/admin/social-reports-referral-panels"
import { AchievementPanel }      from "@/components/admin/achievement-panel"
import { EventLogPanel }         from "@/components/admin/event-log-panel"

// ── Config ────────────────────────────────────────────────────────
import { SettingsPanel }         from "@/components/admin/settings-panel"
import { ModulesPanel }          from "@/components/admin/modules-panel"

// ─────────────────────────────────────────────────────────────────

const STAFF_ROLES = new Set(['ADMIN', 'OWNER', 'GM', 'MOD', 'STAFF'])

async function checkStaff(): Promise<boolean> {
  try {
    const r = await fetch('/auth/me', { credentials: 'include' })
    const d = await r.json()
    return d.success && STAFF_ROLES.has((d.role || '').toUpperCase())
  } catch {
    return false
  }
}

function SectionContent({ section }: { section: AdminSection }) {
  switch (section) {
    // Overview
    case 'dashboard':         return <DashboardPanel />
    case 'players':           return <PlayerManager />
    case 'economy':           return <EconomyPanel />
    case 'gm_tools':          return <GmToolsPanel />

    // World
    case 'world_forge':       return <WorldForgePanel />
    case 'world':             return <WorldStatePanel />
    case 'maps':              return <MapManagerPanel />
    case 'regions':           return <RegionManagerPanel />
    case 'spawns':            return <SpawnManagerPanel />
    case 'map_connections':   return <MapConnectionsPanel />
    case 'scheduler':         return <SchedulerPanel />

    // Content
    case 'items':             return <EntityManager section="items" />
    case 'npcs':              return <NpcEditorPanel />
    case 'quests':            return <EntityManager section="quests" />
    case 'quest_builder':     return <QuestBuilderPanel />
    case 'dialogue_builder':  return <DialogueBuilderPanel />
    case 'questboard':        return <QuestBoardPanel />
    case 'shop_supply':       return <ShopSupplyPanel />
    case 'loot_tables':       return <LootTablePanel />
    case 'crafting':          return <CraftManagerPanel />
    case 'auction':           return <AuctionPanel />

    // Character
    case 'classes':           return <EntityManager section="classes" />
    case 'races':             return <EntityManager section="races" />
    case 'feats':             return <EntityManager section="feats" />
    case 'stat':              return <StatEnginePanel />
    case 'class_skill':       return <ClassSkillPanel />
    case 'character_creator': return <CharacterCreatorPanel />

    // Templates + Assets
    case 'templates':         return <TemplatePickerPanel />
    case 'assets':            return <AssetManagerPanel />

    // Combat
    case 'battle_config':     return <BattleConfigPanel />
    case 'battle_cmd':        return <BattleCmdPanel />
    case 'limit':             return <LimitBreakPanel />
    case 'status':            return <EntityManager section="status" />
    case 'arenas':            return <EntityManager section="arenas" />

    // Magic
    case 'oghams':            return <OghamPanel />
    case 'ogham_family':      return <OghamFamilyPanel />
    case 'artifacts':         return <ArtifactManagerPanel />
    case 'skills':            return <EntityManager section="skills" />

    // Staff
    case 'gm_notes':          return <GmNotesPanel />
    case 'live_social':       return <LiveSocialPanel />
    case 'reports':           return <ReportsPanel />
    case 'referrals':         return <ReferralPanel />
    case 'achievements':      return <AchievementPanel />
    case 'event_log':         return <EventLogPanel />

    // Config
    case 'settings':          return <SettingsPanel />
    case 'modules':           return <ModulesPanel />

    default:
      return (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <div className="text-center">
            <div className="text-4xl mb-3">🔧</div>
            <p className="text-sm">Section <code className="text-primary bg-secondary px-1 py-0.5 rounded">{section}</code> is not wired up yet.</p>
          </div>
        </div>
      )
  }
}

export default function AdminSaucePage() {
  const [section, setSection] = useState<AdminSection>('dashboard')
  const [authed,  setAuthed]  = useState<boolean | null>(null)

  useEffect(() => {
    checkStaff().then(ok => {
      if (!ok) window.location.href = '/?auth=required'
      else setAuthed(true)
    })
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem('admin_section') as AdminSection | null
    if (saved) setSection(saved)
  }, [])

  const handleSectionChange = useCallback((s: AdminSection) => {
    setSection(s)
    sessionStorage.setItem('admin_section', s)
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Checking access…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AdminSidebar currentSection={section} onSectionChange={handleSectionChange} />
      <main className="flex-1 overflow-y-auto min-w-0">
        <Suspense fallback={
          <div className="flex items-center justify-center h-64">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <SectionContent section={section} />
        </Suspense>
      </main>
    </div>
  )
}
