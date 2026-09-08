/**
 * Procedural Math Texture Synthesizer.
 * Generates an 8x8 grid (256x256 px) of 32x32 pixel art tiles entirely in pure code.
 * Zero external API dependencies, runs in ~5 milliseconds offline.
 */
export function generateProceduralTileset(theme: "dungeon" | "forest" | "cavern" = "dungeon"): string {
  const tileSize = 32;
  const cols = 8;
  const rows = 8;
  const w = cols * tileSize;
  const h = rows * tileSize;

  // Use OffscreenCanvas or DOM Canvas depending on environment
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(w, h);
  } else if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
  } else {
    return "";
  }

  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return "";

  // Helper to paint a cell
  const paintCell = (col: number, row: number, drawFn: (cx: number, cy: number) => void) => {
    const cx = col * tileSize;
    const cy = row * tileSize;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, tileSize, tileSize);
    ctx.clip();
    drawFn(cx, cy);
    ctx.restore();
  };

  // --- Tile 0: Grass / Overworld Floor ---
  paintCell(0, 0, (cx, cy) => {
    ctx.fillStyle = theme === "forest" ? "#2d6a36" : "#355e3b";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // Subtle blade specks
    ctx.fillStyle = "#48854f";
    for (let i = 0; i < 20; i++) {
      const rx = cx + ((i * 17) % 30) + 1;
      const ry = cy + ((i * 23) % 30) + 1;
      ctx.fillRect(rx, ry, 2, 3);
    }
    // Darker grass shadows
    ctx.fillStyle = "#204625";
    for (let i = 0; i < 15; i++) {
      const rx = cx + ((i * 13) % 30) + 1;
      const ry = cy + ((i * 29) % 30) + 1;
      ctx.fillRect(rx, ry, 2, 2);
    }
  });

  // --- Tile 1: Stone Brick Wall ---
  paintCell(1, 0, (cx, cy) => {
    ctx.fillStyle = "#1e293b"; // Mortar dark base
    ctx.fillRect(cx, cy, tileSize, tileSize);

    const brickH = 7;
    for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
      const by = cy + rowIdx * (brickH + 1);
      const isOdd = rowIdx % 2 === 1;
      const brickW = 14;
      const xOffset = isOdd ? 7 : 0;

      for (let bx = cx - brickW + xOffset; bx < cx + tileSize; bx += brickW + 1) {
        // Brick face
        ctx.fillStyle = "#475569";
        ctx.fillRect(bx, by, brickW, brickH);
        // Top highlight
        ctx.fillStyle = "#64748b";
        ctx.fillRect(bx, by, brickW, 1);
        // Bottom/Right shadow
        ctx.fillStyle = "#334155";
        ctx.fillRect(bx, by + brickH - 1, brickW, 1);
        ctx.fillRect(bx + brickW - 1, by, 1, brickH);
      }
    }
  });

  // --- Tile 2: Dirt Path ---
  paintCell(2, 0, (cx, cy) => {
    ctx.fillStyle = "#785539";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // Pebble noise
    ctx.fillStyle = "#5c4028";
    for (let i = 0; i < 18; i++) {
      const rx = cx + ((i * 19) % 30) + 1;
      const ry = cy + ((i * 27) % 30) + 1;
      ctx.fillRect(rx, ry, 2, 2);
    }
    ctx.fillStyle = "#946a48";
    for (let i = 0; i < 12; i++) {
      const rx = cx + ((i * 11) % 30) + 1;
      const ry = cy + ((i * 31) % 30) + 1;
      ctx.fillRect(rx, ry, 2, 1);
    }
  });

  // --- Tile 3: Water Pool / Caustics ---
  paintCell(3, 0, (cx, cy) => {
    ctx.fillStyle = "#0c4a6e";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // Caustic light waves
    ctx.fillStyle = "#0284c7";
    ctx.beginPath();
    ctx.arc(cx + 8, cy + 12, 7, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy + 20, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(cx + 8, cy + 12, 3, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy + 20, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Tile 4: Wood Planks ---
  paintCell(4, 0, (cx, cy) => {
    ctx.fillStyle = "#291a10"; // Seam dark
    ctx.fillRect(cx, cy, tileSize, tileSize);
    const plankW = 7;
    for (let px = cx; px < cx + tileSize; px += plankW + 1) {
      ctx.fillStyle = "#634024";
      ctx.fillRect(px, cy, plankW, tileSize);
      // Plank highlight on left edge
      ctx.fillStyle = "#784e2c";
      ctx.fillRect(px, cy, 1, tileSize);
      // Dark grain streak
      ctx.fillStyle = "#4a301b";
      ctx.fillRect(px + 3, cy + 4, 1, 16);
      // Nail heads
      ctx.fillStyle = "#1e130b";
      ctx.fillRect(px + 3, cy + 2, 2, 2);
      ctx.fillRect(px + 3, cy + 28, 2, 2);
    }
  });

  // --- Tile 5: Cobblestone Floor ---
  paintCell(5, 0, (cx, cy) => {
    ctx.fillStyle = "#1e293b"; // Grout
    ctx.fillRect(cx, cy, tileSize, tileSize);

    const stones = [
      { x: 1, y: 1, w: 9, h: 8 },
      { x: 12, y: 2, w: 10, h: 7 },
      { x: 23, y: 1, w: 8, h: 9 },
      { x: 2, y: 11, w: 12, h: 9 },
      { x: 16, y: 11, w: 14, h: 9 },
      { x: 1, y: 22, w: 9, h: 9 },
      { x: 12, y: 22, w: 10, h: 8 },
      { x: 24, y: 22, w: 7, h: 9 },
    ];

    for (const s of stones) {
      ctx.fillStyle = "#475569";
      ctx.fillRect(cx + s.x, cy + s.y, s.w, s.h);
      ctx.fillStyle = "#64748b"; // Light bevel
      ctx.fillRect(cx + s.x, cy + s.y, s.w, 1);
      ctx.fillRect(cx + s.x, cy + s.y, 1, s.h);
      ctx.fillStyle = "#334155"; // Dark bevel
      ctx.fillRect(cx + s.x, cy + s.y + s.h - 1, s.w, 1);
      ctx.fillRect(cx + s.x + s.w - 1, cy + s.y, 1, s.h);
    }
  });

  // --- Tile 6: Cavern Dark Rock Wall ---
  paintCell(6, 0, (cx, cy) => {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // Jagged chisel rock faces
    ctx.fillStyle = "#334155";
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy + 2);
    ctx.lineTo(cx + 28, cy + 6);
    ctx.lineTo(cx + 20, cy + 26);
    ctx.lineTo(cx + 6, cy + 22);
    ctx.closePath();
    ctx.fill();
    // Chisel ridge
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.moveTo(cx + 4, cy + 2);
    ctx.lineTo(cx + 20, cy + 12);
    ctx.lineTo(cx + 6, cy + 22);
    ctx.closePath();
    ctx.fill();
  });

  // --- Tile 7: Lava / Magma ---
  paintCell(7, 0, (cx, cy) => {
    ctx.fillStyle = "#ea580c"; // Glowing orange
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // Bright yellow hot veins
    ctx.fillStyle = "#facc15";
    ctx.fillRect(cx + 4, cy + 10, 24, 3);
    ctx.fillRect(cx + 14, cy + 6, 4, 18);
    // Floating dark basalt crust
    ctx.fillStyle = "#451a03";
    ctx.fillRect(cx + 2, cy + 2, 8, 6);
    ctx.fillRect(cx + 18, cy + 16, 11, 8);
  });

  // --- Tile 8 (Row 1, Col 0): 2.5D Elevation Stairs / Ramp ---
  paintCell(0, 1, (cx, cy) => {
    ctx.fillStyle = "#334155";
    ctx.fillRect(cx, cy, tileSize, tileSize);
    // 4 horizontal step treads
    for (let stepIdx = 0; stepIdx < 4; stepIdx++) {
      const sy = cy + stepIdx * 8;
      // Step riser shadow
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(cx, sy + 5, tileSize, 3);
      // Step tread face
      ctx.fillStyle = "#64748b";
      ctx.fillRect(cx, sy, tileSize, 5);
      // Tread highlight edge
      ctx.fillStyle = "#94a3b8";
      ctx.fillRect(cx, sy, tileSize, 1);
    }
  });

  // Export to Data URL
  if ("toDataURL" in canvas) {
    return (canvas as HTMLCanvasElement).toDataURL("image/png");
  }

  return "";
}
