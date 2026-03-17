"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Ban, UserCheck, LogOut, MapPin, Package, Coins, TrendingUp } from "lucide-react"
import adminApi from "@/lib/admin-api"

// ── Types ─────────────────────────────────────────────────────────
// These match exactly what GET /admin-panel/player/:id returns for characters.
interface CharacterSummary {
  id: number
  name: string
  level: number
  class_name?: string
  gold?: number
  map_id?: number
}

// GET /admin-panel/players returns users with char_count (not full characters array).
// GET /admin-panel/player/:id returns the full detail with characters array.
interface PlayerRow {
  id: number
  username: string
  role: string
  is_banned: boolean
  last_login: string
  gold?: number         // currency column from users
  char_count?: number   // COUNT from the list query
  online?: boolean
  characters?: CharacterSummary[]
}

// ── Normalizers ──────────────────────────────────────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function toStr(v: unknown, fb = ""): string {
  if (typeof v === "string") return v
  if (v == null) return fb
  return String(v)
}
function toNum(v: unknown, fb = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}

function extractPlayerList(input: unknown): PlayerRow[] {
  // Backend wraps in { success, data: [...] }
  const raw: unknown[] = Array.isArray(input)
    ? input
    : isRecord(input) && Array.isArray((input as Record<string,unknown>).data)
      ? ((input as Record<string,unknown>).data as unknown[])
      : []

  return raw.filter(isRecord).map((r) => ({
    id:         toNum(r.id),
    username:   toStr(r.username, `user_${r.id}`),
    role:       toStr(r.role, "PLAYER"),
    is_banned:  Boolean(r.is_banned),
    last_login: toStr(r.last_login),
    gold:       r.gold !== undefined ? toNum(r.gold) : undefined,
    char_count: r.char_count !== undefined ? toNum(r.char_count) : undefined,
    online:     Boolean(r.online),
    characters: Array.isArray(r.characters)
      ? (r.characters as unknown[]).filter(isRecord).map((c) => ({
          id:         toNum(c.id),
          name:       toStr(c.name, `char_${c.id}`),
          level:      toNum(c.level, 1),
          class_name: toStr(c.class_name ?? c.class ?? c.className, "Unknown"),
          gold:       c.gold !== undefined ? toNum(c.gold) : undefined,
          map_id:     c.map_id !== undefined ? toNum(c.map_id) : undefined,
        }))
      : undefined,
  })).filter((p) => p.id > 0)
}

