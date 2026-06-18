"use client"

// ═══════════════════════════════════════════════════════════════
// THREE.JS MAP RENDERER — 3D Orbit + Free-Roam FPS
// ═══════════════════════════════════════════════════════════════
// mode="3d"           → Orbit camera, tactical/RTS view
// mode="first-person" → Free-roam FPS with pointer lock, WASD,
//                        mouse look, collision, jump, sprint
//
// Both modes share scene construction. FPS mode adds the
// FPSController for Skyrim-style movement. Position updates
// go to server via socket for authoritative validation.
// ═══════════════════════════════════════════════════════════════

import { useEffect, useRef, useCallback, useState } from "react"
import type * as THREE from "three"
import type { MapRendererProps } from "./types"
import { TILE_COLORS } from "./types"
import { FPSController, type TileCollisionMap, type FPSPositionUpdate } from "@/lib/fps-controller"

let threePromise: Promise<typeof import("three")> | null = null
function loadThree() {
  if (!threePromise) threePromise = import("three")
  return threePromise
}

const WALL_TILES = new Set([1, 6, 7, 16, 24, 30, 38, 47, 50])
const WATER_TILES = new Set([2, 31, 33, 35, 36])

function hexToRGB(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255]
}

// ── Crosshair overlay for FPS mode ──
function Crosshair() {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
      <div className="relative w-6 h-6">
        <div className="absolute top-1/2 left-0 w-full h-px bg-white/40" />
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/40" />
        <div className="absolute top-1/2 left-1/2 w-1 h-1 -mt-0.5 -ml-0.5 rounded-full bg-white/60" />
      </div>
    </div>
  )
}

// ── FPS HUD overlay ──
function FPSHUD({ locked, sprinting }: { locked: boolean; sprinting: boolean }) {
  if (locked) return (
    <div className="absolute bottom-3 left-3 pointer-events-none z-10 flex items-center gap-3">
      {sprinting && (
        <span className="text-[10px] font-bold text-amber-400/80 uppercase tracking-wider">Sprint</span>
      )}
      <span className="text-[10px] text-white/30">ESC to unlock mouse</span>
    </div>
  )
  return (
    <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/30 cursor-pointer">
      <div className="text-center">
        <p className="text-sm text-white/80 font-medium">Click to enter first-person view</p>
        <p className="text-xs text-white/40 mt-1">WASD to move, Mouse to look, Shift to sprint, Space to jump</p>
      </div>
    </div>
  )
}

