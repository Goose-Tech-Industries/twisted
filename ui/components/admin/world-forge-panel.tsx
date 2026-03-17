"use client"
import { useState, useEffect } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Save, Pencil, Check, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"

type GenerateMode = 'town' | 'npcs' | 'quest_chain' | 'full_world'
type ViewState    = 'home' | 'generating' | 'preview' | 'raw-edit' | 'success' | 'error'

interface NpcDef {
  name: string; icon: string; persona: string; move_type: string
  x: number; y: number; shop_name?: string; is_enemy?: boolean
}
interface ShopItem { name: string; icon: string; buy_price?: number; value?: number; [key: string]: unknown }
interface ShopDef  { name: string; icon: string; description: string; items: ShopItem[] }
interface QuestDef {
  title: string; description: string; quest_type: string; required_level: number
  objectives_json: Array<{ label?: string; type: string }>
  rewards_json: { xp?: number; gold?: number }
}
interface GeneratedData {
  map?:     { name: string; description: string; width: number; height: number; ambient_dark: number; min_level: number }
  npcs?:    NpcDef[]
  enemies?: NpcDef[]
  shops?:   ShopDef[]
  quests?:  QuestDef[]
  items?:   Array<{ name: string; icon: string; type: string; rarity: string }>
}
interface CommitResult { success: boolean; message: string; mapId?: number; log?: string[] }
type MapRef = { id: number; name: string }

const BIOMES: string[] = ['dark forest','coastal village','mountain settlement','swamp hamlet','desert outpost','underground cavern','haunted ruins','volcanic highlands']
const SIZES:  Array<{ v: string; l: string }> = [
  { v: 'hamlet',  l: 'Hamlet (3 NPCs, 1 shop)'  },
  { v: 'village', l: 'Village (5 NPCs, 2 shops)' },
  { v: 'town',    l: 'Town (7 NPCs, 3 shops)'    },
  { v: 'city',    l: 'City (10 NPCs, 3 shops)'   },
]
const NPC_COUNTS: string[] = ['1', '3', '5', '8']
const QUEST_LENS: Array<{ v: string; l: string }> = [
  { v: '2', l: '2 quests (short arc)' },
  { v: '3', l: '3 quests (full arc)'  },
  { v: '4', l: '4 quests (extended)'  },
]
const STAT_BONUS_KEYS: string[] = ['atk', 'def', 'hp', 'mp', 'mo', 'md', 'speed', 'luck']

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <span className="text-blue-400 shrink-0 mt-0.5">ℹ</span>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="inline-block bg-secondary border border-border rounded px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">{children}</span>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1">{children}</label>
}

function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      className="w-full px-3 py-2 bg-input border border-border rounded text-sm">
      {children}
    </select>
  )
}

