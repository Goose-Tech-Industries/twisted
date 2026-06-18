"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  Plus, Save, ChevronLeft, Trash2, Copy, Settings2,
  Clock, Swords, Dumbbell, Move, Sparkles
} from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

// ─── Types ──────────────────────────────────────────────────────
interface Ruleset {
  id: number; name: string; description: string | null
  stat_mode: string; primary_stat_name: string; custom_stats_json: unknown
  combat_mode: string
  moves_per_day: number | null; tiles_per_move: number; move_reset_time: string | null
  move_reset_timezone: string
  near_death_enabled: boolean; near_death_json: unknown
  allow_flying: boolean; flying_tile_bonus: number
  allow_transformation: boolean; permadeath: boolean; friendly_fire: boolean
  level_cap: number | null; xp_curve: string; xp_curve_json: unknown
  is_active: boolean
}

interface ActionWindow {
  id?: number; ruleset_id: number
  action_type: string; label: string; icon: string | null
  window_type: string; max_uses_per_day: number | null; max_uses_per_window: number
  block_count: number; block_start_hour: number
  reset_time: string; reset_timezone: string
  effect_json: unknown
  min_level: number; requires_opponent: boolean; requires_master: boolean; blocked_in_combat: boolean
  sort_order: number; is_active: boolean
  _isNew?: boolean
}

interface RulesetModifier {
  id?: number; ruleset_id: number
  target_type: string; target_name: string
  action_type: string | null; stat_key: string | null
  multiplier: number; flat_bonus: number; extra_uses: number
  tiles_per_move_override: number | null; custom_json: unknown
  is_active: boolean
  _isNew?: boolean
}

type EditorView = 'list' | 'edit'

