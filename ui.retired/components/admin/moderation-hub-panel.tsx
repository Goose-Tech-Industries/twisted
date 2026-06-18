"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Shield, Flag, AlertTriangle, MessageSquare, Lock, Megaphone, Users, BookOpen, User, Trash2, RefreshCw, Search } from "lucide-react"
import { ReportsPanel } from "./social-reports-referral-panels"
import { EntityManager } from "./entity-manager"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { adminApi } from "@/lib/admin-api"

type ModTab = "reports" | "warnings" | "appeals" | "auto_mod" | "permissions" | "broadcasts" | "lfp" | "guestbook" | "profiles"

const TABS: Array<{ id: ModTab; label: string; icon: React.ElementType }> = [
  { id: "reports",     label: "Reports",     icon: Flag },
  { id: "warnings",    label: "Warnings",    icon: AlertTriangle },
  { id: "appeals",     label: "Appeals",     icon: MessageSquare },
  { id: "auto_mod",    label: "Auto-Mod",    icon: Shield },
  { id: "permissions", label: "Permissions", icon: Lock },
  { id: "broadcasts",  label: "Broadcasts",  icon: Megaphone },
  { id: "lfp",         label: "LFP Board",   icon: Users },
  { id: "guestbook",   label: "Guestbook",   icon: BookOpen },
  { id: "profiles",    label: "Profiles",    icon: User },
]

export function ModerationHubPanel() {
  const [tab, setTab] = useState<ModTab>("reports")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <Shield className="w-5 h-5 text-red-400 mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Moderation</h2>
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
        {tab === "reports"     && <ReportsPanel />}
        {tab === "warnings"    && <EntityManager section="player_warnings" />}
        {tab === "appeals"     && <EntityManager section="player_appeals" />}
        {tab === "auto_mod"    && <EntityManager section="auto_mod_rules" />}
        {tab === "permissions" && <EntityManager section="staff_permissions" />}
        {tab === "broadcasts"  && <EntityManager section="broadcast_templates" />}
        {tab === "lfp"         && <LfpAdminPanel />}
        {tab === "guestbook"   && <GuestbookAdminPanel />}
        {tab === "profiles"    && <ProfileAdminPanel />}
      </div>
    </div>
  )
}

