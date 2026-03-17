"use client"

import React, { useState, useEffect, useCallback } from "react"
import { useGame } from "@/lib/game-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skull, Loader2, AlertCircle, Swords, Shield, Zap, Plus, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

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
interface GameRace  { id: number; name: string; description?: string }
interface Background { id: number; name: string; description?: string }

// ── Component ─────────────────────────────────────────────────────
export function CharacterSelect() {
  const { loadCharacter, logout } = useGame()

  const [view, setView]             = useState<'loading' | 'select' | 'create'>('loading')
  const [chars, setChars]           = useState<ExistingChar[]>([])
  const [classes, setClasses]       = useState<GameClass[]>([])
  const [races, setRaces]           = useState<GameRace[]>([])
  const [backgrounds, setBgs]       = useState<Background[]>([])
  const [error, setError]           = useState<string | null>(null)
  const [creating, setCreating]     = useState(false)
  const [selecting, setSelecting]   = useState<number | null>(null)
  const [name, setName]             = useState('')
  const [classId, setClassId]       = useState(0)
  const [raceId, setRaceId]         = useState(0)
  const [bgId, setBgId]             = useState(0)

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

  // Select existing character
  const handleSelect = async (id: number) => {
    setSelecting(id)
    await loadCharacter(id)
    setSelecting(null)
  }

  // Create new character
  const handleCreate = async () => {
    setError(null)
    if (!name.trim())  return setError('Enter a character name')
    if (!classId)      return setError('Select a class')
    if (!raceId)       return setError('Select a race')

    setCreating(true)
    try {
      const res = await fetch('/game/create-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), classId, raceId, backgroundId: bgId, featId: 0 })
      })
      const data = await res.json()

      if (data.success) {
        // Reload character list and pick the newest
        const updRes = await fetch('/game/my-characters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' }).then(r => r.json()).catch(() => ({ characters: [] }))
        const updated = (updRes?.characters || []) as ExistingChar[]
        if (updated?.length > 0) {
          const newest = updated.reduce((a, b) => a.id > b.id ? a : b)
          await loadCharacter(newest.id)
        }
      } else {
        setError(data.message || 'Failed to create character')
      }
    } catch {
      setError('Server error — please try again')
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
            {chars.map(char => (
              <button
                key={char.id}
                type="button"
                disabled={selecting !== null}
                onClick={() => handleSelect(char.id)}
                className="w-full text-left p-4 rounded-lg border border-border bg-card hover:border-primary/60 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-lg text-primary">{char.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Level {char.level} · {char.race_name} {char.class_name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      HP {char.current_hp}/{char.max_hp}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selecting === char.id
                      ? <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      : <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    }
                  </div>
                </div>
              </button>
            ))}

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

              {/* Class */}
              {classes.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Swords className="w-4 h-4 text-primary" /> Class
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {classes.map(cls => (
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
                </div>
              )}

              {/* Race */}
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
                        onClick={() => setRaceId(race.id)}
                        className={cn(
                          "p-3 rounded-lg border text-sm text-left transition-all",
                          raceId === race.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card hover:border-primary/40 text-foreground"
                        )}
                      >
                        <p className="font-semibold">{race.name}</p>
                        {race.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{race.description}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Background (optional) */}
              {backgrounds.length > 0 && (
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
                  onClick={handleCreate}
                  disabled={creating || !name.trim() || !classId || !raceId}
                  className="flex-1 blood-glow"
                >
                  {creating
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Forging...</>
                    : 'Enter the Void'
                  }
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

      </div>
    </div>
  )
}
