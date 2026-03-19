"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skull, Loader2, AlertCircle, Swords, Shield, Zap, Plus, ChevronRight, Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import { CharacterAppearanceCreator, type AppearanceData } from "./character-appearance-creator"
import { AbilityScoreAllocator, type AbilityScoreDef, type AbilityEffect, type RaceAbilityBonus } from "./ability-score-allocator"

// ── Types ─────────────────────────────────────────────────────────
interface ExistingChar {
  id: number
  name: string
  level: number
  class_name: string
  race_name: string
  current_hp: number
  max_hp: number
}

interface GameClass { id: number; name: string; description?: string }
interface GameRace  { id: number; name: string; description?: string; icon?: string }
interface Background { id: number; name: string; description?: string }

// ── Component ─────────────────────────────────────────────────────
export function CharacterSelect() {
  const { loadCharacter, logout } = useGame()

  const [view, setView]             = useState<'loading' | 'select' | 'create' | 'abilities' | 'appearance'>('loading')
  const [chars, setChars]           = useState<ExistingChar[]>([])
  const [classes, setClasses]       = useState<GameClass[]>([])
  const [races, setRaces]           = useState<GameRace[]>([])
  const [backgrounds, setBgs]       = useState<Background[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [creating, setCreating]     = useState(false)
  const [selecting, setSelecting]   = useState<number | null>(null)
  const [revivalItems, setRevivalItems] = useState<Array<{ item_id: number; name: string; icon: string; description: string; stats_json: string; quantity: number }>>([])
  const [name, setName]             = useState('')
  const [classId, setClassId]       = useState(0)
  const [raceId, setRaceId]         = useState(0)
  const [bgId, setBgId]             = useState(0)
  const [abilityScores, setAbilityScores] = useState<AbilityScoreDef[]>([])
  const [abilityEffects, setAbilityEffects] = useState<AbilityEffect[]>([])
  const [raceAbilityBonuses, setRaceAbilityBonuses] = useState<RaceAbilityBonus[]>([])
  const [classAbilityBonuses, setClassAbilityBonuses] = useState<RaceAbilityBonus[]>([])
  const [bgAbilityBonuses, setBgAbilityBonuses] = useState<RaceAbilityBonus[]>([])
  const [raceClassAccess, setRaceClassAccess] = useState<Array<{ race_id: number; class_id: number }>>([])
  const [abilityBudget, setAbilityBudget] = useState(27)
  const [allocatedScores, setAllocatedScores] = useState<Record<string, number>>({})

  // Load everything on mount
  const loadData = useCallback(async () => {
    setView('loading')
    try {
      // Fetch both in parallel
      const [charsRes, creationData] = await Promise.all([
        fetch('/game/my-characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }).then(r => r.json()).catch(() => ({ success: false })),
        fetch('/game/creation-data', { credentials: 'include' }).then(r => r.json()).catch(() => ({ success: false }))
      ])
      const charsData = charsRes?.characters || []

      // Set creation data
      if (creationData?.success && creationData?.data) {
        const cls: GameClass[] = creationData.data.classes || []
        const rcs: GameRace[]  = creationData.data.races   || []
        setClasses(cls)
        setRaces(rcs)
        setBgs(creationData.data.backgrounds || [])
        setAbilityScores(creationData.data.abilityScores || [])
        setAbilityEffects(creationData.data.abilityEffects || [])
        setRaceAbilityBonuses(creationData.data.raceAbilityBonuses || [])
        setClassAbilityBonuses(creationData.data.classAbilityBonuses || [])
        setBgAbilityBonuses(creationData.data.bgAbilityBonuses || [])
        setRaceClassAccess(creationData.data.raceClassAccess || [])
        if (creationData.config?.ability_point_budget) setAbilityBudget(parseInt(creationData.config.ability_point_budget) || 27)
        if (cls.length > 0) setClassId(cls[0].id)
        if (rcs.length > 0) setRaceId(rcs[0].id)
      }

      // Set characters
      const list = (charsData || []) as ExistingChar[]
      setChars(list)
      setView(list.length > 0 ? 'select' : 'create')
    } catch (e) {
      setView('create')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Load revival items
  useEffect(() => {
    fetch('/game/revival-items', { credentials: 'include' })
      .then(r => r.json()).then(d => { if (d.success) setRevivalItems(d.data || []) })
      .catch(() => {})
  }, [chars])

  // Select existing character
  const handleSelect = async (id: number) => {
    setSelecting(id)
    await loadCharacter(id)
    setSelecting(null)
  }

  // Revive a dead character with a revival item
  const handleRevive = async (char: ExistingChar, itemId: number, itemName: string) => {
    if (!window.confirm(`Use ${itemName} to revive ${char.name}?`)) return
    try {
      const res = await fetch('/game/revive-character', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ charId: char.id, itemId })
      })
      const data = await res.json()
      if (data.success) {
        // Update the character's HP in the list
        setChars(prev => prev.map(c => c.id === char.id ? { ...c, current_hp: data.newHp } : c))
        setRevivalItems(prev => prev.map(ri =>
          ri.item_id === itemId ? { ...ri, quantity: ri.quantity - 1 } : ri
        ).filter(ri => ri.quantity > 0))
        setError(null)
      } else {
        setError(data.message || 'Revival failed')
      }
    } catch { setError('Server error') }
  }

  // Release a dead character
  const handleRelease = async (char: ExistingChar) => {
    if (!window.confirm(`Release ${char.name} to the void?\n\nThis permanently deletes this character, all their items, equipment, and progress.\n\nThis cannot be undone.`)) return
    try {
      const res = await fetch('/game/release-character', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ charId: char.id })
      })
      const data = await res.json()
      if (data.success) {
        setChars(prev => prev.filter(c => c.id !== char.id))
        if (chars.length <= 1) setView('create')
      } else {
        setError(data.message || 'Failed to release character')
      }
    } catch { setError('Server error') }
  }

  // Step 1: Validate and go to ability scores
  const handleProceedToAppearance = () => {
    setError(null)
    if (!name.trim())  return setError('Enter a character name')
    if (!classId)      return setError('Select a class')
    if (!raceId)       return setError('Select a race')
    setView(abilityScores.length > 0 ? 'abilities' : 'appearance')
  }

  // Step 2: Create character with appearance
  const handleCreate = async (appearanceData?: AppearanceData) => {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/game/create-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), classId, raceId, backgroundId: bgId, featId: 0, abilityScores: allocatedScores })
      })
      const data = await res.json()

      if (data.success) {
        // Save appearance if provided
        if (appearanceData && data.charId) {
          await fetch('/game/update-appearance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ charId: data.charId, appearance: appearanceData })
          }).catch(() => {})
        }
        // Reload character list and pick the newest
        const updRes = await fetch('/game/my-characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }).then(r => r.json()).catch(() => ({ characters: [] }))
        const updated = (updRes?.characters || []) as ExistingChar[]
        if (updated?.length > 0) {
          const newest = updated.reduce((a, b) => a.id > b.id ? a : b)
          await loadCharacter(newest.id)
        }
      } else {
        setError(data.message || 'Failed to create character')
        setView('create')
      }
    } catch {
      setError('Server error — please try again')
      setView('create')
    }
    setCreating(false)
  }

  // ── Loading ────────────────────────────────────────────────────
  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Entering the void...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

      <div className="relative z-10 w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/30 mb-4">
            <Skull className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-wider text-foreground">
            {view === 'select' ? 'Choose Your Soul' : 'Forge Your Soul'}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {view === 'select' ? 'Select a character to enter the realm' : 'Create your warrior'}
          </p>
        </div>

        {/* ── SELECT VIEW ─────────────────────────────────────── */}
        {view === 'select' && (
          <div className="space-y-3">
            {chars.map(char => {
              const isDead = char.current_hp <= 0
              return (
                <div key={char.id} className={cn(
                  "rounded-lg border bg-card transition-all",
                  isDead ? "border-destructive/40 opacity-75" : "border-border hover:border-primary/60"
                )}>
                  <button
                    type="button"
                    disabled={selecting !== null || isDead}
                    onClick={() => handleSelect(char.id)}
                    className="w-full text-left p-4 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={cn("font-bold text-lg", isDead ? "text-destructive/70 line-through" : "text-primary")}>
                          {char.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Level {char.level} · {char.race_name} {char.class_name}
                        </p>
                        <p className={cn("text-xs mt-0.5", isDead ? "text-destructive" : "text-muted-foreground")}>
                          {isDead ? "Fallen in battle" : `HP ${char.current_hp}/${char.max_hp}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isDead ? (
                          <Skull className="w-5 h-5 text-destructive/60" />
                        ) : selecting === char.id ? (
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </button>
                  {isDead && (
                    <div className="px-4 pb-3 pt-0 space-y-2">
                      {/* Revival items */}
                      {revivalItems.length > 0 && (
                        <div className="space-y-1.5">
                          {revivalItems.map(item => {
                            let pct = 50
                            try { pct = JSON.parse(item.stats_json || '{}').revival_pct || 50 } catch {}
                            return (
                              <button key={item.item_id}
                                onClick={() => handleRevive(char, item.item_id, item.name)}
                                className="w-full flex items-center gap-3 py-2 px-3 rounded border border-primary/30 bg-primary/10 text-sm hover:bg-primary/20 transition-colors text-left"
                              >
                                <span className="text-lg">{item.icon}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-primary">{item.name}</p>
                                  <p className="text-[10px] text-muted-foreground">Revives at {pct}% HP &middot; {item.quantity} owned</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {revivalItems.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          No revival items. Find a Breath of Danu or Tear of Brigid to bring them back.
                        </p>
                      )}
                      <button
                        onClick={() => handleRelease(char)}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded border border-destructive/30 bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 transition-colors"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        Release to the Void (permanent)
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            <Card
              className="celtic-border cursor-pointer hover:border-primary/40 transition-all border-dashed opacity-70 hover:opacity-100"
              onClick={() => setView('create')}
            >
              <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
                <Plus className="w-5 h-5" />
                <span className="text-sm">Create a new character</span>
              </CardContent>
            </Card>

            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground text-xs">
                Sign out
              </Button>
            </div>
          </div>
        )}

        {/* ── CREATE VIEW ─────────────────────────────────────── */}
        {view === 'create' && (
          <Card className="celtic-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">New Character</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  placeholder="Name your soul..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="bg-input"
                  maxLength={20}
                />
              </div>

              {/* Race (pick first) */}
              {races.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-primary" /> Race
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {races.map(race => (
                      <button
                        key={race.id}
                        type="button"
                        onClick={() => { setRaceId(race.id); setClassId(0) }}
                        className={cn(
                          "p-3 rounded-lg border text-sm text-left transition-all",
                          raceId === race.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary/40 text-foreground"
                        )}
                      >
                        <p className="font-semibold">{race.icon ? `${race.icon} ` : ''}{race.name}</p>
                        {race.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{race.description}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Class (filtered by race access) */}
              {classes.length > 0 && raceId > 0 && (() => {
                const accessibleClassIds = raceClassAccess.length > 0
                  ? new Set(raceClassAccess.filter(a => a.race_id === raceId).map(a => a.class_id))
                  : null // null means no restrictions (all allowed)
                const availableClasses = accessibleClassIds
                  ? classes.filter(c => accessibleClassIds.has(c.id))
                  : classes
                return (
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Swords className="w-4 h-4 text-primary" /> Class
                      {accessibleClassIds && availableClasses.length < classes.length && (
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({availableClasses.length} available for {races.find(r => r.id === raceId)?.name})
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableClasses.map(cls => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => setClassId(cls.id)}
                          className={cn(
                            "p-3 rounded-lg border text-sm text-left transition-all",
                            classId === cls.id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card hover:border-primary/40 text-foreground"
                          )}
                        >
                          <p className="font-semibold">{cls.name}</p>
                          {cls.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cls.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                    {availableClasses.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">No classes available for this race.</p>
                    )}
                  </div>
                )
              })()}

              {/* Background (optional) */}
              {backgrounds.length > 0 && raceId > 0 && classId > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-primary" /> Background
                    <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {backgrounds.map(bg => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setBgId(bgId === bg.id ? 0 : bg.id)}
                        className={cn(
                          "p-3 rounded-lg border text-sm text-left transition-all",
                          bgId === bg.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary/40 text-foreground"
                        )}
                      >
                        <p className="font-semibold">{bg.name}</p>
                        {bg.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{bg.description}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                {chars.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setView('select')}
                    className="flex-1"
                  >
                    Back
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleProceedToAppearance}
                  disabled={creating || !name.trim() || !classId || !raceId}
                  className="flex-1 blood-glow"
                >
                  {abilityScores.length > 0 ? 'Allocate Abilities' : 'Customize Appearance'} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>

              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="text-muted-foreground text-xs"
                >
                  Sign out
                </Button>
              </div>

            </CardContent>
          </Card>
        )}

        {/* ── Ability Score Allocation ── */}
        {view === 'abilities' && (
          <Card className="celtic-border w-full max-w-2xl">
            <CardContent className="p-6">
              <AbilityScoreAllocator
                abilities={abilityScores}
                effects={abilityEffects}
                raceBonuses={raceAbilityBonuses}
                classBonuses={classAbilityBonuses}
                bgBonuses={bgAbilityBonuses}
                raceId={raceId}
                raceName={races.find(r => r.id === raceId)?.name || 'Human'}
                classId={classId}
                className={classes.find(c => c.id === classId)?.name}
                bgId={bgId}
                bgName={backgrounds.find(b => b.id === bgId)?.name}
                budget={abilityBudget}
                onComplete={(scores) => { setAllocatedScores(scores); setView('appearance') }}
                onBack={() => setView('create')}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Appearance Customization ── */}
        {view === 'appearance' && (
          <Card className="celtic-border w-full max-w-2xl">
            <CardContent className="p-6">
              {creating ? (
                <div className="text-center py-12">
                  <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
                  <p className="text-muted-foreground">Forging your destiny...</p>
                </div>
              ) : (
                <CharacterAppearanceCreator
                  raceName={races.find(r => r.id === raceId)?.name || 'Human'}
                  onComplete={(appearance) => handleCreate(appearance)}
                  onBack={() => setView(abilityScores.length > 0 ? 'abilities' : 'create')}
                />
              )}
              {error && (
                <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
