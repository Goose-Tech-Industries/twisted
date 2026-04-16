// ═══════════════════════════════════════════════════════════════
// ScriptCanvas — JS hook for the visual scripting graph editor
// ═══════════════════════════════════════════════════════════════
//
// Owns a single phx-update="ignore" container. Subscribes to the
// LiveView "graph:state" event, re-renders every node + connection
// from scratch, wires pointer drag handlers on node headers and
// click handlers on port circles. All mutations push events back
// to the LiveView; the LV is the source of truth.
//
// Why hand-rolled instead of Drawflow / React Flow / etc.: zero
// dependencies, < 250 LOC, and full control over the protocol so
// LiveView can stay in charge of state.
// ═══════════════════════════════════════════════════════════════

const NODE_W = 200
const NODE_HEADER_H = 32
const PORT_R = 6
const PORT_GAP = 22

const NODE_COLORS = {
  start: "#10b981", choice: "#f59e0b", conditional: "#f59e0b",
  give_item: "#3b82f6", take_item: "#3b82f6", give_gold: "#3b82f6",
  give_xp: "#3b82f6", heal: "#10b981", damage: "#ef4444",
  teleport: "#8b5cf6", set_flag: "#8b5cf6", set_world_flag: "#8b5cf6",
  inc_flag: "#8b5cf6", screen_effect: "#ec4899", wait: "#64748b",
  sound: "#64748b", npc_talk: "#14b8a6", set_npc_mood: "#14b8a6",
  kill_npc: "#ef4444", faction_rep: "#14b8a6", battle: "#ef4444",
  shop: "#3b82f6", quest_start: "#a3e635", quest_advance: "#a3e635",
  quest_complete: "#a3e635",
}

// Static port specs mirror lib/te_phoenix/game/script_nodes.ex.
// Kept here so the client can compute port positions without a
// round-trip to the server.
const NODE_PORTS = {
  start: { in: [], out: ["out"] },
  choice: { in: ["in"], out: ["a", "b", "c"] },
  conditional: { in: ["in"], out: ["true", "false"] },
  give_item: { in: ["in"], out: ["out"] },
  take_item: { in: ["in"], out: ["out"] },
  give_gold: { in: ["in"], out: ["out"] },
  give_xp: { in: ["in"], out: ["out"] },
  heal: { in: ["in"], out: ["out"] },
  damage: { in: ["in"], out: ["out"] },
  teleport: { in: ["in"], out: ["out"] },
  set_flag: { in: ["in"], out: ["out"] },
  set_world_flag: { in: ["in"], out: ["out"] },
  inc_flag: { in: ["in"], out: ["out"] },
  screen_effect: { in: ["in"], out: ["out"] },
  wait: { in: ["in"], out: ["out"] },
  sound: { in: ["in"], out: ["out"] },
  npc_talk: { in: ["in"], out: ["out"] },
  set_npc_mood: { in: ["in"], out: ["out"] },
  kill_npc: { in: ["in"], out: ["out"] },
  faction_rep: { in: ["in"], out: ["out"] },
  battle: { in: ["in"], out: ["out"] },
  shop: { in: ["in"], out: ["out"] },
  quest_start: { in: ["in"], out: ["out"] },
  quest_advance: { in: ["in"], out: ["out"] },
  quest_complete: { in: ["in"], out: ["out"] },
}

const NODE_LABELS = {
  start: "Start", choice: "Choice", conditional: "If/Else",
  give_item: "Give Item", take_item: "Take Item", give_gold: "Give Gold",
  give_xp: "Give XP", heal: "Heal", damage: "Damage",
  teleport: "Teleport", set_flag: "Set Flag", set_world_flag: "World Flag",
  inc_flag: "Inc Flag", screen_effect: "Screen FX", wait: "Wait",
  sound: "Sound", npc_talk: "NPC Talk", set_npc_mood: "NPC Mood",
  kill_npc: "Kill NPC", faction_rep: "Faction Rep", battle: "Battle",
  shop: "Shop", quest_start: "Start Quest", quest_advance: "Advance Quest",
  quest_complete: "Complete Quest",
}

