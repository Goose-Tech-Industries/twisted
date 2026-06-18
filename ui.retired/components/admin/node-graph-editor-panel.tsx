"use client"

// =================================================================
// NODE GRAPH EDITOR — React wrapper around Drawflow
// Drawflow is loaded dynamically from CDN via useEffect, same pattern
// as any imperative JS library in React (Leaflet, CodeMirror, etc.)
// =================================================================

import { useState, useEffect, useRef, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Code, Save, X, ZoomIn, Trash2, Play } from "lucide-react"
import type { ScriptEvent } from "./script-editor-panel"

// ── Drawflow types (we import it dynamically so no npm install needed) ─
declare class Drawflow {
  constructor(element: HTMLElement)
  reroute: boolean
  reroute_fix_curvature: boolean
  force_first_input: boolean
  canvas_x: number
  canvas_y: number
  zoom: number
  precanvas: HTMLElement
  start(): void
  clear(): void
  import(data: unknown): void
  export(): DrawflowExport
  addNode(name:string, inputs:number, outputs:number, x:number, y:number, className:string, data:Record<string,unknown>, html:string): number
  addConnection(srcId:number, destId:number, srcOutput:string, destInput:string): void
  zoom_reset(): void
}
interface DrawflowNode { id:number; name:string; pos_x:number; pos_y:number; data:Record<string,unknown>; inputs:Record<string,{connections:Array<{node:string;input:string}>}>; outputs:Record<string,{connections:Array<{node:string;output:string}>}> }
interface DrawflowExport { drawflow: { Home: { data: Record<string,DrawflowNode> } } }

// ── Lookup cache ──────────────────────────────────────────────────
interface Cache {
  items: Array<{id:number;name:string;icon?:string}>
  quests: Array<{id:number;quest_id?:string;title?:string;name?:string}>
  shops: Array<{id:number;name:string}>
  npcs: Array<{id:number;name:string;icon?:string}>
  classes: Array<{id:number;name:string}>
  factions: Array<{id:number;name:string}>
  maps: Array<{id:number;name:string}>
}

// ── Helper: HTML escape ────────────────────────────────────────────
function esc(s: unknown) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}
function coerce(v: unknown): unknown {
  if (v==='true') return true; if (v==='false') return false
  const n = Number(v); return (!isNaN(n) && String(v).trim()!=='') ? n : v
}

