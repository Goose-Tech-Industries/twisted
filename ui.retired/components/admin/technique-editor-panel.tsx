"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Plus, Save, ChevronLeft, Trash2, Search, Swords, Zap, Shield,
  Heart, Eye, EyeOff, Flame, Star, Copy
} from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Technique {
  id?: number; ruleset_id: number | null
  name: string; description: string; icon: string | null
  category: string; subcategory: string | null; attack_type: string; range_type: string; targets: string
  damage_pct: number; cost_pct: number; min_damage_pct: number | null
  damage_formula: string | null; cost_formula: string | null
  multi_hit_count: number; can_be_dodged: boolean; can_be_blocked: boolean; can_be_countered: boolean
  dodge_modifier: number; guard_crush: boolean; guaranteed_hit: boolean; piercing: boolean
  stun_chance_pct: number; stun_duration: number; bleed_chance_pct: number; bleed_severity: string
  crit_chance_pct: number; crit_damage_mult: number; combo_chance_pct: number
  min_level: number; min_powerlevel: number; required_race: string | null; required_class: string | null
  is_signature: boolean; signature_type: string | null; max_level: number
  level_damage_scale: unknown; ability_slot_levels: unknown
  is_hidden: boolean; discovery_method: string | null; discovery_hint: string | null
  can_charge: boolean; charge_damage_bonus_pct: number
  is_starter: boolean; is_active: boolean; sort_order: number
  _isNew?: boolean
}

type EditorView = 'list' | 'edit'

const CATEGORIES = [
  { value: 'physical', label: 'Physical', icon: Swords },
  { value: 'ki', label: 'Ki / Magic', icon: Zap },
  { value: 'signature', label: 'Signature', icon: Star },
  { value: 'defense', label: 'Defense', icon: Shield },
  { value: 'healing', label: 'Healing', icon: Heart },
  { value: 'utility', label: 'Utility', icon: Eye },
  { value: 'transformation', label: 'Transformation', icon: Flame },
  { value: 'hidden', label: 'Hidden / Secret', icon: EyeOff },
]

