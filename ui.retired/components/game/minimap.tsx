"use client"

import React, { useRef, useEffect, useCallback, useState } from "react"
import { useGame } from "@/lib/game-context"

// Fallback — overridden by DB palette from tilePalette state
const TILE_COLORS_FALLBACK = ['#1a3a1a','#4a4a4a','#0a2a5a','#3a2a0a']

const EVENT_COLORS: Record<string, string> = {
  TELEPORT: '#bb86fc',
  NPC: '#03dac6',
  ENEMY: '#f85149',
  LOOT: '#f39c12',
  SHOP: '#ffcc00',
}

interface MinimapProps {
  size?: number
  tileSize?: number
}

export function Minimap({ size: sizeProp = 160, tileSize = 4 }: MinimapProps) {
  const { state } = useGame()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Build tile color array from DB palette
  const TILE_COLORS = React.useMemo(() => {
    if (state.tilePalette?.length) {
      const arr: string[] = []
      for (const t of state.tilePalette) arr[t.id] = t.color
      return arr
    }
    return TILE_COLORS_FALLBACK
  }, [state.tilePalette])
  const [isMobileSize, setIsMobileSize] = useState(false)

  // Detect mobile for canvas size (CSS can't resize canvas resolution)
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobileSize(mql.matches)
    mql.addEventListener('change', onChange)
    setIsMobileSize(mql.matches)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const size = isMobileSize ? 90 : sizeProp

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get map data from state (in real implementation, this would come from the server)
    const map = state.currentMap
    
    // If no map, show blank
    if (!map?.tiles?.length) {
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = 'rgba(5,8,14,0.9)'
      ctx.fillRect(0, 0, size, size)
      
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.fillText('No Map', size / 2, size / 2)
      return
    }

    const mw = map.width || 20
    const mh = map.height || 20

    // Auto-scale: fit the whole map in the canvas
    const ts = Math.max(1, Math.min(
      tileSize,
      Math.floor(size / mw),
      Math.floor(size / mh)
    ))

    // Total drawn area (may be smaller than canvas if map is small)
    const drawW = mw * ts
    const drawH = mh * ts
    // Center the map drawing within the canvas
    const offX = Math.floor((size - drawW) / 2)
    const offY = Math.floor((size - drawH) / 2)

    // Background
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = 'rgba(5,8,14,0.9)'
    ctx.fillRect(0, 0, size, size)

    // Tiles
    for (let i = 0; i < map.tiles.length; i++) {
      const tileType = map.tiles[i]
      const tx = i % mw
      const ty = Math.floor(i / mw)
      ctx.fillStyle = TILE_COLORS[tileType] || TILE_COLORS[0]
      ctx.fillRect(offX + tx * ts, offY + ty * ts, ts, ts)
    }

    // Event icons (doors, NPCs, etc.)
    if (Array.isArray(map.events)) {
      for (const ev of map.events) {
        ctx.fillStyle = EVENT_COLORS[ev.type] || '#888'
        const ex = offX + ev.x * ts + Math.floor(ts / 2) - 1
        const ey = offY + ev.y * ts + Math.floor(ts / 2) - 1
        ctx.fillRect(ex, ey, 2, 2)
      }
    }

    // Draw nearby players (from state.nearbyPlayers)
    const partyIds = new Set(state.partyMembers?.map(m => m.charId) || [])
    
    for (const player of (state.nearbyPlayers || [])) {
      if ((player.charId ?? player.id) === state.character?.charId) continue // Skip self, draw last

      let color = '#00cccc' // default: other player = cyan
      if (partyIds.has(player.charId ?? player.id)) color = '#3fb950' // party member = green

      ctx.fillStyle = color
      const px = offX + player.x * ts
      const py = offY + player.y * ts
      const dotSize = Math.max(2, ts)
      ctx.fillRect(px, py, dotSize, dotSize)
    }

    // Draw local player (yellow, always visible)
    const me = state.character
    if (me && me.x !== undefined && me.y !== undefined) {
      const px = offX + me.x * ts
      const py = offY + me.y * ts
      const dotSize = Math.max(3, ts + 1)

      // Yellow glow effect: draw slightly larger dark ring first
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(px - 1, py - 1, dotSize + 2, dotSize + 2)

      ctx.fillStyle = '#ffcc00'
      ctx.fillRect(px, py, dotSize, dotSize)
    }

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, size, size)

    // Map name label
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '8px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const mapName = map.name || ''
    if (mapName) ctx.fillText(mapName.slice(0, 20), 4, 4)

  }, [state, size, tileSize])

  // Redraw on state changes
  useEffect(() => {
    draw()
  }, [draw])

  // Also set up an animation frame loop for smoother updates
  useEffect(() => {
    let animationId: number

    const animate = () => {
      draw()
      animationId = requestAnimationFrame(animate)
    }

    animationId = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [draw])

  return (
    <div className={
      // Desktop: bottom-right corner, full size
      // Mobile: top-right corner below header, smaller, semi-transparent
      "fixed z-30 " +
      "bottom-4 right-4 " +
      "max-md:bottom-auto max-md:top-[3.75rem] max-md:right-1"
    }>
      <div className="text-[9px] text-muted-foreground/40 text-right mb-1 uppercase tracking-wider hidden md:block">
        Minimap
      </div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-md border border-border/40 bg-card/90 backdrop-blur cursor-default max-md:opacity-70"
        style={{
          imageRendering: 'pixelated',
          width: size,
          height: size
        }}
        title="Click to toggle minimap"
      />
    </div>
  )
}
