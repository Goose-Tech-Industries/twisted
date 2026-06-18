"use client"

// ═══════════════════════════════════════════════════════════════
// MAP RENDERER — Single Pipeline, Multiple Modes
// ═══════════════════════════════════════════════════════════════
// PixiJS handles ALL rendering: classic (flat), 2.5D (extruded),
// and future modes (isometric, hex). Same data, same features,
// different projection math.
//
// The DOM grid in map-panel.tsx is kept ONLY as an automatic
// fallback when WebGL is unavailable. It renders a basic version
// without fog/lighting/elevation — functional but minimal.
//
// New map features are added to pixi-renderer.tsx ONCE and work
// across all modes automatically.
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import type { MapRendererProps, RenderMode } from "./types"

// Lazy-load renderers — not bundled until first use
const PixiMapRenderer = dynamic(
  () => import("./pixi-renderer").then(m => m.PixiMapRenderer),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm animate-pulse">
      Loading GPU renderer...
    </div>
  )}
)

const ThreeMapRenderer = dynamic(
  () => import("./three-renderer").then(m => m.ThreeMapRenderer),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full text-muted-foreground text-sm animate-pulse">
      Loading 3D renderer...
    </div>
  )}
)

export type { MapRendererProps, RenderMode, MapEntity, MapObject, MapCompanion, NearbyPlayer, GroundItem, DeployedStructure, MapBattle } from "./types"
export { TILE_COLORS_CSS } from "./types"

// Detect WebGL support once
let _webglSupported: boolean | null = null
function isWebGLSupported(): boolean {
  if (_webglSupported !== null) return _webglSupported
  try {
    const canvas = document.createElement('canvas')
    _webglSupported = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    _webglSupported = false
  }
  return _webglSupported
}

/**
 * MapRenderer — the sole rendering component for all map modes.
 *
 * Returns the PixiJS renderer if WebGL is available.
 * Returns null if WebGL is missing (map-panel.tsx auto-falls back to DOM grid).
 *
 * Usage in map-panel.tsx:
 *   if (webglAvailable) {
 *     return <MapRenderer mode={renderMode} ... />
 *   } else {
 *     return <ClassicDOMGrid ... />  // existing DOM code, untouched
 *   }
 */
export function MapRenderer(props: MapRendererProps) {
  const [webgl, setWebgl] = useState(true)

  useEffect(() => {
    setWebgl(isWebGLSupported())
  }, [])

  if (!webgl) return null

  if (props.mode === '3d' || props.mode === 'first-person') return <ThreeMapRenderer {...props} />
  return <PixiMapRenderer {...props} />
}

/**
 * Hook for map-panel to check if Pixi rendering is available.
 * If false, map-panel falls back to the DOM grid.
 */
export function useWebGLAvailable(): boolean {
  const [available, setAvailable] = useState(true)
  useEffect(() => { setAvailable(isWebGLSupported()) }, [])
  return available
}
