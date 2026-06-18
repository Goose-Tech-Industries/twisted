"use client"
import { toast } from "@/hooks/use-toast"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, ChevronLeft, Gem, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface Artifact {
  artifact_id: string
  name: string
  type: string
  rarity: string
  theme: string
  description: string
  current_wielder_id: number | null
  total_kills: number
  kill_streak: number
  power_multiplier: number
  decay_rate: number
  is_dormant: boolean
  active_curses_json: string
}

interface ArtifactPower {
  power_id: string
  artifact_id: string
  name: string
  description: string
  power_type: string
  unlock_kills: number
  rank_max: number
  effect_json: string
}

const RARITY_COLORS: Record<string, string> = {
  rare:      'text-blue-400 border-blue-800',
  epic:      'text-purple-400 border-purple-800',
  legendary: 'text-amber-400 border-amber-800',
  mythic:    'text-red-400 border-red-800',
}

type View = 'list' | 'edit-artifact' | 'powers' | 'edit-power'

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

const POWER_EFFECT_EXAMPLES = [
  { label: 'Stat bonus', val: '{"type":"stat_bonus","stat":"atk","value":15}' },
  { label: 'Kill aura', val: '{"type":"kill_aura","radius":1,"damage":10}' },
  { label: 'Lifesteal', val: '{"type":"lifesteal","percent":5}' },
  { label: 'Curse resist', val: '{"type":"curse_resist","chance":30}' },
]

const CURSE_EXAMPLES = [
  { label: 'None', val: '[]' },
  { label: 'Bloodthirst', val: '[{"id":"bloodthirst","desc":"Wielder takes 2% HP per turn if no kills in last 3 turns"}]' },
]

