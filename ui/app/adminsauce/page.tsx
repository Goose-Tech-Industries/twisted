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
import { MapHubPanel }           from "@/components/admin/map-hub-panel"
import { WorldHubPanel }         from "@/components/admin/world-hub-panel"
import { SchedulerPanel }        from "@/components/admin/scheduler-panel"

// ── Content ───────────────────────────────────────────────────────
import { NpcEditorPanel }        from "@/components/admin/npc-editor-panel"
import { QuestBoardPanel }       from "@/components/admin/questboard-panel"
import { QuestHubPanel }         from "@/components/admin/quest-hub-panel"
import { EnemyHubPanel }         from "@/components/admin/enemy-hub-panel"
import { CommerceHubPanel }      from "@/components/admin/commerce-hub-panel"
import { ShopSupplyPanel }       from "@/components/admin/shop-supply-panel"
import { LootTablePanel }        from "@/components/admin/loot-table-panel"
import { CraftManagerPanel }     from "@/components/admin/craft-manager-panel"
import { AuctionPanel }          from "@/components/admin/auction-panel"

// ── Character ─────────────────────────────────────────────────────
import { StatEnginePanel }       from "@/components/admin/stat-engine-panel"
import { CharacterCreatorPanel } from "@/components/admin/character-creator-panel"
import { ClassSkillPanel }       from "@/components/admin/class-skill-panel"
import { ClassHubPanel }         from "@/components/admin/class-hub-panel"
import { StatsHubPanel }         from "@/components/admin/stats-hub-panel"
import { RaceHubPanel }          from "@/components/admin/race-hub-panel"

// ── Combat ────────────────────────────────────────────────────────
import { LimitBreakPanel }       from "@/components/admin/limit-battle-panels"
import { BattleCmdPanel }        from "@/components/admin/limit-battle-panels"
import { BattleHubPanel }        from "@/components/admin/battle-hub-panel"
import { ArenaHubPanel }         from "@/components/admin/arena-hub-panel"
import { StatusHubPanel }        from "@/components/admin/status-hub-panel"
import { ModerationHubPanel }    from "@/components/admin/moderation-hub-panel"
import { BattleConfigPanel }     from "@/components/admin/battle-config-panel"
import { TemplatePickerPanel }   from "@/components/admin/template-picker-panel"
import { AssetManagerPanel }     from "@/components/admin/asset-manager-panel"
import { QuestBuilderPanel }     from "@/components/admin/quest-builder-panel"
import { DialogueBuilderPanel }  from "@/components/admin/dialogue-builder-panel"

// ── Magic ─────────────────────────────────────────────────────────
import { OghamPanel }            from "@/components/admin/ogham-panel"
import { OghamFamilyPanel }      from "@/components/admin/ogham-family-panel"
import { OghamHubPanel }         from "@/components/admin/ogham-hub-panel"
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
import { ConfigHubPanel }        from "@/components/admin/config-hub-panel"

// ── Staff Messenger + Command Bar + Notes Strip ─────────────────
import { StaffMessenger }        from "@/components/admin/staff-messenger"
import { CommandBar }            from "@/components/admin/command-bar"
import { GmNotesStrip }          from "@/components/admin/gm-notes-strip"

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

function SectionContent({ section, onNavigate }: { section: AdminSection; onNavigate: (s: AdminSection) => void }) {
  switch (section) {
    // Overview
    case 'dashboard':         return <DashboardPanel onNavigate={s => onNavigate(s as AdminSection)} />
    case 'players':           return <PlayerManager />
    case 'economy':           return <EconomyPanel />
    case 'gm_tools':          return <GmToolsPanel />

    // World
    case 'world_forge':       return <WorldHubPanel />
    case 'world':             return <WorldHubPanel />
    case 'world_events':      return <WorldHubPanel />
    case 'maps':              return <MapHubPanel />
    case 'map_connections':   return <MapHubPanel />
    case 'regions':           return <MapHubPanel />
    case 'spawns':            return <MapHubPanel />
    case 'spawn_waves':       return <MapHubPanel />
    case 'region_weather':    return <MapHubPanel />
    case 'region_rep_gates':  return <MapHubPanel />
    case 'npc_patrols':       return <EntityManager section="npc_patrols" />
    case 'scheduler':         return <SchedulerPanel />

    // Content
    case 'items':             return <EntityManager section="items" />
    case 'item_sets':         return <EntityManager section="item_sets" />
    case 'npc_schedules':     return <EntityManager section="npc_schedules" />
    case 'enemy_scaling':     return <EnemyHubPanel />
    case 'npcs':              return <NpcEditorPanel filterMode="friendly" />
    case 'enemies':           return <EnemyHubPanel />
    case 'quests':            return <QuestHubPanel />
    case 'quest_builder':     return <QuestHubPanel />
    case 'questboard':        return <QuestHubPanel />
    case 'dialogue_builder':  return <DialogueBuilderPanel />
    case 'shop_supply':       return <CommerceHubPanel />
    case 'loot_tables':       return <EnemyHubPanel />
    case 'crafting':          return <CommerceHubPanel />
    case 'auction':           return <CommerceHubPanel />

    // Character
    case 'classes':           return <ClassHubPanel />
    case 'skills':            return <ClassHubPanel />
    case 'class_skill':       return <ClassHubPanel />
    case 'race_class_access': return <ClassHubPanel />
    case 'races':             return <RaceHubPanel />
    case 'feats':             return <EntityManager section="feats" />
    case 'stat':              return <StatsHubPanel />
    case 'ability_scores':    return <StatsHubPanel />
    case 'titles':            return <EntityManager section="titles" />
    case 'character_creator': return <CharacterCreatorPanel />

    // Templates + Assets
    case 'templates':         return <TemplatePickerPanel />
    case 'assets':            return <AssetManagerPanel />

    // Combat
    case 'battle_config':     return <BattleHubPanel />
    case 'battle_cmd':        return <BattleHubPanel />
    case 'limit':             return <BattleHubPanel />
    case 'status':            return <StatusHubPanel />
    case 'arenas':            return <ArenaHubPanel />

    // Magic
    case 'oghams':            return <OghamHubPanel />
    case 'ogham_family':      return <OghamHubPanel />
    case 'artifacts':         return <ArtifactManagerPanel />
    case 'artifact_rivalry':  return <EntityManager section="artifact_rivalries" />

    // Staff
    case 'gm_notes':          return <GmNotesPanel />
    case 'moderation':        return <ModerationHubPanel />
    case 'reports':           return <ModerationHubPanel />
    case 'live_social':       return <LiveSocialPanel />
    case 'referrals':         return <ReferralPanel />
    case 'achievements':      return <AchievementPanel />
    case 'event_log':         return <EventLogPanel />

    // Config
    case 'settings':          return <ConfigHubPanel />
    case 'modules':           return <ConfigHubPanel />
    case 'templates':         return <ConfigHubPanel />
    case 'assets':            return <ConfigHubPanel />

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
      <main className="flex-1 overflow-y-auto min-w-0 flex flex-col">
        <GmNotesStrip />
        <div className="flex-1 overflow-y-auto">
          <Suspense fallback={
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <SectionContent section={section} onNavigate={handleSectionChange} />
          </Suspense>
        </div>
      </main>
      <StaffMessenger />
      <CommandBar onNavigate={s => handleSectionChange(s as AdminSection)} />
    </div>
  )
}
