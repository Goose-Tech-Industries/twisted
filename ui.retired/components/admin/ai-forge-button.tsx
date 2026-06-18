"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Sparkles, Loader2, Check, X } from "lucide-react"

interface AiForgeButtonProps {
  entityType: string // 'item' | 'skill' | 'status' | 'npc' | 'quest'
  onGenerated: (data: Record<string, unknown>) => void
  className?: string
}

const ENTITY_PROMPTS: Record<string, { placeholder: string; systemPrompt: string }> = {
  item: {
    placeholder: 'A flaming sword that burns enemies on hit and deals fire damage...',
    systemPrompt: `Generate an RPG item. Return JSON:
{"name":"...","description":"...","icon":"⚔️","type":"WEAPON|ARMOR|ACCESSORY|CONSUMABLE|KEY","value":100,
"bonus_atk":0,"bonus_def":0,"bonus_hp":0,"bonus_mp":0,"bonus_mo":0,"bonus_md":0,"bonus_speed":0,"bonus_luck":0,
"level_req":1,"rarity":"common|uncommon|rare|epic|legendary",
"effects":[{"type":"damage|heal_hp|apply_status|buff_stat|dot","...":"..."}]}`
  },
  skill: {
    placeholder: 'A lightning bolt spell that chains to nearby enemies...',
    systemPrompt: `Generate an RPG skill/ability. Return JSON:
{"name":"...","description":"...","battle_text":"X casts Y!","icon":"⚡","type":"physical|magic|heal|buff|debuff|special",
"target_type":"ENEMY|SELF|ALL_ENEMIES|ALL_ALLIES|ALL",
"effects":[{"type":"damage|heal_hp|apply_status|buff_stat|dot|stun","...":"..."}],
"mp_cost":10,"cooldown":0,"unlock_level":1}`
  },
  status: {
    placeholder: 'A burning status that deals fire damage each turn and reduces defense...',
    systemPrompt: `Generate an RPG status effect. Return JSON:
{"name":"...","description":"...","icon":"🔥","type":"buff|debuff|neutral","default_duration":3,"permanent":false,
"effects":[{"type":"dot|buff_stat|debuff_stat|heal_hp|stun|silence","...":"..."}]}`
  },
  npc: {
    placeholder: 'A grumpy dwarven blacksmith who secretly worships dark gods...',
    systemPrompt: `Generate an RPG NPC. Return JSON:
{"name":"...","persona":"2-3 sentences about personality and speech patterns","icon":"👤",
"npc_level":5,"npc_class":"Blacksmith","base_hp":80,"base_mp":20,"base_atk":12,"base_def":10,
"base_mo":5,"base_md":5,"base_speed":8,"base_luck":5,
"move_type":"STATIONARY|WANDER|PATROL","mood":"happy|fearful|angry|excited",
"is_recruitable":false,"is_enemy":false}`
  },
  quest: {
    placeholder: 'A quest to investigate disappearances in the old mine...',
    systemPrompt: `Generate an RPG quest. Return JSON:
{"title":"...","description":"2-3 sentences","quest_type":"main|side","required_level":1,"is_repeatable":false,
"objectives_json":[{"type":"kill|collect|talk|explore","target":"...","count":5,"label":"..."}],
"rewards_json":{"xp":200,"gold":100,"items":[]}}`
  },
}

export function AiForgeButton({ entityType, onGenerated, className }: AiForgeButtonProps) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const config = ENTITY_PROMPTS[entityType]
  if (!config) return null

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/admin/world-forge/generate', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'npcs', // reuse the generic generate endpoint
          params: { count: 1, role: 'any', theme: prompt, is_enemy: 0 },
          // Override with custom prompt
          customPrompt: `${config.systemPrompt}\n\nUser request: "${prompt}"\n\nRules:\n- Respond with ONLY valid JSON. No markdown.\n- Use emoji for icon fields.\n- Be creative and thematic.`,
        }),
      }).then(r => r.json())

      if (r.success && r.data) {
        // The AI might return nested data — extract the entity
        const data = r.data.npcs?.[0] || r.data
        onGenerated(data as Record<string, unknown>)
        setOpen(false)
        setPrompt('')
      } else {
        setError(r.message || 'AI generation failed')
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  return (
    <div className={cn("relative", className)}>
      <Button size="sm" variant="outline" onClick={() => setOpen(!open)}
        className="text-[10px] h-7 gap-1 border-purple-900/40 text-purple-300 hover:bg-purple-900/20">
        <Sparkles className="w-3 h-3" /> AI Generate
      </Button>

      {open && (
        <div className="absolute z-50 top-8 right-0 w-80 bg-card border border-purple-900/40 rounded-lg shadow-xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-bold text-purple-300">AI Forge</span>
            <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mb-2">Describe what you want in plain language. AI will generate the full {entityType} with stats, effects, and descriptions.</p>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={config.placeholder}
            rows={3}
            className="w-full text-xs bg-input border border-border rounded px-2 py-1.5 resize-none mb-2"
          />
          {error && <p className="text-[10px] text-destructive mb-2">{error}</p>}
          <Button size="sm" onClick={generate} disabled={loading || !prompt.trim()} className="w-full bg-purple-700 hover:bg-purple-600">
            {loading ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Generating...</> : <><Sparkles className="w-3 h-3 mr-1" /> Generate {entityType}</>}
          </Button>
        </div>
      )}
    </div>
  )
}
