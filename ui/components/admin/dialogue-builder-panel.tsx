"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { Plus, GitBranch, MessageCircle } from "lucide-react"
import { NodeGraphEditorPanel } from "./node-graph-editor-panel"
import type { ScriptEvent } from "./script-editor-panel"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface NPC {
  id: number; name: string; icon: string; persona: string
  is_enemy: number; map_id: number; is_master: number
  script_key: string
}

export function DialogueBuilderPanel() {
  const [npcs, setNpcs] = useState<NPC[]>([])
  const [loading, setLoading] = useState(true)
  const [editingNpc, setEditingNpc] = useState<NPC | null>(null)
  const [visualEditorOpen, setVisualEditorOpen] = useState(false)
  const [visualEvent, setVisualEvent] = useState<ScriptEvent | null>(null)
  const [search, setSearch] = useState('')
  const [scripts, setScripts] = useState<Record<string, ScriptEvent[]>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/npc`, { credentials: 'include' })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.success) {
        setNpcs((data.data || []).filter((n: NPC) => !n.is_enemy))
      }
    } catch { toast({ title: 'Failed to load NPCs', variant: 'destructive' }) }

    // Load existing scripts
    try {
      const res = await fetch(`${API}/admin-panel/script`, { credentials: 'include' })
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      if (data.success && data.data) {
        const scriptMap: Record<string, ScriptEvent[]> = {}
        for (const s of data.data) {
          try {
            const events = typeof s.script_json === 'string' ? JSON.parse(s.script_json) : (s.script_json || s.events_json)
            scriptMap[s.script_key] = typeof events === 'string' ? JSON.parse(events) : (events || [])
          } catch { console.warn('[Dialogue] Invalid script JSON for', s.script_key) }
        }
        setScripts(scriptMap)
      }
    } catch { toast({ title: 'Failed to load scripts', variant: 'destructive' }) }

    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openDialogueEditor = (npc: NPC) => {
    const scriptKey = npc.script_key || `npc_${npc.id}_dialogue`

    // Load existing dialogue script or create a starter
    const existing = scripts[scriptKey]
    let event: ScriptEvent

    if (existing && existing.length > 0) {
      event = existing[0] // Load first event in the chain
    } else {
      // Create a starter dialogue tree
      event = {
        trigger: 'INTERACT',
        actions: [
          { type: 'DIALOGUE', speaker: npc.name, text: `Greetings, traveler. I am ${npc.name}.` },
          {
            type: 'CHOICE', prompt: 'What would you like to do?',
            options: [
              { text: 'Tell me about this place.', next: 'info' },
              { text: 'Do you have any quests?', next: 'quest' },
              { text: 'Goodbye.', next: 'end' },
            ]
          },
          { type: 'DIALOGUE', speaker: npc.name, text: 'This is a peaceful village, though dark forces stir in the woods...' },
          { type: 'DIALOGUE', speaker: npc.name, text: 'Indeed, I could use some help. Let me explain...' },
          { type: 'DIALOGUE', speaker: npc.name, text: 'Farewell, traveler. Safe travels.' },
        ]
      }
    }

    setEditingNpc(npc)
    setVisualEvent(event)
    setVisualEditorOpen(true)
  }

  const handleVisualSave = async (event: ScriptEvent) => {
    if (!editingNpc) return
    const scriptKey = editingNpc.script_key || `npc_${editingNpc.id}_dialogue`

    try {
      // Save the script via entity CRUD
      const saveRes = await fetch(`${API}/admin-panel/script/${encodeURIComponent(scriptKey)}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script_key: scriptKey,
          name: `Dialogue: ${editingNpc.name}`,
          script_json: JSON.stringify([event]),
          description: `Dialogue tree for ${editingNpc.name}`
        })
      })
      if (!saveRes.ok) throw new Error('Save failed')

      // Update NPC script_key if not set
      if (!editingNpc.script_key) {
        await fetch(`${API}/admin-panel/npc/${editingNpc.id}`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_key: scriptKey })
        })
      }
      toast({ title: 'Dialogue saved' })
    } catch { toast({ title: 'Save failed', variant: 'destructive' }) }

    setVisualEditorOpen(false)
    setEditingNpc(null)
    load()
  }

  const filtered = npcs.filter(n =>
    (n.name || '').toLowerCase().includes(search.toLowerCase())
  )

  if (visualEditorOpen && visualEvent) {
    return (
      <div className="h-[calc(100vh-100px)]">
        <div className="flex items-center gap-3 p-3 border-b border-border bg-card">
          <MessageCircle className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold">{editingNpc?.icon} {editingNpc?.name} — Dialogue Tree</h3>
            <p className="text-xs text-muted-foreground">Drag Dialogue and Choice nodes to build branching conversations.</p>
          </div>
        </div>
        <NodeGraphEditorPanel
          initialEvent={visualEvent}
          onSave={handleVisualSave}
          onCancel={() => { setVisualEditorOpen(false); setEditingNpc(null) }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Dialogue Builder</h2>
          <p className="text-sm text-muted-foreground">Create branching NPC conversations visually. Drag dialogue and choice nodes to build conversation trees.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search NPCs..." className="flex-1"
        />
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground p-8">Loading NPCs...</div>
      ) : filtered.length === 0 ? (
        <Card className="celtic-border">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No friendly NPCs found. Create NPCs in the NPC Editor first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filtered.map(npc => {
            const hasScript = !!(npc.script_key && scripts[npc.script_key])
            return (
              <Card key={npc.id} className="celtic-border">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[oklch(0.55_0.12_185)]/20 flex items-center justify-center text-lg shrink-0">
                    {npc.icon || '👤'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{npc.name}</span>
                      {npc.is_master ? <span className="text-[10px] bg-[oklch(0.65_0.15_85)]/20 text-[oklch(0.65_0.15_85)] px-1.5 py-0.5 rounded">Master</span> : null}
                      {hasScript ? (
                        <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Has Dialogue</span>
                      ) : (
                        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">No Dialogue</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{npc.persona || 'No persona set'}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openDialogueEditor(npc)}>
                    <GitBranch className="w-3.5 h-3.5 mr-1" />
                    {hasScript ? 'Edit' : 'Create'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
