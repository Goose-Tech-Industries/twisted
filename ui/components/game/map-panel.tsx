"use client"
import React from 'react'

import { useState, useCallback, useEffect } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { gameApi } from "@/lib/game-api"
import { Card, CardContent } from "@/components/ui/card"
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
  Lock,
  Loader2,
  Users,
  Swords,
  Handshake,
  UserPlus
} from "lucide-react"

const TILE_SIZE = 32

// Tile palette — matches AdminSauce editor config.colors + extended tiles.
// IDs 0-3 are the base palette. IDs 4+ are extended terrain added below.
const TILE_BG: Record<number, string> = {
  0: '#1a3a1a',  // grass — dark green
  1: '#4a4a4a',  // wall — grey
  2: '#0a2a5a',  // water — dark blue
  3: '#3a2a0a',  // dirt — dark brown
  4: '#5a5a5a',  // stone — light grey
  5: '#3a2a1a',  // wood — warm brown
  6: '#6a6a5a',  // rock — tan grey
  7: '#0a0a0a',  // void — near black
  8: '#2a1a4a',  // magic — deep purple
  9: '#0a2a0a',  // jungle — deep green
  10: '#5a4a2a', // sand — tan
}

interface SelectedEntity {
  type: 'npc' | 'enemy' | 'shop' | 'player'
  name: string
  x: number
  y: number
  charId?: number
  level?: number
}

