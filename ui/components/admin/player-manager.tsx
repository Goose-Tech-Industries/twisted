"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Search, Ban, UserCheck, LogOut, MapPin, Package, Coins,
  TrendingUp, ChevronDown, ChevronUp, Shield, RefreshCw,
  MessageSquare, Heart, Edit, Key, X, Check, Swords, Zap, Filter
} from "lucide-react"
import adminApi from "@/lib/admin-api"

// ── Types ─────────────────────────────────────────────────────────
interface CharDetail {
  id: number; name: string; level: number; class_name: string
  race_name?: string; gold: number; map_id: number; x: number; y: number
  current_hp: number; max_hp: number; current_mp: number; max_mp: number
  atk: number; def: number; mo: number; md: number; speed: number; luck: number
  experience: number; limitbreak: number; breaklevel: number
  inv_count?: number; equipment?: Array<{ slot_key: string; name: string; icon: string }>
}

interface PlayerDetail {
  id: number; username: string; email?: string; role: string
  is_banned: boolean; last_login: string; created_at?: string
  gold?: number; currency?: number; online?: boolean
  chars?: CharDetail[]
}

interface PlayerRow {
  id: number; username: string; role: string; is_banned: boolean
  last_login: string; gold?: number; char_count?: number; online?: boolean
}

