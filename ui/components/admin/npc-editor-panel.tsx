"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, Info, ChevronLeft, Skull, MessageSquare, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface NPC {
  id: number; name: string; icon: string; description: string
  is_enemy: boolean; char_id?: number
  persona: string; ai_mood: string; move_type: string; wander_radius: number
  shop_id?: number; map_id?: number; x?: number; y?: number
  // Enemy combat stats
  level?: number; hp?: number; mp?: number
  atk?: number; def?: number; mo?: number; md?: number; speed?: number; luck?: number
  exp_reward?: number; gold_reward?: number
  drop_table_json?: string; stats_json?: string; quest_offers_json?: string
}

interface Quest { id: number; quest_id: string; title: string }
interface Shop  { id: number; name: string }

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
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 bg-card border border-border rounded-lg space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

const BLANK: Partial<NPC> = {
  name: '', icon: '💬', description: '', is_enemy: false,
  persona: '', ai_mood: 'neutral', move_type: 'STATIONARY', wander_radius: 3,
  level: 1, hp: 100, mp: 50, atk: 10, def: 5, mo: 5, md: 5, speed: 5, luck: 3,
  exp_reward: 20, gold_reward: 10, drop_table_json: '[]', quest_offers_json: '[]'
}

export function NpcEditorPanel() {
  const [npcs, setNpcs] = useState<NPC[]>([])
  const [quests, setQuests] = useState<Quest[]>([])
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<NPC> | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'dialogue' | 'combat'>('dialogue')

  const load = useCallback(async () => {
    setLoading(true)
    const [nr, qr, sr] = await Promise.all([
      adminApi.entity.getAll('npc'),
      adminApi.entity.getAll('quest'),
      adminApi.entity.getAll('shop'),
    ])
    setNpcs((nr.data || []) as NPC[])
    setQuests((qr.data || []) as Quest[])
    setShops((sr.data || []) as Shop[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const save = async () => {
    if (!editing) return
    if (!editing.name?.trim()) { alert('Name is required.'); return }
    const res = await adminApi.entity.save('npc', editing as Record<string,unknown>, editing.id)
    if (res.success) { load(); setEditing(null) }
    else alert(res.message || 'Save failed')
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete NPC "${name}"?\n\nThis removes the NPC from all maps and spawn zones.`)) return
    const res = await adminApi.entity.delete('npc', id)
    if (res.success) load()
  }

  const set = (k: string, v: unknown) => setEditing(prev => ({ ...prev, [k]: v }))

  const filtered = npcs.filter(n =>
    n.name.toLowerCase().includes(search.toLowerCase()) ||
    (n.persona || '').toLowerCase().includes(search.toLowerCase())
  )
  const enemies   = filtered.filter(n => n.is_enemy)
  const dialogues = filtered.filter(n => !n.is_enemy)

  // ── Edit form ──────────────────────────────────────────────────
  if (editing !== null) {
    const isNew = !editing.id
    return (
      <div className="p-6 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{isNew ? '+ New NPC' : `✏️ ${editing.name}`}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>

        <Help>
          <b>Dialogue NPC</b>: leave Is Enemy unchecked. Fill the AI Persona — write it as if briefing an actor.
          Tell them who they are, what they know, their secrets, and how they speak.<br/>
          <b>Enemy</b>: check Is Enemy and fill out Combat Stats. The server creates a hidden character slot to hold combat data —
          a green ✔ in the NPC list confirms it's battle-ready. Red ⚠ means delete and recreate.
        </Help>

        {/* Identity */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="col-span-2">
            <label className="text-sm font-medium">Name</label>
            <Input value={editing.name || ''} onChange={e => set('name', e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-sm font-medium">Icon</label>
            <Input value={editing.icon || '💬'} onChange={e => set('icon', e.target.value)}
              className="mt-1 text-xl text-center" style={{fontSize:22}} />
          </div>
        </div>

        <div className="mb-4">
          <label className="text-sm font-medium">Description</label>
          <FieldHint>Short description shown in the NPC inspect card. 1–2 sentences.</FieldHint>
          <Input value={editing.description || ''} onChange={e => set('description', e.target.value)}
            placeholder="e.g. A weathered blacksmith who keeps to himself." className="mt-1" />
        </div>

        {/* Is Enemy toggle */}
        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={!!editing.is_enemy}
              onChange={e => { set('is_enemy', e.target.checked); setTab(e.target.checked ? 'combat' : 'dialogue') }}
              className="w-4 h-4" />
            <span className="flex items-center gap-1.5">
              <Skull className="w-4 h-4 text-red-400" />
              Is Enemy <span className="text-muted-foreground font-normal">(creates a combat character slot)</span>
            </span>
          </label>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-4">
          {[
            { id: 'dialogue', label: '💬 Dialogue & Behaviour' },
            { id: 'combat',   label: '⚔️ Combat Stats',        disabled: !editing.is_enemy },
          ].map(t => (
            <button key={t.id} onClick={() => !t.disabled && setTab(t.id as typeof tab)}
              disabled={!!t.disabled}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                t.disabled && 'opacity-30 cursor-not-allowed'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Dialogue tab */}
        {tab === 'dialogue' && (
          <div className="space-y-4">
            <Section title="🧠 AI Persona">
              <Help>
                Write this as if briefing an actor playing this character. Include: their name, personality,
                background, what they know, what secrets they keep, how they speak (formal? blunt? nervous?),
                what they want from the player, and what they dislike.<br/>
                <b>Example:</b> "You are Aoife, a nervous herbalist who suspects her apprentice is stealing.
                You speak in short sentences and avoid eye contact. You know every plant in the western forest
                but are hiding that you owe money to the merchant guild."
              </Help>
              <textarea value={editing.persona || ''}
                onChange={e => set('persona', e.target.value)}
                rows={6} placeholder="Describe this character's personality, knowledge, secrets, and speech style..."
                className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm resize-y" />
            </Section>

            <Section title="🚶 Movement & Presence">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Move Type</label>
                  <FieldHint>How the NPC moves on the map.</FieldHint>
                  <select value={editing.move_type || 'STATIONARY'} onChange={e => set('move_type', e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                    <option value="STATIONARY">🧍 Stationary — never moves (shopkeeper, quest giver)</option>
                    <option value="WANDER">🚶 Wander — roams freely within a radius</option>
                    <option value="PATROL">🔄 Patrol — follows a waypoint path</option>
                  </select>
                </div>
                {editing.move_type === 'WANDER' && (
                  <div>
                    <label className="text-sm font-medium">Wander Radius (tiles)</label>
                    <FieldHint>How far from spawn point they can roam.</FieldHint>
                    <Input type="number" value={editing.wander_radius ?? 3} min={1} max={20}
                      onChange={e => set('wander_radius', parseInt(e.target.value)||3)} className="mt-1" />
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">AI Mood</label>
                  <FieldHint>Sets how the NPC greets players.</FieldHint>
                  <select value={editing.ai_mood || 'neutral'} onChange={e => set('ai_mood', e.target.value)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                    {['neutral','happy','fearful','angry','grieving','excited','suspicious'].map(m => (
                      <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>
            </Section>

            <Section title="📍 Map Placement">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">Map ID</label>
                  <FieldHint>Which map this NPC lives on.</FieldHint>
                  <Input type="number" value={editing.map_id ?? 0} onChange={e => set('map_id', parseInt(e.target.value)||0)} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">X</label>
                  <FieldHint>Starting tile X.</FieldHint>
                  <Input type="number" value={editing.x ?? 5} onChange={e => set('x', parseInt(e.target.value)||0)} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Y</label>
                  <FieldHint>Starting tile Y.</FieldHint>
                  <Input type="number" value={editing.y ?? 5} onChange={e => set('y', parseInt(e.target.value)||0)} className="mt-1" />
                </div>
              </div>
            </Section>

            <Section title="🏪 Shop & Quests">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Shop</label>
                  <FieldHint>If set, players can buy from this NPC.</FieldHint>
                  <select value={editing.shop_id || ''} onChange={e => set('shop_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm">
                    <option value="">— No shop —</option>
                    {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Quest Offers (JSON)</label>
                <FieldHint>Array of quest IDs this NPC can give. e.g. ["missing_caravan_01","wolf_hunt"]</FieldHint>
                <textarea value={editing.quest_offers_json || '[]'}
                  onChange={e => set('quest_offers_json', e.target.value)}
                  rows={2} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-none" />
              </div>
            </Section>
          </div>
        )}

        {/* Combat tab */}
        {tab === 'combat' && (
          <div className="space-y-4">
            <Help>
              These stats are used when this enemy appears in battle. Set them to match the difficulty
              you want for the level range where this enemy appears.
              After saving, check the NPC list — the Combat Slot column should show a green ✔.
              If it shows red ⚠, delete and recreate the NPC.
            </Help>

            <Section title="⚔️ Core Combat Stats">
              <div className="grid grid-cols-3 gap-3">
                {[
                  ['level', 'Level', 1],
                  ['hp', '❤️ Max HP', 100],
                  ['mp', '💙 Max MP', 50],
                  ['atk', '⚔️ ATK', 10],
                  ['def', '🛡️ DEF', 5],
                  ['mo', '🔮 MO (Mag.Atk)', 5],
                  ['md', '💨 MD (Mag.Def)', 5],
                  ['speed', '⚡ Speed', 5],
                  ['luck', '🍀 Luck', 3],
                ].map(([k, label, def]) => (
                  <div key={String(k)}>
                    <label className="text-xs font-medium">{String(label)}</label>
                    <Input type="number" value={(editing as Record<string,unknown>)[String(k)] as number ?? Number(def)}
                      onChange={e => set(String(k), parseInt(e.target.value)||0)}
                      className="mt-1 h-8 text-sm" />
                  </div>
                ))}
              </div>
            </Section>

            <Section title="🏆 Rewards">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">EXP Reward</label>
                  <FieldHint>XP given to the player who defeats this enemy.</FieldHint>
                  <Input type="number" value={editing.exp_reward ?? 20} min={0}
                    onChange={e => set('exp_reward', parseInt(e.target.value)||0)} className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Gold Reward</label>
                  <FieldHint>Gold dropped when defeated.</FieldHint>
                  <Input type="number" value={editing.gold_reward ?? 10} min={0}
                    onChange={e => set('gold_reward', parseInt(e.target.value)||0)} className="mt-1" />
                </div>
              </div>
            </Section>

            <Section title="🎁 Loot Table">
              <Help>
                JSON array defining item drops. Use the <b>Loot Table Editor</b> for a visual editor.
                Format: <code className="text-green-400">[{`{"item_id":1,"weight":50,"min_qty":1,"max_qty":1}`}]</code>
                Weight is relative (higher = more common). Leave as [] for no drops.
              </Help>
              <textarea value={editing.drop_table_json || '[]'}
                onChange={e => set('drop_table_json', e.target.value)}
                rows={4} className="w-full px-3 py-2 bg-input border border-border rounded-md text-xs font-mono resize-y" />
            </Section>
          </div>
        )}
      </div>
    )
  }

  // ── List view ──────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">👹 NPCs & Enemies</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dialogues.length} dialogue NPC{dialogues.length !== 1 ? 's' : ''} · {enemies.length} enem{enemies.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <Button onClick={() => { setEditing({ ...BLANK }); setTab('dialogue') }}>
          <Plus className="w-4 h-4 mr-1" /> New NPC
        </Button>
      </div>

      <Help>
        <b>Dialogue NPCs</b> (💬) talk to players, give quests, and run shops.
        <b> Enemies</b> (⚔️) appear in battles through spawn zones and map BATTLE events.
        A green ✔ in Combat Slot means the enemy is battle-ready. Red ⚠ = delete and recreate.
      </Help>

      <div className="relative mb-4 max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search NPCs..." className="pl-9" />
      </div>

      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-6">
          {/* Enemies */}
          {enemies.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2 flex items-center gap-2">
                <Skull className="w-3.5 h-3.5" /> Enemies ({enemies.length})
              </h3>
              <div className="space-y-1.5">
                {enemies.map(n => (
                  <div key={n.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <span className="text-xl w-8 text-center">{n.icon || '👹'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{n.name}</span>
                        {n.char_id
                          ? <Badge className="text-[10px] py-0 bg-green-900/50 text-green-400">✔ Combat #{n.char_id}</Badge>
                          : <Badge variant="destructive" className="text-[10px] py-0">⚠ No combat slot</Badge>
                        }
                        {n.level && <span className="text-xs text-muted-foreground">Lv{n.level}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{n.description}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing({...n}); setTab('combat') }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(n.id, n.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dialogue NPCs */}
          {dialogues.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 mb-2 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5" /> Dialogue NPCs ({dialogues.length})
              </h3>
              <div className="space-y-1.5">
                {dialogues.map(n => (
                  <div key={n.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                    <span className="text-xl w-8 text-center">{n.icon || '💬'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{n.name}</span>
                        {n.shop_id && <Badge variant="outline" className="text-[10px] py-0">🏪 Shop</Badge>}
                        {n.move_type && n.move_type !== 'STATIONARY' && (
                          <Badge variant="outline" className="text-[10px] py-0">{n.move_type}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {n.persona ? n.persona.slice(0, 80) + (n.persona.length > 80 ? '…' : '') : 'No persona set'}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing({...n}); setTab('dialogue') }}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(n.id, n.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {search ? 'No NPCs match your search.' : 'No NPCs yet. Click New NPC to create one.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
