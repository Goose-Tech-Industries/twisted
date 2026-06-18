"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Settings, Layers, History, Activity, Download, Upload, Database, RotateCcw } from "lucide-react"
import { SettingsPanel } from "./settings-panel"
import { ModulesPanel } from "./modules-panel"
import { TemplatePickerPanel } from "./template-picker-panel"
import { AssetManagerPanel } from "./asset-manager-panel"
import { EntityManager } from "./entity-manager"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"

type ConfigTab = "settings" | "modules" | "templates" | "assets" | "profiles" | "history" | "health" | "tools"

const TABS: Array<{ id: ConfigTab; label: string; icon: React.ElementType }> = [
  { id: "settings",  label: "Settings",  icon: Settings },
  { id: "modules",    label: "Modules",   icon: Layers },
  { id: "templates",  label: "Templates", icon: Layers },
  { id: "assets",     label: "Assets",    icon: Database },
  { id: "profiles",   label: "Profiles",  icon: Layers },
  { id: "history",    label: "History",   icon: History },
  { id: "health",     label: "Health",    icon: Activity },
  { id: "tools",      label: "Tools",     icon: RotateCcw },
]

function HealthPanel() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await fetch('/admin-panel/system-health', { credentials: 'include' })
      const d = await r.json()
      if (d.success) setHealth(d.data)
    } catch {}
  }, [])
  useEffect(() => { load(); const iv = setInterval(load, 10000); return () => clearInterval(iv) }, [load])

  if (!health) return <div className="p-6 text-center text-muted-foreground">Loading...</div>
  const mem = health.memory as Record<string, unknown>
  const used = mem?.used as Record<string, number> || {}
  const totalMB = Math.floor((mem?.total as number || 0) / 1024 / 1024)
  const freeMB = Math.floor((mem?.free as number || 0) / 1024 / 1024)
  const rssMB = Math.floor((used.rss || 0) / 1024 / 1024)
  const heapMB = Math.floor((used.heapUsed || 0) / 1024 / 1024)
  const uptimeH = Math.floor((health.uptime as number || 0) / 3600)
  const uptimeM = Math.floor(((health.uptime as number || 0) % 3600) / 60)

  return (
    <div className="p-6 space-y-4">
      <h3 className="text-lg font-bold">System Health</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="celtic-border"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-green-400">{uptimeH}h {uptimeM}m</div>
          <div className="text-[10px] text-muted-foreground uppercase">Uptime</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-blue-400">{rssMB}MB</div>
          <div className="text-[10px] text-muted-foreground uppercase">Process Memory</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-yellow-400">{freeMB}/{totalMB}MB</div>
          <div className="text-[10px] text-muted-foreground uppercase">Free/Total RAM</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-4 text-center">
          <div className="text-2xl font-bold font-mono text-purple-400">{health.onlinePlayers as number || 0}</div>
          <div className="text-[10px] text-muted-foreground uppercase">Online Players</div>
        </CardContent></Card>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="celtic-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-bold font-mono">{health.dbConnections as number || 0}</div>
          <div className="text-[10px] text-muted-foreground">DB Connections</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-bold font-mono">{health.staffOnline as number || 0}</div>
          <div className="text-[10px] text-muted-foreground">Staff Online</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-bold font-mono">{heapMB}MB</div>
          <div className="text-[10px] text-muted-foreground">Heap Used</div>
        </CardContent></Card>
        <Card className="celtic-border"><CardContent className="p-3 text-center">
          <div className="text-lg font-bold font-mono">{health.cpuCount as number || 0} cores</div>
          <div className="text-[10px] text-muted-foreground">CPU</div>
        </CardContent></Card>
      </div>
      <p className="text-xs text-muted-foreground">Node {String(health.nodeVersion)} · {String(health.platform)} · Auto-refreshes every 10s</p>
    </div>
  )
}

