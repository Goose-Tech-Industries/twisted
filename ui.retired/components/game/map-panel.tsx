"use client"
import React from 'react'

import { useState, useCallback, useEffect, useRef } from "react"
import { useGame, useNotification } from "@/lib/game-context"
import { gameApi } from "@/lib/game-api"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MapSkeleton } from "./panel-skeletons"
import { WorldMapButton } from "./world-map-overlay"
import { ParticleOverlay } from "./particle-overlay"
import { MapFogLighting } from "./map-fog-lighting"
import { MapAmbientSound } from "./map-ambient-sound"
import { MapRenderer, useWebGLAvailable, type RenderMode } from "./map-renderers"
import { HTCPanel } from "./htc-panel"
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
  Users,
  Swords,
  Handshake,
  UserPlus
} from "lucide-react"

const TILE_SIZE_DESKTOP = 36
const TILE_SIZE_MOBILE = 22
const VIEWPORT_TILES_X = 18  // visible tiles across
const VIEWPORT_TILES_Y = 14  // visible tiles down

// Fallback tile colors — used until DB palette loads via tile_palette event
const TILE_BG_FALLBACK: Record<number, string> = {
  0: '#1a3a1a', 1: '#4a4a4a', 2: '#0a2a5a', 3: '#3a2a0a',
}

interface SelectedEntity {
  type: 'npc' | 'enemy' | 'shop' | 'player'
  name: string
  x: number
  y: number
  charId?: number
  level?: number
  spriteUrl?: string | null
  icon?: string
  data?: Record<string, unknown>
}

