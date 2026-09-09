<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { Character } from '$stores/character.svelte'
  import type { MapDef, NearbyPlayer, MapNpc, GroundItem } from '$stores/world.svelte'
  import type { TilePaletteEntry } from '$stores/tile_palette.svelte'
  import type { Equipment } from '$stores/inventory.svelte'
  import { buildRenderState, TILE_SIZE } from '$lib/render/build-render-state'
  import MapRendererWorker from '$lib/render/map-renderer.worker?worker'
  import { debug } from '$stores/debug.svelte'
  import { visualFx } from '$stores/visual_fx.svelte'

  debug.register('Map render', 'stub')

  interface Props {
    map: MapDef
    character: Character | null
    players: NearbyPlayer[]
    npcs: MapNpc[]
    drops?: GroundItem[]
    palette?: TilePaletteEntry[]
    equipment?: Equipment
    fogEnabled?: boolean
    exploredTiles?: Set<string>
    timeOfDay?: string
    ontileclick?: (x: number, y: number) => void
  }
  let { map, character, players, npcs, drops = [], palette = [], equipment, fogEnabled = false, exploredTiles, timeOfDay = 'day', ontileclick }: Props = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let worker: Worker | null = null
  let ready = $state(false)
  let viewport = $state({ w: 0, h: 0 })
  let resizeObserver: ResizeObserver | null = null

  // Fallback flag: some browsers (older Safari, JSDOM in tests) lack
  // OffscreenCanvas + transferControlToOffscreen. Detect once at mount;
  // when missing, fall back to main-thread rendering inline.
  let workerSupported = $state(true)
  let currentRenderMode = $state<'classic' | '2.5d' | 'isometric'>('classic')
  let mainThreadFallback: {
    destroy: () => void
    update: (s: unknown) => void
    resize?: (w: number, h: number) => void
    setRenderMode?: (m: 'classic' | '2.5d' | 'isometric') => void
  } | null = null

  function setProjection(mode: 'classic' | '2.5d' | 'isometric') {
    currentRenderMode = mode
    try {
      localStorage.setItem('twisted_render_mode', mode)
    } catch (_) {}
    if (worker) {
      worker.postMessage({ type: 'set_render_mode', renderMode: mode })
    } else if (mainThreadFallback?.setRenderMode) {
      mainThreadFallback.setRenderMode(mode)
    }
  }

  onMount(() => {
    if (!canvas) return
    // @twisted/render bail/draw counter logs. Off by default — the
    // "renderer receives state but draws nothing" hunt is solved (it was a
    // Pixi Graphics leak in the animated-tile repaint, fixed 2026-06-05).
    // Re-enable on demand by loading the player with ?renderdebug in the URL.
    ;(globalThis as { RENDER_DEBUG?: boolean }).RENDER_DEBUG =
      new URLSearchParams(location.search).has('renderdebug')
    console.info('[map] mount', { mapId: map.id, mapName: map.name })

    // Worker + OffscreenCanvas + Pixi v8 trio is wired but Pixi's init
    // reads several `window.*` and `document.*` properties at module
    // scope; shimming every one of them turns into whack-a-mole. Until
    // a known-good Pixi-in-worker harness is in place, route through
    // the main-thread renderer where DOM is real. Toggle this back to
    // `true` once a settled worker harness lands in @twisted/render.
    const ENABLE_WORKER_RENDERER = false

    const supported =
      ENABLE_WORKER_RENDERER &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof canvas.transferControlToOffscreen === 'function'

    workerSupported = supported

    try {
      const savedMode = localStorage.getItem('twisted_render_mode') as 'classic' | '2.5d' | 'isometric' | null
      if (savedMode && ['classic', '2.5d', 'isometric'].includes(savedMode)) {
        currentRenderMode = savedMode
      } else if (map.render_mode && ['classic', '2.5d', 'isometric'].includes(map.render_mode)) {
        currentRenderMode = map.render_mode as 'classic' | '2.5d' | 'isometric'
      }
    } catch (_) {}

    // Snap canvas backing to its CSS box so Pixi gets sane dimensions.
    const sync = () => {
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      viewport = { w: Math.floor(rect.width), h: Math.floor(rect.height) }
    }
    sync()
    console.info('[map] viewport synced', viewport)
    resizeObserver = new ResizeObserver(sync)
    resizeObserver.observe(canvas)

    if (supported) {
      const off = canvas.transferControlToOffscreen()
      worker = new MapRendererWorker()
      worker.onmessage = (e) => {
        const m = e.data
        if (m.type === 'ready') {
          ready = true
          console.info('[map] worker ready')
        } else if (m.type === 'tile_click') ontileclick?.(m.x, m.y)
        else if (m.type === 'error') console.error('[map worker]', m.message)
      }
      // Force integer dimensions + DPR. canvas.width must be an unsigned
      // long; fractional DPRs (1.25, 1.5) on retina displays multiply
      // through to a float in Pixi's init and the browser rejects it.
      const w = Math.max(1, Math.floor(viewport.w || canvas.clientWidth || 800))
      const h = Math.max(1, Math.floor(viewport.h || canvas.clientHeight || 600))
      const dpr = Math.max(
        1,
        Math.round(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1)
      )
      console.info('[map] worker init', { w, h, dpr, renderMode: currentRenderMode })
      worker.postMessage({ type: 'init', canvas: off, w, h, dpr, renderMode: currentRenderMode }, [off])
    } else {
      // Main-thread fallback. Lazy-load the renderer so the worker path
      // stays the default cheap path.
      console.info('[map] init: main-thread fallback path')
      void initFallback()
    }
  })

  async function initFallback() {
    if (!canvas) return
    try {
      const { TwistedRenderer } = await import('@twisted/render')
      const r = new TwistedRenderer({
        canvas,
        canvasMode: 'play',
        renderMode: currentRenderMode,
        tileSize: TILE_SIZE,
        backgroundAlpha: 1,
        callbacks: { onTileClick: (x, y) => ontileclick?.(x, y) }
      })
      await r.init(viewport.w || 800, viewport.h || 600)
      mainThreadFallback = {
        destroy: () => r.destroy(),
        update: (s: unknown) => void r.update(s as never),
        resize: (w: number, h: number) => r.resize(w, h),
        setRenderMode: (m: 'classic' | '2.5d' | 'isometric') => r.setRenderMode(m)
      }
      ready = true
      console.info('[map] Pixi renderer ready', { w: viewport.w || 800, h: viewport.h || 600, renderMode: currentRenderMode })
    } catch (err) {
      console.warn('[map] Pixi init failed, falling back to canvas2D:', err)
      // Last-resort fallback — direct canvas2D rendering without Pixi.
      mainThreadFallback = createCanvas2DFallback(canvas)
      ready = true
      console.info('[map] canvas2D fallback ready')
    }
  }

  /**
   * Plain canvas2D renderer — used when Pixi can't init for any reason
   * (worker env mismatch, WebGL unavailable, etc.). Renders the same
   * RenderState shape so swapping back to Pixi is a one-line change.
   */
  function createCanvas2DFallback(c: HTMLCanvasElement) {
    const TILE = TILE_SIZE
    // Mirror @twisted/render DEFAULT_TILE_COLORS. All tile IDs 0-63
    // covered so the canvas2D fallback renders identically to Pixi.
    // Unknown IDs (including -1 sentinel) fall back to zinc-800.
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')
    const tileColor = (id: number): string => {
      const COLORS: Record<number, number> = {
        0: 0x2e5d31, 1: 0x3a3a3a, 2: 0x3a2a0a, 3: 0x1e3a5f,
        4: 0x7a5a2a, 5: 0x8a8a8a, 6: 0x2a2a2a, 7: 0x1a1a1a,
        8: 0xc9b27a, 9: 0xe8edf2, 10: 0xa4c8e0, 11: 0x4a3520,
        12: 0xc1331a, 13: 0x5a544f, 14: 0x4a7a3a, 15: 0x8a5d8a,
        16: 0x3a5a30, 17: 0x3d3823, 18: 0x2b1f10, 19: 0x3a3a25,
        20: 0x3d6385, 21: 0x14304f, 22: 0x2d5478, 23: 0x5a8aaa,
        24: 0xd6d2c8, 25: 0x4a525a, 26: 0x813833, 27: 0x6d6e72,
        28: 0xb08a5a, 29: 0x5a574d, 30: 0x5d3329, 31: 0x3a3530,
        32: 0x6e4a25, 33: 0x855e2e, 34: 0x4a311a, 35: 0x2d2010,
        36: 0x4a3a3a, 37: 0x3d6535, 38: 0x2a1f1a, 39: 0x2d5025,
        40: 0xd8d0b8, 41: 0x4a1c1c, 42: 0x6e1c1c, 43: 0x1f1a18,
        44: 0xb8501a, 45: 0x15131a, 46: 0x1a0d2a, 47: 0x3a3520,
        48: 0x6a5aa0, 49: 0x5a8a90, 50: 0x80c0e8, 51: 0x8aa8d0,
        52: 0x7a4ab0, 53: 0x1a6a4a, 54: 0xd090b8, 55: 0x3a2535,
        56: 0xe8c85a, 57: 0xcfcfcf, 58: 0x1a3a20, 59: 0x704040,
        60: 0x505860, 61: 0x7a4a2a, 62: 0x909090, 63: 0x5a1a5a
      }
      return hex(COLORS[id] ?? 0x1f2937)
    }

    const draw = (s: { layers: { ground: number[] }; mapWidth: number; mapHeight: number; playerX: number; playerY: number; nearbyPlayers?: Array<{ x: number; y: number; name?: string }>; entities?: Array<{ x: number; y: number; kind: string; name?: string }>; camX: number; camY: number; viewportW: number; viewportH: number }) => {
      const ctx = c.getContext('2d')
      if (!ctx) return
      const cw = c.clientWidth, ch = c.clientHeight
      if (c.width !== cw || c.height !== ch) {
        c.width = Math.floor(cw) || 1
        c.height = Math.floor(ch) || 1
      }
      // Background behind the map — zinc-900 so unpainted/out-of-bounds
      // canvas area reads as a deep void rather than bright white.
      ctx.fillStyle = '#111118'
      ctx.fillRect(0, 0, c.width, c.height)

      const ox = -s.camX, oy = -s.camY
      const ground = s.layers.ground
      for (let y = 0; y < s.mapHeight; y++) {
        for (let x = 0; x < s.mapWidth; x++) {
          const tile = ground[y * s.mapWidth + x] ?? 0
          ctx.fillStyle = tileColor(tile)
          ctx.fillRect(ox + x * TILE, oy + y * TILE, TILE, TILE)
        }
      }

      // Grid — slightly brighter now so every tile cell reads as a cell,
      // even when the whole map is the same tile id.
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.lineWidth = 1
      for (let x = 0; x <= s.mapWidth; x++) {
        ctx.beginPath()
        ctx.moveTo(ox + x * TILE, oy)
        ctx.lineTo(ox + x * TILE, oy + s.mapHeight * TILE)
        ctx.stroke()
      }
      for (let y = 0; y <= s.mapHeight; y++) {
        ctx.beginPath()
        ctx.moveTo(ox, oy + y * TILE)
        ctx.lineTo(ox + s.mapWidth * TILE, oy + y * TILE)
        ctx.stroke()
      }

      ctx.font = `${Math.floor(TILE * 0.8)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      for (const e of s.entities ?? []) {
        const px = ox + e.x * TILE + TILE / 2
        const py = oy + e.y * TILE + TILE / 2
        if (e.kind === 'enemy') {
          ctx.fillStyle = 'rgba(178, 34, 34, 0.25)'
          ctx.fillRect(ox + e.x * TILE, oy + e.y * TILE, TILE, TILE)
        }
        ctx.fillStyle = '#ece6e3'
        ctx.fillText(e.kind === 'enemy' ? '👹' : '🧙', px, py)
      }

      for (const p of s.nearbyPlayers ?? []) {
        const px = ox + p.x * TILE + TILE / 2
        const py = oy + p.y * TILE + TILE / 2
        ctx.fillStyle = 'rgba(91, 141, 239, 0.2)'
        ctx.fillRect(ox + p.x * TILE, oy + p.y * TILE, TILE, TILE)
        ctx.fillStyle = '#ece6e3'
        ctx.fillText('🧝', px, py)
        if (p.name) {
          ctx.font = '10px sans-serif'
          ctx.fillStyle = '#7baaff'
          ctx.fillText(p.name, px, py - TILE * 0.55)
          ctx.font = `${Math.floor(TILE * 0.8)}px sans-serif`
        }
      }

      // Self
      const px = ox + s.playerX * TILE + TILE / 2
      const py = oy + s.playerY * TILE + TILE / 2
      ctx.fillStyle = 'rgba(178, 34, 34, 0.4)'
      ctx.fillRect(ox + s.playerX * TILE, oy + s.playerY * TILE, TILE, TILE)
      ctx.fillStyle = '#ece6e3'
      const wep = (s as unknown as { playerEquipped?: { weaponIcon?: string } })?.playerEquipped?.weaponIcon || '🗡️'
      ctx.fillText(wep, px, py)
      const shield = (s as unknown as { playerEquipped?: { shieldIcon?: string } })?.playerEquipped?.shieldIcon
      if (shield) {
        ctx.font = `${Math.floor(TILE * 0.45)}px sans-serif`
        ctx.fillText(shield, px + TILE * 0.28, py + TILE * 0.28)
        ctx.font = `${Math.floor(TILE * 0.8)}px sans-serif`
      }

      // Atmospheric Night Darkness & Lantern Halos in Canvas2D fallback
      const totalDark = Math.min(0.88, ((s as { ambientDark?: number }).ambientDark ?? 0) + ((s as { nightDarkness?: number }).nightDarkness ?? 0))
      if (totalDark > 0.05) {
        ctx.save()
        ctx.fillStyle = `rgba(5, 7, 20, ${totalDark})`
        ctx.fillRect(0, 0, c.width, c.height)

        // Cut out radial lantern halos
        ctx.globalCompositeOperation = 'destination-out'
        const cutHalo = (hx: number, hy: number, r: number) => {
          const grad = ctx.createRadialGradient(hx, hy, r * 0.2, hx, hy, r)
          grad.addColorStop(0, 'rgba(0, 0, 0, 0.95)')
          grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.65)')
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(hx, hy, r, 0, Math.PI * 2)
          ctx.fill()
        }

        // 1. Player handheld lantern halo
        cutHalo(px, py, TILE * 3.8)

        // 2. Nearby players' lanterns
        for (const p of s.nearbyPlayers ?? []) {
          cutHalo(ox + p.x * TILE + TILE / 2, oy + p.y * TILE + TILE / 2, TILE * 3.2)
        }

        // 3. Captain Vane and lantern-bearing watchmen
        for (const e of s.entities ?? []) {
          const n = (e.name || '').toLowerCase()
          if (n.includes('vane') || n.includes('watch') || n.includes('sentry') || n.includes('guard')) {
            cutHalo(ox + e.x * TILE + TILE / 2, oy + e.y * TILE + TILE / 2, n.includes('vane') ? TILE * 4.5 : TILE * 3.5)
          }
        }

        // Warm amber tint over lantern lights
        ctx.globalCompositeOperation = 'source-over'
        const glowHalo = (hx: number, hy: number, r: number, color: string) => {
          const grad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r)
          grad.addColorStop(0, color + '55')
          grad.addColorStop(0.5, color + '22')
          grad.addColorStop(1, color + '00')
          ctx.fillStyle = grad
          ctx.beginPath()
          ctx.arc(hx, hy, r, 0, Math.PI * 2)
          ctx.fill()
        }
        glowHalo(px, py, TILE * 3.5, '#ffb347')
        for (const e of s.entities ?? []) {
          const n = (e.name || '').toLowerCase()
          if (n.includes('vane')) {
            glowHalo(ox + e.x * TILE + TILE / 2, oy + e.y * TILE + TILE / 2, TILE * 4.2, '#ff9933')
          }
        }
        ctx.restore()
      }
    }

    return {
      destroy: () => { /* nothing to tear down */ },
      update: (state: unknown) => draw(state as never)
    }
  }

  onDestroy(() => {
    resizeObserver?.disconnect()
    worker?.postMessage({ type: 'destroy' })
    worker?.terminate()
    worker = null
    mainThreadFallback?.destroy()
    mainThreadFallback = null
  })

  // Resize the renderer's backing buffer when the canvas viewport
  // changes. Without this, Pixi keeps its initial 800×600 (or whatever
  // viewport.w was at init time) and the visible canvas stretches
  // around an off-axis WebGL viewport — symptom: black canvas with
  // content rendered outside the visible region.
  let lastResize = $state({ w: 0, h: 0 })
  $effect(() => {
    if (!ready) return
    if (!viewport.w || !viewport.h) return
    if (viewport.w === lastResize.w && viewport.h === lastResize.h) return
    lastResize = { w: viewport.w, h: viewport.h }
    if (worker) {
      worker.postMessage({ type: 'resize', w: viewport.w, h: viewport.h })
    } else {
      mainThreadFallback?.resize?.(viewport.w, viewport.h)
    }
    console.info('[map] resize', viewport)
  })

  // Push a fresh render state whenever any input changes.
  $effect(() => {
    if (!ready) {
      console.debug('[map] effect skip: renderer not ready')
      return
    }
    if (!viewport.w || !viewport.h) {
      console.debug('[map] effect skip: viewport zero', viewport)
      return
    }

    const state = buildRenderState({
      map, character, players, npcs, drops, palette, equipment,
      viewportW: viewport.w,
      viewportH: viewport.h,
      tileSize: TILE_SIZE,
      fogEnabled,
      exploredTiles,
      timeOfDay,
    })

    const groundLen = state.layers.ground.length
    const groundNonZero = state.layers.ground.filter(t => t > 0).length
    console.info('[map] update', {
      mapW: state.mapWidth, mapH: state.mapHeight,
      ground: `${groundNonZero}/${groundLen}`,
      vp: [state.viewportW, state.viewportH],
      cam: [state.camX, state.camY],
      player: [state.playerX, state.playerY],
      paletteSize: state.tilePalette?.length ?? 0,
      paletteSample: state.tilePalette?.slice(0, 3)
    })

    // Full-state dump (Ticket N+1, Step 1) — arrays > 30 elided.
    // Helps spot key-shape mismatches: missing/null palette entries,
    // wrong key naming (paletteEntries vs tilePalette), etc.
    if ((window as Window & { __mapDumped?: boolean }).__mapDumped !== true) {
      ;(window as Window & { __mapDumped?: boolean }).__mapDumped = true
      console.info('[map] update FULL (first push only)', JSON.stringify(state, (_k, v) =>
        Array.isArray(v) && v.length > 30 ? `<Array len=${v.length}>` : v
      , 2))
    }

    if (worker) {
      worker.postMessage({ type: 'state', state })
      debug.update('Map render', 'real')
    } else if (mainThreadFallback) {
      mainThreadFallback.update(state)
      debug.update('Map render', 'real')
    } else {
      console.warn('[map] update reached but no renderer instance available')
    }
  })

  interface OrbitalStrikePayload { x: number; y: number; color?: string; ts: number }
  interface SupplyDropPayload { x: number; y: number; icon?: string; ts: number }

  let activeStrike = $derived.by(() => {
    const s = visualFx.overworld.orbital_strike as OrbitalStrikePayload | undefined
    if (s && Date.now() - s.ts < 4000) return s
    return null
  })

  let activeDrop = $derived.by(() => {
    const d = visualFx.overworld.supply_drop as SupplyDropPayload | undefined
    if (d && Date.now() - d.ts < 5000) return d
    return null
  })
</script>

<div class="map-frame">
  <canvas bind:this={canvas} class="map-canvas"></canvas>

  <div class="map-name">{map.name}</div>

  <div class="projection-switcher">
    <button class:active={currentRenderMode === 'classic'} onclick={() => setProjection('classic')} title="Classic Top-Down 2D Grid">
      🗺️ 2D
    </button>
    <button class:active={currentRenderMode === '2.5d'} onclick={() => setProjection('2.5d')} title="2.5D Extruded Elevation Walls">
      ⛰️ 2.5D
    </button>
    <button class:active={currentRenderMode === 'isometric'} onclick={() => setProjection('isometric')} title="Tactical Diamond Isometric Projection">
      🔷 Iso
    </button>
  </div>

  {#if activeStrike}
    <div class="orbital-strike-fx" style="--strike-color: {activeStrike.color || '#38bdf8'}">
      <div class="beam"></div>
      <div class="ground-shockwave"></div>
      <div class="strike-label">⚡ CELESTIAL BEAM ({activeStrike.x}, {activeStrike.y})</div>
    </div>
  {/if}

  {#if activeDrop}
    <div class="supply-drop-fx">
      <div class="drop-icon">{activeDrop.icon || '🎁'}</div>
      <div class="drop-label">SUPPLY BEACON ({activeDrop.x}, {activeDrop.y})</div>
    </div>
  {/if}

  {#if !ready}
    <div class="overlay">Loading renderer{workerSupported ? ' (worker)' : ' (fallback)'}…</div>
  {/if}
</div>

<style>
  .projection-switcher {
    position: absolute;
    top: 8px; right: 12px;
    display: flex;
    gap: 2px;
    background: rgba(13, 14, 18, 0.85);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 2px;
    z-index: 10;
    backdrop-filter: blur(4px);
  }
  .projection-switcher button {
    background: transparent;
    border: none;
    color: var(--fg-muted);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .projection-switcher button:hover {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.05);
  }
  .projection-switcher button.active {
    color: var(--accent);
    background: rgba(212, 163, 89, 0.2);
    box-shadow: 0 0 6px rgba(212, 163, 89, 0.25);
  }
  .map-frame {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #050505;
  }
  .map-canvas {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
  }
  .map-name {
    position: absolute;
    top: 8px; left: 12px;
    color: var(--accent);
    font-size: 0.8125rem;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
    pointer-events: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: var(--fg-muted);
    background: rgba(0,0,0,0.4);
    pointer-events: none;
  }
  .orbital-strike-fx {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 25;
    animation: flash-fade 3.5s ease-out forwards;
  }
  .orbital-strike-fx .beam {
    width: 24px;
    height: 100%;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), var(--strike-color), transparent);
    box-shadow: 0 0 35px var(--strike-color), 0 0 70px var(--strike-color);
    animation: beam-descend 1.5s ease-out forwards;
  }
  .orbital-strike-fx .ground-shockwave {
    width: 200px;
    height: 60px;
    border-radius: 50%;
    border: 3px solid var(--strike-color);
    box-shadow: 0 0 25px var(--strike-color);
    animation: shockwave-expand 2s ease-out infinite;
  }
  .orbital-strike-fx .strike-label {
    position: absolute;
    bottom: 20%;
    background: rgba(0, 0, 0, 0.85);
    border: 1px solid var(--strike-color);
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: bold;
    padding: 4px 12px;
    border-radius: 9999px;
    letter-spacing: 0.05em;
    text-shadow: 0 0 8px var(--strike-color);
  }
  .supply-drop-fx {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    pointer-events: none;
    z-index: 25;
    animation: bounce-float 2.5s ease-in-out infinite;
  }
  .supply-drop-fx .drop-icon {
    font-size: 3rem;
    filter: drop-shadow(0 0 15px #10b981);
  }
  .supply-drop-fx .drop-label {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #6ee7b7;
    font-size: 0.7rem;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    margin-top: 4px;
  }
  @keyframes flash-fade {
    0% { opacity: 0; }
    15% { opacity: 1; }
    80% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes beam-descend {
    0% { transform: scaleY(0); transform-origin: top; }
    100% { transform: scaleY(1); transform-origin: top; }
  }
  @keyframes shockwave-expand {
    0% { transform: scale(0.2); opacity: 1; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes bounce-float {
    0%, 100% { transform: translate(-50%, -50%); }
    50% { transform: translate(-50%, -60%); }
  }
</style>
