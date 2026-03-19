"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Coins, TrendingUp, Users, BarChart2, RefreshCw, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import adminApi from "@/lib/admin-api"

// ── Types matching GET /admin-panel/economy response ─────────────
interface RichPlayer {
  id: number
  username: string
  gold: number
  role?: string
}

interface GoldDistribution {
  broke:        number
  poor:         number
  modest:       number
  comfortable:  number
  wealthy:      number
  rich:         number
  total_users:  number
}

interface GoldEvent {
  event_type: string
  actor_name?: string
  target_name?: string
  details?: string
  created_at: string
}

interface EconomyData {
  totalGold:    number
  avgGold:      number
  maxGold:      number
  richest:      RichPlayer[]
  distribution: GoldDistribution | null
  recentGoldEvents: GoldEvent[]
}

const EMPTY: EconomyData = {
  totalGold: 0, avgGold: 0, maxGold: 0, richest: [], distribution: null, recentGoldEvents: []
}

// ── Helpers ──────────────────────────────────────────────────────
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
function toNum(v: unknown, fb = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fb
}
function toStr(v: unknown, fb = ""): string {
  if (typeof v === "string") return v
  if (v == null) return fb
  return String(v)
}
function safeDate(v: string): string {
  try { const d = new Date(v); return isNaN(d.getTime()) ? '—' : d.toLocaleString() }
  catch { return '—' }
}

function normalize(input: unknown): EconomyData {
  const src: Record<string, unknown> = isRecord(input) && isRecord((input as Record<string,unknown>).data)
    ? (input as Record<string,unknown>).data as Record<string,unknown>
    : isRecord(input)
      ? input as Record<string,unknown>
      : {}

  const richest: RichPlayer[] = Array.isArray(src.richest)
    ? (src.richest as unknown[]).filter(isRecord).map((r) => ({
        id:       toNum(r.id),
        username: toStr(r.username || r.name, "Unknown"),
        gold:     toNum(r.gold ?? r.currency),
        role:     toStr(r.role, "PLAYER"),
      }))
    : []

  let distribution: GoldDistribution | null = null
  if (isRecord(src.distribution)) {
    const d = src.distribution as Record<string, unknown>
    distribution = {
      broke:       toNum(d.broke),
      poor:        toNum(d.poor),
      modest:      toNum(d.modest),
      comfortable: toNum(d.comfortable),
      wealthy:     toNum(d.wealthy),
      rich:        toNum(d.rich),
      total_users: toNum(d.total_users),
    }
  }

  const recentGoldEvents: GoldEvent[] = Array.isArray(src.recentGoldEvents)
    ? (src.recentGoldEvents as unknown[]).filter(isRecord).map((e) => {
        const details = e.details_json || e.details
        let parsed = ''
        if (typeof details === 'string') {
          try { const j = JSON.parse(details); parsed = j.amount ? `${j.amount > 0 ? '+' : ''}${j.amount}g` : details } catch { parsed = details }
        } else if (isRecord(details) && details.amount != null) {
          const amt = toNum(details.amount)
          parsed = `${amt > 0 ? '+' : ''}${amt}g`
        }
        return {
          event_type: toStr(e.event_type),
          actor_name: toStr(e.actor_name),
          target_name: toStr(e.target_name),
          details: parsed,
          created_at: toStr(e.created_at),
        }
      })
    : []

  return {
    totalGold:    toNum(src.totalGold),
    avgGold:      toNum(src.avgGold ?? src.goldPerPlayer),
    maxGold:      toNum(src.maxGold),
    richest,
    distribution,
    recentGoldEvents,
  }
}

// ── Mini bar ─────────────────────────────────────────────────────
function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="capitalize text-muted-foreground">{label}</span>
        <span className="font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

const EVENT_LABELS: Record<string, string> = {
  gm_give_gold: 'GM Grant',
  battle_end: 'Battle Reward',
  shop_buy: 'Shop Purchase',
  shop_sell: 'Shop Sale',
  trade: 'Trade',
}

