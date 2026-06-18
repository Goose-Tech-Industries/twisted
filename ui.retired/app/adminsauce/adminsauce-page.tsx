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
import { AIToolsPanel }          from "@/components/admin/ai-tools-panel"

// ── World ─────────────────────────────────────────────────────────
import { WorldHubPanel }         from "@/components/admin/world-hub-panel"
import { MapHubPanel }           from "@/components/admin/map-hub-panel"
import { SchedulerPanel }        from "@/components/admin/scheduler-panel"

// ── Content ───────────────────────────────────────────────────────
import { NpcEditorPanel }        from "@/components/admin/npc-editor-panel"
import { EnemyHubPanel }         from "@/components/admin/enemy-hub-panel"
import { QuestHubPanel }         from "@/components/admin/quest-hub-panel"
import { CommerceHubPanel }      from "@/components/admin/commerce-hub-panel"

// ── Character ─────────────────────────────────────────────────────
import { ClassHubPanel }         from "@/components/admin/class-hub-panel"
import { RaceHubPanel }          from "@/components/admin/race-hub-panel"
import { StatsHubPanel }         from "@/components/admin/stats-hub-panel"
import { CharacterCreatorPanel } from "@/components/admin/character-creator-panel"

// ── Combat ────────────────────────────────────────────────────────
import { BattleHubPanel }        from "@/components/admin/battle-hub-panel"
import { StatusHubPanel }        from "@/components/admin/status-hub-panel"
import { ArenaHubPanel }         from "@/components/admin/arena-hub-panel"

// ── Magic ─────────────────────────────────────────────────────────
import { OghamHubPanel }         from "@/components/admin/ogham-hub-panel"
import { ArtifactManagerPanel }  from "@/components/admin/artifact-manager-panel"

// ── Staff ─────────────────────────────────────────────────────────
import { GmNotesPanel }          from "@/components/admin/gm-notes-panel"
import { ModerationHubPanel }    from "@/components/admin/moderation-hub-panel"
import { LiveSocialPanel }       from "@/components/admin/social-reports-referral-panels"
import { ReferralPanel }         from "@/components/admin/social-reports-referral-panels"
import { AchievementPanel }      from "@/components/admin/achievement-panel"
import { EventLogPanel }         from "@/components/admin/event-log-panel"

// ── Config ────────────────────────────────────────────────────────
import { ConfigHubPanel }        from "@/components/admin/config-hub-panel"
import { RulesetEditorPanel }    from "@/components/admin/ruleset-editor-panel"
import { TechniqueEditorPanel }  from "@/components/admin/technique-editor-panel"

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

    // World — hub panels with internal tabs
    case 'world':             return <WorldHubPanel />
    case 'maps':              return <MapHubPanel />
    case 'scheduler':         return <SchedulerPanel />

    // Content
    case 'items':             return <EntityManager section="items" />
    case 'npcs':              return <NpcEditorPanel />
    case 'enemies':           return <EnemyHubPanel />
    case 'quests':            return <QuestHubPanel />
    case 'dialogue_builder':  return <EntityManager section="dialogue_scripts" />
    case 'shop_supply':       return <CommerceHubPanel />
    case 'achievements':      return <AchievementPanel />

    // Character — hub panels with internal tabs
    case 'classes':           return <ClassHubPanel />
    case 'races':             return <RaceHubPanel />
    case 'feats':             return <EntityManager section="feats" />
    case 'stat':              return <StatsHubPanel />
    case 'titles':            return <EntityManager section="titles" />
    case 'character_creator': return <CharacterCreatorPanel />

    // Combat — hub panels with internal tabs
    case 'battle_config':     return <BattleHubPanel />
    case 'status':            return <StatusHubPanel />
    case 'arenas':            return <ArenaHubPanel />

    // Magic — hub panel with 14 internal tabs
    case 'oghams':            return <OghamHubPanel />
    case 'artifacts':         return <ArtifactManagerPanel />

    // Staff
    case 'gm_notes':          return <GmNotesPanel />
    case 'moderation':        return <ModerationHubPanel />
    case 'live_social':       return <LiveSocialPanel />
    case 'referrals':         return <ReferralPanel />
    case 'event_log':         return <EventLogPanel />

    // AI Tools & Appearance
    case 'ai_tools':          return <AIToolsPanel />
    case 'themes':            return <EntityManager section="themes" />

    // Config — hub panel with internal tabs
    case 'settings':          return <ConfigHubPanel />
    case 'rulesets':          return <RulesetEditorPanel />
    case 'techniques':        return <TechniqueEditorPanel />

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
  const [section, setSection] = useState<AdminSection>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.slice(1) as AdminSection
      if (hash) return hash
      return (localStorage.getItem('admin_section') as AdminSection) || 'dashboard'
    }
    return 'dashboard'
  })
  const [authed,  setAuthed]  = useState<boolean | null>(null)

  useEffect(() => {
    checkStaff().then(ok => {
      if (!ok) window.location.href = '/?auth=required'
      else setAuthed(true)
    })
  }, [])

  const handleSectionChange = useCallback((s: AdminSection) => {
    setSection(s)
    localStorage.setItem('admin_section', s)
    window.history.replaceState(null, '', `#${s}`)
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
