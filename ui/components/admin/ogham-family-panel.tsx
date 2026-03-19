"use client"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Pencil, Trash2, ChevronLeft, Info } from "lucide-react"

interface Family {
  id: number; name: string; icon: string; description: string; set_bonus_json: string
}
interface SetBonus {
  min_count?: number; stat_bonus?: Record<string, number>
  element_attack?: string; on_hit_status?: string; on_hit_chance?: number; label?: string
}

const STATS: string[] = ['atk', 'def', 'mo', 'md', 'speed', 'luck', 'hp', 'mp']

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /><div>{children}</div>
    </div>
  )
}

export function OghamFamilyPanel() {
  const [families, setFamilies] = useState<Family[]>([])
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState<Partial<Family> | null>(null)
  const [sb,       setSb]       = useState<SetBonus>({ min_count: 2 })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await adminApi.entity.getAll('ogham_family')
    setFamilies((r.data || []) as Family[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const openEdit = (f?: Family) => {
    setEditing(f ? { ...f } : { name: '', icon: '🩸', description: '', set_bonus_json: '{}' })
    try { setSb(JSON.parse(f?.set_bonus_json || '{}') as SetBonus) } catch { setSb({ min_count: 2 }) }
  }

  const save = async () => {
    if (!editing?.name?.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return }
    const setBonusObj: SetBonus = { min_count: sb.min_count || 2 }
    const statBonus: Record<string, number> = {}
    STATS.forEach((s: string) => { if ((sb.stat_bonus?.[s] || 0) !== 0) statBonus[s] = sb.stat_bonus![s] })
    if (Object.keys(statBonus).length) setBonusObj.stat_bonus = statBonus
    if (sb.element_attack) setBonusObj.element_attack = sb.element_attack
    if (sb.on_hit_status) { setBonusObj.on_hit_status = sb.on_hit_status; setBonusObj.on_hit_chance = sb.on_hit_chance || 15 }
    if (sb.label) setBonusObj.label = sb.label
    const payload = { ...editing, set_bonus_json: JSON.stringify(setBonusObj) }
    const res = await adminApi.entity.save('ogham_family', payload as Record<string, unknown>, editing.id)
    if (res.success) { load(); setEditing(null) } else toast({ title: String(res.message || 'Save failed'), variant: 'destructive' })
  }

  const del = async (id: number, name: string) => {
    if (!confirm(`Delete family "${name}"? Oghams in this family will lose their set bonuses.`)) return
    await adminApi.entity.delete('ogham_family', id); load()
  }

  const setStat = (stat: string, v: number) =>
    setSb((prev: SetBonus) => ({ ...prev, stat_bonus: { ...prev.stat_bonus, [stat]: v } }))

  if (editing !== null) {
    const d = editing as Record<string, unknown>
    const jsonPreview = JSON.stringify({
      min_count: sb.min_count,
      ...(Object.keys(sb.stat_bonus || {}).length ? { stat_bonus: sb.stat_bonus } : {}),
      ...(sb.element_attack ? { element_attack: sb.element_attack } : {}),
      ...(sb.on_hit_status ? { on_hit_status: sb.on_hit_status, on_hit_chance: sb.on_hit_chance || 15 } : {}),
      ...(sb.label ? { label: sb.label } : {}),
    })

    return (
      <div className="p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditing(null)}><ChevronLeft className="w-4 h-4" /></Button>
            <h2 className="text-lg font-bold">{editing.id ? `✏️ ${editing.name}` : '🔗 New Ogham Family'}</h2>
          </div>
          <div className="flex gap-2">
            <Button onClick={save}>💾 Save</Button>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
        <Help>Families enable <b>set bonuses</b> when players equip 2+ Oghams from the same family. The bonus activates automatically — no scripting needed.</Help>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Family Name</label>
              <Input value={String(d.name || '')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditing((prev: Partial<Family> | null) => ({ ...prev, name: e.target.value }))}
                className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Icon</label>
              <Input value={String(d.icon || '🩸')}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditing((prev: Partial<Family> | null) => ({ ...prev, icon: e.target.value }))}
                className="mt-1 text-center text-xl" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Description</label>
            <textarea value={String(d.description || '')}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditing((prev: Partial<Family> | null) => ({ ...prev, description: e.target.value }))}
              rows={2} className="mt-1 w-full px-3 py-2 bg-input border border-border rounded text-sm resize-none" />
          </div>

          <div className="p-4 bg-card border border-border rounded-lg space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-green-400">✦ Set Bonus</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm font-medium">Min Oghams needed</label>
                <Input type="number" min={2} max={4} value={sb.min_count || 2}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSb((prev: SetBonus) => ({ ...prev, min_count: parseInt(e.target.value) || 2 }))}
                  className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Element granted</label>
                <Input value={sb.element_attack || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSb((prev: SetBonus) => ({ ...prev, element_attack: e.target.value || undefined }))}
                  placeholder="e.g. dark, fire" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Bonus label</label>
                <Input value={sb.label || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSb((prev: SetBonus) => ({ ...prev, label: e.target.value || undefined }))}
                  placeholder="e.g. Void Pact: +20 MO" className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Stat Bonuses</label>
              <div className="grid grid-cols-4 gap-2">
                {STATS.map((stat: string) => (
                  <div key={stat}>
                    <label className="text-xs text-muted-foreground uppercase">{stat}</label>
                    <Input type="number" value={sb.stat_bonus?.[stat] || 0}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStat(stat, parseInt(e.target.value) || 0)}
                      className="mt-0.5 h-8 text-xs" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">On-Hit Status</label>
                <Input value={sb.on_hit_status || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSb((prev: SetBonus) => ({ ...prev, on_hit_status: e.target.value || undefined }))}
                  placeholder="e.g. Stun" className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">On-Hit Chance %</label>
                <Input type="number" min={1} max={100} value={sb.on_hit_chance || 15}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSb((prev: SetBonus) => ({ ...prev, on_hit_chance: parseInt(e.target.value) || 15 }))}
                  className="mt-1" />
              </div>
            </div>
            <div className="p-2 bg-black/30 rounded text-[11px] font-mono text-green-400 break-all">{jsonPreview}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">🔗 Ogham Families</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{families.length} families</p>
        </div>
        <Button onClick={() => openEdit()}><Plus className="w-4 h-4 mr-1" />New Family</Button>
      </div>
      <Help>Equip 2+ Oghams from the same family to activate the set bonus. Families don't do anything on their own — they just group Oghams together.</Help>
      {loading ? <div className="text-center py-12 text-muted-foreground">Loading…</div> : (
        <div className="space-y-2">
          {families.length === 0 && <div className="text-center py-12 text-muted-foreground">No families yet.</div>}
          {families.map((f: Family) => {
            let preview = ''
            try {
              const b = JSON.parse(f.set_bonus_json || '{}') as SetBonus & Record<string, unknown>
              preview = (b.label as string | undefined) || JSON.stringify(b).slice(0, 80)
            } catch {}
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                <span className="text-2xl">{f.icon || '🩸'}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{f.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{preview || 'No set bonus defined'}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(f)}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => del(f.id, f.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
