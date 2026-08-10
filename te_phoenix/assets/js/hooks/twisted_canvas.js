// ═══════════════════════════════════════════════════════════════
// TwistedCanvas — LiveView JS hook binding for @twisted/render
// ═══════════════════════════════════════════════════════════════
//
// Mounts a TwistedRenderer inside the hook element and wires the
// Phoenix LiveView op protocol to renderer.update() calls.
//
// Usage in a HEEx template:
//
//   <div id={"map-canvas-#{@map.id}"}
//        phx-hook="TwistedCanvas"
//        phx-update="ignore"
//        data-canvas-mode="edit"
//        data-render-mode="classic"
//        data-tile-size="20"
//        data-viewport-w="30"
//        data-viewport-h="20"
//        data-map-id={@map.id}>
//   </div>
//
// LiveView → Client events:
//   - "map:state"            → renderer.update(state)
//   - "map:set_render_mode"  → renderer.setRenderMode(mode)
//   - "map:set_canvas_mode"  → renderer.setCanvasMode(mode)
//
// Client → LiveView events:
//   - "tile_click" {x, y}    → fired on pointer-down on a tile
//   - "explore" {tiles}      → fired when fog-of-war reveals new tiles
//   - "entity_click" {...}   → fired on entity click
//
// ═══════════════════════════════════════════════════════════════

import { TwistedRenderer } from "@twisted/render"