export function MapPanel() {
  const game = useGame()
  const { state, dispatch, socket } = game
  const { notify } = useNotification()
  const { character, currentMap, nearbyPlayers, mapBattles, companions } = state
  const move = (game as unknown as Record<string, unknown>).move as (direction: 'up' | 'down' | 'left' | 'right') => void
  const interact = (game as unknown as Record<string, unknown>).interact as () => void

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null)
  const [fetchedMap, setFetchedMap] = useState<typeof currentMap>(null)

  // Fetch map via API if socket hasn't provided it
  useEffect(() => {
    if (currentMap || !character?.mapId) return
    let cancelled = false
    ;(async () => {
      const res = await gameApi.getMap(character.mapId)
      if (cancelled) return
      const data = res.data || (res as unknown as Record<string, unknown>)
      const map = (data as Record<string, unknown>).map as typeof currentMap
      if (map) {
        setFetchedMap(map as typeof currentMap)
        dispatch({ type: 'SET_MAP', payload: map as typeof currentMap })
      }
    })()
    return () => { cancelled = true }
  }, [character?.mapId, currentMap, dispatch])

  const mapData = currentMap || fetchedMap
  const playerX = character?.x ?? 0
  const playerY = character?.y ?? 0

  // Parse tiles from currentMap
  const tiles: number[][] = React.useMemo(() => {
    if (!mapData) return []
    try {
      const raw = typeof mapData.tiles === 'string' ? JSON.parse(mapData.tiles as unknown as string) : mapData.tiles
      if (Array.isArray(raw) && Array.isArray(raw[0])) return raw
      // Flat array — reshape into 2D
      if (Array.isArray(raw) && mapData.width && mapData.height) {
        const grid: number[][] = []
        for (let y = 0; y < mapData.height; y++) {
          grid.push(raw.slice(y * mapData.width, (y + 1) * mapData.width))
        }
        return grid
      }
    } catch {}
    return []
  }, [mapData])

  const mapWidth = mapData?.width || (tiles[0]?.length || 0)
  const mapHeight = mapData?.height || tiles.length

  const isPassable = (x: number, y: number) => {
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return false
    const tile = tiles[y]?.[x]
    return tile !== undefined && tile !== 1
  }

  const movePlayer = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!socket || !character) return
    move(direction)
  }, [socket, character, move])

  const handleInteract = (entity: SelectedEntity) => {
    setSelectedEntity(entity)

    if (entity.type === 'npc') {
      // Trigger real server-side interaction
      if (socket) interact()
    } else if (entity.type === 'enemy') {
      notify('warning', `${entity.name} attacks!`)
    } else if (entity.type === 'shop') {
      notify('info', `Welcome to the ${entity.name}!`)
    }
  }

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp': case 'w': movePlayer('up'); break
      case 'ArrowDown': case 's': movePlayer('down'); break
      case 'ArrowLeft': case 'a': movePlayer('left'); break
      case 'ArrowRight': case 'd': movePlayer('right'); break
      case 'e': case 'E': interact(); break
    }
  }, [movePlayer, interact])

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

  if (!character) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a character to view the map
      </div>
    )
  }

  if (!mapData || tiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading map...
      </div>
    )
  }

  // Build entity list from map events + nearby players
  const entities: SelectedEntity[] = []

  // Map events (NPCs, enemies, shops from map data)
  if (mapData.events) {
    for (const evt of mapData.events) {
      const evtType = String(evt.type).toUpperCase()
      const data = evt.data as Record<string, unknown> | undefined
      if (evtType === 'NPC') {
        entities.push({ type: 'npc', name: (data?.name as string) || 'NPC', x: evt.x, y: evt.y })
      } else if (evtType === 'ENEMY' || evtType === 'BATTLE') {
        entities.push({ type: 'enemy', name: (data?.name as string) || 'Enemy', x: evt.x, y: evt.y })
      } else if (evtType === 'SHOP') {
        entities.push({ type: 'shop', name: (data?.name as string) || 'Shop', x: evt.x, y: evt.y })
      }
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
                {mapData.name || 'Unknown Location'}
              </h2>
              <p className="text-sm text-muted-foreground">
                Position: ({playerX}, {playerY})
                {nearbyPlayers.length > 0 && (
                  <span className="ml-2">
                    <Users className="w-3 h-3 inline mr-1" />
                    {nearbyPlayers.length} nearby
                  </span>
                )}
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
                  gridTemplateColumns: `repeat(${mapWidth}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(${mapHeight}, ${TILE_SIZE}px)`
                }}
              >
                {/* Tiles */}
                {tiles.map((row, y) =>
                  row.map((tile, x) => (
                    <div
                      key={`${x}-${y}`}
                      className={cn(
                        "flex items-center justify-center text-xs transition-all",
                        tile === 4 && "animate-pulse-slow"
                      )}
                      style={{ backgroundColor: TILE_BG[tile] || TILE_BG[0] }}
                      onClick={() => {
                        if (isPassable(x, y) && Math.abs(x - playerX) <= 1 && Math.abs(y - playerY) <= 1) {
                          const dx = x - playerX
                          const dy = y - playerY
                          if (dx === 1) movePlayer('right')
                          else if (dx === -1) movePlayer('left')
                          else if (dy === 1) movePlayer('down')
                          else if (dy === -1) movePlayer('up')
                        }
                      }}
                    >
                      {tile === 3 && <Lock className="w-3 h-3 text-[oklch(0.65_0.10_85)]" />}
                      {tile === 4 && <span className="text-[oklch(0.75_0.15_85)]">?</span>}
                    </div>
                  ))
                )}

                {/* Map Objects (crates, barrels, trees, lights, decorations) */}
                {mapData.objects?.map((obj, i) => {
                  const ox = obj.x
                  const oy = obj.y
                  const icon = obj.icon || '📦'
                  const label = obj.label || obj.preset || 'Object'
                  return (
                    <div
                      key={`obj-${i}`}
                      className="absolute flex items-center justify-center pointer-events-none"
                      style={{
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        left: ox * (TILE_SIZE + 1),
                        top: oy * (TILE_SIZE + 1),
                        fontSize: Math.round(TILE_SIZE * 0.6),
                        lineHeight: `${TILE_SIZE}px`,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                      }}
                      title={label}
                    >
                      {icon}
                    </div>
                  )
                })}

                {/* Player */}
                <button
                  className="absolute flex items-center justify-center rounded-full z-10 ring-2 ring-primary/50 bg-primary text-primary-foreground"
                  style={{
                    width: TILE_SIZE - 4,
                    height: TILE_SIZE - 4,
                    left: playerX * (TILE_SIZE + 1) + 2,
                    top: playerY * (TILE_SIZE + 1) + 2,
                    transition: 'left 0.15s ease, top 0.15s ease'
                  }}
                  title={character.name}
                >
                  <User className="w-4 h-4" />
                </button>

                {/* Nearby Players (filtered to exclude self) */}
                {nearbyPlayers.filter(p => p.charId !== character?.charId).map(p => (
                  <button
                    key={p.charId}
                    className={cn(
                      "absolute flex items-center justify-center rounded-full z-10 hover:ring-2 hover:ring-primary cursor-pointer",
                      p.isOffline
                        ? "bg-muted text-muted-foreground opacity-50"
                        : "bg-[oklch(0.55_0.15_140)] text-white"
                    )}
                    style={{
                      width: TILE_SIZE - 4,
                      height: TILE_SIZE - 4,
                      left: (p.x ?? 0) * (TILE_SIZE + 1) + 2,
                      top: (p.y ?? 0) * (TILE_SIZE + 1) + 2,
                      transition: 'left 0.15s ease, top 0.15s ease'
                    }}
                    title={`${p.name} (Lv.${p.level})${p.isOffline ? ' — Sleeping' : ''}`}
                    onClick={() => setSelectedEntity({
                      type: 'player', name: p.name,
                      x: p.x, y: p.y,
                      charId: p.charId, level: p.level
                    })}
                  >
                    {p.isOffline ? <span className="text-[10px]">💤</span> : <User className="w-4 h-4" />}
                  </button>
                ))}

                {/* Companions */}
                {(companions || []).map(comp => (
                  <div
                    key={`comp-${comp.npcId}`}
                    className="absolute flex items-center justify-center rounded-full bg-[oklch(0.60_0.15_185)] text-white ring-1 ring-[oklch(0.55_0.12_185)]/50 z-[5]"
                    style={{
                      width: TILE_SIZE - 4,
                      height: TILE_SIZE - 4,
                      left: (comp.x ?? 0) * (TILE_SIZE + 1) + 2,
                      top: (comp.y ?? 0) * (TILE_SIZE + 1) + 2,
                      transition: 'left 0.15s ease, top 0.15s ease',
                      fontSize: Math.round(TILE_SIZE * 0.45),
                    }}
                    title={`${comp.name} (Companion)`}
                  >
                    {comp.icon || '⚔️'}
                  </div>
                ))}

                {/* Map Entities (NPCs, enemies, shops) */}
                {entities.map((entity, i) => {
                  const Icon = getEntityIcon(entity.type)
                  return (
                    <button
                      key={`entity-${i}`}
                      className={cn(
                        "absolute flex items-center justify-center rounded-full",
                        getEntityColor(entity.type)
                      )}
                      style={{
                        width: TILE_SIZE - 4,
                        height: TILE_SIZE - 4,
                        left: entity.x * (TILE_SIZE + 1) + 2,
                        top: entity.y * (TILE_SIZE + 1) + 2,
                      }}
                      onClick={() => handleInteract(entity)}
                      title={entity.name}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  )
                })}

                {/* Active Battle Indicators */}
                {(mapBattles || []).map(b => (
                  <button
                    key={`battle-${b.battleId}`}
                    className="absolute flex items-center justify-center rounded-full bg-[oklch(0.55_0.22_25)] text-white animate-pulse-slow z-20"
                    style={{
                      width: TILE_SIZE + 4,
                      height: TILE_SIZE + 4,
                      left: b.x * (TILE_SIZE + 1) - 1,
                      top: b.y * (TILE_SIZE + 1) - 1,
                      boxShadow: '0 0 12px rgba(255,50,50,0.5)',
                    }}
                    onClick={() => {
                      if (!socket || state.battle) return
                      if (confirm(`Join battle? (${b.playerNames.join(', ')} vs ${b.enemyNames.join(', ')})`)) {
                        socket.emit('join_battle', { battleId: b.battleId })
                      }
                    }}
                    title={`Battle: ${b.playerNames.join(', ')} vs ${b.enemyNames.join(', ')} — Click to join!`}
                  >
                    <Swords className="w-5 h-5" />
                  </button>
                ))}
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
                <Button variant="outline" size="icon" onClick={() => movePlayer('up')}>
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <div />
                <Button variant="outline" size="icon" onClick={() => movePlayer('left')}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="w-10 h-10 rounded bg-primary/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-primary" />
                </div>
                <Button variant="outline" size="icon" onClick={() => movePlayer('right')}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div />
                <Button variant="outline" size="icon" onClick={() => movePlayer('down')}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <div />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entity Info Sidebar */}
      {selectedEntity && (
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
                {selectedEntity.type === 'player' && `Level ${selectedEntity.level || '?'} adventurer.`}
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
            {selectedEntity.type === 'player' && selectedEntity.charId && (
              <>
                <Button className="w-full bg-destructive hover:bg-destructive/90" onClick={() => {
                  socket?.emit('duel_challenge', { targetId: selectedEntity.charId })
                  notify('info', `Duel challenge sent to ${selectedEntity.name}!`)
                }}>
                  <Swords className="w-4 h-4 mr-2" />
                  Challenge to Duel
                </Button>
                <Button className="w-full" variant="outline" onClick={() => {
                  socket?.emit('trade_request', { targetCharId: selectedEntity.charId })
                  notify('info', `Trade request sent to ${selectedEntity.name}!`)
                }}>
                  <Handshake className="w-4 h-4 mr-2" />
                  Trade
                </Button>
                <Button className="w-full" variant="outline" onClick={() => {
                  socket?.emit('party_invite', { targetCharId: selectedEntity.charId })
                  notify('info', `Party invite sent to ${selectedEntity.name}!`)
                }}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Invite to Party
                </Button>
                <Button className="w-full" variant="outline" onClick={() => {
                  socket?.emit('spar_request', { targetCharId: selectedEntity.charId })
                  notify('info', `Spar request sent to ${selectedEntity.name}!`)
                }}>
                  🤝 Spar
                </Button>
              </>
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