export function ThreeMapRenderer(props: MapRendererProps) {
  const {
    tiles, elevationData, fringeTiles, objects, entities,
    nearbyPlayers, companions,
    mapWidth, mapHeight, tileSize,
    viewportW, viewportH, playerX, playerY, camX, camY,
    playerSpriteUrl,
    fogEnabled, fogRadius, ambientDark, nightDarkness,
    exploredTiles, onExplore, hiddenFringeTiles,
    onTileClick, onEntityClick,
    mode, zoneType,
    groundItems = [], deployedStructures = [], mapBattles = [],
  } = props

  const isFirstPerson = mode === 'first-person'
  const isHTC = zoneType === 'HTC'

  const containerRef = useRef<HTMLDivElement>(null)
  const fpsRef = useRef<FPSController | null>(null)
  const sceneRef = useRef<{
    scene: InstanceType<typeof import("three").Scene>
    camera: InstanceType<typeof import("three").PerspectiveCamera>
    renderer: InstanceType<typeof import("three").WebGLRenderer>
    animId: number
    clock: InstanceType<typeof import("three").Clock>
    waterMeshes: InstanceType<typeof import("three").Mesh>[]
  } | null>(null)
  const readyRef = useRef(false)
  const [fpsLocked, setFpsLocked] = useState(false)
  const [fpsSprinting, setFpsSprinting] = useState(false)

  // Refs for current tile position (updated by parent via props)
  const playerTileRef = useRef({ x: playerX, y: playerY })
  playerTileRef.current = { x: playerX, y: playerY }

  const step = tileSize + 1
  const vpPxW = viewportW * step
  const vpPxH = viewportH * step

  // Build collision map from tile data
  const collisionMapRef = useRef<TileCollisionMap | null>(null)
  useEffect(() => {
    collisionMapRef.current = {
      width: mapWidth,
      height: mapHeight,
      isPassable(tileX: number, tileY: number): boolean {
        if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) return false
        const tile = tiles[tileY]?.[tileX] ?? 0
        return !WALL_TILES.has(tile) && !WATER_TILES.has(tile)
      },
      getElevation(tileX: number, tileY: number): number {
        if (!elevationData.length) return 0
        const idx = tileY * mapWidth + tileX
        return elevationData[idx] || 0
      },
    }
    if (fpsRef.current) {
      fpsRef.current.collisionMap = collisionMapRef.current
    }
  }, [tiles, elevationData, mapWidth, mapHeight])

  // ── Initialize Three.js scene ──
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let destroyed = false

    loadThree().then((THREE) => {
      if (destroyed) return

      const scene = new THREE.Scene()

      // HTC: white void. Normal: dark atmosphere
      if (isHTC) {
        scene.background = new THREE.Color(0xf8f8ff)
      } else {
        scene.background = new THREE.Color(isFirstPerson ? 0x1a1a2a : 0x0a0a1a)
      }

      // Hemisphere light
      const hemi = new THREE.HemisphereLight(
        isHTC ? 0xffffff : 0x8899cc,
        isHTC ? 0xeeeedd : 0x443322,
        isHTC ? 1.0 : 0.5
      )
      scene.add(hemi)

      // Sun
      const sun = new THREE.DirectionalLight(isHTC ? 0xffffff : 0xffeedd, isHTC ? 1.2 : 0.9)
      sun.position.set(8, 15, 5)
      sun.castShadow = true
      sun.shadow.mapSize.width = 1024
      sun.shadow.mapSize.height = 1024
      sun.shadow.camera.near = 0.5
      sun.shadow.camera.far = 50
      sun.shadow.camera.left = -15
      sun.shadow.camera.right = 15
      sun.shadow.camera.top = 15
      sun.shadow.camera.bottom = -15
      scene.add(sun)

      // Fill light
      const fill = new THREE.DirectionalLight(0x6688aa, 0.3)
      fill.position.set(-5, 8, -3)
      scene.add(fill)

      // Ambient
      const ambient = new THREE.AmbientLight(0x303040, 0.4)
      scene.add(ambient)

      const camera = new THREE.PerspectiveCamera(
        isFirstPerson ? 75 : 50,
        vpPxW / vpPxH,
        0.1, 200
      )

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
      renderer.setSize(vpPxW, vpPxH)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1
      el.innerHTML = ''
      el.appendChild(renderer.domElement)

      const clock = new THREE.Clock()
      const waterMeshes: InstanceType<typeof import("three").Mesh>[] = []

      // ── FPS Controller ──
      if (isFirstPerson) {
        const fps = new FPSController(camera, {
          moveSpeed: 4.0,
          sprintMultiplier: 1.8,
          playerHeight: 0.8,
        })
        fps.collisionMap = collisionMapRef.current
        fps.setTilePosition(playerX, playerY)
        fps.attach(renderer.domElement)

        // Server position updates — emit as tile movement
        fps.onPositionUpdate = (update: FPSPositionUpdate) => {
          setFpsSprinting(update.running)
          // This gets picked up by the parent via a custom event
          const event = new CustomEvent('fps-position-update', { detail: update })
          window.dispatchEvent(event)
        }

        fpsRef.current = fps
      }

      // ── Animation loop ──
      let animId = 0
      const animate = () => {
        animId = requestAnimationFrame(animate)
        const dt = Math.min(clock.getDelta(), 0.1) // cap delta to prevent huge jumps
        const t = clock.getElapsedTime()

        // Update FPS controller
        if (fpsRef.current) {
          fpsRef.current.update(dt, playerTileRef.current.x, playerTileRef.current.y)
          setFpsLocked(fpsRef.current.locked)
        }

        // Animate water
        for (const wm of waterMeshes) {
          wm.position.y = -0.08 + Math.sin(t * 1.5 + wm.position.x * 0.3 + wm.position.z * 0.5) * 0.06
        }

        renderer.render(scene, camera)
      }
      animate()

      sceneRef.current = { scene, camera, renderer, animId, clock, waterMeshes }
      readyRef.current = true
    })

    return () => {
      destroyed = true
      if (fpsRef.current) {
        fpsRef.current.detach()
        fpsRef.current = null
      }
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId)
        sceneRef.current.renderer.dispose()
        sceneRef.current = null
      }
      readyRef.current = false
    }
  }, [vpPxW, vpPxH, isFirstPerson, isHTC])

  // ── Rebuild scene on data change ──
  const rebuild = useCallback(async () => {
    if (!readyRef.current || !sceneRef.current) return
    const THREE = await loadThree()
    const { scene, camera, waterMeshes } = sceneRef.current

    // Clear meshes (keep lights)
    const toRemove: InstanceType<typeof import("three").Object3D>[] = []
    scene.traverse(child => {
      if ((child as InstanceType<typeof import("three").Mesh>).isMesh) toRemove.push(child)
      if ((child as InstanceType<typeof import("three").Sprite>).isSprite) toRemove.push(child)
    })
    toRemove.forEach(c => {
      scene.remove(c)
      if ((c as InstanceType<typeof import("three").Mesh>).geometry) {
        (c as InstanceType<typeof import("three").Mesh>).geometry.dispose()
      }
    })
    waterMeshes.length = 0

    const S = 1
    const renderDist = isFirstPerson ? 16 : viewportW + 4

    // ── Reusable geometries ──
    const groundGeo = new THREE.PlaneGeometry(S, S)
    const waterGeo = new THREE.PlaneGeometry(S, S, 4, 4)

    // ── Material cache ──
    const matCache: Record<string, InstanceType<typeof import("three").MeshStandardMaterial>> = {}
    function getMat(color: number, opts?: { rough?: number; metal?: number; emissive?: number }) {
      const key = `${color}-${opts?.rough ?? 0.85}-${opts?.metal ?? 0}-${opts?.emissive ?? 0}`
      if (!matCache[key]) {
        matCache[key] = new THREE.MeshStandardMaterial({
          color,
          roughness: opts?.rough ?? 0.85,
          metalness: opts?.metal ?? 0,
          ...(opts?.emissive ? { emissive: opts.emissive, emissiveIntensity: 0.3 } : {}),
        })
      }
      return matCache[key]
    }

    // ════════════════════════════════════════════════════════
    // TILES — Ground, Walls, Water
    // ════════════════════════════════════════════════════════
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (Math.abs(x - playerX) > renderDist || Math.abs(y - playerY) > renderDist) continue

        const tile = tiles[y]?.[x] ?? 0
        const color = TILE_COLORS[tile] ?? TILE_COLORS[0]
        const elev = elevationData.length > 0 ? (elevationData[y * mapWidth + x] || 0) : 0
        const wx = (x - playerX) * S
        const wz = (y - playerY) * S

        if (WALL_TILES.has(tile)) {
          // Walls: tall extruded boxes
          const wallH = 2.0 + elev * 0.5
          const wallGeo = new THREE.BoxGeometry(S, wallH, S)
          const mesh = new THREE.Mesh(wallGeo, getMat(color, { rough: 0.95 }))
          mesh.position.set(wx, wallH / 2, wz)
          mesh.castShadow = true
          mesh.receiveShadow = true
          scene.add(mesh)

          // Wall top cap (slightly lighter)
          const capGeo = new THREE.PlaneGeometry(S, S)
          const cap = new THREE.Mesh(capGeo, getMat(color + 0x111111, { rough: 0.8 }))
          cap.rotation.x = -Math.PI / 2
          cap.position.set(wx, wallH, wz)
          cap.receiveShadow = true
          scene.add(cap)
        } else if (WATER_TILES.has(tile)) {
          // Water
          const waterMat = new THREE.MeshStandardMaterial({
            color, transparent: true, opacity: 0.65,
            roughness: 0.1, metalness: 0.3,
          })
          const mesh = new THREE.Mesh(waterGeo, waterMat)
          mesh.rotation.x = -Math.PI / 2
          mesh.position.set(wx, -0.08, wz)
          mesh.receiveShadow = true
          scene.add(mesh)
          waterMeshes.push(mesh)
        } else {
          // Ground
          const mesh = new THREE.Mesh(groundGeo, getMat(color))
          mesh.rotation.x = -Math.PI / 2
          mesh.position.set(wx, elev * 0.5, wz)
          mesh.receiveShadow = true
          scene.add(mesh)

          // Elevated ground gets side walls
          if (elev > 0) {
            const wallH = elev * 0.5
            const sideGeo = new THREE.BoxGeometry(S, wallH, S)
            const sideMesh = new THREE.Mesh(sideGeo, getMat(Math.max(0, color - 0x151515), { rough: 0.9 }))
            sideMesh.position.set(wx, wallH / 2, wz)
            sideMesh.castShadow = true
            scene.add(sideMesh)
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════
    // CEILING (FPS mode — dungeon maps)
    // ════════════════════════════════════════════════════════
    if (isFirstPerson) {
      // Add ceiling plane over walled areas for dungeon feel
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (Math.abs(x - playerX) > renderDist || Math.abs(y - playerY) > renderDist) continue
          const tile = tiles[y]?.[x] ?? 0
          if (WALL_TILES.has(tile)) continue // walls already have caps

          // Check if surrounded by walls (indoor area)
          const neighbors = [
            [x-1,y], [x+1,y], [x,y-1], [x,y+1]
          ]
          const wallCount = neighbors.filter(([nx, ny]) => {
            if (nx < 0 || ny < 0 || nx >= mapWidth || ny >= mapHeight) return true
            return WALL_TILES.has(tiles[ny]?.[nx] ?? 0)
          }).length

          if (wallCount >= 2) {
            const ceilMesh = new THREE.Mesh(groundGeo, getMat(0x1a1a2a, { rough: 0.95 }))
            ceilMesh.rotation.x = Math.PI / 2
            ceilMesh.position.set((x - playerX) * S, 2.0, (y - playerY) * S)
            scene.add(ceilMesh)
          }
        }
      }
    }

    // ════════════════════════════════════════════════════════
    // ENTITIES
    // ════════════════════════════════════════════════════════
    const entityCols: Record<string, number> = {
      npc: 0x228866, enemy: 0xcc3333, shop: 0xbbaa33, player: 0x6666ff,
    }
    const capsuleGeo = new THREE.CapsuleGeometry(0.2, 0.5, 4, 8)

    for (const ent of entities) {
      if (Math.abs(ent.x - playerX) > renderDist || Math.abs(ent.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[ent.y * mapWidth + ent.x] || 0) : 0
      const col = entityCols[ent.type] || 0xaaaaaa
      const mesh = new THREE.Mesh(capsuleGeo, getMat(col, {
        rough: 0.6,
        emissive: ent.type === 'enemy' ? 0x330000 : 0,
      }))
      mesh.position.set(
        (ent.x - playerX) * S,
        0.45 + elev * 0.5,
        (ent.y - playerY) * S,
      )
      mesh.castShadow = true
      scene.add(mesh)

      // Name label (always in FPS, nearby in 3D)
      const dist = Math.abs(ent.x - playerX) + Math.abs(ent.y - playerY)
      if (dist < (isFirstPerson ? 10 : 6)) {
        const canvas = document.createElement('canvas')
        canvas.width = 256; canvas.height = 48
        const ctx = canvas.getContext('2d')!
        // Background
        ctx.fillStyle = ent.type === 'enemy' ? 'rgba(60,0,0,0.7)' :
                        ent.type === 'npc' ? 'rgba(0,40,30,0.7)' :
                        ent.type === 'shop' ? 'rgba(40,40,0,0.7)' : 'rgba(0,0,40,0.7)'
        ctx.roundRect(0, 8, 256, 32, 4)
        ctx.fill()
        // Text
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(ent.name, 128, 32)
        const tex = new THREE.CanvasTexture(canvas)
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.scale.set(2.0, 0.4, 1)
        sprite.position.set(
          (ent.x - playerX) * S,
          1.3 + elev * 0.5,
          (ent.y - playerY) * S,
        )
        scene.add(sprite)
      }
    }

    // ════════════════════════════════════════════════════════
    // NEARBY PLAYERS
    // ════════════════════════════════════════════════════════
    const playerCapsule = new THREE.CapsuleGeometry(0.18, 0.45, 4, 8)
    for (const p of nearbyPlayers) {
      if (Math.abs(p.x - playerX) > renderDist || Math.abs(p.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[p.y * mapWidth + p.x] || 0) : 0
      const mesh = new THREE.Mesh(playerCapsule, getMat(p.isOffline ? 0x444444 : 0x44bbaa, { rough: 0.5 }))
      mesh.position.set(
        (p.x - playerX) * S,
        0.4 + elev * 0.5,
        (p.y - playerY) * S,
      )
      mesh.castShadow = true
      scene.add(mesh)

      // Player name
      if (Math.abs(p.x - playerX) + Math.abs(p.y - playerY) < 10) {
        const canvas = document.createElement('canvas')
        canvas.width = 256; canvas.height = 48
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = p.isOffline ? 'rgba(30,30,30,0.7)' : 'rgba(0,40,40,0.7)'
        ctx.roundRect(0, 8, 256, 32, 4)
        ctx.fill()
        ctx.fillStyle = p.isOffline ? '#888888' : '#aaffee'
        ctx.font = 'bold 14px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`${p.name} Lv.${p.level}`, 128, 32)
        const tex = new THREE.CanvasTexture(canvas)
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.scale.set(1.8, 0.35, 1)
        sprite.position.set(
          (p.x - playerX) * S,
          1.1 + elev * 0.5,
          (p.y - playerY) * S,
        )
        scene.add(sprite)
      }
    }

    // ════════════════════════════════════════════════════════
    // MAP OBJECTS
    // ════════════════════════════════════════════════════════
    const crateGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5)
    for (const obj of (objects || [])) {
      if (Math.abs(obj.x - playerX) > renderDist || Math.abs(obj.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[obj.y * mapWidth + obj.x] || 0) : 0
      const mesh = new THREE.Mesh(crateGeo, getMat(0x886644, { rough: 0.9 }))
      mesh.position.set(
        (obj.x - playerX) * S,
        0.25 + elev * 0.5,
        (obj.y - playerY) * S,
      )
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)

      // Point lights from light-emitting objects
      if (obj.light && obj.light.radius > 0) {
        const c = parseInt(obj.light.color.replace('#', ''), 16) || 0xff8833
        const ptLight = new THREE.PointLight(c, 1.5, obj.light.radius * 2)
        ptLight.position.set(
          (obj.x - playerX) * S,
          1.0 + elev * 0.5,
          (obj.y - playerY) * S,
        )
        scene.add(ptLight)

        // Visible light source (glowing sphere)
        const glowGeo = new THREE.SphereGeometry(0.08, 8, 8)
        const glowMat = new THREE.MeshBasicMaterial({ color: c })
        const glow = new THREE.Mesh(glowGeo, glowMat)
        glow.position.copy(ptLight.position)
        scene.add(glow)
      }
    }

    // ════════════════════════════════════════════════════════
    // COMPANIONS
    // ════════════════════════════════════════════════════════
    for (const comp of companions) {
      if (Math.abs(comp.x - playerX) > renderDist || Math.abs(comp.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[comp.y * mapWidth + comp.x] || 0) : 0
      const mesh = new THREE.Mesh(capsuleGeo, getMat(0x55aa88, { rough: 0.6 }))
      mesh.position.set(
        (comp.x - playerX) * S,
        0.45 + elev * 0.5,
        (comp.y - playerY) * S,
      )
      mesh.castShadow = true
      scene.add(mesh)
    }

    // ════════════════════════════════════════════════════════
    // GROUND ITEMS (loot drops — glowing yellow spheres)
    // ════════════════════════════════════════════════════════
    const itemGeo = new THREE.SphereGeometry(0.15, 8, 8)
    const itemMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00, roughness: 0.3, metalness: 0.5,
      emissive: 0x664400, emissiveIntensity: 0.5,
    })
    for (const gi of groundItems) {
      if (Math.abs(gi.x - playerX) > renderDist || Math.abs(gi.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[gi.y * mapWidth + gi.x] || 0) : 0
      const mesh = new THREE.Mesh(itemGeo, itemMat)
      mesh.position.set((gi.x - playerX) * S, 0.2 + elev * 0.5, (gi.y - playerY) * S)
      scene.add(mesh)

      // Small point light for glow
      const light = new THREE.PointLight(0xffcc00, 0.5, 2)
      light.position.copy(mesh.position)
      light.position.y += 0.3
      scene.add(light)
    }

    // ════════════════════════════════════════════════════════
    // DEPLOYED STRUCTURES (player buildings — small houses)
    // ════════════════════════════════════════════════════════
    const structGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8)
    const structMat = new THREE.MeshStandardMaterial({ color: 0x886644, roughness: 0.8 })
    for (const s of deployedStructures) {
      if (Math.abs(s.x - playerX) > renderDist || Math.abs(s.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[s.y * mapWidth + s.x] || 0) : 0
      const mesh = new THREE.Mesh(structGeo, structMat)
      mesh.position.set((s.x - playerX) * S, 0.4 + elev * 0.5, (s.y - playerY) * S)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)

      // Roof (pyramid)
      const roofGeo = new THREE.ConeGeometry(0.6, 0.5, 4)
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x993333, roughness: 0.7 })
      const roof = new THREE.Mesh(roofGeo, roofMat)
      roof.position.set((s.x - playerX) * S, 1.05 + elev * 0.5, (s.y - playerY) * S)
      roof.rotation.y = Math.PI / 4
      roof.castShadow = true
      scene.add(roof)
    }

    // ════════════════════════════════════════════════════════
    // BATTLE INDICATORS (red pulsing pillar of light)
    // ════════════════════════════════════════════════════════
    for (const b of mapBattles) {
      if (Math.abs(b.x - playerX) > renderDist || Math.abs(b.y - playerY) > renderDist) continue
      const elev = elevationData.length > 0 ? (elevationData[b.y * mapWidth + b.x] || 0) : 0
      // Red pillar
      const pillarGeo = new THREE.CylinderGeometry(0.1, 0.3, 3, 8)
      const pillarMat = new THREE.MeshBasicMaterial({ color: 0xff3333, transparent: true, opacity: 0.4 })
      const pillar = new THREE.Mesh(pillarGeo, pillarMat)
      pillar.position.set((b.x - playerX) * S, 1.5 + elev * 0.5, (b.y - playerY) * S)
      scene.add(pillar)

      // Red point light
      const bLight = new THREE.PointLight(0xff3333, 1.5, 5)
      bLight.position.set((b.x - playerX) * S, 0.5 + elev * 0.5, (b.y - playerY) * S)
      scene.add(bLight)
    }

    // ════════════════════════════════════════════════════════
    // FRINGE TILES (roofs, tree canopies — rendered above player)
    // ════════════════════════════════════════════════════════
    if (fringeTiles && fringeTiles.length > 0 && !isFirstPerson) {
      const fringeGeo = new THREE.PlaneGeometry(S, S)
      for (let i = 0; i < fringeTiles.length; i++) {
        const tile = fringeTiles[i]
        if (tile < 0) continue
        const fx = i % mapWidth, fy = Math.floor(i / mapWidth)
        if (Math.abs(fx - playerX) > renderDist || Math.abs(fy - playerY) > renderDist) continue

        const isHidden = hiddenFringeTiles?.has(i)
        const color = TILE_COLORS[tile] ?? 0x2a1a0a
        const fMat = new THREE.MeshStandardMaterial({
          color, roughness: 0.9,
          transparent: true, opacity: isHidden ? 0.1 : 0.85,
        })
        const fMesh = new THREE.Mesh(fringeGeo, fMat)
        fMesh.rotation.x = -Math.PI / 2
        fMesh.position.set((fx - playerX) * S, 2.2, (fy - playerY) * S)
        scene.add(fMesh)
      }
    }

    // ════════════════════════════════════════════════════════
    // PLAYER (3D mode only — in FPS you ARE the player)
    // ════════════════════════════════════════════════════════
    if (!isFirstPerson) {
      const elev = elevationData.length > 0 ? (elevationData[playerY * mapWidth + playerX] || 0) : 0
      const pGeo = new THREE.CapsuleGeometry(0.25, 0.6, 4, 8)
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x6666ff, roughness: 0.4, metalness: 0.1,
        emissive: 0x222266, emissiveIntensity: 0.5,
      })
      const pMesh = new THREE.Mesh(pGeo, pMat)
      pMesh.position.set(0, 0.55 + elev * 0.5, 0)
      pMesh.castShadow = true
      scene.add(pMesh)

      // Highlight ring
      const ringGeo = new THREE.RingGeometry(0.35, 0.45, 24)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x8888ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(0, 0.02 + elev * 0.5, 0)
      scene.add(ring)
    }

    // ════════════════════════════════════════════════════════
    // HTC WHITE VOID — infinite floor + subtle grid
    // ════════════════════════════════════════════════════════
    if (isHTC) {
      // Massive white floor plane extending to horizon
      const floorGeo = new THREE.PlaneGeometry(200, 200)
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0xf0f0f0, roughness: 0.3, metalness: 0.05,
      })
      const floor = new THREE.Mesh(floorGeo, floorMat)
      floor.rotation.x = -Math.PI / 2
      floor.position.y = -0.01
      floor.receiveShadow = true
      scene.add(floor)

      // Subtle grid lines on the floor
      const gridHelper = new THREE.GridHelper(200, 200, 0xcccccc, 0xe0e0e0)
      gridHelper.position.y = 0.01
      ;(gridHelper.material as THREE.Material).transparent = true
      ;(gridHelper.material as THREE.Material).opacity = 0.3
      scene.add(gridHelper)

      // Small entrance building (pillars + roof)
      const pillarGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8)
      const pillarMat = new THREE.MeshStandardMaterial({ color: 0xddddcc, roughness: 0.6 })
      const pillarPositions = [[-2, 0, -2], [2, 0, -2], [-2, 0, 2], [2, 0, 2]]
      for (const [px, _, pz] of pillarPositions) {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat)
        pillar.position.set(px - playerX * S + mapWidth * S / 2, 1.5, pz - playerY * S + mapHeight * S / 2)
        pillar.castShadow = true
        scene.add(pillar)
      }

      // Hourglass in center (symbolic)
      const hourglassGeo = new THREE.ConeGeometry(0.3, 0.8, 6)
      const hourglassMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44, roughness: 0.2, metalness: 0.5,
        emissive: 0x442200, emissiveIntensity: 0.3,
      })
      const topCone = new THREE.Mesh(hourglassGeo, hourglassMat)
      topCone.position.set(0, 1.0, 0)
      scene.add(topCone)
      const botCone = new THREE.Mesh(hourglassGeo, hourglassMat)
      botCone.rotation.x = Math.PI
      botCone.position.set(0, 0.2, 0)
      scene.add(botCone)

      // Warm golden point light from hourglass
      const htcLight = new THREE.PointLight(0xffdd44, 2.0, 15)
      htcLight.position.set(0, 1.5, 0)
      scene.add(htcLight)
    }

    // ════════════════════════════════════════════════════════
    // FOG / DARKNESS
    // ════════════════════════════════════════════════════════
    const totalDark = Math.min(1, ambientDark + nightDarkness)
    if (isHTC) {
      // White fog fading to infinity
      scene.fog = new THREE.FogExp2(0xf8f8ff, 0.015)
    } else if (totalDark > 0 || fogEnabled) {
      scene.fog = new THREE.FogExp2(0x000810, fogEnabled ? 0.12 : totalDark * 0.08)
    } else {
      scene.fog = new THREE.FogExp2(isFirstPerson ? 0x0a0a1a : 0x0a0a1a, 0.02)
    }

    // Fog exploration
    if (fogEnabled) {
      const r = fogRadius || 3
      const fresh: string[] = []
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue
          const tx = playerX + dx, ty = playerY + dy
          if (tx < 0 || ty < 0 || tx >= mapWidth || ty >= mapHeight) continue
          const key = `${tx},${ty}`
          if (!exploredTiles.has(key)) fresh.push(key)
        }
      }
      if (fresh.length > 0) onExplore(fresh)
    }

    // ════════════════════════════════════════════════════════
    // CAMERA (3D orbit mode)
    // ════════════════════════════════════════════════════════
    if (!isFirstPerson) {
      camera.position.set(2, 10, 8)
      camera.lookAt(0, 0, 0)
      camera.fov = 50
      camera.updateProjectionMatrix()
    }

  }, [tiles, elevationData, objects, entities, nearbyPlayers, companions,
      mapWidth, mapHeight, tileSize, viewportW, viewportH,
      playerX, playerY, camX, camY, playerSpriteUrl,
      fogEnabled, fogRadius, ambientDark, nightDarkness,
      exploredTiles, onExplore, onTileClick, onEntityClick,
      isFirstPerson, isHTC, mode,
      groundItems, deployedStructures, mapBattles, fringeTiles, hiddenFringeTiles])

  useEffect(() => { rebuild() }, [rebuild])

  return (
    <div className="relative" style={{ width: vpPxW, height: vpPxH }}>
      <div
        ref={containerRef}
        style={{ width: vpPxW, height: vpPxH, overflow: 'hidden' }}
        className="rounded"
      />
      {isFirstPerson && <Crosshair />}
      {isFirstPerson && <FPSHUD locked={fpsLocked} sprinting={fpsSprinting} />}
    </div>
  )
}
