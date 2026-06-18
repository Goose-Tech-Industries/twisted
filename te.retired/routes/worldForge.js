// =================================================================
// WORLD FORGE — AI-powered world content generator
// POST /admin/world-forge/generate  → calls Gemini, returns JSON preview
// POST /admin/world-forge/commit    → writes approved JSON to DB
// =================================================================
const express = require('express');
const router  = express.Router();

let db;
router.init = (databaseConnection) => { db = databaseConnection; };

// ---------------------------------------------------------------
// Auth middleware (re-use the pattern from admin.js)
// ---------------------------------------------------------------
async function requireStaff(req, res, next) {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated.' });
    try {
        const [rows] = await db.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
        if (!rows.length || !['ADMIN', 'GM', 'STAFF', 'OWNER'].includes(rows[0].role)) {
            return res.status(403).json({ success: false, message: 'Staff only.' });
        }
        req.staffRole = rows[0].role;
        next();
    } catch (e) {
        return res.status(500).json({ success: false, message: 'Auth error.' });
    }
}

// ---------------------------------------------------------------
// GEMINI CALLER  (falls back to Ollama if no Gemini key)
// ---------------------------------------------------------------
// Rate limit tracking per provider
if (!global._aiRateTracker) global._aiRateTracker = { lastCall: 0, callCount: 0, resetAt: 0 };

// Model-based rate limits (requests per minute)
const RATE_LIMITS = {
    'gemini-1.5-flash': 15,      // Free tier
    'gemini-1.5-pro': 2,         // Free tier
    'gemini-2.0-flash': 15,      // Free tier
    'default-gemini': 15,        // Unknown model fallback
    'anthropic': 50,              // Claude API default
    'openai': 50,
    'ollama': 999,               // No limit for local
    'openai': 60,                // Paid tier
};

function getModelRateLimit(model) {
    return RATE_LIMITS[model] || RATE_LIMITS['default-gemini'];
}

async function waitForRateLimit(model) {
    const tracker = global._aiRateTracker;
    const rpm = getModelRateLimit(model);
    const minInterval = Math.ceil(60000 / rpm); // ms between calls

    const now = Date.now();
    // Reset counter every minute
    if (now > tracker.resetAt) {
        tracker.callCount = 0;
        tracker.resetAt = now + 60000;
    }

    // If we've hit the limit, wait
    if (tracker.callCount >= rpm) {
        const waitMs = tracker.resetAt - now;
        if (waitMs > 0) {
            console.log(`[WorldForge] Rate limited (${rpm} RPM for ${model}), waiting ${Math.ceil(waitMs/1000)}s...`);
            await new Promise(r => setTimeout(r, waitMs + 1000));
            tracker.callCount = 0;
            tracker.resetAt = Date.now() + 60000;
        }
    }

    // Enforce minimum interval between calls
    const elapsed = now - tracker.lastCall;
    if (elapsed < minInterval) {
        await new Promise(r => setTimeout(r, minInterval - elapsed));
    }

    tracker.lastCall = Date.now();
    tracker.callCount++;
}

