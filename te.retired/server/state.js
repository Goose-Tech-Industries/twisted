// =============================================================
// server/state.js — Shared in-memory state for the game server
// =============================================================
// TEACHING: Every piece of mutable RAM state that socket handlers,
// route handlers, or helpers need access to lives here in ONE place.
// This avoids closure-scoping bugs where a variable was only visible
// inside startServer() and invisible to extracted handler modules.
//
// Usage:
//   const state = require('./server/state');
//   state.onlinePlayers[charId] = { ... };
//   const map = await state.getMapData(db, mapId);
// =============================================================

const BLOCKED_TILES = [1, 2]; // 1=Wall, 2=Water

// --- GLOBAL STATE (lives in RAM, resets on restart) ---
let onlinePlayers = {};
let mapCache      = {};
let npcMemory     = {};
let worldFlags    = {};   // key -> value, loaded from DB + updated by SET_WORLD_FLAG events

// Expose for achievement checks + admin panel routes
global._onlinePlayers = onlinePlayers;
global._mapCache      = mapCache;

// ── COMPANION STATE ──────────────────────────────────────────────────────────
// In-memory tracking of active companions per player character.
// charId -> [{ npcId, name, icon, x, y, mapId, charId (combat), level, currentHp, maxHp, currentMp, maxMp, tactics }]
let companionState = {};

// --- PARTY IN-MEMORY STATE ---
// Teaching: parties are stored in DB for persistence, but we also keep
// an in-memory map for fast real-time lookups during a session.
// Structure: { partyId: { id, leaderId, members: [charId,...] } }
const activeParties = {};  // partyId -> party object
const charPartyMap  = {};  // charId  -> partyId (quick lookup)

// --- GUILD IN-MEMORY STATE ---
// Guild memberships persist in DB. We keep a fast in-memory lookup
// so we can route guild chat instantly without a DB query per message.
// charGuildMap is populated when a player joins (join_game) and cleared on disconnect.
const charGuildMap = {};   // charId -> { guildId, guildName, rank }

// --- TRADE IN-MEMORY STATE ---
// Trades are completely ephemeral — no DB write until completion.
// Teaching: This is an example of "optimistic state" — we keep the
// trade in RAM and only hit the DB when both parties confirm.
const activeTrades = {};   // tradeId -> trade object
let   tradeCounter = 1;    // simple ID generator

// =============================================================
// AI CONFIG CACHE
// =============================================================
// We cache it for 60s so we're not hitting the DB on every NPC message.
let _aiConfigCache   = null;
let _aiConfigCacheAt = 0;

async function loadAiConfig(db) {
    const now = Date.now();
    if (_aiConfigCache && now - _aiConfigCacheAt < 60000) return _aiConfigCache;
    try {
        // Check both system_settings (legacy) and game_settings (admin panel) for AI config
        const c = {};
        try {
            const [sysRows] = await db.query(
                "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'ai_%'");
            for (const r of sysRows) c[r.setting_key] = r.setting_value;
        } catch {}
        try {
            const [gameRows] = await db.query(
                "SELECT setting_key, setting_value FROM game_settings WHERE setting_key LIKE 'ai_%'");
            // game_settings (admin panel) overrides system_settings
            for (const r of gameRows) c[r.setting_key] = r.setting_value;
        } catch {}
        _aiConfigCache = {
            provider:     c.ai_provider     || null,   // null = fall back to .env logic in npc_brain
            apiKey:       c.ai_api_key      || '',
            model:        c.ai_model        || '',
            baseUrl:      c.ai_base_url     || '',
            temperature:  parseFloat(c.ai_temperature) || 0.85,
            maxTokens:    parseInt(c.ai_max_tokens)    || 256,
            systemPrompt: c.ai_system_prompt || ''
        };
    } catch (e) {
        console.warn('[AI Config] Failed to load from DB, using .env fallback:', e.message);
        _aiConfigCache = null;
    }
    _aiConfigCacheAt = now;
    return _aiConfigCache;
}

