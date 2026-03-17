"use client"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, ChevronLeft, Info, Play } from "lucide-react"

interface Task {
  id: number; name: string; task_type: string; schedule_type: string
  run_at_hour: number; run_at_day: number; interval_minutes: number
  target_id: number | null; is_enabled: boolean | number
  last_run_at: string | null; config_json: string
}
type TaskCfg = Record<string, unknown>

const TASK_TYPES: string[] = ['SHOP_RESTOCK', 'SPAWN_RESPAWN', 'DUNGEON_RESET', 'SET_WORLD_FLAG', 'SET_REGION_STATE', 'GIVE_XP_ALL', 'BROADCAST']
const SCHED_TYPES: string[] = ['DAILY', 'HOURLY', 'WEEKLY', 'INTERVAL_MINUTES']
const TASK_ICONS: Record<string, string> = {
  SHOP_RESTOCK: '🏪', SPAWN_RESPAWN: '👹', DUNGEON_RESET: '🏚️',
  SET_WORLD_FLAG: '🌍', GIVE_XP_ALL: '🌟', BROADCAST: '📣', SET_REGION_STATE: '🗺️',
}
const TASK_DESC: Record<string, string> = {
  SHOP_RESTOCK:     'Resets limited-stock items in shops back to their restock quantity.',
  SPAWN_RESPAWN:    'Marks all dead enemy NPCs as alive again.',
  DUNGEON_RESET:    'Boots all players off the target map and respawns all enemies.',
  SET_WORLD_FLAG:   'Sets a global world flag that affects dialogue, spawns, and shop prices.',
  SET_REGION_STATE: 'Directly updates region modifiers: danger, weather, multipliers.',
  GIVE_XP_ALL:      'Grants XP to every currently online player.',
  BROADCAST:        'Sends a colored message to every player on the server.',
}
const REGION_CFG_FIELDS: [string, string][] = [
  ['danger_level', 'Danger (1-5)'], ['corruption_level', 'Corruption (0-5)'],
  ['xp_mult', 'XP Mult'], ['gold_mult', 'Gold Mult'],
  ['loot_mult', 'Loot Mult'], ['spawn_rate_mult', 'Spawn Mult'],
]

function schedLabel(t: Task): string {
  if (t.schedule_type === 'INTERVAL_MINUTES') return `Every ${t.interval_minutes} min`
  if (t.schedule_type === 'HOURLY')           return 'Hourly'
  if (t.schedule_type === 'DAILY')            return `Daily at ${String(t.run_at_hour || 0).padStart(2, '0')}:00 UTC`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `${days[t.run_at_day || 1]} at ${String(t.run_at_hour || 0).padStart(2, '0')}:00 UTC`
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /><div>{children}</div>
    </div>
  )
}