// ── Component ─────────────────────────────────────────────────────
export function PlayerManager() {
  const [players,          setPlayers]          = useState<PlayerRow[]>([])
  const [loading,          setLoading]          = useState(true)
  const [search,           setSearch]           = useState("")
  const [expandedId,       setExpandedId]       = useState<number | null>(null)
  const [expandedDetail,   setExpandedDetail]   = useState<PlayerRow | null>(null)
  const [detailLoading,    setDetailLoading]    = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  // ── Load player list ────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.players.getAll()
      setPlayers(extractPlayerList(res))
      if (isRecord(res) && res.success === false) {
        setError(toStr(res.message, "Failed to load players."))
      }
    } catch {
      setPlayers([])
      setError("Could not reach server.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // ── Load detail for expanded player ────────────────────────────
  const loadDetail = useCallback(async (userId: number) => {
    setDetailLoading(true)
    setExpandedDetail(null)
    try {
      // GET /admin-panel/player/:id
      const res = await fetch(`/admin-panel/player/${userId}`, { credentials: "include" })
      const json = await res.json()
      if (json.success && isRecord(json.data)) {
        const d = json.data as Record<string, unknown>
        const chars: CharacterSummary[] = Array.isArray(d.chars)
          ? (d.chars as unknown[]).filter(isRecord).map((c) => ({
              id:         toNum(c.id),
              name:       toStr(c.name),
              level:      toNum(c.level, 1),
              class_name: toStr(c.class_name ?? c.class_name ?? "Unknown"),
              map_id:     toNum(c.map_id),
            }))
          : []
        const user = isRecord(d.user) ? d.user : {}
        setExpandedDetail({
          id:         toNum(user.id || d.id || userId),
          username:   toStr(user.username || d.username),
          role:       toStr(user.role    || d.role, "PLAYER"),
          is_banned:  Boolean(user.is_banned ?? d.is_banned),
          last_login: toStr(user.last_login || d.last_login),
          gold:       toNum(user.currency  || d.gold),
          online:     Boolean(d.online),
          characters: chars,
        })
      }
    } catch {
      // detail failed — keep expanded but show no chars
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const toggleExpand = (playerId: number) => {
    if (expandedId === playerId) {
      setExpandedId(null)
      setExpandedDetail(null)
    } else {
      setExpandedId(playerId)
      void loadDetail(playerId)
    }
  }

  // ── Search ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return players
    return players.filter((p) => p.username.toLowerCase().includes(q))
  }, [players, search])

  // ── Actions ─────────────────────────────────────────────────────
  const handleBan = async (userId: number) => {
    const reason = window.prompt("Ban reason:")
    if (!reason) return
    const res = await adminApi.players.ban(userId, reason)
    if (res.success) {
      setPlayers((prev) => prev.map((p) => p.id === userId ? { ...p, is_banned: true } : p))
    } else {
      window.alert(res.message || "Failed to ban player.")
    }
  }

  const handleUnban = async (userId: number) => {
    const res = await adminApi.players.unban(userId)
    if (res.success) {
      setPlayers((prev) => prev.map((p) => p.id === userId ? { ...p, is_banned: false } : p))
    } else {
      window.alert(res.message || "Failed to unban.")
    }
  }

  const handleKick = async (charId: number) => {
    const res = await adminApi.players.kick(charId, "Removed by admin")
    window.alert(res.success ? "Player kicked." : res.message || "Failed.")
  }

  const handleTeleport = async (charId: number) => {
    const mapId = parseInt(window.prompt("Target Map ID:") || "0", 10)
    if (!mapId) return
    const x = parseInt(window.prompt("X coordinate:") || "5", 10)
    const y = parseInt(window.prompt("Y coordinate:") || "5", 10)
    const res = await adminApi.players.teleport(charId, mapId, x, y)
    window.alert(res.success ? "Teleported." : res.message || "Failed.")
  }

  const handleGiveItem = async (charId: number) => {
    const itemId = parseInt(window.prompt("Item ID:") || "0", 10)
    if (!itemId) return
    const qty = parseInt(window.prompt("Quantity:") || "1", 10)
    const res = await adminApi.players.giveItem(charId, itemId, qty)
    window.alert(res.success ? "Item given." : res.message || "Failed.")
  }

  const handleGiveGold = async (charId: number) => {
    const amount = parseInt(window.prompt("Gold amount:") || "0", 10)
    if (!amount) return
    const res = await adminApi.players.giveGold(charId, amount)
    window.alert(res.success ? "Gold given." : res.message || "Failed.")
  }

  const handleSetLevel = async (charId: number) => {
    const level = parseInt(window.prompt("New level (1-99):") || "0", 10)
    if (level < 1 || level > 99) return
    const res = await adminApi.players.setLevel(charId, level)
    window.alert(res.success ? "Level updated." : res.message || "Failed.")
  }

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Player Manager</h2>
          <p className="text-sm text-muted-foreground">{players.length} accounts loaded</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>Refresh</Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by username..."
          className="pl-10"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card className="celtic-border">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {search ? "No players match that search." : "No players found."}
            </CardContent>
          </Card>
        ) : (
          filtered.map((player) => (
            <Card
              key={player.id}
              className={`celtic-border cursor-pointer hover:border-primary/40 transition-all ${player.is_banned ? "opacity-60 border-destructive/30" : ""}`}
              onClick={() => toggleExpand(player.id)}
            >
              <CardContent className="p-4">

                {/* ── Row header ── */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Online dot */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold">
                        {player.username.charAt(0).toUpperCase()}
                      </div>
                      {player.online && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{player.username}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          player.role.toUpperCase() === "ADMIN" ? "bg-primary/20 text-primary" :
                          player.role.toUpperCase() === "GM"    ? "bg-yellow-500/20 text-yellow-500" :
                                                                   "bg-secondary text-muted-foreground"
                        }`}>{player.role}</span>
                        {player.is_banned && (
                          <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive">BANNED</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {player.char_count !== undefined ? `${player.char_count} char${player.char_count !== 1 ? "s" : ""}` : ""}
                        {player.gold !== undefined ? ` · ${player.gold.toLocaleString()}g` : ""}
                        {player.last_login ? ` · ${new Date(player.last_login).toLocaleDateString()}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {player.is_banned ? (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); void handleUnban(player.id) }}>
                        <UserCheck className="w-4 h-4 mr-1" /> Unban
                      </Button>
                    ) : (
                      <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); void handleBan(player.id) }}>
                        <Ban className="w-4 h-4 mr-1" /> Ban
                      </Button>
                    )}
                  </div>
                </div>

                {/* ── Expanded detail ── */}
                {expandedId === player.id && (
                  <div className="mt-4 pt-4 border-t border-border">
                    {detailLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Loading character data…
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                          Characters
                        </p>
                        {!expandedDetail?.characters?.length ? (
                          <p className="text-sm text-muted-foreground">No characters on this account.</p>
                        ) : (
                          expandedDetail.characters.map((char) => (
                            <div
                              key={char.id}
                              className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-lg mb-2 flex-wrap"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                                  {char.level}
                                </div>
                                <div>
                                  <div className="font-medium">{char.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {char.class_name}{char.map_id ? ` · Map ${char.map_id}` : ""}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" title="Kick" onClick={(e) => { e.stopPropagation(); void handleKick(char.id) }}>
                                  <LogOut className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Teleport" onClick={(e) => { e.stopPropagation(); void handleTeleport(char.id) }}>
                                  <MapPin className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Give Item" onClick={(e) => { e.stopPropagation(); void handleGiveItem(char.id) }}>
                                  <Package className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Give Gold" onClick={(e) => { e.stopPropagation(); void handleGiveGold(char.id) }}>
                                  <Coins className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" title="Set Level" onClick={(e) => { e.stopPropagation(); void handleSetLevel(char.id) }}>
                                  <TrendingUp className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