// =============================================================
// UTILITY HELPERS
// =============================================================

function safeJsonParse(str, fallback = null) {
    try { return JSON.parse(str); } catch (e) { return fallback; }
}

// ── sanitizeText — shared XSS defence ───────────────────────────
// TEACHING: Any string that came from a player and will be stored
// or broadcast to others must be sanitized. This function:
//   1. Coerces to string (prevents object injection)
//   2. Trims whitespace
//   3. Caps length (prevents DB column overflow)
//   4. HTML-escapes special chars → injected <script> tags become
//      harmless literal text. & must go first to avoid double-escaping.
// React escapes automatically; vanilla JS must use textContent, not innerHTML.
function sanitizeText(raw, maxLen = 500) {
    return String(raw || '')
        .trim()
        .slice(0, maxLen)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

// =============================================================
// WORLD FLAG CONDITION CHECKER
// =============================================================
// Defined at MODULE LEVEL so it's accessible from both:
//   • loadWorldFlags() / applyRegionAutoRules() which run at STARTUP
//   • socket handlers (move, buy-item, spawn zones) which run after connection
//
// TEACHING: If this were defined inside startServer() or io.on('connection'),
// it would only be visible to functions defined in that same scope via closure.
// applyRegionAutoRules is nested inside loadWorldFlags (module scope), so it
// can only see module-level names — not anything inside startServer.
// Moving this here fixes a ReferenceError that would fire on startup whenever
// any region has auto_rules_json conditions set.
function checkWorldFlagConditions(conditionsJson) {
    if (!conditionsJson) return true;
    try {
        const conds = typeof conditionsJson === 'string'
            ? JSON.parse(conditionsJson) : conditionsJson;
        if (!Array.isArray(conds) || !conds.length) return true;
        return conds.every(c => {
            const actual   = String(worldFlags[c.flag] ?? '');
            const expected = String(c.value ?? '');
            const op = c.op || '==';
            if (op === '==' || op === '===') return actual === expected;
            if (op === '!=' || op === '!==') return actual !== expected;
            if (op === '>')   return parseFloat(actual) > parseFloat(expected);
            if (op === '>=')  return parseFloat(actual) >= parseFloat(expected);
            if (op === '<')   return parseFloat(actual) < parseFloat(expected);
            if (op === '<=')  return parseFloat(actual) <= parseFloat(expected);
            return false;
        });
    } catch { return true; }
}

// =============================================================
// MAP CACHE HELPER
// =============================================================
// --- MAP CACHE HELPER ---
async function getMapData(db, mapId) {
    mapId = parseInt(mapId);
    if (mapCache[mapId]) return mapCache[mapId];
    const [rows] = await db.query("SELECT * FROM game_maps WHERE id = ?", [mapId]);
    if (rows.length === 0) return null;
    const m = rows[0];
    const mapObj = {
        id:          m.id,
        name:        m.name,
        width:       m.width,
        height:      m.height,
        tiles:       (() => {
            const parsed = safeJsonParse(m.tiles_json, []);
            // tiles_json is either a flat array (legacy) or [ground, overlay, passability, fringe, elevation]
            return Array.isArray(parsed[0]) ? parsed[0] : parsed;
        })(),
        passability: (() => {
            const parsed = safeJsonParse(m.tiles_json, []);
            return Array.isArray(parsed[0]) ? (parsed[2] || []) : [];
        })(),
        events:      safeJsonParse(m.collisions_json, []),
        objects:     safeJsonParse(m.objects_json,    []),
        anims:       safeJsonParse(m.anims_json,      []),
        tileset_url: m.tileset_url  || '',
        ambientDark: parseFloat(m.ambient_dark) || 0,
        parallax_url: m.parallax_url || null,
        parallax_speed_x: parseFloat(m.parallax_speed_x) || 0.5,
        parallax_speed_y: parseFloat(m.parallax_speed_y) || 0.25,
        fog_of_war:  !!m.fog_of_war,
        fog_reveal_radius: m.fog_reveal_radius || 3,
        ambient_sound_url: m.ambient_sound_url || null,
        neighbor_north: m.neighbor_north || null,
        neighbor_south: m.neighbor_south || null,
        neighbor_east:  m.neighbor_east  || null,
        neighbor_west:  m.neighbor_west  || null,
        region_id:   m.region_id || null,
        render_mode: m.render_mode || null,
        fast_travel_enabled: !!m.fast_travel_enabled,
    };

    // Resolve BGM/ambient asset URLs
    if (m.bgm_asset_id) {
        try {
            const [aRow] = await db.query('SELECT file_url FROM game_assets WHERE id=?', [m.bgm_asset_id]);
            if (aRow.length) mapObj.bgm_url = aRow[0].file_url;
        } catch {}
    }
    if (m.ambient_asset_id) {
        try {
            const [aRow] = await db.query('SELECT file_url FROM game_assets WHERE id=?', [m.ambient_asset_id]);
            if (aRow.length) mapObj.ambient_sound_url = aRow[0].file_url;
        } catch {}
    }

    // Load sound zones for this map
    try {
        const [zones] = await db.query(
            `SELECT sz.*, a.file_url AS asset_url FROM game_map_sound_zones sz
             LEFT JOIN game_assets a ON a.id = sz.sound_asset_id
             WHERE sz.map_id=? AND sz.is_active=1`, [mapId]);
        if (zones.length) {
            mapObj.sound_zones = zones.map(z => ({
                x_min: z.x_min, y_min: z.y_min, x_max: z.x_max, y_max: z.y_max,
                url: z.sound_url || z.asset_url || null,
                volume: parseFloat(z.volume) || 0.5,
                loop: !!z.loop_sound,
                name: z.name,
            }));
        }
    } catch {}

    // Resolve world render_mode via region → world chain
    if (m.region_id) {
        try {
            const [regRows] = await db.query(
                `SELECT r.weather_override, r.world_id, w.render_mode as world_render_mode
                 FROM game_regions r
                 LEFT JOIN game_worlds w ON w.id = r.world_id
                 WHERE r.id = ? LIMIT 1`, [m.region_id]);
            if (regRows.length) {
                mapObj.world_render_mode = regRows[0].world_render_mode || null;
                mapObj.weather = regRows[0].weather_override || null;
                mapObj.world_id = regRows[0].world_id || null;
            }
        } catch {}
    }

    mapCache[mapId] = mapObj;
    return mapObj;
}

// =============================================================
// STAFF GUARD
// =============================================================
// --- STAFF GUARD (used for sensitive admin-only endpoints) ---
// isStaff() is used for in-socket staff checks (e.g. /clear-cache).
// It receives userId from the session (socket.request.session.userId),
// then verifies the role in the DB. Session auth is fully in place.
async function isStaff(db, userId) {
    const uid = parseInt(userId, 10);
    if (!uid) return false;
    const [rows] = await db.query('SELECT role FROM users WHERE id=?', [uid]);
    if (!rows.length) return false;
    return ['ADMIN', 'GM', 'MOD'].includes(rows[0].role);
}

// =============================================================
// LOAD WORLD FLAGS
// =============================================================
// Load world flags from DB into memory on startup
async function loadWorldFlags(db) {
    try {
        const [rows] = await db.query('SELECT flag_key, flag_value FROM world_flags');
        worldFlags = {};
        for (const r of rows) worldFlags[r.flag_key] = r.flag_value;
        // Update the exported reference so callers see the new object
        state.worldFlags = worldFlags;

        // ── REGION STATE CACHE ────────────────────────────────────────
        // Regions are loaded into memory at startup and re-evaluated
        // whenever a world flag changes or the scheduler fires a
        // SET_REGION_STATE task. This avoids a DB hit on every move/buy.
        // TEACHING: Like worldFlags, we keep a flat dict in memory.
        // The key is region_id (number). Value is the full region row
        // plus any overrides applied by auto_rules_json.
        // ─────────────────────────────────────────────────────────────
        const regionState = {};  // regionId -> effective region config

        async function loadRegionState() {
            try {
                const [regs] = await db.query('SELECT * FROM game_regions WHERE is_active=1');
                for (const r of regs) {
                    regionState[r.id] = applyRegionAutoRules(r);
                }
            } catch(e) { console.warn('[Region] Load failed:', e.message); }
        }

        // Apply auto_rules_json: evaluate each rule's conditions against worldFlags.
        // If all conditions pass, merge the rule's "apply" object on top of the base region.
        // Rules are evaluated in order; last match wins for each field.
        function applyRegionAutoRules(region) {
            const effective = { ...region };
            if (!region.auto_rules_json) return effective;
            try {
                const rules = typeof region.auto_rules_json === 'string'
                    ? JSON.parse(region.auto_rules_json) : region.auto_rules_json;
                if (!Array.isArray(rules)) return effective;
                for (const rule of rules) {
                    if (checkWorldFlagConditions(rule.conditions)) {
                        Object.assign(effective, rule.apply || {});
                    }
                }
            } catch {}
            return effective;
        }

        // Get the effective region for a given map ID.
        // Returns a default neutral region if no region is assigned.
        async function getRegionForMap(mapId) {
            const map = await getMapData(db, mapId);
            if (!map || !map.region_id) return null;
            return regionState[map.region_id] || null;
        }

        await loadRegionState();
        global.regionState          = regionState;
        global.getRegionForMap      = getRegionForMap;
        global.loadRegionState      = loadRegionState;
        global.applyRegionAutoRules = applyRegionAutoRules;
        console.log('[Region] Loaded', Object.keys(regionState).length, 'regions');
        console.log(`🌍 Loaded ${rows.length} world flag(s)`);
    } catch (e) { console.warn('loadWorldFlags failed:', e.message); }
}

// =============================================================
// PARTY HELPERS
// =============================================================

// Helper: broadcast party state to all online members
function broadcastPartyUpdate(partyId) {
    const party = activeParties[partyId];
    if (!party) return;
    const io = global._io;
    party.members.forEach(cid => {
        const entry = Object.values(onlinePlayers).find(p => p.charId === cid);
        if (entry && io) {
            io.to(entry.socketId).emit('party_update', party);
        }
    });
}

// Helper: get party member data for broadcast
function buildPartyPayload(partyId) {
    const party = activeParties[partyId];
    if (!party) return null;
    return {
        id: partyId,
        leaderId: party.leaderId,
        members: party.members.map(cid => {
            const p = Object.values(onlinePlayers).find(pl => pl.charId === cid);
            return p ? { charId: p.charId, name: p.name, level: p.level, online: true }
                     : { charId: cid, online: false };
        })
    };
}

// =============================================================
// EXPORT
// =============================================================
const state = {
    // Tile constants
    BLOCKED_TILES,

    // Mutable state objects
    onlinePlayers,
    mapCache,
    npcMemory,
    worldFlags,
    companionState,

    // Party / guild / trade state
    activeParties,
    charPartyMap,
    charGuildMap,
    activeTrades,
    get tradeCounter()  { return tradeCounter; },
    set tradeCounter(v) { tradeCounter = v; },

    // Functions that need db passed in
    getMapData,
    isStaff,
    loadWorldFlags,
    loadAiConfig,

    // Pure helpers (no db needed)
    safeJsonParse,
    sanitizeText,
    checkWorldFlagConditions,

    // Party helpers (use global._io internally)
    broadcastPartyUpdate,
    buildPartyPayload,
};

module.exports = state;