async function callAI(prompt) {
    let dbApiKey = '', dbModel = '', dbProvider = '';
    if (db) {
        try {
            // Check system_settings first, then game_settings overrides
            const [sysRows] = await db.query(
                "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('ai_provider','ai_api_key','ai_model')").catch(() => [[]]);
            for (const r of (sysRows || [])) {
                if (r.setting_key === 'ai_api_key') dbApiKey = r.setting_value;
                if (r.setting_key === 'ai_model') dbModel = r.setting_value;
                if (r.setting_key === 'ai_provider') dbProvider = r.setting_value;
            }
            const [gameRows] = await db.query(
                "SELECT setting_key, setting_value FROM game_settings WHERE setting_key IN ('ai_provider','ai_api_key','ai_model')").catch(() => [[]]);
            for (const r of (gameRows || [])) {
                if (r.setting_key === 'ai_api_key') dbApiKey = r.setting_value || dbApiKey;
                if (r.setting_key === 'ai_model') dbModel = r.setting_value || dbModel;
                if (r.setting_key === 'ai_provider') dbProvider = r.setting_value || dbProvider;
            }
        } catch {}
    }

    // Anthropic / Claude
    if (dbProvider === 'anthropic' && dbApiKey) {
        const model = dbModel || 'claude-haiku-4-5-20251001';
        await waitForRateLimit('anthropic');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': dbApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: 8192,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            throw new Error(`Anthropic HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const json = await res.json();
        const text = json?.content?.[0]?.text || '';
        return cleanJSON(text);
    }

    // OpenAI / OpenAI-compatible
    if (dbProvider === 'openai' && dbApiKey) {
        const model = dbModel || 'gpt-4o-mini';
        await waitForRateLimit('openai');
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${dbApiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 8192 })
        });
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            throw new Error(`OpenAI HTTP ${res.status}: ${err.slice(0, 200)}`);
        }
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content || '';
        return cleanJSON(text);
    }

    // Gemini
    const geminiKey = dbApiKey || process.env.GEMINI_API_KEY;
    if (geminiKey && (dbProvider === 'gemini' || dbProvider === '' || !dbProvider || process.env.GEMINI_API_KEY)) {
        const model = dbModel || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

        // Wait for rate limit before calling
        await waitForRateLimit(model);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        let retries = 0;
        while (retries < 3) {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.9, maxOutputTokens: 8192 }
                })
            });
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('Retry-After') || '30');
                console.log(`[WorldForge] Gemini 429 — waiting ${retryAfter}s (retry ${retries + 1}/3)`);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                retries++;
                continue;
            }
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 200)}`);
            }
            const json = await res.json();
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return cleanJSON(text);
        }
        throw new Error('Gemini rate limit exceeded after 3 retries. Wait a minute and try again.');
    }

    // Ollama fallback
    if (process.env.NPC_LLM_URL) {
        await waitForRateLimit('ollama');
        const model = process.env.NPC_LLM_MODEL || 'llama3';
        const res = await fetch(process.env.NPC_LLM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false })
        });
        if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
        const json = await res.json();
        return cleanJSON(String(json.response || json.text || ''));
    }

    throw new Error('No AI provider configured. Set GEMINI_API_KEY or NPC_LLM_URL in .env, or configure in AdminSauce Settings.');
}

// Strip markdown fences, extract JSON object or array
function cleanJSON(raw) {
    let s = raw.trim();
    s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    // Find first { or [
    const start = Math.min(
        s.indexOf('{') === -1 ? Infinity : s.indexOf('{'),
        s.indexOf('[') === -1 ? Infinity : s.indexOf('[')
    );
    if (start === Infinity) throw new Error('No JSON found in AI response');
    s = s.slice(start);
    // Find matching close
    const open = s[0], close = open === '{' ? '}' : ']';
    let depth = 0, end = -1, inString = false, escaped = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === open) depth++;
        else if (c === close) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('Unterminated JSON in AI response');
    let jsonStr = s.slice(0, end + 1);

    // Sanitize common AI JSON issues:
    // 1. Literal newlines inside string values → \n
    // 2. Unescaped control characters
    // 3. Trailing commas before } or ]
    jsonStr = jsonStr.replace(/[\x00-\x1f]/g, (ch) => {
        if (ch === '\n') return '\\n';
        if (ch === '\r') return '\\r';
        if (ch === '\t') return '\\t';
        return '';
    });
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1'); // trailing commas

    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        // Last resort: try to fix common quote issues
        try {
            jsonStr = jsonStr.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');
            return JSON.parse(jsonStr);
        } catch {
            throw new Error(`Bad escaped character in JSON at position ${e.message.match(/position (\d+)/)?.[1] || '?'}`);
        }
    }
}

// ---------------------------------------------------------------
// PROCEDURAL TILE GENERATORS (server-side)
// ---------------------------------------------------------------
function generateDungeonTiles(w, h) {
    const tiles = new Array(w * h).fill(1);
    const rooms = [];
    function splitBSP(x, y, rw, rh, depth) {
        if (depth <= 0 || rw < 8 || rh < 8) {
            const roomW = Math.max(3, Math.floor(Math.random() * (rw - 4)) + 3);
            const roomH = Math.max(3, Math.floor(Math.random() * (rh - 4)) + 3);
            const rx = x + Math.floor(Math.random() * (rw - roomW - 1)) + 1;
            const ry = y + Math.floor(Math.random() * (rh - roomH - 1)) + 1;
            for (let dy = 0; dy < roomH; dy++)
                for (let dx = 0; dx < roomW; dx++)
                    tiles[(ry + dy) * w + (rx + dx)] = 0;
            rooms.push({ x: rx, y: ry, w: roomW, h: roomH });
            return;
        }
        if (rw > rh) {
            const split = Math.floor(rw * 0.3 + Math.random() * rw * 0.4);
            splitBSP(x, y, split, rh, depth - 1);
            splitBSP(x + split, y, rw - split, rh, depth - 1);
        } else {
            const split = Math.floor(rh * 0.3 + Math.random() * rh * 0.4);
            splitBSP(x, y, rw, split, depth - 1);
            splitBSP(x, y + split, rw, rh - split, depth - 1);
        }
    }
    splitBSP(0, 0, w, h, 4);
    for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i-1], b = rooms[i];
        let cx = Math.floor(a.x + a.w/2), cy = Math.floor(a.y + a.h/2);
        const bx = Math.floor(b.x + b.w/2), by = Math.floor(b.y + b.h/2);
        while (cx !== bx) { tiles[cy * w + cx] = 0; cx += cx < bx ? 1 : -1; }
        while (cy !== by) { tiles[cy * w + cx] = 0; cy += cy < by ? 1 : -1; }
    }
    return tiles;
}

function generateCaveTiles(w, h) {
    let tiles = new Array(w * h).fill(0);
    for (let i = 0; i < tiles.length; i++) {
        const x = i % w, y = Math.floor(i / w);
        tiles[i] = (x === 0 || x === w-1 || y === 0 || y === h-1) ? 1 : (Math.random() < 0.45 ? 1 : 0);
    }
    for (let iter = 0; iter < 5; iter++) {
        const next = [...tiles];
        for (let y = 1; y < h-1; y++) {
            for (let x = 1; x < w-1; x++) {
                let walls = 0;
                for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++)
                        if (tiles[(y+dy)*w+(x+dx)] === 1) walls++;
                next[y*w+x] = walls >= 5 ? 1 : 0;
            }
        }
        tiles = next;
    }
    return tiles;
}

function generateMazeTiles(w, h) {
    const tiles = new Array(w * h).fill(1);
    const mw = Math.floor((w-1)/2), mh = Math.floor((h-1)/2);
    const visited = new Array(mw * mh).fill(false);
    const stack = [];
    function carve(mx, my) { visited[my*mw+mx] = true; tiles[(my*2+1)*w+(mx*2+1)] = 0; }
    function neighbors(mx, my) {
        return [[0,-1],[0,1],[-1,0],[1,0]].map(([dx,dy]) => ({x:mx+dx,y:my+dy}))
            .filter(n => n.x>=0 && n.x<mw && n.y>=0 && n.y<mh && !visited[n.y*mw+n.x]);
    }
    carve(0,0); stack.push(0);
    while (stack.length) {
        const ci = stack[stack.length-1], cx = ci%mw, cy = Math.floor(ci/mw);
        const ns = neighbors(cx, cy);
        if (!ns.length) { stack.pop(); continue; }
        const n = ns[Math.floor(Math.random()*ns.length)];
        tiles[(cy*2+1+(n.y-cy))*w+(cx*2+1+(n.x-cx))] = 0;
        carve(n.x, n.y); stack.push(n.y*mw+n.x);
    }
    return tiles;
}

// ---------------------------------------------------------------
// TOWN TILE GENERATOR — creates a real town layout from NPC/shop data
// ---------------------------------------------------------------

// Tile IDs from game_tile_types
const T = {
    GRASS: 0, WALL: 1, WATER: 2, DIRT: 3, STONE: 4, WOOD: 5, ROCK: 6,
    FOREST: 11, MOSS: 12, MEADOW: 14, FARMLAND: 15, HEDGE: 16,
    COBBLESTONE: 21, BRICK: 24, RUIN: 25,
    WOOD_FLOOR: 51, PLANK_FLOOR: 52, TAVERN_FLOOR: 56,
    CORRUPTED: 61, SHADOW: 64, DRUID_GROVE: 68,
    DIRT_PATH: 71, STONE_ROAD: 72, GRAVEL: 73, BOARDWALK: 74,
    SWAMP: 13, MARSH: 19, BOG: 20,
    SHALLOW_WATER: 32,
};

// Biome palettes — what ground/edge/accent tiles each biome uses
const BIOME_PALETTES = {
    'dark forest':          { ground: T.MOSS,     path: T.DIRT_PATH,  road: T.COBBLESTONE, edge: T.FOREST,  accent: T.DRUID_GROVE, building: T.WOOD_FLOOR, wall: T.WALL,  water: T.WATER },
    'coastal village':      { ground: T.GRASS,    path: T.GRAVEL,     road: T.COBBLESTONE, edge: T.MEADOW,  accent: T.SHALLOW_WATER, building: T.PLANK_FLOOR, wall: T.WALL, water: T.WATER },
    'mountain settlement':  { ground: T.STONE,    path: T.GRAVEL,     road: T.STONE_ROAD,  edge: T.ROCK,    accent: T.GRASS,  building: T.STONE,      wall: T.ROCK,  water: T.WATER },
    'swamp hamlet':         { ground: T.MARSH,    path: T.BOARDWALK,  road: T.BOARDWALK,   edge: T.SWAMP,   accent: T.BOG,    building: T.PLANK_FLOOR, wall: T.HEDGE, water: T.SWAMP },
    'desert outpost':       { ground: T.DIRT,     path: T.DIRT_PATH,  road: T.STONE_ROAD,  edge: T.DIRT,    accent: T.RUIN,   building: T.STONE,      wall: T.BRICK, water: T.WATER },
    'underground cavern':   { ground: T.STONE,    path: T.GRAVEL,     road: T.STONE_ROAD,  edge: T.ROCK,    accent: T.MOSS,   building: T.STONE,      wall: T.ROCK,  water: T.WATER },
    'haunted ruins':        { ground: T.CORRUPTED,path: T.COBBLESTONE,road: T.COBBLESTONE, edge: T.SHADOW,  accent: T.RUIN,   building: T.STONE,      wall: T.BRICK, water: T.WATER },
    'volcanic highlands':   { ground: T.DIRT,     path: T.GRAVEL,     road: T.STONE_ROAD,  edge: T.ROCK,    accent: T.CORRUPTED, building: T.STONE,   wall: T.ROCK,  water: T.WATER },
};

function getDefaultPalette() {
    return { ground: T.GRASS, path: T.DIRT_PATH, road: T.COBBLESTONE, edge: T.FOREST, accent: T.MEADOW, building: T.WOOD_FLOOR, wall: T.WALL, water: T.WATER };
}

function generateTownTiles(w, h, npcs, shops, biome) {
    const pal = BIOME_PALETTES[biome] || getDefaultPalette();
    const tiles = new Array(w * h).fill(pal.ground);

    // Helper to set tile safely
    const set = (x, y, t) => { if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = t; };
    const get = (x, y) => (x >= 0 && x < w && y >= 0 && y < h) ? tiles[y * w + x] : -1;

    // ── 1. Border: ring of edge tiles (forest/rock/etc) ──
    for (let x = 0; x < w; x++) { set(x, 0, pal.edge); set(x, h - 1, pal.edge); }
    for (let y = 0; y < h; y++) { set(0, y, pal.edge); set(w - 1, y, pal.edge); }
    // Scatter some edge tiles along the second ring too
    for (let x = 0; x < w; x++) {
        if (Math.random() < 0.5) set(x, 1, pal.edge);
        if (Math.random() < 0.5) set(x, h - 2, pal.edge);
    }
    for (let y = 0; y < h; y++) {
        if (Math.random() < 0.3) set(1, y, pal.edge);
        if (Math.random() < 0.3) set(w - 2, y, pal.edge);
    }

    // ── 2. Town center: a cobblestone plaza ──
    const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
    const plazaR = Math.floor(Math.min(w, h) / 8) + 1;
    for (let dy = -plazaR; dy <= plazaR; dy++) {
        for (let dx = -plazaR; dx <= plazaR; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= plazaR + 1) {
                set(cx + dx, cy + dy, pal.road);
            }
        }
    }

    // ── 3. Collect all important positions (NPCs, shops) ──
    const allNpcs = [...(npcs || [])];
    const points = allNpcs
        .filter(n => !n.is_enemy)
        .map(n => ({ x: n.x || 5, y: n.y || 5, isShop: !!n.shop_name }));

    // Also add the center as a point
    points.push({ x: cx, y: cy, isShop: false });

    // ── 4. Build roads connecting all NPC positions to the town center ──
    for (const pt of points) {
        let px = pt.x, py = pt.y;
        // Clamp to map bounds (leave 2-tile border)
        px = Math.max(2, Math.min(w - 3, px));
        py = Math.max(2, Math.min(h - 3, py));

        // Draw L-shaped road from pt to center
        let rx = px, ry = py;
        while (rx !== cx) {
            set(rx, ry, pal.path);
            // Widen the road by 1 tile
            if (ry > 0) set(rx, ry - 1, get(rx, ry - 1) === pal.road ? pal.road : pal.path);
            rx += rx < cx ? 1 : -1;
        }
        while (ry !== cy) {
            set(rx, ry, pal.path);
            if (rx > 0) set(rx - 1, ry, get(rx - 1, ry) === pal.road ? pal.road : pal.path);
            ry += ry < cy ? 1 : -1;
        }
    }

    // ── 5. Place building footprints around NPC/shop positions ──
    for (const pt of points) {
        if (pt.x === cx && pt.y === cy) continue; // skip center

        const bx = Math.max(3, Math.min(w - 5, pt.x));
        const by = Math.max(3, Math.min(h - 5, pt.y));

        // Building size: shops are bigger
        const bw = pt.isShop ? 4 : 3;
        const bh = pt.isShop ? 4 : 3;

        // Walls around the building
        for (let dx = -1; dx <= bw; dx++) {
            set(bx + dx, by - 1, pal.wall);     // top wall
            set(bx + dx, by + bh, pal.wall);     // bottom wall
        }
        for (let dy = 0; dy < bh; dy++) {
            set(bx - 1, by + dy, pal.wall);      // left wall
            set(bx + bw, by + dy, pal.wall);      // right wall
        }

        // Interior floor
        for (let dy = 0; dy < bh; dy++) {
            for (let dx = 0; dx < bw; dx++) {
                set(bx + dx, by + dy, pt.isShop ? T.TAVERN_FLOOR : pal.building);
            }
        }

        // Door opening (bottom center, remove one wall tile)
        set(bx + Math.floor(bw / 2), by + bh, pal.path);
    }

    // ── 6. Scatter accent features ──
    // Water feature near plaza
    const waterX = cx + plazaR + 2, waterY = cy;
    if (waterX < w - 3) {
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                if (get(waterX + dx, waterY + dy) === pal.ground) {
                    set(waterX + dx, waterY + dy, pal.water);
                }
            }
        }
    }

    // Scatter trees/accent on remaining grass tiles
    for (let i = 0; i < tiles.length; i++) {
        if (tiles[i] === pal.ground) {
            const x = i % w, y = Math.floor(i / w);
            if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) continue;
            const r = Math.random();
            if (r < 0.06) tiles[i] = pal.edge;       // tree/rock cluster
            else if (r < 0.10) tiles[i] = pal.accent; // accent feature
            else if (r < 0.13) tiles[i] = T.MEADOW;   // wildflowers
        }
    }

    // ── 7. Farmland patches on the outskirts ──
    const farmCount = Math.floor(Math.random() * 2) + 1;
    for (let f = 0; f < farmCount; f++) {
        const fx = Math.random() < 0.5 ? 3 + Math.floor(Math.random() * 4) : w - 7 + Math.floor(Math.random() * 4);
        const fy = Math.random() < 0.5 ? 3 + Math.floor(Math.random() * 4) : h - 7 + Math.floor(Math.random() * 4);
        const fw = 3 + Math.floor(Math.random() * 3);
        const fh = 2 + Math.floor(Math.random() * 2);
        for (let dy = 0; dy < fh; dy++) {
            for (let dx = 0; dx < fw; dx++) {
                if (get(fx + dx, fy + dy) === pal.ground || get(fx + dx, fy + dy) === pal.accent) {
                    set(fx + dx, fy + dy, T.FARMLAND);
                }
            }
        }
    }

    return tiles;
}

// ---------------------------------------------------------------
// PROMPT BUILDERS
// ---------------------------------------------------------------
const SHARED_RULES = `
RULES — CRITICAL:
- Respond with ONLY a valid JSON object. No markdown. No explanation. No text outside the JSON.
- All string values must be escaped properly.
- Use plain emoji for all "icon" fields (1 character).
- Keep all text concise but evocative. Dark Celtic fantasy tone.
- Never use quotes inside quotes without escaping.
`;

function promptTown({ biome, size, theme }) {
    const npcCount  = size === 'hamlet' ? 3 : size === 'village' ? 5 : size === 'town' ? 7 : 10;
    const shopCount = size === 'hamlet' ? 1 : size === 'village' ? 2 : 3;
    return `${SHARED_RULES}
