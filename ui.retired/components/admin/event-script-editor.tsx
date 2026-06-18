"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from "lucide-react"

// ── Block Types ──────────────────────────────────────────────────
interface FieldDef { key: string; label: string; type: string; default?: unknown; options?: string[] }

const CONDITION_TYPES: Array<{ type: string; label: string; icon: string; fields: FieldDef[] }> = [
  { type: 'has_item',      label: 'Player has item',        icon: '📦', fields: [{ key: 'item_id', label: 'Item ID', type: 'number' }, { key: 'qty', label: 'Quantity', type: 'number', default: 1 }] },
  { type: 'has_flag',      label: 'World flag is set',      icon: '🚩', fields: [{ key: 'flag', label: 'Flag name', type: 'text' }, { key: 'value', label: 'Value', type: 'text', default: 'true' }] },
  { type: 'level_min',     label: 'Player level >=',        icon: '⬆️', fields: [{ key: 'level', label: 'Min level', type: 'number', default: 1 }] },
  { type: 'level_max',     label: 'Player level <=',        icon: '⬇️', fields: [{ key: 'level', label: 'Max level', type: 'number', default: 99 }] },
  { type: 'quest_complete', label: 'Quest completed',       icon: '📜', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'quest_active',  label: 'Quest is active',        icon: '📋', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'time_of_day',   label: 'Time of day is',         icon: '🕐', fields: [{ key: 'phase', label: 'Phase', type: 'select', options: ['dawn','day','dusk','night'] }] },
  { type: 'random_chance', label: 'Random chance (%)',       icon: '🎲', fields: [{ key: 'chance', label: 'Chance %', type: 'number', default: 50 }] },
  { type: 'class_is',      label: 'Player class is',        icon: '⚔️', fields: [{ key: 'class_name', label: 'Class name', type: 'text' }] },
  { type: 'not_flag',      label: 'World flag is NOT set',  icon: '🚫', fields: [{ key: 'flag', label: 'Flag name', type: 'text' }] },
]

