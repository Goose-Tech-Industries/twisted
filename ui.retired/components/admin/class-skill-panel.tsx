"use client"
import { toast } from "@/hooks/use-toast"
// =================================================================
// CLASS SKILL PANEL — Assign skills to classes
// Shows a grid: classes (columns) × skills (rows).
// Tick a cell to assign a skill to a class (stored in class.skills_json).
// =================================================================
import { useState, useEffect, useCallback } from "react"
import adminApi from "@/lib/admin-api"
import { Button } from "@/components/ui/button"
import { RefreshCw, Save, Info } from "lucide-react"

interface GameClass { id: number; name: string; icon: string; skills_json?: string }
interface Skill      { id: number; name: string; icon: string; type: string; mp_cost: number }

function Help({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 p-3 bg-blue-950/40 border border-blue-500/20 rounded-lg text-xs text-blue-300 mb-4">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" /><div>{children}</div>
    </div>
  )
}

export function ClassSkillPanel() {
  const [classes,     setClasses]     = useState<GameClass[]>([])
  const [skills,      setSkills]      = useState<Skill[]>([])
  const [loading,     setLoading]     = useState(true)
  const [assignments, setAssignments] = useState<Record<number, Set<number>>>({})
  const [dirty,       setDirty]       = useState<Set<number>>(new Set())
  const [saving,      setSaving]      = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    const [cr, sr] = await Promise.all([
      adminApi.entity.getAll('class'),
      adminApi.entity.getAll('skill'),
    ])
    const cls = (cr.data || []) as GameClass[]
    const skl = (sr.data || []) as Skill[]
    setClasses(cls)
    setSkills(skl)
    const map: Record<number, Set<number>> = {}
    for (const c of cls) {
      const ids: number[] = []
      try {
        const parsed: unknown = JSON.parse(c.skills_json || '[]')
        if (Array.isArray(parsed)) ids.push(...(parsed as number[]))
      } catch {}
      map[c.id] = new Set(ids)
    }
    setAssignments(map)
    setDirty(new Set())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggle = (classId: number, skillId: number) => {
    setAssignments((prev: Record<number, Set<number>>) => {
      const next = { ...prev }
      const set = new Set(next[classId] || [])
      set.has(skillId) ? set.delete(skillId) : set.add(skillId)
      next[classId] = set
      return next
    })
    setDirty((prev: Set<number>) => new Set([...prev, classId]))
  }

  const saveClass = async (classId: number) => {
    setSaving((prev: Set<number>) => new Set([...prev, classId]))
    const skillIds = [...(assignments[classId] || [])]
    const res = await adminApi.entity.save(
      'class',
      { skills_json: JSON.stringify(skillIds) } as Record<string, unknown>,
      classId,
    )
    setSaving((prev: Set<number>) => { const n = new Set(prev); n.delete(classId); return n })
    if (res.success) setDirty((prev: Set<number>) => { const n = new Set(prev); n.delete(classId); return n })
    else toast({ title: String(res.message || 'Save failed'), variant: 'destructive' })
  }

  const saveAll = async () => {
    for (const classId of dirty) await saveClass(classId)
  }

  const skillGroups: Record<string, Skill[]> = {}
  for (const s of skills) {
    if (!skillGroups[s.type]) skillGroups[s.type] = []
    skillGroups[s.type].push(s)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">📚 Skill Assignment</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Assign skills to classes. Ticked = class can use it.</p>
        </div>
        <div className="flex gap-2">
          {dirty.size > 0 && (
            <Button onClick={saveAll} className="bg-green-700 hover:bg-green-600">
              <Save className="w-4 h-4 mr-1" />Save All Changes ({dirty.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Refresh
          </Button>
        </div>
      </div>

      <Help>
        Check a cell to assign that skill to the class. Click <b>Save</b> on a column header to save
        that class, or <b>Save All</b> to save everything at once. Stored as a JSON array of skill IDs
        in the class record.
      </Help>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-background z-10 text-left p-2 pr-4 font-medium text-muted-foreground min-w-[180px]">
                  Skill
                </th>
                {classes.map((c: GameClass) => (
                  <th key={c.id} className="p-2 text-center min-w-[90px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-base">{c.icon || '⚔️'}</span>
                      <span className="font-semibold text-foreground leading-tight max-w-[80px] truncate">{c.name}</span>
                      <button
                        onClick={() => saveClass(c.id)}
                        disabled={!dirty.has(c.id) || saving.has(c.id)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors ${
                          dirty.has(c.id)
                            ? 'bg-green-700 text-white hover:bg-green-600 cursor-pointer'
                            : 'bg-secondary text-muted-foreground cursor-default'
                        }`}
                      >
                        {saving.has(c.id) ? '…' : dirty.has(c.id) ? 'SAVE' : '✓'}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(skillGroups).map(([type, typeSkills]: [string, Skill[]]) => (
                <>
                  <tr key={`group-${type}`}>
                    <td
                      colSpan={classes.length + 1}
                      className="sticky left-0 bg-secondary/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-y border-border"
                    >
                      {type}
                    </td>
                  </tr>
                  {typeSkills.map((skill: Skill) => (
                    <tr key={skill.id} className="border-b border-border/40 hover:bg-secondary/10 transition-colors">
                      <td className="sticky left-0 bg-background z-10 p-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base shrink-0">{skill.icon || '✨'}</span>
                          <div>
                            <div className="font-medium text-foreground">{skill.name}</div>
                            <div className="text-muted-foreground text-[10px]">{skill.mp_cost} MP</div>
                          </div>
                        </div>
                      </td>
                      {classes.map((c: GameClass) => {
                        const checked = assignments[c.id]?.has(skill.id) || false
                        return (
                          <td key={c.id} className="p-2 text-center">
                            <button
                              onClick={() => toggle(c.id, skill.id)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                                checked
                                  ? 'bg-primary border-primary text-primary-foreground'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              {checked && <span className="text-[10px] font-bold">✓</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </>
              ))}
              {skills.length === 0 && (
                <tr>
                  <td colSpan={classes.length + 1} className="py-8 text-center text-muted-foreground">
                    No skills found. Create skills in the Skills section first.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
