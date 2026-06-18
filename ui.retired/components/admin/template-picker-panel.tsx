"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Check, Download, Loader2 } from "lucide-react"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface GameTemplate {
  id: number; name: string; label: string; icon: string
  description: string; author: string; version: string
  is_default: number; installed: number
}

export function TemplatePickerPanel() {
  const [templates, setTemplates] = useState<GameTemplate[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<number | null>(null)
  const [installResult, setInstallResult] = useState<{ ok: boolean; message: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/templates`, { credentials: 'include' })
      if (!res.ok) { setError(`Server error (${res.status})`); setLoading(false); return }
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates || [])
        setActive(data.active ?? null)
        setError(null)
      } else {
        setError(data.message || 'Failed to load templates')
      }
    } catch (e) {
      setError('Could not reach server')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const install = async (id: number) => {
    if (!confirm('Install this template? This will add classes, races, items, NPCs, maps, and configure battle settings. Existing data is preserved (INSERT IGNORE).')) return
    setInstalling(id)
    setInstallResult(null)
    try {
      const res = await fetch(`${API}/admin-panel/templates/${id}/install`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
      if (!res.ok) { setInstallResult({ ok: false, message: `Server error (${res.status})` }); setInstalling(null); return }
      const data = await res.json()
      if (data.success) {
        setInstallResult({ ok: true, message: `Template installed! Applied: ${data.applied ?? 0} items, Errors: ${data.errors ?? 0}` })
        load()
      } else {
        setInstallResult({ ok: false, message: data.message || 'Install failed' })
      }
    } catch {
      setInstallResult({ ok: false, message: 'Network error — could not reach server' })
    }
    setInstalling(null)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading templates...</div>

  if (error && templates.length === 0) return (
    <div className="p-8 text-center text-muted-foreground">
      <p className="text-sm">{error}</p>
      <button onClick={load} className="mt-2 px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded-md">Retry</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Game Templates</h2>
        <p className="text-sm text-muted-foreground">
          Pick a theme for your game world. Each template sets up classes, races, items, maps, NPCs, battle settings, and renames all terminology to match the theme.
        </p>
      </div>

      {/* Install result banner */}
      {installResult && (
        <div className={`rounded-md border px-3 py-2 text-sm flex items-center justify-between ${
          installResult.ok
            ? 'border-green-800 bg-green-900/20 text-green-400'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        }`}>
          <span>{installResult.message}</span>
          <button onClick={() => setInstallResult(null)} className="text-xs opacity-60 hover:opacity-100 ml-2">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(t => {
          const isActive = active === t.name
          const isInstalling = installing === t.id

          return (
            <Card key={t.id} className={cn(
              "celtic-border overflow-hidden transition-all",
              isActive && "ring-2 ring-primary",
            )}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-3">
                  <span className="text-3xl">{t.icon || '?'}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{t.label}</h3>
                    <p className="text-xs text-muted-foreground">by {t.author || 'Unknown'} &bull; v{t.version}</p>
                  </div>
                  {isActive && (
                    <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                      <Check className="w-3 h-3" /> Active
                    </span>
                  )}
                </div>

                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {t.description}
                </p>

                {t.is_default === 1 ? (
                  <span className="text-[10px] text-muted-foreground/50 bg-muted px-2 py-0.5 rounded">Default Template</span>
                ) : null}

                <div className="mt-4">
                  {t.installed === 1 ? (
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => install(t.id)}
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={!!isInstalling}
                      >
                        {isInstalling ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        Re-install
                      </Button>
                      <span className="text-[10px] text-muted-foreground">Already installed</span>
                    </div>
                  ) : (
                    <Button
                      onClick={() => install(t.id)}
                      className={cn("w-full", t.is_default === 1 ? "bg-primary" : "")}
                      disabled={!!isInstalling}
                    >
                      {isInstalling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                      Install Template
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="celtic-border">
        <CardContent className="p-4">
          <h3 className="font-medium mb-2">What does installing a template do?</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>&bull; <strong>Renames everything</strong> — HP becomes "Shield Points", gold becomes "Credits", etc.</li>
            <li>&bull; <strong>Adds starter content</strong> — classes, races, items, skills, maps, NPCs</li>
            <li>&bull; <strong>Configures battle systems</strong> — enables/disables features to match the theme</li>
            <li>&bull; <strong>Safe to re-install</strong> — uses INSERT IGNORE, won&apos;t overwrite your custom content</li>
            <li>&bull; <strong>Fully customizable after</strong> — everything can be edited in AdminSauce</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
