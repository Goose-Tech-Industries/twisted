"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Trash2, ChevronDown, ChevronRight, Sparkles } from "lucide-react"

// ── Effect Block Definitions ─────────────────────────────────────
interface FieldDef { key: string; label: string; type: string; default?: unknown; options?: string[]; min?: number; max?: number }

const EFFECT_BLOCKS: Array<{ type: string; label: string; icon: string; category: string; fields: FieldDef[] }> = [
  // Damage
  { type: 'damage',          label: 'Deal Damage',           icon: '💥', category: 'Offensive', fields: [
    { key: 'formula', label: 'Damage Formula', type: 'text', default: 'ATK*2-DEF' },
    { key: 'element', label: 'Element', type: 'select', options: ['none','fire','ice','water','wind','earth','lightning','light','dark'] },
    { key: 'variance', label: 'Variance %', type: 'number', default: 10, min: 0, max: 50 },
  ]},
  { type: 'damage_hp_pct',   label: 'Damage (% of Max HP)',  icon: '💔', category: 'Offensive', fields: [
    { key: 'percent', label: 'HP %', type: 'number', default: 10, min: 1, max: 100 },
  ]},
  { type: 'damage_mp',       label: 'Drain MP',              icon: '💧', category: 'Offensive', fields: [
    { key: 'amount', label: 'MP Amount', type: 'number', default: 20 },
  ]},
  { type: 'dot',             label: 'Damage Over Time',      icon: '🩸', category: 'Offensive', fields: [
    { key: 'damage_per_turn', label: 'Damage/Turn', type: 'number', default: 5 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
    { key: 'element', label: 'Element', type: 'select', options: ['none','fire','ice','poison','dark'] },
  ]},

  // Healing
  { type: 'heal_hp',         label: 'Restore HP',            icon: '💚', category: 'Healing', fields: [
    { key: 'formula', label: 'Heal Formula', type: 'text', default: 'MO*1.5+MD' },
  ]},
  { type: 'heal_hp_pct',     label: 'Restore HP (%)',        icon: '💖', category: 'Healing', fields: [
    { key: 'percent', label: 'HP %', type: 'number', default: 25, min: 1, max: 100 },
  ]},
  { type: 'heal_mp',         label: 'Restore MP',            icon: '💙', category: 'Healing', fields: [
    { key: 'amount', label: 'MP Amount', type: 'number', default: 30 },
  ]},
  { type: 'heal_status',     label: 'Cure Status',           icon: '✨', category: 'Healing', fields: [
    { key: 'status', label: 'Status to remove', type: 'text', default: 'poison' },
  ]},
  { type: 'revive',          label: 'Revive Fallen Ally',    icon: '🔶', category: 'Healing', fields: [
    { key: 'hp_pct', label: 'Revive HP %', type: 'number', default: 25, min: 1, max: 100 },
  ]},

  // Buffs
  { type: 'buff_stat',       label: 'Buff Stat',             icon: '⬆️', category: 'Buffs', fields: [
    { key: 'stat', label: 'Stat', type: 'select', options: ['atk','def','mo','md','speed','luck','accuracy','evasion'] },
    { key: 'value', label: 'Bonus (flat)', type: 'number', default: 5 },
    { key: 'percent', label: 'Bonus (%)', type: 'number', default: 0 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
  ]},
  { type: 'debuff_stat',     label: 'Debuff Stat',           icon: '⬇️', category: 'Debuffs', fields: [
    { key: 'stat', label: 'Stat', type: 'select', options: ['atk','def','mo','md','speed','luck','accuracy','evasion'] },
    { key: 'value', label: 'Reduction (flat)', type: 'number', default: 5 },
    { key: 'percent', label: 'Reduction (%)', type: 'number', default: 0 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
  ]},
  { type: 'barrier',         label: 'Grant Shield/Barrier',  icon: '🛡️', category: 'Buffs', fields: [
    { key: 'amount', label: 'Shield HP', type: 'number', default: 50 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
    { key: 'type', label: 'Absorbs', type: 'select', options: ['all','physical','magic'] },
  ]},
  { type: 'regen',           label: 'Regeneration',          icon: '🌿', category: 'Buffs', fields: [
    { key: 'hp_per_turn', label: 'HP/Turn', type: 'number', default: 10 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 5 },
  ]},

  // Status Effects
  { type: 'apply_status',    label: 'Apply Status Effect',   icon: '⚡', category: 'Status', fields: [
    { key: 'status', label: 'Status name', type: 'text', default: 'poison' },
    { key: 'chance', label: 'Apply chance %', type: 'number', default: 100, min: 1, max: 100 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
  ]},
  { type: 'stun',            label: 'Stun (Skip Turns)',     icon: '💫', category: 'Status', fields: [
    { key: 'chance', label: 'Stun chance %', type: 'number', default: 30, min: 1, max: 100 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 1 },
  ]},
  { type: 'silence',         label: 'Silence (Block Magic)', icon: '🔇', category: 'Status', fields: [
    { key: 'chance', label: 'Silence chance %', type: 'number', default: 50 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 2 },
  ]},
  { type: 'taunt',           label: 'Taunt (Force Target)',  icon: '😤', category: 'Status', fields: [
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 2 },
  ]},

  // Special
  { type: 'steal_hp',        label: 'Lifesteal (Drain HP)',  icon: '🧛', category: 'Special', fields: [
    { key: 'formula', label: 'Damage Formula', type: 'text', default: 'ATK*1.5-DEF' },
    { key: 'drain_pct', label: 'Heal % of damage', type: 'number', default: 50, min: 1, max: 100 },
  ]},
  { type: 'knockback',       label: 'Knockback (Push)',      icon: '💨', category: 'Special', fields: [
    { key: 'tiles', label: 'Push distance (tiles)', type: 'number', default: 2, min: 1, max: 5 },
  ]},
  { type: 'summon',          label: 'Summon Creature',       icon: '🐉', category: 'Special', fields: [
    { key: 'npc_id', label: 'NPC ID to summon', type: 'number' },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 3 },
  ]},
  { type: 'transform',       label: 'Transform Self',       icon: '🔄', category: 'Special', fields: [
    { key: 'form_name', label: 'Form name', type: 'text' },
    { key: 'stat_mult', label: 'Stat multiplier', type: 'number', default: 1.5 },
    { key: 'duration', label: 'Duration (turns)', type: 'number', default: 5 },
  ]},
  { type: 'dispel',          label: 'Dispel Enemy Buffs',    icon: '🚫', category: 'Special', fields: [
    { key: 'count', label: 'Buffs to remove', type: 'number', default: 1, min: 1, max: 10 },
  ]},
  { type: 'mp_cost',         label: 'MP Cost',               icon: '💎', category: 'Cost', fields: [
    { key: 'amount', label: 'MP cost', type: 'number', default: 10 },
  ]},
  { type: 'hp_cost',         label: 'HP Cost (Blood Magic)', icon: '🩸', category: 'Cost', fields: [
    { key: 'amount', label: 'HP cost', type: 'number', default: 15 },
  ]},
  { type: 'cooldown',        label: 'Cooldown (Turns)',      icon: '⏳', category: 'Cost', fields: [
    { key: 'turns', label: 'Cooldown turns', type: 'number', default: 3, min: 1, max: 20 },
  ]},
]

const CATEGORIES = ['Offensive', 'Healing', 'Buffs', 'Debuffs', 'Status', 'Special', 'Cost']

interface EffectBlock {
  id: string
  type: string
  params: Record<string, unknown>
}

interface EffectBuilderProps {
  effects: EffectBlock[]
  onChange: (effects: EffectBlock[]) => void
  label?: string
}

function makeId() { return Math.random().toString(36).slice(2, 8) }

function BlockRow({ block, onUpdate, onRemove }: {
  block: EffectBlock
  onUpdate: (params: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const def = EFFECT_BLOCKS.find(b => b.type === block.type)
  const [expanded, setExpanded] = useState(true)
  if (!def) return null

  return (
    <div className="border border-border/40 rounded-lg bg-card/50 mb-1.5">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-sm">{def.icon}</span>
        <span className="text-xs font-medium flex-1">{def.label}</span>
        <span className="text-[9px] text-muted-foreground/50">{def.category}</span>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-2">
          {def.fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-muted-foreground">{f.label}</label>
              {f.type === 'select' ? (
                <select value={String(block.params[f.key] ?? '')}
                  onChange={e => onUpdate({ ...block.params, [f.key]: e.target.value })}
                  className="w-full h-6 text-xs bg-input border border-border rounded px-1 mt-0.5">
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <Input type={f.type === 'number' ? 'number' : 'text'}
                  value={String(block.params[f.key] ?? f.default ?? '')}
                  min={f.min} max={f.max}
                  onChange={e => onUpdate({ ...block.params, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value })}
                  className="h-6 text-xs mt-0.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EffectBuilder({ effects, onChange, label }: EffectBuilderProps) {
  const [showPicker, setShowPicker] = useState(false)
  const [pickerCategory, setPickerCategory] = useState('Offensive')
  const [showJson, setShowJson] = useState(false)

  const addEffect = (type: string) => {
    const def = EFFECT_BLOCKS.find(b => b.type === type)
    const params: Record<string, unknown> = {}
    def?.fields.forEach(f => { if (f.default !== undefined) params[f.key] = f.default })
    onChange([...effects, { id: makeId(), type, params }])
    setShowPicker(false)
  }

  const toJson = () => JSON.stringify(effects.map(e => ({ type: e.type, ...e.params })), null, 2)

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label || 'Effects'}</span>
        <button onClick={() => setShowJson(!showJson)}
          className={cn("text-[10px] px-2 py-0.5 rounded border",
            showJson ? 'bg-purple-900/30 border-purple-600 text-purple-300' : 'border-border/30 text-muted-foreground')}>
          {showJson ? '</> JSON' : '</> View JSON'}
        </button>
      </div>

      {showJson ? (
        <pre className="text-[10px] font-mono bg-black/40 rounded p-3 max-h-40 overflow-auto text-muted-foreground mb-2">{toJson()}</pre>
      ) : (
        <>
          {effects.map((e, i) => (
            <BlockRow key={e.id} block={e}
              onUpdate={params => { const arr = [...effects]; arr[i] = { ...arr[i], params }; onChange(arr) }}
              onRemove={() => { const arr = [...effects]; arr.splice(i, 1); onChange(arr) }} />
          ))}
          {effects.length === 0 && (
            <div className="text-[10px] text-muted-foreground/50 italic p-3 text-center border border-dashed border-border/30 rounded mb-2">
              No effects — add blocks below
            </div>
          )}
        </>
      )}

      {/* Add Effect Picker */}
      <div className="relative">
        <button onClick={() => setShowPicker(!showPicker)}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 px-2 py-1 rounded border border-dashed border-primary/30 hover:border-primary/50 w-full justify-center">
          <Plus className="w-3 h-3" /> Add effect
        </button>
        {showPicker && (
          <div className="absolute z-50 top-8 left-0 right-0 bg-card border border-border rounded-lg shadow-xl p-2 max-h-64 overflow-y-auto">
            <div className="flex gap-1 mb-2 flex-wrap">
              {CATEGORIES.map(c => (
                <button key={c} onClick={() => setPickerCategory(c)}
                  className={cn("text-[10px] px-2 py-0.5 rounded border",
                    pickerCategory === c ? 'bg-primary/20 border-primary/40 text-primary' : 'border-border text-muted-foreground')}>
                  {c}
                </button>
              ))}
            </div>
            {EFFECT_BLOCKS.filter(b => b.category === pickerCategory).map(b => (
              <button key={b.type} onClick={() => addEffect(b.type)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/30 text-left">
                <span>{b.icon}</span> {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Convert JSON effects array to EffectBlock format
export function jsonToEffectBlocks(json: unknown): EffectBlock[] {
  if (!json) return []
  const arr = typeof json === 'string' ? JSON.parse(json) : json
  if (!Array.isArray(arr)) return []
  return arr.map((e: Record<string, unknown>) => {
    const { type, ...params } = e
    return { id: makeId(), type: String(type || 'damage'), params }
  })
}

// Convert EffectBlock array back to JSON for storage
export function effectBlocksToJson(blocks: EffectBlock[]): unknown[] {
  return blocks.map(b => ({ type: b.type, ...b.params }))
}