// ── Node HTML builders ─────────────────────────────────────────────
function buildNodeHtml(type: string, data: Record<string,unknown>, cache: Cache): string {
  const sel = (fieldType: string, curVal: unknown) => {
    let opts: Array<{v:unknown;l:string}> = []
    switch(fieldType) {
      case 'db_item':     opts=cache.items.map(i=>({v:i.id,l:`${i.icon||'📦'} ${i.name}`})); break
      case 'db_quest':    opts=cache.quests.map(q=>({v:q.quest_id||q.id,l:`📜 ${q.title||q.quest_id}`})); break
      case 'db_shop':     opts=cache.shops.map(s=>({v:s.id,l:`🏪 ${s.name}`})); break
      case 'db_npc_id':   opts=cache.npcs.map(n=>({v:n.id,l:`${n.icon||'👤'} ${n.name}`})); break
      case 'db_npc_name': opts=cache.npcs.map(n=>({v:n.name,l:`${n.icon||'👤'} ${n.name}`})); break
      case 'db_map':      opts=cache.maps.map(m=>({v:m.id,l:`🗺️ ${m.name}`})); break
      case 'db_class':    opts=cache.classes.map(c=>({v:c.id,l:`⚔️ ${c.name}`})); break
      case 'db_faction':  opts=cache.factions.map(f=>({v:f.id,l:`⚔️ ${f.name}`})); break
    }
    return `<select df-${fieldType.replace('db_','')}Id style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:3px 6px;border-radius:4px;font-size:11px">${opts.map(o=>`<option value="${o.v}" ${String(curVal)===String(o.v)?'selected':''}>${o.l}</option>`).join('')}</select>`
  }
  const field = (label: string, inner: string) =>
    `<div style="padding:4px 10px"><label style="display:block;font-size:9px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${label}</label>${inner}</div>`
  const inp = (dfKey: string, val: unknown, type='text', ph='') =>
    `<input type="${type}" df-${dfKey} value="${esc(val)}" placeholder="${esc(ph)}" style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:4px 7px;border-radius:4px;font-size:11px;font-family:monospace;box-sizing:border-box">`
  const ta = (dfKey: string, val: unknown, ph='') =>
    `<textarea df-${dfKey} rows="2" placeholder="${esc(ph)}" style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:4px 7px;border-radius:4px;font-size:11px;font-family:monospace;resize:vertical;box-sizing:border-box">${esc(val)}</textarea>`

  const title = (label: string, color='#e8eef6') =>
    `<div style="font-size:11px;font-weight:bold;color:${color};padding:8px 12px 6px;border-bottom:1px solid #21262d;border-radius:10px 10px 0 0;background:rgba(255,255,255,.03)">${label}</div>`

  switch(type) {
    case 'dialogue': return title('💬 Dialogue') +
      field('Speaker', inp('speaker', data.speaker||'', 'text', 'NPC name')) +
      field('Text',    ta('text', data.text||'', 'What they say…'))

    case 'give_item': case 'take_item': return title(type==='give_item'?'📦 Give Item':'🗑️ Take Item') +
      field('Item', sel('db_item', data.itemId)) +
      field('Qty',  inp('quantity', data.quantity||1, 'number'))

    case 'give_gold': return title('💰 Give Gold') + field('Amount', inp('amount', data.amount||0, 'number'))
    case 'give_xp':   return title('⭐ Give XP')   + field('Amount', inp('amount', data.amount||0, 'number'))
    case 'heal':      return title('💚 Heal')       + field('HP', inp('hp', data.hp||'MAX','text','MAX or formula')) + field('MP', inp('mp', data.mp||'','text','MAX or formula'))
    case 'damage':    return title('💥 Damage')     + field('HP Damage', inp('hp', data.hp||'10','text','formula'))

    case 'teleport': return title('🚪 Teleport') +
      field('Map', sel('db_map', data.mapId)) +
      `<div style="padding:4px 10px;display:flex;gap:6px"><div><label style="font-size:9px;color:#484f58;display:block">X</label>${inp('x', data.x||10,'number')}</div><div><label style="font-size:9px;color:#484f58;display:block">Y</label>${inp('y', data.y||10,'number')}</div></div>`

    case 'quest_start':    return title('📜 Start Quest')    + field('Quest', sel('db_quest', data.questId))
    case 'quest_advance':  return title('📜 Advance Quest')  + field('Quest', sel('db_quest', data.questId))
    case 'quest_complete': return title('🏆 Complete Quest') + field('Quest', sel('db_quest', data.questId))

    case 'battle':   return title('⚔️ Battle')    + field('Enemy NPC', sel('db_npc_id', data.enemyId))
    case 'npc_talk': return title('🗣️ NPC Talk') + field('NPC', sel('db_npc_name', data.npcName))
    case 'shop':     return title('🪙 Open Shop')  + field('Shop', sel('db_shop', data.shopId))

    case 'set_flag':       return title('🚩 Set Flag')  + field('Flag Name', inp('key', data.key||'','text','e.g. talked_to_guard')) + field('Value', inp('value', data.value??'true','text','true / false / 42'))
    case 'set_world_flag': return title('🌍 World Flag') + field('Flag Name', inp('key', data.key||'','text','e.g. goblin_boss_slain')) + field('Value', inp('value', data.value??'true','text','true / false'))
    case 'set_map_flag':   return title('🌍 Map Flag')  + field('Flag Name', inp('key', data.key||'','text','e.g. lantern_3_5')) + field('Value', inp('value', data.value??'true','text','true / false / 42'))
    case 'inc_flag':       return title('➕ Inc Flag')  + field('Flag Name', inp('key', data.key||'','text','e.g. kill_count')) + field('Amount', inp('amount', data.amount||1,'number'))

    case 'set_npc_mood': return title('😶 NPC Mood') + field('NPC', sel('db_npc_name', data.npcName)) +
      field('Mood', `<select df-mood style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:3px 6px;border-radius:4px;font-size:11px">
        ${['happy','fearful','angry','grieving','excited','(clear)'].map(m=>`<option value="${m}" ${data.mood===m?'selected':''}>${m}</option>`).join('')}
      </select>`)

    case 'kill_npc': return title('💀 Kill NPC','#f85149') + field('NPC', sel('db_npc_name', data.npcName)) + field('Death Cause', inp('cause', data.cause||'','text','e.g. Slain by the shadow wraith'))
    case 'faction_rep': return title('⚖️ Faction Rep') + field('Faction', sel('db_faction', data.factionId)) + field('Amount (+/-)', inp('delta', data.delta||10,'number'))

    case 'screen_effect': return title('✨ Screen Effect') +
      field('Effect', `<select df-effect style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:3px 6px;border-radius:4px;font-size:11px">
        ${['shake','flash','fade'].map(o=>`<option ${data.effect===o?'selected':''}>${o}</option>`).join('')}
      </select>`) +
      field('Duration (ms)', inp('duration', data.duration||500,'number'))

    case 'wait':  return title('⏱️ Wait')    + field('Milliseconds', inp('ms', data.ms||1000,'number'))
    case 'sound': return title('🔊 Sound')   + field('Filename',     inp('file', data.file||'','text','e.g. door_open.mp3'))

    case 'choice': {
      const opts = (data.options as Array<{text:string}>)||[{text:'Option A'},{text:'Option B'}]
      return title('🔀 Choice','#bb86fc') +
        field('Prompt', inp('prompt', data.prompt||'','text','What do you choose?')) +
        opts.map((o,i)=>field(`Option ${i+1}`, inp(`opt_${i}`, o.text,'text',`Option ${i+1}`))).join('')
    }

    case 'conditional': return title('❓ If…','#f39c12') +
      field('Flag Key', inp('condKey', data.condKey||'','text','flag name')) +
      `<div style="padding:4px 10px;display:flex;gap:6px">
        <div><label style="font-size:9px;color:#484f58;display:block">Op</label>
          <select df-condOp style="width:60px;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:3px 5px;border-radius:4px;font-size:11px">
            ${['==','!=','>','<','>=','<='].map(op=>`<option ${data.condOp===op?'selected':''}>${op}</option>`).join('')}
          </select></div>
        <div style="flex:1"><label style="font-size:9px;color:#484f58;display:block">Value</label>${inp('condVal', data.condVal??'true','text')}</div>
      </div>` +
      `<div style="padding:4px 10px 8px;font-size:9px;color:#484f58">✅ true port → ❌ false port</div>`

    default: return title(type.toUpperCase()) + `<div style="padding:8px 10px;font-size:11px;color:#484f58">Unknown node type: ${esc(type)}</div>`
  }
}

