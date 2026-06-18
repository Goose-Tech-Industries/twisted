"use client"

import { useState, useCallback } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { 
  MapPin, 
  User,
  Skull,
  Store,
  MessageCircle,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Lock
} from "lucide-react"

// Simple tile-based map representation
const TILE_SIZE = 32
const MAP_WIDTH = 20
const MAP_HEIGHT = 15

// Tile types: 0 = floor, 1 = wall, 2 = water, 3 = door, 4 = chest
const MOCK_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,4,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,3,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,0,0,1],
  [1,0,0,2,2,2,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,2,2,2,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,2,2,2,0,0,0,0,0,0,0,0,0,1,0,0,4,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]

interface MapEntity {
  id: number
  type: 'npc' | 'enemy' | 'shop' | 'player'
  name: string
  x: number
  y: number
  interactable: boolean
}

const MOCK_ENTITIES: MapEntity[] = [
  { id: 1, type: 'player', name: 'You', x: 5, y: 5, interactable: false },
  { id: 2, type: 'npc', name: 'Elder Mira', x: 2, y: 2, interactable: true },
  { id: 3, type: 'shop', name: 'Blacksmith', x: 10, y: 3, interactable: true },
  { id: 4, type: 'enemy', name: 'Forest Wolf', x: 14, y: 10, interactable: true },
  { id: 5, type: 'npc', name: 'Guard Captain', x: 17, y: 9, interactable: true },
]

const TILE_COLORS: Record<number, string> = {
  0: 'bg-card/50',
  1: 'bg-muted',
  2: 'bg-[oklch(0.35_0.12_260)]',
  3: 'bg-[oklch(0.45_0.10_85)]',
  4: 'bg-[oklch(0.55_0.15_85)]',
}