function ToolsPanel() {
  const [exporting, setExporting] = useState(false)

  const exportConfig = async () => {
    setExporting(true)
    try {
      const r = await fetch('/admin-panel/config-export', { credentials: 'include' })
      const d = await r.json()
      if (d.success) {
        const blob = new Blob([JSON.stringify(d.data, null, 2)], { type: 'application/json' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `twisted_config_${new Date().toISOString().slice(0,10)}.json`
        a.click()
        toast({ title: 'Config exported' })
      }
    } catch { toast({ title: 'Export failed', variant: 'destructive' }) }
    setExporting(false)
  }

  const importConfig = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)
        const r = await fetch('/admin-panel/config-import', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        const d = await r.json()
        toast({ title: d.success ? d.message : (d.message || 'Import failed'), variant: d.success ? undefined : 'destructive' })
      } catch { toast({ title: 'Invalid config file', variant: 'destructive' }) }
    }
    input.click()
  }

  const resetWorld = async () => {
    if (!confirm('Reset ALL world state? This clears flags, NPC moods, memories. Cannot be undone.')) return
    if (!confirm('Are you ABSOLUTELY sure? Type YES to confirm.')) return
    const r = await fetch('/admin-panel/reset-world-state', { method: 'POST', credentials: 'include' }).then(r => r.json())
    toast({ title: r.message || 'Done' })
  }

  const resetPlayers = async () => {
    if (!confirm('DELETE ALL CHARACTER DATA? This wipes every character, inventory, stats, and progress. User accounts are kept. CANNOT BE UNDONE.')) return
    if (!confirm('FINAL WARNING: Every player loses everything. Are you sure?')) return
    const r = await fetch('/admin-panel/reset-player-data', { method: 'POST', credentials: 'include' }).then(r => r.json())
    toast({ title: r.message || 'Done', variant: r.success ? undefined : 'destructive' })
  }

  return (
    <div className="p-6 space-y-6">
      <h3 className="text-lg font-bold">Config Tools</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-bold text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Export Config</h4>
            <p className="text-xs text-muted-foreground">Download all settings, game_settings, terminology, and modules as JSON.</p>
            <Button onClick={exportConfig} disabled={exporting} className="w-full">{exporting ? 'Exporting...' : 'Export Full Config'}</Button>
          </CardContent>
        </Card>
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h4 className="font-bold text-sm flex items-center gap-2"><Upload className="w-4 h-4" /> Import Config</h4>
            <p className="text-xs text-muted-foreground">Upload a previously exported config JSON to restore settings.</p>
            <Button onClick={importConfig} variant="outline" className="w-full">Import Config File</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="celtic-border border-destructive/30">
        <CardContent className="p-4 space-y-3">
          <h4 className="font-bold text-sm text-destructive">Danger Zone</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Reset world flags, NPC moods, and memories. Game content preserved.</p>
              <Button variant="outline" className="w-full border-destructive/50 text-destructive" onClick={resetWorld}>Reset World State</Button>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">DELETE all character data. User accounts kept. Everything else wiped.</p>
              <Button variant="destructive" className="w-full" onClick={resetPlayers}>Reset All Player Data</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ConfigHubPanel() {
  const [tab, setTab] = useState<ConfigTab>("settings")

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-border flex-shrink-0 overflow-x-auto">
        <Settings className="w-5 h-5 text-primary mr-2 flex-shrink-0" />
        <h2 className="text-lg font-bold mr-3 flex-shrink-0">Config</h2>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0 whitespace-nowrap",
              tab === t.id
                ? "bg-primary/10 text-primary border border-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === "settings"  && <SettingsPanel />}
        {tab === "modules"   && <ModulesPanel />}
        {tab === "templates" && <TemplatePickerPanel />}
        {tab === "assets"    && <AssetManagerPanel />}
        {tab === "profiles"  && <EntityManager section="config_profiles" />}
        {tab === "history"   && <EntityManager section="settings_history" />}
        {tab === "health"    && <HealthPanel />}
        {tab === "tools"     && <ToolsPanel />}
      </div>
    </div>
  )
}
