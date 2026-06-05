var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

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

// src/color.ts
function darkenColor(hex, factor) {
  const r = Math.floor((hex >> 16 & 255) * factor);
  const g = Math.floor((hex >> 8 & 255) * factor);
  const b = Math.floor((hex & 255) * factor);
  return r << 16 | g << 8 | b;
}
function lightenColor(hex, factor) {
  const r = Math.min(255, Math.floor((hex >> 16 & 255) * factor));
  const g = Math.min(255, Math.floor((hex >> 8 & 255) * factor));
  const b = Math.min(255, Math.floor((hex & 255) * factor));
  return r << 16 | g << 8 | b;
}
function mixColor(a, b, t) {
  const ar = a >> 16 & 255;
  const ag = a >> 8 & 255;
  const ab = a & 255;
  const br = b >> 16 & 255;
  const bg = b >> 8 & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return r << 16 | g << 8 | bl;
}
function parseColor(input) {
  if (typeof input === "number") return input;
  const s = input.trim();
  if (s.startsWith("#")) return parseInt(s.slice(1), 16);
  if (s.startsWith("0x")) return parseInt(s.slice(2), 16);
  const m = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (m) {
    const r = parseInt(m[1] ?? "0", 10);
    const g = parseInt(m[2] ?? "0", 10);
    const b = parseInt(m[3] ?? "0", 10);
    return r << 16 | g << 8 | b;
  }
  return 0;
}

// src/first-person.ts
var DEFAULT_WALL_TILE_IDS = /* @__PURE__ */ new Set([
  1,
  6,
  7,
  16,
  24,
  30,
  38,
  47,
  50
]);
function drawFirstPerson(args) {
  const {
    pixi: PIXI,
    layers,
    tiles,
    mapWidth,
    mapHeight,
    playerX,
    playerY,
    facing,
    viewportPxW: vpW,
    viewportPxH: vpH,
    tileColor,
    wallTileIds = DEFAULT_WALL_TILE_IDS,
    maxDepth = 8
  } = args;
  const corridorW = vpW * 0.6;
  const corridorH = vpH * 0.6;
  const sky = new PIXI.Graphics().rect(0, 0, vpW, vpH / 2).fill(657946);
  layers.ground.addChild(sky);
  const floor = new PIXI.Graphics().rect(0, vpH / 2, vpW, vpH / 2).fill(2763290);
  layers.ground.addChild(floor);
  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0]
  ];
  const fi = (facing % 4 + 4) % 4;
  const [fdx, fdy] = dirs[fi];
  const [rdx, rdy] = dirs[(fi + 1) % 4];
  for (let depth = 0; depth < maxDepth; depth++) {
    const scale = 1 - depth / maxDepth * 0.85;
    const nextScale = 1 - (depth + 1) / maxDepth * 0.85;
    const cx = playerX + fdx * depth;
    const cy = playerY + fdy * depth;
    if (cx < 0 || cy < 0 || cx >= mapWidth || cy >= mapHeight) break;
    const row = tiles[cy];
    const tile = row ? row[cx] ?? 0 : 0;
    if (wallTileIds.has(tile) && depth > 0) {
      const w = corridorW * scale;
      const h = corridorH * scale;
      const x = (vpW - w) / 2;
      const y = (vpH - h) / 2;
      const color = tileColor(tile);
      const wall = new PIXI.Graphics().rect(x, y, w, h).fill(lightenColor(color, 1.2));
      layers.walls.addChild(wall);
      break;
    }
    const floorColor = tileColor(tile);
    const w1 = corridorW * scale;
    const w2 = corridorW * nextScale;
    const h1 = corridorH * scale;
    const h2 = corridorH * nextScale;
    const x1 = (vpW - w1) / 2;
    const x2 = (vpW - w2) / 2;
    const y1 = (vpH - h1) / 2;
    const y2 = (vpH - h2) / 2;
    const lx = cx - rdx;
    const ly = cy - rdy;
    if (lx >= 0 && ly >= 0 && lx < mapWidth && ly < mapHeight) {
      const lrow = tiles[ly];
      const lt = lrow ? lrow[lx] ?? 0 : 0;
      if (wallTileIds.has(lt)) {
        const wc = darkenColor(tileColor(lt), 0.7);
        const lw = new PIXI.Graphics();
        lw.poly([x1, y1, x2, y2, x2, y2 + h2, x1, y1 + h1]);
        lw.fill(wc);
        layers.walls.addChild(lw);
      }
    }
    const rx = cx + rdx;
    const ry = cy + rdy;
    if (rx >= 0 && ry >= 0 && rx < mapWidth && ry < mapHeight) {
      const rrow = tiles[ry];
      const rt = rrow ? rrow[rx] ?? 0 : 0;
      if (wallTileIds.has(rt)) {
        const wc = darkenColor(tileColor(rt), 0.6);
        const rw = new PIXI.Graphics();
        rw.poly([x1 + w1, y1, x2 + w2, y2, x2 + w2, y2 + h2, x1 + w1, y1 + h1]);
        rw.fill(wc);
        layers.walls.addChild(rw);
      }
    }
    const fs = new PIXI.Graphics();
    fs.poly([x1, y1 + h1, x2, y2 + h2, x2 + w2, y2 + h2, x1 + w1, y1 + h1]);
    fs.fill(darkenColor(floorColor, 0.8 - depth * 0.05));
    layers.ground.addChild(fs);
    const cs = new PIXI.Graphics();
    cs.poly([x1, y1, x2, y2, x2 + w2, y2, x1 + w1, y1]);
    cs.fill(darkenColor(1710634, 0.9 - depth * 0.05));
    layers.ground.addChild(cs);
  }
}

// src/entities.ts
var CHAR_LAYER_ORDER = [
  "body",
  "head",
  "hair",
  "armor",
  "weapon",
  "acc"
];
var textureCache = /* @__PURE__ */ new Map();
async function loadTexture(PIXI, url) {
  let cached = textureCache.get(url);
  if (!cached) {
    cached = PIXI.Assets.load(url);
    textureCache.set(url, cached);
  }
  return cached;
}
var EntityRenderer = class {
  opts;
  visuals = /* @__PURE__ */ new Map();
  /** Lerp speed — 1.0 = snap instantly, 0.2 = smooth over ~5 frames. */
  lerpSpeed = 0.2;
  constructor(opts) {
    this.opts = opts;
  }
  /** Update the internal projection after a render-mode switch. */
  setProjection(projection, tileSize) {
    this.opts.projection = projection;
    this.opts.tileSize = tileSize;
  }
  /** Reconcile the on-screen state to match the input entity list. */
  update(entities, dtMs) {
    const seen = /* @__PURE__ */ new Set();
    for (const ent of entities) {
      seen.add(ent.id);
      let vis = this.visuals.get(ent.id);
      if (!vis) {
        vis = this.spawn(ent);
        this.visuals.set(ent.id, vis);
      } else {
        this.updateEntity(vis, ent);
      }
      this.tick(vis, dtMs);
      this.reproject(vis);
    }
    for (const [id, vis] of this.visuals.entries()) {
      if (!seen.has(id)) {
        this.opts.container.removeChild(vis.container);
        vis.container.destroy({ children: true });
        this.visuals.delete(id);
      }
    }
  }
  /** Clean up all sprites + containers. */
  destroy() {
    for (const vis of this.visuals.values()) {
      this.opts.container.removeChild(vis.container);
      vis.container.destroy({ children: true });
    }
    this.visuals.clear();
  }
  // ── Internals ──────────────────────────────────────────────
  spawn(ent) {
    const PIXI = this.opts.pixi;
    const container = new PIXI.Container();
    container.label = `entity-${ent.id}`;
    const vis = {
      id: ent.id,
      container,
      layers: {},
      marker: null,
      drawX: ent.x,
      drawY: ent.y,
      targetX: ent.x,
      targetY: ent.y,
      lerpT: 1,
      facing: ent.facing ?? 2,
      animation: ent.animation ?? "idle",
      animFrame: 0,
      lastFrameAt: performance.now(),
      lastData: ent
    };
    if (ent.layers && Object.keys(ent.layers).length > 0) {
      for (const layerName of CHAR_LAYER_ORDER) {
        const url = ent.layers[layerName];
        if (url) {
          const placeholder = new PIXI.Sprite(PIXI.Texture.WHITE);
          placeholder.width = this.opts.tileSize;
          placeholder.height = this.opts.tileSize;
          placeholder.tint = kindColor(ent.kind);
          container.addChild(placeholder);
          vis.layers[layerName] = placeholder;
          void loadTexture(PIXI, url).then((tex) => {
            if (!placeholder.destroyed) {
              placeholder.texture = tex;
              placeholder.tint = 16777215;
            }
          });
        }
      }
    } else if (ent.spriteUrl) {
      const placeholder = new PIXI.Sprite(PIXI.Texture.WHITE);
      placeholder.width = this.opts.tileSize;
      placeholder.height = this.opts.tileSize;
      placeholder.tint = kindColor(ent.kind);
      container.addChild(placeholder);
      vis.layers.body = placeholder;
      void loadTexture(PIXI, ent.spriteUrl).then((tex) => {
        if (!placeholder.destroyed) {
          placeholder.texture = tex;
          placeholder.tint = 16777215;
        }
      });
    } else {
      const marker = new PIXI.Graphics().circle(this.opts.tileSize / 2, this.opts.tileSize / 2, this.opts.tileSize / 3).fill(kindColor(ent.kind));
      container.addChild(marker);
      vis.marker = marker;
    }
    if (ent.name) {
      const text = new PIXI.Text({
        text: ent.name,
        style: {
          fontFamily: "monospace",
          fontSize: 10,
          fill: 16777215,
          stroke: { color: 0, width: 2 }
        }
      });
      text.x = this.opts.tileSize / 2 - text.width / 2;
      text.y = -12;
      container.addChild(text);
    }
    this.opts.container.addChild(container);
    return vis;
  }
  updateEntity(vis, ent) {
    if (ent.x !== vis.targetX || ent.y !== vis.targetY) {
      vis.drawX = vis.drawX;
      vis.drawY = vis.drawY;
      vis.targetX = ent.x;
      vis.targetY = ent.y;
      vis.lerpT = 0;
    }
    if (ent.facing !== void 0 && ent.facing !== vis.facing) {
      vis.facing = ent.facing;
    }
    if (ent.animation && ent.animation !== vis.animation) {
      vis.animation = ent.animation;
      vis.animFrame = 0;
    }
    vis.lastData = ent;
  }
  /** Advance interpolation + animation for one visual. */
  tick(vis, dtMs) {
    if (vis.lerpT < 1) {
      vis.lerpT = Math.min(1, vis.lerpT + this.lerpSpeed * (dtMs / 16));
      vis.drawX = lerp(vis.drawX, vis.targetX, this.lerpSpeed);
      vis.drawY = lerp(vis.drawY, vis.targetY, this.lerpSpeed);
      if (Math.abs(vis.drawX - vis.targetX) < 0.01) vis.drawX = vis.targetX;
      if (Math.abs(vis.drawY - vis.targetY) < 0.01) vis.drawY = vis.targetY;
    }
    const now = performance.now();
    if (now - vis.lastFrameAt > 150) {
      vis.animFrame = (vis.animFrame + 1) % 4;
      vis.lastFrameAt = now;
    }
  }
  /** Project current drawX/drawY to screen coordinates and move the container. */
  reproject(vis) {
    const offset = this.opts.getOffset();
    const step = this.opts.tileSize + 1;
    const { sx, sy } = this.opts.projection.toScreen(
      vis.drawX,
      vis.drawY,
      0,
      // elevation — fed later from the map's elevation layer
      step,
      offset.x,
      offset.y
    );
    vis.container.x = sx;
    vis.container.y = sy;
  }
};
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function kindColor(kind) {
  switch (kind) {
    case "player":
      return 16765286;
    case "npc":
      return 8246268;
    case "enemy":
      return 15680580;
    case "projectile":
      return 16096779;
    case "companion":
      return 10980346;
    default:
      return 16777215;
  }
}