You are a game world generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate a ${size} (${biome} biome) with the theme: "${theme}".

Return a JSON object with this EXACT structure:
{
  "map": {
    "name": "...",
    "description": "...",
    "width": 24,
    "height": 24,
    "ambient_dark": 0.3,
    "min_level": 1,
    "is_active": 1,
    "layout_type": "town",
    "biome": "${biome}"
  },
  "npcs": [
    {
      "name": "...",
      "icon": "👤",
      "persona": "...",
      "is_enemy": 0,
      "move_type": "STATIONARY",
      "x": 8, "y": 8,
      "shop_name": null,
      "quest_ids": []
    }
  ],
  "enemies": [
    {
      "name": "...",
      "icon": "👹",
      "persona": "...",
      "is_enemy": 1,
      "move_type": "WANDER",
      "x": 15, "y": 15,
      "drop_table_json": [{"item_id": null, "chance": 60, "min_qty": 1, "max_qty": 2}]
    }
  ],
  "shops": [
    {
      "name": "...",
      "icon": "🏪",
      "description": "...",
      "items": [
        {"name": "...", "icon": "...", "type": "WEAPON", "value": 120, "description": "...",
         "bonus_atk": 5, "bonus_def": 0, "bonus_hp": 0, "bonus_mp": 0,
         "bonus_mo": 0, "bonus_md": 0, "bonus_speed": 0, "bonus_luck": 0,
         "level_req": 1, "buy_price": 120, "sell_price": 40}
      ]
    }
  ],
  "quests": [
    {
      "quest_id": "...",
      "title": "...",
      "description": "...",
      "quest_type": "side",
      "required_level": 1,
      "is_repeatable": 0,
      "objectives_json": [{"type": "kill", "target": "...", "count": 5, "label": "Kill 5 ..."}],
      "rewards_json": {"xp": 200, "gold": 50, "items": []}
    }
  ]
}