export function MapPanel() {
  const game = useGame()
  const { state, dispatch, socket } = game
  const { notify } = useNotification()
  const { character, currentMap, nearbyPlayers, mapBattles, companions, tilePalette, groundItems, deployedStructures } = state

  // Build tile color lookup from DB palette (falls back to hardcoded defaults)
  const TILE_BG = React.useMemo(() => {
    if (tilePalette.length) {
      const map: Record<number, string> = {}
      for (const t of tilePalette) map[t.id] = t.color
      return map
    }
    return TILE_BG_FALLBACK
  }, [tilePalette])
  const move = (game as unknown as Record<string, unknown>).move as (direction: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right') => void
  const interact = (game as unknown as Record<string, unknown>).interact as () => void
  const setRunning = (game as unknown as { setRunning: (v: boolean) => void }).setRunning

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null)
  const [mapParticles, setMapParticles] = useState<Array<{ preset: string; x: number; y: number; id: string }>>([])
  const [objectStates, setObjectStates] = useState<Record<number, string>>({})
  const [liveNpcs, setLiveNpcs] = useState<Array<{ id: number; name: string; icon: string; spriteUrl?: string | null; x: number; y: number; isEnemy?: boolean; shopId?: number | null }>>([])
  const [isMobileMap, setIsMobileMap] = useState(false)
  const [worldTime, setWorldTime] = useState<Record<number, { hour: number; phase: string; darkness: number }>>({})
  const [showMinimap, setShowMinimap] = useState(true)
  const [weatherType, setWeatherType] = useState<string | null>(null)
  const [mapTransition, setMapTransition] = useState<'none' | 'fade-out' | 'fade-in'>('none')
  const [fetchedMap, setFetchedMap] = useState<typeof currentMap>(null)
  const [exploredTiles, setExploredTiles] = useState<Set<string>>(new Set())
  const mapIdRef = useRef<number | null>(null)
  const fogSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const heldKeysRef = React.useRef(new Set<string>())
  const webglAvailable = useWebGLAvailable()

  // mapData must be computed before anything that references it
  const mapData = React.useMemo(() => currentMap ?? fetchedMap ?? null, [currentMap, fetchedMap])

  // Resolve effective render mode: map override > world default > classic fallback
  // Render mode is admin-only (set per-map or per-world in AdminSauce)
  const effectiveRenderMode: RenderMode = React.useMemo(() => {
    const mapMode = (mapData as unknown as Record<string, unknown>)?.render_mode as string | null
    const worldMode = (mapData as unknown as Record<string, unknown>)?.world_render_mode as string | null
    const valid: RenderMode[] = ['classic', '2.5d', 'isometric', 'hex', 'side-scroll', 'first-person', '3d']
    if (mapMode && valid.includes(mapMode as RenderMode)) return mapMode as RenderMode
    if (worldMode && valid.includes(worldMode as RenderMode)) return worldMode as RenderMode
    return 'classic'
  }, [mapData])

  // Screen transition on map change
  useEffect(() => {
    if (!socket) return
    const handler = () => {
      setMapTransition('fade-out')
      setObjectStates({})
      setLiveNpcs([])
      setTimeout(() => setMapTransition('fade-in'), 300)
      setTimeout(() => setMapTransition('none'), 600)
    }
    socket.on('map_changed', handler)
    return () => { socket.off('map_changed', handler) }
  }, [socket])

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobileMap(mql.matches)
    mql.addEventListener('change', onChange)
    setIsMobileMap(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const TILE_SIZE = isMobileMap ? TILE_SIZE_MOBILE : TILE_SIZE_DESKTOP

  // Listen for map particle events from server
  useEffect(() => {
    if (!socket) return
    const handler = (data: { preset: string; x: number; y: number }) => {
      const px = data.x * (TILE_SIZE + 1) + TILE_SIZE / 2
      const py = data.y * (TILE_SIZE + 1) + TILE_SIZE / 2
      const id = `map_${Date.now()}_${Math.random()}`
      setMapParticles(prev => [...prev, { preset: data.preset, x: px, y: py, id }])
      setTimeout(() => setMapParticles(prev => prev.filter(e => e.id !== id)), 3000)
    }
    socket.on('map_particle', handler)
    // Day/night cycle
    const timeHandler = (data: Record<number, { hour: number; phase: string; darkness: number }>) => setWorldTime(data)
    socket.on('world_time', timeHandler)
    // Object state changes (doors, torches, levers)
    const objHandler = (data: { objectIndex: number; state: string }) => {
      setObjectStates(prev => ({ ...prev, [data.objectIndex]: data.state }))
    }
    socket.on('object_state_change', objHandler)
    // Live NPC positions from server
    const npcListHandler = (npcs: Array<{ id: number; name: string; icon: string; spriteUrl?: string | null; x: number; y: number; isEnemy?: boolean; shopId?: number | null }>) => {
      setLiveNpcs(npcs || [])
    }
    socket.on('npc_list', npcListHandler)
    const npcArrivedHandler = (data: { npcId: number; name: string; x: number; y: number; icon?: string; spriteUrl?: string | null }) => {
      setLiveNpcs(prev => [...prev.filter(n => n.id !== data.npcId), { id: data.npcId, name: data.name, icon: data.icon || '👤', spriteUrl: data.spriteUrl, x: data.x, y: data.y }])
    }
    socket.on('npc_arrived', npcArrivedHandler)
    const npcLeftHandler = (data: { npcId: number }) => {
      setLiveNpcs(prev => prev.filter(n => n.id !== data.npcId))
    }
    socket.on('npc_left', npcLeftHandler)
    // NPC movement (wander/patrol tick)
    const npcMovedHandler = (data: { id: number; x: number; y: number }) => {
      setLiveNpcs(prev => prev.map(n => n.id === data.id ? { ...n, x: data.x, y: data.y } : n))
    }
    socket.on('npc_moved', npcMovedHandler)
    return () => {
      socket.off('map_particle', handler); socket.off('world_time', timeHandler)
      socket.off('object_state_change', objHandler); socket.off('npc_list', npcListHandler)
      socket.off('npc_arrived', npcArrivedHandler); socket.off('npc_left', npcLeftHandler)
      socket.off('npc_moved', npcMovedHandler)
    }
  }, [socket])

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

  const playerX = character?.x ?? 0
  const playerY = character?.y ?? 0

  // Parse tiles from currentMap — supports multi-layer format [ground, overlay, passability, fringe, elevation]
  const { tiles, fringeTiles, passabilityData, elevationData } = React.useMemo(() => {
    const empty = { tiles: [] as number[][], fringeTiles: [] as number[], passabilityData: [] as number[], elevationData: [] as number[] }
    if (!mapData) return empty
    try {
      const raw = typeof mapData.tiles === 'string' ? JSON.parse(mapData.tiles as unknown as string) : mapData.tiles
      if (!Array.isArray(raw)) return empty

      let groundFlat: number[] = []
      let fringeFlat: number[] = []
      let passFlat: number[] = []

      let elevFlat: number[] = []

      // Multi-layer format: [ground[], overlay[], passability[], fringe[], elevation[]]
      if (raw.length > 0 && Array.isArray(raw[0])) {
        groundFlat = raw[0] || []
        passFlat = raw[2] || []
        fringeFlat = raw[3] || []
        elevFlat = raw[4] || []
      } else {
        // Simple flat array (legacy)
        groundFlat = raw
      }

      // Reshape ground into 2D for existing tile rendering
      const w = mapData.width || 20
      const h = mapData.height || 20
      const grid: number[][] = []
      for (let y = 0; y < h; y++) {
        grid.push(groundFlat.slice(y * w, (y + 1) * w))
      }
      return { tiles: grid, fringeTiles: fringeFlat, passabilityData: passFlat, elevationData: elevFlat }
    } catch {}
    return { ...empty, elevationData: [] as number[] }
  }, [mapData])

  // ── Extract light sources from map objects ──
  const lightSources = React.useMemo(() => {
    if (!mapData?.objects) return []
    return (mapData.objects as Array<{ x: number; y: number; light?: { radius: number; color: string; flicker: boolean } }>)
      .filter(obj => obj.light && obj.light.radius > 0)
      .map(obj => ({
        x: obj.x, y: obj.y,
        radius: obj.light!.radius,
        color: obj.light!.color || '#ff8833',
        flicker: obj.light!.flicker || false,
      }))
  }, [mapData])

  // ── Fog of War explored tiles (persisted per character+map in DB) ──

  // Load explored tiles from DB when map changes
  useEffect(() => {
    const mapId = mapData?.id
    if (!mapId || mapId === mapIdRef.current || !socket) return
    mapIdRef.current = mapId
    setExploredTiles(new Set())
    socket.emit('get_fog_exploration', { mapId })
  }, [mapData?.id, socket])

  // Listen for fog data from server
  useEffect(() => {
    if (!socket) return
    const handler = (data: { mapId: number; tiles: string[] }) => {
      if (data.mapId === mapData?.id) {
        setExploredTiles(new Set(data.tiles))
      }
    }
    socket.on('fog_exploration', handler)
    return () => { socket.off('fog_exploration', handler) }
  }, [socket, mapData?.id])

  const handleExplore = useCallback((newTiles: string[]) => {
    if (!newTiles.length) return
    setExploredTiles(prev => {
      const next = new Set(prev)
      for (const t of newTiles) next.add(t)
      // Debounced save to DB (don't spam on every tile step)
      if (fogSaveTimer.current) clearTimeout(fogSaveTimer.current)
      fogSaveTimer.current = setTimeout(() => {
        if (socket && mapData?.id) {
          socket.emit('save_fog_exploration', { mapId: mapData.id, tiles: [...next] })
        }
      }, 2000)
      return next
    })
  }, [socket, mapData?.id])

  // ── Map-level fog/lighting properties ──
  // NOTE: All derived from mapData — wrapped in useMemo to prevent Turbopack TDZ minification bug
  const {
    fogEnabled, fogRadius, ambientDark, baseAmbientUrl, bgmUrl,
    ambientSoundUrl, mapWeather, mapWidth, mapHeight
  } = React.useMemo(() => {
    const md = mapData as unknown as Record<string, unknown> | null
    const _fogEnabled = !!md?.fog_of_war
    const baseFogRadius = Number(md?.fog_reveal_radius) || 3
    const visionOverride = Number(state.overworldEffects?.vision_radius) || 0
    const _fogRadius = visionOverride > 0 ? visionOverride : baseFogRadius
    const _ambientDark = Number(md?.ambient_dark) || 0
    const _baseAmbientUrl = (md?.ambient_sound_url as string) || null
    const _bgmUrl = (md?.bgm_url as string) || null
    const soundZones = (md?.sound_zones as Array<{ x_min: number; y_min: number; x_max: number; y_max: number; url: string; volume: number }>) || []
    const activeZone = soundZones.find(z => playerX >= z.x_min && playerX <= z.x_max && playerY >= z.y_min && playerY <= z.y_max)
    const _ambientSoundUrl = activeZone?.url || _baseAmbientUrl
    const _mapWeather = (md?.weather as string) || null
    const _mapWidth = mapData?.width || (tiles[0]?.length || 0)
    const _mapHeight = mapData?.height || tiles.length
    return {
      fogEnabled: _fogEnabled, fogRadius: _fogRadius, ambientDark: _ambientDark,
      baseAmbientUrl: _baseAmbientUrl, bgmUrl: _bgmUrl,
      ambientSoundUrl: _ambientSoundUrl, mapWeather: _mapWeather,
      mapWidth: _mapWidth, mapHeight: _mapHeight
    }
  }, [mapData, state.overworldEffects?.vision_radius, playerX, playerY, tiles])

  // Sync weather from map data into local state
  useEffect(() => {
    setWeatherType(mapWeather)
  }, [mapWeather])

  // Interior zone detection: player is "inside" if there's a fringe tile above them
  const isPlayerInside = React.useMemo(() => {
    if (!fringeTiles.length || !mapWidth) return false
    const idx = playerY * mapWidth + playerX
    return fringeTiles[idx] !== undefined && fringeTiles[idx] >= 0
  }, [fringeTiles, playerX, playerY, mapWidth])

  // Find which fringe tiles should be hidden (same building zone as player)
  const hiddenFringeTiles = React.useMemo(() => {
    if (!isPlayerInside || !fringeTiles.length) return new Set<number>()
    // Flood-fill from player position through connected fringe tiles
    const hidden = new Set<number>()
    const queue = [playerY * mapWidth + playerX]
    while (queue.length) {
      const idx = queue.shift()!
      if (hidden.has(idx)) continue
      if (idx < 0 || idx >= fringeTiles.length) continue
      if (fringeTiles[idx] < 0) continue // no fringe tile here
      hidden.add(idx)
      const x = idx % mapWidth, y = Math.floor(idx / mapWidth)
      if (x > 0) queue.push(idx - 1)
      if (x < mapWidth - 1) queue.push(idx + 1)
      if (y > 0) queue.push(idx - mapWidth)
      if (y < mapHeight - 1) queue.push(idx + mapWidth)
    }
    return hidden
  }, [isPlayerInside, fringeTiles, playerX, playerY, mapWidth, mapHeight])

  const isPassable = (x: number, y: number) => {
    if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) return false
    // Use passability data if available
    if (passabilityData.length) {
      return passabilityData[y * mapWidth + x] !== 1
    }
    const tile = tiles[y]?.[x]
    return tile !== undefined && tile !== 1
  }

  const movePlayer = useCallback((direction: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right') => {
    if (!socket || !character) return
    move(direction)
  }, [socket, character, move])

  // Track held keys for diagonal movement (ref moved to top)

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
    // FPS/3D modes handle their own input via the FPS controller
    if (effectiveRenderMode === 'first-person' || effectiveRenderMode === '3d') return

    if (e.shiftKey) setRunning(true)
    const k = e.key.toLowerCase()
    heldKeysRef.current.add(k)
    const held = heldKeysRef.current
    const up = held.has('arrowup') || held.has('w')
    const down = held.has('arrowdown') || held.has('s')
    const left = held.has('arrowleft') || held.has('a')
    const right = held.has('arrowright') || held.has('d')

    if (up && left) movePlayer('up-left')
    else if (up && right) movePlayer('up-right')
    else if (down && left) movePlayer('down-left')
    else if (down && right) movePlayer('down-right')
    else if (up) movePlayer('up')
    else if (down) movePlayer('down')
    else if (left) movePlayer('left')
    else if (right) movePlayer('right')
    else if (k === 'e') interact()
  }, [movePlayer, interact, effectiveRenderMode])

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    heldKeysRef.current.delete(e.key.toLowerCase())
    if (e.key === 'Shift') setRunning(false)
  }, [setRunning])

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
    return <MapSkeleton />
  }

  // Build entity list from map events + nearby players
  const entities: SelectedEntity[] = []

  // Map events (NPCs, enemies, shops from map data)
  if (mapData.events) {
    for (const evt of mapData.events) {
      const evtType = String(evt.type).toUpperCase()
      const data = evt.data as Record<string, unknown> | undefined
      if (evtType === 'NPC') {
        entities.push({ type: 'npc', name: (data?.name as string) || 'NPC', x: evt.x, y: evt.y,
          spriteUrl: (data?.spriteUrl as string) || undefined, icon: (data?.icon as string) || undefined })
      } else if (evtType === 'ENEMY' || evtType === 'BATTLE') {
        entities.push({ type: 'enemy', name: (data?.name as string) || 'Enemy', x: evt.x, y: evt.y,
          spriteUrl: (data?.spriteUrl as string) || undefined, icon: (data?.icon as string) || undefined })
      } else if (evtType === 'SHOP') {
        entities.push({ type: 'shop', name: (data?.name as string) || 'Shop', x: evt.x, y: evt.y,
          icon: (data?.icon as string) || undefined, data: data as Record<string, unknown> })
      }
    }
  }

  // Live NPCs from server (real-time positions, overrides static map data)
  for (const npc of liveNpcs) {
    const type = npc.shopId ? 'shop' as const : npc.isEnemy ? 'enemy' as const : 'npc' as const
    entities.push({
      type, name: npc.name, x: npc.x, y: npc.y,
      icon: npc.icon || undefined,
      spriteUrl: npc.spriteUrl || undefined,
      data: { npcId: npc.id },
    })
  }

  return (
    <div className="flex flex-col md:flex-row md:h-full" tabIndex={0} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp}>
      {/* Map View */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Map Header */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                <Compass className="w-5 h-5 text-primary shrink-0" />
                <span className="truncate">{mapData.name || 'Unknown Location'}</span>
              </h2>
              <p className="text-xs md:text-sm text-muted-foreground">
                ({playerX}, {playerY})
                {nearbyPlayers.length > 0 && (
                  <span className="ml-2">
                    <Users className="w-3 h-3 inline mr-1" />
                    {nearbyPlayers.length} nearby
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* World Map button — mobile only (desktop uses floating button) */}
              <WorldMapButton />
            </div>

            {/* Legend — desktop only */}
            <div className="hidden md:flex gap-4 text-xs shrink-0">
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

          {/* Screen Transition Overlay */}
          {mapTransition !== 'none' && (
            <div className="fixed inset-0 z-50 pointer-events-none bg-black transition-opacity duration-300"
              style={{ opacity: mapTransition === 'fade-out' ? 1 : 0 }} />
          )}

          {/* Map Grid — Viewport Camera System */}
          <Card className="celtic-border overflow-hidden relative">
            <CardContent className="p-2 md:p-4">
              {(() => {
                // Camera: center viewport on player, clamp to map bounds
                const vpW = Math.min(VIEWPORT_TILES_X, mapWidth)
                const vpH = Math.min(VIEWPORT_TILES_Y, mapHeight)
                const halfW = Math.floor(vpW / 2)
                const halfH = Math.floor(vpH / 2)
                const camX = Math.max(0, Math.min(mapWidth - vpW, playerX - halfW))
                const camY = Math.max(0, Math.min(mapHeight - vpH, playerY - halfH))

                // ── PixiJS Renderer (all modes when WebGL available) ──
                if (webglAvailable) {
                  const wt = worldTime[1]
                  return (
                    <div className="relative overflow-hidden rounded mx-auto"
                      style={{ width: vpW * (TILE_SIZE + 1), height: vpH * (TILE_SIZE + 1) }}>
                      <MapRenderer
                        mode={effectiveRenderMode}
                        zoneType={((mapData as unknown as Record<string, unknown>)?.zone_type as string) || undefined}
                        tiles={tiles}
                        elevationData={elevationData}
                        fringeTiles={fringeTiles}
                        objects={(mapData?.objects || []) as import("./map-renderers/types").MapObject[]}
                        entities={entities as import("./map-renderers/types").MapEntity[]}
                        nearbyPlayers={nearbyPlayers as import("./map-renderers/types").NearbyPlayer[]}
                        companions={(companions || []) as import("./map-renderers/types").MapCompanion[]}
                        mapWidth={mapWidth}
                        mapHeight={mapHeight}
                        tileSize={TILE_SIZE}
                        viewportW={vpW}
                        viewportH={vpH}
                        playerX={playerX}
                        playerY={playerY}
                        camX={camX}
                        camY={camY}
                        playerName={character?.name || ''}
                        playerSpriteUrl={(character as unknown as Record<string,unknown>)?.sprite_sheet_url as string || null}
                        playerSpriteFrameW={Number((character as unknown as Record<string,unknown>)?.sprite_frame_width) || 32}
                        playerSpriteFrameH={Number((character as unknown as Record<string,unknown>)?.sprite_frame_height) || 32}
                        fogEnabled={fogEnabled}
                        fogRadius={fogRadius}
                        ambientDark={ambientDark}
                        nightDarkness={wt?.darkness || 0}
                        exploredTiles={exploredTiles}
                        onExplore={handleExplore}
                        parallaxUrl={((mapData as unknown as Record<string,unknown>)?.parallax_url as string) || null}
                        parallaxSpeedX={Number((mapData as unknown as Record<string,unknown>)?.parallax_speed_x) || 0.5}
                        parallaxSpeedY={Number((mapData as unknown as Record<string,unknown>)?.parallax_speed_y) || 0.25}
                        hiddenFringeTiles={hiddenFringeTiles}
                        onTileClick={(x, y) => {
                          if (isPassable(x, y) && Math.abs(x - playerX) <= 1 && Math.abs(y - playerY) <= 1) {
                            const dx = x - playerX, dy = y - playerY
                            if (dx === 1 && dy === -1) movePlayer('up-right')
                            else if (dx === -1 && dy === -1) movePlayer('up-left')
                            else if (dx === 1 && dy === 1) movePlayer('down-right')
                            else if (dx === -1 && dy === 1) movePlayer('down-left')
                            else if (dx === 1) movePlayer('right')
                            else if (dx === -1) movePlayer('left')
                            else if (dy === 1) movePlayer('down')
                            else if (dy === -1) movePlayer('up')
                          }
                        }}
                        onEntityClick={(ent) => handleInteract(ent as SelectedEntity)}
                        tilePalette={tilePalette}
                        groundItems={groundItems}
                        deployedStructures={deployedStructures}
                        mapBattles={mapBattles || []}
                        objectStates={objectStates}
                        onPickupItem={(id) => socket?.emit('pickup_item', { groundItemId: id })}
                        onEnterStructure={(id) => socket?.emit('enter_structure', { structureId: id })}
                        onBattleClick={(battleId, action) => {
                          if (action === 'join') socket?.emit('join_battle', { battleId })
                          else { socket?.emit('battle_spectate', { battleId }); dispatch({ type: 'SET_VIEW', payload: 'battle' }) }
                        }}
                      />
                    </div>
                  )
                }

                // ── DOM Fallback (no WebGL) — basic rendering, no fog/lighting/elevation ──
                return (
              <div
                className="relative overflow-hidden rounded mx-auto"
                style={{
                  width: vpW * (TILE_SIZE + 1),
                  height: vpH * (TILE_SIZE + 1),
                }}
              >
                {/* Parallax background */}
                {(mapData as unknown as Record<string,unknown>).parallax_url ? (
                  <div className="absolute inset-0 pointer-events-none" style={{
                    backgroundImage: `url(${String((mapData as unknown as Record<string,unknown>).parallax_url)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: `${camX * -(Number((mapData as unknown as Record<string,unknown>).parallax_speed_x) || 0.5) * TILE_SIZE}px ${camY * -(Number((mapData as unknown as Record<string,unknown>).parallax_speed_y) || 0.25) * TILE_SIZE}px`,
                    zIndex: 0,
                    imageRendering: 'pixelated',
                  }} />
                ) : null}

                {/* Tile grid with camera offset */}
                <div className="absolute" style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${mapWidth}, ${TILE_SIZE}px)`,
                  gridTemplateRows: `repeat(${mapHeight}, ${TILE_SIZE}px)`,
                  gap: '1px',
                  transform: `translate(${-camX * (TILE_SIZE + 1)}px, ${-camY * (TILE_SIZE + 1)}px)`,
                  transition: 'transform 0.15s ease-out',
                }}>
                {/* Tiles — only render visible + buffer */}
                {tiles.map((row, y) =>
                  row.map((tile, x) => {
                    // Skip tiles far outside viewport for performance
                    if (x < camX - 2 || x > camX + vpW + 2 || y < camY - 2 || y > camY + vpH + 2) {
                      return <div key={`${x}-${y}`} style={{ width: TILE_SIZE, height: TILE_SIZE }} />
                    }
                    return (
                    <div
                      key={`${x}-${y}`}
                      className={cn(
                        "flex items-center justify-center text-xs",
                        tile === 4 && "animate-pulse-slow"
                      )}
                      style={{
                        backgroundColor: TILE_BG[tile] || TILE_BG[0],
                        width: TILE_SIZE, height: TILE_SIZE,
                        // Elevation shading: higher = lighter highlight, lower = darker
                        ...(elevationData.length > 0 && elevationData[y * mapWidth + x] > 0 ? {
                          boxShadow: `inset 0 -${elevationData[y * mapWidth + x]}px ${elevationData[y * mapWidth + x] * 2}px rgba(255,255,255,${elevationData[y * mapWidth + x] * 0.06})`,
                          borderTop: `1px solid rgba(255,255,255,${elevationData[y * mapWidth + x] * 0.08})`,
                        } : {}),
                      }}
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
                    )
                  })
                )}

                {/* Map Objects (crates, barrels, trees, lights, decorations) */}
                {mapData.objects?.map((obj, i) => {
                  const ox = obj.x
                  const oy = obj.y
                  const objState = objectStates[i]
                  // Visual state overrides
                  const stateIcon = objState === 'lit' ? '🔥' : objState === 'open' ? '🚪' : objState === 'pushed' ? '⬇️' : null
                  const icon = stateIcon || obj.icon || '📦'
                  const label = obj.label || obj.preset || 'Object'
                  const isActive = objState === 'active' || objState === 'lit' || objState === 'pushed'
                  return (
                    <div
                      key={`obj-${i}`}
                      className={cn("absolute flex items-center justify-center pointer-events-none", isActive && "animate-pulse")}
                      style={{
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        left: ox * (TILE_SIZE + 1),
                        top: oy * (TILE_SIZE + 1),
                        fontSize: Math.round(TILE_SIZE * 0.6),
                        lineHeight: `${TILE_SIZE}px`,
                        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                        opacity: objState === 'open' ? 0.4 : 1,
                        transition: 'opacity 0.3s ease',
                      }}
                      title={`${label}${objState ? ` (${objState})` : ''}`}
                    >
                      {icon}
                    </div>
                  )
                })}

                {/* Ground Items */}
                {groundItems.map(gi => (
                  <button
                    key={`gi-${gi.id}`}
                    className="absolute flex items-center justify-center animate-bounce z-5 cursor-pointer"
                    style={{
                      width: TILE_SIZE, height: TILE_SIZE,
                      left: gi.x * (TILE_SIZE + 1), top: gi.y * (TILE_SIZE + 1),
                      fontSize: Math.round(TILE_SIZE * 0.5),
                      animationDuration: '2s',
                    }}
                    title={`${gi.name} x${gi.quantity} (click to pick up)`}
                    onClick={() => socket?.emit('pickup_item', { groundItemId: gi.id })}
                  >
                    {gi.icon || '📦'}
                  </button>
                ))}

                {/* Deployed Structures */}
                {deployedStructures.map(s => (
                  <button
                    key={`struct-${s.id}`}
                    className="absolute flex items-center justify-center z-5 cursor-pointer hover:scale-110 transition-transform"
                    style={{
                      width: TILE_SIZE, height: TILE_SIZE,
                      left: s.x * (TILE_SIZE + 1), top: s.y * (TILE_SIZE + 1),
                      fontSize: Math.round(TILE_SIZE * 0.7),
                      textShadow: '0 2px 4px rgba(0,0,0,0.9)',
                    }}
                    title={`${s.name} (click to enter)`}
                    onClick={() => socket?.emit('enter_structure', { structureId: s.id })}
                  >
                    {s.icon || '🏠'}
                  </button>
                ))}

                {/* Player */}
                {(() => {
                  const spriteUrl = (character as unknown as Record<string,unknown>).sprite_sheet_url as string | null
                  const frameW = Number((character as unknown as Record<string,unknown>).sprite_frame_width) || 32
                  const frameH = Number((character as unknown as Record<string,unknown>).sprite_frame_height) || 32
                  return spriteUrl ? (
                    <div
                      className="absolute z-10"
                      style={{
                        width: TILE_SIZE, height: TILE_SIZE,
                        left: playerX * (TILE_SIZE + 1),
                        top: playerY * (TILE_SIZE + 1),
                        transition: 'left 0.15s ease, top 0.15s ease',
                        backgroundImage: `url(${spriteUrl})`,
                        backgroundSize: `${frameW * 4}px ${frameH * 4}px`,
                        backgroundPosition: '0 0',
                        imageRendering: 'pixelated',
                      }}
                      title={character.name}
                    />
                  ) : (
                    <button
                      className="absolute flex items-center justify-center rounded-full z-10 ring-2 ring-primary/50 bg-primary text-primary-foreground"
                      style={{
                        width: Math.round(TILE_SIZE * 0.55), height: Math.round(TILE_SIZE * 0.55),
                        left: playerX * (TILE_SIZE + 1) + Math.round(TILE_SIZE * 0.225),
                        top: playerY * (TILE_SIZE + 1) + Math.round(TILE_SIZE * 0.225),
                        transition: 'left 0.15s ease, top 0.15s ease'
                      }}
                      title={character.name}
                    >
                      <User className="w-3 h-3" />
                    </button>
                  )
                })()}

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
                    {p.isOffline ? <span className="text-[10px]">💤</span> :
                      (p as unknown as Record<string,unknown>).spriteUrl ? (
                        <img src={`${process.env.NEXT_PUBLIC_API_URL || ''}${(p as unknown as Record<string,unknown>).spriteUrl}`}
                          alt={p.name} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      ) : <User className="w-4 h-4" />
                    }
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
                  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
                  return (
                    <button
                      key={`entity-${i}`}
                      className={cn(
                        "absolute flex items-center justify-center overflow-hidden",
                        entity.spriteUrl ? "rounded-sm" : "rounded-full",
                        !entity.spriteUrl && getEntityColor(entity.type)
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
                      {entity.spriteUrl ? (
                        <img src={`${apiUrl}${entity.spriteUrl}`} alt={entity.name}
                          className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
                      ) : entity.icon ? (
                        <span className="text-sm">{entity.icon}</span>
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </button>
                  )
                })}

                {/* Fringe Layer (roofs, tree tops — renders ABOVE the player) */}
                {fringeTiles.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${mapWidth}, ${TILE_SIZE}px)`,
                      gridTemplateRows: `repeat(${mapHeight}, ${TILE_SIZE}px)`,
                      gap: '1px',
                    }}>
                      {fringeTiles.map((tile, i) => {
                        if (tile < 0) return <div key={i} />
                        const isHidden = hiddenFringeTiles.has(i)
                        return (
                          <div key={i} style={{
                            backgroundColor: TILE_BG[tile] || '#2a1a0a',
                            width: TILE_SIZE, height: TILE_SIZE,
                            opacity: isHidden ? 0.1 : 1,
                            transition: 'opacity 0.4s ease',
                          }} />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Particle Effects Layer (map-wide: spell effects, combat, environmental) */}
                <ParticleOverlay
                  effects={mapParticles}
                  width={(currentMap?.width || 20) * (TILE_SIZE + 1)}
                  height={(currentMap?.height || 20) * (TILE_SIZE + 1)}
                />

                {/* Fog of War + Dynamic Lighting + Day/Night (canvas overlay) */}
                {(() => {
                  const wt = worldTime[1]
                  const nightDark = wt?.darkness || 0
                  // Only use the old CSS overlay if fog/lighting is NOT handling it
                  if (fogEnabled || lightSources.length > 0 || ambientDark > 0) {
                    return (
                      <MapFogLighting
                        width={vpW * (TILE_SIZE + 1)}
                        height={vpH * (TILE_SIZE + 1)}
                        tileSize={TILE_SIZE}
                        mapWidth={mapWidth}
                        mapHeight={mapHeight}
                        playerX={playerX}
                        playerY={playerY}
                        camX={camX}
                        camY={camY}
                        fogEnabled={fogEnabled}
                        fogRadius={fogRadius}
                        ambientDark={ambientDark}
                        lights={lightSources}
                        exploredTiles={exploredTiles}
                        onExplore={handleExplore}
                        nightDarkness={nightDark}
                      />
                    )
                  }
                  // Fallback: simple CSS day/night tint when no fog/lights
                  if (!wt || wt.darkness <= 0) return null
                  const tint = wt.phase === 'night' ? 'rgba(10,10,40,' : wt.phase === 'dusk' ? 'rgba(40,20,10,' : 'rgba(20,20,40,'
                  return (
                    <div className="absolute inset-0 pointer-events-none transition-all duration-[5000ms]" style={{
                      background: tint + wt.darkness + ')',
                      zIndex: 30,
                    }} />
                  )
                })()}

                {/* Weather Particles Overlay */}
                {weatherType && (
                  <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 31 }}>
                    {weatherType === 'RAIN' && Array.from({ length: 40 }).map((_, i) => (
                      <div key={i} className="absolute w-px bg-blue-300/40" style={{
                        left: `${Math.random() * 100}%`, top: `-${Math.random() * 20}%`,
                        height: `${8 + Math.random() * 12}px`,
                        animation: `fall ${0.3 + Math.random() * 0.4}s linear infinite`,
                        animationDelay: `${Math.random() * 2}s`,
                      }} />
                    ))}
                    {weatherType === 'SNOW' && Array.from({ length: 25 }).map((_, i) => (
                      <div key={i} className="absolute w-1 h-1 bg-white/60 rounded-full" style={{
                        left: `${Math.random() * 100}%`, top: `-5%`,
                        animation: `fall ${2 + Math.random() * 3}s linear infinite`,
                        animationDelay: `${Math.random() * 5}s`,
                      }} />
                    ))}
                  </div>
                )}

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
                      const action = prompt(
                        `Battle: ${b.playerNames.join(', ')} vs ${b.enemyNames.join(', ')}\n\nType "join" to fight or "watch" to spectate:`,
                        'watch'
                      )
                      if (action === 'join') {
                        socket.emit('join_battle', { battleId: b.battleId })
                      } else if (action === 'watch') {
                        socket.emit('battle_spectate', { battleId: b.battleId })
                        dispatch({ type: 'SET_VIEW', payload: 'battle' })
                      }
                    }}
                    title={`Battle: ${b.playerNames.join(', ')} vs ${b.enemyNames.join(', ')} — Click to join or watch!`}
                  >
                    <Swords className="w-5 h-5" />
                  </button>
                ))}
              </div>
              </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* Minimap */}
          {showMinimap && mapWidth > 0 && mapHeight > 0 && (
            <div className="absolute top-6 right-6 z-40 border border-border/50 rounded-lg bg-black/80 p-1 shadow-lg"
              style={{ width: Math.min(120, mapWidth * 3 + 8), height: Math.min(90, mapHeight * 3 + 8) }}
              onClick={() => setShowMinimap(false)} title="Click to hide minimap">
              <div className="relative w-full h-full">
                {/* Minimap tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${mapWidth}, 3px)`, gap: 0 }}>
                  {tiles.flat().map((tile, i) => (
                    <div key={i} style={{ width: 3, height: 3, background: tile === 1 ? '#333' : '#1a3a1a' }} />
                  ))}
                </div>
                {/* Player dot */}
                {character && (
                  <div className="absolute w-1.5 h-1.5 bg-cyan-400 rounded-full" style={{
                    left: (character.x || 0) * 3, top: (character.y || 0) * 3,
                    boxShadow: '0 0 4px cyan'
                  }} />
                )}
              </div>
            </div>
          )}
          {!showMinimap && (
            <button onClick={() => setShowMinimap(true)}
              className="absolute top-6 right-6 z-40 w-8 h-8 rounded bg-black/60 border border-border/30 flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
              title="Show minimap">
              <Compass className="w-4 h-4" />
            </button>
          )}

          {/* D-Pad Controls — desktop only (mobile uses TouchControls overlay), hidden in FPS/3D */}
          {effectiveRenderMode !== 'first-person' && effectiveRenderMode !== '3d' && <Card className="celtic-border mt-4 max-w-xs mx-auto hidden md:block">
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
          </Card>}

          {/* Hyperbolic Time Chamber Panel — shown on HTC zone maps */}
          {((mapData as unknown as Record<string, unknown>)?.zone_type === 'HTC') && (
            <div className="mt-4">
              <HTCPanel />
            </div>
          )}
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
              <Button className="w-full bg-[oklch(0.55_0.15_85)] hover:bg-[oklch(0.50_0.15_85)]" onClick={() => {
                dispatch({ type: 'SET_ACTIVE_SHOP', payload: (selectedEntity.data?.shopId as number) || 1 })
                dispatch({ type: 'SET_VIEW', payload: 'shop' })
              }}>
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
                <Button className="w-full" variant="outline" onClick={() => {
                  socket?.emit('inspect_player', { targetCharId: selectedEntity.charId })
                }}>
                  👁️ Inspect
                </Button>
                {state.enableGreetSystem && !state.hasGreetedPlayerIds.includes(selectedEntity.charId!) && (
                  <Button className="w-full bg-[oklch(0.55_0.15_200)] hover:bg-[oklch(0.50_0.15_200)]" onClick={() => {
                    socket?.emit('greet_player', { targetCharId: selectedEntity.charId })
                    notify('info', `You greeted ${selectedEntity.name}!`)
                  }}>
                    👋 Greet
                  </Button>
                )}
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

      {/* Ambient Sound (invisible — audio only) */}
      <MapAmbientSound
        soundUrl={ambientSoundUrl}
        volume={0.3}
      />
    </div>
  )
}