const ACTION_TYPES: Array<{ type: string; label: string; icon: string; fields: FieldDef[] }> = [
  { type: 'dialogue',      label: 'Show dialogue',          icon: '💬', fields: [{ key: 'text', label: 'Message', type: 'textarea' }, { key: 'speaker', label: 'Speaker name', type: 'text' }] },
  { type: 'give_item',     label: 'Give item',              icon: '🎁', fields: [{ key: 'item_id', label: 'Item ID', type: 'number' }, { key: 'qty', label: 'Quantity', type: 'number', default: 1 }] },
  { type: 'remove_item',   label: 'Remove item',            icon: '➖', fields: [{ key: 'item_id', label: 'Item ID', type: 'number' }, { key: 'qty', label: 'Quantity', type: 'number', default: 1 }] },
  { type: 'set_flag',      label: 'Set world flag',         icon: '🚩', fields: [{ key: 'flag', label: 'Flag name', type: 'text' }, { key: 'value', label: 'Value', type: 'text', default: 'true' }] },
  { type: 'teleport',      label: 'Teleport player',        icon: '🚪', fields: [{ key: 'map_id', label: 'Map ID', type: 'number' }, { key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }] },
  { type: 'heal',          label: 'Heal player',            icon: '💚', fields: [{ key: 'hp', label: 'HP amount', type: 'number', default: 999 }, { key: 'mp', label: 'MP amount', type: 'number', default: 999 }] },
  { type: 'damage',        label: 'Deal damage',            icon: '💔', fields: [{ key: 'hp', label: 'HP damage', type: 'number', default: 10 }] },
  { type: 'give_xp',       label: 'Give XP',                icon: '✨', fields: [{ key: 'amount', label: 'XP amount', type: 'number', default: 100 }] },
  { type: 'give_gold',     label: 'Give gold',              icon: '💰', fields: [{ key: 'amount', label: 'Gold amount', type: 'number', default: 50 }] },
  { type: 'start_battle',  label: 'Start battle',           icon: '⚔️', fields: [{ key: 'enemy_id', label: 'Enemy NPC ID', type: 'number' }] },
  { type: 'play_sound',    label: 'Play sound',             icon: '🔊', fields: [{ key: 'url', label: 'Sound URL', type: 'text' }] },
  { type: 'show_particle', label: 'Show particle effect',   icon: '✨', fields: [{ key: 'preset', label: 'Preset', type: 'select', options: ['fire','ice','lightning','heal','dark','holy','smoke','explosion'] }] },
  { type: 'notification',  label: 'Show notification',      icon: '📢', fields: [{ key: 'text', label: 'Message', type: 'text' }, { key: 'type', label: 'Type', type: 'select', options: ['info','success','warning','error'] }] },
  { type: 'open_shop',     label: 'Open shop',              icon: '🏪', fields: [{ key: 'shop_id', label: 'Shop ID', type: 'number' }] },
  { type: 'start_quest',   label: 'Start quest',            icon: '📜', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'offer_quest',   label: 'Offer quest (accept/decline)', icon: '📋', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'quest_advance', label: 'Advance quest step',     icon: '➡️', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'quest_complete', label: 'Complete quest',         icon: '✅', fields: [{ key: 'quest_id', label: 'Quest ID', type: 'text' }] },
  { type: 'wait',          label: 'Wait (seconds)',          icon: '⏳', fields: [{ key: 'seconds', label: 'Seconds', type: 'number', default: 1 }] },
  // ── Advanced ──
  { type: 'apply_status',  label: 'Apply status effect',    icon: '🔮', fields: [{ key: 'status_id', label: 'Status ID', type: 'number' }, { key: 'duration', label: 'Duration (sec)', type: 'number', default: 60 }] },
  { type: 'remove_status', label: 'Remove status effect',   icon: '🚫', fields: [{ key: 'status_id', label: 'Status ID', type: 'number' }] },
  { type: 'spawn_npc',     label: 'Spawn NPC at position',  icon: '👤', fields: [{ key: 'npc_id', label: 'NPC ID', type: 'number' }, { key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }, { key: 'name', label: 'Name', type: 'text' }] },
  { type: 'kill_npc',      label: 'Remove/kill NPC',        icon: '💀', fields: [{ key: 'npc_id', label: 'NPC ID', type: 'number' }] },
  { type: 'set_npc_mood',  label: 'Set NPC mood',           icon: '😤', fields: [{ key: 'npc_id', label: 'NPC ID', type: 'number' }, { key: 'mood', label: 'Mood', type: 'select', options: ['friendly','neutral','hostile','afraid','sad','happy'] }] },
  { type: 'change_tile',   label: 'Change map tile',        icon: '🔲', fields: [{ key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }, { key: 'tile_id', label: 'Tile ID', type: 'number' }] },
  { type: 'inc_flag',      label: 'Increment counter flag', icon: '🔢', fields: [{ key: 'flag', label: 'Flag name', type: 'text' }, { key: 'amount', label: 'Amount', type: 'number', default: 1 }] },
  { type: 'set_world_flag', label: 'Set global world flag', icon: '🌍', fields: [{ key: 'flag', label: 'Flag name', type: 'text' }, { key: 'value', label: 'Value', type: 'text', default: 'true' }] },
  // ── Cinematic ──
  { type: 'screen_shake',  label: 'Screen shake',           icon: '📳', fields: [{ key: 'duration', label: 'Duration (ms)', type: 'number', default: 500 }] },
  { type: 'screen_flash',  label: 'Screen flash',           icon: '💥', fields: [{ key: 'color', label: 'Color', type: 'text', default: '#ffffff' }, { key: 'duration', label: 'Duration (ms)', type: 'number', default: 300 }] },
  { type: 'camera_pan',    label: 'Pan camera to tile',     icon: '🎥', fields: [{ key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }, { key: 'duration', label: 'Duration (ms)', type: 'number', default: 1000 }] },
  { type: 'lock_movement', label: 'Lock/unlock movement',   icon: '🔒', fields: [{ key: 'locked', label: 'Locked?', type: 'select', options: ['true','false'] }] },
  { type: 'npc_talk',      label: 'Open NPC talk prompt',   icon: '🗣️', fields: [{ key: 'npc_id', label: 'NPC ID', type: 'number' }, { key: 'npc_name', label: 'NPC Name', type: 'text' }] },
  { type: 'quest_board',   label: 'Open quest board',       icon: '📌', fields: [] },
  { type: 'descent',       label: 'Descend floor (dungeon)', icon: '⬇️', fields: [{ key: 'map_id', label: 'Target Map ID', type: 'number' }, { key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }] },
  { type: 'ascent',        label: 'Ascend floor (dungeon)',  icon: '⬆️', fields: [{ key: 'map_id', label: 'Target Map ID', type: 'number' }, { key: 'x', label: 'X', type: 'number' }, { key: 'y', label: 'Y', type: 'number' }] },
]

interface Block {
  id: string
  type: string
  params: Record<string, unknown>
}

const TRIGGER_TYPES = [
  { value: 'STEP_ON',      label: 'Step On — fires when player walks on this tile' },
  { value: 'INTERACT',     label: 'Interact — fires when player presses E' },
  { value: 'AUTO',         label: 'Auto — fires when map loads (cutscenes, one-time events)' },
  { value: 'PROXIMITY',    label: 'Proximity — fires when player is within X tiles' },
  { value: 'REGION_ENTER', label: 'Region Enter — fires when player enters a rectangular zone' },
  { value: 'ITEM_USE',     label: 'Item Use — fires when player uses a specific item here' },
]

