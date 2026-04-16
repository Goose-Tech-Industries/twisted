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

    const canvasMode = el.dataset.canvasMode || "play"
    const renderMode = el.dataset.renderMode || "classic"
    const tileSize = parseInt(el.dataset.tileSize || "20", 10)
    const viewportW = parseInt(el.dataset.viewportW || "30", 10)
    const viewportH = parseInt(el.dataset.viewportH || "20", 10)

    this.tileSize = tileSize
    this.viewportW = viewportW
    this.viewportH = viewportH
    this.lastState = null

    this.renderer = new TwistedRenderer({
      container: el,
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

    // Canvas dimensions in CSS pixels. Use the element's layout size or
    // fall back to explicit viewport-derived math.
    const step = tileSize + 1
    const initW = viewportW * step
    const initH = viewportH * step

    this.renderer.init(initW, initH)

    // ── Pointer → LiveView click plumbing ──
    // Pixi handles rendering; pointer events come from the DOM element.
    // Screen→tile math lives in the renderer so every projection (classic,
    // iso, hex, side-scroll, 2.5D, first-person) inverts correctly.
    this.handlePointerDown = (e) => {
      const rect = el.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const hit = this.renderer.screenToTile(localX, localY)
      if (!hit) return
      this.pushEventTo(el, "tile_click", { x: hit.tileX, y: hit.tileY })
    }

    this.lastCursorPush = 0
    this.hoverTile = null
    this.preview = { kind: null, anchor: null, rect: null }

    this.handlePointerMove = (e) => {
      const rect = el.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      const hit = this.renderer.screenToTile(localX, localY)
      const tx = hit ? hit.tileX : null
      const ty = hit ? hit.tileY : null

      this.hoverTile = hit ? { x: tx, y: ty } : null

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

    this.handlePointerUp = () => {
      this.dragging = false
    }

    this.handlePointerDownDrag = (e) => {
      if (e.button !== 0) return
      this.dragging = true
      this.handlePointerDown(e)
    }

    el.addEventListener("pointerdown", this.handlePointerDownDrag)
    el.addEventListener("pointermove", this.handlePointerMove)
    window.addEventListener("pointerup", this.handlePointerUp)

    this.handleKeyDown = (e) => {
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

      // Single-letter tool shortcuts (no modifier keys)
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const shortcutKeys = ["b","f","r","x","i","m","a","g","p","B","F","R","X","I","M","A","G","P"]
        if (shortcutKeys.includes(e.key)) {
          this.pushEventTo(el, "shortcut", { key: e.key })
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

    // ── LiveView → Canvas event plumbing ──
    this.handleEvent("map:state", (state) => {
      this.lastState = state
      if (this.renderer) this.renderer.update(state)
      if (this.drawMinimap) this.drawMinimap()
      if (this.evaluateSoundZones) this.evaluateSoundZones()
    })

    this.handleEvent("map:set_render_mode", ({ mode }) => {
      if (this.renderer) this.renderer.setRenderMode(mode)
    })

    this.handleEvent("map:set_canvas_mode", ({ mode }) => {
      if (this.renderer) this.renderer.setCanvasMode(mode)
      this.playMode = mode === "play"
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

    // ── Minimap overlay ──
    this.minimap = document.createElement("canvas")
    this.minimap.width = 120
    this.minimap.height = 120
    this.minimap.style.cssText = `
      position:absolute;right:6px;top:6px;z-index:11;
      border:1px solid #525252;background:#000;image-rendering:pixelated;
      cursor:pointer;
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

    this.handleEvent("map:zones", ({ spawn_zones, sound_zones }) => {
      this.updateSoundZones(sound_zones)
      this.zoneOverlay.innerHTML = ""
      if (!this.lastState) return

      const drawZoneBox = (z, color, label) => {
        const tl = this.renderer.tileToScreen(z.x1, z.y1)
        const br = this.renderer.tileToScreen(z.x2 + 1, z.y2 + 1)
        if (!tl || !br) return
        const box = document.createElement("div")
        box.style.cssText = `
          position:absolute;
          left:${tl.sx}px;
          top:${tl.sy}px;
          width:${br.sx - tl.sx - 1}px;
          height:${br.sy - tl.sy - 1}px;
          border:1px dashed ${color};
          background:${color}18;
        `
        const tag = document.createElement("div")
        tag.textContent = label
        tag.style.cssText = `
          position:absolute;left:2px;top:2px;font:9px monospace;
          color:${color};background:#000a;padding:0 3px;border-radius:2px;
        `
        box.appendChild(tag)
        this.zoneOverlay.appendChild(box)
      }

      ;(spawn_zones || []).forEach((z) => drawZoneBox(z, "#a3e635", "spawn"))
      ;(sound_zones || []).forEach((z) => drawZoneBox(z, "#60a5fa", "sound"))
    })

    this.handleEvent("map:objects", () => {
      // Object overlay re-render hook — the renderer ingests objects via update()
      // when the next map:state arrives, this is just a notification.
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
    if (this.handlePointerDownDrag) this.el.removeEventListener("pointerdown", this.handlePointerDownDrag)
    if (this.handlePointerMove) this.el.removeEventListener("pointermove", this.handlePointerMove)
    if (this.handlePointerUp) window.removeEventListener("pointerup", this.handlePointerUp)
    if (this.handleKeyDown) window.removeEventListener("keydown", this.handleKeyDown)
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
