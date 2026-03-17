"use client"

import { useState, useEffect, useCallback } from 'react'
import { useGame } from '@/lib/game-context'
import { api } from '@/lib/game-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  const { state, actions } = useGame()
  const [isOpen, setIsOpen] = useState(false)
  const [maps, setMaps] = useState<WorldMap[]>([])
  const [filter, setFilter] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  
  const myLevel = state.character?.level || 1
  const currentMapId = state.character?.mapId
  
  // Load maps
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
  
  // Keyboard shortcut
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !e.ctrlKey && !e.metaKey) {
        // Don't trigger if typing in input
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
        setIsOpen(prev => !prev)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])
  
  const travel = useCallback((map: WorldMap) => {
    if (!confirm(`Fast travel to ${map.name}?`)) return
    
    const spawnX = Math.floor((map.width || 20) / 2)
    const spawnY = Math.floor((map.height || 20) / 2)
    actions.teleport(map.id, spawnX, spawnY)
    actions.notify('info', `Travelling to ${map.name}...`)
    setIsOpen(false)
  }, [actions])
  
  // Filter and categorize maps
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
  
  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 gap-2 celtic-border"
      >
        <Map className="w-4 h-4" />
        World Map [M]
      </Button>
    )
  }
  
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Map className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-bold text-accent tracking-wide">WORLD MAP</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter zones..."
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="pl-9 w-48"
              />
            </div>
            <Button variant="outline" onClick={() => setIsOpen(false)} className="gap-2">
              [M] Close
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-center text-muted-foreground py-20 animate-pulse">
            Loading world data...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">
            {maps.length === 0 ? 'No maps in database yet.' : 'No maps match your search.'}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Current Location */}
            {current.length > 0 && (
              <section>
                <h2 className="text-xs text-accent uppercase tracking-wider mb-3 pb-1 border-b border-border">
                  Current Location
                </h2>
                {current.map(map => (
                  <MapCard
                    key={map.id}
                    map={map}
                    state="current"
                    sizeLabel={getSizeLabel(map)}
                  />
                ))}
              </section>
            )}
            
            {/* Accessible */}
            {accessible.length > 0 && (
              <section>
                <h2 className="text-xs text-accent uppercase tracking-wider mb-3 pb-1 border-b border-border">
                  Fast Travel Available ({accessible.length})
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accessible.map(map => (
                    <MapCard
                      key={map.id}
                      map={map}
                      state="accessible"
                      sizeLabel={getSizeLabel(map)}
                      onTravel={() => travel(map)}
                    />
                  ))}
                </div>
              </section>
            )}
            
            {/* Locked */}
            {locked.length > 0 && (
              <section>
                <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">
                  Locked / No Fast Travel
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {locked.map(map => (
                    <MapCard
                      key={map.id}
                      map={map}
                      state="locked"
                      sizeLabel={getSizeLabel(map)}
                      myLevel={myLevel}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
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
  const minLevel = map.min_level || 1
  
  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-colors",
        isCurrent && "border-primary/50 bg-primary/5",
        isAccessible && "border-accent/30 bg-card hover:bg-accent/10 cursor-pointer",
        isLocked && "border-border bg-secondary/20 opacity-60"
      )}
      onClick={isAccessible ? onTravel : undefined}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {isCurrent && <MapPin className="w-4 h-4 text-primary" />}
          {isLocked && <Lock className="w-4 h-4 text-muted-foreground" />}
          <span className={cn(
            "font-semibold",
            isCurrent && "text-primary",
            isLocked && "text-muted-foreground"
          )}>
            {map.name}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase">{sizeLabel}</span>
      </div>
      
      {map.description && (
        <p className={cn(
          "text-xs mb-3 line-clamp-2",
          isLocked ? "text-muted-foreground/50" : "text-muted-foreground"
        )}>
          {map.description}
        </p>
      )}
      
      <div className="flex items-center justify-between text-[10px]">
        {isLocked ? (
          <span className="text-muted-foreground">
            {map.fast_travel_enabled === 0 ? 'No fast travel' : `Level ${minLevel} required`}
          </span>
        ) : isCurrent ? (
          <span className="text-primary">You are here</span>
        ) : (
          <span className="text-accent flex items-center gap-1">
            <Plane className="w-3 h-3" />
            Fast travel
          </span>
        )}
        <span className="text-muted-foreground">{map.width}x{map.height}</span>
      </div>
    </div>
  )
}
