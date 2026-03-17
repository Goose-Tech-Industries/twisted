"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Users, Map, Package, Skull, Swords, Coins,
  TrendingUp, UserCheck, Zap, Flag, Shield,
  BookOpen, Activity, BarChart2
} from "lucide-react"
import adminApi from "@/lib/admin-api"

// ─── Types ────────────────────────────────────────────────────────
interface DashboardData {
  stats: {
    users: number; chars: number; maps: number
    npcs: number; items: number; battles: number
  }
  online: number
  onlineList: Array<{ name: string; level: number; mapId: number; mapName?: string }>
  recentUsers: Array<{ username: string; role: string; is_banned: boolean; last_login: string; created_at: string }>
  topChars: Array<{ name: string; level: number; username: string }>
  totalGold: number
  aiProvider: string
  mapPop: Record<string, number>
  signupTrend: Array<{ day: string; n: number }>
  streakStats: { avg_streak: number; max_streak: number; streak_players: number }
  openReports: number | null
  battlesToday: number | null
  tutorialRate: number
}

// ─── Helpers ──────────────────────────────────────────────────────

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-6 text-right">{value}</span>
    </div>
  )
}

function Sparkline({ data }: { data: Array<{ day: string; n: number }> }) {
  // Fill missing days so we always show 7 points
  const filled: Array<{ day: string; n: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const found = data.find(r => r.day.slice(0, 10) === key)
    filled.push({ day: key, n: found ? Number(found.n) : 0 })
  }

  const max = Math.max(...filled.map(r => r.n), 1)
  const W = 280; const H = 56; const pad = 4
  const step = (W - pad * 2) / (filled.length - 1)
  const points = filled.map((r, i) => ({
    x: pad + i * step,
    y: pad + (H - pad * 2) * (1 - r.n / max),
    ...r
  }))
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const area = `${points[0].x},${H} ` + points.map(p => `${p.x},${p.y}`).join(' ') + ` ${points[points.length - 1].x},${H}`

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 56 }}>
        <defs>
          <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#sg)" />
        <polyline points={polyline} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="hsl(var(--primary))" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {filled.map((r, i) => (
          <div key={i} className="text-center" style={{ width: `${100 / filled.length}%` }}>
            <div className="text-[10px] font-mono text-primary">{r.n > 0 ? r.n : ''}</div>
            <div className="text-[9px] text-muted-foreground">
              {new Date(r.day + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AiStatusPill({ provider }: { provider: string }) {
  const isOff = !provider || provider === 'disabled' || provider === 'none'
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
      isOff ? 'bg-secondary text-muted-foreground' : 'bg-green-900/50 text-green-400 border border-green-800'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOff ? 'bg-muted-foreground' : 'bg-green-400 animate-pulse'}`} />
      {isOff ? 'AI Disabled' : provider}
    </span>
  )
}

function RoleBadge({ role }: { role: string }) {
  const r = (role || '').toUpperCase()
  const color =
    r === 'ADMIN' || r === 'OWNER' ? 'bg-red-900/50 text-red-400 border-red-800' :
    r === 'GM'  ? 'bg-purple-900/50 text-purple-400 border-purple-800' :
    r === 'MOD' ? 'bg-blue-900/50 text-blue-400 border-blue-800' :
                  'bg-secondary text-muted-foreground border-border'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono uppercase ${color}`}>
      {r || 'PLAYER'}
    </span>
  )
}

// ─── Mock ────────────────────────────────────────────────────────
const MOCK: DashboardData = {
  stats: { users: 142, chars: 238, maps: 12, npcs: 89, items: 156, battles: 3 },
  online: 4,
  onlineList: [
    { name: "Cormac the Red", level: 15, mapId: 1, mapName: "Ashenveil" },
    { name: "Brigid Swift",   level: 10, mapId: 1, mapName: "Ashenveil" },
    { name: "Finn MacCool",   level: 22, mapId: 3, mapName: "The Ruin" },
    { name: "Deirdre",        level:  8, mapId: 2, mapName: "Bog Road" },
  ],
  recentUsers: [
    { username: "warrior_king", role: "PLAYER", is_banned: false, last_login: "2025-01-15", created_at: "2025-01-14" },
    { username: "shadow_mage",  role: "PLAYER", is_banned: false, last_login: "2025-01-14", created_at: "2025-01-13" },
    { username: "gm_one",       role: "GM",     is_banned: false, last_login: "2025-01-15", created_at: "2025-01-01" },
  ],
  topChars: [
    { name: "Finn MacCool",   level: 22, username: "finn99" },
    { name: "Cormac the Red", level: 15, username: "warrior_king" },
    { name: "Brigid Swift",   level: 10, username: "brigid" },
  ],
  totalGold: 1250000,
  aiProvider: "ollama/llama3",
  mapPop: { "1": 2, "3": 1, "2": 1 },
  signupTrend: [],
  streakStats: { avg_streak: 3.2, max_streak: 21, streak_players: 67 },
  openReports: 4,
  battlesToday: 17,
  tutorialRate: 62,
}

// ─── Component ───────────────────────────────────────────────────
export function DashboardPanel() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [usingMock, setUsingMock] = useState(false)

  const load = async () => {
    const res = await adminApi.dashboard.getStats()
    if (res.success && res.data) {
      setData(res.data); setUsingMock(false)
    } else {
      setData(MOCK); setUsingMock(true)
    }
    setLastRefresh(new Date())
    setLoading(false)
  }

  useEffect(() => {
    load()
    const iv = setInterval(load, 30_000)
    return () => clearInterval(iv)
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!data) return null

  const statCards = [
    { label: "Online Now",    value: data.online,                             icon: UserCheck, color: data.online > 0 ? "text-green-500" : "text-muted-foreground" },
    { label: "Accounts",      value: data.stats.users,                        icon: Users,     color: "text-primary" },
    { label: "Characters",    value: data.stats.chars,                        icon: Users,     color: "text-blue-400" },
    { label: "Active Maps",   value: data.stats.maps,                         icon: Map,       color: "text-orange-400" },
    { label: "NPCs",          value: data.stats.npcs,                         icon: Skull,     color: "text-green-400" },
    { label: "Items",         value: data.stats.items,                        icon: Package,   color: "text-red-400" },
    { label: "Battles Today", value: data.battlesToday ?? data.stats.battles, icon: Swords,    color: "text-destructive" },
    { label: "World Gold",    value: `${(data.totalGold/1000).toFixed(1)}k`,  icon: Coins,     color: "text-yellow-500" },
  ]

  const mapPopEntries = Object.entries(data.mapPop).sort((a,b) => b[1]-a[1])
  const maxMapPop = mapPopEntries[0]?.[1] || 1

  const mapGroups: Record<string, typeof data.onlineList> = {}
  for (const p of data.onlineList) {
    const key = p.mapName || `Map ${p.mapId}`
    if (!mapGroups[key]) mapGroups[key] = []
    mapGroups[key].push(p)
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold">Live Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {usingMock
              ? '⚠ Demo data — connect to a live server'
              : lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()} · auto every 30s` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AiStatusPill provider={data.aiProvider} />
          {data.openReports != null && data.openReports > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/50 text-red-400 border border-red-800">
              <Flag className="w-3 h-3" />
              {data.openReports} open report{data.openReports !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={load} className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded-md transition-colors">
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className="celtic-border">
            <CardContent className="p-4 text-center">
              <s.icon className={`w-5 h-5 mx-auto mb-1.5 ${s.color}`} />
              <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Row 2: Online players + Signup trend */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Online ({data.online})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-64 overflow-y-auto">
            {data.onlineList.length === 0
              ? <p className="text-center text-muted-foreground py-6 text-sm">No players online</p>
              : Object.entries(mapGroups).map(([mapName, players]) => (
                <div key={mapName}>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{mapName}</p>
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        {p.name}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">Lv{p.level}</span>
                    </div>
                  ))}
                </div>
              ))
            }
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              New Accounts — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Sparkline data={data.signupTrend} />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Retention + Map pop + Top chars */}
      <div className="grid md:grid-cols-3 gap-4">

        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-yellow-500" />
              Retention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" /> Tutorial done</span>
                <span className="font-mono text-foreground">{data.tutorialRate}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${data.tutorialRate}%` }} />
              </div>
            </div>
            <div className="space-y-1 pt-2 border-t border-border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Avg streak</span>
                <span className="font-mono text-yellow-400">{data.streakStats.avg_streak} days</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Best streak</span>
                <span className="font-mono text-yellow-400">{data.streakStats.max_streak} days</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Active streakers</span>
                <span className="font-mono text-foreground">{data.streakStats.streak_players}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-orange-400" />
              Map Population
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mapPopEntries.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-4">No players online</p>
              : mapPopEntries.map(([mapId, count]) => {
                  const mapName = data.onlineList.find(p => String(p.mapId) === mapId)?.mapName || `Map ${mapId}`
                  return (
                    <div key={mapId}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground truncate max-w-[140px]">{mapName}</span>
                        <span className="font-mono">{count}</span>
                      </div>
                      <MiniBar value={count} max={maxMapPop} color="bg-orange-500" />
                    </div>
                  )
                })
            }
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Top Characters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {data.topChars.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-4">#{i+1}</span>
                  <div>
                    <div className="text-sm font-medium leading-tight">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.username}</div>
                  </div>
                </span>
                <span className="text-yellow-500 font-mono text-sm">Lv{c.level}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Recent accounts table */}
      <Card className="celtic-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue-400" />
            Recent Accounts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {['Username','Role','Joined','Last Login','Status'].map(h => (
                    <th key={h} className="pb-2 text-xs text-muted-foreground font-medium pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentUsers.map((u, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2 font-medium pr-4">{u.username}</td>
                    <td className="py-2 pr-4"><RoleBadge role={u.role} /></td>
                    <td className="py-2 text-xs text-muted-foreground pr-4">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground pr-4">
                      {u.last_login ? new Date(u.last_login).toLocaleDateString() : 'never'}
                    </td>
                    <td className="py-2">
                      {u.is_banned
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/30">Banned</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/30 text-green-500 border border-green-900">Active</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