Generate: ${npcCount} NPCs, 2-3 enemies, ${shopCount} shops with 3-5 items each, 2-3 quests.
Spread NPCs across different x/y positions (1-22 range). Make everything thematically consistent with: ${theme}.`;
}

function promptNPCs({ count, role, theme, is_enemy }) {
    const type = is_enemy ? 'enemy' : 'NPC';
    return `${SHARED_RULES}
You are a character generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate ${count} ${type}(s) with role "${role}" and theme "${theme}".

Return a JSON object:
{
  "npcs": [
    {
      "name": "...",
      "icon": "${is_enemy ? '👹' : '👤'}",
      "persona": "A 2-3 sentence description of their personality, history, and speech patterns.",
      "is_enemy": ${is_enemy ? 1 : 0},
      "move_type": "${is_enemy ? 'WANDER' : 'STATIONARY'}",
      "wander_radius": 3,
      "x": 5, "y": 5,
      "drop_table_json": ${is_enemy ? '[{"item_id": null, "chance": 50, "min_qty": 1, "max_qty": 1}]' : 'null'}
    }
  ]
}`;
}

function promptQuestChain({ theme, length, required_level }) {
    return `${SHARED_RULES}
You are a quest writer for a dark Celtic fantasy RPG called Twisted Engine.
Generate a quest chain of ${length} linked quests with theme "${theme}".
Each quest should build narratively on the previous one.