// src/renderer.ts
var WALL_DARKEN = 0.45;
var DEFAULT_TILE_COLORS = {
  // 0–7 base terrain
  0: 3038513,
  // grass
  1: 3815994,
  // stone
  2: 3811850,
  // dirt
  3: 1981023,
  // water
  4: 8018474,
  // wood
  5: 9079434,
  // cobble
  6: 2763306,
  // cave
  7: 1710618,
  // void
  // 8–23 natural terrain
  8: 13218426,
  // sand
  9: 15265266,
  // snow
  10: 10799328,
  // ice
  11: 4863264,
  // mud
  12: 12661530,
  // lava
  13: 5919823,
  // ash
  14: 4880954,
  // tall grass
  15: 9067914,
  // heather
  16: 3824176,
  // moss
  17: 4012067,
  // bog
  18: 2826e3,
  // peat
  19: 3815973,
  // mire
  20: 4023173,
  // shallows
  21: 1323087,
  // ocean
  22: 2970744,
  // river
  23: 5933738,
  // rapids
  // 24–31 stone & masonry
  24: 14078664,
  // marble
  25: 4870746,
  // slate
  26: 8468531,
  // brick
  27: 7171698,
  // granite
  28: 11569754,
  // sandstone
  29: 5920589,
  // ruined cobble
  30: 6107945,
  // ancient brick
  31: 3814704,
  // dolmen
  // 32–39 wood & vegetation
  32: 7227941,
  // planks
  33: 8740398,
  // oak floor
  34: 4862234,
  // bark
  35: 2957328,
  // roots
  36: 4864570,
  // bramble
  37: 4023605,
  // fern
  38: 2760474,
  // thorns
  39: 2969637,
  // ivy
  // 40–47 cave & underworld
  40: 14209208,
  // bone
  41: 4856860,
  // blood earth
  42: 7216156,
  // gore
  43: 2038296,
  // cinder
  44: 12079130,
  // ember
  45: 1381146,
  // shadow
  46: 1707306,
  // void rift
  47: 3814688,
  // blight
  // 48–55 magic & rune
  48: 6970016,
  // rune
  49: 5933712,
  // ward
  50: 8437992,
  // ley line
  51: 9087184,
  // crystal
  52: 8014512,
  // amethyst
  53: 1731146,
  // emerald moss
  54: 13668536,
  // faerie ring
  55: 5918784,
  // ogham stone
  // 56–63 structural & decorative
  56: 3810581,
  // trapdoor
  57: 6969930,
  // stairs up
  58: 2760469,
  // stairs down
  59: 328965,
  // pit
  60: 9079440,
  // spike
  61: 12618293,
  // torch ground
  62: 5915952,
  // bridge plank
  63: 4866101
  // doorstep
};
var pixiPromise = null;
function loadPixi() {
  if (!pixiPromise) pixiPromise = import('pixi.js');
  return pixiPromise;
}
var TwistedRenderer = class {
  opts;
  app = null;
  layers = null;
  projection;
  ready = false;
  _lastDimsKey = null;
  destroyed = false;
  lastState = null;
  frameCounter = 0;
  // Per-layer dirty flags. update() and the animation ticker both
  // consult these to skip layers whose visual state hasn't changed,
  // which on a static map collapses the ticker into a near-noop.
  // Initialized to all true so the first paint actually draws.
  dirty = {
    ground: true,
    overlay: true,
    fringe: true,
    passability: true,
    elevation: true,
    entities: true,
    objects: true
  };
  // Set of layer names that contain at least one tile id present in
  // animatedTiles or spriteTiles. Recomputed on every state update +
  // every palette ingest. Empty set ⇒ animation ticker has nothing
  // to redraw and skips work entirely.
  animatedLayers = /* @__PURE__ */ new Set();
  animatedTiles = /* @__PURE__ */ new Map();
  /** Tile IDs that have a sprite-based animation or static sprite. Keyed
   * by tile id, value is the resolved frame URL list (one entry for
   * static sprites). Lookup is consulted in drawLayer to divert cells
   * to the sprite path instead of the color bucket. */
  spriteTiles = /* @__PURE__ */ new Map();
  paletteColors = /* @__PURE__ */ new Map();
  entityRenderer = null;
  /** Cache of pre-loaded player/entity sprite textures, keyed by URL. */
  playerTextureCache = /* @__PURE__ */ new Map();
  /** Cache of loaded MapObject textures keyed by URL. Values resolve to
   * Pixi Texture instances that can be shared across many Sprite uses. */
  objectTextureCache = /* @__PURE__ */ new Map();
  /** Set of object URLs currently being loaded so we don't double-load. */
  objectLoadPromises = /* @__PURE__ */ new Map();
  constructor(opts) {
    this.opts = opts;
    this.projection = makeProjection(opts.renderMode, opts.tileSize);
  }
  /** Mount the Pixi Application into the container. Async — awaits Pixi load + init. */
  async init(width, height) {
    if (this.destroyed) return;
    const PIXI = await loadPixi();
    if (this.destroyed) return;
    const safeWidth = Math.max(1, Math.floor(Number(width) || 0));
    const safeHeight = Math.max(1, Math.floor(Number(height) || 0));
    const isOffscreen = typeof OffscreenCanvas !== "undefined" && this.opts.canvas instanceof OffscreenCanvas;
    const detectedDpr = this.opts.resolution ?? (typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const resolution = isOffscreen ? Math.max(1, Math.round(Number(detectedDpr) || 1)) : Number(detectedDpr) || 1;
    const app = new PIXI.Application();
    const initOpts = {
      width: safeWidth,
      height: safeHeight,
      backgroundAlpha: this.opts.backgroundAlpha ?? 0,
      antialias: false,
      resolution,
      autoDensity: !isOffscreen
    };
    if (this.opts.canvas) {
      initOpts.canvas = this.opts.canvas;
    }
    await app.init(initOpts);
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    if (this.opts.container) {
      this.opts.container.innerHTML = "";
      this.opts.container.appendChild(app.canvas);
    }
    this.app = app;
    const background = new PIXI.Container();
    background.label = "background";
    const ground = new PIXI.Container();
    ground.label = "ground";
    const walls = new PIXI.Container();
    walls.label = "walls";
    const objects = new PIXI.Container();
    objects.label = "objects";
    const entities = new PIXI.Container();
    entities.label = "entities";
    const player = new PIXI.Container();
    player.label = "player";
    const fringe = new PIXI.Container();
    fringe.label = "fringe";
    const fog = new PIXI.Container();
    fog.label = "fog";
    app.stage.addChild(background, ground, walls, objects, entities, player, fringe, fog);
    this.layers = { background, ground, walls, objects, entities, player, fringe, fog };
    this.entityRenderer = new EntityRenderer({
      container: entities,
      projection: this.projection,
      tileSize: this.opts.tileSize,
      getOffset: () => {
        const o = this.currentOffsets();
        return { x: o.offsetX, y: o.offsetY };
      },
      pixi: PIXI
    });
    let animFrameAccum = 0;
    app.ticker.add((tickerArg) => {
      const delta = typeof tickerArg === "number" ? tickerArg : tickerArg?.deltaTime ?? 1;
      animFrameAccum += delta;
      if (animFrameAccum < 6) return;
      animFrameAccum = 0;
      if (!this.lastState) return;
      const hasAnimatedObjects = (this.lastState.objects || []).some(
        (o) => o.sprite_anim_urls && o.sprite_anim_urls.length > 1 || o.anim_frames && o.anim_frames.length > 1
      );
      if (this.animatedLayers.size === 0 && !hasAnimatedObjects) return;
      this.markAnimatedDirty();
      if (hasAnimatedObjects) this.markLayerDirty("objects");
      void this.drawDirtyOnly();
    });
    this.ready = true;
    if (this._pendingResize) {
      const { w, h } = this._pendingResize;
      this._pendingResize = null;
      this.app.renderer.resize(w, h);
      const canvasEl = this.app.renderer.canvas;
      if (canvasEl && typeof canvasEl === "object" && "style" in canvasEl) {
        canvasEl.style.width = w + "px";
        canvasEl.style.height = h + "px";
      }
      try {
        const gl = canvasEl && (canvasEl.getContext("webgl2") || canvasEl.getContext("webgl"));
        if (gl) gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      } catch (_e) {
      }
      this.markAllDirty();
    }
    if (this._pendingTileSize !== null) {
      const ts = this._pendingTileSize;
      this._pendingTileSize = null;
      if (ts !== this.opts.tileSize) {
        this.opts.tileSize = ts;
        this.projection = makeProjection(this.opts.renderMode, ts);
        if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, ts);
        this.markAllDirty();
      }
    }
    if (this.lastState) void this.update(this.lastState);
  }
  /** Push a new render state. Diffs against the previous state and
   * redraws only the layers whose data actually changed. The animation
   * ticker calls `drawDirtyOnly()` which routes through this same
   * function with the same lastState, relying on pre-set dirty flags
   * to drive what re-paints. */
  async update(state) {
    this.diffAndMarkDirty(state);
    this.lastState = state;
    if (!this.ready || this.destroyed || !this.app || !this.layers) {
      if (globalThis.RENDER_DEBUG) {
        console.warn("[render] update bailed", {
          ready: this.ready,
          destroyed: this.destroyed,
          hasApp: !!this.app,
          hasLayers: !!this.layers
        });
      }
      return;
    }
    const PIXI = await loadPixi();
    if (this.destroyed || !this.layers) return;
    if (state.tilePalette) this.ingestPalette(state.tilePalette);
    this.recomputeAnimatedLayers(state);
    const layers = this.layers;
    const clearChildren = (c) => {
      for (const ch of c.removeChildren()) ch.destroy();
    };
    const wallsContainerDirty = this.dirty.overlay || this.opts.renderMode === "2.5d" && this.dirty.ground;
    clearChildren(layers.background);
    if (this.dirty.ground) clearChildren(layers.ground);
    if (wallsContainerDirty) clearChildren(layers.walls);
    if (this.dirty.fringe) clearChildren(layers.fringe);
    if (this.dirty.objects) clearChildren(layers.objects);
    if (this.dirty.entities) {
      clearChildren(layers.entities);
      clearChildren(layers.player);
    }
    if (this.dirty.passability || this.dirty.elevation) {
      clearChildren(layers.fog);
    }
    let drawnGround = 0;
    let skippedOffscreen = 0;
    {
      const offsets = this.computeOffsets(state);
      const resolution = this.app && this.app.renderer && this.app.renderer.resolution || 1;
      const canvasW = (this.app && this.app.renderer && this.app.renderer.width || offsets.vpPxW) / resolution;
      const canvasH = (this.app && this.app.renderer && this.app.renderer.height || offsets.vpPxH) / resolution;
      const mapW = offsets.vpPxW;
      const mapH = offsets.vpPxH;
      const mapX = Math.max(0, (canvasW - mapW) / 2);
      const mapY = Math.max(0, (canvasH - mapH) / 2);
      const bg = new PIXI.Graphics();
      bg.rect(0, 0, canvasW, canvasH);
      bg.fill(526344);
      bg.rect(mapX, mapY, mapW, mapH);
      bg.fill(2762016);
      bg.rect(mapX - 1, mapY - 1, mapW + 2, mapH + 2);
      bg.stroke({ color: 11766586, width: 2, alpha: 0.85 });
      layers.background.addChild(bg);
    }
    if (this.opts.renderMode === "first-person") {
      const vp = this.projection.viewportSize(
        state.viewportW,
        state.viewportH,
        this.opts.tileSize + 1
      );
      const tiles2D = this.buildTile2D(state);
      drawFirstPerson({
        pixi: PIXI,
        layers: { ground: layers.ground, walls: layers.walls },
        tiles: tiles2D,
        mapWidth: state.mapWidth,
        mapHeight: state.mapHeight,
        playerX: state.playerX,
        playerY: state.playerY,
        facing: state.playerFacing ?? 0,
        viewportPxW: vp.w,
        viewportPxH: vp.h,
        tileColor: (id) => this.tileColor(id),
        wallTileIds: this.opts.wallTileIds ?? DEFAULT_WALL_TILE_IDS
      });
      return;
    }
    const { tileSize } = this.opts;
    const off = this.computeOffsets(state);
    const { step, offsetX, offsetY } = off;
    const vpPxW = off.vpPxW;
    const vpPxH = off.vpPxH;
    if (state.fogEnabled && this.opts.callbacks?.onExplore) {
      const r = state.fogRadius ?? 3;
      const fresh = [];
      const explored = state.exploredTiles ?? /* @__PURE__ */ new Set();
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const tx = state.playerX + dx;
          const ty = state.playerY + dy;
          if (tx < 0 || ty < 0 || tx >= state.mapWidth || ty >= state.mapHeight)
            continue;
          const key = `${tx},${ty}`;
          if (!explored.has(key)) fresh.push(key);
        }
      }
      if (fresh.length > 0) this.opts.callbacks.onExplore(fresh);
    }
    const { camX, camY, viewportW, viewportH, mapWidth, mapHeight } = state;
    const elevLayer = state.layers.elevation;
    const passabilityVisible = state.showPassability ?? false;
    const elevationVisible = state.showElevation ?? false;
    const hideFringeNear = (x, y) => Math.abs(x - state.playerX) <= 1 && Math.abs(y - state.playerY) <= 1;
    const drawLayer = (tiles, targetContainer, opts) => {
      const buckets = /* @__PURE__ */ new Map();
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) {
            if (opts.isGround) skippedOffscreen++;
            continue;
          }
          if (opts.isGround) drawnGround++;
          const idx = y * mapWidth + x;
          const tileId = tiles[idx] ?? 0;
          if (opts.skipNegative && tileId < 0) continue;
          if (opts.hideUnderPlayer && hideFringeNear(x, y)) continue;
          const elev = elevLayer[idx] ?? 0;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          const sprite = this.spriteTiles.get(tileId);
          if (sprite) {
            const frame = sprite.urls[Math.floor(this.frameCounter / (60 / sprite.fps)) % sprite.urls.length];
            const tex = frame ? this.getObjectTexture(frame) : null;
            if (tex) {
              const s = new PIXI.Sprite(tex);
              s.width = tileSize;
              s.height = tileSize;
              s.position.set(sx, sy);
              targetContainer.addChild(s);
            } else if (frame) {
              this.loadObjectTexture(frame);
              const fallback = opts.colorOverride ? opts.colorOverride(tileId) : this.tileColor(tileId);
              let b = buckets.get(fallback);
              if (!b) {
                b = [];
                buckets.set(fallback, b);
              }
              b.push({ sx, sy });
            }
            continue;
          }
          const color = opts.colorOverride ? opts.colorOverride(tileId) : this.tileColor(tileId);
          let bucket = buckets.get(color);
          if (!bucket) {
            bucket = [];
            buckets.set(color, bucket);
          }
          bucket.push({ sx, sy });
        }
      }
      for (const [color, cells] of buckets) {
        const gfx = new PIXI.Graphics();
        for (const { sx, sy } of cells) {
          this.projection.drawTile(gfx, sx, sy, tileSize);
        }
        gfx.fill(color);
        targetContainer.addChild(gfx);
      }
    };
    if (this.dirty.ground) {
      drawLayer(state.layers.ground, layers.ground, {
        skipNegative: false,
        hideUnderPlayer: false,
        isGround: true
      });
      this.dirty.ground = false;
    }
    if (globalThis.RENDER_DEBUG && drawnGround > 0) {
      const gfxCount = layers.ground.children.length;
      console.info("[render] drawLayer ground", {
        drawn: drawnGround,
        skippedOffscreen,
        gfxBuckets: gfxCount,
        paletteSize: this.paletteColors.size,
        spriteTiles: this.spriteTiles.size,
        animatedLayers: Array.from(this.animatedLayers),
        canvas: { w: this.app.renderer.width, h: this.app.renderer.height },
        cam: [state.camX, state.camY],
        vp: [state.viewportW, state.viewportH]
      });
    }
    if (this.opts.renderMode === "2.5d" && wallsContainerDirty) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const elev = elevLayer[idx] ?? 0;
          if (elev <= 0) continue;
          const tileId = state.layers.ground[idx] ?? 0;
          const color = this.tileColor(tileId);
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          const wallH = elev * WALL_HEIGHT_PX;
          const wallColor = darkenColor(color, WALL_DARKEN);
          const sideW = Math.min(6, Math.ceil(tileSize * 0.15));
          const front = new PIXI.Graphics().rect(0, 0, tileSize, wallH).fill(wallColor);
          front.position.set(sx, sy + tileSize);
          layers.walls.addChild(front);
          const side = new PIXI.Graphics().rect(0, 0, sideW, wallH + tileSize).fill(darkenColor(color, 0.3));
          side.position.set(sx + tileSize, sy);
          layers.walls.addChild(side);
          const topEdge = new PIXI.Graphics().rect(0, 0, tileSize, 2).fill(lightenColor(color, 1.5));
          topEdge.position.set(sx, sy);
          layers.walls.addChild(topEdge);
          const leftEdge = new PIXI.Graphics().rect(0, 0, 1, tileSize).fill(lightenColor(color, 1.3));
          leftEdge.position.set(sx, sy);
          layers.walls.addChild(leftEdge);
          const shadowH = Math.min(wallH * 0.4, 8);
          const shadow = new PIXI.Graphics().rect(0, 0, tileSize + sideW, shadowH).fill({ color: 0, alpha: 0.25 });
          shadow.position.set(sx, sy + tileSize + wallH);
          layers.walls.addChild(shadow);
          const gradStripe = new PIXI.Graphics().rect(0, 0, tileSize, Math.ceil(wallH * 0.4)).fill({ color: 0, alpha: 0.15 });
          gradStripe.position.set(sx, sy + tileSize + wallH * 0.6);
          layers.walls.addChild(gradStripe);
        }
      }
      layers.walls.sortChildren();
    }
    if (this.dirty.overlay) {
      drawLayer(state.layers.overlay, layers.walls, {
        skipNegative: true,
        hideUnderPlayer: false
      });
      this.dirty.overlay = false;
    }
    if (this.dirty.fringe) {
      const hiddenFringe = state.hiddenFringeTiles;
      if (hiddenFringe && hiddenFringe.size > 0) {
        for (let i = 0; i < state.layers.fringe.length; i++) {
          const tileId = state.layers.fringe[i] ?? -1;
          if (tileId < 0) continue;
          const fx = i % mapWidth;
          const fy = Math.floor(i / mapWidth);
          if (!this.projection.inViewport(fx, fy, camX, camY, viewportW, viewportH)) continue;
          const isHidden = hiddenFringe.has(i);
          const { sx, sy } = this.projection.toScreen(fx, fy, 0, step, offsetX, offsetY);
          const gfx = new PIXI.Graphics();
          this.projection.drawTile(gfx, sx, sy, tileSize);
          gfx.fill({ color: this.tileColor(tileId), alpha: isHidden ? 0.1 : 1 });
          layers.fringe.addChild(gfx);
        }
      } else {
        drawLayer(state.layers.fringe, layers.fringe, {
          skipNegative: true,
          hideUnderPlayer: true
        });
      }
      this.dirty.fringe = false;
    }
    if (this.dirty.objects) {
      for (const obj of state.objects || []) {
        if (!this.projection.inViewport(obj.x, obj.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[obj.y * mapWidth + obj.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(obj.x, obj.y, elev, step, offsetX, offsetY);
        const urlFrames = obj.sprite_anim_urls && obj.sprite_anim_urls.length > 0 ? obj.sprite_anim_urls : null;
        const fps = Math.max(1, obj.anim_fps || 4);
        const activeUrl = urlFrames ? urlFrames[Math.floor(this.frameCounter / (60 / fps)) % urlFrames.length] : obj.sprite_url;
        let visual = null;
        if (activeUrl) {
          const tex = this.getObjectTexture(activeUrl);
          if (tex) {
            const sprite = new PIXI.Sprite(tex);
            const targetW = (obj.sprite_w || tileSize) * (step / tileSize);
            const targetH = (obj.sprite_h || tileSize) * (step / tileSize);
            sprite.width = targetW;
            sprite.height = targetH;
            sprite.anchor.set(0.5, 1);
            sprite.position.set(sx + tileSize / 2, sy + tileSize);
            visual = sprite;
          } else {
            this.loadObjectTexture(activeUrl);
          }
        }
        if (!visual) {
          const iconText = obj.icon || "\u{1F4E6}";
          const text = new PIXI.Text({
            text: iconText,
            style: { fontSize: Math.round(tileSize * 0.65) }
          });
          text.anchor.set(0.5);
          text.position.set(sx + tileSize / 2, sy + tileSize / 2);
          visual = text;
        }
        if (this.opts.callbacks?.onObjectClick) {
          visual.eventMode = "static";
          visual.cursor = "pointer";
          const cb = this.opts.callbacks.onObjectClick;
          visual.on("pointerdown", () => cb(obj));
        }
        layers.objects.addChild(visual);
        if (obj.light && obj.light.radius > 0) {
          const glow = new PIXI.Graphics();
          const r = obj.light.radius * step;
          const c = parseInt((obj.light.color || "#ff8833").replace("#", ""), 16) || 16746547;
          glow.circle(0, 0, r).fill({ color: c, alpha: 0.08 });
          glow.position.set(sx + tileSize / 2, sy + tileSize / 2);
          layers.objects.addChild(glow);
        }
      }
      this.dirty.objects = false;
    }
    if (this.dirty.entities) {
      for (const p of state.nearbyPlayers || []) {
        if (!this.projection.inViewport(p.x, p.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[p.y * mapWidth + p.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(p.x, p.y, elev, step, offsetX, offsetY);
        const dot = new PIXI.Graphics().circle(0, 0, (tileSize - 4) / 2).fill(p.isOffline ? 5592405 : 4504490);
        dot.position.set(sx + tileSize / 2, sy + tileSize / 2);
        layers.entities.addChild(dot);
      }
      for (const comp of state.companions || []) {
        if (!this.projection.inViewport(comp.x, comp.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[comp.y * mapWidth + comp.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(comp.x, comp.y, elev, step, offsetX, offsetY);
        const text = new PIXI.Text({
          text: comp.icon || "\u2694\uFE0F",
          style: { fontSize: Math.round(tileSize * 0.5) }
        });
        text.anchor.set(0.5);
        text.position.set(sx + tileSize / 2, sy + tileSize / 2);
        layers.entities.addChild(text);
      }
      for (const gi of state.groundItems || []) {
        if (!this.projection.inViewport(gi.x, gi.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[gi.y * mapWidth + gi.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(gi.x, gi.y, elev, step, offsetX, offsetY);
        const onPickup = this.opts.callbacks?.onPickupItem;
        if (gi.icon) {
          const text = new PIXI.Text({
            text: gi.icon,
            style: { fontSize: Math.round(tileSize * 0.5) }
          });
          text.anchor.set(0.5);
          text.position.set(sx + tileSize / 2, sy + tileSize / 2);
          if (onPickup) {
            text.eventMode = "static";
            text.cursor = "pointer";
            text.on("pointerdown", () => onPickup(gi.id));
          }
          layers.entities.addChild(text);
        } else {
          const dot = new PIXI.Graphics().circle(0, 0, tileSize * 0.2).fill(16763904);
          dot.position.set(sx + tileSize / 2, sy + tileSize / 2);
          if (onPickup) {
            dot.eventMode = "static";
            dot.cursor = "pointer";
            dot.on("pointerdown", () => onPickup(gi.id));
          }
          layers.entities.addChild(dot);
        }
      }
      for (const s of state.deployedStructures || []) {
        if (!this.projection.inViewport(s.x, s.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[s.y * mapWidth + s.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(s.x, s.y, elev, step, offsetX, offsetY);
        const text = new PIXI.Text({
          text: s.icon || "\u{1F3E0}",
          style: { fontSize: Math.round(tileSize * 0.65) }
        });
        text.anchor.set(0.5);
        text.position.set(sx + tileSize / 2, sy + tileSize / 2);
        const onEnter = this.opts.callbacks?.onEnterStructure;
        if (onEnter) {
          text.eventMode = "static";
          text.cursor = "pointer";
          text.on("pointerdown", () => onEnter(s.id));
        }
        layers.entities.addChild(text);
      }
      for (const b of state.mapBattles || []) {
        if (!this.projection.inViewport(b.x, b.y, camX, camY, viewportW, viewportH)) continue;
        const elev = elevLayer[b.y * mapWidth + b.x] ?? 0;
        const { sx, sy } = this.projection.toScreen(b.x, b.y, elev, step, offsetX, offsetY);
        const glow = new PIXI.Graphics().circle(0, 0, tileSize * 0.6).fill({ color: 16724787, alpha: 0.4 });
        glow.position.set(sx + tileSize / 2, sy + tileSize / 2);
        layers.entities.addChild(glow);
        const icon = new PIXI.Text({
          text: "\u2694\uFE0F",
          style: { fontSize: Math.round(tileSize * 0.55) }
        });
        icon.anchor.set(0.5);
        icon.position.set(sx + tileSize / 2, sy + tileSize / 2);
        const onBattle = this.opts.callbacks?.onBattleClick;
        if (onBattle) {
          icon.eventMode = "static";
          icon.cursor = "pointer";
          icon.on("pointerdown", () => onBattle(b.battleId));
        }
        layers.entities.addChild(icon);
      }
    }
    if (this.dirty.passability && passabilityVisible) {
      const passColor = (id) => {
        switch (id) {
          case 0:
            return 65280;
          // walkable — green
          case 1:
            return 16711680;
          // blocked — red
          case 2:
            return 16776960;
          // trigger — yellow
          default:
            return 0;
        }
      };
      const passBuckets = /* @__PURE__ */ new Map();
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const passValue = state.layers.passability[idx] ?? 0;
          if (passValue === 0) continue;
          const elev = elevLayer[idx] ?? 0;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          let bucket = passBuckets.get(passValue);
          if (!bucket) {
            bucket = [];
            passBuckets.set(passValue, bucket);
          }
          bucket.push({ sx, sy });
        }
      }
      for (const [passValue, cells] of passBuckets) {
        const gfx = new PIXI.Graphics();
        for (const { sx, sy } of cells) {
          this.projection.drawTile(gfx, sx, sy, tileSize);
        }
        gfx.fill({ color: passColor(passValue), alpha: 0.4 });
        layers.fog.addChild(gfx);
      }
    }
    this.dirty.passability = false;
    if (this.dirty.elevation && elevationVisible) {
      for (let y = 0; y < mapHeight; y++) {
        for (let x = 0; x < mapWidth; x++) {
          if (!this.projection.inViewport(x, y, camX, camY, viewportW, viewportH)) continue;
          const idx = y * mapWidth + x;
          const elev = elevLayer[idx] ?? 0;
          if (elev === 0) continue;
          const { sx, sy } = this.projection.toScreen(x, y, elev, step, offsetX, offsetY);
          const label = new PIXI.Text({
            text: String(elev),
            style: {
              fontFamily: "monospace",
              fontSize: 10,
              fill: 16766720,
              stroke: { color: 0, width: 2 }
            }
          });
          label.x = sx + tileSize / 2 - label.width / 2;
          label.y = sy + tileSize / 2 - label.height / 2;
          layers.fog.addChild(label);
        }
      }
    }
    this.dirty.elevation = false;
    if (this.dirty.entities) {
      const pElev = elevLayer[state.playerY * mapWidth + state.playerX] ?? 0;
      const { sx, sy } = this.projection.toScreen(
        state.playerX,
        state.playerY,
        pElev,
        step,
        offsetX,
        offsetY
      );
      if (state.playerSpriteUrl) {
        const url = state.playerSpriteUrl;
        let texPromise = this.playerTextureCache.get(url);
        if (!texPromise) {
          texPromise = PIXI.Assets.load(url);
          this.playerTextureCache.set(url, texPromise);
        }
        const frameCounter = this.frameCounter;
        texPromise.then((tex) => {
          if (this.destroyed || !this.layers) return;
          if (this.frameCounter !== frameCounter + 0) ;
          const sprite = new PIXI.Sprite(tex);
          sprite.width = tileSize;
          sprite.height = tileSize;
          sprite.position.set(sx, sy);
          this.layers.player.addChild(sprite);
        }).catch(() => {
          const r = Math.round(tileSize * 0.275);
          const dot = new PIXI.Graphics().circle(sx + tileSize / 2, sy + tileSize / 2, r).fill(6711039);
          if (this.layers) this.layers.player.addChild(dot);
        });
      } else {
        const r = Math.round(tileSize * 0.275);
        const ring = new PIXI.Graphics().circle(sx + tileSize / 2, sy + tileSize / 2, r + 1).stroke({ color: 8947967, width: 2, alpha: 0.5 });
        layers.player.addChild(ring);
        const dot = new PIXI.Graphics().circle(sx + tileSize / 2, sy + tileSize / 2, r).fill(6711039);
        layers.player.addChild(dot);
      }
    }
    const totalDark = Math.min(1, (state.ambientDark ?? 0) + (state.nightDarkness ?? 0));
    const fogOn = state.fogEnabled ?? false;
    if (fogOn || totalDark > 0) {
      const darkAlpha = fogOn ? 0.92 : totalDark;
      const fogCanvas = document.createElement("canvas");
      fogCanvas.width = vpPxW;
      fogCanvas.height = vpPxH;
      const fctx = fogCanvas.getContext("2d");
      if (fctx) {
        fctx.fillStyle = `rgba(0,0,16,${darkAlpha})`;
        fctx.fillRect(0, 0, vpPxW, vpPxH);
        if (fogOn) {
          const explored = state.exploredTiles ?? /* @__PURE__ */ new Set();
          fctx.globalCompositeOperation = "destination-out";
          fctx.fillStyle = "rgba(0,0,0,0.6)";
          for (const key of explored) {
            const [txStr, tyStr] = key.split(",");
            const tx = Number(txStr);
            const ty = Number(tyStr);
            if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
            const { sx: ex, sy: ey } = this.projection.toScreen(tx, ty, 0, step, offsetX, offsetY);
            if (ex < -tileSize || ex > vpPxW + tileSize || ey < -tileSize || ey > vpPxH + tileSize) continue;
            fctx.fillRect(ex, ey, tileSize, tileSize);
          }
          const { sx: px, sy: py } = this.projection.toScreen(
            state.playerX,
            state.playerY,
            0,
            step,
            offsetX,
            offsetY
          );
          const revealR = (state.fogRadius ?? 3) * step;
          const cx = px + tileSize / 2;
          const cy = py + tileSize / 2;
          const grad = fctx.createRadialGradient(cx, cy, revealR * 0.3, cx, cy, revealR);
          grad.addColorStop(0, "rgba(0,0,0,1)");
          grad.addColorStop(0.7, "rgba(0,0,0,0.8)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          fctx.fillStyle = grad;
          fctx.beginPath();
          fctx.arc(cx, cy, revealR, 0, Math.PI * 2);
          fctx.fill();
          fctx.globalCompositeOperation = "source-over";
        }
        const objs = state.objects || [];
        const lit = objs.filter((o) => o.light && o.light.radius > 0);
        if (lit.length > 0) {
          fctx.globalCompositeOperation = "destination-out";
          for (const obj of lit) {
            const { sx: lx, sy: ly } = this.projection.toScreen(obj.x, obj.y, 0, step, offsetX, offsetY);
            const lr = obj.light.radius * step;
            const lcx = lx + tileSize / 2;
            const lcy = ly + tileSize / 2;
            const lGrad = fctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
            lGrad.addColorStop(0, "rgba(0,0,0,0.9)");
            lGrad.addColorStop(0.5, "rgba(0,0,0,0.5)");
            lGrad.addColorStop(1, "rgba(0,0,0,0)");
            fctx.fillStyle = lGrad;
            fctx.beginPath();
            fctx.arc(lcx, lcy, lr, 0, Math.PI * 2);
            fctx.fill();
          }
          fctx.globalCompositeOperation = "source-over";
          for (const obj of lit) {
            const { sx: lx, sy: ly } = this.projection.toScreen(obj.x, obj.y, 0, step, offsetX, offsetY);
            const lr = obj.light.radius * step * 0.6;
            const lcx = lx + tileSize / 2;
            const lcy = ly + tileSize / 2;
            const c = obj.light.color || "#ff8833";
            const lGrad = fctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lr);
            lGrad.addColorStop(0, c + "30");
            lGrad.addColorStop(1, c + "00");
            fctx.fillStyle = lGrad;
            fctx.beginPath();
            fctx.arc(lcx, lcy, lr, 0, Math.PI * 2);
            fctx.fill();
          }
        }
        const fogTex = PIXI.Texture.from(fogCanvas);
        const fogSprite = new PIXI.Sprite(fogTex);
        layers.fog.addChild(fogSprite);
      }
    }
    if (this.dirty.entities) {
      if (this.entityRenderer && state.entities) {
        this.entityRenderer.update(state.entities, 16);
      }
      this.dirty.entities = false;
    }
    this.frameCounter++;
  }
  /** Switch to a different render mode at runtime. Rebuilds the projection strategy. */
  setRenderMode(mode) {
    this.opts.renderMode = mode;
    this.projection = makeProjection(mode, this.opts.tileSize);
    if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, this.opts.tileSize);
    this.markAllDirty();
    if (this.lastState) void this.update(this.lastState);
  }
  /** Switch canvas mode (edit/play/battle). Future: adjusts camera + input routing. */
  setCanvasMode(mode) {
    this.opts.canvasMode = mode;
  }
  /**
   * Translate a screen-space pixel (relative to the renderer's canvas
   * element) into a tile coordinate using the current projection and the
   * last-rendered camera state. Returns null when no state is available yet
   * or when the click falls outside the visible map bounds.
   */
  screenToTile(localX, localY) {
    const state = this.lastState;
    if (!state) return null;
    const { offsetX, offsetY, step } = this.currentOffsets();
    const { tileX, tileY } = this.projection.toMap(localX, localY, step, offsetX, offsetY);
    if (tileX < 0 || tileY < 0 || tileX >= state.mapWidth || tileY >= state.mapHeight) return null;
    return { tileX, tileY };
  }
  /** Project a tile coordinate back to screen pixels under the current camera. */
  tileToScreen(tileX, tileY, elevation = 0) {
    if (!this.lastState) return null;
    const { offsetX, offsetY, step } = this.currentOffsets();
    return this.projection.toScreen(tileX, tileY, elevation, step, offsetX, offsetY);
  }
  /**
   * Single source of truth for camera transform. Both the render loop
   * (update()) and the screen↔tile helpers (screenToTile / tileToScreen)
   * MUST go through this method — diverging math here causes clicks to
   * land on different tiles than the renderer drew.
   *
   * Convention: state.camX / camY is the world tile that should appear
   * at the center of the viewport. The offsets translate world→screen so
   * that camera tile lands centered in the projection's viewport pixel
   * box. Isometric is special-cased because its tile shape isn't axis-
   * aligned (diamond), so vertical centering uses tileSize*2 instead of
   * vpPxH/2.
   */
  computeOffsets(state) {
    const { tileSize, renderMode } = this.opts;
    const step = tileSize + 1;
    const vp = this.projection.viewportSize(state.viewportW, state.viewportH, step);
    const vpPxW = vp.w;
    const vpPxH = vp.h;
    const resolution = this.app && this.app.renderer && this.app.renderer.resolution || 1;
    const canvasW = (this.app && this.app.renderer && this.app.renderer.width || vpPxW) / resolution;
    const canvasH = (this.app && this.app.renderer && this.app.renderer.height || vpPxH) / resolution;
    const mapOffsetX = Math.max(0, (canvasW - vpPxW) / 2);
    const mapOffsetY = Math.max(0, (canvasH - vpPxH) / 2);
    const _dimsKey = `${canvasW}x${canvasH}/${tileSize}`;
    if (this._lastDimsKey !== _dimsKey) this._lastDimsKey = _dimsKey;
    if (renderMode === "isometric") {
      return {
        step,
        vpPxW,
        vpPxH,
        offsetX: -state.camX * step + vpPxW / 2 + mapOffsetX,
        offsetY: -state.camY * step + tileSize * 2 + mapOffsetY
      };
    }
    return {
      step,
      vpPxW,
      vpPxH,
      offsetX: -state.camX * step + vpPxW / 2 - step / 2 + mapOffsetX,
      offsetY: -state.camY * step + vpPxH / 2 - step / 2 + mapOffsetY
    };
  }
  /** Backward-compatible wrapper — currentOffsets() lives on for any
   * external caller that imported it. Always delegates to computeOffsets. */
  currentOffsets() {
    const o = this.computeOffsets(this.lastState);
    return { step: o.step, offsetX: o.offsetX, offsetY: o.offsetY };
  }
  /**
   * Resize the Pixi backing canvas. Call when the host container changes
   * size (window resize, panel toggle, fit-to-screen). Re-renders the
   * last state with the new dimensions so the camera math stays correct.
   */
  /**
   * O-v3: queue resize requests that arrive before Pixi's `init()`
   * Promise resolves. Without this, the LiveView hook's `fitToScreen()`
   * fires immediately on the first map:state push but `init()` is still
   * mid-flight — the resize call hits `!this.ready`, returns silently,
   * and the Pixi backing buffer stays at the init-time dimensions
   * (viewport × step) instead of growing to fill the container. Same
   * bug class Butterfingers fixed for the player client (Ticket N).
   */
  _pendingResize = null;
  resize(width, height) {
    if (this.destroyed) return;
    const w = Math.max(1, Math.floor(Number(width) || 0));
    const h = Math.max(1, Math.floor(Number(height) || 0));
    if (!this.app || !this.ready) {
      this._pendingResize = { w, h };
      return;
    }
    this.app.renderer.resize(w, h);
    this.markAllDirty();
    const canvasEl = this.app.renderer.canvas;
    if (canvasEl && typeof canvasEl === "object" && "style" in canvasEl) {
      canvasEl.style.width = w + "px";
      canvasEl.style.height = h + "px";
    }
    try {
      const gl = canvasEl && (canvasEl.getContext("webgl2") || canvasEl.getContext("webgl"));
      if (gl) gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    } catch (_e) {
    }
    this._pendingResize = null;
    this.markAllDirty();
    if (this.lastState) {
      void this.update(this.lastState).then(() => {
        if (this.app && !this.destroyed) {
          try {
            this.app.renderer.render({ container: this.app.stage });
          } catch (_e) {
            try {
              this.app.renderer.render(this.app.stage);
            } catch (_e2) {
              if (this.app.ticker && typeof this.app.ticker.update === "function") {
                this.app.ticker.update();
              }
            }
          }
        }
      });
    }
  }
  /**
   * Update the per-tile pixel size and re-render. Pixi's projection
   * captures tileSize at creation, so we recreate it. EntityRenderer
   * reads tileSize through its constructor opts, which we update too.
   * Use case: Fit-to-Screen — scale rendered tiles so the whole map
   * fills the available canvas, instead of resizing the canvas around
   * a fixed-size map.
   */
  _pendingTileSize = null;
  setTileSize(newTileSize) {
    if (this.destroyed) return;
    const ts = Math.max(1, Math.floor(Number(newTileSize) || 0));
    if (!this.ready) {
      this._pendingTileSize = ts;
      return;
    }
    if (ts === this.opts.tileSize) return;
    this.opts.tileSize = ts;
    this.projection = makeProjection(this.opts.renderMode, ts);
    if (this.entityRenderer) this.entityRenderer.setProjection(this.projection, ts);
    this.markAllDirty();
    if (this.lastState) void this.update(this.lastState);
  }
  /** Read-only view of the current tile size. */
  getTileSize() {
    return this.opts.tileSize;
  }
  // ── Dirty-flag system (Phase 2 of the redraw-loop ticket) ─────
  // Public surface: callers in the player/admin can request specific
  // layers redraw on next frame instead of triggering a full update().
  // The internal animation ticker uses markAnimatedDirty() to repaint
  // only layers that actually contain animated tile ids.
  /** Flag a single layer for redraw on the next render pass. */
  markLayerDirty(layer) {
    this.dirty[layer] = true;
  }
  /** Flag every layer dirty — used by viewport/camera/palette mutations
   * that affect screen-space positions or colour mappings. */
  markAllDirty() {
    for (const k of Object.keys(this.dirty)) {
      this.dirty[k] = true;
    }
  }
  /** Flag only the layers that contain currently-animated tile ids
   * (computed in recomputeAnimatedLayers()). On a static map this set
   * is empty, so the ticker becomes a no-op. */
  markAnimatedDirty() {
    for (const layer of this.animatedLayers) {
      this.dirty[layer] = true;
    }
  }
  /** True if any layer needs redrawing. The ticker uses this to short-
   * circuit before scheduling a paint pass. */
  hasDirtyLayer() {
    for (const k of Object.keys(this.dirty)) {
      if (this.dirty[k]) return true;
    }
    return false;
  }
  /** Repaint only the layers currently marked dirty, using the cached
   * lastState. The animation ticker uses this — no state mutation, just
   * a re-paint pass. update(lastState) routes through the same body
   * but with the diff against lastState being a no-op (same reference),
   * so any flags pre-set by markAnimatedDirty/markLayerDirty stay set. */
  drawDirtyOnly() {
    if (!this.lastState) return Promise.resolve();
    if (!this.hasDirtyLayer()) return Promise.resolve();
    return this.update(this.lastState);
  }
  /** Walk each tile-data layer once and record which ones reference
   * an animated tile id. Cheap: one pass per layer per state update.
   * Without this, the ticker would refire `update()` every 100ms even
   * on maps where no tile actually animates. */
  recomputeAnimatedLayers(state) {
    this.animatedLayers.clear();
    if (this.animatedTiles.size === 0 && this.spriteTiles.size === 0) return;
    const isAnim = (id) => this.animatedTiles.has(id) || this.spriteTiles.has(id);
    const scan = (tiles, name) => {
      if (!tiles) return;
      for (const id of tiles) {
        if (isAnim(id)) {
          this.animatedLayers.add(name);
          return;
        }
      }
    };
    scan(state.layers.ground, "ground");
    scan(state.layers.overlay, "overlay");
    scan(state.layers.fringe, "fringe");
  }
  /** Diff incoming state against `lastState` and set per-layer dirty
   * flags by reference identity. Caller is responsible for replacing
   * the layer arrays (not mutating in place) when content changes —
   * which is how the player/admin already build state via fresh
   * arrays in buildRenderState / render_state. */
  diffAndMarkDirty(state) {
    const last = this.lastState;
    if (!last) {
      this.markAllDirty();
      return;
    }
    if (state.layers.ground !== last.layers.ground) this.dirty.ground = true;
    if (state.layers.overlay !== last.layers.overlay) this.dirty.overlay = true;
    if (state.layers.fringe !== last.layers.fringe) this.dirty.fringe = true;
    if (state.layers.passability !== last.layers.passability) this.dirty.passability = true;
    if (state.layers.elevation !== last.layers.elevation) this.dirty.elevation = true;
    if (state.entities !== last.entities) this.dirty.entities = true;
    if (state.objects !== last.objects) this.dirty.objects = true;
    if (state.camX !== last.camX || state.camY !== last.camY || state.viewportW !== last.viewportW || state.viewportH !== last.viewportH || state.playerX !== last.playerX || state.playerY !== last.playerY) {
      this.markAllDirty();
    }
    if (state.showPassability !== last.showPassability) this.dirty.passability = true;
    if (state.showElevation !== last.showElevation) this.dirty.elevation = true;
    if (state.hiddenFringeTiles !== last.hiddenFringeTiles) this.dirty.fringe = true;
  }
  /** Tear down the Pixi app and release GPU resources. */
  destroy() {
    this.destroyed = true;
    this.ready = false;
    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }
    this.layers = null;
  }
  // ── Internals ──────────────────────────────────────────────────
  ingestPalette(palette) {
    this.markAllDirty();
    this.paletteColors.clear();
    this.animatedTiles.clear();
    this.spriteTiles.clear();
    for (const t of palette) {
      const c = parseHexColor(t.color);
      if (c !== null) this.paletteColors.set(t.id, c);
      if (t.frame_urls && t.frame_urls.length > 0) {
        this.spriteTiles.set(t.id, { urls: t.frame_urls, fps: t.fps ?? 4 });
      } else if (t.sprite_url) {
        this.spriteTiles.set(t.id, { urls: [t.sprite_url], fps: 1 });
      }
      if (t.frame_tiles && t.frame_tiles.length > 1) {
        const colors = t.frame_tiles.map((fid) => {
          const entry = palette.find((p) => p.id === fid);
          if (entry) {
            const pc = parseHexColor(entry.color);
            if (pc !== null) return pc;
          }
          return DEFAULT_TILE_COLORS[fid] ?? 2042167;
        });
        this.animatedTiles.set(t.id, { colors, fps: t.fps ?? 4 });
      }
    }
  }
  /**
   * Synchronously return a loaded texture for an object sprite URL, or
   * `null` if it hasn't finished loading yet. The texture cache stores
   * **resolved** Texture values directly (via `.then(tex => cache.set)`)
   * so the hot render path never awaits — it does a single Map lookup.
   */
  getObjectTexture(url) {
    const cached = this.objectTextureCache.get(url);
    if (cached && cached.__tex) {
      return cached.__tex;
    }
    return null;
  }
  /**
   * Kick off a load for an object sprite URL. Idempotent — the second
   * call during a load-in-progress is a no-op. On completion we trigger
   * a re-render by calling `update` with the last state so the new
   * texture is picked up on the next frame.
   */
  loadObjectTexture(url) {
    if (this.objectLoadPromises.has(url)) return;
    const promise = (async () => {
      try {
        const PIXI = await loadPixi();
        const texture = await PIXI.Assets.load(url);
        this.objectTextureCache.set(url, { __tex: texture });
        void texture;
        if (this.lastState && !this.destroyed) {
          void this.update(this.lastState);
        }
      } catch (err) {
        console.warn("[TwistedRenderer] failed to load sprite", url, err);
        this.objectTextureCache.set(url, { __tex: null });
      } finally {
        this.objectLoadPromises.delete(url);
      }
    })();
    this.objectLoadPromises.set(url, promise);
  }
  tileColor(id) {
    const anim = this.animatedTiles.get(id);
    if (anim) {
      const fi = Math.floor(this.frameCounter / (60 / anim.fps)) % anim.colors.length;
      return anim.colors[fi];
    }
    return this.paletteColors.get(id) ?? DEFAULT_TILE_COLORS[id] ?? 2042167;
  }
  buildTile2D(state) {
    const grid = [];
    for (let y = 0; y < state.mapHeight; y++) {
      const row = [];
      for (let x = 0; x < state.mapWidth; x++) {
        row.push(state.layers.ground[y * state.mapWidth + x] ?? 0);
      }
      grid.push(row);
    }
    return grid;
  }
};
function parseHexColor(s) {
  const clean = s.startsWith("#") ? s.slice(1) : s;
  const n = parseInt(clean, 16);
  return Number.isFinite(n) ? n : null;
}

// src/camera.ts
var Camera = class {
  state = {
    x: 0,
    y: 0,
    zoom: 1,
    shakeX: 0,
    shakeY: 0
  };
  target = { x: 0, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
  mode = "edit";
  follow = null;
  lastBattleFraming = null;
  shake = null;
  /** Smoothing factor 0..1 per frame. Higher = snappier. */
  smoothness = 0.12;
  setMode(mode) {
    this.mode = mode;
  }
  /** Set a target for the camera to track (play mode). */
  setFollow(target) {
    this.follow = target;
    if (target && this.mode === "play") {
      this.target.x = target.x;
      this.target.y = target.y;
    }
  }
  /** Jump instantly to a world position (editor mode, fast-travel). */
  jumpTo(x, y) {
    this.state.x = x;
    this.state.y = y;
    this.target.x = x;
    this.target.y = y;
  }
  /** Pan by a relative amount (editor drag). */
  pan(dx, dy) {
    this.target.x += dx;
    this.target.y += dy;
  }
  /** Set zoom. Clamped to [0.5, 4.0]. */
  setZoom(z) {
    this.target.zoom = Math.max(0.5, Math.min(4, z));
  }
  /** Trigger screen shake (battle hits, explosions, earthquake). */
  triggerShake(intensity, durationMs) {
    if (!this.shake || intensity > this.shake.intensity) {
      this.shake = { intensity, remainingMs: durationMs };
    }
  }
  /** Frame a set of battle participants, optionally focusing on one. */
  frameBattle(framing) {
    this.lastBattleFraming = framing;
    if (framing.activeActor) {
      this.target.x = framing.activeActor.x;
      this.target.y = framing.activeActor.y;
      this.target.zoom = 1.25;
    } else if (framing.participants.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of framing.participants) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      this.target.x = (minX + maxX) / 2;
      this.target.y = (minY + maxY) / 2;
      const spread = Math.max(maxX - minX, maxY - minY);
      this.target.zoom = Math.max(0.6, Math.min(1.2, 10 / Math.max(spread, 5)));
    }
  }
  /** Advance camera state by dt milliseconds — call once per frame. */
  tick(dtMs) {
    if (this.mode === "play" && this.follow) {
      this.target.x = this.follow.x;
      this.target.y = this.follow.y;
    }
    const factor = 1 - Math.pow(1 - this.smoothness, dtMs / 16);
    this.state.x += (this.target.x - this.state.x) * factor;
    this.state.y += (this.target.y - this.state.y) * factor;
    this.state.zoom += (this.target.zoom - this.state.zoom) * factor;
    if (this.shake) {
      this.shake.remainingMs -= dtMs;
      if (this.shake.remainingMs <= 0) {
        this.shake = null;
        this.state.shakeX = 0;
        this.state.shakeY = 0;
      } else {
        const decay = Math.max(0, this.shake.remainingMs / 300);
        const amp = this.shake.intensity * decay;
        this.state.shakeX = (Math.random() * 2 - 1) * amp;
        this.state.shakeY = (Math.random() * 2 - 1) * amp;
      }
    }
  }
  /** Get current camera world position (after smoothing + shake). */
  get position() {
    return {
      x: this.state.x,
      y: this.state.y,
      zoom: this.state.zoom
    };
  }
  /** Get current shake offset in pixels. */
  get shakeOffset() {
    return { x: this.state.shakeX, y: this.state.shakeY };
  }
  /** Compute screen-space offset for the tile renderer. */
  getScreenOffset(tileStep, viewportPxW, viewportPxH) {
    const centerX = viewportPxW / 2;
    const centerY = viewportPxH / 2;
    return {
      x: -this.state.x * tileStep + centerX + this.state.shakeX,
      y: -this.state.y * tileStep + centerY + this.state.shakeY
    };
  }
};

// src/input.ts
var DEFAULT_BINDINGS = {
  // Editor
  KeyB: "edit.tool.select",
  KeyG: "edit.tool.select",
  KeyE: "edit.tool.select",
  KeyR: "edit.tool.select",
  KeyS: "edit.tool.select",
  "Meta+KeyZ": "edit.undo",
  "Meta+Shift+KeyZ": "edit.redo",
  "Meta+KeyY": "edit.redo",
  "Meta+KeyC": "edit.copy",
  "Meta+KeyV": "edit.paste",
  "Meta+KeyS": "edit.save",
  Delete: "edit.delete",
  Backspace: "edit.delete",
  // Player
  KeyW: "player.move",
  KeyA: "player.move",
  KeyS_play: "player.move",
  KeyD: "player.move",
  ArrowUp: "player.move",
  ArrowLeft: "player.move",
  ArrowDown: "player.move",
  ArrowRight: "player.move",
  Space: "player.interact",
  KeyI: "player.toggle_inventory",
  KeyT: "player.toggle_chat"
};
var EDIT_TOOL_KEYS = {
  KeyB: "brush",
  KeyG: "fill",
  KeyR: "rect",
  KeyE: "eraser",
  KeyY: "eyedrop",
  KeyS: "select",
  KeyP: "passability",
  KeyA: "autotile"
};
var Input = class {
  opts;
  mode;
  listeners = [];
  pressedKeys = /* @__PURE__ */ new Set();
  spaceDragging = false;
  mouseDown = false;
  lastPanX = 0;
  lastPanY = 0;
  constructor(opts) {
    this.opts = opts;
    this.mode = opts.mode;
    this.attach();
  }
  setMode(mode) {
    this.mode = mode;
  }
  destroy() {
    for (const off of this.listeners) off();
    this.listeners = [];
    this.pressedKeys.clear();
  }
  // ── Attach event listeners ──────────────────────────────────
  attach() {
    const t = this.opts.target;
    const onMouseDown = (e) => this.handleMouseDown(e);
    const onMouseUp = (e) => this.handleMouseUp(e);
    const onMouseMove = (e) => this.handleMouseMove(e);
    const onWheel = (e) => this.handleWheel(e);
    const onContextMenu = (e) => e.preventDefault();
    const onKeyDown = (e) => this.handleKeyDown(e);
    const onKeyUp = (e) => this.handleKeyUp(e);
    const onTouchStart = (e) => this.handleTouchStart(e);
    const onTouchMove = (e) => this.handleTouchMove(e);
    const onTouchEnd = (e) => this.handleTouchEnd(e);
    t.addEventListener("mousedown", onMouseDown);
    t.addEventListener("mouseup", onMouseUp);
    t.addEventListener("mousemove", onMouseMove);
    t.addEventListener("wheel", onWheel, { passive: false });
    t.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    t.addEventListener("touchstart", onTouchStart, { passive: false });
    t.addEventListener("touchmove", onTouchMove, { passive: false });
    t.addEventListener("touchend", onTouchEnd);
    this.listeners.push(
      () => t.removeEventListener("mousedown", onMouseDown),
      () => t.removeEventListener("mouseup", onMouseUp),
      () => t.removeEventListener("mousemove", onMouseMove),
      () => t.removeEventListener("wheel", onWheel),
      () => t.removeEventListener("contextmenu", onContextMenu),
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => t.removeEventListener("touchstart", onTouchStart),
      () => t.removeEventListener("touchmove", onTouchMove),
      () => t.removeEventListener("touchend", onTouchEnd)
    );
  }
  // ── Mouse ───────────────────────────────────────────────────
  handleMouseDown(e) {
    this.mouseDown = true;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
    const { tileX, tileY } = this.opts.screenToTile(e.clientX, e.clientY);
    if (this.mode === "edit") {
      if (this.spaceDragging) return;
      if (e.button === 2) {
        this.opts.onAction({ type: "edit.eyedrop", tileX, tileY });
      } else {
        this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
      }
    } else if (this.mode === "play") {
      this.opts.onAction({ type: "player.click_move", tileX, tileY });
    } else if (this.mode === "battle") {
      this.opts.onAction({ type: "battle.select_target", tileX, tileY });
    }
  }
  handleMouseUp(_e) {
    this.mouseDown = false;
  }
  handleMouseMove(e) {
    if (!this.mouseDown) return;
    const dx = e.clientX - this.lastPanX;
    const dy = e.clientY - this.lastPanY;
    this.lastPanX = e.clientX;
    this.lastPanY = e.clientY;
    if (this.spaceDragging || this.mode === "edit") {
      const step = this.opts.tileSize + 1;
      if (this.spaceDragging) {
        this.opts.onAction({ type: "camera.pan", dx: -dx / step, dy: -dy / step });
      } else if (this.mode === "edit") {
        const { tileX, tileY } = this.opts.screenToTile(e.clientX, e.clientY);
        this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
      }
    }
  }
  handleWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    this.opts.onAction({
      type: "camera.zoom",
      factor,
      centerX: e.clientX,
      centerY: e.clientY
    });
  }
  // ── Keyboard ────────────────────────────────────────────────
  handleKeyDown(e) {
    this.pressedKeys.add(e.code);
    if (e.code === "Space") {
      if (this.mode === "edit") {
        this.spaceDragging = true;
        e.preventDefault();
        return;
      } else if (this.mode === "play") {
        this.opts.onAction({ type: "player.interact" });
        e.preventDefault();
        return;
      }
    }
    if (this.mode === "edit") {
      const tool = EDIT_TOOL_KEYS[e.code];
      if (tool) {
        this.opts.onAction({ type: "edit.tool.select", tool });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        this.opts.onAction(e.shiftKey ? { type: "edit.redo" } : { type: "edit.undo" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyY") {
        e.preventDefault();
        this.opts.onAction({ type: "edit.redo" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyS") {
        e.preventDefault();
        this.opts.onAction({ type: "edit.save" });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyC") {
        this.opts.onAction({ type: "edit.copy" });
        return;
      }
      if (e.code === "Delete" || e.code === "Backspace") {
        this.opts.onAction({ type: "edit.delete" });
        return;
      }
    }
    if (this.mode === "play") {
      const running = e.shiftKey;
      if (e.code === "KeyW" || e.code === "ArrowUp") {
        this.opts.onAction({ type: "player.move", dx: 0, dy: -1, running });
        return;
      }
      if (e.code === "KeyS" || e.code === "ArrowDown") {
        this.opts.onAction({ type: "player.move", dx: 0, dy: 1, running });
        return;
      }
      if (e.code === "KeyA" || e.code === "ArrowLeft") {
        this.opts.onAction({ type: "player.move", dx: -1, dy: 0, running });
        return;
      }
      if (e.code === "KeyD" || e.code === "ArrowRight") {
        this.opts.onAction({ type: "player.move", dx: 1, dy: 0, running });
        return;
      }
      if (e.code === "KeyI") {
        this.opts.onAction({ type: "player.toggle_inventory" });
        return;
      }
      if (e.code === "KeyT") {
        this.opts.onAction({ type: "player.toggle_chat" });
        return;
      }
      const digit = e.code.match(/^Digit([1-9])$/);
      if (digit && digit[1]) {
        this.opts.onAction({ type: "player.hotkey", slot: parseInt(digit[1], 10) });
        return;
      }
    }
    if (this.mode === "battle") {
      switch (e.code) {
        case "ArrowUp":
          this.opts.onAction({ type: "battle.menu_up" });
          return;
        case "ArrowDown":
          this.opts.onAction({ type: "battle.menu_down" });
          return;
        case "Enter":
          this.opts.onAction({ type: "battle.menu_confirm" });
          return;
        case "Escape":
          this.opts.onAction({ type: "battle.menu_cancel" });
          return;
        case "KeyZ":
          this.opts.onAction({
            type: "battle.active_defense",
            pressedAt: performance.now()
          });
          return;
      }
    }
  }
  handleKeyUp(e) {
    this.pressedKeys.delete(e.code);
    if (e.code === "Space") this.spaceDragging = false;
  }
  // ── Touch ────────────────────────────────────────────────────
  // Minimal touch handling: single-tap = click, two-finger = pan, pinch = zoom.
  touchStartX = 0;
  touchStartY = 0;
  pinchStartDist = null;
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
    } else if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      this.pinchStartDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  }
  handleTouchMove(e) {
    if (e.touches.length === 2 && this.pinchStartDist !== null) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const factor = dist / this.pinchStartDist;
      this.opts.onAction({
        type: "camera.zoom",
        factor,
        centerX: (t1.clientX + t2.clientX) / 2,
        centerY: (t1.clientY + t2.clientY) / 2
      });
      this.pinchStartDist = dist;
    } else if (e.touches.length === 1) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      const step = this.opts.tileSize + 1;
      this.opts.onAction({ type: "camera.pan", dx: -dx / step, dy: -dy / step });
      this.touchStartX = t.clientX;
      this.touchStartY = t.clientY;
    }
  }
  handleTouchEnd(e) {
    if (e.touches.length < 2) this.pinchStartDist = null;
    if (e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const dx = t.clientX - this.touchStartX;
      const dy = t.clientY - this.touchStartY;
      if (Math.hypot(dx, dy) < 10) {
        const { tileX, tileY } = this.opts.screenToTile(t.clientX, t.clientY);
        if (this.mode === "edit") {
          this.opts.onAction({ type: "edit.paint", tileX, tileY, primary: true });
        } else if (this.mode === "play") {
          this.opts.onAction({ type: "player.click_move", tileX, tileY });
        } else if (this.mode === "battle") {
          this.opts.onAction({ type: "battle.select_target", tileX, tileY });
        }
      }
    }
  }
};
function defaultBindings() {
  return DEFAULT_BINDINGS;
}

// src/combat-fx.ts
var DAMAGE_COLORS = {
  damage: 16777215,
  crit: 16766720,
  heal: 65416,
  miss: 8947848,
  block: 8956671,
  poison: 11141375,
  burn: 16729088,
  mp: 43775
};
var CombatFx = class {
  opts;
  pops = [];
  flashes = [];
  constructor(opts) {
    this.opts = opts;
  }
  /** Spawn a floating damage number at (x, y) in screen-space pixels. */
  damage(x, y, amount, type = "damage") {
    const PIXI = this.opts.pixi;
    const color = DAMAGE_COLORS[type];
    const isNumeric = typeof amount === "number";
    const displayText = typeof amount === "string" ? amount : String(amount);
    const text = new PIXI.Text({
      text: displayText,
      style: {
        fontFamily: "monospace",
        fontSize: type === "crit" ? 28 : 20,
        fontWeight: "bold",
        fill: color,
        stroke: { color: 0, width: 3 },
        dropShadow: {
          color: 0,
          blur: 4,
          distance: 2,
          alpha: 0.8
        }
      }
    });
    text.anchor.set(0.5, 0.5);
    text.x = x;
    text.y = y;
    this.opts.container.addChild(text);
    const pop = {
      text,
      startX: x,
      startY: y,
      vy: type === "crit" ? -3.5 : -2.5,
      age: 0,
      lifetime: type === "crit" || !isNumeric ? 1400 : 1e3
    };
    this.pops.push(pop);
  }
  /** Spawn a floating text label (for "MISS!", "BLOCKED!", etc.). */
  floatText(x, y, text, color = 16777215) {
    this.damage(x, y, text, "damage");
    const last = this.pops[this.pops.length - 1];
    if (last) {
      last.text.style.fill = color;
    }
  }
  /** Full-screen color flash (white for crits, red for damage, etc.). */
  flash(color, durationMs = 150) {
    const PIXI = this.opts.pixi;
    const parent = this.opts.container;
    const w = parent.width || 2e3;
    const h = parent.height || 2e3;
    const overlay = new PIXI.Graphics().rect(0, 0, w, h).fill(color);
    overlay.alpha = 0.5;
    parent.addChild(overlay);
    this.flashes.push({ overlay, age: 0, lifetime: durationMs, color });
  }
  /** Advance all active FX by dtMs. Call once per frame. */
  tick(dtMs) {
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (!p) continue;
      p.age += dtMs;
      const t = p.age / p.lifetime;
      if (t >= 1) {
        p.text.destroy();
        this.pops.splice(i, 1);
        continue;
      }
      const gravity = 0.15;
      p.text.y = p.startY + p.vy * p.age * 0.05 + gravity * p.age * p.age * 5e-4;
      p.text.alpha = 1 - t * t;
      p.text.x = p.startX + Math.sin(p.age * 0.01) * 3;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      if (!f) continue;
      f.age += dtMs;
      const t = f.age / f.lifetime;
      if (t >= 1) {
        f.overlay.destroy();
        this.flashes.splice(i, 1);
        continue;
      }
      f.overlay.alpha = 0.5 * (1 - t);
    }
  }
  /** Drop everything — called on scene teardown. */
  destroy() {
    for (const p of this.pops) p.text.destroy();
    for (const f of this.flashes) f.overlay.destroy();
    this.pops = [];
    this.flashes = [];
  }
};

// src/battle-mode.ts
var BattleSession = class {
  ctx;
  transitionOpts = null;
  backdropSprite = null;
  fadeOverlay = null;
  fadeT = 0;
  fadeDir = null;
  fadeLifetime = 600;
  active = true;
  constructor(ctx, transitionOpts) {
    this.ctx = ctx;
    this.transitionOpts = transitionOpts ?? null;
  }
  /** Resolve the effective presentation for this session. */
  get effectiveMode() {
    if (this.ctx.forceTransitionSceneId != null) return "TRANSITION";
    if (this.ctx.mode === "TRANSITION") return "TRANSITION";
    if (this.ctx.mode === "INLINE") return "INLINE";
    return this.ctx.battleSceneId != null ? "TRANSITION" : "INLINE";
  }
  /**
   * Framing data the camera should use. For INLINE, frame all participants.
   * For TRANSITION, the battle scene has its own formation anchors — the
   * camera recenters on the composed backdrop.
   */
  getFraming() {
    return {
      participants: this.ctx.participants
    };
  }
  /**
   * Called when the battle begins. For INLINE mode this is essentially
   * a no-op beyond camera framing. For TRANSITION mode this snapshots the
   * current stage to a backdrop sprite, begins a fade-out → backdrop swap →
   * fade-in sequence.
   */
  async begin(camera) {
    camera.setMode("battle");
    camera.frameBattle(this.getFraming());
    if (this.effectiveMode === "TRANSITION" && this.transitionOpts) {
      await this.beginTransition();
    }
  }
  /** Called every frame while the battle is active. */
  tick(dtMs) {
    if (this.fadeDir && this.fadeOverlay) {
      this.fadeT += dtMs;
      const progress = Math.min(1, this.fadeT / this.fadeLifetime);
      this.fadeOverlay.alpha = this.fadeDir === "in" ? 1 - progress : progress;
      if (progress >= 1) {
        if (this.fadeDir === "out") {
          this.fadeDir = "in";
          this.fadeT = 0;
        } else {
          this.fadeOverlay.destroy();
          this.fadeOverlay = null;
          this.fadeDir = null;
        }
      }
    }
  }
  /** Called when the battle ends. Fades back out and cleans up backdrop. */
  end(camera) {
    camera.setMode("play");
    this.active = false;
    if (this.backdropSprite) {
      this.backdropSprite.destroy();
      this.backdropSprite = null;
    }
  }
  /** True if the battle is still running. */
  get isActive() {
    return this.active;
  }
  // ── Internals ──────────────────────────────────────────────
  async beginTransition() {
    if (!this.transitionOpts) return;
    const PIXI = this.transitionOpts.pixi;
    const app = this.transitionOpts.app;
    const compose = this.transitionOpts.composeInto;
    try {
      const tex = app.renderer.extract.texture(app.stage);
      const sprite = new PIXI.Sprite(tex);
      sprite.label = "battle-backdrop";
      compose.addChildAt(sprite, 0);
      this.backdropSprite = sprite;
    } catch (err) {
      console.warn("[BattleSession] backdrop snapshot failed", err);
    }
    const overlay = new PIXI.Graphics().rect(0, 0, app.screen.width, app.screen.height).fill(0);
    overlay.alpha = 0;
    compose.addChild(overlay);
    this.fadeOverlay = overlay;
    this.fadeDir = "out";
    this.fadeT = 0;
  }
};

// src/shaders/index.ts
var shaders_exports = {};
__export(shaders_exports, {
  listShaders: () => listShaders,
  shaderSources: () => shaderSources
});
var vertexPassthrough = `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(vec2 aPosition) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(vec2 aPosition) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition(aPosition);
  vTextureCoord = filterTextureCoord(aPosition);
}`;
var fragmentAmbientDarkness = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_darkness;
uniform vec3 u_tint;

out vec4 fragColor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec3 darkened = mix(c.rgb, u_tint, u_darkness);
  fragColor = vec4(darkened, c.a);
}`;
var fragmentFogOfWar = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;  // w, h, 1/w, 1/h
uniform vec2 u_playerScreenPos;
uniform float u_revealRadius;
uniform float u_outerFadeScale;  // 1.3 = 30% softer edge

out vec4 fragColor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec2 pixelPos = vTextureCoord * uInputSize.xy;
  float dist = distance(pixelPos, u_playerScreenPos);
  float reveal = 1.0 - smoothstep(u_revealRadius, u_revealRadius * u_outerFadeScale, dist);
  fragColor = vec4(c.rgb, c.a * reveal);
}`;
var fragmentOghamGlow = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_time;
uniform float u_intensity;

out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  float pulse = 0.5 + 0.5 * sin(u_time * 2.0);
  float flicker = 0.9 + 0.1 * hash(vTextureCoord + u_time * 0.1);
  vec3 glow = vec3(0.8, 0.2, 0.1) * pulse * flicker * u_intensity;
  fragColor = vec4(c.rgb + glow * c.a, c.a);
}`;
var fragmentCorruptionWarp = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float u_time;
uniform float u_warpStrength;

out vec4 fragColor;

void main(void) {
  vec2 uv = vTextureCoord;
  float wave = sin(uv.y * 20.0 + u_time * 3.0) * 0.5
             + cos(uv.x * 15.0 + u_time * 2.0) * 0.5;
  vec2 warped = uv + vec2(wave * u_warpStrength * uInputSize.z, 0.0);
  vec4 c = texture(uTexture, warped);
  // Subtle purple tint on corrupted zones
  fragColor = vec4(c.rgb * vec3(0.9, 0.85, 1.1), c.a);
}`;
var fragmentCelticKnot = `#version 300 es
precision mediump float;

in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float u_time;
uniform vec3 u_color;

out vec4 fragColor;

void main(void) {
  vec2 uv = vTextureCoord * 2.0 - 1.0;
  float angle = u_time * 0.5;
  float c = cos(angle), s = sin(angle);
  uv = mat2(c, -s, s, c) * uv;

  // Three-loop knot pattern via distance-to-loops
  float d1 = length(uv - vec2(0.0, 0.3)) - 0.3;
  float d2 = length(uv - vec2(0.26, -0.15)) - 0.3;
  float d3 = length(uv - vec2(-0.26, -0.15)) - 0.3;
  float line = min(abs(d1), min(abs(d2), abs(d3)));
  float knot = smoothstep(0.1, 0.02, line);

  vec4 tex = texture(uTexture, vTextureCoord);
  fragColor = vec4(u_color * knot + tex.rgb * (1.0 - knot), max(knot, tex.a));
}`;
var shaderSources = {
  vertex: {
    passthrough: vertexPassthrough
  },
  fragment: {
    ambientDarkness: fragmentAmbientDarkness,
    fogOfWar: fragmentFogOfWar,
    oghamGlow: fragmentOghamGlow,
    corruptionWarp: fragmentCorruptionWarp,
    celticKnot: fragmentCelticKnot
  }
};
function listShaders() {
  return Object.keys(shaderSources.fragment);
}

// src/index.ts
var VERSION = "0.1.0";
function sanityCheck() {
  return `@twisted/render v${VERSION} \u2014 loaded OK`;
}

export { BattleSession, CHAR_LAYER_ORDER, Camera, CombatFx, DEFAULT_WALL_TILE_IDS, EntityRenderer, Input, TwistedRenderer, VERSION, WALL_HEIGHT_PX, darkenColor, defaultBindings, drawFirstPerson, lightenColor, makeProjection, mixColor, parseColor, sanityCheck, shaders_exports as shaders };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map