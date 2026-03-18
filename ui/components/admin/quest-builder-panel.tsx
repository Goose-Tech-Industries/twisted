"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Plus, Pencil, Trash2, Eye, X, Save, GitBranch } from "lucide-react"
import { NodeGraphEditorPanel } from "./node-graph-editor-panel"
import type { ScriptEvent } from "./script-editor-panel"

const API = process.env.NEXT_PUBLIC_API_URL || ''

interface Quest {
  id: number; quest_id: string; title: string; description: string
  quest_type: string; required_level: number; is_active: number
  objectives_json: string; rewards_json: string
}

export function QuestBuilderPanel() {
  const [quests, setQuests] = useState<Quest[]>([])
  const [loading, setLoading] = useState(true)
  const [editingQuest, setEditingQuest] = useState<Quest | null>(null)
  const [visualEditorOpen, setVisualEditorOpen] = useState(false)
  const [visualEvent, setVisualEvent] = useState<ScriptEvent | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin-panel/quest`, { credentials: 'include' })
      const data = await res.json()
      if (data.success) setQuests(data.data || [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Open visual editor for a quest's event chain
  const openVisualEditor = (quest: Quest) => {
    // Convert quest objectives into a visual event flow
    let objectives = []
    try { objectives = JSON.parse(quest.objectives_json || '[]') } catch {}
    let rewards: Record<string, unknown> = {}
    try { rewards = JSON.parse(quest.rewards_json || '{}') } catch {}

    // Build a starting event from quest data
    const event: ScriptEvent = {
      trigger: 'INTERACT',
      actions: [
        { type: 'DIALOGUE', speaker: 'Quest Giver', text: quest.description || 'A new quest awaits...' },
        { type: 'QUEST_START', questId: quest.quest_id },
        ...objectives.map((obj: Record<string, unknown>) => ({
          type: 'DIALOGUE',
          speaker: 'Quest Log',
          text: `Objective: ${obj.label || obj.type || 'Unknown'} (${obj.current || 0}/${obj.required || obj.count || 1})`
        })),
        ...(rewards.gold ? [{ type: 'GIVE_GOLD', amount: rewards.gold }] : []),
        ...(rewards.xp ? [{ type: 'GIVE_XP', amount: rewards.xp }] : []),
        { type: 'QUEST_COMPLETE', questId: quest.quest_id },
      ],
      _graphLayout: (quest as unknown as Record<string, unknown>)._graphLayout || null
    }

    setEditingQuest(quest)
    setVisualEvent(event)
    setVisualEditorOpen(true)
  }

  const handleVisualSave = async (event: ScriptEvent) => {
    if (!editingQuest) return
    // Save the graph layout back to the quest
    try {
      await fetch(`${API}/admin-panel/quest/${editingQuest.quest_id || editingQuest.id}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingQuest,
          _graphLayout: event._graphLayout
        })
      })
    } catch {}
    setVisualEditorOpen(false)
    setEditingQuest(null)
    load()
  }

  const filtered = quests.filter(q =>
    (q.title || q.quest_id || '').toLowerCase().includes(search.toLowerCase())
  )

  if (visualEditorOpen && visualEvent) {
    return (
      <div className="h-[calc(100vh-100px)]">
        <div className="flex items-center gap-3 p-3 border-b border-border bg-card">
          <GitBranch className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold">{editingQuest?.title || 'Quest'} — Visual Editor</h3>
            <p className="text-xs text-muted-foreground">Drag nodes from the palette. Connect them to build quest flow.</p>
          </div>
        </div>
        <NodeGraphEditorPanel
          initialEvent={visualEvent}
          onSave={handleVisualSave}
          onCancel={() => { setVisualEditorOpen(false); setEditingQuest(null) }}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Quest Builder</h2>
          <p className="text-sm text-muted-foreground">Create and edit quests visually or with forms.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search quests..." className="flex-1"
        />
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground p-8">Loading quests...</div>
      ) : filtered.length === 0 ? (
        <Card className="celtic-border">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-4">No quests found. Create your first quest!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(quest => (
            <Card key={quest.id || quest.quest_id} className="celtic-border">
              <CardContent className="p-3 flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0",
                  quest.is_active ? "bg-primary/20" : "bg-muted"
                )}>
                  📜
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{quest.title || quest.quest_id}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                      quest.is_active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {quest.quest_type || 'side'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Lv.{quest.required_level || 1}+</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{quest.description || 'No description'}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => openVisualEditor(quest)} title="Visual Editor">
                    <GitBranch className="w-3.5 h-3.5 mr-1" /> Visual
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