// ── LFP Admin: view and clear listings ──────────────────────────
function LfpAdminPanel() {
  const [listings, setListings] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/lfp/board', { credentials: 'include' })
      const d = await r.json()
      if (d.success) setListings(d.listings || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const clearAll = async () => {
    if (!confirm('Clear all LFP listings?')) return
    await fetch('/api/lfp/cleanup', { method: 'POST', credentials: 'include' })
    load()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Active LFP Listings ({listings.length})</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh</Button>
          <Button size="sm" variant="destructive" onClick={clearAll}><Trash2 className="w-3.5 h-3.5 mr-1" />Clear All</Button>
        </div>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : listings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No active LFP listings.</p>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {listings.map((l: Record<string, unknown>) => (
              <div key={l.id as number} className="flex items-center justify-between p-2 rounded border border-border bg-card/50">
                <div className="text-sm">
                  <span className="font-medium">{l.character_name as string}</span>
                  <span className="text-muted-foreground"> Lv.{l.level as number} {l.class_name as string}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">{l.role as string}</Badge>
                  {!!l.note && <span className="text-xs text-muted-foreground ml-2">{l.note as string}</span>}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

// ── Guestbook Admin: moderate posts ─────────────────────────────
function GuestbookAdminPanel() {
  const [charName, setCharName] = useState('')
  const [entries, setEntries] = useState<Array<Record<string, unknown>>>([])
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!charName.trim()) return
    setLoading(true)
    try {
      // Find character by name first
      const cr = await fetch('/game/get-char-by-name', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: charName.trim() })
      })
      const cd = await cr.json()
      if (!cd.success) { setEntries([]); setLoading(false); return }
      // Load their guestbook
      const gr = await fetch(`/api/guestbook/${cd.charId}`, { credentials: 'include' })
      const gd = await gr.json()
      setEntries(gd.success ? (gd.entries || gd.data || []) : [])
    } catch {}
    setLoading(false)
  }

  const deleteEntry = async (id: number) => {
    if (!confirm('Delete this guestbook entry?')) return
    await fetch('/api/guestbook/delete', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: id })
    })
    setEntries(prev => prev.filter(e => (e.id as number) !== id))
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <Input value={charName} onChange={e => setCharName(e.target.value)} placeholder="Character name..." className="max-w-xs" onKeyDown={e => e.key === 'Enter' && search()} />
        <Button size="sm" onClick={search}><Search className="w-3.5 h-3.5 mr-1" />Load Guestbook</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No entries found. Search a character name above.</p>
      ) : (
        <ScrollArea className="h-[400px]">
          <div className="space-y-2">
            {entries.map((e: Record<string, unknown>) => (
              <div key={e.id as number} className="flex items-start justify-between gap-2 p-2 rounded border border-border bg-card/50">
                <div className="text-sm min-w-0">
                  <span className="font-medium" style={{ color: (e.author_color as string) || undefined }}>{e.author_name as string}</span>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{e.message as string}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-1">{new Date(e.created_at as string).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => deleteEntry(e.id as number)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

// ── Profile Admin: view/reset player profiles ───────────────────
function ProfileAdminPanel() {
  const [charName, setCharName] = useState('')
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)

  const search = async () => {
    if (!charName.trim()) return
    setLoading(true)
    try {
      const cr = await fetch('/game/get-char-by-name', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: charName.trim() })
      })
      const cd = await cr.json()
      if (cd.success && cd.character) {
        setProfile(cd.character)
      } else {
        setProfile(null)
      }
    } catch {}
    setLoading(false)
  }

  const resetProfile = async () => {
    if (!profile || !confirm('Reset this player\'s profile? (Bio, color, banner, quote, signature will be cleared)')) return
    try {
      await adminApi.entity.save('character' as never, {
        id: profile.id,
        profile_bio: null,
        profile_color: '#bb86fc',
        profile_banner_emoji: '⚔️',
        profile_favorite_quote: null,
        profile_signature: null,
        profile_music_url: null,
        profile_background: null,
        profile_status: null,
      })
      search() // Reload
    } catch {}
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex gap-2">
        <Input value={charName} onChange={e => setCharName(e.target.value)} placeholder="Character name..." className="max-w-xs" onKeyDown={e => e.key === 'Enter' && search()} />
        <Button size="sm" onClick={search}><Search className="w-3.5 h-3.5 mr-1" />Load Profile</Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : !profile ? (
        <p className="text-sm text-muted-foreground text-center py-8">Search a character name to view their profile data.</p>
      ) : (
        <div className="space-y-3 rounded border border-border bg-card/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold" style={{ color: (profile.profile_color as string) || '#bb86fc' }}>
                {profile.profile_banner_emoji as string || '⚔️'} {profile.name as string}
              </h3>
              <p className="text-xs text-muted-foreground">Lv.{profile.level as number} — ID: {profile.id as number}</p>
            </div>
            <Button size="sm" variant="destructive" onClick={resetProfile}>Reset Profile</Button>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-muted-foreground">Bio:</span> <span className="text-foreground">{(profile.profile_bio as string) || '(none)'}</span></div>
            <div><span className="text-muted-foreground">Color:</span> <span style={{ color: (profile.profile_color as string) || '#bb86fc' }}>{profile.profile_color as string}</span></div>
            <div><span className="text-muted-foreground">Quote:</span> <span className="text-foreground italic">{(profile.profile_favorite_quote as string) || '(none)'}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="text-foreground">{(profile.profile_status as string) || '(none)'}</span></div>
            <div><span className="text-muted-foreground">Views:</span> <span className="text-foreground">{profile.profile_views as number || 0}</span></div>
            <div><span className="text-muted-foreground">Music:</span> <span className="text-foreground truncate">{(profile.profile_music_url as string) || '(none)'}</span></div>
          </div>
          {!!profile.profile_signature && (
            <div className="text-sm"><span className="text-muted-foreground">Signature:</span> <div className="mt-1 p-2 rounded bg-muted/30 text-xs" dangerouslySetInnerHTML={{ __html: profile.profile_signature as string }} /></div>
          )}
        </div>
      )}
    </div>
  )
}
