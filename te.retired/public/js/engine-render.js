// =================================================================
// ENGINE-RENDER — Canvas rendering pipeline, lighting, sprites
// Split from game_engine.js — loaded via <script> tag
// =================================================================
window.EngineRender = {
    // Canvas references (set in init)
    CANVAS: null,
    CTX: null,
    LIGHT_CANVAS: null,
    LCTX: null,

    // Constants
    TILE_SIZE: 32,
    COLORS: ['#228822', '#888888', '#2222FF', '#442200'],
    EVENT_ICONS: { TELEPORT: '🚪', NPC: '👤', ENEMY: '💀', LOOT: '💎', SHOP: '🏪' },

    // Character layer base path
    CHAR_BASE: '/assets/sprites/characters/',
    CHAR_LAYER_ORDER: [
        { key: 'body',   folder: 'bodies'  },
        { key: 'head',   folder: 'heads'   },
        { key: 'hair',   folder: 'hair'    },
        { key: 'armor',  folder: 'armor'   },
        { key: 'weapon', folder: 'weapon'  },
        { key: 'acc',    folder: 'acc'     },
    ],

    // Object animation frame clock
    OBJ_ANIM_CLOCK: {},
    OBJ_ANIM_LAST: 0,

    init(Game) {
        const T = EngineRender;
        T._Game = Game;

        T.CANVAS = document.getElementById('gameCanvas');
        T.CTX    = T.CANVAS.getContext('2d');

        // Off-screen canvas for lighting
        T.LIGHT_CANVAS        = document.createElement('canvas');
        T.LIGHT_CANVAS.width  = T.CANVAS.width;
        T.LIGHT_CANVAS.height = T.CANVAS.height;
        T.LCTX = T.LIGHT_CANVAS.getContext('2d');

        // Expose canvas refs so legacy code (TILESET, getSprite) can use the same constants
        window.CANVAS       = T.CANVAS;
        window.CTX          = T.CTX;
        window.LIGHT_CANVAS = T.LIGHT_CANVAS;
        window.LCTX         = T.LCTX;
        window.TILE_SIZE    = T.TILE_SIZE;
    },

    // --- ANIMATED TILES ---
    resolveAnimTile(tileIdx) {
        const Game = EngineRender._Game;
        const anim = Game.map.animMap && Game.map.animMap[tileIdx];
        if (!anim) return tileIdx;
        const msPerFrame = 1000 / Math.max(1, Math.min(30, anim.fps || 4));
        const frameIdx   = Math.floor(Date.now() / msPerFrame) % anim.frames.length;
        return anim.frames[frameIdx];
    },

    // --- SPRITE DRAW HELPERS ---
    _drawCharLayers(wx, wy, appearance) {
        if (!appearance) return;
        const T     = EngineRender;
        const CTX   = T.CTX;
        const TS    = T.TILE_SIZE;
        const w     = TS;
        const h     = TS * 2;
        const drawY = wy - TS;
        let anyDrawn = false;
        for (const layer of T.CHAR_LAYER_ORDER) {
            const filename = appearance[layer.key];
            if (!filename) continue;
            const url   = T.CHAR_BASE + layer.folder + '/' + filename + '.png';
            const entry = getSprite(url);
            if (entry && entry.loaded) {
                CTX.drawImage(entry.img, wx, drawY, w, h);
                anyDrawn = true;
            }
        }
        if (!anyDrawn) {
            CTX.fillStyle = 'rgba(187,134,252,0.25)';
            CTX.fillRect(wx + 4, wy + 4, w - 8, w - 8);
        }
    },

    _drawNameTag(wx, wy, label, color) {
        if (!label) return;
        const CTX = EngineRender.CTX;
        const TS  = EngineRender.TILE_SIZE;
        CTX.font = 'bold 9px Courier New';
        CTX.textAlign    = 'center';
        CTX.textBaseline = 'alphabetic';
        const tw = CTX.measureText(label).width;
        CTX.fillStyle = 'rgba(0,0,0,0.65)';
        CTX.fillRect(wx + TS/2 - tw/2 - 2, wy - 14, tw + 4, 11);
        CTX.fillStyle = color || '#ffffff';
        CTX.fillText(label, wx + TS / 2, wy - 5);
    },

    // --- LIGHTING ---
    drawLighting(camX, camY) {
        const T    = EngineRender;
        const Game = T._Game;
        const CTX  = T.CTX;
        const LCTX = T.LCTX;
        const TS   = T.TILE_SIZE;
        const dark = Game.map.ambientDark || 0;
        if (dark <= 0) return;

        // Step 1: Fill with darkness
        LCTX.clearRect(0, 0, T.LIGHT_CANVAS.width, T.LIGHT_CANVAS.height);
        LCTX.globalCompositeOperation = 'source-over';
        LCTX.fillStyle = `rgba(0, 0, 10, ${dark})`;
        LCTX.fillRect(0, 0, T.LIGHT_CANVAS.width, T.LIGHT_CANVAS.height);

        // Step 2: Punch holes for lights
        LCTX.globalCompositeOperation = 'destination-out';
        const t = Date.now();
        const objects = Game.map.objects || [];
        const flags   = Game.map.flags   || {};

        for (const obj of objects) {
            if (obj.type !== 'LIGHT') continue;
            if (obj.flagKey && flags[obj.flagKey] === false) continue;

            const cx = obj.x * TS + TS / 2 + camX;
            const cy = obj.y * TS + TS / 2 + camY;
            let radius = (obj.light && obj.light.radius ? obj.light.radius : 3) * TS;

            if (obj.light && obj.light.flicker) {
                const offset = obj.x * 1.7 + obj.y * 2.3;
                radius += Math.sin(t * 0.006 + offset) * 5
                        + Math.sin(t * 0.013 + offset * 0.5) * 2;
            }
            radius = Math.max(radius, TS * 0.5);

            const g = LCTX.createRadialGradient(cx, cy, 0, cx, cy, radius);
            g.addColorStop(0,   'rgba(0,0,0,1)');
            g.addColorStop(0.4, 'rgba(0,0,0,0.9)');
            g.addColorStop(0.8, 'rgba(0,0,0,0.4)');
            g.addColorStop(1,   'rgba(0,0,0,0)');
            LCTX.fillStyle = g;
            LCTX.beginPath();
            LCTX.arc(cx, cy, radius, 0, Math.PI * 2);
            LCTX.fill();
        }

        // Player personal light
        if (Game.myHero && dark > 0.2) {
            const px = Game.myHero.x * TS + TS / 2;
            const py = Game.myHero.y * TS + TS / 2;
            const pr = TS * (0.8 + dark * 0.8);
            const pg = LCTX.createRadialGradient(px, py, 0, px, py, pr);
            pg.addColorStop(0,   'rgba(0,0,0,0.6)');
            pg.addColorStop(1,   'rgba(0,0,0,0)');
            LCTX.fillStyle = pg;
            LCTX.beginPath();
            LCTX.arc(px, py, pr, 0, Math.PI * 2);
            LCTX.fill();
        }

        // Step 3: Composite onto main canvas
        LCTX.globalCompositeOperation = 'source-over';
        CTX.drawImage(T.LIGHT_CANVAS, 0, 0);

        // Step 4: Colored light halos
        CTX.globalCompositeOperation = 'screen';
        for (const obj of objects) {
            if (obj.type !== 'LIGHT') continue;
            if (obj.flagKey && flags[obj.flagKey] === false) continue;
            if (!obj.light || !obj.light.color) continue;

            const cx = obj.x * TS + TS / 2 + camX;
            const cy = obj.y * TS + TS / 2 + camY;
            const radius = (obj.light.radius || 3) * TS * 0.7;

            const col = obj.light.color || '#ff8833';
            const r  = parseInt(col.slice(1,3), 16);
            const rg = parseInt(col.slice(3,5), 16);
            const b2 = parseInt(col.slice(5,7), 16);

            const g2 = CTX.createRadialGradient(cx, cy, 0, cx, cy, radius);
            g2.addColorStop(0,   `rgba(${r},${rg},${b2},0.25)`);
            g2.addColorStop(0.5, `rgba(${r},${rg},${b2},0.08)`);
            g2.addColorStop(1,   `rgba(${r},${rg},${b2},0)`);
            CTX.fillStyle = g2;
            CTX.beginPath();
            CTX.arc(cx, cy, radius, 0, Math.PI * 2);
            CTX.fill();
        }
        CTX.globalCompositeOperation = 'source-over';
    },

    // --- MAIN DRAW ---
    draw(Game) {
        const T    = EngineRender;
        const CTX  = T.CTX;
        const TS   = T.TILE_SIZE;

        CTX.fillStyle = '#050505';
        CTX.fillRect(0, 0, T.CANVAS.width, T.CANVAS.height);

        // Camera
        const hero = Game.myHero;
        const camX = hero ? Math.round(T.CANVAS.width  / 2 - hero.x * TS - TS / 2) : 0;
        const camY = hero ? Math.round(T.CANVAS.height / 2 - hero.y * TS - TS / 2) : 0;
        CTX.save();
        CTX.translate(camX, camY);

        // Layer 1: Terrain tiles
        for (let i = 0; i < Game.map.tiles.length; i++) {
            const rawIdx  = Game.map.tiles[i] || 0;
            const tileIdx = T.resolveAnimTile(rawIdx);
            const dx = (i % Game.map.width)            * TS;
            const dy = Math.floor(i / Game.map.width)  * TS;

            if (TILESET.loaded) {
                const col = tileIdx % TILESET.cols;
                const row = Math.floor(tileIdx / TILESET.cols);
                CTX.imageSmoothingEnabled = false;
                CTX.drawImage(TILESET.img,
                    col * TS, row * TS, TS, TS,
                    dx, dy, TS, TS);
            } else {
                CTX.fillStyle = T.COLORS[tileIdx] || '#ff00ff';
                CTX.fillRect(dx, dy, TS, TS);
                CTX.strokeStyle = 'rgba(0,0,0,0.15)';
                CTX.strokeRect(dx, dy, TS, TS);
            }
        }

        // Z-sorted world draw
        const flags   = Game.map.flags   || {};
        const objects = Game.map.objects  || [];
        const now     = Date.now();

        // Advance per-object animation clocks
        if (objects.length) {
            const delta = now - T.OBJ_ANIM_LAST;
            T.OBJ_ANIM_LAST = now;
            for (const obj of objects) {
                if (!obj.anim_frames || obj.anim_frames.length < 2) continue;
                const key = obj.x + ',' + obj.y;
                if (!T.OBJ_ANIM_CLOCK[key]) T.OBJ_ANIM_CLOCK[key] = { frame: 0, acc: 0 };
                const clk = T.OBJ_ANIM_CLOCK[key];
                if (obj.flagKey && flags[obj.flagKey] !== undefined) {
                    clk.frame = flags[obj.flagKey] ? 1 : 0;
                } else {
                    const fps = obj.anim_fps || 6;
                    clk.acc += delta;
                    if (clk.acc >= 1000 / fps) {
                        clk.acc = 0;
                        clk.frame = (clk.frame + 1) % obj.anim_frames.length;
                    }
                }
            }
        }

        // Event icons
        if (Array.isArray(Game.map.events)) {
            CTX.font = '16px sans-serif';
            CTX.textAlign    = 'center';
            CTX.textBaseline = 'middle';
            for (const ev of Game.map.events) {
                const icon = T.EVENT_ICONS[ev.type];
                if (icon) CTX.fillText(icon, ev.x * TS + 16, ev.y * TS + 16);
            }
        }

        // Build unified draw list
        const drawList = [];

        for (const obj of objects) {
            const h = obj.sprite_h || TS;
            drawList.push({ kind: 'obj', sortY: obj.y * TS + h, data: obj });
        }
        for (const npc of Object.values(Game.npcs || {})) {
            drawList.push({ kind: 'npc', sortY: npc.y * TS + TS, data: npc });
        }
        for (const p of Object.values(Game.players)) {
            drawList.push({ kind: 'player', sortY: p.y * TS + TS, data: p });
        }

        drawList.sort((a, b) => a.sortY - b.sortY);

        CTX.save();
        CTX.imageSmoothingEnabled = false;

        for (const entry of drawList) {

            // -- OBJECT --
            if (entry.kind === 'obj') {
                const obj = entry.data;
                const ox  = obj.x * TS;
                const oy  = obj.y * TS;
                const sw  = obj.sprite_w || TS;
                const sh  = obj.sprite_h || TS;
                const drawY = oy - (sh - TS);

                const isLightOff = obj.type === 'LIGHT' && obj.flagKey && flags[obj.flagKey] === false;
                if (isLightOff) CTX.globalAlpha = 0.3;

                let spriteUrl = obj.sprite_url || null;
                if (obj.anim_frames && obj.anim_frames.length) {
                    const key = obj.x + ',' + obj.y;
                    const fi  = T.OBJ_ANIM_CLOCK[key]?.frame || 0;
                    spriteUrl = obj.anim_frames[fi] || spriteUrl;
                }

                if (spriteUrl) {
                    const spr = getSprite(spriteUrl);
                    if (spr && spr.loaded) {
                        CTX.drawImage(spr.img, ox + (TS - sw) / 2, drawY, sw, sh);
                    } else if (!spr || !spr.error) {
                        CTX.strokeStyle = 'rgba(187,134,252,0.5)';
                        CTX.strokeRect(ox + 1, oy + 1, TS - 2, TS - 2);
                    } else {
                        CTX.strokeStyle = 'rgba(248,81,73,0.7)';
                        CTX.strokeRect(ox + 1, oy + 1, sw - 2, sh - 2);
                        CTX.beginPath();
                        CTX.moveTo(ox + 4, oy + 4); CTX.lineTo(ox + sw - 4, oy + sh - 4);
                        CTX.moveTo(ox + sw - 4, oy + 4); CTX.lineTo(ox + 4, oy + sh - 4);
                        CTX.stroke();
                    }
                } else if (obj.icon) {
                    CTX.font = '22px sans-serif';
                    CTX.textAlign    = 'center';
                    CTX.textBaseline = 'middle';
                    CTX.fillText(obj.icon, ox + TS / 2, oy + TS / 2);
                }

                if (isLightOff) CTX.globalAlpha = 1;

            // -- NPC --
            } else if (entry.kind === 'npc') {
                const npc = entry.data;
                const nx  = npc.x * TS;
                const ny  = npc.y * TS;
                const app = npc.appearance || null;

                if (app && Object.values(app).some(v => v && typeof v === 'string')) {
                    T._drawCharLayers(nx, ny, app);
                } else {
                    CTX.fillStyle = 'rgba(0,0,0,0.35)';
                    CTX.fillRect(nx + 4, ny + 4, TS - 2, TS - 2);
                    CTX.font = '22px sans-serif';
                    CTX.textAlign    = 'center';
                    CTX.textBaseline = 'middle';
                    CTX.fillText(npc.icon || '👤', nx + TS / 2, ny + TS / 2);
                }
                T._drawNameTag(nx, ny, npc.name, '#88ff88');

            // -- PLAYER --
            } else if (entry.kind === 'player') {
                const p   = entry.data;
                const px  = p.x * TS;
                const py  = p.y * TS;
                const isMe = p.charId === Game.myCharId;
                const app  = p.appearance || null;

                if (app && Object.values(app).some(v => v && typeof v === 'string')) {
                    T._drawCharLayers(px, py, app);
                } else {
                    CTX.fillStyle = 'rgba(0,0,0,0.3)';
                    CTX.fillRect(px + 4, py + 4, TS, TS);
                    CTX.fillStyle   = isMe ? '#ffffff' : '#00ffff';
                    CTX.fillRect(px, py, TS, TS);
                    CTX.strokeStyle = isMe ? '#ffcc00' : '#008888';
                    CTX.lineWidth   = isMe ? 2 : 1;
                    CTX.strokeRect(px, py, TS, TS);
                    CTX.lineWidth   = 1;
                }
                const nameColor = isMe ? '#ffcc00' : '#00ffff';
                T._drawNameTag(px, py, p.name, nameColor);
            }
        }

        CTX.restore(); // end imageSmoothingEnabled save

        // Layer 5: Lighting overlay
        CTX.restore(); // end camera transform
        T.drawLighting(camX, camY);

        // Arena zone visual overlay
        if (Game.inArena) {
            const pulse = 0.08 + Math.sin(Date.now() * 0.002) * 0.04;
            const grad = CTX.createRadialGradient(
                T.CANVAS.width / 2, T.CANVAS.height / 2, T.CANVAS.height * 0.3,
                T.CANVAS.width / 2, T.CANVAS.height / 2, T.CANVAS.height * 0.85
            );
            grad.addColorStop(0, 'rgba(180,20,20,0)');
            grad.addColorStop(1, `rgba(180,20,20,${pulse})`);
            CTX.fillStyle = grad;
            CTX.fillRect(0, 0, T.CANVAS.width, T.CANVAS.height);
        }
    }
};
