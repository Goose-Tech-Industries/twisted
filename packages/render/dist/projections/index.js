// src/projections/index.ts
var WALL_HEIGHT_PX = 24;
function makeProjection(mode, tileSize) {
  const step = tileSize + 1;
  const halfW = tileSize / 2;
  const halfH = tileSize / 4;
  switch (mode) {
    case "isometric":
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          const sx = (x - y) * halfW + offsetX;
          const sy = (x + y) * halfH - elev * WALL_HEIGHT_PX + offsetY;
          return { sx, sy };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          const u = sx - offsetX;
          const v = sy - offsetY;
          const a = u / (2 * halfW);
          const b = v / (2 * halfH);
          return { tileX: Math.floor(a + b), tileY: Math.floor(b - a) };
        },
        drawTile(gfx, sx, sy) {
          gfx.poly([
            sx + halfW,
            sy,
            sx + tileSize,
            sy + halfH,
            sx + halfW,
            sy + tileSize / 2,
            sx,
            sy + halfH
          ]);
        },
        viewportSize(vpW, vpH, s) {
          return {
            w: (vpW + vpH) * halfW + s * 4,
            h: (vpW + vpH) * halfH + s * 4
          };
        },
        // O-v3 final: camX/camY is the world tile that should appear at
        // the CENTER of the viewport (per renderer.ts computeOffsets
        // convention). Earlier impl assumed camX was top-left, which
        // culled the upper-left half of any centered map. Use ±vp/2
        // around the camera, plus a 3-tile buffer for iso's diamond
        // overdraw.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return x >= camX - vpW / 2 - 3 && x <= camX + vpW / 2 + 3 && y >= camY - vpH / 2 - 3 && y <= camY + vpH / 2 + 3;
        }
      };
    case "hex": {
      const hexW = tileSize;
      const hexH = tileSize * 0.866;
      const hw = tileSize / 2;
      const hh = tileSize * 0.433;
      const qh = hh / 2;
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          const xOff = y % 2 * (hexW / 2);
          const sx = x * hexW + xOff + offsetX;
          const sy = y * (hexH * 0.75) - elev * WALL_HEIGHT_PX + offsetY;
          return { sx, sy };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          const u = sx - offsetX;
          const v = sy - offsetY;
          const row = Math.round(v / (hexH * 0.75));
          const xOff = row % 2 * (hexW / 2);
          const col = Math.round((u - xOff) / hexW);
          return { tileX: col, tileY: row };
        },
        drawTile(gfx, sx, sy) {
          gfx.poly([
            sx + hw,
            sy,
            sx + tileSize,
            sy + qh,
            sx + tileSize,
            sy + qh + hh,
            sx + hw,
            sy + hh * 2,
            sx,
            sy + qh + hh,
            sx,
            sy + qh
          ]);
        },
        viewportSize(vpW, vpH) {
          return {
            w: vpW * tileSize + tileSize,
            h: vpH * (hexH * 0.75) + hexH
          };
        },
        // O-v3 final: camX/camY is the viewport CENTER. See classic mode for rationale.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return x >= camX - vpW / 2 - 2 && x <= camX + vpW / 2 + 2 && y >= camY - vpH / 2 - 2 && y <= camY + vpH / 2 + 2;
        }
      };
    }
    case "side-scroll":
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          const sx = x * step + offsetX;
          const sy = y * step - elev * WALL_HEIGHT_PX * 2 + offsetY;
          return { sx, sy };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          return {
            tileX: Math.floor((sx - offsetX) / step),
            tileY: Math.floor((sy - offsetY) / step)
          };
        },
        drawTile(gfx, sx, sy) {
          gfx.rect(sx, sy, tileSize, tileSize);
        },
        viewportSize(vpW, vpH, s) {
          return { w: vpW * s, h: vpH * s };
        },
        // O-v3 final: camX/camY is the viewport CENTER. See classic mode for rationale.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return x >= camX - vpW / 2 - 2 && x <= camX + vpW / 2 + 2 && y >= camY - vpH / 2 - 2 && y <= camY + vpH / 2 + 2;
        }
      };
    case "first-person":
      return {
        mode,
        toScreen(x, y, _elev, _step, offsetX, offsetY) {
          return { sx: x * step + offsetX, sy: y * step + offsetY };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          return {
            tileX: Math.floor((sx - offsetX) / step),
            tileY: Math.floor((sy - offsetY) / step)
          };
        },
        drawTile(gfx, sx, sy) {
          gfx.rect(sx, sy, tileSize, tileSize);
        },
        viewportSize(vpW, vpH, s) {
          return { w: vpW * s, h: vpH * s };
        },
        inViewport() {
          return true;
        }
      };
    case "2.5d":
      return {
        mode,
        toScreen(x, y, elev, _step, offsetX, offsetY) {
          return {
            sx: x * step + offsetX,
            sy: y * step - elev * WALL_HEIGHT_PX + offsetY
          };
        },
        toMap(sx, sy, _step, offsetX, offsetY) {
          return {
            tileX: Math.floor((sx - offsetX) / step),
            tileY: Math.floor((sy - offsetY) / step)
          };
        },
        drawTile(gfx, sx, sy) {
          gfx.rect(sx, sy, tileSize, tileSize);
        },
        viewportSize(vpW, vpH, s) {
          return { w: vpW * s, h: vpH * s + WALL_HEIGHT_PX * 8 };
        },
        // O-v3 final: camX/camY is the viewport CENTER. 2.5d keeps a
        // larger Y buffer (±3) to cover wall extrusions reaching above
        // their base tile.
        inViewport(x, y, camX, camY, vpW, vpH) {
          return x >= camX - vpW / 2 - 2 && x <= camX + vpW / 2 + 2 && y >= camY - vpH / 2 - 3 && y <= camY + vpH / 2 + 3;
        }
      };
    case "3d":
      return classicProjection(mode, tileSize, step);
    case "classic":
    default:
      return classicProjection(mode, tileSize, step);
  }
}
function classicProjection(mode, tileSize, step) {
  return {
    mode,
    toScreen(x, y, _elev, _step, offsetX, offsetY) {
      return { sx: x * step + offsetX, sy: y * step + offsetY };
    },
    toMap(sx, sy, _step, offsetX, offsetY) {
      return {
        tileX: Math.floor((sx - offsetX) / step),
        tileY: Math.floor((sy - offsetY) / step)
      };
    },
    drawTile(gfx, sx, sy) {
      gfx.rect(sx, sy, tileSize, tileSize);
    },
    viewportSize(vpW, vpH, s) {
      return { w: vpW * s, h: vpH * s };
    },
    // O-v3 final: camX/camY is the world tile that appears at the CENTER
    // of the viewport, per renderer.ts computeOffsets. Earlier impl
    // assumed camX was the top-left tile, which culled the upper-left
    // half of any centered map (e.g. tiles 0..9 of a 24×24 map with
    // camX=11.5, vpW=24 → only tiles 10..23 render → "14×14 lower-right
    // corner" symptom). Use ±vp/2 around the camera + 2-tile buffer.
    inViewport(x, y, camX, camY, vpW, vpH) {
      return x >= camX - vpW / 2 - 2 && x <= camX + vpW / 2 + 2 && y >= camY - vpH / 2 - 2 && y <= camY + vpH / 2 + 2;
    }
  };
}

export { WALL_HEIGHT_PX, makeProjection };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map