// ── Component ─────────────────────────────────────────────────────
export function EconomyPanel() {
  const [data,    setData]    = useState<EconomyData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.economy.getStats()
      if (isRecord(res) && res.success === false) {
        setError(toStr(res.message, "Could not load economy data."))
        setData(EMPTY)
      } else {
        setData(normalize(res))
      }
    } catch {
      setData(EMPTY)
      setError("Could not reach server.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const richestBase = data.richest[0]?.gold || 1

  const distBuckets = data.distribution
    ? [
        { label: "Broke (0g)",         value: data.distribution.broke,       color: "bg-red-600/60"    },
        { label: "Poor (1-100g)",      value: data.distribution.poor,        color: "bg-orange-500/60" },
        { label: "Modest (101-500g)",  value: data.distribution.modest,      color: "bg-yellow-500/60" },
        { label: "Comfort (501-2k g)", value: data.distribution.comfortable, color: "bg-green-500/60"  },
        { label: "Wealthy (2k-10k g)", value: data.distribution.wealthy,     color: "bg-blue-500/60"   },
        { label: "Rich (10k+ g)",      value: data.distribution.rich,        color: "bg-purple-500/60" },
      ]
    : []
  const distMax = Math.max(...distBuckets.map((b) => b.value), 1)

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Economy Dashboard</h2>
          <p className="text-sm text-muted-foreground">Gold circulation and wealth distribution</p>
        </div>
        <Button variant="outline" onClick={() => void load()} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <Coins className="w-7 h-7 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold font-mono text-yellow-500">
              {data.totalGold.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
              Total World Gold
            </div>
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-7 h-7 mx-auto mb-2 text-green-500" />
            <div className="text-2xl font-bold font-mono text-green-500">
              {data.avgGold.toLocaleString()}g
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
              Avg per Player
            </div>
          </CardContent>
        </Card>

        <Card className="celtic-border">
          <CardContent className="p-4 text-center">
            <Users className="w-7 h-7 mx-auto mb-2 text-blue-400" />
            <div className="text-2xl font-bold font-mono text-blue-400">
              {data.richest.length}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
              Top Earners Tracked
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        {/* Richest players */}
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Coins className="w-4 h-4 text-yellow-500" />
              Richest Characters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.richest.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
            ) : (
              data.richest.slice(0, 10).map((p, i) => (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground w-5 text-right">#{i + 1}</span>
                      <span className="font-medium">{p.username}</span>
                    </span>
                    <span className="text-yellow-500 font-mono">{p.gold.toLocaleString()}g</span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-yellow-500/60 rounded-full"
                      style={{ width: `${(p.gold / richestBase) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Distribution */}
        <Card className="celtic-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-purple-400" />
              Wealth Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {distBuckets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No distribution data yet.</p>
            ) : (
              distBuckets.map((b) => (
                <Bar key={b.label} label={b.label} value={b.value} max={distMax} color={b.color} />
              ))
            )}
            {data.distribution && (
              <p className="text-xs text-muted-foreground text-right pt-1">
                {data.distribution.total_users} total accounts
              </p>
            )}
          </CardContent>
        </Card>

      </div>

      {/* Recent Gold Events */}
      <Card className="celtic-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4 text-yellow-400" />
            Recent Gold Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentGoldEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent gold events.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    {['Type', 'Actor', 'Target', 'Amount', 'When'].map(h => (
                      <th key={h} className="pb-2 text-xs text-muted-foreground font-medium pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.recentGoldEvents.map((ev, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-secondary border border-border">
                          {EVENT_LABELS[ev.event_type] || ev.event_type}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-xs">{ev.actor_name || '—'}</td>
                      <td className="py-2 pr-4 text-xs">{ev.target_name || '—'}</td>
                      <td className="py-2 pr-4 text-xs font-mono text-yellow-500">{ev.details || '—'}</td>
                      <td className="py-2 text-xs text-muted-foreground">{ev.created_at ? safeDate(ev.created_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