// ── Helpers ───────────────────────────────────────────────────────
function isRec(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function toStr(v: unknown, fb = "") { return typeof v === "string" ? v : v == null ? fb : String(v) }
function toNum(v: unknown, fb = 0) { const n = Number(v); return Number.isFinite(n) ? n : fb }

function extractRows(input: unknown): PlayerRow[] {
  const raw: unknown[] = Array.isArray(input) ? input
    : isRec(input) && Array.isArray((input as Record<string,unknown>).data)
      ? ((input as Record<string,unknown>).data as unknown[]) : []
  return raw.filter(isRec).map(r => ({
    id: toNum(r.id), username: toStr(r.username, `user_${r.id}`),
    role: toStr(r.role, "PLAYER"), is_banned: Boolean(r.is_banned),
    last_login: toStr(r.last_login),
    gold: r.currency !== undefined ? toNum(r.currency) : r.gold !== undefined ? toNum(r.gold) : undefined,
    char_count: r.char_count !== undefined ? toNum(r.char_count) : undefined,
    online: Boolean(r.online),
  })).filter(p => p.id > 0)
}

const ROLES = ["PLAYER", "MOD", "GM", "ADMIN"]
const ROLE_STYLE: Record<string, string> = {
  ADMIN: "bg-primary/20 text-primary border-primary/30",
  OWNER: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  GM:    "bg-blue-500/20 text-blue-400 border-blue-500/30",
  MOD:   "bg-green-500/20 text-green-400 border-green-500/30",
  STAFF: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  PLAYER:"bg-secondary text-muted-foreground border-border",
}

// ── Edit Modal ────────────────────────────────────────────────────
function EditUserModal({ player, onClose, onSaved }: {
  player: PlayerDetail
  onClose: () => void
  onSaved: (updated: Partial<PlayerDetail>) => void
}) {
  const [username, setUsername] = useState(player.username)
  const [email, setEmail] = useState(player.email || "")
  const [currency, setCurrency] = useState(String(player.currency ?? player.gold ?? 0))
  const [newPw, setNewPw] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    setSaving(true); setError("")
    try {
      const body: Record<string, unknown> = { userId: player.id }
      if (username !== player.username) body.username = username
      if (email && email !== player.email) body.email = email
      if (currency !== String(player.currency ?? player.gold ?? 0)) body.currency = parseInt(currency)

      if (Object.keys(body).length > 1) {
        const r = await fetch("/admin-panel/player/edit-user", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify(body)
        }).then(r => r.json())
        if (!r.success) { setError(r.message || "Failed"); setSaving(false); return }
      }

      if (newPw) {
        const r = await fetch("/admin-panel/player/reset-password", {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include", body: JSON.stringify({ userId: player.id, newPassword: newPw })
        }).then(r => r.json())
        if (!r.success) { setError(r.message || "Failed to reset password"); setSaving(false); return }
      }

      onSaved({ username, email, currency: parseInt(currency) })
      onClose()
    } catch { setError("Server error") }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="celtic-border w-full max-w-md">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Edit Account — {player.username}</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Username</label>
              <Input value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Email</label>
              <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Account Currency</label>
              <Input value={currency} onChange={e => setCurrency(e.target.value)} type="number" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">New Password (leave blank to keep)</label>
              <Input value={newPw} onChange={e => setNewPw(e.target.value)} type="password" placeholder="New password..." />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={saving} className="flex-1 blood-glow">
              {saving ? "Saving..." : <><Check className="w-4 h-4 mr-1" />Save</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Edit Character Modal ──────────────────────────────────────────
function EditCharModal({ char, onClose, onSaved }: {
  char: CharDetail
  onClose: () => void
  onSaved: () => void
}) {
  const [fields, setFields] = useState({
    name: char.name, level: String(char.level), gold: String(char.gold),
    experience: String(char.experience),
    max_hp: String(char.max_hp), current_hp: String(char.current_hp),
    max_mp: String(char.max_mp), current_mp: String(char.current_mp),
    atk: String(char.atk), def: String(char.def), mo: String(char.mo),
    md: String(char.md), speed: String(char.speed), luck: String(char.luck),
    map_id: String(char.map_id), x: String(char.x), y: String(char.y),
    limitbreak: String(char.limitbreak), breaklevel: String(char.breaklevel),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(prev => ({ ...prev, [k]: e.target.value }))

  const save = async () => {
    setSaving(true); setError("")
    try {
      const body: Record<string, unknown> = { charId: char.id }
      for (const [k, v] of Object.entries(fields)) {
        if (k === "name" && v !== char.name) body.name = v
        else if (k !== "name") {
          const orig = String((char as unknown as Record<string,unknown>)[k] ?? "")
          if (v !== orig) body[k] = k === "name" ? v : Number(v)
        }
      }
      if (Object.keys(body).length <= 1) { onClose(); return }
      const r = await fetch("/admin-panel/player/edit-char", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body)
      }).then(r => r.json())
      if (!r.success) { setError(r.message || "Failed"); setSaving(false); return }
      onSaved(); onClose()
    } catch { setError("Server error") }
    setSaving(false)
  }

  const F = ({ label, k, type = "number" }: { label: string; k: string; type?: string }) => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <Input value={fields[k as keyof typeof fields]} onChange={set(k)} type={type} className="h-8 text-sm" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <Card className="celtic-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Edit Character — {char.name}</h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name</label>
            <Input value={fields.name} onChange={set("name")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <F label="Level" k="level" />
            <F label="Experience" k="experience" />
            <F label="Gold" k="gold" />
            <F label="Limit Break %" k="limitbreak" />
            <F label="Break Level" k="breaklevel" />
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stats</p>
          <div className="grid grid-cols-3 gap-3">
            <F label="Max HP" k="max_hp" /><F label="Current HP" k="current_hp" />
            <F label="Max MP" k="max_mp" /><F label="Current MP" k="current_mp" />
            <F label="ATK" k="atk" /><F label="DEF" k="def" />
            <F label="MO" k="mo" /><F label="MD" k="md" />
            <F label="Speed" k="speed" /><F label="Luck" k="luck" />
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Position</p>
          <div className="grid grid-cols-3 gap-3">
            <F label="Map ID" k="map_id" /><F label="X" k="x" /><F label="Y" k="y" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={save} disabled={saving} className="flex-1 blood-glow">
              {saving ? "Saving..." : <><Check className="w-4 h-4 mr-1" />Save Changes</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────
export function PlayerManager() {
  const [players, setPlayers]       = useState<PlayerRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState("")
  const [filter, setFilter]         = useState<"all"|"online"|"banned"|"staff">("all")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detail, setDetail]         = useState<PlayerDetail | null>(null)
  const [detailLoading, setDL]      = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [actionLoading, setAL]      = useState<string | null>(null)
  const [editingUser, setEditingUser]   = useState<PlayerDetail | null>(null)
  const [editingChar, setEditingChar]   = useState<CharDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await adminApi.players.getAll()
      setPlayers(extractRows(res))
    } catch { setError("Could not reach server.") }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  const loadDetail = useCallback(async (userId: number) => {
    setDL(true); setDetail(null)
    try {
      const res = await fetch(`/admin-panel/player/${userId}`, { credentials: "include" })
      const json = await res.json()
      if (json.success && isRec(json.data)) {
        const d = json.data as Record<string, unknown>
        const u = isRec(d.user) ? d.user as Record<string, unknown> : {}
        const chars: CharDetail[] = Array.isArray(d.chars)
          ? (d.chars as unknown[]).filter(isRec).map(c => {
              const ch = c as Record<string, unknown>
              return {
                id: toNum(ch.id), name: toStr(ch.name), level: toNum(ch.level, 1),
                class_name: toStr(ch.class_name, "Unknown"), race_name: toStr(ch.race_name),
                gold: toNum(ch.gold), map_id: toNum(ch.map_id), x: toNum(ch.x), y: toNum(ch.y),
                current_hp: toNum(ch.current_hp), max_hp: toNum(ch.max_hp),
                current_mp: toNum(ch.current_mp), max_mp: toNum(ch.max_mp),
                atk: toNum(ch.atk), def: toNum(ch.def), mo: toNum(ch.mo), md: toNum(ch.md),
                speed: toNum(ch.speed), luck: toNum(ch.luck),
                experience: toNum(ch.experience), limitbreak: toNum(ch.limitbreak),
                breaklevel: toNum(ch.breaklevel, 1),
                inv_count: toNum(ch.inv_count),
                equipment: Array.isArray(ch.equipment) ? ch.equipment as CharDetail['equipment'] : [],
              }
            }) : []
        setDetail({
          id: toNum(u.id || userId), username: toStr(u.username),
          email: toStr(u.email), role: toStr(u.role, "PLAYER"),
          is_banned: Boolean(u.is_banned), last_login: toStr(u.last_login),
          created_at: toStr(u.created_at), currency: toNum(u.currency),
          online: Boolean(d.online), chars,
        })
      }
    } catch { /* ignore */ }
    finally { setDL(false) }
  }, [])

  const toggleExpand = (id: number) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null) }
    else { setExpandedId(id); void loadDetail(id) }
  }

  // ── Quick actions ─────────────────────────────────────────────
  const run = async (key: string, fn: () => Promise<{success:boolean;message?:string}>, msg?: string) => {
    setAL(key)
    try {
      const r = await fn()
      if (r.success) { if (msg) window.alert(msg) }
      else window.alert(r.message || "Action failed.")
    } catch { window.alert("Server error.") }
    finally { setAL(null) }
  }

  const handleBan = async (p: PlayerRow) => {
    const reason = window.prompt(`Ban reason for ${p.username}:`)
    if (reason === null) return
    await run(`ban-${p.id}`, () => adminApi.players.ban(p.id, reason || "No reason given"))
    setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, is_banned: true } : x))
  }

  const handleUnban = async (p: PlayerRow) => {
    if (!window.confirm(`Unban ${p.username}?`)) return
    await run(`unban-${p.id}`, () => adminApi.players.unban(p.id))
    setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, is_banned: false } : x))
  }

  const handleRole = async (p: PlayerRow) => {
    const newRole = window.prompt(`Change role for ${p.username}\nCurrent: ${p.role}\nOptions: ${ROLES.join(", ")}`)
    if (!newRole || !ROLES.includes(newRole.toUpperCase())) return
    await run(`role-${p.id}`, () => adminApi.players.setRole(p.id, newRole.toUpperCase()))
    setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, role: newRole.toUpperCase() } : x))
    if (detail?.id === p.id) setDetail(prev => prev ? { ...prev, role: newRole.toUpperCase() } : prev)
  }

  const handleMessage = async (p: PlayerRow) => {
    const msg = window.prompt(`Send message to ${p.username}:`)
    if (!msg) return
    await run(`msg-${p.id}`, () =>
      fetch("/admin-panel/broadcast-player", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ userId: p.id, message: msg, type: "info" })
      }).then(r => r.json()), "Message sent."
    )
  }

  const handleKick    = async (c: CharDetail) => {
    if (!window.confirm(`Kick ${c.name} from the game?`)) return
    await run(`kick-${c.id}`, () => adminApi.players.kick(c.id, "Removed by admin"), `${c.name} kicked.`)
  }
  const handleTeleport = async (c: CharDetail) => {
    const mapId = parseInt(window.prompt(`Teleport ${c.name} — Map ID:`) || "0", 10)
    if (!mapId) return
    const x = parseInt(window.prompt("X:") || "5", 10)
    const y = parseInt(window.prompt("Y:") || "5", 10)
    await run(`tp-${c.id}`, () => adminApi.players.teleport(c.id, mapId, x, y), "Teleported.")
    if (detail) void loadDetail(detail.id)
  }
  const handleGiveGold = async (c: CharDetail) => {
    const amount = parseInt(window.prompt(`Gold to ${c.name} (negative to remove):\nCurrent: ${c.gold}g`) || "0", 10)
    if (!amount) return
    await run(`gold-${c.id}`, () => adminApi.players.giveGold(c.id, amount), `Done.`)
    if (detail) void loadDetail(detail.id)
  }
  const handleGiveItem = async (c: CharDetail) => {
    const itemId = parseInt(window.prompt(`Give item to ${c.name} — Item ID:`) || "0", 10)
    if (!itemId) return
    const qty = parseInt(window.prompt("Quantity:") || "1", 10)
    await run(`item-${c.id}`, () => adminApi.players.giveItem(c.id, itemId, qty), `Item given.`)
  }
  const handleHeal = async (c: CharDetail) => {
    if (!window.confirm(`Restore ${c.name} to full HP/MP?`)) return
    await run(`heal-${c.id}`, () =>
      fetch(`/admin-panel/player/${c.id}/reset-hp`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ charId: c.id })
      }).then(r => r.json()), "HP/MP restored."
    )
    if (detail) void loadDetail(detail.id)
  }
  const handleClearStatus = async (c: CharDetail) => {
    await run(`status-${c.id}`, () =>
      fetch("/admin-panel/player/clear-status", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ charId: c.id })
      }).then(r => r.json()), "Status effects cleared."
    )
  }

  // ── Filtered list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = players
    if (filter === "online")  list = list.filter(p => p.online)
    if (filter === "banned")  list = list.filter(p => p.is_banned)
    if (filter === "staff")   list = list.filter(p => !["PLAYER"].includes(p.role.toUpperCase()))
    const q = search.trim().toLowerCase()
    if (q) list = list.filter(p => p.username.toLowerCase().includes(q))
    // Online first
    return [...list].sort((a, b) => Number(b.online) - Number(a.online))
  }, [players, search, filter])

  const onlineCount = players.filter(p => p.online).length
  const bannedCount = players.filter(p => p.is_banned).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Modals */}
      {editingUser && (
        <EditUserModal
          player={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={updated => {
            setPlayers(prev => prev.map(p => p.id === editingUser.id
              ? { ...p, ...updated } : p))
            if (detail?.id === editingUser.id)
              setDetail(prev => prev ? { ...prev, ...updated } : prev)
          }}
        />
      )}
      {editingChar && (
        <EditCharModal
          char={editingChar}
          onClose={() => setEditingChar(null)}
          onSaved={() => { if (detail) void loadDetail(detail.id) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Player Manager</h2>
          <p className="text-sm text-muted-foreground">
            {players.length} accounts · {onlineCount} online · {bannedCount} banned
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

      {/* Search + Filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search username..." className="pl-10" />
        </div>
        <div className="flex gap-1">
          {(["all","online","banned","staff"] as const).map(f => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)} className="capitalize text-xs">
              {f}
            </Button>
          ))}
        </div>
      </div>

      {/* Player list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <Card className="celtic-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {search || filter !== "all" ? "No players match your filter." : "No players found."}
            </CardContent>
          </Card>
        ) : filtered.map(player => (
          <Card key={player.id}
            className={`celtic-border transition-all ${player.is_banned ? "opacity-60 border-destructive/30" : "hover:border-primary/20"}`}
          >
            <CardContent className="p-3">
              {/* Row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center font-bold text-sm">
                    {player.username.charAt(0).toUpperCase()}
                  </div>
                  {player.online && <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm">{player.username}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${ROLE_STYLE[player.role.toUpperCase()] || ROLE_STYLE.PLAYER}`}>
                      {player.role}
                    </span>
                    {player.is_banned && <span className="text-xs px-1.5 py-0.5 rounded border bg-destructive/20 text-destructive border-destructive/30">BANNED</span>}
                    {player.online && <span className="text-xs text-green-400">● online</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {player.char_count !== undefined ? `${player.char_count} chars` : ""}
                    {player.gold !== undefined ? ` · ${player.gold.toLocaleString()}g` : ""}
                    {player.last_login ? ` · ${new Date(player.last_login).toLocaleDateString()}` : ""}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                    title="Edit Account" onClick={e => { e.stopPropagation(); void loadDetail(player.id).then(() => {}) ; setExpandedId(player.id); setTimeout(() => { setEditingUser(detail || { id: player.id, username: player.username, role: player.role, is_banned: player.is_banned, last_login: player.last_login }) }, 300) }}>
                    <Edit className="w-3 h-3" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                    title="Change Role" onClick={e => { e.stopPropagation(); void handleRole(player) }}
                    disabled={actionLoading === `role-${player.id}`}>
                    <Shield className="w-3 h-3" /> Role
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                    title="Send Message" onClick={e => { e.stopPropagation(); void handleMessage(player) }}
                    disabled={actionLoading === `msg-${player.id}`}>
                    <MessageSquare className="w-3 h-3" />
                  </Button>
                  {player.is_banned ? (
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1"
                      onClick={e => { e.stopPropagation(); void handleUnban(player) }}
                      disabled={actionLoading === `unban-${player.id}`}>
                      <UserCheck className="w-3 h-3" /> Unban
                    </Button>
                  ) : (
                    <Button size="sm" variant="destructive" className="h-7 px-2 text-xs gap-1"
                      onClick={e => { e.stopPropagation(); void handleBan(player) }}
                      disabled={actionLoading === `ban-${player.id}`}>
                      <Ban className="w-3 h-3" /> Ban
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-1 text-muted-foreground"
                    onClick={() => toggleExpand(player.id)}>
                    {expandedId === player.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {/* Expanded */}
              {expandedId === player.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  {/* Account details */}
                  {detail?.id === player.id && !detailLoading && (
                    <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {detail.email && <span>📧 {detail.email}</span>}
                      {detail.currency !== undefined && <span>💰 {detail.currency.toLocaleString()}g account balance</span>}
                      {detail.created_at && <span>📅 Joined {new Date(detail.created_at).toLocaleDateString()}</span>}
                    </div>
                  )}

                  {detailLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Characters</p>
                      {!detail?.chars?.length ? (
                        <p className="text-sm text-muted-foreground">No characters.</p>
                      ) : detail.chars.map(char => (
                        <div key={char.id} className="mb-2 p-2.5 bg-secondary/20 rounded-lg border border-border">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                {char.level}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{char.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {char.class_name}{char.race_name ? ` · ${char.race_name}` : ""}
                                  {` · Map ${char.map_id} (${char.x},${char.y})`}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  HP {char.current_hp}/{char.max_hp} · MP {char.current_mp}/{char.max_mp} · {char.gold.toLocaleString()}g
                                  {char.inv_count ? ` · ${char.inv_count} items` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  ATK {char.atk} · DEF {char.def} · SPD {char.speed} · LCK {char.luck}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Equipment */}
                          {char.equipment && char.equipment.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {char.equipment.map(e => (
                                <span key={e.slot_key} className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                                  {e.icon} {e.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Char action buttons */}
                          <div className="flex flex-wrap gap-1 mt-2">
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => setEditingChar(char)}>
                              <Edit className="w-3 h-3" /> Edit
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => void handleGiveGold(char)} disabled={actionLoading === `gold-${char.id}`}>
                              <Coins className="w-3 h-3" /> Gold
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => void handleGiveItem(char)} disabled={actionLoading === `item-${char.id}`}>
                              <Package className="w-3 h-3" /> Item
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => void handleTeleport(char)} disabled={actionLoading === `tp-${char.id}`}>
                              <MapPin className="w-3 h-3" /> TP
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => void handleHeal(char)} disabled={actionLoading === `heal-${char.id}`}>
                              <Heart className="w-3 h-3" /> Heal
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1"
                              onClick={() => void handleClearStatus(char)} disabled={actionLoading === `status-${char.id}`}>
                              <Zap className="w-3 h-3" /> Clear Status
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                              onClick={() => void handleKick(char)} disabled={actionLoading === `kick-${char.id}`}>
                              <LogOut className="w-3 h-3" /> Kick
                            </Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