export function TechniqueEditorPanel() {
  const [view, setView] = useState<EditorView>('list')
  const [techniques, setTechniques] = useState<Technique[]>([])
  const [selected, setSelected] = useState<Technique | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('all')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/api/entities/game_techniques`, { credentials: 'include' })
      const data = await res.json()
      setTechniques(data.rows || data.entities || [])
    } catch { setTechniques([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = techniques.filter(t => {
    if (filterCat !== 'all' && t.category !== filterCat) return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const saveTechnique = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const method = selected._isNew ? 'POST' : 'PUT'
      const url = selected._isNew
        ? `${API}/admin/api/entities/game_techniques`
        : `${API}/admin/api/entities/game_techniques/${selected.id}`
      await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected),
      })
      await load()
      if (selected._isNew) setView('list')
    } catch (e) { console.error('Save failed:', e) }
    setSaving(false)
  }

  const duplicate = (tech: Technique) => {
    setSelected({
      ...tech, id: undefined, _isNew: true,
      name: `${tech.name} (Copy)`,
    })
    setView('edit')
  }

  // ═════ LIST VIEW ═════
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Swords className="w-5 h-5" /> Techniques & Abilities
          </h2>
          <Button size="sm" onClick={() => {
            setSelected({
              ruleset_id: null, name: 'New Technique', description: '', icon: null,
              category: 'physical', subcategory: null, attack_type: 'melee', range_type: 'short', targets: 'single',
              damage_pct: 5, cost_pct: 0, min_damage_pct: null, damage_formula: null, cost_formula: null,
              multi_hit_count: 1, can_be_dodged: true, can_be_blocked: true, can_be_countered: false,
              dodge_modifier: 0, guard_crush: false, guaranteed_hit: false, piercing: false,
              stun_chance_pct: 0, stun_duration: 0, bleed_chance_pct: 0, bleed_severity: 'none',
              crit_chance_pct: 3, crit_damage_mult: 1.5, combo_chance_pct: 0,
              min_level: 0, min_powerlevel: 0, required_race: null, required_class: null,
              is_signature: false, signature_type: null, max_level: 10,
              level_damage_scale: null, ability_slot_levels: null,
              is_hidden: false, discovery_method: null, discovery_hint: null,
              can_charge: false, charge_damage_bonus_pct: 0,
              is_starter: false, is_active: true, sort_order: 0, _isNew: true,
            })
            setView('edit')
          }}>
            <Plus className="w-4 h-4 mr-1" /> New Technique
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search techniques..."
              className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => setFilterCat('all')}
              className={cn("px-2 py-1 rounded text-xs", filterCat === 'all' ? "bg-primary text-primary-foreground" : "bg-secondary")}>
              All
            </button>
            {CATEGORIES.map(c => (
              <button key={c.value} onClick={() => setFilterCat(c.value)}
                className={cn("px-2 py-1 rounded text-xs flex items-center gap-1", filterCat === c.value ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                <c.icon className="w-3 h-3" /> {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="space-y-1">
          {loading ? <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p> :
            filtered.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">No techniques found.</p> :
            filtered.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/30 cursor-pointer group"
                onClick={() => { setSelected(t); setView('edit') }}>
                <span className="text-lg w-8 text-center">{t.icon || (t.category === 'physical' ? '👊' : t.category === 'ki' ? '💥' : t.category === 'healing' ? '💚' : '⚡')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{t.name}</span>
                    {t.is_hidden && <EyeOff className="w-3 h-3 text-muted-foreground" />}
                    {t.is_signature && <Star className="w-3 h-3 text-primary" />}
                    {t.is_starter && <span className="text-[10px] bg-primary/20 text-primary px-1 rounded">Starter</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex gap-2">
                    <span className="capitalize">{t.category}</span>
                    <span>{t.damage_pct}% dmg</span>
                    {t.cost_pct > 0 && <span>{t.cost_pct}% cost</span>}
                    {t.stun_chance_pct > 0 && <span>{t.stun_chance_pct}% stun</span>}
                    {t.required_race && <span>Race: {t.required_race}</span>}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); duplicate(t) }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            ))
          }
        </div>
      </div>
    )
  }

  // ═════ EDIT VIEW ═════
  if (!selected) return null

  const u = (key: keyof Technique, val: unknown) => setSelected(prev => prev ? { ...prev, [key]: val } as Technique : null)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Input value={selected.name} onChange={e => u('name', e.target.value)}
          className="text-lg font-bold border-none bg-transparent p-0 h-auto flex-1" />
        <Button size="sm" onClick={saveTechnique} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* ── Identity ── */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase">Identity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Category">
            <select value={selected.category} onChange={e => u('category', e.target.value)} className="input-style">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </F>
          <F label="Attack Type">
            <select value={selected.attack_type} onChange={e => u('attack_type', e.target.value)} className="input-style">
              {['melee','ranged','beam','blast','aura','self','passive'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </F>
          <F label="Range">
            <select value={selected.range_type} onChange={e => u('range_type', e.target.value)} className="input-style">
              {['short','medium','long','self'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </F>
          <F label="Targets">
            <select value={selected.targets} onChange={e => u('targets', e.target.value)} className="input-style">
              {['single','multi','aoe','self','ally'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </F>
        </div>
        <F label="Description">
          <textarea value={selected.description || ''} onChange={e => u('description', e.target.value)}
            rows={2} className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-sm resize-none" />
        </F>
        <F label="Icon (emoji)">
          <Input value={selected.icon || ''} onChange={e => u('icon', e.target.value || null)} placeholder="👊" className="w-20" />
        </F>
      </CardContent></Card>

      {/* ── Damage & Cost ── */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase">Damage & Cost</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Damage %"><Input type="number" step="0.5" value={selected.damage_pct} onChange={e => u('damage_pct', Number(e.target.value))} /></F>
          <F label="Cost %"><Input type="number" step="0.5" value={selected.cost_pct} onChange={e => u('cost_pct', Number(e.target.value))} /></F>
          <F label="Crit Chance %"><Input type="number" step="0.5" value={selected.crit_chance_pct} onChange={e => u('crit_chance_pct', Number(e.target.value))} /></F>
          <F label="Crit Multiplier"><Input type="number" step="0.1" value={selected.crit_damage_mult} onChange={e => u('crit_damage_mult', Number(e.target.value))} /></F>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <F label="Damage Formula (optional)"><Input value={selected.damage_formula || ''} onChange={e => u('damage_formula', e.target.value || null)} placeholder="atk * 1.5 + level * 2" /></F>
          <F label="Cost Formula (optional)"><Input value={selected.cost_formula || ''} onChange={e => u('cost_formula', e.target.value || null)} placeholder="level * 0.5" /></F>
          <F label="Multi-hit Count"><Input type="number" value={selected.multi_hit_count} onChange={e => u('multi_hit_count', Number(e.target.value))} /></F>
        </div>
      </CardContent></Card>

      {/* ── Status Effects ── */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase">Status Effects</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Stun Chance %"><Input type="number" step="1" value={selected.stun_chance_pct} onChange={e => u('stun_chance_pct', Number(e.target.value))} /></F>
          <F label="Stun Duration (turns)"><Input type="number" value={selected.stun_duration} onChange={e => u('stun_duration', Number(e.target.value))} /></F>
          <F label="Bleed Chance %"><Input type="number" step="1" value={selected.bleed_chance_pct} onChange={e => u('bleed_chance_pct', Number(e.target.value))} /></F>
          <F label="Bleed Severity">
            <select value={selected.bleed_severity} onChange={e => u('bleed_severity', e.target.value)} className="input-style">
              {['none','light','moderate','heavy'].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </F>
          <F label="Combo Chance %"><Input type="number" step="1" value={selected.combo_chance_pct} onChange={e => u('combo_chance_pct', Number(e.target.value))} /></F>
          <F label="Dodge Modifier %"><Input type="number" step="1" value={selected.dodge_modifier} onChange={e => u('dodge_modifier', Number(e.target.value))} /></F>
        </div>
        <div className="flex flex-wrap gap-4">
          <T label="Guard Crush" checked={selected.guard_crush} onChange={v => u('guard_crush', v)} />
          <T label="Guaranteed Hit" checked={selected.guaranteed_hit} onChange={v => u('guaranteed_hit', v)} />
          <T label="Piercing" checked={selected.piercing} onChange={v => u('piercing', v)} />
          <T label="Can Be Dodged" checked={selected.can_be_dodged} onChange={v => u('can_be_dodged', v)} />
          <T label="Can Be Blocked" checked={selected.can_be_blocked} onChange={v => u('can_be_blocked', v)} />
          <T label="Can Be Countered" checked={selected.can_be_countered} onChange={v => u('can_be_countered', v)} />
          <T label="Can Charge" checked={selected.can_charge} onChange={v => u('can_charge', v)} />
        </div>
      </CardContent></Card>

      {/* ── Requirements ── */}
      <Card><CardContent className="p-4 space-y-3">
        <h3 className="text-xs font-bold text-muted-foreground uppercase">Requirements & Availability</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Min Level"><Input type="number" value={selected.min_level} onChange={e => u('min_level', Number(e.target.value))} /></F>
          <F label="Min Powerlevel"><Input type="number" value={selected.min_powerlevel} onChange={e => u('min_powerlevel', Number(e.target.value))} /></F>
          <F label="Race (blank=any)"><Input value={selected.required_race || ''} onChange={e => u('required_race', e.target.value || null)} placeholder="saiyan" /></F>
          <F label="Class (blank=any)"><Input value={selected.required_class || ''} onChange={e => u('required_class', e.target.value || null)} placeholder="warrior" /></F>
        </div>
        <div className="flex flex-wrap gap-4">
          <T label="Starter (given to new chars)" checked={selected.is_starter} onChange={v => u('is_starter', v)} />
          <T label="Signature" checked={selected.is_signature} onChange={v => u('is_signature', v)} />
          <T label="Hidden / Secret" checked={selected.is_hidden} onChange={v => u('is_hidden', v)} />
          <T label="Active" checked={selected.is_active} onChange={v => u('is_active', v)} />
        </div>
      </CardContent></Card>

      {/* ── Hidden Technique Config ── */}
      {selected.is_hidden && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
            <EyeOff className="w-4 h-4" /> Hidden Technique
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <F label="Discovery Method">
              <select value={selected.discovery_method || ''} onChange={e => u('discovery_method', e.target.value || null)} className="input-style">
                <option value="">None</option>
                {['quest','npc','location','achievement','combat','dm_grant','item'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </F>
            <F label="Discovery Hint (shown to players)">
              <Input value={selected.discovery_hint || ''} onChange={e => u('discovery_hint', e.target.value || null)}
                placeholder="Rumored to be taught by a master on Planet Vegeta..." />
            </F>
          </div>
        </CardContent></Card>
      )}

      {/* ── Signature Config ── */}
      {selected.is_signature && (
        <Card><CardContent className="p-4 space-y-3">
          <h3 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
            <Star className="w-4 h-4" /> Signature Scaling
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <F label="Type">
              <select value={selected.signature_type || ''} onChange={e => u('signature_type', e.target.value || null)} className="input-style">
                <option value="ki_manipulation">Ki Manipulation</option>
                <option value="ki_healing">Ki Healing</option>
                <option value="custom">Custom</option>
              </select>
            </F>
            <F label="Max Level"><Input type="number" value={selected.max_level} onChange={e => u('max_level', Number(e.target.value))} /></F>
            <F label="Ability Slot Levels">
              <Input value={selected.ability_slot_levels ? JSON.stringify(selected.ability_slot_levels) : ''} onChange={e => {
                try { u('ability_slot_levels', JSON.parse(e.target.value)) } catch { u('ability_slot_levels', null) }
              }} placeholder="[3, 5, 8, 10]" />
            </F>
          </div>
          <p className="text-[10px] text-muted-foreground">Level scaling JSON: {'[{"level":1,"damage_pct":10,"cost_pct":1}, ...]'}</p>
          <textarea value={selected.level_damage_scale ? JSON.stringify(selected.level_damage_scale, null, 2) : ''}
            onChange={e => { try { u('level_damage_scale', JSON.parse(e.target.value)) } catch {} }}
            rows={4} className="w-full bg-secondary/50 border border-border rounded px-3 py-2 text-xs font-mono resize-none" />
        </CardContent></Card>
      )}
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium block mb-1">{label}</label>{children}</div>
}

function T({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-border" />
      <span>{label}</span>
    </label>
  )
}
