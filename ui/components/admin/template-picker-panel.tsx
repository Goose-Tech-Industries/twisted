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
  const [installing, setInstalling] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/templates`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
        setActive(data.active)
      }
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const install = async (id: number) => {
    if (!confirm('Install this template? This will add classes, races, items, NPCs, maps, and configure battle settings. Existing data is preserved (INSERT IGNORE).')) return
    setInstalling(id)
    try {
      const res = await fetch(`${API}/admin-panel/templates/${id}/install`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      })
      const data = await res.json()
      if (data.success) {
        alert(`Template installed!\n\nApplied: ${data.applied} items\nErrors: ${data.errors}`)
        load()
      } else {
        alert(`Error: ${data.message}`)
      }
    } catch (e) { alert('Install failed') }
    setInstalling(null)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">Loading templates...</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Game Templates</h2>
        <p className="text-sm text-muted-foreground">
          Pick a theme for your game world. Each template sets up classes, races, items, maps, NPCs, battle settings, and renames all terminology to match the theme.
        </p>
      </div>

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
                  <span className="text-3xl">{t.icon}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{t.label}</h3>
                    <p className="text-xs text-muted-foreground">by {t.author} • v{t.version}</p>
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

                {t.is_default ? (
                  <span className="text-[10px] text-muted-foreground/50 bg-muted px-2 py-0.5 rounded">Default Template</span>
                ) : null}

                <div className="mt-4">
                  {t.installed ? (
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
                      className={cn("w-full", t.is_default ? "bg-primary" : "")}
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
            <li>• <strong>Renames everything</strong> — HP becomes "Shield Points", gold becomes "Credits", etc.</li>
            <li>• <strong>Adds starter content</strong> — classes, races, items, skills, maps, NPCs</li>
            <li>• <strong>Configures battle systems</strong> — enables/disables features to match the theme</li>
            <li>• <strong>Safe to re-install</strong> — uses INSERT IGNORE, won't overwrite your custom content</li>
            <li>• <strong>Fully customizable after</strong> — everything can be edited in AdminSauce</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
