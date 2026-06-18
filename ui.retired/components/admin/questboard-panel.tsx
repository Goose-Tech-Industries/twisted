"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, ChevronLeft, ClipboardList, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

interface BoardQuest {
  id: number
  title: string
  description: string
  quest_type: 'BOARD' | 'EVENT' | 'FACTION' | 'REGIONAL'
  region_id: number | null
  faction: string | null
  requires_flags_json: string | null
  requires_region_json: string | null
  objectives_json: string | null
  rewards_json: string | null
  expires_at: string | null
  max_completions: number | null
  times_completed: number
  is_active: boolean
}

interface Region { id: number; name: string; icon: string }
interface Objective { type: string; target: string; count: number; description: string }

const TYPE_COLORS: Record<string, string> = {
  BOARD:    'bg-cyan-900/50 text-cyan-300 border-cyan-800',
  EVENT:    'bg-purple-900/50 text-purple-300 border-purple-800',
  FACTION:  'bg-orange-900/50 text-orange-300 border-orange-800',
  REGIONAL: 'bg-green-900/50 text-green-300 border-green-800',
}

const TYPE_DESC: Record<string, string> = {
  BOARD:    'Always available while Active is on',
  EVENT:    'Only appears when world flag conditions are met',
  FACTION:  'Only for players aligned with the specified faction',
  REGIONAL: 'Only appears on quest boards in the specified region',
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">{children}</p>
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-card border border-border rounded-lg space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

const BLANK: Partial<BoardQuest> = {
  title: '', description: '', quest_type: 'BOARD',
  region_id: null, faction: null,
  requires_flags_json: '[]', requires_region_json: null,
  objectives_json: '[]', rewards_json: '{}',
  expires_at: null, max_completions: null, is_active: true,
}

const OBJ_TYPES = ['KILL', 'COLLECT', 'VISIT', 'TALK', 'CRAFT', 'ESCORT', 'DELIVER']

const REWARDS_EXAMPLES = [
  { label: 'XP + Gold', val: '{"xp":200,"gold":50}' },
  { label: 'Items too', val: '{"xp":300,"gold":100,"items":[{"item_id":1,"qty":2}]}' },
  { label: 'Gold only', val: '{"gold":500}' },
]

export function QuestBoardPanel() {
  const [quests, setQuests] = useState<BoardQuest[]>([])
  const [regions, setRegions] = useState<Region[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<BoardQuest> | null>(null)

  // Edit state
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [reqFlags, setReqFlags] = useState<string[]>([])
  const [flagInput, setFlagInput] = useState('')
  const [rewardsJson, setRewardsJson] = useState('{}')
  const [reqRegionJson, setReqRegionJson] = useState('')
  const [rewardsError, setRewardsError] = useState('')
  const [reqRegionError, setReqRegionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [qr, rr] = await Promise.all([
      adminApi.entity.getAll('quest_board'),
      adminApi.entity.getAll('region'),
    ])
    setQuests((qr.data || []) as BoardQuest[])
    setRegions((rr.data || []) as Region[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (q?: BoardQuest) => {
    const item = q ? { ...q } : { ...BLANK }
    setEditing(item)
    try { setObjectives(JSON.parse(item.objectives_json || '[]')) } catch { setObjectives([]) }
    try { setReqFlags(JSON.parse(item.requires_flags_json || '[]')) } catch { setReqFlags([]) }
    try {
      const rr = item.requires_region_json
      setReqRegionJson(rr && rr !== 'null' ? JSON.stringify(JSON.parse(rr), null, 2) : '')
    } catch { setReqRegionJson('') }
    try {
      const rw = item.rewards_json
      setRewardsJson(rw && rw !== 'null' ? JSON.stringify(JSON.parse(rw), null, 2) : '{}')
    } catch { setRewardsJson('{}') }
    setRewardsError('')
    setReqRegionError('')
    setFlagInput('')
  }

  const save = async () => {
    if (!editing) return
    if (!editing.title?.trim()) { toast({ title: 'Title is required.' }); return }

    let reqRegionParsed = null
    if (reqRegionJson.trim()) {
      try { reqRegionParsed = JSON.parse(reqRegionJson) }
      catch { setReqRegionError('Invalid JSON in Region Requirements.'); return }
    }
    let rewardsParsed = {}
    try { rewardsParsed = JSON.parse(rewardsJson) }
    catch { setRewardsError('Invalid JSON in Rewards.'); return }

    const payload = {
      ...editing,
      requires_flags_json:  JSON.stringify(reqFlags),
      requires_region_json: reqRegionParsed ? JSON.stringify(reqRegionParsed) : null,
      objectives_json:      JSON.stringify(objectives),
      rewards_json:         JSON.stringify(rewardsParsed),
    }
    const res = await adminApi.entity.save('quest_board', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) }
    else toast({ title: res.message || 'Save failed', variant: 'destructive' })
  }

  const del = async (id: number, title: string) => {
    if (!confirm(`Delete board quest "${title}"?`)) return
    const res = await adminApi.entity.delete('quest_board', id)
    if (res.success) load()
  }

  const set = (k: string, v: unknown) => setEditing(prev => ({ ...prev, [k]: v }))

  const addFlag = () => {
    const v = flagInput.trim()
    if (!v || reqFlags.includes(v)) return
    setReqFlags(prev => [...prev, v])
    setFlagInput('')
  }

  const addObj = () => setObjectives(prev => [...prev, { type: 'KILL', target: '', count: 1, description: '' }])
  const removeObj = (i: number) => setObjectives(prev => prev.filter((_, idx) => idx !== i))
  const updateObj = (i: number, k: string, v: unknown) =>
    setObjectives(prev => prev.map((o, idx) => idx === i ? { ...o, [k]: v } : o))

  const regMap = Object.fromEntries(regions.map(r => [r.id, r]))

  // ── Edit form ──────────────────────────────────────────────────
  if (editing !== null) {
    const isNew = !editing.id
    const qType = editing.quest_type || 'BOARD'
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{isNew ? '+ New Board Quest' : `✏️ ${editing.title}`}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>

        <Help>
          Board quests appear on the in-game quest board and can be dynamically gated.
          <b> BOARD</b> = always available. <b>EVENT</b> = world flag triggered. <b>FACTION</b> = faction aligned players only. <b>REGIONAL</b> = only in that region.
          Leave all conditions empty for a quest that's always accessible.
        </Help>

        <div className="space-y-4">
          {/* Basic info */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">Title</label>
              <Input value={editing.title || ''} onChange={e => set('title', e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Type</label>
              <FieldHint>{TYPE_DESC[qType]}</FieldHint>
              <select value={qType} onChange={e => set('quest_type', e.target.value)}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                {['BOARD','EVENT','FACTION','REGIONAL'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea value={editing.description || ''} onChange={e => set('description', e.target.value)}
              rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Region</label>
              <FieldHint>Leave Global for all regions.</FieldHint>
              <select value={editing.region_id || ''} onChange={e => set('region_id', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                <option value="">— Global —</option>
                {regions.map(r => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Faction</label>
              <FieldHint>Required faction name (FACTION type only).</FieldHint>
              <Input value={editing.faction || ''} onChange={e => set('faction', e.target.value || null)}
                placeholder="e.g. merchants_guild" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Max Completions</label>
              <FieldHint>0 / blank = unlimited total completions.</FieldHint>
              <Input type="number" value={editing.max_completions ?? ''} min={0}
                onChange={e => set('max_completions', e.target.value ? parseInt(e.target.value) : null)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Expires At</label>
              <FieldHint>Leave blank for no expiry. After this date, quest disappears.</FieldHint>
              <Input type="datetime-local"
                value={editing.expires_at ? new Date(editing.expires_at).toISOString().slice(0, 16) : ''}
                onChange={e => set('expires_at', e.target.value || null)} className="mt-1" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" checked={!!editing.is_active}
                  onChange={e => set('is_active', e.target.checked)} className="w-4 h-4" />
                <span>Active <span className="text-muted-foreground font-normal">(shows in-game)</span></span>
              </label>
            </div>
          </div>

          {/* Conditions */}
          <div className="grid grid-cols-2 gap-4">
            <Section title="🌍 Requires World Flags">
              <Help>
                All listed flags must be true for this quest to appear on the board.
                Leave empty for no flag requirements. Useful for EVENT type quests.
              </Help>
              <div className="flex flex-wrap gap-1.5 mb-2 min-h-6">
                {reqFlags.length === 0
                  ? <span className="text-xs text-muted-foreground">None — always available</span>
                  : reqFlags.map((f, i) => (
                    <span key={i} className="flex items-center gap-1 px-2 py-0.5 bg-purple-900/40 border border-purple-800 rounded-full text-xs text-purple-300">
                      {f}
                      <button onClick={() => setReqFlags(prev => prev.filter((_, j) => j !== i))}
                        className="hover:text-white"><X className="w-3 h-3" /></button>
                    </span>
                  ))
                }
              </div>
              <div className="flex gap-2">
                <Input value={flagInput} onChange={e => setFlagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFlag()}
                  placeholder="flag_key" className="flex-1 h-8 text-xs" />
                <Button size="sm" variant="outline" onClick={addFlag}><Plus className="w-3.5 h-3.5" /></Button>
              </div>
            </Section>

            <Section title="⚠️ Requires Region State">
              <Help>
                Optional JSON conditions on the region's state.
                e.g. <code className="text-green-400">{`{"min_danger":2,"tag":"siege"}`}</code>
                Leave blank for no region state requirements.
              </Help>
              <textarea value={reqRegionJson}
                onChange={e => { setReqRegionJson(e.target.value); setReqRegionError('') }}
                rows={4} placeholder={'{"min_danger":2,"faction":"undead","tag":"siege"}'}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-none" />
              {reqRegionError && <p className="text-xs text-destructive">{reqRegionError}</p>}
            </Section>
          </div>

          {/* Objectives */}
          <Section title="📋 Objectives">
            <Help>
              Each objective is a task the player must complete. The server tracks progress automatically
              for KILL and COLLECT types. VISIT, TALK, CRAFT, ESCORT, and DELIVER are tracked via map events.
            </Help>
            <div className="space-y-2">
              {objectives.length === 0 && (
                <p className="text-xs text-muted-foreground">No objectives — add at least one below.</p>
              )}
              {objectives.map((obj, i) => (
                <div key={i} className="p-3 bg-secondary/30 rounded-lg border border-border space-y-2">
                  <div className="flex gap-2">
                    <select value={obj.type} onChange={e => updateObj(i, 'type', e.target.value)}
                      className="px-2 py-1 bg-input border border-border rounded text-xs w-28">
                      {OBJ_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Input value={obj.target} onChange={e => updateObj(i, 'target', e.target.value)}
                      placeholder="Target (NPC name, item name, map name)" className="flex-1 h-8 text-xs" />
                    <Input type="number" value={obj.count} min={1} onChange={e => updateObj(i, 'count', parseInt(e.target.value)||1)}
                      className="w-16 h-8 text-xs text-center" />
                    <Button size="sm" variant="ghost" className="text-destructive h-8 w-8 p-0"
                      onClick={() => removeObj(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                  <Input value={obj.description} onChange={e => updateObj(i, 'description', e.target.value)}
                    placeholder="Description shown to player (e.g. Defeat 10 wolves in the Ashwood)" className="h-8 text-xs" />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addObj} className="w-full">
                <Plus className="w-3.5 h-3.5 mr-1" />Add Objective
              </Button>
            </div>
          </Section>

          {/* Rewards */}
          <Section title="🏆 Rewards">
            <Help>
              JSON object defining what players receive on completion.
              Click an example to start from a template.
            </Help>
            <div className="flex gap-2 flex-wrap mb-2">
              {REWARDS_EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => { setRewardsJson(JSON.stringify(JSON.parse(ex.val), null, 2)); setRewardsError('') }}
                  className="text-xs px-2 py-1 bg-secondary rounded border border-border hover:border-primary transition-colors">
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea value={rewardsJson}
              onChange={e => { setRewardsJson(e.target.value); setRewardsError('') }}
              rows={5} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-y" />
            {rewardsError && <p className="text-xs text-destructive">{rewardsError}</p>}
          </Section>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Quest Board</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{quests.length} board quest{quests.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" /> New Quest</Button>
      </div>

      <Help>
        Board quests are posted on the in-game quest board and filtered automatically based on conditions.
        Unlike NPC quests, players pick these up from a physical board in-game.
        Leave all conditions empty for quests that are always available.
      </Help>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {quests.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No board quests yet.</div>
          )}
          {quests.map(q => {
            const hasFlags  = q.requires_flags_json  && q.requires_flags_json  !== 'null' && q.requires_flags_json  !== '[]'
            const hasRegion = q.requires_region_json && q.requires_region_json !== 'null'
            const region    = q.region_id ? regMap[q.region_id] : null
            let objCount = 0
            try { objCount = JSON.parse(q.objectives_json || '[]').length } catch {}

            return (
              <div key={q.id} className={cn(
                "flex items-center gap-3 p-3 rounded-lg border bg-card",
                q.is_active ? "border-border" : "border-border opacity-50"
              )}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{q.title}</span>
                    <Badge className={cn("text-[10px] py-0 border", TYPE_COLORS[q.quest_type])}>{q.quest_type}</Badge>
                    {!q.is_active && <Badge variant="secondary" className="text-[10px] py-0">Inactive</Badge>}
                    {hasFlags  && <Badge variant="outline" className="text-[10px] py-0">🌍 Flags</Badge>}
                    {hasRegion && <Badge variant="outline" className="text-[10px] py-0">⚠️ Region cond.</Badge>}
                    {region    && <Badge variant="outline" className="text-[10px] py-0">{region.icon} {region.name}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {q.description || 'No description'} · {objCount} objective{objCount !== 1 ? 's' : ''} · {q.times_completed}/{q.max_completions ?? '∞'} completed
                    {q.expires_at && ` · expires ${new Date(q.expires_at).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(q)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(q.id, q.title)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
