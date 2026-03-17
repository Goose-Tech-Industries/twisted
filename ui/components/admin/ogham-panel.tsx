"use client"
import React from 'react'

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, ChevronLeft, Droplets } from "lucide-react"
import { cn } from "@/lib/utils"

interface Ogham {
  id: number; name: string; icon: string; description: string; lore: string
  family_id?: number; rank: number; base_ogham_id?: number
  element_attack?: string; on_hit_status?: string; on_hit_chance?: number
  stat_bonus?: string; kills_to_rank_up?: number
  granted_skill_id?: number
}
interface OghamFamily { id: number; name: string; icon: string }
interface Skill { id: number; name: string }
interface Status { id: number; name: string }

const RANK_LABELS: Record<number, string> = { 1: 'Carved', 2: 'Inscribed', 3: 'Bloodbound' }
const RANK_COLORS: Record<number, string> = {
  1: 'text-red-400 border-red-900 bg-red-950/30',
  2: 'text-purple-400 border-purple-900 bg-purple-950/30',
  3: 'text-amber-400 border-amber-900 bg-amber-950/30',
}

const ELEMENTS = ['','fire','ice','lightning','earth','dark','light','poison','wind']

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">{children}</p>
}

function grantSummary(og: Ogham): string {
  const parts: string[] = []
  if (og.element_attack) parts.push(`${og.element_attack} Attack`)
  if (og.on_hit_status)  parts.push(`${og.on_hit_chance ?? 100}% ${og.on_hit_status} on hit`)
  try {
    const sb = typeof og.stat_bonus === 'string' ? JSON.parse(og.stat_bonus || '{}') : og.stat_bonus || {}
    Object.entries(sb).forEach(([k, v]) => parts.push(`+${v} ${k.toUpperCase()}`))
  } catch {}
  if (og.granted_skill_id) parts.push(`Skill #${og.granted_skill_id}`)
  return parts.join(' · ') || '—'
}

const BLANK: Partial<Ogham> = {
  name: '', icon: '🩸', description: '', lore: '',
  rank: 1, element_attack: '', on_hit_status: '', on_hit_chance: 0,
  stat_bonus: '{}', kills_to_rank_up: 50,
}

