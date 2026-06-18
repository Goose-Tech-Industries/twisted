"use client"

// ═══════════════════════════════════════════════════════════════
// PIXI MAP RENDERER — thin React wrapper around @twisted/render
// ═══════════════════════════════════════════════════════════════
//
// All rendering logic (projections, ground/wall/fringe draw, entities,
// fog-of-war, 2.5D wall extrusion, ground items, deployed structures,
// active battle markers, player sprite, light sources) lives in the
// shared `@twisted/render` package so the Phoenix LiveView admin editor
// and this Next.js player client render from the same code.
//
// This file is a React `useEffect`-driven adapter: mount a TwistedRenderer
// on the container element, convert prop changes into RenderState updates,
// and tear it down on unmount.
//
// See packages/render/src/renderer.ts for the canonical rendering code.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef } from "react"
import type { MapRendererProps } from "./types"
import type {
  MapEntity as SharedMapEntity,
  RenderState,
  TilePaletteEntry as SharedTilePaletteEntry,
} from "@twisted/render"
import { TwistedRenderer } from "@twisted/render"

export function PixiMapRenderer(props: MapRendererProps) {
  const {
    tiles,
    elevationData,
    fringeTiles,
    objects,
    entities,
    nearbyPlayers,
    companions,
    mapWidth,
    mapHeight,
    tileSize,
    viewportW,
    viewportH,
    playerX,
    playerY,
    camX,
    camY,
    playerName,
    playerSpriteUrl,
    fogEnabled,
    fogRadius,
    ambientDark,
    nightDarkness,
    exploredTiles,
    onExplore,
    hiddenFringeTiles,
    onTileClick,
    onEntityClick,
    mode,
    tilePalette,
    groundItems = [],
    deployedStructures = [],
    mapBattles = [],
    onPickupItem,
    onEnterStructure,
    onBattleClick,
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<TwistedRenderer | null>(null)

  // Build callbacks in a stable ref so we don't reinit the renderer on every
  // parent re-render. The refs read the latest handlers at event time.
  const callbacksRef = useRef({
    onTileClick,
    onEntityClick,
    onExplore,
    onPickupItem,
    onEnterStructure,
    onBattleClick,
  })
  callbacksRef.current = {
    onTileClick,
    onEntityClick,
    onExplore,
    onPickupItem,
    onEnterStructure,
    onBattleClick,
  }

  // Viewport pixel dimensions — only used for the outer div's CSS sizing.
  // The renderer handles its own canvas size.
  const step = tileSize + 1
  const outerW = viewportW * step
  const outerH = viewportH * step

  // ── Mount / unmount TwistedRenderer ───────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let destroyed = false

    const renderer = new TwistedRenderer({
      container: el,
      canvasMode: "play",
      renderMode: mode,
      tileSize,
      callbacks: {
        onExplore: (keys) => callbacksRef.current.onExplore?.(keys),
        onTileClick: (x, y) => callbacksRef.current.onTileClick?.(x, y),
        onEntityClick: (ent) =>
          callbacksRef.current.onEntityClick?.({
            type: (ent.kind === "companion" ? "npc" : ent.kind) as
              | "npc"
              | "enemy"
              | "shop"
              | "player",
            name: ent.name ?? "",
            x: ent.x,
            y: ent.y,
            spriteUrl: ent.spriteUrl,
          }),
        onPickupItem: (id) => callbacksRef.current.onPickupItem?.(id),
        onEnterStructure: (id) => callbacksRef.current.onEnterStructure?.(id),
        onBattleClick: (id) => callbacksRef.current.onBattleClick?.(id, "watch"),
      },
    })

    rendererRef.current = renderer
    void renderer.init(outerW, outerH)

    return () => {
      destroyed = true
      void destroyed
      renderer.destroy()
      rendererRef.current = null
    }
    // Re-mount when the render mode or viewport dimensions change. Other
    // prop changes go through the update effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, outerW, outerH, tileSize])

  // ── Convert props into a RenderState ──────────────────────
  const renderState: RenderState = useMemo(() => {
    // tiles comes in as number[][] (2D). Flatten to row-major number[].
    const ground: number[] = new Array(mapWidth * mapHeight)
    for (let y = 0; y < mapHeight; y++) {
      const row = tiles[y] || []
      for (let x = 0; x < mapWidth; x++) {
        ground[y * mapWidth + x] = row[x] ?? 0
      }
    }

    // entities — map the React type (npc|enemy|shop|player) to the shared
    // MapEntity kind union. 'shop' has no shared equivalent and folds to
    // 'npc' which carries the same click+icon semantics visually.
    const sharedEntities: SharedMapEntity[] = entities.map((ent, i) => ({
      id: ent.charId ?? `${ent.type}-${i}-${ent.x}-${ent.y}`,
      kind: ent.type === "shop" ? "npc" : ent.type,
      x: ent.x,
      y: ent.y,
      name: ent.name,
      spriteUrl: ent.spriteUrl ?? undefined,
    }))

    // Shared tile palette has slightly different field names (passable vs
    // is_passable). Rewrite in place.
    const sharedPalette: SharedTilePaletteEntry[] | undefined = tilePalette?.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      category: t.category,
      frame_tiles: t.frame_tiles ?? null,
      fps: t.fps ?? null,
      passable: t.is_passable === 1,
    }))

    return {
      layers: {
        ground,
        overlay: new Array(mapWidth * mapHeight).fill(-1),
        passability: new Array(mapWidth * mapHeight).fill(0),
        fringe: fringeTiles,
        elevation: elevationData,
      },
      mapWidth,
      mapHeight,
      objects: (objects || []).map((o) => ({
        x: o.x,
        y: o.y,
        preset: o.preset || "prop",
        icon: o.icon,
        label: o.label,
        type: (o.type as "LIGHT" | "PROP" | "DECO") || "PROP",
        blocking: o.blocking,
        light: o.light
          ? {
              radius: o.light.radius,
              color: o.light.color,
              flicker: o.light.flicker,
            }
          : undefined,
      })),
      entities: sharedEntities,
      nearbyPlayers: nearbyPlayers.map((p) => ({
        id: p.charId,
        x: p.x,
        y: p.y,
        name: p.name,
        isOffline: p.isOffline,
      })),
      companions: companions.map((c) => ({
        id: c.npcId,
        x: c.x,
        y: c.y,
        name: c.name,
        icon: c.icon,
      })),
      groundItems: groundItems.map((g) => ({
        id: g.id,
        x: g.x,
        y: g.y,
        icon: g.icon,
      })),
      deployedStructures: deployedStructures.map((s) => ({
        id: s.id,
        x: s.x,
        y: s.y,
        icon: s.icon,
      })),
      mapBattles: mapBattles.map((b) => ({
        battleId: b.battleId,
        x: b.x,
        y: b.y,
      })),
      hiddenFringeTiles,
      playerX,
      playerY,
      playerName,
      playerSpriteUrl: playerSpriteUrl ?? undefined,
      camX,
      camY,
      viewportW,
      viewportH,
      fogEnabled,
      fogRadius,
      exploredTiles,
      ambientDark,
      nightDarkness,
      tilePalette: sharedPalette,
    }
  }, [
    tiles,
    elevationData,
    fringeTiles,
    objects,
    entities,
    nearbyPlayers,
    companions,
    groundItems,
    deployedStructures,
    mapBattles,
    hiddenFringeTiles,
    mapWidth,
    mapHeight,
    playerX,
    playerY,
    playerName,
    playerSpriteUrl,
    camX,
    camY,
    viewportW,
    viewportH,
    fogEnabled,
    fogRadius,
    exploredTiles,
    ambientDark,
    nightDarkness,
    tilePalette,
  ])

  // ── Push state to renderer ────────────────────────────────
  useEffect(() => {
    if (rendererRef.current) {
      void rendererRef.current.update(renderState)
    }
  }, [renderState])

  return (
    <div
      ref={containerRef}
      style={{ width: outerW, height: outerH, overflow: "hidden" }}
      className="rounded"
    />
  )
}