Return a JSON object:
{
  "quests": [
    {
      "quest_id": "qchain_${Date.now()}_1",
      "title": "...",
      "description": "2-3 sentence quest description with mystery and stakes.",
      "quest_type": "main",
      "required_level": ${required_level},
      "is_repeatable": 0,
      "objectives_json": [
        {"type": "kill", "target": "...", "count": 3, "label": "..."},
        {"type": "collect", "item": "...", "count": 1, "label": "..."}
      ],
      "rewards_json": {"xp": 300, "gold": 100, "items": []}
    }
  ]
}

The quest_ids should be sequential like qchain_TIMESTAMP_1, qchain_TIMESTAMP_2, etc.
Make the objectives escalate in difficulty across the chain.`;
}

function promptDungeon({ theme, size, floors }) {
    const w = size === 'small' ? 20 : size === 'medium' ? 30 : 40;
    const h = size === 'small' ? 16 : size === 'medium' ? 24 : 32;
    return `${SHARED_RULES}
You are a dungeon generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate a dungeon with the theme: "${theme}". Size: ${w}x${h}.

Return a JSON object:
{
  "map": {
    "name": "...",
    "description": "2-3 evocative sentences about this dungeon.",
    "width": ${w}, "height": ${h},
    "ambient_dark": 0.7,
    "min_level": 3,
    "is_active": 1,
    "layout_type": "dungeon",
    "fog_of_war": 1
  },
  "enemies": [
    {"name": "...", "icon": "👹", "persona": "Brief description.", "is_enemy": 1, "move_type": "WANDER", "x": 8, "y": 6,
     "drop_table_json": [{"item_id": null, "chance": 40, "min_qty": 1, "max_qty": 1}]}
  ],
  "npcs": [],
  "shops": [],
  "quests": [
    {"quest_id": "dungeon_${Date.now()}_1", "title": "...", "description": "...",
     "quest_type": "side", "required_level": 3, "is_repeatable": 0,
     "objectives_json": [{"type": "kill", "target": "...", "count": 5, "label": "..."}],
     "rewards_json": {"xp": 500, "gold": 200, "items": []}}
  ]
}