// ── Palette groups ────────────────────────────────────────────────
const PALETTE = [
  { label:'▶ Flow',    nodes:['dialogue','choice','conditional'] },
  { label:'🎁 Rewards', nodes:['give_item','take_item','give_gold','give_xp','heal','damage'] },
  { label:'🗺️ World',  nodes:['teleport','set_flag','inc_flag','set_world_flag','set_map_flag','screen_effect','wait','sound'] },
  { label:'👤 NPC',    nodes:['npc_talk','set_npc_mood','kill_npc','faction_rep'] },
  { label:'⚔️ Game',  nodes:['battle','shop','quest_start','quest_advance','quest_complete'] },
]
const NODE_LABELS: Record<string,string> = {
  dialogue:'💬 Dialogue', choice:'🔀 Choice', conditional:'❓ If…',
  give_item:'📦 Give Item', take_item:'🗑️ Take Item', give_gold:'💰 Give Gold', give_xp:'⭐ Give XP',
  heal:'💚 Heal', damage:'💥 Damage', teleport:'🚪 Teleport',
  set_flag:'🚩 Set Flag', inc_flag:'➕ Inc Flag', set_world_flag:'🌍 World Flag',
  set_map_flag:'🌍 Map Flag', screen_effect:'✨ Effect', wait:'⏱️ Wait', sound:'🔊 Sound',
  npc_talk:'🗣️ NPC Talk', set_npc_mood:'😶 NPC Mood', kill_npc:'💀 Kill NPC', faction_rep:'⚖️ Faction Rep',
  battle:'⚔️ Battle', shop:'🪙 Shop', quest_start:'📜 Start Quest',
  quest_advance:'📜 Advance Quest', quest_complete:'🏆 Complete Quest',
}

