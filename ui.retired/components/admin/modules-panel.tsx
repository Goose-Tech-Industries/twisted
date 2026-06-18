"use client"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RefreshCw, Plus, Trash2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface Module {
  module_key: string; name: string
  description: string | null; enabled: boolean | number; config_json: string | null
}

const MODULE_ICONS: Record<string, string> = {
  guilds: '🏰', parties: '⚔️', trade: '🤝', pvp: '⚔️', quests: '📜',
  artifacts: '💎', world_map: '🗺️', achievements: '🏆', auction: '🏛️',
  crafting: '🔨', referrals: '🔗',
}

async function api(endpoint: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(endpoint, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return r.json()
}

export function ModulesPanel() {
  const [modules, setModules] = useState<Module[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<Set<string>>(new Set())
  const [showNew, setShowNew] = useState(false)
  const [newKey,  setNewKey]  = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const d = await api('/admin/get-modules')
    setModules(d.success ? (d.data || []) as Module[] : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = async (mod: Module) => {
    const key = mod.module_key
    setSaving((prev: Set<string>) => new Set([...prev, key]))
    const newEnabled = mod.enabled ? 0 : 1
    setModules((prev: Module[]) => prev.map((m: Module) =>
      m.module_key === key ? { ...m, enabled: newEnabled } : m
    ))
    const res = await api('/admin/save-module', {
      key, data: { name: mod.name, description: mod.description, enabled: newEnabled },
    })
    if (!res.success) {
      setModules((prev: Module[]) => prev.map((m: Module) =>
        m.module_key === key ? { ...m, enabled: mod.enabled } : m
      ))
      toast({ title: String(res.message || 'Save failed'), variant: 'destructive' })
    }
    setSaving((prev: Set<string>) => { const n = new Set(prev); n.delete(key); return n })
  }

  const saveConfig = async (mod: Module, configJson: string) => {
    const key = mod.module_key
    setSaving((prev: Set<string>) => new Set([...prev, key]))
    try { JSON.parse(configJson) } catch {
      toast({ title: 'Invalid JSON', variant: 'destructive' })
      setSaving((prev: Set<string>) => { const n = new Set(prev); n.delete(key); return n })
      return
    }
    const res = await api('/admin/save-module', {
      key,
      data: { name: mod.name, description: mod.description, enabled: mod.enabled, config_json: configJson },
    })
    if (!res.success) toast({ title: String(res.message || 'Failed'), variant: 'destructive' })
    setSaving((prev: Set<string>) => { const n = new Set(prev); n.delete(key); return n })
  }

  const del = async (key: string, name: string) => {
    if (!confirm(`Delete module "${name}"? This cannot be undone.`)) return
    const res = await api('/admin/delete-module', { key })
    if (res.success) load()
    else toast({ title: String(res.message || 'Delete failed'), variant: 'destructive' })
  }

  const createNew = async () => {
    if (!newKey.trim() || !newName.trim()) { toast({ title: 'Key and name are required', variant: 'destructive' }); return }
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_')
    const res = await api('/admin/save-module', {
      key, data: { name: newName.trim(), description: newDesc.trim() || null, enabled: 1 },
    })
    if (res.success) {
      setShowNew(false); setNewKey(''); setNewName(''); setNewDesc('')
      load()
    } else toast({ title: String(res.message || 'Failed'), variant: 'destructive' })
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🔧 Modules</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Feature toggles — enable or disable major systems without touching code.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNew((p: boolean) => !p)}>
            <Plus className="w-3.5 h-3.5 mr-1" />New Module
          </Button>
        </div>
      </div>

      <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
        <div>
          Toggling a module tells the game server whether that feature is active.
          The server checks <code className="text-blue-200">core_modules.enabled</code> at startup.{' '}
          <b>Restart the server</b> after changing modules for changes to take full effect.
        </div>
      </div>

      {showNew && (
        <div className="p-4 bg-card border border-border rounded-lg mb-4 space-y-3">
          <h3 className="text-sm font-bold">New Module</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground font-medium">
                Key <span className="text-muted-foreground/60">(snake_case, permanent)</span>
              </label>
              <Input
                value={newKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewKey(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="e.g. leaderboards"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground font-medium">Display Name</label>
              <Input
                value={newName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                placeholder="e.g. Leaderboards"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground font-medium">Description</label>
            <Input
              value={newDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
              placeholder="What does this module do?"
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button size="sm" onClick={createNew}>Create Module</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : modules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No modules found. The <code>core_modules</code> table may be empty — run your schema migration first.
        </div>
      ) : (
        <div className="space-y-2">
          {modules.map((mod: Module) => {
            const icon = MODULE_ICONS[mod.module_key] || '⚙️'
            const isEnabled = !!mod.enabled
            const isSaving = saving.has(mod.module_key)
            let cfg = ''
            try {
              cfg = mod.config_json ? JSON.stringify(JSON.parse(mod.config_json), null, 2) : ''
            } catch { cfg = mod.config_json || '' }

            return (
              <div
                key={mod.module_key}
                className={cn(
                  'p-4 rounded-lg border transition-colors',
                  isEnabled ? 'bg-card border-border' : 'bg-secondary/20 border-border/50 opacity-60'
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl shrink-0">{icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('font-semibold text-sm', isEnabled ? 'text-foreground' : 'text-muted-foreground')}>
                        {mod.name}
                      </span>
                      <code className="text-[10px] text-muted-foreground/60 font-mono bg-secondary px-1 py-0.5 rounded">
                        {mod.module_key}
                      </code>
                    </div>
                    {mod.description && <p className="text-xs text-muted-foreground mt-0.5">{mod.description}</p>}
                  </div>

                  <button
                    onClick={() => !isSaving && toggle(mod)}
                    disabled={isSaving}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
                      isEnabled ? 'bg-primary' : 'bg-secondary',
                      isSaving && 'opacity-50 cursor-wait'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    )} />
                  </button>

                  <span className={cn('text-xs font-medium w-12 text-center', isEnabled ? 'text-green-400' : 'text-muted-foreground')}>
                    {isSaving ? '…' : isEnabled ? 'ON' : 'OFF'}
                  </span>

                  <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0"
                    onClick={() => del(mod.module_key, mod.name)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {cfg && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium block mb-1">
                      Config JSON
                    </label>
                    <textarea
                      defaultValue={cfg}
                      onBlur={(e: React.FocusEvent<HTMLTextAreaElement>) => {
                        if (e.target.value !== cfg) saveConfig(mod, e.target.value)
                      }}
                      rows={3}
                      className="w-full px-2 py-1.5 bg-input border border-border rounded text-xs font-mono resize-none"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
