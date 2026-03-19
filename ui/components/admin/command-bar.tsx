"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Command, Search, X, Zap, Ban, Shield, Coins, MapPin, Megaphone, Users } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface CommandResult {
  label: string
  description: string
  icon: React.ElementType
  action: () => Promise<void> | void
  category: string
}

const API = ''

async function apiPost(endpoint: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include', body: JSON.stringify(body)
  })
  return r.json()
}

export function CommandBar({ onNavigate }: { onNavigate?: (section: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CommandResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); setQuery(""); setSelectedIdx(0) }
  }, [open])

  // Build command results based on query
  useEffect(() => {
    const q = query.trim().toLowerCase()

    const cmds: CommandResult[] = []

    // Navigation commands — all sections
    const sections = [
      // Overview
      { id: "dashboard", label: "Dashboard" }, { id: "players", label: "Players" },
      { id: "economy", label: "Economy" }, { id: "gm_tools", label: "GM Tools" },
      // World
      { id: "world_forge", label: "World Forge" }, { id: "world", label: "World State" },
      { id: "maps", label: "Maps" }, { id: "map_connections", label: "Map Links" },
      { id: "regions", label: "Regions" }, { id: "spawns", label: "Spawns" },
      { id: "world_events", label: "World Events" }, { id: "scheduler", label: "Scheduler" },
      { id: "region_weather", label: "Weather" }, { id: "npc_patrols", label: "NPC Patrols" },
      { id: "spawn_waves", label: "Spawn Waves" }, { id: "region_rep_gates", label: "Rep Gates" },
      // Content
      { id: "items", label: "Items" }, { id: "npcs", label: "NPCs" },
      { id: "quests", label: "Quests" }, { id: "quest_builder", label: "Quest Builder" },
      { id: "dialogue_builder", label: "Dialogue Builder" }, { id: "questboard", label: "Quest Board" },
      { id: "shop_supply", label: "Shops" }, { id: "loot_tables", label: "Loot Tables" },
      { id: "crafting", label: "Crafting" }, { id: "auction", label: "Auction" },
      { id: "achievements", label: "Achievements" },
      // Character
      { id: "classes", label: "Classes" }, { id: "races", label: "Races" },
      { id: "feats", label: "Feats" }, { id: "skills", label: "Skills" },
      { id: "ability_scores", label: "Ability Scores" }, { id: "stat", label: "Stat Engine" },
      { id: "class_skill", label: "Skill Assign" }, { id: "race_class_access", label: "Race/Class Access" },
      { id: "character_creator", label: "Creator Preview" },
      // Combat
      { id: "battle_config", label: "Battle Config" }, { id: "battle_cmd", label: "Battle Commands" },
      { id: "limit", label: "Limit Breaks" }, { id: "status", label: "Status Effects" },
      { id: "arenas", label: "Arenas" },
      // Magic
      { id: "oghams", label: "Oghams" }, { id: "ogham_family", label: "Ogham Families" },
      { id: "artifacts", label: "Artifacts" },
      // Staff
      { id: "gm_notes", label: "GM Notes" }, { id: "reports", label: "Reports" },
      { id: "live_social", label: "Live Social" }, { id: "referrals", label: "Referrals" },
      { id: "event_log", label: "Event Log" },
      // Config
      { id: "settings", label: "Settings" }, { id: "modules", label: "Modules" },
      { id: "templates", label: "Templates" }, { id: "assets", label: "Assets" },
    ]
    if (!q) {
      // Show popular sections by default
      setResults(sections.slice(0, 8).map(s => ({
        label: `Go to ${s.label}`, description: `Open ${s.label}`, icon: Command, category: "Navigate",
        action: () => { onNavigate?.(s.id); setOpen(false) }
      })))
      setSelectedIdx(0)
      return
    }

    for (const s of sections) {
      if (s.label.toLowerCase().includes(q) || s.id.includes(q)) {
        cmds.push({
          label: `Go to ${s.label}`, description: `Open ${s.label} panel`, icon: Command, category: "Navigate",
          action: () => { onNavigate?.(s.id); setOpen(false) }
        })
      }
    }

    // Action commands
    const banMatch = q.match(/^ban\s+(.+)/i)
    if (banMatch) {
      const target = banMatch[1]
      cmds.push({
        label: `Ban "${target}"`, description: "Ban player by username", icon: Ban, category: "Action",
        action: async () => {
          const r = await fetch(`/admin-panel/players?q=${encodeURIComponent(target)}`, { credentials: 'include' }).then(r => r.json())
          const players = r.data || r || []
          const p = (Array.isArray(players) ? players : []).find((p: Record<string, unknown>) =>
            String(p.username).toLowerCase() === target.toLowerCase())
          if (!p) { toast({ title: `Player "${target}" not found`, variant: "destructive" }); return }
          const res = await apiPost(`/admin-panel/player/${p.id}/ban`, { reason: "Banned via command bar" })
          toast({ title: res.success ? `${target} banned` : (res.message || "Failed"), variant: res.success ? undefined : "destructive" })
          setOpen(false)
        }
      })
    }

    const goldMatch = q.match(/^give\s+gold\s+(\d+)\s+to\s+(.+)/i)
    if (goldMatch) {
      const amount = parseInt(goldMatch[1])
      const target = goldMatch[2].trim()
      cmds.push({
        label: `Give ${amount}g to "${target}"`, description: "Grant gold to player's first character", icon: Coins, category: "Action",
        action: async () => {
          const r = await fetch(`/admin-panel/players?q=${encodeURIComponent(target)}`, { credentials: 'include' }).then(r => r.json())
          const players = r.data || []
          const p = (Array.isArray(players) ? players : []).find((p: Record<string, unknown>) =>
            String(p.username).toLowerCase() === target.toLowerCase())
          if (!p) { toast({ title: `Player "${target}" not found`, variant: "destructive" }); setOpen(false); return }
          // Get their first character
          const charRes = await fetch(`/admin-panel/player/${p.id}`, { credentials: 'include' }).then(r => r.json())
          const chars = charRes?.data?.chars || []
          if (!chars.length) { toast({ title: `${target} has no characters`, variant: "destructive" }); setOpen(false); return }
          const res = await apiPost(`/admin-panel/player/${chars[0].id}/give-gold`, { amount })
          toast({ title: res.success ? `Gave ${amount}g to ${target}` : (res.message || 'Failed'), variant: res.success ? undefined : "destructive" })
          setOpen(false)
        }
      })
    }

    const announceMatch = q.match(/^announce\s+(.+)/i)
    if (announceMatch) {
      const msg = announceMatch[1]
      cmds.push({
        label: `Announce: "${msg}"`, description: "Send server-wide announcement", icon: Megaphone, category: "Action",
        action: async () => {
          const r = await apiPost('/admin-panel/server-announce', { message: msg, style: 'info' })
          toast({ title: r.success ? "Announcement sent" : (r.message || "Failed"), variant: r.success ? undefined : "destructive" })
          setOpen(false)
        }
      })
    }

    const roleMatch = q.match(/^role\s+(\w+)\s+to\s+(\w+)/i)
    if (roleMatch) {
      const target = roleMatch[1]
      const role = roleMatch[2].toUpperCase()
      cmds.push({
        label: `Set ${target}'s role to ${role}`, description: "Change player role", icon: Shield, category: "Action",
        action: async () => {
          const r = await fetch(`/admin-panel/players?q=${encodeURIComponent(target)}`, { credentials: 'include' }).then(r => r.json())
          const players = r.data || []
          const p = (Array.isArray(players) ? players : []).find((p: Record<string, unknown>) =>
            String(p.username).toLowerCase() === target.toLowerCase())
          if (!p) { toast({ title: `Player "${target}" not found`, variant: "destructive" }); return }
          const res = await apiPost(`/admin-panel/player/${p.id}/role`, { role })
          toast({ title: res.success ? `Role set to ${role}` : (res.message || "Failed"), variant: res.success ? undefined : "destructive" })
          setOpen(false)
        }
      })
    }

    setResults(cmds.slice(0, 10))
    setSelectedIdx(0)
  }, [query, onNavigate])

  const runSelected = useCallback(() => {
    if (results[selectedIdx]) results[selectedIdx].action()
  }, [results, selectedIdx])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-background/80 backdrop-blur-sm"
      onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
              else if (e.key === "Enter") { e.preventDefault(); runSelected() }
              else if (e.key === "Escape") setOpen(false)
            }}
            placeholder='Type a command... (e.g. "ban user", "announce hello", "go to items")'
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          <kbd className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {results.length === 0 && query ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No commands match. Try: ban, announce, role, give gold, or a section name.
            </div>
          ) : (
            results.map((r, i) => (
              <button key={i}
                className={cn("w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  i === selectedIdx ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary/50")}
                onClick={() => r.action()}
                onMouseEnter={() => setSelectedIdx(i)}>
                <r.icon className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{r.description}</p>
                </div>
                <span className="text-[9px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded flex-shrink-0">{r.category}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span><kbd className="bg-secondary px-1 py-0.5 rounded">↑↓</kbd> navigate</span>
          <span><kbd className="bg-secondary px-1 py-0.5 rounded">↵</kbd> run</span>
          <span><kbd className="bg-secondary px-1 py-0.5 rounded">esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}