// ── Props ─────────────────────────────────────────────────────────
interface NodeGraphEditorPanelProps {
  initialEvent?: ScriptEvent
  onSave: (event: ScriptEvent) => void
  onCancel: () => void
}

// ── Main component ────────────────────────────────────────────────
export function NodeGraphEditorPanel({ initialEvent, onSave, onCancel }: NodeGraphEditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef      = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<Drawflow | null>(null)
  const cacheRef     = useRef<Cache>({ items:[], quests:[], shops:[], npcs:[], classes:[], factions:[], maps:[] })
  const eventRef     = useRef<ScriptEvent>(initialEvent || { trigger:'INTERACT', conditions:[], actions:[] })
  const dragType     = useRef<string>('')
  const nodeCounter  = useRef(0)

  const [trigger, setTrigger] = useState(initialEvent?.trigger || 'INTERACT')
  const [loading, setLoading] = useState(true)
  const [showJson, setShowJson] = useState(false)
  const [jsonPreview, setJsonPreview] = useState('')
  const [previewMode, setPreviewMode] = useState(false)
  const [previewStep, setPreviewStep] = useState(0)
  const [previewActions, setPreviewActions] = useState<ScriptEvent['actions']>([])
  const [previewChoicePath, setPreviewChoicePath] = useState<number[]>([])

  // Load data + Drawflow
  useEffect(() => {
    Promise.all([
      adminApi.entity.getAll('item'), adminApi.entity.getAll('quest'),
      adminApi.entity.getAll('shop'), adminApi.entity.getAll('npc'),
      adminApi.entity.getAll('class'), adminApi.entity.getAll('faction'),
      adminApi.entity.getAll('map'),
    ]).then(([ir,qr,sr,nr,cr,fr,mr]) => {
      cacheRef.current = {
        items:    (ir.data||[]) as Cache['items'],
        quests:   (qr.data||[]) as Cache['quests'],
        shops:    (sr.data||[]) as Cache['shops'],
        npcs:     (nr.data||[]) as Cache['npcs'],
        classes:  (cr.data||[]) as Cache['classes'],
        factions: (fr.data||[]) as Cache['factions'],
        maps:     (mr.data||[]) as Cache['maps'],
      }
    }).then(() => loadDrawflow())
  }, [])

  const loadDrawflow = () => {
    // Load CSS
    if (!document.querySelector('link[href*="drawflow"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://cdn.jsdelivr.net/npm/drawflow@0.0.59/dist/drawflow.min.css'
      document.head.appendChild(link)
    }
    // Load JS
    if ((window as unknown as Record<string,unknown>).Drawflow) { initEditor(); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/drawflow@0.0.59/dist/drawflow.min.js'
    script.onload = () => initEditor()
    script.onerror = () => setLoading(false)
    document.head.appendChild(script)
  }

  const addNode = useCallback((type: string, data: Record<string,unknown>, x: number, y: number): number => {
    const ed = editorRef.current; if (!ed) return -1
    const cache = cacheRef.current
    const html = buildNodeHtml(type, data, cache)
    const className = `ng-node-${type}`

    if (type === 'choice') {
      const opts = (data.options as Array<{text:string}>)||[{text:'Option A'},{text:'Option B'}]
      return ed.addNode(type, 1, opts.length + 1, x, y, `ng-node-choice`, data, html)
    }
    if (type === 'conditional') {
      const id = ed.addNode(type, 1, 2, x, y, 'ng-node-conditional', data, html)
      setTimeout(() => {
        const nodeEl = document.querySelector(`.drawflow-node[id="node-${id}"]`)
        if (!nodeEl) return
        const outs = nodeEl.querySelectorAll('.output')
        if (outs[0]) outs[0].setAttribute('data-label', '✅ true')
        if (outs[1]) outs[1].setAttribute('data-label', '❌ false')
      }, 50)
      return id
    }
    return ed.addNode(type, 1, 1, x, y, className, data, html)
  }, [])

  const addStartNode = useCallback((x=60, y=160): number => {
    const ed = editorRef.current; if (!ed) return -1
    const ev = eventRef.current
    const html = `
      <div style="font-size:11px;font-weight:bold;color:#3fb950;padding:8px 12px 6px;border-bottom:1px solid #21262d;border-radius:10px 10px 0 0;background:rgba(63,185,80,.07)">▶ START</div>
      <div style="padding:4px 10px"><label style="display:block;font-size:9px;color:#484f58;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Trigger</label>
        <select df-trigger style="width:100%;background:#161b22;border:1px solid #30363d;color:#e8eef6;padding:3px 6px;border-radius:4px;font-size:11px">
          <option value="INTERACT" ${(ev.trigger||'INTERACT')==='INTERACT'?'selected':''}>🖐️ INTERACT</option>
          <option value="STEP_ON" ${ev.trigger==='STEP_ON'?'selected':''}>👣 STEP ON</option>
          <option value="AUTO" ${ev.trigger==='AUTO'?'selected':''}>⚡ AUTO</option>
        </select></div>
      <div style="padding:4px 10px 8px;font-size:9px;color:#484f58">Script begins here ▶</div>`
    return ed.addNode('start', 0, 1, x, y, 'ng-node-start', { trigger: ev.trigger||'INTERACT' }, html)
  }, [])

  const importFromEvent = useCallback((ev: ScriptEvent) => {
    const STEP_X = 280
    const ed = editorRef.current; if (!ed) return
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const edSafe = editorRef.current!
    const startId = addStartNode(60, 160)

    function layoutActions(actions: ScriptEvent['actions'], sx: number, sy: number, parentId: number, parentPort: number) {
      let prevId = parentId, prevPort = parentPort, cx = sx, cy = sy
      for (const action of (actions||[])) {
        const t = action.type.toLowerCase()
        const d = { ...action } as Record<string,unknown>; delete d.type
        let nodeId: number

        if (t === 'choice') {
          d.options = d.options || []
          nodeId = addNode('choice', d, cx, cy)
          if (prevId >= 0) { try { edSafe.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1') } catch {} }
          let branchY = cy + 200
          ;(d.options as Array<{text:string;actions?:ScriptEvent['actions']}>).forEach((opt, i) => {
            layoutActions(opt.actions||[], cx+STEP_X, branchY, nodeId, i+1)
            branchY += 130
          })
          prevId = nodeId; prevPort = (d.options as unknown[]).length + 1
        } else if (t === 'if' || t === 'conditional') {
          const cond = (d.condition as Record<string,unknown>)||{}
          d.condKey = cond.key||d.condKey||''; d.condOp = cond.op||d.condOp||'=='
          d.condVal = cond.value!==undefined ? cond.value : (d.condVal!==undefined ? d.condVal : 'true')
          nodeId = addNode('conditional', d, cx, cy)
          if (prevId >= 0) { try { edSafe.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1') } catch {} }
          layoutActions((d.then as ScriptEvent['actions'])||[], cx+STEP_X, cy-80, nodeId, 1)
          layoutActions((d.else as ScriptEvent['actions'])||[], cx+STEP_X, cy+80, nodeId, 2)
          prevId = -1; break
        } else {
          nodeId = addNode(t, d, cx, cy)
          if (nodeId >= 0 && prevId >= 0) { try { edSafe.addConnection(prevId, nodeId, `output_${prevPort}`, 'input_1') } catch {} }
          prevId = nodeId; prevPort = 1
        }
        cx += STEP_X
      }
    }

    layoutActions(ev.actions||[], 60+STEP_X, 160, startId, 1)
  }, [addNode, addStartNode])

  const initEditor = useCallback(() => {
    const container = containerRef.current; if (!container) return
    const DrawflowCtor = (window as unknown as Record<string,unknown>).Drawflow as typeof Drawflow
    if (!DrawflowCtor) return

    const ed = new DrawflowCtor(container)
    ed.reroute = true; ed.reroute_fix_curvature = true; ed.force_first_input = false
    ed.start()
    editorRef.current = ed

    const ev = eventRef.current
    if (ev._graphLayout) {
      try { ed.import(ev._graphLayout); setLoading(false); return } catch {}
    }
    importFromEvent(ev)
    setLoading(false)
  }, [importFromEvent])

  // Drag and drop from palette
  const handleDragStart = (nodeType: string) => { dragType.current = nodeType }
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = dragType.current; if (!type) return
    const wrap = wrapRef.current; if (!wrap) return
    const ed = editorRef.current; if (!ed) return
    const rect = wrap.getBoundingClientRect()
    const x = (e.clientX - rect.left - ed.canvas_x) / ed.zoom
    const y = (e.clientY - rect.top  - ed.canvas_y) / ed.zoom
    addNode(type, {}, x, y)
  }, [addNode])

  const exportToEvent = useCallback((): ScriptEvent => {
    const ed = editorRef.current
    if (!ed) return eventRef.current
    const raw = ed.export()
    const nodes = raw.drawflow.Home.data
    const visited = new Set<string>()
    const NUM_KEYS = new Set(['quantity','amount','ms','duration','x','y','mapId','itemId','questId','shopId','enemyId','factionId','delta'])

    function getNext(node: DrawflowNode, outputKey: string): string | null {
      const conns = node.outputs?.[outputKey]?.connections||[]
      return conns.length ? String(conns[0].node) : null
    }

    function traverse(nodeId: string | null): ScriptEvent['actions'] {
      if (!nodeId || visited.has(nodeId)) return []
      const node = nodes[nodeId]; if (!node) return []
      visited.add(nodeId)
      if (node.name === 'start') return traverse(getNext(node, 'output_1'))

      if (node.name === 'choice') {
        const d = node.data
        const optCount = Object.keys(node.outputs).length - 1
        const options = []
        for (let i = 0; i < optCount; i++) {
          const text = String(d[`opt_${i}`] || `Option ${i+1}`)
          const branchId = getNext(node, `output_${i+1}`)
          options.push({ text, actions: traverse(branchId) })
        }
        return [{ type:'CHOICE', prompt: String(d.prompt||''), options }, ...traverse(getNext(node, `output_${optCount+1}`))]
      }

      if (node.name === 'conditional') {
        const d = node.data
        return [{ type:'IF', condition:{ type:'FLAG', key:d.condKey, op:d.condOp||'==', value:coerce(d.condVal) },
          then: traverse(getNext(node,'output_1')), else: traverse(getNext(node,'output_2')) }]
      }

      const d = { ...node.data }
      for (const k of NUM_KEYS) { if (d[k]!==undefined && d[k]!=='') d[k] = Number(d[k]) }
      if (d.value!==undefined) d.value = coerce(d.value)
      delete d._nodeId
      const action: ScriptEvent['actions'][0] = { type: node.name.toUpperCase(), ...d }
      return [action, ...traverse(getNext(node,'output_1'))]
    }

    const startNode = (Object.values(nodes) as DrawflowNode[]).find(n => n.name === 'start')
    if (!startNode) return eventRef.current
    const triggerVal = ((startNode as DrawflowNode).data?.trigger as string) || trigger || 'INTERACT'
    return {
      trigger: triggerVal, conditions: eventRef.current.conditions||[],
      actions: traverse(String((startNode as DrawflowNode).id)),
      x: eventRef.current.x, y: eventRef.current.y,
      _graphLayout: raw,
    }
  }, [trigger])

  const handleSave = useCallback(() => {
    try { onSave(exportToEvent()) } catch(e) { alert('Error: ' + (e as Error).message) }
  }, [exportToEvent, onSave])

  const viewJson = useCallback(() => {
    try {
      const ev = exportToEvent()
      const copy = { ...ev }; delete copy._graphLayout
      setJsonPreview(JSON.stringify(copy, null, 2)); setShowJson(true)
    } catch(e) { alert('Error: ' + (e as Error).message) }
  }, [exportToEvent])

  const startPreview = useCallback(() => {
    try {
      const ev = exportToEvent()
      const flatActions = flattenActions(ev.actions || [])
      setPreviewActions(flatActions)
      setPreviewStep(0)
      setPreviewChoicePath([])
      setPreviewMode(true)
    } catch(e) { alert('Error: ' + (e as Error).message) }
  }, [exportToEvent])

  // Flatten dialogue actions into a linear preview (choices branch)
  function flattenActions(actions: ScriptEvent['actions'], depth = 0): ScriptEvent['actions'] {
    const flat: ScriptEvent['actions'] = []
    for (const a of actions) {
      flat.push({ ...a, _depth: depth } as ScriptEvent['actions'][0])
      if (a.type === 'CHOICE' && a.options) {
        for (const opt of a.options as Array<{ text: string; actions?: ScriptEvent['actions'] }>) {
          flat.push({ type: '_CHOICE_OPTION', text: opt.text, _depth: depth + 1, actions: opt.actions } as unknown as ScriptEvent['actions'][0])
        }
      }
      if (a.type === 'IF' && a.then) {
        flat.push(...flattenActions(a.then as ScriptEvent['actions'], depth + 1))
      }
    }
    return flat
  }

  const clearAll = () => {
    if (!confirm('Clear all nodes? This cannot be undone.')) return
    editorRef.current?.clear()
    addStartNode(60, 160)
  }

  const zoomFit = () => {
    const ed = editorRef.current; if (!ed) return
    ed.zoom_reset()
    const nodes = Object.values(ed.export().drawflow.Home.data) as DrawflowNode[]
    if (!nodes.length) return
    const avgX = nodes.reduce((s: number, n: DrawflowNode) => s + n.pos_x, 0) / nodes.length
    const avgY = nodes.reduce((s: number, n: DrawflowNode) => s + n.pos_y, 0) / nodes.length
    const wrap = wrapRef.current; if (!wrap) return
    ed.canvas_x = wrap.clientWidth/2 - avgX*ed.zoom
    ed.canvas_y = wrap.clientHeight/2 - avgY*ed.zoom
    ed.precanvas.style.transform = `translate(${ed.canvas_x}px,${ed.canvas_y}px) scale(${ed.zoom})`
  }

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      {/* Drawflow overrides */}
      <style>{`
        .drawflow .drawflow-node { background:#0d1117!important; border:1px solid #30363d!important; border-radius:10px!important; min-width:220px!important; box-shadow:0 4px 16px rgba(0,0,0,.4)!important; padding:0!important; }
        .drawflow .drawflow-node.selected { border-color:#bb86fc!important; box-shadow:0 0 0 2px rgba(187,134,252,.3),0 4px 16px rgba(0,0,0,.4)!important; }
        .drawflow .drawflow-node .drawflow_content_node { padding:0!important; }
        .drawflow .connection .main-path { stroke:#484f58!important; stroke-width:2px!important; }
        .drawflow .connection.selected .main-path { stroke:#bb86fc!important; }
        .ng-node-start { border-color:#3fb95088!important; }
        .ng-node-choice { border-color:#bb86fc88!important; }
        .ng-node-conditional { border-color:#f39c1288!important; }
        .drawflow .output:after { content:attr(data-label); font-size:8px; color:#484f58; position:absolute; right:14px; top:50%; transform:translateY(-50%); white-space:nowrap; }
      `}</style>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-border shrink-0 flex-wrap">
        <span className="text-sm font-bold text-purple-400 mr-2">🔀 Node Graph</span>
        <label className="text-xs text-muted-foreground">Trigger:</label>
        <select value={trigger} onChange={e=>{ setTrigger(e.target.value); eventRef.current.trigger=e.target.value }}
          className="px-2 py-1 bg-[#161b22] border border-border rounded text-xs text-foreground">
          <option value="INTERACT">🖐️ INTERACT</option>
          <option value="STEP_ON">👣 STEP ON</option>
          <option value="AUTO">⚡ AUTO</option>
        </select>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={zoomFit}><ZoomIn className="w-3.5 h-3.5 mr-1"/>Fit</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={clearAll}><Trash2 className="w-3.5 h-3.5 mr-1"/>Clear</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs text-green-400" onClick={startPreview}><Play className="w-3.5 h-3.5 mr-1"/>Preview</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={viewJson}><Code className="w-3.5 h-3.5 mr-1"/>JSON</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}><X className="w-3.5 h-3.5 mr-1"/>Cancel</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave}><Save className="w-3.5 h-3.5 mr-1"/>Save</Button>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Palette */}
        <div className="w-40 shrink-0 bg-[#0d1117] border-r border-border overflow-y-auto p-2">
          {PALETTE.map(grp=>(
            <div key={grp.label}>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 px-1 pt-3 pb-1.5 font-bold">{grp.label}</div>
              {grp.nodes.map(type=>(
                <div key={type} draggable onDragStart={()=>handleDragStart(type)}
                  className="px-2 py-1.5 mb-1 rounded border border-[#21262d] bg-[rgba(255,255,255,.04)] text-[#8b949e] text-xs cursor-grab hover:bg-[rgba(187,134,252,.1)] hover:border-[rgba(187,134,252,.3)] hover:text-[#bb86fc] transition-colors user-select-none">
                  {NODE_LABELS[type]||type}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Canvas */}
        <div ref={wrapRef} className="flex-1 relative overflow-hidden bg-[#010409]"
          onDragOver={e=>e.preventDefault()} onDrop={handleDrop}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm z-10 bg-black/60">
              Loading Drawflow…
            </div>
          )}
          <div ref={containerRef} className="w-full h-full" id="ng-canvas" />
          <div className="absolute bottom-3 right-4 text-[10px] text-[#30363d] pointer-events-none select-none">
            Drag nodes from palette · Scroll to zoom · Drag canvas to pan
          </div>
        </div>
      </div>

      {/* Dialogue preview modal */}
      {previewMode && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-end justify-center p-4">
          <div className="bg-[#0d1117] border border-border rounded-xl w-full max-w-xl shadow-2xl mb-8">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-sm font-bold text-green-400">Dialogue Preview</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPreviewMode(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
            <div className="p-4 min-h-[200px] max-h-[400px] overflow-y-auto space-y-3">
              {previewActions.slice(0, previewStep + 1).map((action, i) => {
                if (action.type === 'DIALOGUE') {
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center text-sm shrink-0">👤</div>
                      <div>
                        <p className="text-xs font-bold text-primary">{String(action.speaker || 'NPC')}</p>
                        <p className="text-sm">{String(action.text || '')}</p>
                      </div>
                    </div>
                  )
                }
                if (action.type === 'CHOICE') {
                  return (
                    <div key={i} className="space-y-1.5">
                      {action.prompt ? <p className="text-xs text-muted-foreground">{String(action.prompt)}</p> : null}
                      {(action.options as Array<{ text: string; actions?: unknown[] }>)?.map((opt, j) => (
                        <button key={j}
                          onClick={() => {
                            setPreviewChoicePath([...previewChoicePath, j])
                            setPreviewStep(previewStep + 1)
                          }}
                          className="block w-full text-left px-3 py-2 rounded border border-primary/30 text-sm hover:bg-primary/10 transition-colors">
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  )
                }
                if (action.type === '_CHOICE_OPTION') return null
                // Show other actions as system messages
                return (
                  <div key={i} className="text-xs text-muted-foreground italic px-2 py-1 bg-muted/30 rounded">
                    [{action.type}] {action.type === 'GIVE_ITEM' ? `Give item #${action.itemId} x${action.quantity || 1}` :
                      action.type === 'GIVE_GOLD' ? `+${action.amount} gold` :
                      action.type === 'GIVE_XP' ? `+${action.amount} XP` :
                      action.type === 'TELEPORT' ? `Teleport to map #${action.mapId}` :
                      action.type === 'QUEST_START' ? `Start quest: ${action.questId}` :
                      action.type === 'BATTLE' ? `Battle begins!` :
                      action.type === 'SHOP' ? `Shop opens` :
                      action.type === 'SET_FLAG' ? `Set ${action.key} = ${action.value}` :
                      JSON.stringify(action).substring(0, 60)}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t border-border">
              <span className="text-[10px] text-muted-foreground">Step {previewStep + 1} of {previewActions.length}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  disabled={previewStep <= 0}
                  onClick={() => setPreviewStep(Math.max(0, previewStep - 1))}>
                  Back
                </Button>
                <Button size="sm" className="h-7 text-xs"
                  disabled={previewStep >= previewActions.length - 1}
                  onClick={() => setPreviewStep(previewStep + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* JSON preview modal */}
      {showJson && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0d1117] border border-border rounded-xl p-6 w-full max-w-2xl shadow-2xl">
            <h3 className="font-bold text-purple-400 mb-1">📋 Compiled Event JSON</h3>
            <p className="text-xs text-muted-foreground mb-3">Read-only. This is exactly what the game engine will receive.</p>
            <textarea value={jsonPreview} readOnly rows={18}
              className="w-full px-3 py-2 bg-black/60 border border-border rounded text-xs font-mono resize-y" />
            <div className="flex justify-end mt-3">
              <Button variant="outline" onClick={()=>setShowJson(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
