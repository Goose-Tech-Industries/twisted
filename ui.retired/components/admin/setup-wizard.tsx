"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Sparkles, ChevronRight, Check } from "lucide-react"

interface Preset {
  id: string; label: string; icon: string; desc: string
  settings: Record<string, string>
}

const PRESETS: Preset[] = [
  {
    id: 'classic_rpg', label: 'Classic RPG', icon: '⚔️',
    desc: 'Turn-based battles, quests, shops, inns, dungeons. Think Final Fantasy, Dragon Quest, Chrono Trigger.',
    settings: {
      enable_limb_targeting: 'false', enable_formations: 'true', enable_brave_default: 'true',
      enable_gathering_skills: 'false', enable_creature_capture: 'false', enable_player_housing: 'false',
      enable_mounts: 'false', enable_seasons: 'false', enable_bounty_boards: 'true',
      enable_bank: 'true', enable_inns: 'true', enable_battle_rating: 'true',
      enable_steal: 'true', enable_auto_battle: 'true', enable_damage_preview: 'true',
    }
  },
  {
    id: 'monster_tamer', label: 'Monster Tamer', icon: '🐉',
    desc: 'Capture and train creatures, build a team, battle other tamers. Creature-focused progression.',
    settings: {
      enable_creature_capture: 'true', enable_formations: 'false', enable_bounty_boards: 'true',
      enable_gathering_skills: 'false', enable_player_housing: 'false', enable_brave_default: 'false',
      enable_mounts: 'true', enable_bank: 'true', enable_battle_rating: 'true',
      enable_steal: 'false', enable_treasure_trails: 'true', enable_seasons: 'true',
      creature_party_max: '6', max_team_size: '6',
    }
  },
  {
    id: 'sandbox_mmo', label: 'Full Sandbox', icon: '🌍',
    desc: 'Everything enabled. Mining, housing, creatures, battles, economy — the full engine. For ambitious projects.',
    settings: {
      enable_gathering_skills: 'true', enable_creature_capture: 'true', enable_player_housing: 'true',
      enable_mounts: 'true', enable_seasons: 'true', enable_bounty_boards: 'true',
      enable_bank: 'true', enable_inns: 'true', enable_treasure_trails: 'true',
      enable_formations: 'true', enable_brave_default: 'true', enable_morale: 'true',
      enable_auto_battle: 'true', enable_damage_preview: 'true',
    }
  },
  {
    id: 'action_rpg', label: 'Action RPG', icon: '🗡️',
    desc: 'Fast-paced combat with loot focus. Crafting, bounties, mounts. Less micromanagement, more action.',
    settings: {
      enable_limb_targeting: 'true', enable_stagger_system: 'true', enable_break_shield: 'true',
      enable_gathering_skills: 'true', enable_creature_capture: 'false', enable_player_housing: 'false',
      enable_mounts: 'true', enable_bank: 'true', enable_bounty_boards: 'true',
      enable_formations: 'false', enable_brave_default: 'false', enable_steal: 'true',
      enable_auto_battle: 'true', enable_battle_chain: 'true',
    }
  },
  {
    id: 'realtime_action', label: 'Real-Time Action', icon: '⚡',
    desc: 'Real-time combat with cooldown-based abilities. Fast-paced action RPG with loot and crafting. Dragon Age / FF7R inspired.',
    settings: {
      combat_mode: 'realtime', enable_realtime_combat: 'true',
      enable_limb_targeting: 'true', enable_stagger_system: 'true',
      enable_gathering_skills: 'true', enable_mounts: 'true',
      enable_bank: 'true', enable_bounty_boards: 'true',
      enable_battle_chain: 'true', enable_steal: 'true',
      enable_creature_capture: 'false', enable_player_housing: 'false',
      enable_formations: 'false', enable_brave_default: 'false',
      enable_auto_battle: 'false', enable_damage_preview: 'true',
    }
  },
  {
    id: 'story_exploration', label: 'Story & Exploration', icon: '📖',
    desc: 'Dialogue-heavy, quest-driven. Minimal combat complexity. Focus on NPCs, world-building, and narrative.',
    settings: {
      enable_limb_targeting: 'false', enable_active_defense: 'false', enable_formations: 'false',
      enable_gathering_skills: 'false', enable_creature_capture: 'false', enable_player_housing: 'false',
      enable_mounts: 'false', enable_bank: 'false', enable_bounty_boards: 'false',
      enable_brave_default: 'false', enable_morale: 'false',
      enable_auto_battle: 'true', enable_inns: 'true', enable_nonlethal: 'true',
      enable_rp_descriptions: 'true', enable_battle_narration: 'true',
    }
  },
]

interface SetupWizardProps {
  onComplete: () => void
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [gameName, setGameName] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const preset = PRESETS.find(p => p.id === selectedPreset)
    const settings: Record<string, string> = { ...(preset?.settings || {}) }
    if (gameName) settings['game_name'] = gameName

    try {
      const API = process.env.NEXT_PUBLIC_API_URL || ''
      await fetch(`${API}/admin-panel/setup-wizard`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: selectedPreset, settings }),
      })
      onComplete()
    } catch {}
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <div className="bg-card border border-primary/30 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {step === 0 && (
          <div className="p-8 text-center">
            <Sparkles className="w-16 h-16 text-primary mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Welcome to Twisted Engine</h1>
            <p className="text-muted-foreground mb-6">Let's set up your game. This wizard configures which systems are active so you're not overwhelmed by features you don't need.</p>
            <p className="text-xs text-muted-foreground mb-8">You can change everything later in Settings. This just sets your starting point.</p>
            <div className="space-y-3 max-w-md mx-auto mb-8">
              <label className="text-sm text-muted-foreground block text-left">What's your game called?</label>
              <input value={gameName} onChange={e => setGameName(e.target.value)}
                placeholder="My RPG" className="w-full px-4 py-3 bg-input border border-border rounded-lg text-lg text-center" />
            </div>
            <Button size="lg" onClick={() => setStep(1)} className="px-8">
              Choose Game Type <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-2">What kind of game are you making?</h2>
            <p className="text-muted-foreground mb-6 text-sm">Pick a starting template. This enables the right systems and hides the rest. You can always enable more later.</p>
            <div className="grid grid-cols-1 gap-3 mb-8">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => setSelectedPreset(p.id)}
                  className={cn("flex items-start gap-4 p-4 rounded-xl border text-left transition-all",
                    selectedPreset === p.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "border-border hover:border-primary/30 hover:bg-card"
                  )}>
                  <span className="text-3xl">{p.icon}</span>
                  <div className="flex-1">
                    <div className="font-bold text-sm flex items-center gap-2">
                      {p.label}
                      {selectedPreset === p.id && <Check className="w-4 h-4 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={save} disabled={!selectedPreset || saving} size="lg" className="px-8">
                {saving ? 'Setting up...' : 'Launch Engine'} <Sparkles className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
