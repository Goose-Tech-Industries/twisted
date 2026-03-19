"use client"
import { toast } from "@/hooks/use-toast"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Pencil, X, Check, ChevronDown, ChevronRight, ExternalLink, Plus } from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface BattleSetting {
  key: string; type: 'toggle' | 'number' | 'percent' | 'select' | 'text'
  label: string; desc?: string; value?: string | null; options?: string[]
  termKey?: string; terminology?: { term_key: string; display_name: string; icon?: string; description?: string }
}

interface Category { label: string; icon: string; settings: BattleSetting[]; entityKeys?: string[] }

// Map entity keys to display config
const ENTITY_DISPLAY: Record<string, { label: string; columns: string[]; editSection?: string }> = {
  body_types:         { label: 'Body Types',           columns: ['icon','name','label'],                       editSection: 'body_types' },
  limb_zones:         { label: 'Limb Zones',           columns: ['icon','label','zone_key','hp_pct'],          editSection: 'limb_zones' },
  bleed_tiers:        { label: 'Bleed Tiers',          columns: ['icon','name','label','duration_turns','damage_pct'], editSection: 'bleed_tiers' },
  fighting_styles:    { label: 'Fighting Styles',      columns: ['icon','name','label','style_type'],          editSection: 'fighting_styles' },
  style_ranks:        { label: 'Style Ranks',          columns: ['style_id','rank_num','label','wins_required'], editSection: 'style_ranks' },
  weather_effects:    { label: 'Weather Effects',      columns: ['icon','name','label','visibility'],          editSection: 'weather' },
  elemental_reactions:{ label: 'Elemental Reactions',  columns: ['icon','element_a','element_b','reaction_name','damage_bonus'], editSection: 'elem_reaction' },
  status_combos:      { label: 'Status Combos',        columns: ['icon','status_a','status_b','combo_name','effect_type'], editSection: 'status_combo' },
  alignment_tiers:    { label: 'Alignment Tiers',      columns: ['icon','name','label','min_value','max_value','color'], editSection: 'alignment_tier' },
  alignment_actions:  { label: 'Alignment Actions',    columns: ['action_key','label','shift_amount'],         editSection: 'alignment_action' },
  battle_rules:       { label: 'Battle Rules',         columns: ['name','trigger_event','target_filter','enabled','priority'], editSection: 'battle_rule' },
  win_conditions:     { label: 'Win Conditions',       columns: ['icon','name','condition_type','description'], editSection: 'win_condition' },
  afterlife_worlds:   { label: 'Afterlife Worlds',     columns: ['icon','name','label','type','stay_duration_days'], editSection: 'afterlife' },
  transformations:    { label: 'Transformations',      columns: ['icon','name','trigger_type','duration','level_required'], editSection: 'transformation' },
  traps:              { label: 'Traps',                columns: ['icon','name','trigger_type','damage_formula'], editSection: 'trap' },
  narrations:         { label: 'Battle Narrations',    columns: ['action_type','weapon_type','element','preview'], editSection: 'narration' },
  training_config:    { label: 'Training Types',       columns: ['name','label','training_type','daily_limit'], editSection: 'training_config' },
  sig_levels:         { label: 'Sig Tech Levels',      columns: ['level','damage_pct','cost_pct','ability_slots','xp_required'], editSection: 'sig_levels' },
  sig_abilities:      { label: 'Sig Tech Abilities',   columns: ['icon','label','category','min_level'],       editSection: 'sig_abilities' },
  flavor_texts:       { label: 'Flavor Texts',         columns: ['category','preview','bonus_pct'],            editSection: 'flavor_texts' },
  flavor_keywords:    { label: 'Flavor Keywords',      columns: ['keyword','bonus_pct','category','terrain_match'], editSection: 'flavor_keywords' },
  masters:            { label: 'NPC Masters',          columns: ['name','icon','training_gain_pct'],           editSection: 'npcs' },
  tournaments:        { label: 'Recent Tournaments',   columns: ['name','status','type','max_participants'],   editSection: 'tournaments' },
}

// Map categories to their entity keys
const CATEGORY_ENTITIES: Record<string, string[]> = {
  core_combat:    ['body_types', 'limb_zones'],
  damage:         ['bleed_tiers'],
  rp_system:      ['narrations', 'flavor_texts', 'flavor_keywords'],
  ki_magic:       [],
  progression:    ['fighting_styles', 'sig_levels', 'sig_abilities'],
  advanced:       ['win_conditions', 'weather_effects', 'elemental_reactions', 'status_combos', 'battle_rules', 'transformations', 'traps'],
  social:         ['alignment_tiers', 'alignment_actions'],
  meta:           ['afterlife_worlds', 'training_config', 'masters', 'tournaments'],
}

