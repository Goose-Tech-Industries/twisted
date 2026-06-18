"use client"
import React from 'react'

import { useState, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { api } from '@/lib/game-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Map, X, Search, Plane, Lock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorldMap {
  id: number
  name: string
  description?: string
  width: number
  height: number
  fast_travel_enabled?: number
  min_level?: number
}

export function WorldMapOverlay() {
  const { state, teleport, notify, fastTravel } = useGame()
  const [isOpen, setIsOpen] = useState(false)
  const [maps, setMaps] = useState<WorldMap[]>([])
  const [filter, setFilter] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const myLevel = state.character?.level || 1
  const currentMapId = state.character?.mapId

  const loadMaps = useCallback(async () => {
    setIsLoading(true)
    const res = await api.game.getAllMaps()
    if (res.success && res.data) {
      setMaps(res.data.maps)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    if (isOpen && maps.length === 0) {
      loadMaps()
    }
  }, [isOpen, maps.length, loadMaps])

  // Keyboard shortcut + custom event listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
        setIsOpen(prev => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    const handleOpen = () => setIsOpen(true)
    window.addEventListener('keydown', handleKey)
    window.addEventListener('open-world-map', handleOpen)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('open-world-map', handleOpen)
    }
  }, [isOpen])

  const travel = useCallback((map: WorldMap) => {
    if (!confirm(`Fast travel to ${map.name}?`)) return
    fastTravel(map.id)
    notify('info', `Travelling to ${map.name}...`)
    setIsOpen(false)
  }, [fastTravel, notify])

  // Filter and categorize
  const filtered = filter
    ? maps.filter(m =>
        m.name.toLowerCase().includes(filter.toLowerCase()) ||
        (m.description || '').toLowerCase().includes(filter.toLowerCase())
      )
    : maps

  const current = filtered.filter(m => m.id === currentMapId)
  const accessible = filtered.filter(m =>
    m.id !== currentMapId &&
    (m.fast_travel_enabled !== 0) &&
    (m.min_level || 1) <= myLevel
  )
  const locked = filtered.filter(m =>
    m.id !== currentMapId &&
    ((m.fast_travel_enabled === 0) || (m.min_level || 1) > myLevel)
  )

  const getSizeLabel = (map: WorldMap) => {
    const area = (map.width || 20) * (map.height || 20)
    if (area < 500) return 'Small'
    if (area < 2000) return 'Medium'
    return 'Large'
  }

  // ── Shared map list content ───────────────────────────────────
  const mapContent = (
    <>
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Filter zones..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-16 animate-pulse">
          Loading world data...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">
          {maps.length === 0 ? 'No maps in database yet.' : 'No maps match your search.'}
        </div>
      ) : (
        <div className="space-y-5">
          {current.length > 0 && (
            <section>
              <h2 className="text-[10px] text-accent uppercase tracking-wider mb-2 pb-1 border-b border-border font-bold">
                Current Location
              </h2>
              {current.map(map => (
                <MapCard key={map.id} map={map} state="current" sizeLabel={getSizeLabel(map)} />
              ))}
            </section>
          )}

          {accessible.length > 0 && (
            <section>
              <h2 className="text-[10px] text-accent uppercase tracking-wider mb-2 pb-1 border-b border-border font-bold">
                Fast Travel ({accessible.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {accessible.map(map => (
                  <MapCard key={map.id} map={map} state="accessible" sizeLabel={getSizeLabel(map)} onTravel={() => travel(map)} />
                ))}
              </div>
            </section>
          )}

          {locked.length > 0 && (
            <section>
              <h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 pb-1 border-b border-border font-bold">
                Locked / No Fast Travel
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {locked.map(map => (
                  <MapCard key={map.id} map={map} state="locked" sizeLabel={getSizeLabel(map)} myLevel={myLevel} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  )

  return (
    <>
      {/* ── Trigger button: desktop only (floating), mobile uses map panel button ── */}
      {!isOpen && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="hidden md:flex fixed bottom-4 right-4 z-40 gap-2 celtic-border"
        >
          <Map className="w-4 h-4" />
          World Map [M]
        </Button>
      )}

      {/* ── Mobile: bottom sheet ── */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="bottom" className="md:hidden p-0 bg-card border-border rounded-t-2xl h-[85dvh] flex flex-col [&>button:last-child]:hidden">
          {/* Drag handle + header */}
          <div className="shrink-0 px-4 pt-2 pb-3 border-b border-border">
            <div className="flex justify-center mb-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Map className="w-5 h-5 text-accent" />
                <h2 className="text-base font-bold text-accent">World Map</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
            {mapContent}
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Desktop: full-screen overlay ── */}
      {isOpen && (
        <div className="hidden md:block fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto overscroll-contain">
          <div className="max-w-4xl mx-auto p-6">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <Map className="w-6 h-6 text-accent" />
                <h1 className="text-xl font-bold text-accent tracking-wide">WORLD MAP</h1>
              </div>
              <Button variant="outline" onClick={() => setIsOpen(false)} className="gap-2">
                [M] Close <X className="w-4 h-4" />
              </Button>
            </div>
            {mapContent}
          </div>
        </div>
      )}
    </>
  )
}

// ── Trigger button for the map panel header ─────────────────────
export function WorldMapButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.dispatchEvent(new CustomEvent('open-world-map'))}
      className="gap-1.5"
    >
      <Map className="w-4 h-4" />
      <span className="text-xs">World Map</span>
    </Button>
  )
}

function MapCard({
  map,
  state,
  sizeLabel,
  myLevel,
  onTravel
}: {
  map: WorldMap
  state: 'current' | 'accessible' | 'locked'
  sizeLabel: string
  myLevel?: number
  onTravel?: () => void
}) {
  const isCurrent = state === 'current'
  const isAccessible = state === 'accessible'
  const isLocked = state === 'locked'

  return (
    <div
      className={cn(
        "p-3 rounded-lg border transition-colors",
        isCurrent && "border-primary/50 bg-primary/5",
        isAccessible && "border-accent/30 bg-card active:bg-accent/10 cursor-pointer",
        isLocked && "border-border bg-secondary/20 opacity-60"
      )}
      onClick={isAccessible ? onTravel : undefined}
    >
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-2">
          {isCurrent && <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />}
          {isLocked && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className={cn(
            "font-semibold text-sm",
            isCurrent && "text-primary",
            isLocked && "text-muted-foreground"
          )}>
            {map.name}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase shrink-0">{sizeLabel}</span>
      </div>

      {map.description && (
        <p className={cn(
          "text-xs mb-2 line-clamp-2",
          isLocked ? "text-muted-foreground/50" : "text-muted-foreground"
        )}>
          {map.description}
        </p>
      )}

      <div className="flex items-center justify-between text-[10px]">
        {isLocked ? (
          <span className="text-muted-foreground">
            {map.fast_travel_enabled === 0 ? 'No fast travel' : `Level ${map.min_level || 1} required`}
          </span>
        ) : isCurrent ? (
          <span className="text-primary">You are here</span>
        ) : (
          <span className="text-accent flex items-center gap-1">
            <Plane className="w-3 h-3" /> Fast travel
          </span>
        )}
        <span className="text-muted-foreground">{map.width}x{map.height}</span>
      </div>
    </div>
  )
}
