"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"

function useAIFetch() {
  const [loading, setLoading] = useState(false)
  const call = async (endpoint: string, body: Record<string, unknown> = {}) => {
    setLoading(true)
    try {
      const r = await fetch(endpoint, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      setLoading(false)
      return d
    } catch (e) {
      setLoading(false)
      return { success: false, message: String(e) }
    }
  }
  return { loading, call }
}

export function AIToolsPanel() {
  // Quest generation
  const [questLevel, setQuestLevel] = useState('5')
  const [questLocation, setQuestLocation] = useState('')
  const [questResult, setQuestResult] = useState<Record<string, unknown> | null>(null)
  const questAI = useAIFetch()

  // Item text
  const [itemName, setItemName] = useState('')
  const [itemType, setItemType] = useState('WEAPON')
  const [itemResult, setItemResult] = useState('')
  const itemAI = useAIFetch()

  // Lore
  const [loreTopic, setLoreTopic] = useState('')
  const [loreResult, setLoreResult] = useState('')
  const loreAI = useAIFetch()

  // Biography
  const [bioCharId, setBioCharId] = useState('')
  const [bioResult, setBioResult] = useState('')
  const bioAI = useAIFetch()

  // DM Assist
  const [dmInstruction, setDmInstruction] = useState('')
  const [dmResult, setDmResult] = useState('')
  const dmAI = useAIFetch()

  // Rumor
  const [rumorNpc, setRumorNpc] = useState('')
  const [rumorResult, setRumorResult] = useState('')
  const rumorAI = useAIFetch()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">AI Content Tools</h2>
        <p className="text-sm text-muted-foreground">Generate game content using AI. Requires an AI provider configured in Settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Quest Generation */}
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">📜 Generate Quest</h3>
            <p className="text-xs text-muted-foreground">AI creates a complete side quest with objectives and rewards.</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Player level" type="number" value={questLevel} onChange={e => setQuestLevel(e.target.value)} className="text-xs h-8" />
              <Input placeholder="Location name" value={questLocation} onChange={e => setQuestLocation(e.target.value)} className="text-xs h-8" />
            </div>
            <Button className="w-full" size="sm" disabled={questAI.loading} onClick={async () => {
              const d = await questAI.call('/admin/ai-generate', { type: 'quest', level: parseInt(questLevel) || 5, location: questLocation || 'Unknown' })
              if (d.success && d.data) { setQuestResult(d.data); toast({ title: 'Quest generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {questAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate Quest
            </Button>
            {questResult && (
              <pre className="text-[10px] font-mono bg-black/40 rounded p-2 max-h-40 overflow-auto text-green-300">
                {JSON.stringify(questResult, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* Item Flavor Text */}
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">📦 Item Description</h3>
            <p className="text-xs text-muted-foreground">Generate flavor text for any item.</p>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Item name" value={itemName} onChange={e => setItemName(e.target.value)} className="text-xs h-8" />
              <select value={itemType} onChange={e => setItemType(e.target.value)} className="text-xs h-8 px-2 bg-input border border-border rounded">
                {['WEAPON','ARMOR','CONSUMABLE','POTION','ACCESSORY','QUEST','MISC','SCROLL','MATERIAL'].map(t =>
                  <option key={t} value={t}>{t}</option>
                )}
              </select>
            </div>
            <Button className="w-full" size="sm" disabled={itemAI.loading || !itemName} onClick={async () => {
              const d = await itemAI.call('/admin/ai-generate', { type: 'item_text', itemName, itemType })
              if (d.success && d.text) { setItemResult(d.text); toast({ title: 'Description generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {itemAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate Description
            </Button>
            {itemResult && <div className="text-xs bg-black/40 rounded p-2 text-blue-300 italic">{itemResult}</div>}
          </CardContent>
        </Card>

        {/* Lore Generation */}
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">📖 Generate Lore</h3>
            <p className="text-xs text-muted-foreground">Create in-world lore passages for books, scrolls, or signs.</p>
            <Input placeholder="Topic (e.g. 'The Fall of the Old Gods')" value={loreTopic} onChange={e => setLoreTopic(e.target.value)} className="text-xs h-8" />
            <Button className="w-full" size="sm" disabled={loreAI.loading || !loreTopic} onClick={async () => {
              const d = await loreAI.call('/admin/ai-generate', { type: 'lore', topic: loreTopic })
              if (d.success && d.text) { setLoreResult(d.text); toast({ title: 'Lore generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {loreAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate Lore
            </Button>
            {loreResult && <div className="text-xs bg-black/40 rounded p-2 text-amber-300 italic whitespace-pre-wrap">{loreResult}</div>}
          </CardContent>
        </Card>

        {/* NPC Rumor */}
        <Card className="celtic-border">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">🗣️ Generate NPC Rumor</h3>
            <p className="text-xs text-muted-foreground">Create a rumor an NPC might share.</p>
            <Input placeholder="NPC name" value={rumorNpc} onChange={e => setRumorNpc(e.target.value)} className="text-xs h-8" />
            <Button className="w-full" size="sm" disabled={rumorAI.loading || !rumorNpc} onClick={async () => {
              const d = await rumorAI.call('/admin/ai-generate', { type: 'rumor', npcName: rumorNpc })
              if (d.success && d.text) { setRumorResult(d.text); toast({ title: 'Rumor generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {rumorAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate Rumor
            </Button>
            {rumorResult && <div className="text-xs bg-black/40 rounded p-2 text-purple-300 italic">{rumorResult}</div>}
          </CardContent>
        </Card>

        {/* DM Assist */}
        <Card className="celtic-border col-span-1 md:col-span-2">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">👑 DM Assist</h3>
            <p className="text-xs text-muted-foreground">Ask AI to generate content for your DM session — room descriptions, NPC dialogue, encounter setups, plot hooks.</p>
            <Input placeholder="e.g. 'Describe a dimly lit tavern with a suspicious barkeep'" value={dmInstruction} onChange={e => setDmInstruction(e.target.value)} className="text-xs h-8" />
            <Button className="w-full" size="sm" disabled={dmAI.loading || !dmInstruction} onClick={async () => {
              const d = await dmAI.call('/admin/ai-generate', { type: 'dm_assist', instruction: dmInstruction })
              if (d.success && d.text) { setDmResult(d.text); toast({ title: 'Content generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {dmAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate
            </Button>
            {dmResult && <div className="text-xs bg-black/40 rounded p-3 text-green-300 whitespace-pre-wrap">{dmResult}</div>}
          </CardContent>
        </Card>

        {/* Player Biography */}
        <Card className="celtic-border col-span-1 md:col-span-2">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-bold text-sm">📝 Player Biography</h3>
            <p className="text-xs text-muted-foreground">Generate a story for a character based on their stats and history.</p>
            <Input placeholder="Character ID" type="number" value={bioCharId} onChange={e => setBioCharId(e.target.value)} className="text-xs h-8 w-40" />
            <Button size="sm" disabled={bioAI.loading || !bioCharId} onClick={async () => {
              const d = await bioAI.call('/admin/ai-generate', { type: 'biography', charId: parseInt(bioCharId) })
              if (d.success && d.text) { setBioResult(d.text); toast({ title: 'Biography generated!' }) }
              else toast({ title: d.message || 'Generation failed', variant: 'destructive' })
            }}>
              {bioAI.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate Biography
            </Button>
            {bioResult && <div className="text-xs bg-black/40 rounded p-3 text-blue-300 whitespace-pre-wrap italic">{bioResult}</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
