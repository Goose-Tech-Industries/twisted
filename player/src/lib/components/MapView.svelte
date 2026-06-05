<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import type { Character } from '$stores/character.svelte'
  import type { MapDef, NearbyPlayer, MapNpc, GroundItem } from '$stores/world.svelte'
  import type { TilePaletteEntry } from '$stores/tile_palette.svelte'
  import { buildRenderState, TILE_SIZE } from '$lib/render/build-render-state'
  import MapRendererWorker from '$lib/render/map-renderer.worker?worker'
  import { debug } from '$stores/debug.svelte'

  debug.register('Map render', 'stub')

  interface Props {
    map: MapDef
    character: Character | null
    players: NearbyPlayer[]
    npcs: MapNpc[]
    drops?: GroundItem[]
    palette?: TilePaletteEntry[]
    ontileclick?: (x: number, y: number) => void
  }
  let { map, character, players, npcs, drops = [], palette = [], ontileclick }: Props = $props()

  let canvas = $state<HTMLCanvasElement | null>(null)
  let worker: Worker | null = null
  let ready = $state(false)
  let viewport = $state({ w: 0, h: 0 })
  let resizeObserver: ResizeObserver | null = null

  // Fallback flag: some browsers (older Safari, JSDOM in tests) lack
  // OffscreenCanvas + transferControlToOffscreen. Detect once at mount;
  // when missing, fall back to main-thread rendering inline.
  let workerSupported = $state(true)
  let mainThreadFallback: {
    destroy: () => void
    update: (s: unknown) => void
    resize?: (w: number, h: number) => void
  } | null = null

  onMount(() => {
    if (!canvas) return
    // Toggle on the @twisted/render bail/draw counter logs while we
    // chase the "renderer receives state but draws nothing" bug.
    ;(globalThis as { RENDER_DEBUG?: boolean }).RENDER_DEBUG = true
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
      console.info('[map] worker init', { w, h, dpr })
      worker.postMessage({ type: 'init', canvas: off, w, h, dpr }, [off])
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
        renderMode: 'classic',
        tileSize: TILE_SIZE,
        backgroundAlpha: 1,
        callbacks: { onTileClick: (x, y) => ontileclick?.(x, y) }
      })
      await r.init(viewport.w || 800, viewport.h || 600)
      mainThreadFallback = {
        destroy: () => r.destroy(),
        update: (s: unknown) => void r.update(s as never),
        resize: (w: number, h: number) => r.resize(w, h)
      }
      ready = true
      console.info('[map] Pixi renderer ready', { w: viewport.w || 800, h: viewport.h || 600 })
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
      ctx.fillText('🗡️', px, py)
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
      map, character, players, npcs, drops, palette,
      viewportW: viewport.w,
      viewportH: viewport.h,
      tileSize: TILE_SIZE
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
</script>

<div class="map-frame">
  <canvas bind:this={canvas} class="map-canvas"></canvas>

  <div class="map-name">{map.name}</div>

  {#if !ready}
    <div class="overlay">Loading renderer{workerSupported ? ' (worker)' : ' (fallback)'}…</div>
  {/if}
</div>

<style>
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
</style>
