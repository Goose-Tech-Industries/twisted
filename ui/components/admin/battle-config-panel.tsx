"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Save, Pencil, X, Check, ChevronDown, ChevronRight } from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface BattleSetting {
  key: string
  type: 'toggle' | 'number' | 'percent' | 'select' | 'text'
  label: string
  desc?: string
  value?: string | null
  min?: number
  max?: number
  options?: string[]
  termKey?: string
  terminology?: { term_key: string; display_name: string; icon?: string; description?: string }
}

interface Category {
  label: string
  icon: string
  settings: BattleSetting[]
}

export function BattleConfigPanel() {
  const [categories, setCategories] = useState<Record<string, Category>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['core_combat']))
  const [editingTerm, setEditingTerm] = useState<string | null>(null)
  const [termName, setTermName] = useState('')
  const [termIcon, setTermIcon] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/battle-config`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) setCategories(data.categories)
    } catch (e) { console.error('Failed to load battle config:', e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const updateSetting = async (key: string, value: string, termKey?: string, displayName?: string, icon?: string) => {
    setSaving(key)
    try {
      await fetch(`${API}/admin-panel/battle-config`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, termKey, displayName, icon })
      })
      // Update local state
      setCategories(prev => {
        const next = { ...prev }
        for (const cat of Object.values(next)) {
          for (const s of cat.settings) {
            if (s.key === key) s.value = value
            if (s.termKey === termKey && displayName && s.terminology) {
              s.terminology.display_name = displayName
              if (icon) s.terminology.icon = icon
            }
          }
        }
        return next
      })
    } catch {}
    setSaving(null)
  }

  const toggleCat = (catKey: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      next.has(catKey) ? next.delete(catKey) : next.add(catKey)
      return next
    })
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading battle configuration...</div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Battle Configuration</h2>
          <p className="text-sm text-muted-foreground">Toggle systems, tune parameters, rename terminology.</p>
        </div>
      </div>

      {Object.entries(categories).map(([catKey, cat]) => {
        const isExpanded = expandedCats.has(catKey)
        const enabledCount = cat.settings.filter(s => s.type === 'toggle' && s.value === 'true').length
        const toggleCount = cat.settings.filter(s => s.type === 'toggle').length

        return (
          <Card key={catKey} className="celtic-border">
            <button
              onClick={() => toggleCat(catKey)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{cat.icon}</span>
                <span className="font-medium">{cat.label}</span>
                {toggleCount > 0 && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {enabledCount}/{toggleCount} on
                  </span>
                )}
              </div>
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <CardContent className="px-4 pb-4 space-y-3">
                {cat.settings.map(setting => {
                  const isToggle = setting.type === 'toggle'
                  const isOn = setting.value === 'true' || setting.value === '1'
                  const isSaving = saving === setting.key
                  const hasTerminology = setting.terminology
                  const isEditingThisTerm = editingTerm === setting.termKey

                  return (
                    <div key={setting.key} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                      {/* Toggle or Input */}
                      <div className="w-24 shrink-0 pt-0.5">
                        {isToggle ? (
                          <button
                            onClick={() => updateSetting(setting.key, isOn ? 'false' : 'true')}
                            className={cn(
                              "w-12 h-6 rounded-full transition-colors relative",
                              isOn ? "bg-primary" : "bg-muted"
                            )}
                            disabled={!!isSaving}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform",
                              isOn ? "translate-x-6" : "translate-x-0.5"
                            )} />
                          </button>
                        ) : setting.type === 'select' ? (
                          <select
                            value={setting.value || ''}
                            onChange={e => updateSetting(setting.key, e.target.value)}
                            className="w-full h-7 text-xs bg-input border border-border rounded px-1"
                          >
                            {(setting.options || []).map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            type="number"
                            value={setting.value || ''}
                            onChange={e => updateSetting(setting.key, e.target.value)}
                            className="h-7 text-xs w-full"
                            step={setting.type === 'percent' ? '0.01' : '1'}
                          />
                        )}
                      </div>

                      {/* Label + Description + Terminology */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {hasTerminology && (
                            <span className="text-sm">{setting.terminology?.icon || ''}</span>
                          )}
                          <span className="text-sm font-medium">
                            {hasTerminology ? setting.terminology?.display_name : setting.label}
                          </span>
                          {!isToggle && setting.type === 'percent' && (
                            <span className="text-[10px] text-muted-foreground">
                              ({Math.round((parseFloat(setting.value || '0')) * 100)}%)
                            </span>
                          )}

                          {/* Inline rename */}
                          {hasTerminology && !isEditingThisTerm && (
                            <button
                              onClick={() => {
                                setEditingTerm(setting.termKey!)
                                setTermName(setting.terminology?.display_name || '')
                                setTermIcon(setting.terminology?.icon || '')
                              }}
                              className="text-muted-foreground hover:text-foreground p-0.5"
                              title="Rename this term"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {/* Inline rename form */}
                        {isEditingThisTerm && (
                          <div className="flex items-center gap-1 mt-1">
                            <Input
                              value={termIcon}
                              onChange={e => setTermIcon(e.target.value)}
                              className="w-10 h-6 text-xs text-center"
                              placeholder="🔥"
                              maxLength={4}
                            />
                            <Input
                              value={termName}
                              onChange={e => setTermName(e.target.value)}
                              className="flex-1 h-6 text-xs"
                              placeholder="Custom name..."
                            />
                            <button
                              onClick={() => {
                                updateSetting(setting.key, setting.value || '', setting.termKey!, termName, termIcon)
                                setEditingTerm(null)
                              }}
                              className="text-primary hover:text-primary/80 p-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingTerm(null)}
                              className="text-muted-foreground hover:text-foreground p-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {setting.desc}
                        </p>
                        <p className="text-[9px] text-muted-foreground/50 font-mono">{setting.key}</p>
                      </div>

                      {/* Save indicator */}
                      {isSaving && (
                        <span className="text-[10px] text-primary animate-pulse">Saving...</span>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}