export function BattleConfigPanel() {
  const [categories, setCategories] = useState<Record<string, Category>>({})
  const [entities, setEntities] = useState<Record<string, Record<string, unknown>[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['core_combat']))
  const [expandedEntities, setExpandedEntities] = useState<Set<string>>(new Set())
  const [editingTerm, setEditingTerm] = useState<string | null>(null)
  const [termName, setTermName] = useState('')
  const [termIcon, setTermIcon] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/battle-config`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setCategories(data.categories)
        setEntities(data.entities || {})
      }
    } catch (e) { console.error('Failed to load battle config:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateSetting = async (key: string, value: string, termKey?: string, displayName?: string, icon?: string) => {
    setSaving(key)
    try {
      await fetch(`${API}/admin-panel/battle-config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, termKey, displayName, icon })
      })
      setCategories(prev => {
        const next = { ...prev }
        for (const cat of Object.values(next)) {
          for (const s of cat.settings) {
            if (s.key === key) s.value = value
            if (s.termKey === termKey && displayName && s.terminology) {
              s.terminology.display_name = displayName
              if (icon) s.terminology.icon = icon
            }
          }
        }
        return next
      })
    } catch {}
    setSaving(null)
  }

  const toggleCat = (catKey: string) => {
    setExpandedCats(prev => { const n = new Set(prev); n.has(catKey) ? n.delete(catKey) : n.add(catKey); return n })
  }
  const toggleEntitySection = (key: string) => {
    setExpandedEntities(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  // Navigate to entity editor section
  const goToSection = (section: string) => {
    // Find the adminsauce container and trigger section change
    const event = new CustomEvent('adminsauce-navigate', { detail: { section } })
    window.dispatchEvent(event)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading battle configuration...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold">Battle Configuration</h2>
          <p className="text-sm text-muted-foreground">Toggle systems, tune parameters, manage entities, rename terminology.</p>
        </div>
        <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded">
          {Object.values(categories).reduce((sum, c) => sum + c.settings.filter(s => s.type === 'toggle' && s.value === 'true').length, 0)} systems active
        </div>
      </div>

      {Object.entries(categories).map(([catKey, cat]) => {
        const isExpanded = expandedCats.has(catKey)
        const enabledCount = cat.settings.filter(s => s.type === 'toggle' && s.value === 'true').length
        const toggleCount = cat.settings.filter(s => s.type === 'toggle').length
        const entityKeys = CATEGORY_ENTITIES[catKey] || []
        const totalEntities = entityKeys.reduce((sum, k) => sum + (entities[k]?.length || 0), 0)

        return (
          <Card key={catKey} className="celtic-border overflow-hidden">
            <button
              onClick={() => toggleCat(catKey)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{cat.icon}</span>
                <span className="font-medium">{cat.label}</span>
                {toggleCount > 0 && (
                  <span className={cn("text-[10px] px-2 py-0.5 rounded",
                    enabledCount === toggleCount ? "bg-primary/20 text-primary" :
                    enabledCount === 0 ? "bg-muted text-muted-foreground" : "bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)]"
                  )}>
                    {enabledCount}/{toggleCount} on
                  </span>
                )}
                {totalEntities > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {totalEntities} items
                  </span>
                )}
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <CardContent className="px-4 pb-4 space-y-2">
                {/* Settings */}
                {cat.settings.map(setting => (
                  <SettingRow
                    key={setting.key}
                    setting={setting}
                    saving={saving}
                    editingTerm={editingTerm}
                    termName={termName}
                    termIcon={termIcon}
                    onUpdate={updateSetting}
                    onEditTerm={(tk, dn, ic) => { setEditingTerm(tk); setTermName(dn); setTermIcon(ic) }}
                    onSaveTerm={(key, val, tk) => { updateSetting(key, val, tk, termName, termIcon); setEditingTerm(null) }}
                    onCancelTerm={() => setEditingTerm(null)}
                    setTermName={setTermName}
                    setTermIcon={setTermIcon}
                  />
                ))}

                {/* Entity Sub-Sections */}
                {entityKeys.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Manage Data</p>
                    {entityKeys.map(ek => {
                      const display = ENTITY_DISPLAY[ek]
                      if (!display) return null
                      const items = entities[ek] || []
                      const isOpen = expandedEntities.has(ek)

                      return (
                        <div key={ek} className="rounded-lg border border-border/30 overflow-hidden">
                          <button
                            onClick={() => toggleEntitySection(ek)}
                            className="w-full px-3 py-2 flex items-center justify-between text-sm hover:bg-muted/20"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{display.label}</span>
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{items.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {display.editSection && (
                                <button
                                  onClick={e => { e.stopPropagation(); goToSection(display.editSection!) }}
                                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                  title="Open full editor"
                                >
                                  Edit All <ExternalLink className="w-2.5 h-2.5" />
                                </button>
                              )}
                              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </div>
                          </button>

                          {isOpen && items.length > 0 && (
                            <div className="px-3 pb-2">
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-muted-foreground/60 border-b border-border/20">
                                    {display.columns.map(col => (
                                      <th key={col} className="text-left py-1 px-1 font-normal">{col.replace(/_/g,' ')}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.slice(0, 10).map((item: Record<string, unknown>, i: number) => (
                                    <tr key={i} className="border-b border-border/10 hover:bg-muted/10">
                                      {display.columns.map(col => (
                                        <td key={col} className="py-1 px-1 truncate max-w-[120px]">
                                          {col === 'color' ? (
                                            <span className={String(item[col] || '')}>{String(item[col] || '-')}</span>
                                          ) : col.includes('pct') || col.includes('bonus') || col.includes('multiplier') ? (
                                            <span>{typeof item[col] === 'number' ? `${Math.round(Number(item[col]) * 100)}%` : String(item[col] ?? '-')}</span>
                                          ) : (
                                            String(item[col] ?? '-')
                                          )}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {items.length > 10 && (
                                <p className="text-[10px] text-muted-foreground/50 mt-1">...and {items.length - 10} more</p>
                              )}
                            </div>
                          )}

                          {isOpen && items.length === 0 && (
                            <div className="px-3 pb-2 text-[11px] text-muted-foreground/50 italic">
                              No entries yet.
                              {display.editSection && (
                                <button
                                  onClick={() => goToSection(display.editSection!)}
                                  className="text-primary hover:underline ml-1"
                                >
                                  Create one →
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// Individual setting row component
function SettingRow({ setting, saving, editingTerm, termName, termIcon, onUpdate, onEditTerm, onSaveTerm, onCancelTerm, setTermName, setTermIcon }: {
  setting: BattleSetting; saving: string | null; editingTerm: string | null
  termName: string; termIcon: string
  onUpdate: (key: string, value: string) => void
  onEditTerm: (tk: string, dn: string, ic: string) => void
  onSaveTerm: (key: string, val: string, tk: string) => void
  onCancelTerm: () => void
  setTermName: (v: string) => void; setTermIcon: (v: string) => void
}) {
  const isToggle = setting.type === 'toggle'
  const isOn = setting.value === 'true' || setting.value === '1'
  const isSaving = saving === setting.key
  const hasTerm = !!setting.terminology
  const isEditingThisTerm = editingTerm === setting.termKey

  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-border/20 last:border-0">
      <div className="w-20 shrink-0 pt-0.5">
        {isToggle ? (
          <button
            onClick={() => onUpdate(setting.key, isOn ? 'false' : 'true')}
            className={cn("w-11 h-5 rounded-full transition-colors relative", isOn ? "bg-primary" : "bg-muted")}
            disabled={!!isSaving}
          >
            <div className={cn("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform", isOn ? "translate-x-6" : "translate-x-0.5")} />
          </button>
        ) : setting.type === 'select' ? (
          <select value={setting.value || ''} onChange={e => onUpdate(setting.key, e.target.value)}
            className="w-full h-6 text-[11px] bg-input border border-border rounded px-1">
            {(setting.options || []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <Input type="number" value={setting.value || ''} onChange={e => onUpdate(setting.key, e.target.value)}
            className="h-6 text-[11px] w-full" step={setting.type === 'percent' ? '0.01' : '1'} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {hasTerm && <span className="text-xs">{setting.terminology?.icon}</span>}
          <span className="text-xs font-medium">{hasTerm ? setting.terminology?.display_name : setting.label}</span>
          {!isToggle && setting.type === 'percent' && (
            <span className="text-[9px] text-muted-foreground">({Math.round(parseFloat(setting.value || '0') * 100)}%)</span>
          )}
          {hasTerm && !isEditingThisTerm && (
            <button onClick={() => onEditTerm(setting.termKey!, setting.terminology?.display_name || '', setting.terminology?.icon || '')}
              className="text-muted-foreground hover:text-foreground p-0.5" title="Rename">
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
        {isEditingThisTerm && (
          <div className="flex items-center gap-1 mt-1">
            <Input value={termIcon} onChange={e => setTermIcon(e.target.value)} className="w-8 h-5 text-[10px] text-center p-0" maxLength={4} />
            <Input value={termName} onChange={e => setTermName(e.target.value)} className="flex-1 h-5 text-[10px]" placeholder="Name..." />
            <button onClick={() => onSaveTerm(setting.key, setting.value || '', setting.termKey!)} className="text-primary p-0.5"><Check className="w-3 h-3" /></button>
            <button onClick={onCancelTerm} className="text-muted-foreground p-0.5"><X className="w-3 h-3" /></button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground/70 leading-tight">{setting.desc}</p>
      </div>
      {isSaving && <span className="text-[9px] text-primary animate-pulse">...</span>}
    </div>
  )
}
