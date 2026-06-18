"use client"

import { useEffect, useRef, useMemo } from "react"

// ═══════════════════════════════════════════════════════════════
// MAP FOG OF WAR + DYNAMIC LIGHTING — Canvas overlay
// ═══════════════════════════════════════════════════════════════
// Renders on a canvas layered over the tile grid:
//   1. Fog of War — dark overlay with circular reveal around player
//   2. Dynamic Lighting — radial gradients from light-emitting objects
//   3. Ambient darkness — combined with day/night cycle
//
// Performance: Single canvas, only redraws when player moves or
// light sources change. Uses offscreen compositing.
// ═══════════════════════════════════════════════════════════════

interface LightSource {
  x: number; y: number
  radius: number; color: string; flicker: boolean
}

interface FogLightingProps {
  width: number           // viewport pixel width
  height: number          // viewport pixel height
  tileSize: number        // px per tile (32 desktop, 18 mobile)
  mapWidth: number        // tiles across
  mapHeight: number       // tiles down
  playerX: number         // player tile X
  playerY: number         // player tile Y
  camX: number            // camera offset in tiles
  camY: number            // camera offset in tiles
  fogEnabled: boolean     // map.fog_of_war
  fogRadius: number       // map.fog_reveal_radius (in tiles)
  ambientDark: number     // map.ambient_dark (0-1)
  lights: LightSource[]   // from map objects with light property
  exploredTiles: Set<string>  // "x,y" keys of previously seen tiles
  onExplore: (tiles: string[]) => void  // callback to persist newly explored tiles
  nightDarkness: number   // from day/night cycle (0-1)
}

export function MapFogLighting({
  width, height, tileSize, mapWidth, mapHeight,
  playerX, playerY, camX, camY,
  fogEnabled, fogRadius, ambientDark,
  lights, exploredTiles, onExplore, nightDarkness,
}: FogLightingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const flickerRef = useRef(0)

  // Track newly explored tiles
  const newlyExplored = useMemo(() => {
    if (!fogEnabled) return []
    const fresh: string[] = []
    const r = fogRadius || 3
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue
        const tx = playerX + dx, ty = playerY + dy
        if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue
        const key = `${tx},${ty}`
        if (!exploredTiles.has(key)) fresh.push(key)
      }
    }
    return fresh
  }, [fogEnabled, fogRadius, playerX, playerY, mapWidth, mapHeight, exploredTiles])

  // Report newly explored tiles
  useEffect(() => {
    if (newlyExplored.length > 0) onExplore(newlyExplored)
  }, [newlyExplored, onExplore])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const step = tileSize + 1
    const totalDark = Math.min(1, ambientDark + nightDarkness)

    // Skip rendering if nothing to draw
    if (!fogEnabled && totalDark <= 0 && lights.length === 0) {
      ctx.clearRect(0, 0, width, height)
      return
    }

    const draw = () => {
      flickerRef.current++
      ctx.clearRect(0, 0, width, height)

      // ── Base darkness layer ──────────────────────────────────
      if (fogEnabled) {
        // Full black fog
        ctx.fillStyle = 'rgba(0,0,0,0.95)'
        ctx.fillRect(0, 0, width, height)

        // Cut out explored tiles (dim)
        ctx.globalCompositeOperation = 'destination-out'
        exploredTiles.forEach(key => {
          const [tx, ty] = key.split(',').map(Number)
          const sx = (tx - camX) * step
          const sy = (ty - camY) * step
          ctx.fillStyle = 'rgba(0,0,0,0.6)' // partially reveal
          ctx.fillRect(sx, sy, tileSize, tileSize)
        })

        // Cut out visible radius around player (full reveal)
        const px = (playerX - camX) * step + tileSize / 2
        const py = (playerY - camY) * step + tileSize / 2
        const revealPx = (fogRadius || 3) * step

        const grad = ctx.createRadialGradient(px, py, revealPx * 0.3, px, py, revealPx)
        grad.addColorStop(0, 'rgba(0,0,0,1)')
        grad.addColorStop(0.7, 'rgba(0,0,0,0.8)')
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(px, py, revealPx, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalCompositeOperation = 'source-over'

      } else if (totalDark > 0) {
        // Ambient darkness only (no fog exploration)
        ctx.fillStyle = `rgba(5,5,20,${totalDark})`
        ctx.fillRect(0, 0, width, height)
      }

      // ── Light sources ────────────────────────────────────────
      if (lights.length > 0) {
        ctx.globalCompositeOperation = 'destination-out'

        for (const light of lights) {
          const lx = (light.x - camX) * step + tileSize / 2
          const ly = (light.y - camY) * step + tileSize / 2

          // Flicker: vary radius by ±10%
          let r = light.radius * step
          if (light.flicker) {
            const f = Math.sin(flickerRef.current * 0.15 + light.x * 7) * 0.1
            r *= (1 + f)
          }

          const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r)

          // Parse light color for gradient
          const alpha = fogEnabled ? 0.9 : Math.min(0.9, totalDark + 0.3)
          grad.addColorStop(0, `rgba(0,0,0,${alpha})`)
          grad.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.5})`)
          grad.addColorStop(1, 'rgba(0,0,0,0)')

          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(lx, ly, r, 0, Math.PI * 2)
          ctx.fill()
        }

        // Add colored glow on top (additive)
        ctx.globalCompositeOperation = 'source-over'
        for (const light of lights) {
          const lx = (light.x - camX) * step + tileSize / 2
          const ly = (light.y - camY) * step + tileSize / 2
          let r = light.radius * step * 0.6
          if (light.flicker) {
            r *= (1 + Math.sin(flickerRef.current * 0.15 + light.x * 7) * 0.08)
          }

          const grad = ctx.createRadialGradient(lx, ly, 0, lx, ly, r)
          grad.addColorStop(0, light.color + '30')
          grad.addColorStop(1, light.color + '00')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(lx, ly, r, 0, Math.PI * 2)
          ctx.fill()
        }
      } else {
        ctx.globalCompositeOperation = 'source-over'
      }

      // Animate flicker
      if (lights.some(l => l.flicker) || fogEnabled) {
        frameRef.current = requestAnimationFrame(draw)
      }
    }

    draw()
    return () => { cancelAnimationFrame(frameRef.current) }
  }, [width, height, tileSize, playerX, playerY, camX, camY,
      fogEnabled, fogRadius, ambientDark, lights, exploredTiles, nightDarkness])

  if (!fogEnabled && ambientDark <= 0 && nightDarkness <= 0 && lights.length === 0) return null

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 28 }}
    />
  )
}
