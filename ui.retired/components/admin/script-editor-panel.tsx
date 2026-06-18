"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ChevronUp, ChevronDown, Trash2, Plus, Code, Save, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Types ─────────────────────────────────────────────────────────
interface FieldDef {
  key: string; label: string; type: string
  options?: string[]; default?: unknown; placeholder?: string; hint?: string
}
interface ActionDef  { label: string; fields: FieldDef[]; special?: string; hint?: string }
interface CondDef    { label: string; fields: FieldDef[] }
interface ScriptAction  { type: string; [key: string]: unknown }
interface ScriptCond    { type: string; [key: string]: unknown }
export interface ScriptEvent {
  trigger: string
  conditions?: ScriptCond[]
  actions: ScriptAction[]
  _graphLayout?: unknown
  x?: number; y?: number
}

interface Cache {
  items: Array<{id:number;name:string;icon:string}>
  quests: Array<{id:number;quest_id?:string;title?:string;name?:string}>
  shops: Array<{id:number;name:string}>
  npcs: Array<{id:number;name:string;icon?:string;is_enemy?:boolean}>
  classes: Array<{id:number;name:string}>
  factions: Array<{id:number;name:string}>
  maps: Array<{id:number;name:string}>
}

// ── Action & Condition definitions ────────────────────────────────
const ACTION_TYPES: Record<string, ActionDef> = {
  DIALOGUE:       { label:'💬 Dialogue',      fields:[{key:'speaker',label:'Speaker',type:'text'},{key:'text',label:'Text',type:'textarea'}] },
  CHOICE:         { label:'🔀 Choice',         fields:[{key:'prompt',label:'Prompt',type:'text'}], special:'choice' },
  SET_FLAG:       { label:'🚩 Set Flag',       fields:[{key:'key',label:'Flag Name',type:'text'},{key:'value',label:'Value',type:'text'}] },
  INC_FLAG:       { label:'➕ Inc Flag',       fields:[{key:'key',label:'Flag Name',type:'text'},{key:'amount',label:'Amount',type:'number',default:1}] },
  TELEPORT:       { label:'🚪 Teleport',       fields:[{key:'mapId',label:'Map',type:'db_map'},{key:'x',label:'X',type:'number',default:10},{key:'y',label:'Y',type:'number',default:10}] },
  GIVE_ITEM:      { label:'📦 Give Item',      fields:[{key:'itemId',label:'Item',type:'db_item'},{key:'quantity',label:'Qty',type:'number',default:1}] },
  TAKE_ITEM:      { label:'🗑️ Take Item',     fields:[{key:'itemId',label:'Item',type:'db_item'},{key:'quantity',label:'Qty',type:'number',default:1}] },
  GIVE_GOLD:      { label:'💰 Give Gold',      fields:[{key:'amount',label:'Amount',type:'number'}] },
  GIVE_XP:        { label:'⭐ Give XP',        fields:[{key:'amount',label:'Amount',type:'number'}] },
  HEAL:           { label:'💚 Heal',           fields:[{key:'hp',label:'HP (formula/MAX)',type:'text'},{key:'mp',label:'MP (formula/MAX)',type:'text'}] },
  DAMAGE:         { label:'💥 Damage',         fields:[{key:'hp',label:'HP Damage (formula)',type:'text'}] },
  QUEST_START:    { label:'📜 Start Quest',    fields:[{key:'questId',label:'Quest',type:'db_quest'}] },
  QUEST_ADVANCE:  { label:'📜 Advance Quest',  fields:[{key:'questId',label:'Quest',type:'db_quest'}] },
  QUEST_COMPLETE: { label:'🏆 Complete Quest', fields:[{key:'questId',label:'Quest',type:'db_quest'}] },
  NPC_TALK:       { label:'🗣️ NPC Talk',      fields:[{key:'npcName',label:'NPC',type:'db_npc_name'}] },
  SHOP:           { label:'🪙 Open Shop',      fields:[{key:'shopId',label:'Shop',type:'db_shop'}] },
  BATTLE:         { label:'⚔️ Start Battle',  fields:[{key:'enemyId',label:'Enemy NPC',type:'db_npc_id'}] },
  SOUND:          { label:'🔊 Play Sound',     fields:[{key:'file',label:'Filename',type:'text'}] },
  SCREEN_EFFECT:  { label:'✨ Screen Effect',  fields:[{key:'effect',label:'Effect',type:'select',options:['shake','flash','fade']},{key:'duration',label:'Duration (ms)',type:'number',default:500}] },
  WAIT:           { label:'⏱️ Wait',           fields:[{key:'ms',label:'Milliseconds',type:'number',default:1000}] },
  SET_MAP_FLAG:   { label:'🌍 Set Map Flag',   fields:[{key:'key',label:'Flag Name',type:'text',placeholder:'e.g. lantern_3_5'},{key:'value',label:'Value',type:'text',placeholder:'true / false / 42'}], hint:'Shared flag for all players on this map.' },
  OBJECT_STATE:   { label:'🔦 Object State',   fields:[{key:'flagKey',label:'Object Flag Key',type:'text',placeholder:'e.g. lantern_3_5'},{key:'lit',label:'Lit',type:'select',options:['true','false']}] },
  IF:             { label:'❓ Conditional',     fields:[], special:'conditional' },
  SET_WORLD_FLAG: { label:'🌍 World Flag',     fields:[{key:'key',label:'Flag Name',type:'text',placeholder:'e.g. goblin_boss_slain'},{key:'value',label:'Value',type:'text',default:'true'}], hint:'Global flag seen by all NPCs everywhere.' },
  SET_NPC_MOOD:   { label:'😶 NPC Mood',       fields:[{key:'npcName',label:'NPC',type:'db_npc_name'},{key:'mood',label:'Mood',type:'select',options:['happy','fearful','angry','grieving','excited','(clear)'],default:'fearful'}] },
  KILL_NPC:       { label:'💀 Kill NPC',       fields:[{key:'npcName',label:'NPC',type:'db_npc_name'},{key:'cause',label:'Death Cause',type:'text',placeholder:'e.g. Slain by the shadow wraith'}] },
  FACTION_REP:    { label:'⚔️ Faction Rep',    fields:[{key:'factionId',label:'Faction',type:'db_faction'},{key:'delta',label:'Amount (+/-)',type:'number',default:10,placeholder:'e.g. 10 or -20'}], hint:'Cascades to rival factions at 50%.' },
}