export function OghamPanel() {
  const [oghams, setOghams] = useState<Ogham[]>([])
  const [families, setFamilies] = useState<OghamFamily[]>([])
  const [skills, setSkills] = useState<Skill[]>([])
  const [statuses, setStatuses] = useState<Status[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Ogham> | null>(null)
  const [bonusJson, setBonusJson] = useState('{}')
  const [jsonError, setJsonError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [or, fr, sr, str] = await Promise.all([
      adminApi.entity.getAll('ogham'),
      adminApi.entity.getAll('ogham_family'),
      adminApi.entity.getAll('skill'),
      adminApi.entity.getAll('status'),
    ])
    setOghams((or.data || []) as Ogham[])
    setFamilies((fr.data || []) as OghamFamily[])
    setSkills((sr.data || []) as Skill[])
    setStatuses((str.data || []) as Status[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (og?: Partial<Ogham>) => {
    const item: Partial<Ogham> = og ? { ...og } : { ...BLANK }
    setEditing(item)
    const sb = typeof item.stat_bonus === 'string' ? item.stat_bonus || '{}' : JSON.stringify(item.stat_bonus || {}, null, 2)
    setBonusJson(sb)
    setJsonError('')
  }

  const save = async () => {
    if (!editing) return
    if (!editing.name?.trim()) { alert('Name is required.'); return }
    try { JSON.parse(bonusJson) } catch { setJsonError('Invalid JSON in Stat Bonus.'); return }
    const data = { ...editing, stat_bonus: bonusJson }
    const res = await adminApi.entity.save('ogham', data as Record<string,unknown>, editing.id)
    if (res.success) { load(); setEditing(null) }
    else alert(res.message || 'Save failed')
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"?\n\nPlayers who have this Ogham equipped will lose it.`)) return
    const res = await adminApi.entity.delete('ogham', id)
    if (res.success) load()
  }

  const set = (k: string, v: unknown) => setEditing(prev => ({ ...prev, [k]: v }))
  const familyMap = Object.fromEntries(families.map(f => [f.id, f]))

  // Group oghams into rank chains
  const roots = oghams.filter(o => !o.base_ogham_id)
  const byBase: Record<number, Ogham[]> = {}
  oghams.filter(o => o.base_ogham_id).forEach(o => {
    const key = o.base_ogham_id!
    byBase[key] = byBase[key] || []
    byBase[key].push(o)
  })

  // ── Edit form ──────────────────────────────────────────────────
  if (editing !== null) {
    const isNew = !editing.id
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{isNew ? '+ New Blood Ogham' : `✏️ ${editing.name}`}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>

        <Help>
          Blood Oghams are carved runes that slot into weapon/armor Ogham Grooves.
          Each Ogham can deepen into stronger versions through kills: <b className="text-red-400">Carved</b> →
          <b className="text-purple-400"> Inscribed</b> → <b className="text-amber-400">Bloodbound</b>.
          Create each rank as a separate entry, linking them with <b>Base Ogham</b> and <b>Rank</b>.
        </Help>

        <div className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium">Name</label>
              <FieldHint>e.g. "Wrath Seal", "Void Mark", "Crimson Carving"</FieldHint>
              <Input value={editing.name || ''} onChange={e => set('name', e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Icon</label>
              <Input value={editing.icon || '🩸'} onChange={e => set('icon', e.target.value)}
                className="text-xl text-center" style={{fontSize:22}} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Description <span className="text-muted-foreground font-normal">(shown in tooltip)</span></label>
            <Input value={editing.description || ''} onChange={e => set('description', e.target.value)} className="mt-1" />
          </div>

          <div>
            <label className="text-sm font-medium">Lore Text <span className="text-muted-foreground font-normal">(flavour text)</span></label>
            <textarea value={editing.lore || ''} onChange={e => set('lore', e.target.value)}
              rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-none" />
          </div>

          {/* Rank chain */}
          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🩸 Rank & Chain</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Rank</label>
                <FieldHint>1 = Carved (base), 2 = Inscribed, 3 = Bloodbound</FieldHint>
                <select value={editing.rank || 1} onChange={e => set('rank', parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                  <option value={1}>1 — Carved (base)</option>
                  <option value={2}>2 — Inscribed</option>
                  <option value={3}>3 — Bloodbound</option>
                </select>
              </div>
              {(editing.rank || 1) > 1 && (
                <div>
                  <label className="text-sm font-medium">Base Ogham</label>
                  <FieldHint>The Rank 1 Ogham this upgrades from.</FieldHint>
                  <select value={editing.base_ogham_id || ''} onChange={e => set('base_ogham_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                    <option value="">— Select base —</option>
                    {roots.map(o => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Kills to Rank Up</label>
                <FieldHint>Kills while equipped before advancing. 0 = max rank.</FieldHint>
                <Input type="number" value={editing.kills_to_rank_up ?? 50} min={0}
                  onChange={e => set('kills_to_rank_up', parseInt(e.target.value)||0)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Family</label>
              <FieldHint>Which Ogham family set this belongs to. Equip enough from one family to activate the set bonus.</FieldHint>
              <select value={editing.family_id || ''} onChange={e => set('family_id', e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                <option value="">— No family —</option>
                {families.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
              </select>
            </div>
          </div>

          {/* Powers */}
          <div className="p-4 bg-card border border-border rounded-lg space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">⚡ Powers — what this Ogham grants</h3>

            <div className="grid grid-cols-2 gap-3">
              {/* Element */}
              <div>
                <label className="text-sm font-medium">Element Attack</label>
                <FieldHint>Adds this element to the weapon's damage while equipped.</FieldHint>
                <select value={editing.element_attack || ''} onChange={e => set('element_attack', e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                  <option value="">— None —</option>
                  {ELEMENTS.filter(Boolean).map(el => <option key={el} value={el}>{el.charAt(0).toUpperCase()+el.slice(1)}</option>)}
                </select>
              </div>
              {/* Granted skill */}
              <div>
                <label className="text-sm font-medium">Grants Skill</label>
                <FieldHint>Unlocks this skill while the Ogham is equipped.</FieldHint>
                <select value={editing.granted_skill_id || ''} onChange={e => set('granted_skill_id', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                  <option value="">— No skill —</option>
                  {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {/* On-hit status */}
              <div>
                <label className="text-sm font-medium">On-Hit Status</label>
                <FieldHint>Status effect applied to the target on a successful hit.</FieldHint>
                <select value={editing.on_hit_status || ''} onChange={e => set('on_hit_status', e.target.value)}
                  className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                  <option value="">— None —</option>
                  {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>
              {/* On-hit chance */}
              {editing.on_hit_status && (
                <div>
                  <label className="text-sm font-medium">On-Hit Chance %</label>
                  <FieldHint>% chance the status triggers per hit (1–100).</FieldHint>
                  <Input type="number" value={editing.on_hit_chance ?? 25} min={1} max={100}
                    onChange={e => set('on_hit_chance', parseInt(e.target.value)||0)} />
                </div>
              )}
            </div>

            {/* Stat bonus */}
            <div>
              <label className="text-sm font-medium">Stat Bonus JSON</label>
              <FieldHint>Flat stat bonuses while equipped. e.g. <code>{`{"atk":5,"speed":3}`}</code></FieldHint>
              <textarea value={bonusJson} onChange={e => { setBonusJson(e.target.value); setJsonError('') }}
                rows={2} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-none" />
              {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── List view (rank chain display) ─────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><Droplets className="w-5 h-5 text-red-400" /> Blood Oghams</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{roots.length} Ogham chain{roots.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" /> New Ogham</Button>
      </div>

      <Help>
        Oghams are displayed as <b>rank chains</b>. Create the Rank 1 (Carved) version first, then create Rank 2 and 3
        versions linking back to it via <b>Base Ogham</b>. Assign oghams to a <b>Family</b> to enable set bonuses.
      </Help>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-4">
          {roots.length === 0 && <div className="text-center py-12 text-muted-foreground">No Blood Oghams defined yet.</div>}
          {roots.map(root => {
            const chain = [root, ...(byBase[root.id] || []).sort((a,b) => a.rank - b.rank)]
            const family = root.family_id ? familyMap[root.family_id] : null
            return (
              <div key={root.id} className="p-4 bg-card border border-red-900/30 rounded-lg">
                {/* Root header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{root.icon || '🩸'}</span>
                  <div>
                    <div className="font-bold text-red-400">{root.name}</div>
                    <div className="text-xs text-muted-foreground italic">{root.description}</div>
                    {family && <div className="text-[11px] text-muted-foreground mt-0.5">{family.icon} {family.name} family</div>}
                  </div>
                </div>
                {/* Rank cards */}
                <div className="flex gap-2 flex-wrap">
                  {chain.map(og => (
                    <div key={og.id} className={cn('flex-1 min-w-40 p-3 rounded-lg border text-xs', RANK_COLORS[og.rank] || 'border-border bg-card')}>
                      <div className={cn('font-bold uppercase tracking-wider text-[11px] mb-1', RANK_COLORS[og.rank]?.split(' ')[0])}>
                        {RANK_LABELS[og.rank] || `Rank ${og.rank}`}
                        {og.kills_to_rank_up ? <span className="text-muted-foreground font-normal ml-1">· {og.kills_to_rank_up}↑</span> : ''}
                      </div>
                      <div className="text-muted-foreground leading-relaxed">{grantSummary(og)}</div>
                      <div className="flex gap-1 mt-2">
                        <button onClick={() => openEdit(og)} className="text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => del(og.id, og.name)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Add next rank */}
                  {chain.length < 3 && (
                    <button onClick={() => openEdit({ ...BLANK, base_ogham_id: root.id, rank: chain.length + 1, name: root.name })}
                      className="flex-1 min-w-40 p-3 rounded-lg border-2 border-dashed border-muted-foreground/20 text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1 text-xs">
                      <Plus className="w-3.5 h-3.5" /> Add {RANK_LABELS[chain.length + 1] || `Rank ${chain.length+1}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