export const TwistedCanvas = {
  mounted() {
    const el = this.el

    // LiveView can re-mount the same hook element when patches reorder
    // siblings or when phx-update="ignore" is bypassed. Guard prevents
    // duplicate Pixi instances + double event listeners on the same DOM.
    if (el._twistedMounted) {
      console.warn("[TwistedCanvas] mount called on already-mounted element, skipping")
      return
    }
    el._twistedMounted = true

    const canvasMode = el.dataset.canvasMode || "play"
    const renderMode = el.dataset.renderMode || "classic"
    const tileSize = parseInt(el.dataset.tileSize || "20", 10)
    const viewportW = parseInt(el.dataset.viewportW || "30", 10)
    const viewportH = parseInt(el.dataset.viewportH || "20", 10)

    this.tileSize = tileSize
    this.viewportW = viewportW
    this.viewportH = viewportH
    this.lastState = null

    // Pixi init calls container.innerHTML="" which destroys sibling overlays.
    // Wrap the renderer in its own sub-div so overlays survive.
    this.pixiWrapper = document.createElement("div")
    this.pixiWrapper.style.cssText = "position:absolute;inset:0;z-index:1;"
    el.style.position = "relative"
    el.appendChild(this.pixiWrapper)

    this.renderer = new TwistedRenderer({
      container: this.pixiWrapper,
      canvasMode,
      renderMode,
      tileSize,
      callbacks: {
        onExplore: (tileKeys) => {
          this.pushEventTo(el, "explore", { tiles: tileKeys })
        },
        onTileClick: (x, y) => {
          this.pushEventTo(el, "tile_click", { x, y })
        },
        onEntityClick: (entity) => {
          this.pushEventTo(el, "entity_click", { id: entity.id, kind: entity.kind })
        },
      },
    })

    const step = tileSize + 1
    const initW = viewportW * step
    const initH = viewportH * step

    this.renderer.init(initW, initH)

    // ── Pointer → LiveView click plumbing ──
    // Pixi handles rendering; pointer events come from the DOM element.
    // Screen→tile math lives in the renderer so every projection (classic,
    // iso, hex, side-scroll, 2.5D, first-person) inverts correctly.
    // ── Grid overlay ──
    this.showGrid = false
    this.gridOverlay = document.createElement("canvas")
    this.gridOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:7;image-rendering:pixelated;"
    el.appendChild(this.gridOverlay)

    this.drawGrid = () => {
      const state = this.lastState
      const gc = this.gridOverlay
      if (!state || !this.showGrid) { gc.style.display = "none"; return }
      gc.style.display = "block"
      const ts = this.tileSize
      const step = ts + 1
      const w = state.viewportW * step
      const h = state.viewportH * step
      gc.width = w; gc.height = h
      const ctx = gc.getContext("2d")
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = "rgba(255,255,255,0.12)"
      ctx.lineWidth = 1
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke()
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke()
      }
    }

    this.handleEvent("toggle_grid", () => {
      this.showGrid = !this.showGrid
      this.drawGrid()
    })

    // ── Fit-to-Screen ──
    // Scales the rendered map to fill the available space the host page
    // gives us, preserving aspect ratio. Two coordinated changes:
    //   1. tileSize ↑  — so each tile draws at a larger pixel size and
    //      the visible map grows. Rendered with sharp pixels.
    //   2. canvas size = mapTiles * (tileSize + 1) — the canvas grows
    //      to exactly hold the resized map (no dead space).
    // Without (1), increasing canvas size alone leaves the map small in
    // a big canvas — the bug JARVIS caught in the first deploy.
    // D15-v2: canvas fills the available container; map is rendered
    // centered inside it. tileSize is still the largest aspect-preserving
    // fit so the map looks crisp; the remaining space becomes a visible
    // "outside-map" tint band so the user can see where the world ends.
    this.fitToScreen = () => {
      if (!this.renderer || !this.lastState) return
      const main = el.parentElement
      if (!main) return
      const availW = Math.max(1, main.clientWidth - 16)
      const availH = Math.max(1, main.clientHeight - 16)
      const mw = this.lastState.viewportW || this.lastState.mapWidth || 1
      const mh = this.lastState.viewportH || this.lastState.mapHeight || 1
      const tsByW = Math.floor(availW / mw) - 1
      const tsByH = Math.floor(availH / mh) - 1
      const newTileSize = Math.max(4, Math.min(tsByW, tsByH))

      // Canvas DOM = available container; map renders centered inside.
      el.style.width = availW + "px"
      el.style.height = availH + "px"
      this.tileSize = newTileSize
      if (typeof this.renderer.setTileSize === "function") {
        this.renderer.setTileSize(newTileSize)
      }
      this.renderer.resize(availW, availH)
      this.drawGrid()
    }
    this.handleEvent("fit_to_screen", () => this.fitToScreen())

    // ResizeObserver: keep the Pixi backing buffer in sync with the
    // element's CSS box. Without this, resizing the browser window
    // leaves the canvas at its initial size and clicks land on stale
    // coords. Throttled to a single rAF per resize burst.
    let resizeRaf = null
    this.resizeObserver = new ResizeObserver((entries) => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        const entry = entries[entries.length - 1]
        if (!entry || !this.renderer) return
        const cw = entry.contentRect.width
        const ch = entry.contentRect.height
        if (cw < 1 || ch < 1) return
        this.renderer.resize(Math.floor(cw), Math.floor(ch))
        this.drawGrid()
      })
    })
    this.resizeObserver.observe(el)

    // ── Zoom/pan state ──
    this.zoomLevel = 1.0
    this.panning = false
    this.panStart = null

    // Resolve the canonical pointer target. The Pixi canvas is the source
    // of truth — its bounding rect is what the renderer's screenToTile
    // expects coordinates against. We cache the canvas reference once
    // it's available so the rect doesn't drift between handlers.
    this.getPointerTarget = () => {
      if (this._cachedCanvas && this._cachedCanvas.isConnected) return this._cachedCanvas
      const c = this.pixiWrapper ? this.pixiWrapper.querySelector("canvas") : null
      if (c) this._cachedCanvas = c
      return c || this.pixiWrapper || el
    }

    this.pointerToTile = (e) => {
      const target = this.getPointerTarget()
      const rect = target.getBoundingClientRect()
      // The element is CSS-scaled by `transform: scale(zoomLevel)` on `el`.
      // getBoundingClientRect returns post-transform pixel dims, so
      // dividing screen-space delta by the visual scale converts back to
      // canvas-pixel coords. Computing scale from the rect itself (rather
      // than reading this.zoomLevel) keeps us robust to other CSS
      // transforms anyone might layer on later.
      const scaleX = target.clientWidth > 0 ? rect.width / target.clientWidth : 1
      const scaleY = target.clientHeight > 0 ? rect.height / target.clientHeight : 1
      const localX = (e.clientX - rect.left) / (scaleX || 1)
      const localY = (e.clientY - rect.top) / (scaleY || 1)
      const hit = this.renderer.screenToTile(localX, localY)

      // D15-v2: canvas now fills the host container. screenToTile may
      // return tile coords for clicks in the gutter outside the map —
      // clamp to null so out-of-map clicks don't dispatch tile_click and
      // the cursor flips to not-allowed.
      const s = this.lastState
      if (!hit || !s) return null
      if (hit.tileX < 0 || hit.tileY < 0) return null
      if (hit.tileX >= (s.mapWidth || 0)) return null
      if (hit.tileY >= (s.mapHeight || 0)) return null
      return hit
    }

    this.handlePointerDown = (e) => {
      const hit = this.pointerToTile(e)
      if (!hit) return
      this.pushEventTo(el, "tile_click", { x: hit.tileX, y: hit.tileY })
    }

    this.lastCursorPush = 0
    this.hoverTile = null
    this.preview = { kind: null, anchor: null, rect: null }

    this.handlePointerMove = (e) => {
      // Pan with middle mouse or space+drag
      if (this.panning && this.panStart) {
        const dx = e.clientX - this.panStart.x
        const dy = e.clientY - this.panStart.y
        this.panStart = { x: e.clientX, y: e.clientY }
        // Move camera by dx/dy converted to tile units
        const step = (this.tileSize + 1) * this.zoomLevel
        if (step > 0) {
          this.pushEventTo(el, "pan", { dx: -dx / step, dy: -dy / step })
        }
        return
      }

      const hit = this.pointerToTile(e)
      const tx = hit ? hit.tileX : null
      const ty = hit ? hit.tileY : null

      this.hoverTile = hit ? { x: tx, y: ty } : null

      // D15-v2: visible cursor signal when over the outside-map gutter.
      el.style.cursor = hit ? "" : "not-allowed"

      // Throttled cursor_move broadcast for remote collaborator display
      const now = performance.now()
      if (now - this.lastCursorPush > 60 && tx !== null) {
        this.lastCursorPush = now
        this.pushEventTo(el, "cursor_move", { x: tx, y: ty })
        this.pushEventTo(el, "hover_tile", { x: tx, y: ty })
      }

      // Redraw live preview overlay while a rect/select anchor is armed.
      if (this.preview.kind === "rect" || this.preview.kind === "select") {
        this.renderPreview()
      }

      // Continuous paint while dragging with left mouse down
      if (!this.dragging) return
      this.handlePointerDown(e)
    }

    this.handlePointerUp = (e) => {
      this.dragging = false
      this.panning = false
      this.panStart = null
    }

    this.handlePointerDownDrag = (e) => {
      // Middle mouse button = pan
      if (e.button === 1) {
        e.preventDefault()
        this.panning = true
        this.panStart = { x: e.clientX, y: e.clientY }
        return
      }
      // Right-click = eyedropper (pick tile)
      if (e.button === 2) {
        e.preventDefault()
        const hit = this.pointerToTile(e)
        if (hit) {
          this.pushEventTo(el, "eyedrop_tile", { x: hit.tileX, y: hit.tileY })
        }
        return
      }
      if (e.button !== 0) return
      // Space+left click = pan
      if (this._spaceHeld) {
        this.panning = true
        this.panStart = { x: e.clientX, y: e.clientY }
        return
      }
      this.dragging = true
      this.handlePointerDown(e)
    }

    // Prevent context menu on right-click (eyedropper takes over)
    this.handleContextMenu = (e) => { e.preventDefault() }
    this.pixiWrapper.addEventListener("contextmenu", this.handleContextMenu)

    // Mouse wheel = zoom (Ctrl/Cmd-gated so the page can scroll normally)
    this.handleWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      this.zoomLevel = Math.max(0.25, Math.min(3.0, this.zoomLevel + delta))
      el.style.transform = `scale(${this.zoomLevel})`
      el.style.transformOrigin = "top left"
      this.drawGrid()
    }
    el.addEventListener("wheel", this.handleWheel, { passive: false })

    // Attach pointer events to the pixiWrapper. Once Pixi creates its canvas
    // inside the wrapper, pointer events bubble up to the wrapper.
    this.pixiWrapper.addEventListener("pointerdown", this.handlePointerDownDrag)
    this.pixiWrapper.addEventListener("pointermove", this.handlePointerMove)
    this._pointerTarget = this.pixiWrapper

    window.addEventListener("pointerup", this.handlePointerUp)

    this._spaceHeld = false

    this.handleKeyDown = (e) => {
      // Track space for space+drag pan
      if (e.key === " " || e.code === "Space") {
        this._spaceHeld = true
        e.preventDefault()
        return
      }

      // Ignore keyboard shortcuts while an input/textarea has focus
      const target = e.target
      const inForm = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      if (inForm) return

      if (e.key === "Escape" && this.playMode) {
        this.pushEventTo(el, "play:stop", {})
        return
      }

      if (e.key === "Escape" && (this.preview.kind === "rect" || this.preview.kind === "select")) {
        this.pushEventTo(el, "cancel_preview", {})
        return
      }

      // Playtest WASD / arrow movement
      if (this.playMode) {
        const move = { ArrowUp: [0,-1], ArrowDown: [0,1], ArrowLeft: [-1,0], ArrowRight: [1,0],
                       w: [0,-1], s: [0,1], a: [-1,0], d: [1,0],
                       W: [0,-1], S: [0,1], A: [-1,0], D: [1,0] }[e.key]
        if (move) {
          e.preventDefault()
          this.pushEventTo(el, "play:step", { dx: move[0], dy: move[1] })
          return
        }
      }

      // Zoom shortcuts
      if (e.key === "=" || e.key === "+") {
        this.zoomLevel = Math.min(3.0, this.zoomLevel + 0.25)
        el.style.transform = `scale(${this.zoomLevel})`
        el.style.transformOrigin = "top left"
        this.drawGrid()
        return
      }
      if (e.key === "-") {
        this.zoomLevel = Math.max(0.25, this.zoomLevel - 0.25)
        el.style.transform = `scale(${this.zoomLevel})`
        el.style.transformOrigin = "top left"
        this.drawGrid()
        return
      }
      if (e.key === "0") {
        this.zoomLevel = 1.0
        el.style.transform = "scale(1)"
        this.drawGrid()
        return
      }

      // Single-letter tool shortcuts (no modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const shortcutKeys = ["b","f","r","x","i","m","a","p","B","F","R","X","I","M","A","P"]
        if (shortcutKeys.includes(e.key)) {
          this.pushEventTo(el, "shortcut", { key: e.key })
          return
        }
        // Grid toggle
        if (e.key === "g" || e.key === "G") {
          this.showGrid = !this.showGrid
          this.drawGrid()
          this.pushEventTo(el, "toggle_grid", {})
          return
        }
      }

      // Selection clipboard shortcuts — only when a selection is active (kind=selected)
      if (this.preview.kind === "selected") {
        if ((e.ctrlKey || e.metaKey) && e.key === "c") {
          e.preventDefault()
          this.pushEventTo(el, "select:copy", {})
        } else if ((e.ctrlKey || e.metaKey) && e.key === "x") {
          e.preventDefault()
          this.pushEventTo(el, "select:cut", {})
        } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
          e.preventDefault()
          this.pushEventTo(el, "select:paste", {})
        } else if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault()
          this.pushEventTo(el, "select:delete", {})
        }
      }
    }
    window.addEventListener("keydown", this.handleKeyDown)

    this.handleKeyUp = (e) => {
      if (e.key === " " || e.code === "Space") {
        this._spaceHeld = false
      }
    }
    window.addEventListener("keyup", this.handleKeyUp)

    // ── LiveView → Canvas event plumbing ──
    this.handleEvent("map:state", (state) => {
      this.lastState = state
      if (this.renderer) this.renderer.update(state)
      if (this.drawMinimap) this.drawMinimap()
      if (this.evaluateSoundZones) this.evaluateSoundZones()
      if (this._redrawObjectSelection) this._redrawObjectSelection()
      if (!this._didInitialFit && el.dataset.canvasMode === "edit") {
        this._didInitialFit = true
        requestAnimationFrame(() => this.fitToScreen())
      }
    })

    this.handleEvent("map:set_render_mode", ({ mode }) => {
      if (this.renderer) this.renderer.setRenderMode(mode)
    })

    this.handleEvent("map:set_canvas_mode", ({ mode }) => {
      if (this.renderer) this.renderer.setCanvasMode(mode)
      this.playMode = mode === "play"
      // Show minimap only in play mode
      if (this.minimap) this.minimap.style.display = this.playMode ? "block" : "none"
    })

    // Remote cursors — render simple colored circles at other users' positions.
    // This lives in a sibling overlay DOM layer to keep it decoupled from
    // the Pixi stage lifecycle.
    this.cursorOverlay = document.createElement("div")
    this.cursorOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:10;"
    el.style.position = "relative"
    el.appendChild(this.cursorOverlay)

    // Rect/select preview overlay — an absolutely-positioned div we update
    // on the client every pointermove while an anchor is armed on the server.
    this.previewOverlay = document.createElement("div")
    this.previewOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:9;"
    el.appendChild(this.previewOverlay)

    this.renderPreview = () => {
      this.previewOverlay.innerHTML = ""
      if (!this.lastState) return

      const drawBox = (x1, y1, x2, y2, color, dashed) => {
        const lx = Math.min(x1, x2)
        const ly = Math.min(y1, y2)
        const rx = Math.max(x1, x2)
        const ry = Math.max(y1, y2)
        const tl = this.renderer.tileToScreen(lx, ly)
        const br = this.renderer.tileToScreen(rx + 1, ry + 1)
        if (!tl || !br) return
        const box = document.createElement("div")
        box.style.cssText = `
          position:absolute;
          left:${tl.sx}px;
          top:${tl.sy}px;
          width:${br.sx - tl.sx - 1}px;
          height:${br.sy - tl.sy - 1}px;
          border:2px ${dashed ? "dashed" : "solid"} ${color};
          background:${color}22;
          box-shadow:0 0 8px ${color}aa inset;
        `
        this.previewOverlay.appendChild(box)
      }

      if ((this.preview.kind === "rect" || this.preview.kind === "select") && this.preview.anchor && this.hoverTile) {
        const color = this.preview.kind === "rect" ? "#f59e0b" : "#3b82f6"
        drawBox(this.preview.anchor.x, this.preview.anchor.y, this.hoverTile.x, this.hoverTile.y, color, true)
      } else if (this.preview.kind === "selected" && this.preview.rect) {
        drawBox(this.preview.rect.x1, this.preview.rect.y1, this.preview.rect.x2, this.preview.rect.y2, "#3b82f6", false)
      }
    }

    this.handleEvent("edit:set_preview", (payload) => {
      this.preview = {
        kind: payload.kind,
        anchor: payload.anchor || null,
        rect: payload.rect || null,
      }
      this.renderPreview()
    })

    // ── Export / Import plumbing ──
    this.handleEvent("download", ({ filename, content, mime }) => {
      const blob = new Blob([content], { type: mime || "application/octet-stream" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename || "map.json"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    })

    this.importInputHandler = (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        this.pushEventTo(el, "import_map", { json: ev.target.result })
      }
      reader.readAsText(file)
      e.target.value = ""
    }
    this.tiledImportHandler = (e) => {
      const file = e.target.files && e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        this.pushEventTo(el, "import_tiled", { json: ev.target.result })
      }
      reader.readAsText(file)
      e.target.value = ""
    }

    // Defer attaching to next tick — the input lives in a sibling LV-rendered tree
    setTimeout(() => {
      const input = document.getElementById("map-import-input")
      if (input) input.addEventListener("change", this.importInputHandler)
      const tiled = document.getElementById("map-import-tiled-input")
      if (tiled) tiled.addEventListener("change", this.tiledImportHandler)
    }, 0)

    // ── Minimap overlay (only shown in play mode) ──
    this.minimap = document.createElement("canvas")
    this.minimap.width = 120
    this.minimap.height = 120
    this.minimap.style.cssText = `
      position:absolute;right:6px;top:6px;z-index:11;
      border:1px solid #525252;background:#000;image-rendering:pixelated;
      cursor:pointer;display:none;
    `
    this.minimap.title = "Minimap — click to recenter"
    el.appendChild(this.minimap)

    const MINIMAP_PALETTE = {
      0: "#2e5d31", 1: "#3a3a3a", 2: "#3a2a0a", 3: "#1e3a5f",
      4: "#7a5a2a", 5: "#8a8a8a", 6: "#2a2a2a", 7: "#1a1a1a",
    }

    this.drawMinimap = () => {
      const state = this.lastState
      if (!state || !state.layers || !state.mapWidth || !state.mapHeight) return
      const ctx = this.minimap.getContext("2d")
      if (!ctx) return
      const mw = state.mapWidth
      const mh = state.mapHeight
      const sw = this.minimap.width
      const sh = this.minimap.height
      const sx = sw / mw
      const sy = sh / mh
      ctx.clearRect(0, 0, sw, sh)
      const ground = state.layers.ground || []
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const id = ground[y * mw + x] || 0
          ctx.fillStyle = MINIMAP_PALETTE[id] || `hsl(${(id * 137) % 360}, 45%, 40%)`
          ctx.fillRect(Math.floor(x * sx), Math.floor(y * sy), Math.max(1, Math.ceil(sx)), Math.max(1, Math.ceil(sy)))
        }
      }
      // Player marker
      if (typeof state.playerX === "number" && typeof state.playerY === "number") {
        ctx.fillStyle = "#fbbf24"
        ctx.fillRect(Math.floor(state.playerX * sx) - 1, Math.floor(state.playerY * sy) - 1, 3, 3)
      }
    }

    this.minimap.addEventListener("click", (e) => {
      const state = this.lastState
      if (!state) return
      const rect = this.minimap.getBoundingClientRect()
      const mx = (e.clientX - rect.left) / rect.width
      const my = (e.clientY - rect.top) / rect.height
      const tx = Math.floor(mx * state.mapWidth)
      const ty = Math.floor(my * state.mapHeight)
      this.pushEventTo(el, "minimap_click", { x: tx, y: ty })
    })

    // ── Zones overlay (spawn + sound rects) ──
    this.zoneOverlay = document.createElement("div")
    this.zoneOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:8;"
    el.appendChild(this.zoneOverlay)

    // ── Objects overlay ──
    this.objectOverlay = document.createElement("div")
    this.objectOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:8;"
    el.appendChild(this.objectOverlay)

    // ── Sound zone audio engine (Web Audio API) ──
    // Each zone owns: MediaElementSource → GainNode → AudioContext.destination
    // Gain is driven by distance from zone center: 1.0 at center, fades
    // linearly to 0 at the rect edge, exponentially clamped to 0 outside.
    // Fade in/out at zone enter/exit uses AudioParam.linearRampToValueAtTime
    // so the browser handles the curve without a JS rAF loop.
    this.soundZoneAudio = new Map()
    this.lastSoundZones = []
    this.audioCtx = null

    const getAudioCtx = () => {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext
        if (Ctx) this.audioCtx = new Ctx()
      }
      // Most browsers suspend the context until a user gesture. Resume on
      // any pointerdown handler higher up the chain — cheap call when
      // already running.
      if (this.audioCtx && this.audioCtx.state === "suspended") {
        this.audioCtx.resume().catch(() => {})
      }
      return this.audioCtx
    }

    this.updateSoundZones = (incomingZones) => {
      this.lastSoundZones = incomingZones || []
      const incomingIds = new Set(this.lastSoundZones.map((z) => z.id))

      for (const [id, entry] of this.soundZoneAudio) {
        if (!incomingIds.has(id)) {
          try { entry.audio.pause() } catch (_e) {}
          try { entry.source.disconnect() } catch (_e) {}
          try { entry.gain.disconnect() } catch (_e) {}
          this.soundZoneAudio.delete(id)
        }
      }

      for (const z of this.lastSoundZones) {
        if (!this.soundZoneAudio.has(z.id) && z.sound_url) {
          const ctx = getAudioCtx()
          if (!ctx) continue

          const audio = new Audio()
          audio.crossOrigin = "anonymous"
          audio.src = z.sound_url
          audio.loop = z.loop !== false
          audio.preload = "auto"

          let source, gain
          try {
            source = ctx.createMediaElementSource(audio)
            gain = ctx.createGain()
            gain.gain.value = 0
            source.connect(gain)
            gain.connect(ctx.destination)
          } catch (_e) {
            // createMediaElementSource fails if the element is already bound.
            // Fall back to direct volume control on the HTMLAudio element.
            source = null
            gain = null
          }

          this.soundZoneAudio.set(z.id, {
            rect: z,
            audio,
            source,
            gain,
            fade_seconds: z.fade_seconds || 1.0,
            target_volume: typeof z.volume === "number" ? z.volume : 0.6,
            playing: false,
          })
        } else if (this.soundZoneAudio.has(z.id)) {
          // Update latest rect shape in case it was moved
          this.soundZoneAudio.get(z.id).rect = z
        }
      }

      this.evaluateSoundZones()
    }

    this.evaluateSoundZones = () => {
      const state = this.lastState
      const px = state ? state.playerX : (this.hoverTile && this.hoverTile.x)
      const py = state ? state.playerY : (this.hoverTile && this.hoverTile.y)
      if (px == null || py == null) return

      const ctx = this.audioCtx
      const nowTs = ctx ? ctx.currentTime : 0

      for (const [, entry] of this.soundZoneAudio) {
        const r = entry.rect
        const cx = (r.x1 + r.x2) / 2
        const cy = (r.y1 + r.y2) / 2
        const hw = Math.max(1, (r.x2 - r.x1 + 1) / 2)
        const hh = Math.max(1, (r.y2 - r.y1 + 1) / 2)

        // Inside-rect distance-from-center normalised to [0, 1], where 0 is
        // the center and 1 is the rect edge. Outside the rect clamps to 1.
        const nx = Math.min(1, Math.abs(px - cx) / hw)
        const ny = Math.min(1, Math.abs(py - cy) / hh)
        const n = Math.max(nx, ny) // L-inf norm for rectangular falloff
        const inside = px >= r.x1 && px <= r.x2 && py >= r.y1 && py <= r.y2
        const falloff = inside ? 1 - n : 0
        const target = entry.target_volume * falloff

        if (target > 0 && !entry.playing) {
          entry.playing = true
          try { entry.audio.play().catch(() => {}) } catch (_e) {}
        }

        if (entry.gain) {
          const g = entry.gain.gain
          g.cancelScheduledValues(nowTs)
          g.setValueAtTime(g.value, nowTs)
          g.linearRampToValueAtTime(target, nowTs + entry.fade_seconds)
        } else {
          // Fallback path for same-origin <audio> without Web Audio routing
          entry.audio.volume = Math.max(0, Math.min(1, target))
        }

        if (target <= 0 && entry.playing) {
          setTimeout(() => {
            try { entry.audio.pause() } catch (_e) {}
            entry.playing = false
          }, entry.fade_seconds * 1000)
        }
      }
    }

    // Cached zone payload, used by re-renders triggered by selection
    // changes without a full map:zones round-trip.
    this._lastSpawnZones = []
    this._lastSoundZones = []
    this._selectedZone = null  // { kind: "spawn"|"sound", id: "..." }

    this.handleEvent("map:zones", ({ spawn_zones, sound_zones, selected }) => {
      this.updateSoundZones(sound_zones)
      this._lastSpawnZones = spawn_zones || []
      this._lastSoundZones = sound_zones || []
      if (selected !== undefined) this._selectedZone = selected || null
      this._redrawZones()
    })

    this.handleEvent("zones:select", ({ kind, id }) => {
      this._selectedZone = id ? { kind, id } : null
      this._redrawZones()
    })

    this._redrawZones = () => {
      this.zoneOverlay.innerHTML = ""
      if (!this.lastState) return

      const drawZoneBox = (z, kind) => {
        const color = kind === "spawn" ? "#a3e635" : "#60a5fa"
        const tl = this.renderer.tileToScreen(z.x1, z.y1)
        const br = this.renderer.tileToScreen(z.x2 + 1, z.y2 + 1)
        if (!tl || !br) return

        const isSelected = this._selectedZone &&
                           this._selectedZone.kind === kind &&
                           this._selectedZone.id === z.id

        const box = document.createElement("div")
        box.dataset.zoneKind = kind
        box.dataset.zoneId = z.id
        const w = Math.max(0, br.sx - tl.sx - 1)
        const h = Math.max(0, br.sy - tl.sy - 1)
        box.style.cssText = `
          position:absolute;
          left:${tl.sx}px;
          top:${tl.sy}px;
          width:${w}px;
          height:${h}px;
          border:${isSelected ? 2 : 1}px ${isSelected ? "solid" : "dashed"} ${color};
          background:${color}${isSelected ? "33" : "18"};
          pointer-events:auto;
          cursor:${isSelected ? "move" : "pointer"};
          box-sizing:border-box;
        `

        const tag = document.createElement("div")
        tag.textContent = kind
        tag.style.cssText = `
          position:absolute;left:2px;top:2px;font:9px monospace;
          color:${color};background:#000a;padding:0 3px;border-radius:2px;
          pointer-events:none;
        `
        box.appendChild(tag)

        // Click to select / deselect.
        box.addEventListener("click", (e) => {
          e.stopPropagation()
          this.pushEventTo(el, "zone:select", { kind, id: z.id })
        })

        if (isSelected) {
          // Eight resize handles + center move handle.
          const handleStyle = (cursor) => `
            position:absolute;
            width:10px;height:10px;
            background:${color};
            border:1.5px solid #0008;
            border-radius:2px;
            cursor:${cursor};
            pointer-events:auto;
            z-index:2;
          `
          const handles = [
            { name: "nw", left: -5, top: -5, cursor: "nwse-resize" },
            { name: "n",  left: w / 2 - 5, top: -5, cursor: "ns-resize" },
            { name: "ne", left: w - 5, top: -5, cursor: "nesw-resize" },
            { name: "e",  left: w - 5, top: h / 2 - 5, cursor: "ew-resize" },
            { name: "se", left: w - 5, top: h - 5, cursor: "nwse-resize" },
            { name: "s",  left: w / 2 - 5, top: h - 5, cursor: "ns-resize" },
            { name: "sw", left: -5, top: h - 5, cursor: "nesw-resize" },
            { name: "w",  left: -5, top: h / 2 - 5, cursor: "ew-resize" },
          ]
          handles.forEach((hd) => {
            const handle = document.createElement("div")
            handle.dataset.handle = hd.name
            handle.style.cssText = handleStyle(hd.cursor) +
              `left:${hd.left}px;top:${hd.top}px;`
            handle.addEventListener("pointerdown", (e) => this._beginZoneDrag(e, z, kind, hd.name))
            box.appendChild(handle)
          })

          // Drag the body itself = move zone.
          box.addEventListener("pointerdown", (e) => {
            // Ignore handle clicks (they have their own listener)
            if (e.target !== box) return
            this._beginZoneDrag(e, z, kind, "move")
          })
        }

        this.zoneOverlay.appendChild(box)
      }

      this._lastSpawnZones.forEach((z) => drawZoneBox(z, "spawn"))
      this._lastSoundZones.forEach((z) => drawZoneBox(z, "sound"))

      // Re-draw spawn marker on top.
      if (this._spawnPoint) this._renderSpawnMarker(this._spawnPoint)
    }

    // Begin a drag for a zone resize/move. Tracks pointer until release;
    // commits the new bounds via "zone:update_rect" once released.
    this._beginZoneDrag = (e, zone, kind, handle) => {
      e.preventDefault()
      e.stopPropagation()
      const start = this._pointerToTile(e) || { tileX: 0, tileY: 0 }
      const orig = { x1: zone.x1, y1: zone.y1, x2: zone.x2, y2: zone.y2 }
      let current = { ...orig }

      const computeRect = (cur) => {
        const dx = cur.tileX - start.tileX
        const dy = cur.tileY - start.tileY
        let r = { ...orig }
        if (handle === "move") {
          r = { x1: orig.x1 + dx, y1: orig.y1 + dy, x2: orig.x2 + dx, y2: orig.y2 + dy }
        } else {
          if (handle.includes("n")) r.y1 = orig.y1 + dy
          if (handle.includes("s")) r.y2 = orig.y2 + dy
          if (handle.includes("w")) r.x1 = orig.x1 + dx
          if (handle.includes("e")) r.x2 = orig.x2 + dx
          // Normalize so x1<=x2, y1<=y2 in case user drags past opposite edge.
          if (r.x1 > r.x2) [r.x1, r.x2] = [r.x2, r.x1]
          if (r.y1 > r.y2) [r.y1, r.y2] = [r.y2, r.y1]
        }
        return r
      }

      const onMove = (ev) => {
        const cur = this._pointerToTile(ev)
        if (!cur) return
        current = computeRect(cur)
        // Optimistic local re-draw using a transient zone copy.
        Object.assign(zone, current)
        this._redrawZones()
      }

      const onUp = (_ev) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        // Tell the server to persist (it'll broadcast a fresh map:zones).
        this.pushEventTo(el, "zone:update_rect", {
          kind,
          id: zone.id,
          x1: current.x1, y1: current.y1,
          x2: current.x2, y2: current.y2,
        })
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp, { once: true })
    }

    // Helper: pointer event → tile coords, sharing the same projection
    // logic as handlePointerDown. Returns null if outside the canvas.
    this._pointerToTile = (e) => {
      const target = this.getPointerTarget()
      const rect = target.getBoundingClientRect()
      const scaleX = target.clientWidth > 0 ? rect.width / target.clientWidth : 1
      const scaleY = target.clientHeight > 0 ? rect.height / target.clientHeight : 1
      const localX = (e.clientX - rect.left) / (scaleX || 1)
      const localY = (e.clientY - rect.top) / (scaleY || 1)
      return this.renderer.screenToTile(localX, localY)
    }

    // ── D10: spawn marker (single tile, distinct from spawn zones) ──
    // The Spawn TOOL's primary action is "set spawn point": click any
    // tile and (spawn_x, spawn_y) on the map row updates. The marker is
    // a blue circle drawn in editor mode only — playmode has its own
    // player marker that the renderer handles.
    this._spawnPoint = null
    this._renderSpawnMarker = (pt) => {
      const existing = this.zoneOverlay.querySelector("[data-marker=spawn]")
      if (existing) existing.remove()
      if (!pt || pt.x == null || pt.y == null) return
      if (el.dataset.canvasMode !== "edit") return
      const tl = this.renderer && this.renderer.tileToScreen(pt.x, pt.y)
      const br = this.renderer && this.renderer.tileToScreen(pt.x + 1, pt.y + 1)
      if (!tl || !br) return
      const w = br.sx - tl.sx
      const h = br.sy - tl.sy
      const dot = document.createElement("div")
      dot.dataset.marker = "spawn"
      dot.style.cssText = `
        position:absolute;
        left:${tl.sx + w * 0.15}px;
        top:${tl.sy + h * 0.15}px;
        width:${w * 0.7}px;
        height:${h * 0.7}px;
        border-radius:50%;
        border:2px solid #38bdf8;
        background:#0ea5e944;
        box-shadow:0 0 8px #38bdf8aa;
        pointer-events:none;
      `
      this.zoneOverlay.appendChild(dot)
    }

    this.handleEvent("map:spawn", ({ x, y }) => {
      this._spawnPoint = { x, y }
      this._renderSpawnMarker(this._spawnPoint)
    })

    // Audio preview for the Sound right-panel ▶ button. Plays the URL
    // for max 2s at the requested volume so a long ambient loop doesn't
    // hijack the editor session. Stops any prior preview first.
    this.handleEvent("sound:preview", ({ url, volume }) => {
      if (this._previewAudio) {
        try { this._previewAudio.pause() } catch (_) {}
      }
      if (this._previewTimeout) {
        clearTimeout(this._previewTimeout)
        this._previewTimeout = null
      }
      if (!url) return
      const audio = new Audio(url)
      audio.volume = Math.max(0, Math.min(1, volume == null ? 0.6 : volume))
      audio.play().catch((err) => console.warn("[sound:preview]", err))
      this._previewAudio = audio
      this._previewTimeout = setTimeout(() => {
        try { audio.pause() } catch (_) {}
        this._previewAudio = null
        this._previewTimeout = null
      }, 2000)
    })

    this._selectedObjectId = null
    this.handleEvent("object:select", ({ id }) => {
      this._selectedObjectId = id || null
      this._redrawObjectSelection()
    })

    this._redrawObjectSelection = () => {
      this.objectOverlay.innerHTML = ""
      if (!this.lastState || !this._selectedObjectId) return
      
      const obj = this.lastState.objects.find(o => o.id === this._selectedObjectId)
      if (!obj) return

      const tl = this.renderer.tileToScreen(obj.x, obj.y)
      const br = this.renderer.tileToScreen(obj.x + 1, obj.y + 1)
      if (!tl || !br) return

      const w = Math.max(0, br.sx - tl.sx - 1)
      const h = Math.max(0, br.sy - tl.sy - 1)

      const box = document.createElement("div")
      box.style.cssText = `
        position:absolute;
        left:${tl.sx}px;
        top:${tl.sy}px;
        width:${w}px;
        height:${h}px;
        border:2px solid #f59e0b;
        background:#f59e0b33;
        pointer-events:auto;
        cursor:move;
        box-sizing:border-box;
        z-index:9;
      `

      box.addEventListener("pointerdown", (e) => {
        this._beginObjectDrag(e, obj)
      })

      this.objectOverlay.appendChild(box)
    }

    this._beginObjectDrag = (e, obj) => {
      e.preventDefault()
      e.stopPropagation()
      const start = this._pointerToTile(e) || { tileX: 0, tileY: 0 }
      const orig = { x: obj.x, y: obj.y }
      let current = { ...orig }

      const onMove = (ev) => {
        const cur = this._pointerToTile(ev)
        if (!cur) return
        const dx = cur.tileX - start.tileX
        const dy = cur.tileY - start.tileY
        current = { x: orig.x + dx, y: orig.y + dy }
        
        // Optimistic local update
        obj.x = current.x
        obj.y = current.y
        this._redrawObjectSelection()
        if (this.renderer) this.renderer.update(this.lastState)
      }

      const onUp = (_ev) => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        this.pushEventTo(el, "object:move", {
          id: obj.id,
          x: current.x,
          y: current.y
        })
      }

      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp, { once: true })
    }

    this.handleEvent("map:objects", () => {
      // Object overlay re-render hook — the renderer ingests objects via update()
      // when the next map:state arrives, this is just a notification.
      if (this._redrawObjectSelection) this._redrawObjectSelection()
    })

    this.handleEvent("map:events", () => {})

    this.handleEvent("map:cursors", ({ cursors }) => {
      this.cursorOverlay.innerHTML = ""
      if (!this.lastState) return
      for (const c of cursors) {
        const pt = this.renderer.tileToScreen(c.x, c.y)
        if (!pt) continue
        const sx = pt.sx
        const sy = pt.sy
        const dot = document.createElement("div")
        dot.style.cssText = `
          position:absolute;
          left:${sx + tileSize/2 - 6}px;
          top:${sy + tileSize/2 - 6}px;
          width:12px;height:12px;
          border:2px solid ${c.color};
          border-radius:50%;
          background:${c.color}33;
          box-shadow:0 0 6px ${c.color};
        `
        const label = document.createElement("div")
        label.textContent = `${c.name} · ${c.tool}`
        label.style.cssText = `
          position:absolute;
          left:${sx + tileSize + 4}px;
          top:${sy}px;
          font:10px monospace;
          color:${c.color};
          text-shadow:0 0 3px black;
          white-space:nowrap;
        `
        this.cursorOverlay.appendChild(dot)
        this.cursorOverlay.appendChild(label)
      }
    })

    console.log("[TwistedCanvas] mounted", { canvasMode, renderMode, tileSize })
  },

  destroyed() {
    if (this.el) this.el._twistedMounted = false
    if (this.resizeObserver) {
      try { this.resizeObserver.disconnect() } catch (_e) {}
      this.resizeObserver = null
    }
    const target = this._pointerTarget || this.pixiWrapper || this.el
    if (this.handlePointerDownDrag) target.removeEventListener("pointerdown", this.handlePointerDownDrag)
    if (this.handlePointerMove) target.removeEventListener("pointermove", this.handlePointerMove)
    if (this.handlePointerUp) window.removeEventListener("pointerup", this.handlePointerUp)
    if (this.handleKeyDown) window.removeEventListener("keydown", this.handleKeyDown)
    if (this.handleKeyUp) window.removeEventListener("keyup", this.handleKeyUp)
    if (this.handleContextMenu) this.el.removeEventListener("contextmenu", this.handleContextMenu)
    if (this.handleWheel) this.el.removeEventListener("wheel", this.handleWheel)
    if (this.importInputHandler) {
      const input = document.getElementById("map-import-input")
      if (input) input.removeEventListener("change", this.importInputHandler)
    }
    if (this.soundZoneAudio) {
      for (const [, entry] of this.soundZoneAudio) {
        try { entry.audio.pause() } catch (_e) {}
        try { entry.source && entry.source.disconnect() } catch (_e) {}
        try { entry.gain && entry.gain.disconnect() } catch (_e) {}
      }
      this.soundZoneAudio.clear()
    }
    if (this.audioCtx) {
      try { this.audioCtx.close() } catch (_e) {}
      this.audioCtx = null
    }
    if (this.renderer) {
      this.renderer.destroy()
      this.renderer = null
    }
  },
}
