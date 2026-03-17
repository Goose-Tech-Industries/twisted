"use client"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react"

interface Achievement {
  id: number; key_name: string; title: string; description: string; icon: string
  category: string; trigger_type: string; trigger_value: number
  reward_gold: number; reward_title: string | null
  is_active: boolean | number; is_hidden: boolean | number; sort_order: number
}

const TRIGGERS: Record<string, string> = {
  pvp_wins:      '⚔️ PvP Wins',
  pve_wins:      '👹 PvE Wins',
  quests_done:   '📜 Quests Completed',
  maps_visited:  '🗺️ Maps Discovered',
  level_reached: '📈 Level Reached',
  login_streak:  '📅 Login Streak (Days)',
  gold_owned:    '💰 Gold Accumulated',
  battles_total: '⚔️ Total Battles',
  manual:        '🔧 Manual (Admin Only)',
}
const CATS: Record<string, string> = {
  combat:      '⚔️ Combat',
  exploration: '🗺️ Exploration',
  progression: '📈 Progression',
  social:      '👥 Social',
  other:       '⭐ Other',
}

type AchievementField = Partial<Achievement>

async function apiReq(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return r.json()
}

export function AchievementPanel() {
  const [defs,    setDefs]    = useState<Achievement[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<AchievementField | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const d = await apiReq('/api/achievements/definitions')
    setDefs(d.success ? (d.data || []) as Achievement[] : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openEdit = (a?: Achievement) =>
    setEditing(a ? { ...a } : {
      key_name: '', title: '', description: '', icon: '🏆',
      category: 'combat', trigger_type: 'pvp_wins', trigger_value: 1,
      reward_gold: 0, reward_title: null, is_active: 1, is_hidden: 0, sort_order: 0,
    })

  const save = async () => {
    if (!editing?.key_name?.trim() || !editing?.title?.trim()) {
      alert('Key name and title required'); return
    }
    const body = {
      ...editing,
      key_name: editing.key_name!.trim().replace(/\s+/g, '_').toLowerCase(),
      is_active: editing.is_active ? 1 : 0,
      is_hidden: editing.is_hidden ? 1 : 0,
    }
    const d = await apiReq('/api/achievements/save', body)
    if (d.success) { load(); setEditing(null) }
    else alert('Error: ' + String(d.message || 'Unknown'))
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? Players who earned it keep their record.`)) return
    const d = await apiReq('/api/achievements/delete', { id })
    if (d.success) load()
    else alert('Error: ' + String(d.message))
  }

  const setField = (k: keyof Achievement, v: unknown) =>
    setEditing((prev: AchievementField | null) => ({ ...prev, [k]: v }))

  const d = editing as Record<string, unknown> | null

  // Group by category
  const groups: Record<string, Achievement[]> = {}
  for (const def of defs) {
    if (!groups[def.category]) groups[def.category] = []
    groups[def.category].push(def)
  }

  if (editing !== null && d) return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-bold">{editing.id ? '✏️ Edit Achievement' : '+ New Achievement'}</h2>
        </div>
        <div className="flex gap-2">
          <Button onClick={save}>💾 Save</Button>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">
              Key Name <span className="text-muted-foreground font-normal text-xs">(unique ID, no spaces)</span>
            </label>
            <Input
              value={String(d.key_name || '')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('key_name', e.target.value)}
              placeholder="e.g. first_blood"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Icon (emoji)</label>
            <Input
              value={String(d.icon || '🏆')}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('icon', e.target.value)}
              className="mt-1 text-center text-xl"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">Title</label>
          <Input
            value={String(d.title || '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('title', e.target.value)}
            placeholder="Achievement display name"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Description</label>
          <Input
            value={String(d.description || '')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('description', e.target.value)}
            placeholder="What must the player do?"
            className="mt-1"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Category</label>
            <select
              value={String(d.category || 'combat')}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('category', e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm"
            >
              {Object.entries(CATS).map(([k, l]: [string, string]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Sort Order</label>
            <Input
              type="number" min={0}
              value={Number(d.sort_order) || 0}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('sort_order', parseInt(e.target.value) || 0)}
              className="mt-1"
            />
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">🎯 Trigger</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Event</label>
              <select
                value={String(d.trigger_type || 'pvp_wins')}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('trigger_type', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm"
              >
                {Object.entries(TRIGGERS).map(([k, l]: [string, string]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                Threshold <span className="text-muted-foreground font-normal text-xs">(e.g. 100 wins)</span>
              </label>
              <Input
                type="number" min={1}
                value={Number(d.trigger_value) || 1}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('trigger_value', parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">🎁 Reward</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Gold Reward</label>
              <Input
                type="number" min={0}
                value={Number(d.reward_gold) || 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('reward_gold', parseInt(e.target.value) || 0)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">
                Title Unlocked <span className="text-muted-foreground font-normal text-xs">(blank = none)</span>
              </label>
              <Input
                value={String(d.reward_title || '')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('reward_title', e.target.value || null)}
                placeholder="e.g. Centurion"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-6 flex-wrap">
          {([['is_active', '✅ Active (earnable)'], ['is_hidden', '🔒 Hidden (shows as ???)']] as [keyof Achievement, string][]).map(
            ([k, l]: [keyof Achievement, string]) => (
              <label key={k} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={!!d[k]}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField(k, e.target.checked)}
                  className="w-4 h-4"
                />
                {l}
              </label>
            )
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🎖️ Achievements</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{defs.length} defined</p>
        </div>
        <Button onClick={() => openEdit()}>
          <Plus className="w-4 h-4 mr-1" />New Achievement
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : defs.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          No achievements yet. Click New Achievement to add your first one.
        </div>
      ) : (
        Object.entries(groups).map(([cat, catDefs]: [string, Achievement[]]) => (
          <div key={cat} className="mb-6">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground pb-2 border-b border-border mb-3">
              {CATS[cat] || cat}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {['', 'Achievement', 'Trigger', 'Threshold', 'Reward', 'Title', 'Status', ''].map((h: string) => (
                      <th key={h} className="text-left pb-1.5 text-xs text-muted-foreground font-medium pr-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {catDefs.map((a: Achievement) => (
                    <tr key={a.id} className={`border-b border-border/50 last:border-0 ${a.is_active ? '' : 'opacity-50'}`}>
                      <td className="py-2 pr-2 text-lg">{a.icon || '🏆'}</td>
                      <td className="py-2 pr-3">
                        <b>{a.title}</b>
                        {a.is_hidden && <Badge variant="outline" className="ml-1 text-[9px] py-0">HIDDEN</Badge>}
                        <div className="text-[10px] text-muted-foreground">{a.description}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {TRIGGERS[a.trigger_type] || a.trigger_type}
                      </td>
                      <td className="py-2 pr-3 font-bold text-purple-400">{a.trigger_value}</td>
                      <td className="py-2 pr-3 text-yellow-500 text-xs">{a.reward_gold ? `${a.reward_gold}g` : '—'}</td>
                      <td className="py-2 pr-3 text-cyan-400 text-xs">{a.reward_title ? `[${a.reward_title}]` : '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          className={a.is_active ? 'bg-green-900/50 text-green-400' : 'bg-secondary text-muted-foreground'}
                          variant="outline"
                        >
                          {a.is_active ? '✅ Active' : '⛔ Off'}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(a.id, a.title)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
