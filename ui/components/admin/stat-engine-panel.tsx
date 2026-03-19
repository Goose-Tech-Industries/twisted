"use client"

import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Info, Lock, Trash2, Plus, AlertTriangle } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface StatDef {
  id?: number
  key_name: string
  display_name: string
  name?: string
  description: string
  icon: string
  type: 'CORE' | 'HIDDEN' | 'META'
  default_value: number
  min_value: number
  max_value: number
}

const LOCKED = new Set([
  'hp','mp','atk','def','mo','md','speed','luck',
  'strength','intelligence','dexterity'
])

const TYPE_COLORS: Record<string, string> = {
  CORE:   'bg-green-900/40 text-green-400 border-green-800',
  HIDDEN: 'bg-zinc-800/60 text-zinc-400 border-zinc-700',
  META:   'bg-blue-900/40 text-blue-400 border-blue-800',
}

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}

export function StatEnginePanel() {
  const [stats, setStats] = useState<StatDef[]>([])
  const [loading, setLoading] = useState(true)

  // New stat form
  const [newKey, setNewKey] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('📊')
  const [newType, setNewType] = useState<'CORE'|'HIDDEN'|'META'>('CORE')
  const [newDefault, setNewDefault] = useState(0)
  const [newMin, setNewMin] = useState(0)
  const [newMax, setNewMax] = useState(9999)
  const [keyError, setKeyError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.entity.getAll('stat')
    setStats((r.data || []) as StatDef[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    const key = newKey.trim().toLowerCase().replace(/\s+/g,'_')
    if (!key) { setKeyError('Key is required'); return }
    if (!newName.trim()) { setKeyError('Display name is required'); return }
    if (!/^[a-z][a-z0-9_]*$/.test(key)) { setKeyError('Lowercase letters, numbers, and underscores only. No spaces.'); return }
    if (stats.find(s => s.key_name === key)) { setKeyError(`Stat "${key}" already exists.`); return }
    setKeyError('')
    await adminApi.entity.save('stat', {
      key_name: key, display_name: newName.trim(), name: newName.trim(),
      description: newDesc.trim(), icon: newIcon.trim() || '📊',
      type: newType, default_value: newDefault, min_value: newMin, max_value: newMax
    } as Record<string,unknown>)
    setNewKey(''); setNewName(''); setNewDesc(''); setNewIcon('📊'); setNewDefault(0)
    load()
  }

  const rename = async (key: string, newDisplayName: string) => {
    if (!newDisplayName.trim()) return
    const stat = stats.find(s => s.key_name === key)
    if (stat?.id) {
      await adminApi.entity.save('stat', { display_name: newDisplayName.trim(), name: newDisplayName.trim() } as Record<string,unknown>, stat.id)
    }
    setStats(prev => prev.map(s => s.key_name === key ? { ...s, display_name: newDisplayName, name: newDisplayName } : s))
  }

  const setType = async (statId: number | undefined, key: string, type: string) => {
    if (statId) await adminApi.entity.save('stat', { type } as Record<string,unknown>, statId)
    else {
      const stat = stats.find(s => s.key_name === key)
      if (stat?.id) await adminApi.entity.save('stat', { type } as Record<string,unknown>, stat.id)
    }
    setStats(prev => prev.map(s => s.key_name === key ? { ...s, type: type as 'CORE'|'HIDDEN'|'META' } : s))
  }

  const del = async (key: string, id?: number) => {
    if (LOCKED.has(key)) { toast({ title: 'This stat is locked — it powers core game systems.', variant: 'destructive' }); return }
    if (!confirm(`Delete stat "${key}"? This removes the definition but existing character values are kept.`)) return
    const statId = id || stats.find(s => s.key_name === key)?.id
    if (statId) await adminApi.entity.delete('stat', statId)
    setStats(prev => prev.filter(s => s.key_name !== key))
    toast({ title: `Stat "${key}" deleted` })
  }

  const cores   = stats.filter(s => (s.type || 'CORE') === 'CORE')
  const hidden  = stats.filter(s => s.type === 'HIDDEN')
  const meta    = stats.filter(s => s.type === 'META')

  return (
    <div className="p-6">
      <div className="mb-4">
        <h2 className="text-xl font-bold">📊 Stat Engine</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{stats.length} stats defined</p>
      </div>

      <div className="flex gap-6 items-start flex-col lg:flex-row">

        {/* ── Left: Add new stat ── */}
        <div className="w-full lg:w-72 shrink-0 p-4 bg-card border border-border rounded-lg">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-3">➕ Define New Stat</h3>
          <Help>
            New stats apply to characters created <i>after</i> this point. Existing characters won't have this stat.
            To backfill, run: <code className="text-green-400 text-[10px]">INSERT INTO character_stats SELECT id,'key',0,0 FROM characters</code>
          </Help>
          <div className="space-y-2">
            <div>
              <label className="text-xs font-medium">System Key <span className="text-muted-foreground font-normal">(lowercase, no spaces)</span></label>
              <Input value={newKey} onChange={e => { setNewKey(e.target.value); setKeyError('') }}
                placeholder="e.g. sanity" className="mt-1 h-8 text-xs font-mono" />
              {keyError && <p className="text-xs text-destructive mt-0.5">{keyError}</p>}
            </div>
            <div>
              <label className="text-xs font-medium">Display Name <span className="text-muted-foreground font-normal">(what players see)</span></label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sanity" className="mt-1 h-8 text-xs" />
            </div>
            <div>
              <label className="text-xs font-medium">Description</label>
              <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="e.g. Mental resilience" className="mt-1 h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium">Icon</label>
                <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} className="mt-1 h-8 text-xl text-center" style={{fontSize:18}} />
              </div>
              <div>
                <label className="text-xs font-medium">Visibility</label>
                <select value={newType} onChange={e => setNewType(e.target.value as 'CORE'|'HIDDEN'|'META')}
                  className="mt-1 w-full px-2 py-1.5 bg-input border border-border rounded text-xs">
                  <option value="CORE">CORE — On character sheet</option>
                  <option value="HIDDEN">HIDDEN — Backend only</option>
                  <option value="META">META — Rep/currency</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['Default', newDefault, setNewDefault], ['Min', newMin, setNewMin], ['Max', newMax, setNewMax]].map(([label, val, setter]) => (
                <div key={String(label)}>
                  <label className="text-xs font-medium">{String(label)}</label>
                  <Input type="number" value={Number(val)} onChange={e => (setter as (v:number)=>void)(parseInt(e.target.value)||0)}
                    className="mt-1 h-8 text-xs" />
                </div>
              ))}
            </div>
            <Button onClick={create} className="w-full mt-1" size="sm"><Plus className="w-3.5 h-3.5 mr-1" />Add to Engine</Button>
          </div>
        </div>

        {/* ── Right: Stat table ── */}
        <div className="flex-1 min-w-0 space-y-6">
          {[
            { label: '🟢 CORE — Visible on character sheet', stats: cores, colorClass: 'text-green-400' },
            { label: '⚫ HIDDEN — Backend calculations only', stats: hidden, colorClass: 'text-zinc-400' },
            { label: '🔵 META — Reputation / tracking stats', stats: meta, colorClass: 'text-blue-400' },
          ].map(({ label, stats: group, colorClass }) => group.length > 0 && (
            <div key={label}>
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${colorClass}`}>{label}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {['Icon','Key','Display Name','Visibility','Default','Min','Max',''].map(h => (
                        <th key={h} className="text-left pb-2 text-muted-foreground font-medium pr-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.map(s => {
                      const locked = LOCKED.has(s.key_name)
                      const displayName = s.display_name || s.name || s.key_name
                      return (
                        <tr key={s.key_name} className="border-b border-border/50 last:border-0">
                          <td className="py-2 pr-3 text-base">{s.icon || '📊'}</td>
                          <td className="py-2 pr-3">
                            <code className="text-muted-foreground">{s.key_name}</code>
                            {locked && <Lock className="w-3 h-3 inline ml-1 text-muted-foreground/50" />}
                          </td>
                          <td className="py-2 pr-3">
                            <Input defaultValue={displayName} onBlur={e => rename(s.key_name, e.target.value)}
                              className="h-7 w-32 text-xs bg-transparent border-transparent hover:border-border focus:border-border" />
                          </td>
                          <td className="py-2 pr-3">
                            <select value={s.type || 'CORE'} onChange={e => setType(s.id, s.key_name, e.target.value)}
                              className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${TYPE_COLORS[s.type||'CORE']}`}>
                              <option value="CORE">CORE</option>
                              <option value="HIDDEN">HIDDEN</option>
                              <option value="META">META</option>
                            </select>
                          </td>
                          <td className="py-2 pr-3 text-muted-foreground font-mono">{s.default_value ?? 0}</td>
                          <td className="py-2 pr-3 text-muted-foreground font-mono">{s.min_value ?? 0}</td>
                          <td className="py-2 pr-3 text-muted-foreground font-mono">{s.max_value ?? 9999}</td>
                          <td className="py-2">
                            {locked
                              ? <span className="text-muted-foreground/40 text-[10px] flex items-center gap-0.5"><Lock className="w-3 h-3" />LOCKED</span>
                              : <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => del(s.key_name, s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {stats.length === 0 && !loading && (
            <p className="text-center text-muted-foreground py-8">No stats defined yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