// ═══════════════════════════════════════════════════════════════
// RULESET EDITOR PANEL — AdminSauce
// ═══════════════════════════════════════════════════════════════
export function RulesetEditorPanel() {
  const [view, setView] = useState<EditorView>('list')
  const [rulesets, setRulesets] = useState<Ruleset[]>([])
  const [selected, setSelected] = useState<Ruleset | null>(null)
  const [windows, setWindows] = useState<ActionWindow[]>([])
  const [modifiers, setModifiers] = useState<RulesetModifier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ── Fetch all rulesets ──
  const loadRulesets = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/api/rulesets`, { credentials: 'include' })
      const data = await res.json()
      setRulesets(data.rulesets || [])
    } catch { setRulesets([]) }
    setLoading(false)
  }, [])

  useEffect(() => { loadRulesets() }, [loadRulesets])

  // ── Load windows + modifiers for a ruleset ──
  const loadRulesetDetails = async (rs: Ruleset) => {
    setSelected(rs)
    try {
      const [wRes, mRes] = await Promise.all([
        fetch(`${API}/admin/api/rulesets/${rs.id}/windows`, { credentials: 'include' }),
        fetch(`${API}/admin/api/rulesets/${rs.id}/modifiers`, { credentials: 'include' }),
      ])
      const wData = await wRes.json()
      const mData = await mRes.json()
      setWindows(wData.windows || [])
      setModifiers(mData.modifiers || [])
    } catch {
      setWindows([])
      setModifiers([])
    }
    setView('edit')
  }

  // ── Save ruleset ──
  const saveRuleset = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await fetch(`${API}/admin/api/rulesets/${selected.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleset: selected, windows, modifiers }),
      })
      await loadRulesets()
    } catch (e) { console.error('Save failed:', e) }
    setSaving(false)
  }

  // ── Create new ruleset ──
  const createRuleset = async () => {
    try {
      const res = await fetch(`${API}/admin/api/rulesets`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Ruleset', stat_mode: 'standard', combat_mode: 'turn_based' }),
      })
      const data = await res.json()
      await loadRulesets()
      if (data.id) {
        const fresh = { ...defaultRuleset, id: data.id, name: 'New Ruleset' } as Ruleset
        loadRulesetDetails(fresh)
      }
    } catch (e) { console.error('Create failed:', e) }
  }

  // ═════ LIST VIEW ═════
  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings2 className="w-5 h-5" /> Campaign Rulesets
          </h2>
          <Button size="sm" onClick={createRuleset}><Plus className="w-4 h-4 mr-1" /> New Ruleset</Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Define how RPG systems work — stat modes, action limits, training windows, race bonuses.
          Link a ruleset to any campaign.
        </p>

        {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
          <div className="grid gap-3">
            {rulesets.map(rs => (
              <Card key={rs.id} className="cursor-pointer hover:bg-secondary/30 transition-colors"
                onClick={() => loadRulesetDetails(rs)}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm">{rs.name}</h3>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Stats: {rs.stat_mode}</span>
                      <span>Combat: {rs.combat_mode}</span>
                      {rs.moves_per_day && <span>{rs.moves_per_day} moves/day</span>}
                      {!rs.is_active && <span className="text-destructive">Inactive</span>}
                    </div>
                  </div>
                  <Swords className="w-4 h-4 text-muted-foreground" />
                </CardContent>
              </Card>
            ))}
            {rulesets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No rulesets yet. Create one to define how your RPG campaigns work.
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ═════ EDIT VIEW ═════
  if (!selected) return null

  const update = (key: keyof Ruleset, val: unknown) => {
    setSelected(prev => prev ? { ...prev, [key]: val } as Ruleset : null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView('list')} className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <Input value={selected.name} onChange={e => update('name', e.target.value)}
          className="text-lg font-bold border-none bg-transparent p-0 h-auto" />
        <Button size="sm" onClick={saveRuleset} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>

      {/* ── Core Settings ── */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Core Settings</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Stat Mode">
              <select value={selected.stat_mode} onChange={e => update('stat_mode', e.target.value)} className="input-style">
                <option value="standard">Standard (ATK/DEF/MO/MD/SPD/LCK)</option>
                <option value="single">Single Stat (Powerlevel, etc.)</option>
                <option value="dnd">D&D (STR/DEX/CON/INT/WIS/CHA)</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            {selected.stat_mode === 'single' && (
              <Field label="Stat Name">
                <Input value={selected.primary_stat_name || ''} onChange={e => update('primary_stat_name', e.target.value)}
                  placeholder="Powerlevel" />
              </Field>
            )}
            <Field label="Combat Mode">
              <select value={selected.combat_mode} onChange={e => update('combat_mode', e.target.value)} className="input-style">
                <option value="turn_based">Turn-Based (FF, DQ, Persona)</option>
                <option value="atb">ATB (FF7, Chrono Trigger)</option>
                <option value="tactical">Tactical Grid (FFT, Fire Emblem)</option>
                <option value="real_time">Real-Time (BG3, Legaia)</option>
                <option value="narrative">Narrative (DM-described)</option>
              </select>
            </Field>
            <Field label="XP Curve">
              <select value={selected.xp_curve} onChange={e => update('xp_curve', e.target.value)} className="input-style">
                <option value="exponential">Exponential</option>
                <option value="linear">Linear</option>
                <option value="flat">Flat</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Level Cap">
              <Input type="number" value={selected.level_cap ?? ''} onChange={e => update('level_cap', e.target.value ? Number(e.target.value) : null)}
                placeholder="None" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <Toggle label="Flying" checked={selected.allow_flying} onChange={v => update('allow_flying', v)} />
            <Toggle label="Transformations" checked={selected.allow_transformation} onChange={v => update('allow_transformation', v)} />
            <Toggle label="Permadeath" checked={selected.permadeath} onChange={v => update('permadeath', v)} />
            <Toggle label="Friendly Fire" checked={selected.friendly_fire} onChange={v => update('friendly_fire', v)} />
            <Toggle label="Near-Death Bonus" checked={selected.near_death_enabled} onChange={v => update('near_death_enabled', v)} />
          </div>
        </CardContent>
      </Card>

      {/* ── Movement ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Move className="w-4 h-4" /> Movement Rules
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Moves/Day">
              <Input type="number" value={selected.moves_per_day ?? ''} onChange={e => update('moves_per_day', e.target.value ? Number(e.target.value) : null)}
                placeholder="Unlimited" />
            </Field>
            <Field label="Tiles/Move">
              <Input type="number" value={selected.tiles_per_move} onChange={e => update('tiles_per_move', Number(e.target.value))} />
            </Field>
            <Field label="Flying Bonus Tiles">
              <Input type="number" value={selected.flying_tile_bonus} onChange={e => update('flying_tile_bonus', Number(e.target.value))} />
            </Field>
            <Field label="Reset Time (HH:MM)">
              <Input value={selected.move_reset_time || ''} onChange={e => update('move_reset_time', e.target.value || null)}
                placeholder="22:00" />
            </Field>
          </div>
        </CardContent>
      </Card>

      {/* ── Action Windows ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" /> Action Windows
            </h3>
            <Button size="sm" variant="outline" onClick={() => {
              setWindows(prev => [...prev, {
                ruleset_id: selected.id, action_type: 'new_action', label: 'New Action',
                icon: null, window_type: 'daily_pool', max_uses_per_day: 4, max_uses_per_window: 1,
                block_count: 4, block_start_hour: 2, reset_time: '00:00', reset_timezone: 'America/New_York',
                effect_json: null, min_level: 0, requires_opponent: false, requires_master: false,
                blocked_in_combat: true, sort_order: windows.length, is_active: true, _isNew: true,
              }])
            }}>
              <Plus className="w-3 h-3 mr-1" /> Add Action
            </Button>
          </div>

          {windows.map((aw, i) => (
            <div key={aw.id || `new-${i}`} className="border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input value={aw.label} onChange={e => {
                  const copy = [...windows]; copy[i] = { ...copy[i], label: e.target.value }; setWindows(copy)
                }} className="font-medium" placeholder="Action Label" />
                <Input value={aw.action_type} onChange={e => {
                  const copy = [...windows]; copy[i] = { ...copy[i], action_type: e.target.value }; setWindows(copy)
                }} className="w-40 text-xs" placeholder="action_key" />
                <button onClick={() => setWindows(prev => prev.filter((_, j) => j !== i))}
                  className="text-destructive hover:text-destructive/80">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Field label="Window Type" small>
                  <select value={aw.window_type} onChange={e => {
                    const copy = [...windows]; copy[i] = { ...copy[i], window_type: e.target.value }; setWindows(copy)
                  }} className="input-style text-xs">
                    <option value="daily_pool">Daily Pool (X/day)</option>
                    <option value="per_window">Per Window (X/block)</option>
                    <option value="fixed_blocks">Fixed Blocks</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                </Field>
                {(aw.window_type === 'daily_pool') && (
                  <Field label="Uses/Day" small>
                    <Input type="number" value={aw.max_uses_per_day ?? ''} className="text-xs"
                      onChange={e => { const copy = [...windows]; copy[i] = { ...copy[i], max_uses_per_day: Number(e.target.value) }; setWindows(copy) }} />
                  </Field>
                )}
                {(aw.window_type === 'per_window' || aw.window_type === 'fixed_blocks') && (
                  <>
                    <Field label="Uses/Window" small>
                      <Input type="number" value={aw.max_uses_per_window} className="text-xs"
                        onChange={e => { const copy = [...windows]; copy[i] = { ...copy[i], max_uses_per_window: Number(e.target.value) }; setWindows(copy) }} />
                    </Field>
                    <Field label="Blocks/Day" small>
                      <Input type="number" value={aw.block_count} className="text-xs"
                        onChange={e => { const copy = [...windows]; copy[i] = { ...copy[i], block_count: Number(e.target.value) }; setWindows(copy) }} />
                    </Field>
                    <Field label="Start Hour" small>
                      <Input type="number" value={aw.block_start_hour} min={0} max={23} className="text-xs"
                        onChange={e => { const copy = [...windows]; copy[i] = { ...copy[i], block_start_hour: Number(e.target.value) }; setWindows(copy) }} />
                    </Field>
                  </>
                )}
              </div>
              <div className="flex gap-3 text-xs">
                <Toggle label="Needs Opponent" checked={aw.requires_opponent} small
                  onChange={v => { const copy = [...windows]; copy[i] = { ...copy[i], requires_opponent: v }; setWindows(copy) }} />
                <Toggle label="Needs Master" checked={aw.requires_master} small
                  onChange={v => { const copy = [...windows]; copy[i] = { ...copy[i], requires_master: v }; setWindows(copy) }} />
                <Toggle label="Blocked in Combat" checked={aw.blocked_in_combat} small
                  onChange={v => { const copy = [...windows]; copy[i] = { ...copy[i], blocked_in_combat: v }; setWindows(copy) }} />
              </div>
            </div>
          ))}
          {windows.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No action windows — all actions unlimited.</p>
          )}
        </CardContent>
      </Card>

      {/* ── Race/Class Modifiers ── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Race / Class Modifiers
            </h3>
            <Button size="sm" variant="outline" onClick={() => {
              setModifiers(prev => [...prev, {
                ruleset_id: selected.id, target_type: 'race', target_name: '',
                action_type: null, stat_key: null, multiplier: 1.0, flat_bonus: 0,
                extra_uses: 0, tiles_per_move_override: null, custom_json: null,
                is_active: true, _isNew: true,
              }])
            }}>
              <Plus className="w-3 h-3 mr-1" /> Add Modifier
            </Button>
          </div>

          {modifiers.map((mod, i) => (
            <div key={mod.id || `mod-${i}`} className="border border-border rounded-lg p-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <Field label="Type" small>
                  <select value={mod.target_type} onChange={e => {
                    const copy = [...modifiers]; copy[i] = { ...copy[i], target_type: e.target.value }; setModifiers(copy)
                  }} className="input-style text-xs">
                    <option value="race">Race</option>
                    <option value="class">Class</option>
                    <option value="status">Status Effect</option>
                    <option value="background">Background</option>
                  </select>
                </Field>
                <Field label="Name" small>
                  <Input value={mod.target_name} placeholder="saiyan, warrior..." className="text-xs"
                    onChange={e => { const copy = [...modifiers]; copy[i] = { ...copy[i], target_name: e.target.value }; setModifiers(copy) }} />
                </Field>
                <Field label="Action (blank=all)" small>
                  <Input value={mod.action_type || ''} placeholder="self_train" className="text-xs"
                    onChange={e => { const copy = [...modifiers]; copy[i] = { ...copy[i], action_type: e.target.value || null }; setModifiers(copy) }} />
                </Field>
                <Field label="Multiplier" small>
                  <Input type="number" step="0.01" value={mod.multiplier} className="text-xs"
                    onChange={e => { const copy = [...modifiers]; copy[i] = { ...copy[i], multiplier: Number(e.target.value) }; setModifiers(copy) }} />
                </Field>
                <div className="flex items-end gap-1">
                  <Field label="Extra Uses" small>
                    <Input type="number" value={mod.extra_uses} className="text-xs"
                      onChange={e => { const copy = [...modifiers]; copy[i] = { ...copy[i], extra_uses: Number(e.target.value) }; setModifiers(copy) }} />
                  </Field>
                  <button onClick={() => setModifiers(prev => prev.filter((_, j) => j !== i))}
                    className="text-destructive hover:text-destructive/80 pb-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {modifiers.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No modifiers — all races/classes equal.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────
function Field({ label, children, small }: { label: string; children: React.ReactNode; small?: boolean }) {
  return (
    <div>
      <label className={cn("font-medium block mb-1", small ? "text-[10px]" : "text-xs")}>{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, checked, onChange, small }: { label: string; checked: boolean; onChange: (v: boolean) => void; small?: boolean }) {
  return (
    <label className={cn("flex items-center gap-1.5 cursor-pointer", small ? "text-[10px]" : "text-xs")}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="rounded border-border" />
      <span>{label}</span>
    </label>
  )
}

const defaultRuleset: Partial<Ruleset> = {
  stat_mode: 'standard', primary_stat_name: 'Powerlevel', combat_mode: 'turn_based',
  moves_per_day: null, tiles_per_move: 3, move_reset_time: null, move_reset_timezone: 'America/New_York',
  near_death_enabled: false, allow_flying: true, flying_tile_bonus: 0,
  allow_transformation: true, permadeath: false, friendly_fire: false,
  level_cap: null, xp_curve: 'exponential', is_active: true,
}