export function WorldForgePanel() {
  const [view,          setView]          = useState<ViewState>('home')
  const [mode,          setMode]          = useState<GenerateMode>('town')
  const [result,        setResult]        = useState<GeneratedData | null>(null)
  const [rawJson,       setRawJson]       = useState('')
  const [rawError,      setRawError]      = useState('')
  const [commitResult,  setCommit]        = useState<CommitResult | null>(null)
  const [errorMsg,      setErrorMsg]      = useState('')
  const [targetMapId,   setTargetMapId]   = useState<number | null>(null)
  const [maps,          setMaps]          = useState<MapRef[]>([])
  const [loreBible,     setLoreBible]     = useState('')
  const [loreSaved,     setLoreSaved]     = useState(false)

  const [townBiome,   setTownBiome]   = useState('dark forest')
  const [townSize,    setTownSize]    = useState('village')
  const [townTheme,   setTownTheme]   = useState('medieval village hiding a blood cult under the chapel')
  const [npcType,     setNpcType]     = useState('0')
  const [npcRole,     setNpcRole]     = useState('mysterious tavern keeper')
  const [npcCount,    setNpcCount]    = useState('3')
  const [npcTheme,    setNpcTheme]    = useState('celtic mythology, touched by the Otherworld')
  const [questTheme,  setQuestTheme]  = useState('a missing child who walked into the forest and came back wrong')
  const [questLen,    setQuestLen]    = useState('3')
  const [questLevel,  setQuestLevel]  = useState('1')
  const [worldTheme,  setWorldTheme]  = useState("A dying coastal town where the fishermen started returning from the sea changed — speaking in dead languages, their eyes the colour of deep water.")

  useEffect(() => {
    fetch('/admin-panel/lore-bible', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: Record<string, unknown>) => { if (d.success && d.value) setLoreBible(String(d.value)) })
      .catch(() => {})
    adminApi.entity.getAll('map').then((r) => setMaps((r.data || []) as MapRef[]))
  }, [])

  const saveLore = async () => {
    await fetch('/admin-panel/lore-bible', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: loreBible }),
    }).catch(() => {})
    setLoreSaved(true); setTimeout(() => setLoreSaved(false), 2500)
  }

  const generate = async () => {
    setView('generating'); setErrorMsg('')
    let params: Record<string, unknown> = {}
    switch (mode) {
      case 'town':        params = { biome: townBiome, size: townSize, theme: townTheme }; break
      case 'npcs':        params = { count: parseInt(npcCount), role: npcRole, theme: npcTheme, is_enemy: parseInt(npcType) }; break
      case 'quest_chain': params = { theme: questTheme, length: parseInt(questLen), required_level: parseInt(questLevel) }; break
      case 'full_world':  params = { theme: worldTheme }; break
    }
    try {
      const r = await fetch('/admin/world-forge/generate', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, params, loreBible }),
      })
      const data: Record<string, unknown> = await r.json()
      if (!data.success) { setErrorMsg(String(data.message || 'Generation failed')); setView('error'); return }
      setResult(data.data as GeneratedData); setView('preview')
    } catch (e: unknown) { setErrorMsg(String(e)); setView('error') }
  }

  const openRawEdit = () => { setRawJson(JSON.stringify(result, null, 2)); setRawError(''); setView('raw-edit') }

  const applyRawEdit = () => {
    try { setResult(JSON.parse(rawJson) as GeneratedData); setView('preview'); setRawError('') }
    catch (e: unknown) { setRawError('Invalid JSON: ' + (e as Error).message) }
  }

  const regenNpc = async (idx: number) => {
    if (!result) return
    const existing = result.npcs?.[idx]; if (!existing) return
    try {
      const r = await fetch('/admin/world-forge/generate', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'npcs', params: { count: 1, role: existing.name + ' archetype', theme: loreBible || 'dark celtic fantasy', is_enemy: 0 }, loreBible }),
      })
      const data: Record<string, unknown> = await r.json()
      const newData = data.data as GeneratedData | undefined
      if (!data.success || !newData?.npcs?.[0]) return
      const newNpc: NpcDef = { ...newData.npcs[0], x: existing.x, y: existing.y, is_enemy: existing.is_enemy }
      const npcs = [...(result.npcs || [])]
      npcs[idx] = newNpc
      setResult({ ...result, npcs })
    } catch {}
  }

  const commit = async () => {
    if (!result) return
    setView('generating')
    try {
      const r = await fetch('/admin/world-forge/commit', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: result, mode, targetMapId }),
      })
      const data: CommitResult = await r.json()
      setCommit(data)
      setView(data.success ? 'success' : 'error')
      if (!data.success) setErrorMsg(data.message || 'Commit failed')
    } catch (e: unknown) { setErrorMsg(String(e)); setView('error') }
  }

  const modeLabel = (m: GenerateMode): string =>
    ({ town: 'town', npcs: 'NPCs', quest_chain: 'quest chain', full_world: 'full world' })[m]

  // ── States ──────────────────────────────────────────────────────
  if (view === 'generating') return (
    <div className="flex items-center justify-center h-64 flex-col gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <div className="text-primary font-semibold">Forging {modeLabel(mode)}…</div>
      <div className="text-xs text-muted-foreground">Gemini is generating your world content. This takes 5–15 seconds.</div>
    </div>
  )

  if (view === 'error') return (
    <div className="p-6 max-w-2xl">
      <div className="p-4 bg-red-950/30 border border-red-800 rounded-lg mb-4">
        <div className="flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-red-300 text-sm mb-1">
              {errorMsg?.toLowerCase().includes('rate') ? '⏳ Rate Limit Reached' : '❌ Generation Failed'}
            </div>
            <p className="text-sm text-red-300/80">{errorMsg}</p>
            {errorMsg?.toLowerCase().includes('rate') && (
              <p className="text-xs text-muted-foreground mt-2">The free tier has a per-minute/daily cap. Wait ~60 seconds and try again.</p>
            )}
          </div>
        </div>
      </div>
      <Button onClick={() => setView('home')} variant="outline">← Back</Button>
    </div>
  )

  if (view === 'success' && commitResult) return (
    <div className="p-6 max-w-2xl">
      <div className="p-8 bg-green-950/30 border border-green-800 rounded-xl text-center mb-6">
        <div className="text-5xl mb-3">🎉</div>
        <div className="text-xl font-bold text-green-400 mb-2">World Committed Successfully!</div>
        <div className="text-muted-foreground text-sm mb-4">{commitResult.message}</div>
        {commitResult.mapId && (
          <div className="inline-block bg-secondary px-4 py-2 rounded font-mono text-sm text-primary mb-4">Map ID: {commitResult.mapId}</div>
        )}
        {!!commitResult.log?.length && (
          <div className="bg-black/40 border border-border rounded-lg p-4 text-left max-h-40 overflow-y-auto mb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Commit Log</div>
            {commitResult.log.map((l: string, i: number) => (
              <div key={i} className="text-xs font-mono text-muted-foreground mb-1">{l}</div>
            ))}
          </div>
        )}
      </div>
      <Button onClick={() => { setView('home'); setResult(null) }} className="w-full">🌍 Forge Another World</Button>
    </div>
  )

  if (view === 'raw-edit') return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-primary">✏️ Raw JSON Editor</h3>
        <div className="flex gap-2">
          <Button onClick={applyRawEdit} className="bg-green-700 hover:bg-green-600">
            <Check className="w-4 h-4 mr-1" />Apply & Preview
          </Button>
          <Button variant="outline" onClick={() => setView('preview')}>Cancel</Button>
        </div>
      </div>
      <textarea value={rawJson} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRawJson(e.target.value)}
        rows={30} className="w-full px-3 py-2 bg-black/60 border border-border rounded text-xs font-mono resize-y" />
      {rawError && <p className="text-xs text-destructive mt-1">{rawError}</p>}
    </div>
  )

  if (view === 'preview' && result) return (
    <div className="p-6">
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl mb-6 flex-wrap gap-3">
        <div>
          <div className="font-bold text-green-400 flex items-center gap-2"><Check className="w-4 h-4" />Content Generated — Review Before Committing</div>
          <p className="text-xs text-muted-foreground mt-1">Everything below is a preview. Nothing is in your database yet.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={targetMapId ?? ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTargetMapId(e.target.value ? parseInt(e.target.value) : null)}
            className="px-2 py-1.5 bg-input border border-border rounded text-xs">
            <option value="">🗺️ Create New Map</option>
            {maps.map((m: MapRef) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={openRawEdit}><Pencil className="w-3.5 h-3.5 mr-1" />Edit JSON</Button>
          <Button size="sm" variant="outline" onClick={() => { setResult(null); setView('home') }}><RefreshCw className="w-3.5 h-3.5 mr-1" />Regenerate</Button>
          <Button size="sm" onClick={commit}><Save className="w-3.5 h-3.5 mr-1" />Commit to Database</Button>
        </div>
      </div>

      {result.map && (
        <div className="mb-6">
          <SectionTitle>🗺️ Map</SectionTitle>
          <div className="p-4 bg-card border border-blue-900/40 rounded-lg">
            <div className="font-bold text-lg mb-1">{result.map.name}</div>
            <p className="text-sm text-muted-foreground mb-2">{result.map.description}</p>
            <div className="flex gap-2 flex-wrap">
              <Pill>📐 {result.map.width}×{result.map.height}</Pill>
              <Pill>🔦 dark: {result.map.ambient_dark}</Pill>
              <Pill>⚔️ min lv: {result.map.min_level}</Pill>
            </div>
          </div>
        </div>
      )}

      {!!result.npcs?.length && (
        <div className="mb-6">
          <SectionTitle>👥 NPCs ({result.npcs.length})</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.npcs.map((npc: NpcDef, i: number) => (
              <div key={i} className="p-3 bg-card border border-border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{npc.icon || '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{npc.name}</div>
                    <div className="text-xs text-muted-foreground">{npc.move_type} · ({npc.x},{npc.y}){npc.shop_name ? ` · 🏪 ${npc.shop_name}` : ''}</div>
                  </div>
                  <button onClick={() => regenNpc(i)} title="Regenerate"
                    className="text-muted-foreground hover:text-foreground text-xs px-1.5 py-0.5 border border-border rounded">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{npc.persona}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!result.enemies?.length && (
        <div className="mb-6">
          <SectionTitle>👹 Enemies ({result.enemies.length})</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.enemies.map((npc: NpcDef, i: number) => (
              <div key={i} className="p-3 bg-card border border-red-900/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{npc.icon || '👹'}</span>
                  <div>
                    <div className="font-semibold text-sm text-red-400">{npc.name}</div>
                    <div className="text-xs text-muted-foreground">{npc.move_type} · ({npc.x},{npc.y})</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-3">{npc.persona}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!!result.shops?.length && (
        <div className="mb-6">
          <SectionTitle>
            🏪 Shops & Items ({result.shops.length} shops,{' '}
            {result.shops.reduce((a: number, s: ShopDef) => a + (s.items?.length || 0), 0)} items)
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.shops.map((shop: ShopDef, i: number) => (
              <div key={i} className="p-3 bg-card border border-amber-900/30 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{shop.icon || '🏪'}</span>
                  <div>
                    <div className="font-semibold text-sm">{shop.name}</div>
                    <div className="text-xs text-muted-foreground">{shop.description}</div>
                  </div>
                </div>
                {(shop.items || []).map((item: ShopItem, j: number) => {
                  const stats = STAT_BONUS_KEYS
                    .filter((s: string) => (item[`bonus_${s}`] as number | undefined || 0) !== 0)
                    .map((s: string) => `+${item[`bonus_${s}`]} ${s.toUpperCase()}`).join(' ')
                  return (
                    <div key={j} className="flex justify-between items-center px-2 py-1.5 bg-secondary/30 rounded mb-1 text-xs">
                      <span>
                        {item.icon || '📦'} <b>{item.name}</b>
                        {stats ? <span className="text-yellow-500 ml-2">{stats}</span> : null}
                      </span>
                      <span className="text-green-400 font-bold ml-2">💰 {item.buy_price || item.value || 0}g</span>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!!result.quests?.length && (
        <div className="mb-6">
          <SectionTitle>📜 Quests ({result.quests.length})</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {result.quests.map((q: QuestDef, i: number) => (
              <div key={i} className="p-3 bg-card border border-amber-900/30 rounded-lg">
                <div className="font-semibold text-sm mb-0.5">📜 {q.title}</div>
                <div className="text-xs text-muted-foreground mb-2">lv{q.required_level}+ · {q.quest_type}</div>
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{q.description}</p>
                <div className="text-xs text-muted-foreground mb-2">
                  Objectives: {(q.objectives_json || []).map((o: { label?: string; type: string }) => o.label || o.type).join(' → ')}
                </div>
                <div className="flex gap-1">
                  {q.rewards_json?.xp   && <Pill>✨ {q.rewards_json.xp} XP</Pill>}
                  {q.rewards_json?.gold && <Pill>💰 {q.rewards_json.gold}g</Pill>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 justify-end pt-4 border-t border-border">
        <Button variant="outline" onClick={openRawEdit}><Pencil className="w-4 h-4 mr-1" />Edit Raw JSON</Button>
        <Button variant="outline" onClick={() => { setResult(null); setView('home') }}><RefreshCw className="w-4 h-4 mr-1" />Regenerate</Button>
        <Button onClick={commit}><Save className="w-4 h-4 mr-1" />Commit to Database</Button>
      </div>
    </div>
  )

  // ── Home ────────────────────────────────────────────────────────
  const cardBase = "p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors"
  const btnBase  = "w-full mt-3 py-3 rounded-lg font-bold text-sm cursor-pointer border-0 transition-all hover:opacity-90 hover:-translate-y-px"

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">🌍 World Forge</h2>
          <p className="text-sm text-muted-foreground">AI-powered content generator. Preview everything before it touches your database.</p>
        </div>
        <Badge className="bg-purple-900/50 text-purple-300 border-purple-700">✨ AI POWERED</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className={cardBase}>
          <div className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-3">🏘️ Generate Town</div>
          <Label>Biome</Label>
          <Sel value={townBiome} onChange={setTownBiome}>
            {BIOMES.map((b: string) => <option key={b} value={b}>{b}</option>)}
          </Sel>
          <Label>Size</Label>
          <Sel value={townSize} onChange={setTownSize}>
            {SIZES.map((s: { v: string; l: string }) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </Sel>
          <Label>Theme / Dark Secret</Label>
          <Input value={townTheme} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTownTheme(e.target.value)} placeholder="e.g. cursed by a sleeping god" />
          <button onClick={() => { setMode('town'); generate() }} className={cn(btnBase, 'bg-gradient-to-r from-blue-700 to-blue-900 text-white')}>⚡ Generate Town</button>
        </div>

        <div className={cardBase}>
          <div className="text-xs font-bold uppercase tracking-widest text-green-400 mb-3">👤 Generate NPCs / Enemies</div>
          <Label>Type</Label>
          <Sel value={npcType} onChange={setNpcType}>
            <option value="0">Friendly NPCs</option>
            <option value="1">Enemies / Creatures</option>
          </Sel>
          <Label>Role / Archetype</Label>
          <Input value={npcRole} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNpcRole(e.target.value)} placeholder="e.g. blacksmith, corrupted knight" />
          <Label>Count</Label>
          <Sel value={npcCount} onChange={setNpcCount}>
            {NPC_COUNTS.map((c: string) => <option key={c} value={c}>{c}</option>)}
          </Sel>
          <Label>Flavour Theme</Label>
          <Input value={npcTheme} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNpcTheme(e.target.value)} placeholder="e.g. celtic mythology, undead plague" />
          <button onClick={() => { setMode('npcs'); generate() }} className={cn(btnBase, 'bg-gradient-to-r from-green-700 to-green-900 text-white')}>⚡ Generate NPCs</button>
        </div>

        <div className={cardBase}>
          <div className="text-xs font-bold uppercase tracking-widest text-orange-400 mb-3">📜 Generate Quest Chain</div>
          <Label>Theme</Label>
          <Input value={questTheme} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuestTheme(e.target.value)} placeholder="e.g. corruption spreading from an ancient barrow" />
          <Label>Chain Length</Label>
          <Sel value={questLen} onChange={setQuestLen}>
            {QUEST_LENS.map((q: { v: string; l: string }) => <option key={q.v} value={q.v}>{q.l}</option>)}
          </Sel>
          <Label>Starting Level Requirement</Label>
          <Input type="number" value={questLevel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuestLevel(e.target.value)} min={1} max={99} />
          <button onClick={() => { setMode('quest_chain'); generate() }} className={cn(btnBase, 'bg-gradient-to-r from-orange-700 to-orange-900 text-white')}>⚡ Generate Quest Chain</button>
        </div>

        <div className={cn(cardBase, 'border-purple-900/50 bg-purple-950/10')}>
          <div className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-3">🌍 Full Starter World</div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Generates a complete package: 1 map + 5 NPCs + 3 enemies + 2 shops + starter items + 3 quests.
          </p>
          <Label>World Theme</Label>
          <textarea value={worldTheme} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setWorldTheme(e.target.value)}
            rows={4} className="w-full px-3 py-2 bg-input border border-border rounded text-sm resize-none"
            placeholder="Describe your world..." />
          <button onClick={() => { setMode('full_world'); generate() }}
            className={cn(btnBase, 'bg-gradient-to-r from-purple-700 to-purple-900 text-white shadow-lg shadow-purple-900/30')}>
            🌍 Forge Full World
          </button>
        </div>
      </div>

      <div className="p-5 bg-card border border-border rounded-xl">
        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-sm font-bold text-yellow-500">📖 Lore Bible</div>
            <div className="text-xs text-muted-foreground mt-0.5">Injected into every generation prompt. Shared across all GMs.</div>
          </div>
          <Button size="sm" variant="outline" onClick={saveLore}>
            {loreSaved
              ? <><Check className="w-3.5 h-3.5 mr-1 text-green-400" />Saved!</>
              : <><Save className="w-3.5 h-3.5 mr-1" />Save</>}
          </Button>
        </div>
        <textarea value={loreBible} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setLoreBible(e.target.value)}
          rows={3}
          placeholder="e.g. The world is called Tír na nÓg. Magic comes from Blood Oghams. The Old Gods are real, angry, and sleeping. Tone: dark, gothic, weary. No elves."
          className="w-full px-3 py-2 bg-input border border-border rounded text-sm resize-y" />
      </div>
    </div>
  )
}