export function ArtifactManagerPanel() {
  const [artifacts, setArtifacts] = useState<Artifact[]>([])
  const [powers, setPowers] = useState<ArtifactPower[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('list')

  // Artifact edit state
  const [editingArtifact, setEditingArtifact] = useState<Partial<Artifact>>({})
  const [cursesJson, setCursesJson] = useState('[]')
  const [cursesError, setCursesError] = useState('')
  const [isNewArtifact, setIsNewArtifact] = useState(false)

  // Power edit state
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>('')
  const [editingPower, setEditingPower] = useState<Partial<ArtifactPower>>({})
  const [effectJson, setEffectJson] = useState('{}')
  const [effectError, setEffectError] = useState('')
  const [isNewPower, setIsNewPower] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [ar, pr] = await Promise.all([
      adminApi.entity.getAll('artifact'),
      adminApi.entity.getAll('artifact_power'),
    ])
    setArtifacts((ar.data || []) as Artifact[])
    setPowers((pr.data || []) as ArtifactPower[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Artifact CRUD ──────────────────────────────────────────────
  const openEditArtifact = (a?: Artifact) => {
    setIsNewArtifact(!a)
    setEditingArtifact(a ? { ...a } : {
      artifact_id: '', name: '', type: 'weapon', rarity: 'legendary',
      theme: '', description: '', current_wielder_id: null,
      total_kills: 0, kill_streak: 0, power_multiplier: 1.0, decay_rate: 0.02,
      is_dormant: false,
    })
    let curses = '[]'
    try {
      if (a?.active_curses_json) curses = JSON.stringify(JSON.parse(a.active_curses_json), null, 2)
    } catch {}
    setCursesJson(curses)
    setCursesError('')
    setView('edit-artifact')
  }

  const saveArtifact = async () => {
    if (!editingArtifact.artifact_id?.trim()) { toast({ title: 'Artifact ID is required', variant: 'destructive' }); return }
    if (!editingArtifact.name?.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
    try { JSON.parse(cursesJson) } catch { setCursesError('Invalid JSON in Active Curses.'); return }

    const payload = { ...editingArtifact, active_curses_json: cursesJson }
    const id = isNewArtifact ? undefined : editingArtifact.artifact_id
    const res = await adminApi.entity.save('artifact', payload as Record<string, unknown>, id as unknown as number)
    if (res.success) { load(); setView('list') }
    else toast({ title: String(res.message || 'Save failed'), variant: 'destructive' })
  }

  const deleteArtifact = async (artifactId: string, name: string) => {
    if (!confirm(`Delete artifact "${name}"?\n\nThis is permanent and cannot be undone.`)) return
    const res = await adminApi.entity.delete('artifact', artifactId as unknown as number)
    if (res.success) load()
  }

  // ── Powers CRUD ────────────────────────────────────────────────
  const openPowers = (artifactId: string) => {
    setSelectedArtifactId(artifactId)
    setView('powers')
  }

  const openEditPower = (artifactId: string, p?: ArtifactPower) => {
    setSelectedArtifactId(artifactId)
    setIsNewPower(!p)
    setEditingPower(p ? { ...p } : {
      power_id: '', artifact_id: artifactId,
      name: '', description: '', power_type: 'passive',
      unlock_kills: 0, rank_max: 1,
    })
    let eff = '{}'
    try {
      if (p?.effect_json) eff = JSON.stringify(JSON.parse(p.effect_json), null, 2)
    } catch {}
    setEffectJson(eff)
    setEffectError('')
    setView('edit-power')
  }

  const savePower = async () => {
    if (!editingPower.power_id?.trim()) { toast({ title: 'Power ID is required', variant: 'destructive' }); return }
    if (!editingPower.name?.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
    try { JSON.parse(effectJson) } catch { setEffectError('Invalid JSON in Effect JSON.'); return }

    const payload = { ...editingPower, effect_json: effectJson, artifact_id: selectedArtifactId }
    const id = isNewPower ? undefined : editingPower.power_id
    const res = await adminApi.entity.save('artifact_power', payload as Record<string, unknown>, id as unknown as number)
    if (res.success) { load(); setView('powers') }
    else toast({ title: String(res.message || 'Save failed'), variant: 'destructive' })
  }

  const deletePower = async (powerId: string, name: string) => {
    if (!confirm(`Delete power "${name}"?`)) return
    const res = await adminApi.entity.delete('artifact_power', powerId as unknown as number)
    if (res.success) load()
  }

  // ── Views ──────────────────────────────────────────────────────

  // Edit artifact
  if (view === 'edit-artifact') {
    const a = editingArtifact
    const setA = (k: string, v: unknown) => setEditingArtifact(prev => ({ ...prev, [k]: v }))

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{isNewArtifact ? '+ New Artifact' : `✏️ ${a.name}`}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={saveArtifact}>💾 Save</Button>
            <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
          </div>
        </div>

        <Help>
          Artifacts are unique, one-of-a-kind items with lore and tracked histories.
          The <b>Artifact ID</b> is permanent — it links battle logs and player histories to this item.
          Use <b>Powers</b> to define what abilities the artifact grants, unlocked progressively by kills.
          <b> Dormant</b> artifacts exist in the world but have no powers until a condition activates them.
        </Help>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Artifact ID <span className="text-destructive">*</span></label>
              <FieldHint>Permanent unique key — no spaces. e.g. blade_of_doom. Cannot change after creation.</FieldHint>
              <Input value={a.artifact_id || ''} onChange={e => setA('artifact_id', e.target.value.toLowerCase().replace(/\s+/g,'_'))}
                disabled={!isNewArtifact} placeholder="e.g. blade_of_doom" className={cn(!isNewArtifact && "opacity-50")} />
            </div>
            <div>
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input value={a.name || ''} onChange={e => setA('name', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Input value={a.type || ''} onChange={e => setA('type', e.target.value)}
                placeholder="e.g. sword, staff, shield" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Rarity</label>
              <select value={a.rarity || 'legendary'} onChange={e => setA('rarity', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                {['legendary','mythic','cosmic'].map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Theme</label>
              <FieldHint>Flavour tag — e.g. "fire", "death", "war"</FieldHint>
              <Input value={a.theme || ''} onChange={e => setA('theme', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description / Lore</label>
            <textarea value={a.description || ''} onChange={e => setA('description', e.target.value)}
              rows={4} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-y" />
          </div>

          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">📊 Live State — edit with caution</h3>
            <Help>
              These track the artifact's current status in the game world.
              Only edit these manually if you're correcting a bug or running a lore event.
            </Help>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Current Wielder ID</label>
                <FieldHint>Character ID of whoever holds it. 0 or blank = unowned.</FieldHint>
                <Input type="number" value={a.current_wielder_id ?? ''} min={0}
                  onChange={e => setA('current_wielder_id', e.target.value ? parseInt(e.target.value) : null)} />
              </div>
              <div>
                <label className="text-sm font-medium">Total Kills</label>
                <FieldHint>Accumulated kills across all past wielders.</FieldHint>
                <Input type="number" value={a.total_kills ?? 0} min={0}
                  onChange={e => setA('total_kills', parseInt(e.target.value)||0)} />
              </div>
              <div>
                <label className="text-sm font-medium">Kill Streak</label>
                <FieldHint>Current wielder's consecutive kills.</FieldHint>
                <Input type="number" value={a.kill_streak ?? 0} min={0}
                  onChange={e => setA('kill_streak', parseInt(e.target.value)||0)} />
              </div>
              <div>
                <label className="text-sm font-medium">Power Multiplier</label>
                <FieldHint>Scales all power effects. 1.0 = normal.</FieldHint>
                <Input type="number" step={0.01} value={a.power_multiplier ?? 1.0} min={0}
                  onChange={e => setA('power_multiplier', parseFloat(e.target.value)||1)} />
              </div>
              <div>
                <label className="text-sm font-medium">Decay Rate</label>
                <FieldHint>How fast power fades between kills. 0.02 = 2% per turn idle.</FieldHint>
                <Input type="number" step={0.01} value={a.decay_rate ?? 0.02} min={0}
                  onChange={e => setA('decay_rate', parseFloat(e.target.value)||0)} />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={!!a.is_dormant}
                    onChange={e => setA('is_dormant', e.target.checked)} className="w-4 h-4" />
                  <span>Dormant <span className="text-muted-foreground font-normal">(no powers active)</span></span>
                </label>
              </div>
            </div>
          </div>

          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">☠️ Active Curses JSON</h3>
            <Help>
              Array of curses currently afflicting this artifact.
              Leave as <code>[]</code> for no curses. Click an example to start.
            </Help>
            <div className="flex gap-2 flex-wrap mb-2">
              {CURSE_EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => { setCursesJson(JSON.stringify(JSON.parse(ex.val), null, 2)); setCursesError('') }}
                  className="text-xs px-2 py-1 bg-secondary rounded border border-border hover:border-primary transition-colors">
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea value={cursesJson} onChange={e => { setCursesJson(e.target.value); setCursesError('') }}
              rows={4} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-y" />
            {cursesError && <p className="text-xs text-destructive">{cursesError}</p>}
          </div>
        </div>
      </div>
    )
  }

  // Powers list
  if (view === 'powers') {
    const artifact = artifacts.find(a => a.artifact_id === selectedArtifactId)
    const artPowers = powers.filter(p => p.artifact_id === selectedArtifactId)
      .sort((a, b) => a.unlock_kills - b.unlock_kills)

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView('list')}><ChevronLeft className="w-4 h-4" /></Button>
            <div>
              <h2 className="text-lg font-bold">⚡ Powers — {artifact?.name || selectedArtifactId}</h2>
              <p className="text-xs text-muted-foreground">{artPowers.length} power{artPowers.length !== 1 ? 's' : ''} defined</p>
            </div>
          </div>
          <Button onClick={() => openEditPower(selectedArtifactId)}>
            <Plus className="w-4 h-4 mr-1" /> New Power
          </Button>
        </div>

        <Help>
          Powers unlock progressively as the wielder accumulates kills.
          Set <b>Unlock Kills = 0</b> for powers active from the moment the artifact is picked up.
          List them in ascending order of Unlock Kills for a clear progression.
        </Help>

        <div className="space-y-2">
          {artPowers.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No powers yet. Add one above.</div>
          )}
          {artPowers.map(p => (
            <div key={p.power_id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{p.name}</span>
                  <Badge variant="outline" className="text-[10px] py-0">{p.power_type}</Badge>
                  <span className="text-xs text-muted-foreground">Unlocks at {p.unlock_kills} kills</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{p.description}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openEditPower(selectedArtifactId, p)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deletePower(p.power_id, p.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Edit power
  if (view === 'edit-power') {
    const p = editingPower
    const setP = (k: string, v: unknown) => setEditingPower(prev => ({ ...prev, [k]: v }))

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setView('powers')}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{isNewPower ? '+ New Power' : `✏️ ${p.name}`}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={savePower}>💾 Save</Button>
            <Button variant="outline" onClick={() => setView('powers')}>Cancel</Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Power ID <span className="text-destructive">*</span></label>
              <FieldHint>Unique key for this power. e.g. blade_wrath_1. Cannot change after creation.</FieldHint>
              <Input value={p.power_id || ''} onChange={e => setP('power_id', e.target.value.toLowerCase().replace(/\s+/g,'_'))}
                disabled={!isNewPower} placeholder="e.g. blade_wrath_1"
                className={cn(!isNewPower && "opacity-50")} />
            </div>
            <div>
              <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
              <Input value={p.name || ''} onChange={e => setP('name', e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea value={p.description || ''} onChange={e => setP('description', e.target.value)}
              rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-none" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium">Power Type</label>
              <select value={p.power_type || 'passive'} onChange={e => setP('power_type', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                {['passive','active','ultimate'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Unlock Kills</label>
              <FieldHint>0 = active immediately.</FieldHint>
              <Input type="number" value={p.unlock_kills ?? 0} min={0}
                onChange={e => setP('unlock_kills', parseInt(e.target.value)||0)} />
            </div>
            <div>
              <label className="text-sm font-medium">Rank Max</label>
              <FieldHint>Max upgrade rank for this power.</FieldHint>
              <Input type="number" value={p.rank_max ?? 1} min={1}
                onChange={e => setP('rank_max', parseInt(e.target.value)||1)} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Effect JSON</label>
            <div className="flex gap-2 flex-wrap mb-2">
              {POWER_EFFECT_EXAMPLES.map(ex => (
                <button key={ex.label} onClick={() => { setEffectJson(JSON.stringify(JSON.parse(ex.val), null, 2)); setEffectError('') }}
                  className="text-xs px-2 py-1 bg-secondary rounded border border-border hover:border-primary transition-colors">
                  {ex.label}
                </button>
              ))}
            </div>
            <textarea value={effectJson} onChange={e => { setEffectJson(e.target.value); setEffectError('') }}
              rows={6} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-y" />
            {effectError && <p className="text-xs text-destructive">{effectError}</p>}
          </div>
        </div>
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Gem className="w-5 h-5 text-amber-400" /> Artifacts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEditArtifact()}><Plus className="w-4 h-4 mr-1" /> New Artifact</Button>
      </div>

      <Help>
        Artifacts are unique, legendary items — only one of each exists in the entire game world.
        They track their own kill count, wielder history, and unlock powers as their wielder grows more powerful.
        Don't create too many — scarcity is what makes them special.
      </Help>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-3">
          {artifacts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">No artifacts yet.</div>
          )}
          {artifacts.map(a => {
            const artPowerCount = powers.filter(p => p.artifact_id === a.artifact_id).length
            return (
              <div key={a.artifact_id} className={cn(
                "flex items-center gap-4 p-4 rounded-lg border bg-card",
                a.is_dormant ? "opacity-60 border-border" : "border-amber-900/30"
              )}>
                <Gem className={cn("w-6 h-6 shrink-0", RARITY_COLORS[a.rarity]?.split(' ')[0] || 'text-amber-400')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm">{a.name}</span>
                    <Badge className={cn("text-[10px] py-0 border capitalize", RARITY_COLORS[a.rarity] || 'text-amber-400 border-amber-800')}>
                      {a.rarity}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] py-0">{a.type}</Badge>
                    {a.is_dormant && <Badge variant="secondary" className="text-[10px] py-0">💤 Dormant</Badge>}
                    {artPowerCount > 0 && (
                      <Badge variant="outline" className="text-[10px] py-0 text-amber-400">⚡ {artPowerCount} power{artPowerCount !== 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <code className="text-muted-foreground/60">{a.artifact_id}</code>
                    {' · '}{a.total_kills} total kills
                    {a.current_wielder_id ? ` · Wielder #${a.current_wielder_id}` : ' · Unowned'}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openPowers(a.artifact_id)}>
                    <Zap className="w-3.5 h-3.5 mr-1" />Powers
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEditArtifact(a)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteArtifact(a.artifact_id, a.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