const CONDITION_TYPES: Record<string, CondDef> = {
  FLAG:     { label:'Flag Check',  fields:[{key:'key',label:'Flag',type:'text'},{key:'op',label:'Op (==,!=,>,<)',type:'text',default:'=='},{key:'value',label:'Value',type:'text'}] },
  LEVEL:    { label:'Level Check', fields:[{key:'op',label:'Op',type:'text',default:'>='},{key:'value',label:'Level',type:'number'}] },
  HAS_ITEM: { label:'Has Item',    fields:[{key:'itemId',label:'Item',type:'db_item'},{key:'quantity',label:'Qty',type:'number',default:1}] },
  RANDOM:   { label:'Random %',   fields:[{key:'chance',label:'% Chance',type:'number',default:50}] },
  CLASS:    { label:'Is Class',   fields:[{key:'classId',label:'Class',type:'db_class'}] },
}

const NUMERIC_KEYS = new Set(['quantity','amount','ms','duration','x','y','hp_amount','delta','chance'])

// ── DB select helper ──────────────────────────────────────────────
function DbSelect({ fieldType, value, cache, onChange }: {
  fieldType: string; value: unknown; cache: Cache; onChange: (v: unknown) => void
}) {
  let opts: Array<{v: unknown; l: string}> = []
  switch (fieldType) {
    case 'db_item':     opts = cache.items.map(i=>({v:i.id,l:`${i.icon||'📦'} ${i.name}`})); break
    case 'db_quest':    opts = cache.quests.map(q=>({v:q.quest_id||q.id,l:`📜 ${q.title||q.name||q.quest_id}`})); break
    case 'db_shop':     opts = cache.shops.map(s=>({v:s.id,l:`🏪 ${s.name}`})); break
    case 'db_npc_id':   opts = cache.npcs.map(n=>({v:n.id,l:`${n.icon||'👤'} ${n.name}`})); break
    case 'db_npc_name': opts = cache.npcs.map(n=>({v:n.name,l:`${n.icon||'👤'} ${n.name}`})); break
    case 'db_class':    opts = cache.classes.map(c=>({v:c.id,l:`⚔️ ${c.name}`})); break
    case 'db_faction':  opts = cache.factions.map(f=>({v:f.id,l:`⚔️ ${f.name}`})); break
    case 'db_map':      opts = cache.maps.map(m=>({v:m.id,l:`🗺️ ${m.name}`})); break
  }
  if (!opts.length) return <Input value={String(value??'')} onChange={e=>onChange(e.target.value)} className="h-7 text-xs" />
  return (
    <select value={String(value??'')} onChange={e=>onChange(e.target.value)}
      className="w-full px-2 py-1 bg-input border border-border rounded text-xs">
      {opts.map(o=><option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
    </select>
  )
}

// ── Single field renderer ─────────────────────────────────────────
function FieldInput({ f, value, cache, onChange }: {
  f: FieldDef; value: unknown; cache: Cache; onChange: (v: unknown) => void
}) {
  const val = value !== undefined ? value : (f.default ?? '')
  if (f.type === 'textarea')
    return <textarea value={String(val)} onChange={e=>onChange(e.target.value)} rows={2}
      className="w-full px-2 py-1.5 bg-input border border-border rounded text-xs font-mono resize-none" />
  if (f.type === 'select')
    return (
      <select value={String(val)} onChange={e=>onChange(e.target.value)}
        className="w-full px-2 py-1 bg-input border border-border rounded text-xs">
        {(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    )
  if (f.type.startsWith('db_'))
    return <DbSelect fieldType={f.type} value={val} cache={cache} onChange={onChange} />
  return (
    <Input type={f.type==='number'?'number':'text'} value={String(val)}
      onChange={e=>{
        const raw = e.target.value
        if (f.type==='number' || NUMERIC_KEYS.has(f.key)) onChange(raw===''?'':Number(raw)||0)
        else if (raw==='true') onChange(true)
        else if (raw==='false') onChange(false)
        else onChange(raw)
      }}
      placeholder={f.placeholder||''}
      className="h-7 text-xs" />
  )
}

// ── Action row ────────────────────────────────────────────────────
function ActionRow({ action, idx, total, cache, onChange, onRemove, onMove }: {
  action: ScriptAction; idx: number; total: number; cache: Cache
  onChange: (k:string,v:unknown)=>void; onRemove:()=>void; onMove:(d:number)=>void
}) {
  const def = ACTION_TYPES[action.type] || { label: action.type, fields: [] }
  return (
    <div className="p-3 bg-secondary/30 border border-border rounded-lg mb-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-primary">#{idx+1} {def.label}</span>
        <div className="flex gap-1">
          {idx>0       && <button onClick={()=>onMove(-1)} className="text-muted-foreground hover:text-foreground p-0.5"><ChevronUp className="w-3.5 h-3.5"/></button>}
          {idx<total-1 && <button onClick={()=>onMove(1)}  className="text-muted-foreground hover:text-foreground p-0.5"><ChevronDown className="w-3.5 h-3.5"/></button>}
          <button onClick={onRemove} className="text-destructive hover:text-red-400 p-0.5"><Trash2 className="w-3.5 h-3.5"/></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {def.fields.map(f=>(
          <div key={f.key} className={cn("min-w-24", f.type==='textarea'?'w-full':f.type.startsWith('db_')||f.type==='text'?'flex-1 min-w-32':'w-24')}>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground block mb-0.5">{f.label}</label>
            <FieldInput f={f} value={action[f.key]} cache={cache} onChange={v=>onChange(f.key,v)} />
          </div>
        ))}
        {def.hint && <p className="w-full text-[11px] text-muted-foreground italic">ℹ️ {def.hint}</p>}
      </div>
    </div>
  )
}

// ── Condition row ─────────────────────────────────────────────────
function CondRow({ cond, idx, cache, onChange, onRemove }: {
  cond: ScriptCond; idx: number; cache: Cache
  onChange: (k:string,v:unknown)=>void; onRemove:()=>void
}) {
  const def = CONDITION_TYPES[cond.type] || { label: cond.type, fields: [] }
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0 flex-wrap">
      <Badge variant="outline" className="text-[10px] py-0 shrink-0">{def.label}</Badge>
      {def.fields.map(f=>(
        <div key={f.key} className="min-w-20">
          <FieldInput f={f} value={cond[f.key]} cache={cache} onChange={v=>onChange(f.key,v)} />
        </div>
      ))}
      <button onClick={onRemove} className="text-destructive ml-auto shrink-0"><Trash2 className="w-3 h-3"/></button>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────
interface ScriptEditorPanelProps {
  initialEvent?: ScriptEvent
  onSave: (event: ScriptEvent) => void
  onCancel: () => void
}

// ── Main component ────────────────────────────────────────────────
export function ScriptEditorPanel({ initialEvent, onSave, onCancel }: ScriptEditorPanelProps) {
  const [event, setEvent] = useState<ScriptEvent>(() => initialEvent || { trigger:'INTERACT', conditions:[], actions:[] })
  const [cache, setCache] = useState<Cache>({ items:[], quests:[], shops:[], npcs:[], classes:[], factions:[], maps:[] })
  const [loading, setLoading] = useState(true)
  const [showJson, setShowJson] = useState(false)
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [showCondPicker, setShowCondPicker] = useState(false)

  useEffect(() => {
    Promise.all([
      adminApi.entity.getAll('item'), adminApi.entity.getAll('quest'),
      adminApi.entity.getAll('shop'), adminApi.entity.getAll('npc'),
      adminApi.entity.getAll('class'), adminApi.entity.getAll('faction'),
      adminApi.entity.getAll('map'),
    ]).then(([ir,qr,sr,nr,cr,fr,mr]) => {
      setCache({
        items:    (ir.data||[]) as Cache['items'],
        quests:   (qr.data||[]) as Cache['quests'],
        shops:    (sr.data||[]) as Cache['shops'],
        npcs:     (nr.data||[]) as Cache['npcs'],
        classes:  (cr.data||[]) as Cache['classes'],
        factions: (fr.data||[]) as Cache['factions'],
        maps:     (mr.data||[]) as Cache['maps'],
      })
      setLoading(false)
    })
  }, [])

  const addAction = (type: string) => {
    const def = ACTION_TYPES[type]
    const action: ScriptAction = { type }
    for (const f of def.fields) {
      if (f.default !== undefined) { action[f.key] = f.default; continue }
      if (f.type === 'db_item'     && cache.items.length)    action[f.key] = cache.items[0].id
      if (f.type === 'db_quest'    && cache.quests.length)   action[f.key] = cache.quests[0].quest_id||cache.quests[0].id
      if (f.type === 'db_shop'     && cache.shops.length)    action[f.key] = cache.shops[0].id
      if (f.type === 'db_npc_id'   && cache.npcs.length)     action[f.key] = cache.npcs[0].id
      if (f.type === 'db_npc_name' && cache.npcs.length)     action[f.key] = cache.npcs[0].name
      if (f.type === 'db_class'    && cache.classes.length)  action[f.key] = cache.classes[0].id
      if (f.type === 'db_faction'  && cache.factions.length) action[f.key] = cache.factions[0].id
      if (f.type === 'db_map'      && cache.maps.length)     action[f.key] = cache.maps[0].id
    }
    setEvent(prev => ({ ...prev, actions: [...prev.actions, action] }))
  }

  const removeAction = (i: number) =>
    setEvent(prev => ({ ...prev, actions: prev.actions.filter((_,j)=>j!==i) }))

  const moveAction = (i: number, dir: number) =>
    setEvent(prev => {
      const arr = [...prev.actions], t = i+dir
      if (t<0||t>=arr.length) return prev
      ;[arr[i],arr[t]]=[arr[t],arr[i]]
      return { ...prev, actions: arr }
    })

  const updateAction = (i: number, k: string, v: unknown) =>
    setEvent(prev => ({ ...prev, actions: prev.actions.map((a,j)=>j===i?{...a,[k]:v}:a) }))

  const addCondition = (type: string) => {
    const def = CONDITION_TYPES[type]
    const cond: ScriptCond = { type }
    for (const f of def.fields) {
      if (f.default !== undefined) cond[f.key] = f.default
      if (f.type === 'db_item'  && cache.items.length)   cond[f.key] = cache.items[0].id
      if (f.type === 'db_class' && cache.classes.length) cond[f.key] = cache.classes[0].id
    }
    setEvent(prev => ({ ...prev, conditions: [...(prev.conditions||[]), cond] }))
    setShowCondPicker(false)
  }

  const updateCond = (i: number, k: string, v: unknown) =>
    setEvent(prev => ({
      ...prev,
      conditions: (prev.conditions||[]).map((c,j)=>j===i?{...c,[k]:v}:c)
    }))

  const removeCond = (i: number) =>
    setEvent(prev => ({ ...prev, conditions: (prev.conditions||[]).filter((_,j)=>j!==i) }))

  const openJson = () => { setJsonText(JSON.stringify(event, null, 2)); setJsonError(''); setShowJson(true) }
  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonText)
      setEvent(parsed); setShowJson(false); setJsonError('')
    } catch(e) { setJsonError('Invalid JSON: ' + (e as Error).message) }
  }

  const handleSave = () => {
    const ev = { ...event }
    if (!ev.conditions?.length) delete ev.conditions
    onSave(ev)
  }

  // Group action types for the picker
  const ACTION_GROUPS = [
    { label:'💬 Dialogue', types:['DIALOGUE','CHOICE','IF'] },
    { label:'🎁 Rewards',  types:['GIVE_ITEM','TAKE_ITEM','GIVE_GOLD','GIVE_XP','HEAL','DAMAGE'] },
    { label:'🗺️ World',   types:['TELEPORT','SET_FLAG','INC_FLAG','SET_MAP_FLAG','SET_WORLD_FLAG','OBJECT_STATE','SCREEN_EFFECT','WAIT','SOUND'] },
    { label:'👤 NPC',      types:['NPC_TALK','SET_NPC_MOOD','KILL_NPC','FACTION_REP'] },
    { label:'⚔️ Game',    types:['BATTLE','SHOP','QUEST_START','QUEST_ADVANCE','QUEST_COMPLETE'] },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-card border-b border-border shrink-0">
        <h3 className="font-bold text-sm text-primary">📝 Script Editor</h3>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={openJson}><Code className="w-3.5 h-3.5 mr-1"/>JSON</Button>
          <Button size="sm" variant="ghost" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1"/>Cancel</Button>
          <Button size="sm" onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1"/>Save Event</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && <div className="text-center py-8 text-muted-foreground text-sm">Loading dropdowns…</div>}

        {!loading && (<>
          {/* Trigger + Conditions */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-card border border-border rounded-lg">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block mb-2">Trigger</label>
              <select value={event.trigger} onChange={e=>setEvent(prev=>({...prev,trigger:e.target.value}))}
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                <option value="INTERACT">🖐️ INTERACT (Press E)</option>
                <option value="STEP_ON">👣 STEP ON (Walk over)</option>
                <option value="AUTO">⚡ AUTO (On map load)</option>
              </select>
            </div>

            <div className="p-3 bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Conditions <span className="font-normal text-muted-foreground/60">(ALL must pass)</span>
                </label>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={()=>setShowCondPicker(p=>!p)}>
                  <Plus className="w-3 h-3 mr-0.5"/>Add
                </Button>
              </div>
              {(event.conditions||[]).length===0 && !showCondPicker && (
                <p className="text-xs text-muted-foreground">None — always triggers</p>
              )}
              {(event.conditions||[]).map((cond: ScriptCond, i: number)=>(
                <CondRow key={i} cond={cond} idx={i} cache={cache}
                  onChange={(k: string, v: unknown)=>updateCond(i,k,v)} onRemove={()=>removeCond(i)} />
              ))}
              {showCondPicker && (
                <div className="flex flex-wrap gap-1 mt-2 p-2 bg-secondary/30 rounded border border-border">
                  {Object.entries(CONDITION_TYPES).map(([type,def])=>(
                    <button key={type} onClick={()=>addCondition(type)}
                      className="px-2 py-0.5 bg-secondary rounded text-xs hover:bg-primary/20 hover:text-primary transition-colors">
                      {def.label}
                    </button>
                  ))}
                  <button onClick={()=>setShowCondPicker(false)} className="px-2 py-0.5 text-destructive text-xs">✕</button>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 bg-card border border-border rounded-lg">
            <div className="flex items-start justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Actions <span className="font-normal text-muted-foreground/60">(runs top to bottom)</span>
              </label>
              <div className="flex flex-col gap-1 items-end ml-3">
                {ACTION_GROUPS.map(grp=>(
                  <div key={grp.label} className="flex flex-wrap gap-1 justify-end">
                    {grp.types.map(t=>(
                      <button key={t} onClick={()=>addAction(t)}
                        className="px-2 py-0.5 bg-secondary/60 rounded border border-border text-xs hover:border-primary hover:text-primary transition-colors whitespace-nowrap">
                        {ACTION_TYPES[t]?.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {event.actions.length===0 && (
              <p className="text-center text-muted-foreground text-sm py-6">No actions yet. Click a button above to add one.</p>
            )}
            {event.actions.map((action: ScriptAction, i: number)=>(
              <ActionRow key={i} action={action} idx={i} total={event.actions.length} cache={cache}
                onChange={(k: string, v: unknown)=>updateAction(i,k,v)} onRemove={()=>removeAction(i)} onMove={(d: number)=>moveAction(i,d)} />
            ))}
          </div>
        </>)}
      </div>

      {/* JSON modal */}
      {showJson && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <h3 className="font-bold text-primary mb-1">📋 Raw Event JSON</h3>
            <p className="text-xs text-destructive mb-3">⚠️ Edit carefully — invalid JSON will not be accepted.</p>
            <textarea value={jsonText} onChange={e=>setJsonText(e.target.value)} rows={16}
              className="w-full px-3 py-2 bg-black/60 border border-border rounded text-xs font-mono resize-y" />
            {jsonError && <p className="text-xs text-destructive mt-1">{jsonError}</p>}
            <div className="flex gap-2 justify-end mt-3">
              <Button variant="outline" onClick={()=>setShowJson(false)}>Cancel</Button>
              <Button onClick={applyJson}>Apply JSON</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