Generate: 4-6 enemies (spread across rooms, x range 2-${w-2}, y range 2-${h-2}), 1 boss enemy at the far end, 1-2 quests.
The dungeon layout will be auto-generated using BSP room generation. Theme: ${theme}`;
}

function promptFullWorld({ theme }) {
    return `${SHARED_RULES}
You are a world generator for a dark Celtic fantasy RPG called Twisted Engine.
Generate a COMPLETE starter world with the theme: "${theme}".

Return a JSON object with this EXACT structure:
{
  "map": {
    "name": "...",
    "description": "2-3 evocative sentences describing the location, its atmosphere, and dark secret.",
    "width": 30,
    "height": 30,
    "ambient_dark": 0.4,
    "min_level": 1,
    "is_active": 1,
    "layout_type": "town"
  },
  "npcs": [
    {
      "name": "...", "icon": "👤",
      "persona": "2-3 sentence persona with speech pattern hints.",
      "is_enemy": 0, "move_type": "STATIONARY", "x": 8, "y": 8
    }
  ],
  "enemies": [
    {
      "name": "...", "icon": "👹",
      "persona": "Brief description of this creature's nature.",
      "is_enemy": 1, "move_type": "WANDER", "x": 20, "y": 15,
      "drop_table_json": [{"item_id": null, "chance": 60, "min_qty": 1, "max_qty": 2}]
    }
  ],
  "shops": [
    {
      "name": "...", "icon": "🏪", "description": "...",
      "items": [
        {"name": "...", "icon": "⚔️", "type": "WEAPON", "description": "...", "value": 150,
         "bonus_atk": 8, "bonus_def": 0, "bonus_hp": 0, "bonus_mp": 0,
         "bonus_mo": 0, "bonus_md": 0, "bonus_speed": 0, "bonus_luck": 0,
         "level_req": 1, "buy_price": 150, "sell_price": 50}
      ]
    }
  ],
  "quests": [
    {
      "quest_id": "starter_${Date.now()}_1",
      "title": "...", "description": "...",
      "quest_type": "main", "required_level": 1, "is_repeatable": 0,
      "objectives_json": [{"type": "kill", "target": "...", "count": 5, "label": "..."}],
      "rewards_json": {"xp": 250, "gold": 75, "items": []}
    }
  ]
}