export function MapPanel() {
  const { state, dispatch } = useGame()
  const { notify } = useNotification()
  
  const [playerPos, setPlayerPos] = useState({ x: 5, y: 5 })
  const [selectedEntity, setSelectedEntity] = useState<MapEntity | null>(null)
  
  const isPassable = (x: number, y: number) => {
    if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false
    const tile = MOCK_MAP[y]?.[x]
    return tile === 0 || tile === 3 || tile === 4
  }
  
  const movePlayer = useCallback((dx: number, dy: number) => {
    const newX = playerPos.x + dx
    const newY = playerPos.y + dy
    
    if (isPassable(newX, newY)) {
      setPlayerPos({ x: newX, y: newY })
      
      // Check for entities at new position
      const entity = MOCK_ENTITIES.find(e => e.x === newX && e.y === newY && e.type !== 'player')
      if (entity) {
        handleInteract(entity)
      }
      
      // Check for special tiles
      const tile = MOCK_MAP[newY][newX]
      if (tile === 4) {
        notify('item', 'Found a chest! +50 Gold')
      }
    }
  }, [playerPos])
  
  const handleInteract = (entity: MapEntity) => {
    setSelectedEntity(entity)
    
    if (entity.type === 'enemy') {
      notify('warning', `${entity.name} attacks!`)
    } else if (entity.type === 'npc') {
      dispatch({ type: 'SET_DIALOGUE', payload: {
        speaker: entity.name,
        text: `Greetings, traveler. The roads have grown dangerous of late.`,
        choices: [
          { id: 1, label: 'Tell me more' },
          { id: 2, label: 'Farewell' }
        ]
      }})
    } else if (entity.type === 'shop') {
      notify('info', `Welcome to the ${entity.name}!`)
    }
  }
  
  // Handle keyboard movement
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
        movePlayer(0, -1)
        break
      case 'ArrowDown':
      case 's':
        movePlayer(0, 1)
        break
      case 'ArrowLeft':
      case 'a':
        movePlayer(-1, 0)
        break
      case 'ArrowRight':
      case 'd':
        movePlayer(1, 0)
        break
    }
  }, [movePlayer])
  
  const getEntityIcon = (type: string) => {
    switch (type) {
      case 'player': return User
      case 'npc': return MessageCircle
      case 'enemy': return Skull
      case 'shop': return Store
      default: return MapPin
    }
  }
  
  const getEntityColor = (type: string) => {
    switch (type) {
      case 'player': return 'bg-primary text-primary-foreground'
      case 'npc': return 'bg-[oklch(0.55_0.12_185)] text-white'
      case 'enemy': return 'bg-destructive text-destructive-foreground'
      case 'shop': return 'bg-[oklch(0.65_0.15_85)] text-black'
      default: return 'bg-muted text-muted-foreground'
    }
  }
  
  return (
    <div className="flex h-full" tabIndex={0} onKeyDown={handleKeyDown}>
      {/* Map View */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Map Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary" />
                Dun Aengus - Town Square
              </h2>
              <p className="text-sm text-muted-foreground">
                Position: ({playerPos.x}, {playerPos.y})
              </p>
            </div>
            
            {/* Legend */}
            <div className="flex gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-primary" />
                <span>Player</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[oklch(0.55_0.12_185)]" />
                <span>NPC</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive" />
                <span>Enemy</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-[oklch(0.65_0.15_85)]" />
                <span>Shop</span>
              </div>
            </div>
          </div>
          
          {/* Map Grid */}
          <Card className="celtic-border overflow-hidden">
            <CardContent className="p-4">
              <div 
                className="relative inline-grid gap-px bg-border rounded overflow-hidden"
                style={{ 
                  gridTemplateColumns: `repeat(${MAP_WIDTH}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(${MAP_HEIGHT}, ${TILE_SIZE}px)`
                }}
              >
                {/* Tiles */}
                {MOCK_MAP.map((row, y) => 
                  row.map((tile, x) => (
                    <div
                      key={`${x}-${y}`}
                      className={cn(
                        "flex items-center justify-center text-xs transition-all",
                        TILE_COLORS[tile],
                        tile === 3 && "border border-[oklch(0.45_0.10_85)]/50",
                        tile === 4 && "animate-pulse-slow"
                      )}
                      onClick={() => {
                        if (isPassable(x, y) && Math.abs(x - playerPos.x) <= 1 && Math.abs(y - playerPos.y) <= 1) {
                          const dx = x - playerPos.x
                          const dy = y - playerPos.y
                          if (dx !== 0 || dy !== 0) movePlayer(dx, dy)
                        }
                      }}
                    >
                      {tile === 3 && <Lock className="w-3 h-3 text-[oklch(0.65_0.10_85)]" />}
                      {tile === 4 && <span className="text-[oklch(0.75_0.15_85)]">?</span>}
                    </div>
                  ))
                )}
                
                {/* Entities */}
                {MOCK_ENTITIES.map(entity => {
                  const Icon = getEntityIcon(entity.type)
                  const isPlayer = entity.type === 'player'
                  const actualX = isPlayer ? playerPos.x : entity.x
                  const actualY = isPlayer ? playerPos.y : entity.y
                  
                  return (
                    <button
                      key={entity.id}
                      className={cn(
                        "absolute flex items-center justify-center rounded-full transition-all",
                        getEntityColor(entity.type),
                        isPlayer && "z-10 ring-2 ring-primary/50"
                      )}
                      style={{
                        width: TILE_SIZE - 4,
                        height: TILE_SIZE - 4,
                        left: actualX * (TILE_SIZE + 1) + 2,
                        top: actualY * (TILE_SIZE + 1) + 2,
                        transition: 'left 0.15s ease, top 0.15s ease'
                      }}
                      onClick={() => !isPlayer && entity.interactable && handleInteract(entity)}
                      title={entity.name}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
          
          {/* D-Pad Controls */}
          <Card className="celtic-border mt-4 max-w-xs mx-auto">
            <CardContent className="p-4">
              <p className="text-xs text-center text-muted-foreground mb-3">
                Use WASD or Arrow Keys, or click below
              </p>
              <div className="grid grid-cols-3 gap-2 w-32 mx-auto">
                <div />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => movePlayer(0, -1)}
                >
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <div />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => movePlayer(-1, 0)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => movePlayer(1, 0)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => movePlayer(0, 1)}
                >
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <div />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Entity Info Sidebar */}
      {selectedEntity && selectedEntity.type !== 'player' && (
        <aside className="w-72 border-l border-border bg-card/50 p-4">
          <div className="flex items-center gap-3 mb-4">
            {(() => {
              const Icon = getEntityIcon(selectedEntity.type)
              return (
                <div className={cn(
                  "w-12 h-12 rounded-lg flex items-center justify-center",
                  getEntityColor(selectedEntity.type)
                )}>
                  <Icon className="w-6 h-6" />
                </div>
              )
            })()}
            <div>
              <h3 className="font-medium">{selectedEntity.name}</h3>
              <p className="text-xs text-muted-foreground capitalize">{selectedEntity.type}</p>
            </div>
          </div>
          
          <Card className="celtic-border mb-4">
            <CardContent className="p-3">
              <p className="text-sm text-muted-foreground italic">
                {selectedEntity.type === 'npc' && 'A local inhabitant. Perhaps they have information.'}
                {selectedEntity.type === 'enemy' && 'A hostile creature prowling the area.'}
                {selectedEntity.type === 'shop' && 'A merchant offering goods and services.'}
              </p>
            </CardContent>
          </Card>
          
          <div className="space-y-2">
            {selectedEntity.type === 'npc' && (
              <Button className="w-full" onClick={() => handleInteract(selectedEntity)}>
                <MessageCircle className="w-4 h-4 mr-2" />
                Talk
              </Button>
            )}
            {selectedEntity.type === 'enemy' && (
              <Button className="w-full bg-destructive hover:bg-destructive/90">
                <Skull className="w-4 h-4 mr-2" />
                Attack
              </Button>
            )}
            {selectedEntity.type === 'shop' && (
              <Button className="w-full bg-[oklch(0.55_0.15_85)] hover:bg-[oklch(0.50_0.15_85)]">
                <Store className="w-4 h-4 mr-2" />
                Browse Wares
              </Button>
            )}
          </div>
          
          <button 
            onClick={() => setSelectedEntity(null)}
            className="w-full mt-4 text-sm text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
        </aside>
      )}
    </div>
  )
}