export const ScriptCanvas = {
  mounted() {
    this.graph = { nodes: [], connections: [] }
    this.dragging = null
    this.selectedConnIdx = null
    this.selectedNodeIds = new Set()
    this.pan = { x: 0, y: 0 }
    this.zoom = 1
    this.spaceHeld = false
    this.panning = null
    this.marquee = null
    this.gridSize = 20        // snap granularity in world pixels
    this.gridSnap = true      // toggleable via toolbar
    this.alignGuides = []     // [{orient:'v'|'h', at:number}] drawn during drag

    // Wrapper transformed for pan + zoom. nodesLayer + svg live inside it.
    this.world = document.createElement("div")
    this.world.style.cssText = "position:absolute;inset:0;transform-origin:0 0;"
    this.el.appendChild(this.world)

    // SVG layer for connections
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    this.svg.setAttribute("class", "absolute inset-0")
    this.svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;"
    this.world.appendChild(this.svg)

    this.applyPanZoom = () => {
      this.world.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`
    }

    // Wheel zoom (Ctrl/Cmd or always — we choose always for trackpads)
    this.el.addEventListener("wheel", (e) => {
      e.preventDefault()
      const delta = -e.deltaY * 0.001
      const newZoom = Math.min(2.5, Math.max(0.25, this.zoom * (1 + delta)))
      // Zoom around mouse position
      const rect = this.el.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const wx = (mx - this.pan.x) / this.zoom
      const wy = (my - this.pan.y) / this.zoom
      this.zoom = newZoom
      this.pan.x = mx - wx * this.zoom
      this.pan.y = my - wy * this.zoom
      this.applyPanZoom()
    }, { passive: false })

    // Marquee selection on background drag
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target !== this.el && e.target !== this.world && e.target !== this.svg) return
      e.preventDefault()
      if (this.spaceHeld || e.button === 1) {
        this.panning = { startX: e.clientX, startY: e.clientY, origX: this.pan.x, origY: this.pan.y }
      } else if (e.button === 0) {
        const rect = this.el.getBoundingClientRect()
        const x = (e.clientX - rect.left - this.pan.x) / this.zoom
        const y = (e.clientY - rect.top - this.pan.y) / this.zoom
        this.marquee = { x1: x, y1: y, x2: x, y2: y }
        this.selectedNodeIds.clear()
        this.refreshSelection()
        this.drawMarquee()
      }
    })

    this.handleKeyDown = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selectedConnIdx !== null) {
          e.preventDefault()
          this.pushEventTo(this.el, "connection:delete", { index: this.selectedConnIdx })
          this.selectedConnIdx = null
        }
      } else if (e.key === "Escape") {
        this.selectedConnIdx = null
        this.drawConnections()
      }
    }
    window.addEventListener("keydown", this.handleKeyDown)

    // DOM layer for nodes (lives inside the pan/zoom world)
    this.nodesLayer = document.createElement("div")
    this.nodesLayer.style.cssText = "position:absolute;inset:0;"
    this.world.appendChild(this.nodesLayer)

    // Marquee overlay (in world coords)
    this.marqueeEl = document.createElement("div")
    this.marqueeEl.style.cssText = "position:absolute;border:1px dashed #f59e0b;background:rgba(245,158,11,0.05);pointer-events:none;display:none;"
    this.world.appendChild(this.marqueeEl)

    // Align guides overlay — full-world orange dashed lines drawn
    // during drag when an edge aligns with another node.
    this.alignLayer = document.createElement("div")
    this.alignLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;"
    this.world.appendChild(this.alignLayer)

    this.drawAlignGuides = () => {
      this.alignLayer.innerHTML = ""
      for (const g of this.alignGuides) {
        const line = document.createElement("div")
        if (g.orient === "v") {
          line.style.cssText = `position:absolute;left:${g.at}px;top:-2000px;bottom:-2000px;width:0;border-left:1px dashed #f59e0b;`
        } else {
          line.style.cssText = `position:absolute;top:${g.at}px;left:-2000px;right:-2000px;height:0;border-top:1px dashed #f59e0b;`
        }
        this.alignLayer.appendChild(line)
      }
    }

    this.drawMarquee = () => {
      if (!this.marquee) {
        this.marqueeEl.style.display = "none"
        return
      }
      const lx = Math.min(this.marquee.x1, this.marquee.x2)
      const ly = Math.min(this.marquee.y1, this.marquee.y2)
      const rx = Math.max(this.marquee.x1, this.marquee.x2)
      const ry = Math.max(this.marquee.y1, this.marquee.y2)
      Object.assign(this.marqueeEl.style, {
        display: "block",
        left: `${lx}px`,
        top: `${ly}px`,
        width: `${rx - lx}px`,
        height: `${ry - ly}px`,
      })
    }

    this.refreshSelection = () => {
      for (const el of this.nodesLayer.children) {
        if (el.dataset && el.dataset.nodeId) {
          el.style.outline = this.selectedNodeIds.has(el.dataset.nodeId) ? "2px solid #f59e0b" : "none"
        }
      }
    }

    this.computeMarqueeSelection = () => {
      if (!this.marquee) return
      const lx = Math.min(this.marquee.x1, this.marquee.x2)
      const ly = Math.min(this.marquee.y1, this.marquee.y2)
      const rx = Math.max(this.marquee.x1, this.marquee.x2)
      const ry = Math.max(this.marquee.y1, this.marquee.y2)
      this.selectedNodeIds.clear()
      for (const n of this.graph.nodes || []) {
        if (n.x + NODE_W >= lx && n.x <= rx && n.y + NODE_HEADER_H >= ly && n.y <= ry) {
          this.selectedNodeIds.add(n.id)
        }
      }
      this.refreshSelection()
    }

    this.handleEvent("graph:state", (graph) => {
      this.graph = graph
      this.render()
    })

    // Global pointer handlers for dragging / panning / marquee
    this.handlePointerMove = (e) => {
      if (this.panning) {
        this.pan.x = this.panning.origX + (e.clientX - this.panning.startX)
        this.pan.y = this.panning.origY + (e.clientY - this.panning.startY)
        this.applyPanZoom()
        return
      }

      if (this.marquee) {
        const rect = this.el.getBoundingClientRect()
        this.marquee.x2 = (e.clientX - rect.left - this.pan.x) / this.zoom
        this.marquee.y2 = (e.clientY - rect.top - this.pan.y) / this.zoom
        this.drawMarquee()
        this.computeMarqueeSelection()
        return
      }

      if (!this.dragging) return
      let dx = (e.clientX - this.dragging.startX) / this.zoom
      let dy = (e.clientY - this.dragging.startY) / this.zoom

      // Drag every selected node, not just the grabbed one
      const ids = this.selectedNodeIds.has(this.dragging.node.id)
        ? [...this.selectedNodeIds]
        : [this.dragging.node.id]

      // Grid snap: round the ANCHOR node's new position to grid, apply
      // the snapped delta to every other dragged node so they keep their
      // relative offsets.
      if (this.gridSnap) {
        const anchorId = this.dragging.node.id
        const aOrig = this.dragging.origPositions[anchorId]
        if (aOrig) {
          const targetX = aOrig.x + dx
          const targetY = aOrig.y + dy
          const snappedX = Math.round(targetX / this.gridSize) * this.gridSize
          const snappedY = Math.round(targetY / this.gridSize) * this.gridSize
          dx = snappedX - aOrig.x
          dy = snappedY - aOrig.y
        }
      }

      for (const id of ids) {
        const node = (this.graph.nodes || []).find((n) => n.id === id)
        if (!node) continue
        const orig = this.dragging.origPositions[id]
        if (!orig) continue
        node.x = orig.x + dx
        node.y = orig.y + dy
        this.applyNodePosition(node)
      }

      // Alignment guides: look for other nodes whose left/right/top/bottom
      // edges line up with the anchor node within 4px, and draw a full-
      // canvas line at that coordinate so the user can feel the snap.
      this.alignGuides = []
      const anchor = this.dragging.node
      const ALIGN_THRESHOLD = 4
      for (const n of this.graph.nodes || []) {
        if (ids.includes(n.id)) continue
        if (Math.abs(n.x - anchor.x) < ALIGN_THRESHOLD) this.alignGuides.push({ orient: "v", at: n.x })
        if (Math.abs((n.x + NODE_W) - (anchor.x + NODE_W)) < ALIGN_THRESHOLD) this.alignGuides.push({ orient: "v", at: n.x + NODE_W })
        if (Math.abs(n.y - anchor.y) < ALIGN_THRESHOLD) this.alignGuides.push({ orient: "h", at: n.y })
      }

      this.drawConnections()
      this.drawAlignGuides()
    }

    this.handlePointerUp = () => {
      if (this.panning) {
        this.panning = null
        return
      }

      if (this.marquee) {
        this.marquee = null
        this.drawMarquee()
        return
      }

      if (this.dragging) {
        const ids = this.selectedNodeIds.has(this.dragging.node.id)
          ? [...this.selectedNodeIds]
          : [this.dragging.node.id]

        for (const id of ids) {
          const node = (this.graph.nodes || []).find((n) => n.id === id)
          if (!node) continue
          this.pushEventTo(this.el, "node:move", { id: node.id, x: node.x, y: node.y })
        }
        this.dragging = null
        this.alignGuides = []
        if (this.drawAlignGuides) this.drawAlignGuides()
      }
    }

    window.addEventListener("pointermove", this.handlePointerMove)
    window.addEventListener("pointerup", this.handlePointerUp)

    // Space-to-pan
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !e.repeat && !this.isFormFocused()) {
        this.spaceHeld = true
        this.el.style.cursor = "grab"
      }
      // Ctrl/Cmd + C / V — only when canvas focus, not in form fields
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && !this.isFormFocused() && this.selectedNodeIds.size > 0) {
        this.copySelection()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && !this.isFormFocused()) {
        this.pasteClipboard()
      }
    })

    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") {
        this.spaceHeld = false
        this.el.style.cursor = ""
      }
    })

    this.isFormFocused = () => {
      const a = document.activeElement
      return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)
    }

    this.copySelection = () => {
      const ids = new Set(this.selectedNodeIds)
      const nodes = (this.graph.nodes || []).filter((n) => ids.has(n.id))
      const conns = (this.graph.connections || []).filter((c) => ids.has(c.from_node) && ids.has(c.to_node))
      if (nodes.length === 0) return
      // Server-side clipboard — keyed per user. Survives page reloads and
      // works across browser tabs.
      this.pushEventTo(this.el, "clipboard:copy", {
        payload: JSON.stringify({ nodes, connections: conns })
      })
    }

    this.pasteClipboard = () => {
      // Server fetches the payload from ClipboardServer by user_id —
      // no client-side clipboard state.
      this.pushEventTo(this.el, "clipboard:paste", {})
    }
  },

  destroyed() {
    window.removeEventListener("pointermove", this.handlePointerMove)
    window.removeEventListener("pointerup", this.handlePointerUp)
    window.removeEventListener("keydown", this.handleKeyDown)
  },

  render() {
    this.nodesLayer.innerHTML = ""
    for (const node of this.graph.nodes || []) {
      this.nodesLayer.appendChild(this.buildNode(node))
    }
    this.drawConnections()
  },

  buildNode(node) {
    const el = document.createElement("div")
    const ports = NODE_PORTS[node.type] || { in: ["in"], out: ["out"] }
    const inputs = ports.in.length
    const outputs = ports.out.length
    const bodyH = Math.max(inputs, outputs) * PORT_GAP + 16
    const totalH = NODE_HEADER_H + bodyH

    el.dataset.nodeId = node.id
    el.style.cssText = `
      position:absolute;left:${node.x}px;top:${node.y}px;
      width:${NODE_W}px;background:#18181b;
      border:1px solid #3f3f46;border-radius:6px;
      box-shadow:0 4px 12px rgba(0,0,0,0.4);
      color:#e4e4e7;font:12px sans-serif;
      user-select:none;cursor:default;
    `

    // Header (also drag handle)
    const header = document.createElement("div")
    header.style.cssText = `
      height:${NODE_HEADER_H}px;line-height:${NODE_HEADER_H}px;
      padding:0 10px;background:${NODE_COLORS[node.type] || "#52525b"};
      color:#000;font-weight:bold;border-radius:6px 6px 0 0;
      cursor:grab;
    `
    header.textContent = NODE_LABELS[node.type] || node.type
    header.addEventListener("pointerdown", (e) => {
      e.preventDefault()
      e.stopPropagation()

      // If clicking an unselected node, replace selection with just it.
      // If clicking a selected node, keep the existing multi-selection so drag moves the whole set.
      if (!this.selectedNodeIds.has(node.id)) {
        if (!e.shiftKey) this.selectedNodeIds.clear()
        this.selectedNodeIds.add(node.id)
        this.refreshSelection()
      }

      const origPositions = {}
      for (const id of this.selectedNodeIds) {
        const n = (this.graph.nodes || []).find((nn) => nn.id === id)
        if (n) origPositions[id] = { x: n.x, y: n.y }
      }
      origPositions[node.id] = { x: node.x, y: node.y }

      this.dragging = {
        node: node,
        startX: e.clientX,
        startY: e.clientY,
        origPositions,
      }
      this.pushEventTo(this.el, "node:select", { id: node.id })
    })
    el.appendChild(header)

    // Body — host port labels + visual scaffolding
    const body = document.createElement("div")
    body.style.cssText = `position:relative;height:${bodyH}px;padding:8px 0;`
    el.appendChild(body)

    // Input ports (left edge)
    ports.in.forEach((portKey, i) => {
      const dot = this.buildPort(node.id, portKey, "in", i)
      body.appendChild(dot)

      const label = document.createElement("div")
      label.textContent = portKey
      label.style.cssText = `position:absolute;left:14px;top:${i * PORT_GAP + 2}px;font-size:10px;color:#a1a1aa;`
      body.appendChild(label)
    })

    // Output ports (right edge)
    ports.out.forEach((portKey, i) => {
      const dot = this.buildPort(node.id, portKey, "out", i)
      body.appendChild(dot)

      const label = document.createElement("div")
      label.textContent = portKey
      label.style.cssText = `position:absolute;right:14px;top:${i * PORT_GAP + 2}px;font-size:10px;color:#a1a1aa;text-align:right;`
      body.appendChild(label)
    })

    return el
  },

  buildPort(nodeId, portKey, kind, idx) {
    const dot = document.createElement("div")
    const top = idx * PORT_GAP + 2
    const left = kind === "in" ? -PORT_R : NODE_W - PORT_R
    dot.style.cssText = `
      position:absolute;left:${left}px;top:${top}px;
      width:${PORT_R * 2}px;height:${PORT_R * 2}px;border-radius:50%;
      background:${kind === "in" ? "#3b82f6" : "#a3e635"};
      border:2px solid #0a0a0a;cursor:pointer;
    `
    dot.title = `${kind}:${portKey}`
    dot.addEventListener("pointerdown", (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.pushEventTo(this.el, "port:click", { node_id: nodeId, port: portKey, kind })
    })
    return dot
  },

  applyNodePosition(node) {
    const el = this.nodesLayer.querySelector(`[data-node-id="${node.id}"]`)
    if (el) {
      el.style.left = `${node.x}px`
      el.style.top = `${node.y}px`
    }
  },

  drawConnections() {
    this.svg.innerHTML = ""
    const conns = this.graph.connections || []
    const nodeById = {}
    for (const n of this.graph.nodes || []) nodeById[n.id] = n

    conns.forEach((c, idx) => {
      const from = nodeById[c.from_node]
      const to = nodeById[c.to_node]
      if (!from || !to) return

      const fromPorts = (NODE_PORTS[from.type] || {}).out || []
      const toPorts = (NODE_PORTS[to.type] || {}).in || []
      const fIdx = fromPorts.indexOf(c.from_port)
      const tIdx = toPorts.indexOf(c.to_port)
      if (fIdx < 0 || tIdx < 0) return

      const fx = from.x + NODE_W
      const fy = from.y + NODE_HEADER_H + 8 + fIdx * PORT_GAP + PORT_R
      const tx = to.x
      const ty = to.y + NODE_HEADER_H + 8 + tIdx * PORT_GAP + PORT_R

      // Orthogonal routing with node avoidance:
      // 1) If target is to the right of source, route straight through
      //    via one horizontal segment, one vertical, one horizontal.
      // 2) If target is left/above/below source, route around via a
      //    U-shaped path that exits the source to the right, travels
      //    up/down past the source node's vertical extent, then across
      //    to the target's x, then into the target input.
      // This avoids the common case of backward wires cutting through
      // nodes while staying axis-aligned (readable) and fast (no path
      // solver). Smoothed at corners with small cubic beziers.
      const MARGIN = 24
      const fromRight = fx
      const toLeft = tx
      const midY = (fy + ty) / 2
      let d

      if (toLeft > fromRight + MARGIN * 2) {
        // Forward flow — simple 3-segment with smooth corners
        const midX = (fromRight + toLeft) / 2
        d = `M ${fromRight} ${fy} L ${midX - 8} ${fy} Q ${midX} ${fy} ${midX} ${fy + Math.sign(ty - fy) * 8} L ${midX} ${ty - Math.sign(ty - fy) * 8} Q ${midX} ${ty} ${midX + 8} ${ty} L ${toLeft} ${ty}`
      } else {
        // Backward/overlap — route up and around
        const fromBottom = from.y + NODE_HEADER_H + 8 + ((NODE_PORTS[from.type] || { out: [] }).out.length) * PORT_GAP + MARGIN
        const toTop = to.y - MARGIN
        const cornerY = Math.min(fromBottom, toTop - MARGIN)
        d = `M ${fromRight} ${fy} L ${fromRight + MARGIN} ${fy} L ${fromRight + MARGIN} ${cornerY} L ${toLeft - MARGIN} ${cornerY} L ${toLeft - MARGIN} ${ty} L ${toLeft} ${ty}`
      }

      const isSelected = this.selectedConnIdx === idx

      // Wide invisible hit-target for easier clicking
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path")
      hit.setAttribute("d", d)
      hit.setAttribute("stroke", "transparent")
      hit.setAttribute("stroke-width", "12")
      hit.setAttribute("fill", "none")
      hit.setAttribute("pointer-events", "stroke")
      hit.style.cursor = "pointer"
      hit.addEventListener("click", (e) => {
        e.stopPropagation()
        this.selectedConnIdx = idx
        this.drawConnections()
      })
      this.svg.appendChild(hit)

      // Visible path
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
      path.setAttribute("d", d)
      path.setAttribute("stroke", isSelected ? "#f59e0b" : "#a3e635")
      path.setAttribute("stroke-width", isSelected ? "3" : "2")
      path.setAttribute("fill", "none")
      path.setAttribute("pointer-events", "none")
      this.svg.appendChild(path)
    })

    // Allow svg to receive pointer events on the wide hit paths
    this.svg.style.pointerEvents = "auto"
  },
}
