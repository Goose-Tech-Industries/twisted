"use client"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

// ================================================================
// TYPES
// ================================================================
interface Member { id: number; name: string; level: number; online: boolean; is_leader?: boolean; rank?: string }
interface Party  { id: number; name: string; members: Member[] }
interface Guild  { id: number; name: string; tag: string; guild_level: number; total_members: number; onlineCount: number; members: Member[] }
interface LiveData { parties: Party[]; guilds: Guild[] }
interface Report { id: number; reported_name: string; reporter_name: string; reason: string; details: string | null; status: string; created_at: string }
interface Referrer { char_name: string; total_referred: number; total_paid: number }
interface ReferralData { topReferrers: Referrer[]; totals: { total_referred: number; total_paid: number } }

// ================================================================
// LIVE SOCIAL PANEL
// ================================================================
async function loadLive(): Promise<LiveData | null> {
  try {
    const r = await fetch('/admin-panel/live-social', { credentials: 'include' })
    const d: Record<string, unknown> = await r.json()
    return d.success ? (d as unknown as LiveData) : null
  } catch { return null }
}

export function LiveSocialPanel() {
  const [data,    setData]    = useState<LiveData | null>(null)
  const [tab,     setTab]     = useState<'parties' | 'guilds'>('parties')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const d = await loadLive()
    setData(d); setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const iv = setInterval(load, 20_000)
    return () => clearInterval(iv)
  }, [load])

  const totalPartyOnline = data?.parties.reduce(
    (s: number, p: Party) => s + p.members.filter((m: Member) => m.online).length, 0
  ) || 0
  const totalGuildOnline = data?.guilds.reduce((s: number, g: Guild) => s + g.onlineCount, 0) || 0

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">👥 Live Social</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Active parties and guilds — auto-refreshes every 20s</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {([
          ['Parties', data?.parties.length || 0, totalPartyOnline, 'text-blue-400'],
          ['Guilds',  data?.guilds.length  || 0, totalGuildOnline,  'text-purple-400'],
        ] as [string, number, number, string][]).map(([label, n, online, col]: [string, number, number, string]) => (
          <div key={label} className="p-4 bg-card border border-border rounded-lg text-center">
            <div className={`text-3xl font-bold font-mono ${col}`}>{n}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
            <div className="text-xs text-green-400 mt-1">{online} online</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        {(['parties', 'guilds'] as const).map((t: 'parties' | 'guilds') => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize',
              tab === t ? 'bg-primary/10 border-primary text-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground')}>
            {t === 'parties' ? '⚔️ Parties' : '🏰 Guilds'}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div>
        : tab === 'parties' ? (
          !data?.parties.length ? <div className="text-center py-8 text-muted-foreground">No active parties.</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.parties.map((p: Party) => (
                <div key={p.id} className="p-4 bg-card border border-border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-sm">{p.name || 'Unnamed Party'} <span className="text-muted-foreground text-xs">#{p.id}</span></span>
                    <span className="text-green-400 text-xs">{p.members.filter((m: Member) => m.online).length}/{p.members.length} online</span>
                  </div>
                  {p.members.map((m: Member) => (
                    <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 text-xs">
                      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', m.online ? 'bg-green-500' : 'bg-muted-foreground')} />
                      <span className={cn('flex-1', m.online ? 'text-foreground' : 'text-muted-foreground')}>{m.name}</span>
                      {m.is_leader && <span className="px-1.5 py-0.5 bg-yellow-900/40 text-yellow-400 rounded text-[10px]">Leader</span>}
                      <span className="text-muted-foreground">Lv{m.level}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          !data?.guilds.length ? <div className="text-center py-8 text-muted-foreground">No guilds found.</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.guilds.map((g: Guild) => {
                const onlineMembers = g.members.filter((m: Member) => m.online)
                return (
                  <div key={g.id} className="p-4 bg-card border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">🏰 {g.name} <span className="text-muted-foreground text-xs">[{g.tag || '??'}]</span></span>
                      <span className="text-green-400 text-xs">{g.onlineCount}/{g.total_members} online</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">Guild Level {g.guild_level}</p>
                    {onlineMembers.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No members online</p>
                    ) : onlineMembers.map((m: Member) => (
                      <div key={m.id} className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                        <span className="flex-1">{m.name}</span>
                        {m.rank && <span className="px-1.5 py-0.5 bg-purple-900/40 text-purple-300 rounded text-[10px]">{m.rank}</span>}
                        <span className="text-muted-foreground">Lv{m.level}</span>
                      </div>
                    ))}
                    {g.total_members > onlineMembers.length && (
                      <p className="text-xs text-muted-foreground mt-2">+{g.total_members - onlineMembers.length} offline</p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )
      }
    </div>
  )
}

// ================================================================
// REPORTS PANEL
// ================================================================
const STATUS_COLOR: Record<string, string> = {
  open: '#f85149', reviewed: '#58a6ff', dismissed: '#484f58', actioned: '#3fb950',
}
const REASON_LABELS: Record<string, string> = {
  harassment: '😡 Harassment', cheating: '🎲 Cheating', spam: '📢 Spam',
  offensive_name: '🔤 Offensive Name', bug_abuse: '🐛 Bug Abuse', other: '❓ Other',
}

async function loadReports(filter: string): Promise<Report[]> {
  const r = await fetch(`/api/admin/reports?status=${filter}`, { credentials: 'include' })
  const d: Record<string, unknown> = await r.json()
  return d.success ? (d.reports || []) as Report[] : []
}

async function updateReport(id: number, status: string): Promise<Record<string, unknown>> {
  const r = await fetch('/api/admin/reports/update', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId: id, status }),
  })
  return r.json()
}

export function ReportsPanel() {
  const [reports, setReports] = useState<Report[]>([])
  const [filter,  setFilter]  = useState('open')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setReports(await loadReports(filter))
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  const update = async (id: number, status: string) => {
    const d = await updateReport(id, status)
    if (d.success) {
      if (filter === 'open' && status !== 'open') {
        setReports((prev: Report[]) => prev.filter((r: Report) => r.id !== id))
      } else {
        setReports((prev: Report[]) => prev.map((r: Report) => r.id === id ? { ...r, status } : r))
      }
    } else toast({ title: String(d.error || 'Update failed'), variant: 'destructive' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🚩 Player Reports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {reports.length} {filter === 'all' ? 'total' : filter} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['open', 'reviewed', 'dismissed', 'actioned', 'all'].map((f: string) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1 rounded text-xs border transition-colors capitalize',
                filter === f ? 'bg-red-900/40 border-red-700 text-red-300' : 'bg-card border-border text-muted-foreground hover:text-foreground')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div>
        : reports.length === 0 ? <div className="text-center py-10 text-muted-foreground">No {filter} reports.</div>
        : (
          <div className="space-y-2">
            {reports.map((r: Report) => {
              const col = STATUS_COLOR[r.status] || '#8b949e'
              const when = new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              return (
                <div key={r.id} className="flex items-start gap-4 p-4 bg-card border border-border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">{r.reported_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase"
                        style={{ color: col, borderColor: col + '55', background: col + '22' }}>
                        {r.status}
                      </span>
                    </div>
                    <div className="text-xs text-purple-400 mb-1">{REASON_LABELS[r.reason] || r.reason}</div>
                    <div className="text-xs text-muted-foreground">Reported by <b>{r.reporter_name}</b> · {when}</div>
                    {r.details && (
                      <div className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">"{r.details}"</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <a href={`/profile/${encodeURIComponent(r.reported_name)}`} target="_blank"
                      className="text-xs px-2 py-1 border border-border rounded text-muted-foreground hover:text-foreground text-center">
                      👤 Profile
                    </a>
                    {r.status === 'open' && <>
                      <button onClick={() => update(r.id, 'reviewed')} className="text-xs px-2 py-1 bg-blue-900/30 border border-blue-700 text-blue-300 rounded hover:bg-blue-900/50">✅ Review</button>
                      <button onClick={() => update(r.id, 'dismissed')} className="text-xs px-2 py-1 bg-secondary border border-border text-muted-foreground rounded hover:text-foreground">❌ Dismiss</button>
                      <button onClick={() => update(r.id, 'actioned')} className="text-xs px-2 py-1 bg-green-900/30 border border-green-700 text-green-300 rounded hover:bg-green-900/50">⚡ Action</button>
                    </>}
                    {r.status === 'reviewed' && <>
                      <button onClick={() => update(r.id, 'dismissed')} className="text-xs px-2 py-1 bg-secondary border border-border text-muted-foreground rounded">❌ Dismiss</button>
                      <button onClick={() => update(r.id, 'actioned')} className="text-xs px-2 py-1 bg-green-900/30 border border-green-700 text-green-300 rounded">⚡ Action</button>
                    </>}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

// ================================================================
// REFERRAL PANEL
// ================================================================
export function ReferralPanel() {
  const [data,    setData]    = useState<ReferralData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/referrals', { credentials: 'include' })
      const d: Record<string, unknown> = await r.json()
      if (d.success) setData(d as unknown as ReferralData)
      else setError(String(d.error || 'Load failed'))
    } catch (e: unknown) { setError(String(e)) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const pending = (data?.totals.total_referred || 0) - (data?.totals.total_paid || 0)

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-xl font-bold">🔗 Referral Program</h2></div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
        </Button>
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div>
        : error ? <div className="text-red-400 p-4">{error}</div>
        : (<>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {([
              ['Total Referred', data?.totals.total_referred || 0, 'text-purple-400'],
              ['Rewards Paid',   data?.totals.total_paid     || 0, 'text-green-400'],
              ['Pending',        pending,                          'text-amber-400'],
            ] as [string, number, string][]).map(([label, val, col]: [string, number, string]) => (
              <div key={label} className="p-4 bg-card border border-border rounded-lg text-center">
                <div className={`text-3xl font-bold font-mono ${col}`}>{val}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Configure reward amounts in <b>Settings → 🔗 Referral Rewards</b>.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['#', 'Player', 'Referred', 'Paid', ''].map((h: string) => (
                    <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!data?.topReferrers.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No referrals yet.</td></tr>
                )}
                {data?.topReferrers.map((r: Referrer, i: number) => (
                  <tr key={r.char_name} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">#{i + 1}</td>
                    <td className="py-2 pr-4">
                      <a href={`/profile/${encodeURIComponent(r.char_name)}`} target="_blank"
                        className="text-purple-400 font-bold hover:underline">
                        {r.char_name}
                      </a>
                    </td>
                    <td className="py-2 pr-4 font-bold font-mono">{r.total_referred}</td>
                    <td className="py-2 pr-4 text-green-400 font-bold font-mono">
                      {r.total_paid || 0}
                      {r.total_paid < r.total_referred && (
                        <span className="text-muted-foreground font-normal text-xs ml-1">
                          /{r.total_referred - (r.total_paid || 0)} pending
                        </span>
                      )}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)
      }
    </div>
  )
}
