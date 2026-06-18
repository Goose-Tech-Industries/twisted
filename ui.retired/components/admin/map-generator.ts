// ── Procedural Map Generators ────────────────────────────────────
// Pure functions — no React, no side effects.

/**
 * BSP Dungeon: binary space partition creates rooms connected by corridors.
 * Returns flat tile array where 0=floor, 1=wall.
 */
export function generateDungeon(w: number, h: number): number[] {
  const tiles = new Array(w * h).fill(1) // all walls
  const rooms: Array<{x:number;y:number;w:number;h:number}> = []

  function splitBSP(x: number, y: number, rw: number, rh: number, depth: number) {
    if (depth <= 0 || rw < 8 || rh < 8) {
      // Carve a room
      const roomW = Math.max(3, Math.floor(Math.random() * (rw - 4)) + 3)
      const roomH = Math.max(3, Math.floor(Math.random() * (rh - 4)) + 3)
      const rx = x + Math.floor(Math.random() * (rw - roomW - 1)) + 1
      const ry = y + Math.floor(Math.random() * (rh - roomH - 1)) + 1
      for (let dy = 0; dy < roomH; dy++)
        for (let dx = 0; dx < roomW; dx++)
          tiles[(ry + dy) * w + (rx + dx)] = 0
      rooms.push({ x: rx, y: ry, w: roomW, h: roomH })
      return
    }
    if (rw > rh) {
      const split = Math.floor(rw * 0.3 + Math.random() * rw * 0.4)
      splitBSP(x, y, split, rh, depth - 1)
      splitBSP(x + split, y, rw - split, rh, depth - 1)
    } else {
      const split = Math.floor(rh * 0.3 + Math.random() * rh * 0.4)
      splitBSP(x, y, rw, split, depth - 1)
      splitBSP(x, y + split, rw, rh - split, depth - 1)
    }
  }

  splitBSP(0, 0, w, h, 4)

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i]
    const ax = Math.floor(a.x + a.w / 2), ay = Math.floor(a.y + a.h / 2)
    const bx = Math.floor(b.x + b.w / 2), by = Math.floor(b.y + b.h / 2)
    let cx = ax, cy = ay
    while (cx !== bx) { tiles[cy * w + cx] = 0; cx += cx < bx ? 1 : -1 }
    while (cy !== by) { tiles[cy * w + cx] = 0; cy += cy < by ? 1 : -1 }
  }
  return tiles
}

/**
 * Cellular automata cave.
 * Returns flat tile array where 0=floor, 1=wall.
 */
export function generateCave(w: number, h: number): number[] {
  let tiles = new Array(w * h).fill(0)
  // Random noise
  for (let i = 0; i < tiles.length; i++) {
    const x = i % w, y = Math.floor(i / w)
    tiles[i] = (x === 0 || x === w-1 || y === 0 || y === h-1) ? 1 : (Math.random() < 0.45 ? 1 : 0)
  }
  // Smooth with automata rules (5 iterations)
  for (let iter = 0; iter < 5; iter++) {
    const next = [...tiles]
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let walls = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (tiles[(y+dy)*w+(x+dx)] === 1) walls++
        next[y * w + x] = walls >= 5 ? 1 : 0
      }
    }
    tiles = next
  }
  return tiles
}

/**
 * Perfect maze using recursive backtracker.
 * Returns flat tile array where 0=floor, 1=wall.
 */
export function generateMaze(w: number, h: number): number[] {
  const tiles = new Array(w * h).fill(1)
  // Maze works on odd-sized grid
  const mw = Math.floor((w - 1) / 2), mh = Math.floor((h - 1) / 2)
  const visited = new Array(mw * mh).fill(false)
  const stack: number[] = []

  function carve(mx: number, my: number) {
    const tx = mx * 2 + 1, ty = my * 2 + 1
    visited[my * mw + mx] = true
    tiles[ty * w + tx] = 0
  }

  function neighbors(mx: number, my: number) {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]]
    return dirs.map(([dx,dy]) => ({ x: mx+dx, y: my+dy }))
      .filter(n => n.x >= 0 && n.x < mw && n.y >= 0 && n.y < mh && !visited[n.y * mw + n.x])
  }

  carve(0, 0)
  stack.push(0)
  while (stack.length) {
    const ci = stack[stack.length - 1]
    const cx = ci % mw, cy = Math.floor(ci / mw)
    const ns = neighbors(cx, cy)
    if (!ns.length) { stack.pop(); continue }
    const n = ns[Math.floor(Math.random() * ns.length)]
    // Carve wall between current and neighbor
    const wallX = cx * 2 + 1 + (n.x - cx), wallY = cy * 2 + 1 + (n.y - cy)
    tiles[wallY * w + wallX] = 0
    carve(n.x, n.y)
    stack.push(n.y * mw + n.x)
  }
  return tiles
}