interface EventScriptEditorProps {
  conditions: Block[]
  actions: Block[]
  trigger?: string
  triggerMeta?: Record<string, unknown>
  onChange: (conditions: Block[], actions: Block[], trigger?: string, triggerMeta?: Record<string, unknown>) => void
  onClose: () => void
}

function makeId() { return Math.random().toString(36).slice(2, 8) }

function BlockRow({ block, typeDefs, onUpdate, onRemove }: {
  block: Block
  typeDefs: typeof CONDITION_TYPES
  onUpdate: (params: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const def = typeDefs.find(t => t.type === block.type)
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-border/40 rounded-lg bg-card/50 mb-1.5">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />
        <span className="text-sm">{def?.icon || '?'}</span>
        <span className="text-xs font-medium flex-1">{def?.label || block.type}</span>
        <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <button onClick={onRemove} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      {expanded && def?.fields && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-2">
          {def.fields.map(f => (
            <div key={f.key}>
              <label className="text-[10px] text-muted-foreground">{f.label}</label>
              {f.type === 'textarea' ? (
                <textarea value={String(block.params[f.key] ?? f.default ?? '')}
                  onChange={e => onUpdate({ ...block.params, [f.key]: e.target.value })}
                  rows={2} className="w-full text-xs bg-input border border-border rounded px-2 py-1 resize-none mt-0.5" />
              ) : f.type === 'select' ? (
                <select value={String(block.params[f.key] ?? '')}
                  onChange={e => onUpdate({ ...block.params, [f.key]: e.target.value })}
                  className="w-full h-6 text-xs bg-input border border-border rounded px-1 mt-0.5">
                  <option value="">—</option>
                  {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <Input type={f.type === 'number' ? 'number' : 'text'}
                  value={String(block.params[f.key] ?? f.default ?? '')}
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

function BlockAdder({ typeDefs, onAdd }: { typeDefs: typeof CONDITION_TYPES; onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded border border-dashed border-primary/30 hover:border-primary/50 w-full justify-center">
        <Plus className="w-3 h-3" /> Add block
      </button>
      {open && (
        <div className="absolute z-50 top-8 left-0 right-0 bg-card border border-border rounded-lg shadow-xl p-1 max-h-52 overflow-y-auto">
          {typeDefs.map(t => (
            <button key={t.type} onClick={() => { onAdd(t.type); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/30 text-left">
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EventScriptEditor({ conditions, actions, trigger: initTrigger, triggerMeta: initMeta, onChange, onClose }: EventScriptEditorProps) {
  const [showJson, setShowJson] = useState(false)
  const [trigger, setTrigger] = useState(initTrigger || 'STEP_ON')
  const [triggerMeta, setTriggerMeta] = useState<Record<string, unknown>>(initMeta || {})

  const emitChange = (c: Block[], a: Block[], t?: string, m?: Record<string, unknown>) => {
    onChange(c, a, t || trigger, m || triggerMeta)
  }

  const addCondition = (type: string) => {
    const def = CONDITION_TYPES.find(t => t.type === type)
    const params: Record<string, unknown> = {}
    def?.fields.forEach(f => { if (f.default !== undefined) params[f.key] = f.default })
    emitChange([...conditions, { id: makeId(), type, params }], actions)
  }

  const addAction = (type: string) => {
    const def = ACTION_TYPES.find(t => t.type === type)
    const params: Record<string, unknown> = {}
    def?.fields.forEach(f => { if (f.default !== undefined) params[f.key] = f.default })
    emitChange(conditions, [...actions, { id: makeId(), type, params }])
  }

  const updateCondition = (idx: number, params: Record<string, unknown>) => {
    const c = [...conditions]; c[idx] = { ...c[idx], params }; emitChange(c, actions)
  }

  const updateAction = (idx: number, params: Record<string, unknown>) => {
    const a = [...actions]; a[idx] = { ...a[idx], params }; emitChange(conditions, a)
  }

  const removeCondition = (idx: number) => { const c = [...conditions]; c.splice(idx, 1); onChange(c, actions) }
  const removeAction = (idx: number) => { const a = [...actions]; a.splice(idx, 1); onChange(conditions, a) }

  // Convert to/from JSON for raw editing
  const toJson = () => JSON.stringify({ conditions: conditions.map(c => ({ type: c.type, ...c.params })), actions: actions.map(a => ({ type: a.type, ...a.params })) }, null, 2)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-primary">Event Script Editor</h4>
        <div className="flex gap-2">
          <button onClick={() => setShowJson(!showJson)}
            className={cn("text-[10px] px-2 py-0.5 rounded border",
              showJson ? 'bg-purple-900/30 border-purple-600 text-purple-300' : 'border-border/30 text-muted-foreground')}>
            {showJson ? '</> JSON' : '</> View JSON'}
          </button>
          <Button size="sm" variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>

      {/* Trigger type selector */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground">Fires on:</span>
        <select value={trigger} onChange={e => { setTrigger(e.target.value); emitChange(conditions, actions, e.target.value, triggerMeta); }}
          className="text-xs bg-[#222] border border-border rounded px-2 py-1 text-foreground">
          {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {trigger === 'PROXIMITY' && (
          <Input type="number" placeholder="Radius (tiles)" value={String(triggerMeta.radius || 3)} className="w-24 h-7 text-xs"
            onChange={e => { const m = { ...triggerMeta, radius: parseInt(e.target.value) || 3 }; setTriggerMeta(m); emitChange(conditions, actions, trigger, m); }} />
        )}
        {trigger === 'REGION_ENTER' && (<>
          <Input type="number" placeholder="Width" value={String(triggerMeta.width || 3)} className="w-20 h-7 text-xs"
            onChange={e => { const m = { ...triggerMeta, width: parseInt(e.target.value) || 3 }; setTriggerMeta(m); emitChange(conditions, actions, trigger, m); }} />
          <span className="text-xs text-muted-foreground">x</span>
          <Input type="number" placeholder="Height" value={String(triggerMeta.height || 3)} className="w-20 h-7 text-xs"
            onChange={e => { const m = { ...triggerMeta, height: parseInt(e.target.value) || 3 }; setTriggerMeta(m); emitChange(conditions, actions, trigger, m); }} />
        </>)}
        {trigger === 'ITEM_USE' && (
          <Input type="number" placeholder="Required Item ID" value={String(triggerMeta.required_item_id || '')} className="w-32 h-7 text-xs"
            onChange={e => { const m = { ...triggerMeta, required_item_id: parseInt(e.target.value) || 0 }; setTriggerMeta(m); emitChange(conditions, actions, trigger, m); }} />
        )}
      </div>

      {showJson ? (
        <pre className="text-[10px] font-mono bg-black/40 rounded p-3 max-h-60 overflow-auto text-muted-foreground">{toJson()}</pre>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {/* Conditions column */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">IF (Conditions)</span>
              <span className="text-[10px] text-muted-foreground">All must be true</span>
            </div>
            <div className="space-y-1 mb-2">
              {conditions.map((c, i) => (
                <BlockRow key={c.id} block={c} typeDefs={CONDITION_TYPES}
                  onUpdate={params => updateCondition(i, params)}
                  onRemove={() => removeCondition(i)} />
              ))}
              {conditions.length === 0 && (
                <div className="text-[10px] text-muted-foreground/50 italic p-3 text-center border border-dashed border-border/30 rounded">
                  No conditions — event always triggers
                </div>
              )}
            </div>
            <BlockAdder typeDefs={CONDITION_TYPES} onAdd={addCondition} />
          </div>

          {/* Actions column */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-green-400">THEN (Actions)</span>
              <span className="text-[10px] text-muted-foreground">Run in order</span>
            </div>
            <div className="space-y-1 mb-2">
              {actions.map((a, i) => (
                <BlockRow key={a.id} block={a} typeDefs={ACTION_TYPES}
                  onUpdate={params => updateAction(i, params)}
                  onRemove={() => removeAction(i)} />
              ))}
              {actions.length === 0 && (
                <div className="text-[10px] text-muted-foreground/50 italic p-3 text-center border border-dashed border-border/30 rounded">
                  No actions — nothing happens
                </div>
              )}
            </div>
            <BlockAdder typeDefs={ACTION_TYPES} onAdd={addAction} />
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/40">
        When a player steps on this tile: check all conditions (IF). If all pass, execute actions (THEN) in order.
        No conditions = always triggers. Use &quot;View JSON&quot; to see/copy the raw data.
      </p>
    </div>
  )
}

// Helper to convert existing JSON conditions/actions to Block format
export function jsonToBlocks(conditions: unknown[], actions: unknown[]): { conditionBlocks: Block[]; actionBlocks: Block[] } {
  const conditionBlocks = (conditions || []).map((c: unknown) => {
    const obj = c as Record<string, unknown>
    const { type, ...params } = obj
    return { id: makeId(), type: String(type || 'has_flag'), params }
  })
  const actionBlocks = (actions || []).map((a: unknown) => {
    const obj = a as Record<string, unknown>
    const { type, ...params } = obj
    return { id: makeId(), type: String(type || 'dialogue'), params }
  })
  return { conditionBlocks, actionBlocks }
}

// Convert blocks back to JSON arrays for storage
export function blocksToJson(conditions: Block[], actions: Block[]): { conditions: unknown[]; actions: unknown[] } {
  return {
    conditions: conditions.map(c => ({ type: c.type, ...c.params })),
    actions: actions.map(a => ({ type: a.type, ...a.params })),
  }
}