Generate: 5 NPCs, 3 enemies, 2 shops with 4-5 items each, 3 quests.
Make EVERYTHING thematically unified and narratively interesting. Theme: ${theme}`;
}

// ---------------------------------------------------------------
// GENERATE ENDPOINT
// ---------------------------------------------------------------
router.post('/generate', requireStaff, async (req, res) => {
    const { mode, params } = req.body;
    if (!mode || !params) return res.json({ success: false, message: 'Missing mode or params.' });

    // Inject lore bible into all prompts
    const loreBible = (req.body.loreBible || '').trim();
    const LORE_PREFIX = loreBible
        ? `\nWORLD LORE (CRITICAL — use this as canonical truth for all generated content):\n${loreBible}\n`
        : '';

    let prompt;
    try {
        // If a custom prompt is provided, use it directly
        if (req.body.customPrompt) {
            prompt = LORE_PREFIX + req.body.customPrompt;
            const data = await callAI(prompt);
            return res.json({ success: true, data, mode: 'custom' });
        }
        switch (mode) {
            case 'town':        prompt = promptTown(params); prompt = LORE_PREFIX + prompt;            break;
            case 'npcs':        prompt = promptNPCs(params); prompt = LORE_PREFIX + prompt;            break;
            case 'quest_chain': prompt = promptQuestChain(params); prompt = LORE_PREFIX + prompt;      break;
            case 'full_world':  prompt = promptFullWorld(params); prompt = LORE_PREFIX + prompt;       break;
            case 'dungeon':     prompt = promptDungeon(params); prompt = LORE_PREFIX + prompt;       break;
            case 'custom':      prompt = LORE_PREFIX + (req.body.customPrompt || params.prompt || ''); break;
            default: return res.json({ success: false, message: `Unknown mode: ${mode}` });
        }
        const data = await callAI(prompt);
        res.json({ success: true, data, mode });
    } catch (err) {
        console.error('[WorldForge] Generate error:', err.message);
        res.json({
            success: false,
            message: err.message,
            isRateLimit: err.isRateLimit || false
        });
    }
});

// ---------------------------------------------------------------
// COMMIT ENDPOINT — writes approved data to DB in dependency order
// ---------------------------------------------------------------
router.post('/commit', requireStaff, async (req, res) => {
    const { data, mode, targetMapId, loreBible } = req.body;
    if (!data) return res.json({ success: false, message: 'No data to commit.' });

    const conn = await db.getConnection();
    const log  = [];
    try {
        await conn.beginTransaction();

        // 1. MAP
        let mapId = targetMapId || null;
        if (data.map && !targetMapId) {
            const w = data.map.width || 24;
            const h = data.map.height || 24;
            // Generate tile layout if not provided
            const layout = data.map.layout_type || 'empty';
            let tilesJson = data.map.tiles_json || null;
            if (!tilesJson) {
                let tiles;
                if (layout === 'dungeon') tiles = generateDungeonTiles(w, h);
                else if (layout === 'cave') tiles = generateCaveTiles(w, h);
                else if (layout === 'maze') tiles = generateMazeTiles(w, h);
                else if (mode === 'town' || mode === 'full_world' || layout === 'town') {
                    // Generate a real town with buildings, roads, and features
                    const biome = req.body.params?.biome || data.map.biome || 'dark forest';
                    tiles = generateTownTiles(w, h, [...(data.npcs || []), ...(data.enemies || [])], data.shops || [], biome);
                }
                else tiles = new Array(w * h).fill(0);
                // Build passability layer from tile types
                // Impassable tiles: WALL(1), WATER(2), ROCK(6), HEDGE(16), BRICK(24), and underground walls
                const IMPASSABLE = new Set([1, 2, 6, 7, 16, 24, 31, 33, 35, 36, 38, 40, 44, 47, 49, 50]);
                const pass = tiles.map(t => IMPASSABLE.has(t) ? 1 : 0);
                tilesJson = JSON.stringify([tiles, new Array(w*h).fill(-1), pass, new Array(w*h).fill(-1), new Array(w*h).fill(0)]);
            }
            const [mr] = await conn.query('INSERT INTO game_maps SET ?', [{
                name:          data.map.name        || 'Generated Map',
                description:   data.map.description || '',
                width:         w,
                height:        h,
                tiles_json:    tilesJson,
                ambient_dark:  data.map.ambient_dark || 0,
                min_level:     data.map.min_level    || 1,
                is_active:     data.map.is_active    ?? 1,
                region_id:     data.map.region_id    || null,
                fog_of_war:    data.map.fog_of_war   || 0,
            }]);
            mapId = mr.insertId;
            log.push(`✅ Map created: "${data.map.name}" (id: ${mapId}) [${layout !== 'empty' ? layout + ' layout' : 'empty'}]`);
        }

        // 2. ITEMS (from shop definitions) — insert first so we have their IDs
        const itemIdMap = {}; // name → db id
        if (data.shops) {
            for (const shop of data.shops) {
                if (!shop.items) continue;
                for (const item of shop.items) {
                    const [ir] = await conn.query('INSERT INTO game_items SET ?', [{
                        name:         item.name        || 'Item',
                        description:  item.description || '',
                        type:         item.type        || 'MISC',
                        icon:         item.icon        || '📦',
                        value:        item.value       || 0,
                        bonus_hp:     item.bonus_hp    || 0,
                        bonus_mp:     item.bonus_mp    || 0,
                        bonus_atk:    item.bonus_atk   || 0,
                        bonus_def:    item.bonus_def   || 0,
                        bonus_mo:     item.bonus_mo    || 0,
                        bonus_md:     item.bonus_md    || 0,
                        bonus_speed:  item.bonus_speed || 0,
                        bonus_luck:   item.bonus_luck  || 0,
                        level_req:    item.level_req   || 1,
                    }]);
                    itemIdMap[item.name] = ir.insertId;
                    log.push(`  📦 Item: "${item.name}" (id: ${ir.insertId})`);
                }
            }
        }

        // 3. SHOPS
        const shopIdMap = {}; // name → db id
        if (data.shops) {
            for (const shop of data.shops) {
                const [sr] = await conn.query('INSERT INTO game_shops SET ?', [{
                    name:        shop.name        || 'Shop',
                    description: shop.description || '',
                    icon:        shop.icon        || '🏪',
                    map_id:      mapId
                }]);
                shopIdMap[shop.name] = sr.insertId;
                log.push(`✅ Shop: "${shop.name}" (id: ${sr.insertId})`);

                // Shop supplies
                for (const item of (shop.items || [])) {
                    const iid = itemIdMap[item.name];
                    if (!iid) continue;
                    await conn.query('INSERT IGNORE INTO game_shop_supplies SET ?', [{
                        shop_id:    sr.insertId,
                        item_id:    iid,
                        buy_price:  item.buy_price  || item.value || 100,
                        sell_price: item.sell_price || Math.floor((item.value || 50) * 0.4),
                        stock:      -1
                    }]);
                }
            }
        }

        // 4. NPCs (friendly)
        const allNPCs = [...(data.npcs || []), ...(data.enemies || [])];
        for (const npc of allNPCs) {
            // Link shop if name matches
            let shopId = null;
            if (!npc.is_enemy && npc.shop_name && shopIdMap[npc.shop_name]) {
                shopId = shopIdMap[npc.shop_name];
            }
            // Build quest_offers_json from quest_ids field (AI provides these)
            let questOffersJson = null;
            if (Array.isArray(npc.quest_ids) && npc.quest_ids.length) {
                questOffersJson = JSON.stringify(npc.quest_ids);
            }

            await conn.query('INSERT INTO game_npcs SET ?', [{
                name:              npc.name           || 'NPC',
                persona:           npc.persona        || '',
                icon:              npc.icon           || (npc.is_enemy ? '👹' : '👤'),
                map_id:            mapId,
                x:                 npc.x              || 5,
                y:                 npc.y              || 5,
                is_enemy:          npc.is_enemy       || 0,
                move_type:         npc.move_type      || 'STATIONARY',
                wander_radius:     npc.wander_radius  || 3,
                shop_id:           shopId,
                quest_offers_json: questOffersJson,
                drop_table_json:   npc.drop_table_json
                    ? JSON.stringify(npc.drop_table_json).replace(/"item_id":\s*null/g, '"item_id":null')
                    : null
            }]);
            log.push(`  ${npc.is_enemy ? '👹' : '👤'} NPC: "${npc.name}"${shopId ? ' 🏪' : ''}${questOffersJson ? ' 📜' : ''}`);
        }

        // 5. QUESTS
        for (const quest of (data.quests || [])) {
            const qid = quest.quest_id || `forge_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            try {
                await conn.query('INSERT INTO quest_definitions SET ?', [{
                    quest_id:     qid,
                    title:        quest.title        || 'Quest',
                    description:  quest.description  || '',
                    quest_type:   quest.quest_type   || 'side',
                    required_level: quest.required_level || 1,
                    is_repeatable: quest.is_repeatable ?? 0,
                    repeat_cooldown_hours: 0,
                    objectives_json: JSON.stringify(quest.objectives_json || []),
                    rewards_json:    JSON.stringify(quest.rewards_json    || {}),
                    is_active: 1
                }]);
                log.push(`  📜 Quest: "${quest.title}"`);
            } catch (qErr) {
                // quest_definitions table might not exist, try game_quests
                try {
                    await conn.query('INSERT INTO game_quests SET ?', [{
                        name:           quest.title       || 'Quest',
                        description:    quest.description || '',
                        objectives_json:JSON.stringify(quest.objectives_json || []),
                        rewards_json:   JSON.stringify(quest.rewards_json    || {}),
                        is_active: 1
                    }]);
                    log.push(`  📜 Quest (game_quests): "${quest.title}"`);
                } catch (q2Err) { log.push(`  ⚠️ Quest skipped (table missing): ${quest.title}`); }
            }
        }

        await conn.commit();
        res.json({ success: true, mapId, log, message: `World committed! ${log.length} records created.` });
    } catch (err) {
        await conn.rollback();
        console.error('[WorldForge] Commit error:', err);
        res.json({ success: false, message: err.message, log });
    } finally {
        conn.release();
    }
});

module.exports = router;