export function SchedulerPanel() {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<Task> | null>(null)
  const [cfg,     setCfg]     = useState<TaskCfg>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.entity.getAll('scheduled_task')
    setTasks((r.data || []) as Task[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openEdit = (t?: Task) => {
    setEditing({ ...(t || { name: '', task_type: 'SHOP_RESTOCK', schedule_type: 'DAILY', run_at_hour: 0, run_at_day: 1, interval_minutes: 60, target_id: null, is_enabled: 1, config_json: '{}' }) })
    try { setCfg(JSON.parse(t?.config_json || '{}') as TaskCfg) } catch { setCfg({}) }
  }

  const save = async () => {
    if (!editing?.name?.trim()) { alert('Name required'); return }
    const payload = { ...editing, config_json: JSON.stringify(cfg) }
    const res = await adminApi.entity.save('scheduled_task', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else alert(String(res.message || 'Save failed'))
  }

  const del = async (id: number) => {
    if (!confirm('Delete this task?')) return
    await adminApi.entity.delete('scheduled_task', id); load()
  }

  const runNow = async (id: number) => {
    const r = await fetch('/scheduler/run-now', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: id }) })
    const d: Record<string, unknown> = await r.json()
    alert(d.success ? `✅ ${d.message || 'Task ran'}` : `❌ ${d.message}`)
    load()
  }

  const setField = (k: keyof Task, v: unknown) =>
    setEditing((prev: Partial<Task> | null) => ({ ...prev, [k]: v }))

  const setCfgField = (k: string, v: unknown) =>
    setCfg((prev: TaskCfg) => ({ ...prev, [k]: v }))

  const d = editing as Record<string, unknown> | null

  if (editing !== null && d) {
    const taskType  = String(d.task_type  || 'SHOP_RESTOCK')
    const schedType = String(d.schedule_type || 'DAILY')
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '+ New Task'}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
        <Help>All times are <b>UTC</b>. Set target_id to scope a SHOP_RESTOCK or DUNGEON_RESET to one shop/map. Leave 0 for all.</Help>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Task Name</label>
              <Input value={String(d.name || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('name', e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Task Type</label>
              <select value={taskType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('task_type', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                {TASK_TYPES.map((t: string) => <option key={t} value={t}>{TASK_ICONS[t] || '⚙️'} {t}</option>)}
              </select>
            </div>
          </div>
          {TASK_DESC[taskType] && <p className="text-xs text-muted-foreground p-3 bg-secondary/30 rounded">{TASK_DESC[taskType]}</p>}
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-sm font-medium">Schedule</label>
              <select value={schedType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('schedule_type', e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                {SCHED_TYPES.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {(schedType === 'DAILY' || schedType === 'WEEKLY') && (
              <div>
                <label className="text-sm font-medium">Hour (0-23 UTC)</label>
                <Input type="number" min={0} max={23} value={Number(d.run_at_hour) || 0}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('run_at_hour', parseInt(e.target.value) || 0)} className="mt-1" />
              </div>
            )}
            {schedType === 'WEEKLY' && (
              <div>
                <label className="text-sm font-medium">Day (0=Sun)</label>
                <Input type="number" min={0} max={6} value={Number(d.run_at_day) || 1}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('run_at_day', parseInt(e.target.value) || 1)} className="mt-1" />
              </div>
            )}
            {schedType === 'INTERVAL_MINUTES' && (
              <div>
                <label className="text-sm font-medium">Every N minutes</label>
                <Input type="number" min={1} value={Number(d.interval_minutes) || 60}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('interval_minutes', parseInt(e.target.value) || 60)} className="mt-1" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Enabled</label>
              <select value={String(d.is_enabled || 1)} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setField('is_enabled', parseInt(e.target.value))}
                className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm">
                <option value="1">✅ Yes</option><option value="0">⛔ No</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Target ID <span className="text-muted-foreground font-normal">(shop_id or map_id — 0 for ALL)</span></label>
            <Input type="number" value={Number(d.target_id) || 0}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('target_id', parseInt(e.target.value) || null)}
              className="mt-1 w-32" />
          </div>

          <div className="p-4 bg-card border border-border rounded-lg space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">⚙️ Config</h3>
            {taskType === 'SET_WORLD_FLAG' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Flag Key</label>
                  <Input value={String(cfg.flag || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField('flag', e.target.value)}
                    placeholder="e.g. blood_moon_active" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">Value</label>
                  <Input value={String(cfg.value ?? 'true')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField('value', e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
            {taskType === 'GIVE_XP_ALL' && (
              <div>
                <label className="text-sm font-medium">XP Amount</label>
                <Input type="number" value={Number(cfg.amount) || 100}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField('amount', parseInt(e.target.value) || 100)}
                  className="mt-1 w-32" />
              </div>
            )}
            {taskType === 'BROADCAST' && (
              <div className="space-y-2">
                <div>
                  <label className="text-sm font-medium">Message</label>
                  <Input value={String(cfg.message || '')} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField('message', e.target.value)} className="mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">Color</label>
                  <input type="color" value={String(cfg.color || '#bb86fc')}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField('color', e.target.value)}
                    className="w-10 h-8 rounded border-0 cursor-pointer bg-transparent p-0" />
                  <span className="text-xs font-mono">{String(cfg.color || '#bb86fc')}</span>
                </div>
              </div>
            )}
            {taskType === 'SET_REGION_STATE' && (
              <div className="grid grid-cols-3 gap-2">
                {REGION_CFG_FIELDS.map(([k, l]: [string, string]) => (
                  <div key={k}>
                    <label className="text-xs text-muted-foreground">{l}</label>
                    <Input type="number" step={0.1} value={Number(cfg[k]) || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCfgField(k, parseFloat(e.target.value) || undefined)}
                      placeholder="—" className="mt-0.5 h-8 text-xs" />
                  </div>
                ))}
              </div>
            )}
            {!['SET_WORLD_FLAG', 'GIVE_XP_ALL', 'BROADCAST', 'SET_REGION_STATE'].includes(taskType) && (
              <p className="text-xs text-muted-foreground">No extra config needed. Use Target ID to scope to a specific map or shop.</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🕐 Scheduled Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Task</Button>
      </div>
      <Help>Scheduled tasks run automatically on the server. All times are <b>UTC</b>. Click ▶ RUN to trigger a task immediately for testing.</Help>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {tasks.length === 0 && <div className="text-center py-12 text-muted-foreground">No tasks yet.</div>}
          {tasks.map((t: Task) => (
            <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
              <span className="text-xl">{TASK_ICONS[t.task_type] || '⚙️'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{t.name}</span>
                  <Badge variant="outline" className="text-[10px] py-0">{t.task_type}</Badge>
                  <Badge className={t.is_enabled ? 'bg-green-900/50 text-green-400' : 'bg-secondary text-muted-foreground'} variant="outline">
                    {t.is_enabled ? '✅ ON' : '⛔ OFF'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {schedLabel(t)} · Last: {t.last_run_at ? new Date(t.last_run_at).toLocaleString() : 'Never'}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => runNow(t.id)} className="h-7 text-xs">
                  <Play className="w-3 h-3 mr-1" />Run
                </Button>
                <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(t.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
