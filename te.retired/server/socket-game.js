// =============================================================
// server/socket-game.js — Game session socket handlers
// =============================================================
// TEACHING: This module contains all the core game-play socket
// handlers: joining a session, movement, teleportation, fast
// travel, interaction, equipment, resting, AP distribution,
// respawning, tutorial completion, and disconnect cleanup.
//
// Each handler follows the same guard pattern:
//   const p = state.onlinePlayers[socket.id]; if (!p) return;
// This means nothing works until join_game populates the entry.
//
// Usage (from server.js):
//   const registerGameHandlers = require('./server/socket-game');
//   io.on('connection', (socket) => {
//       registerGameHandlers(socket, { db, io });
//       // ...other handler modules
//   });
// =============================================================

const state = require('./state');
const BattleManager = require('../battle_engine');
const { handleMapEvent, executeActions } = require('../event_runner');
const ai = require('./ai-features');
const { isAIEnabled } = require('./ai-helpers');
const actionSlots = require('./action-slots');

module.exports = function registerGameHandlers(socket, ctx) {
    const { db, io } = ctx;

    // Per-connection move throttle — resets on each new socket.
    // TEACHING: This is intentionally local (not in state) because
    // it tracks the last move timestamp for THIS specific socket
    // connection only. If the player reconnects, a new socket is
    // created with a fresh lastMoveTime of 0.
    let lastMoveTime = 0;

    // ── Shorthand references to shared state ─────────────────
    const {
        onlinePlayers, mapCache, npcMemory, worldFlags,
        companionState, charPartyMap, charGuildMap,
        activeParties, buildPartyPayload,
        BLOCKED_TILES,
        getMapData, safeJsonParse, sanitizeText,
        checkWorldFlagConditions, loadWorldFlags, loadAiConfig,
    } = state;

    // =============================================================
    // 1. JOIN GAME
    // =============================================================
    // TEACHING: This is the most important handler — it loads the
    // character from DB, verifies ownership via the server-side
    // session (never trust the client), populates onlinePlayers,
    // and sends the player everything they need to start playing.
    socket.on('join_game', async (data) => {
        try {
            // Read userId from the server-side session — client never sends it
            const sessionData = socket.request.session;
            const userId = sessionData && sessionData.userId;
            if (!userId) {
                socket.emit('error_msg', 'Not logged in. Please refresh and log in again.');
                return;
            }
            // Check ban status on every join/reconnect
            const [banCheck] = await db.query('SELECT is_banned FROM users WHERE id=? LIMIT 1', [userId]);
            if (banCheck.length && banCheck[0].is_banned) {
                socket.emit('force_disconnect', { reason: 'Your account has been banned.' });
                socket.disconnect(true);
                return;
            }
            if (!data || typeof data !== 'object') {
                socket.emit('error_msg', 'join_game payload must be an object: { charId }.');
                return;
            }
            const charId = parseInt(data.charId, 10);
            if (!charId) {
                socket.emit('error_msg', 'Missing charId.');
                return;
            }

            const query = "SELECT * FROM characters WHERE id = ? AND user_id = ?";
            const params = [charId, userId];

            const [rows] = await db.query(query, params);
            if (rows.length === 0) { socket.emit('error_msg', "Character not found."); return; }
            const char = rows[0];

            // Parse state_json to check tutorial completion
            let charState = {};
            try { charState = JSON.parse(char.state_json || '{}'); } catch {}
            const tutorialDone = !!charState.tutorial_done;
            const mapDataForClient = await getMapData(db, char.map_id);
            if (mapDataForClient) socket.emit('map_data', mapDataForClient);

            // Fetch user role + chat color for permissions + admin room
            const [userRows] = await db.query('SELECT role, chat_color FROM users WHERE id=?', [char.user_id]);
            const userRole = userRows.length ? (userRows[0].role || 'PLAYER') : 'PLAYER';
            const userChatColor = userRows.length ? (userRows[0].chat_color || null) : null;
            const isStaffRole = ['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(userRole.toUpperCase());

            // Load active mount speed multiplier
            let mountSpeedMult = 1;
            try {
                const [mountRow] = await db.query(
                    `SELECT m.speed_mult FROM character_mounts cm
                     JOIN game_mounts m ON m.id = cm.mount_id
                     WHERE cm.character_id=? AND cm.is_active=1 LIMIT 1`, [char.id]);
                if (mountRow.length && mountRow[0].speed_mult) mountSpeedMult = parseFloat(mountRow[0].speed_mult) || 1;
            } catch {}

            onlinePlayers[socket.id] = {
                socketId: socket.id, charId: char.id, userId: char.user_id,
                name: char.name, mapId: char.map_id, x: char.x, y: char.y,
                level: char.level, role: userRole, chatColor: userChatColor,
                // Presence: loaded from DB so last session status is remembered
                presence: char.presence_status || 'online',
                awayMessage: char.away_message || null,
                _mountSpeedMult: mountSpeedMult,
            };
            socket.join('map_' + char.map_id);
            // Staff auto-join admin chat room
            if (isStaffRole) socket.join('admin_chat');
            // Load labels from game_settings and send to client
            let gameLabels = {};
            try {
                const settingsTables = ['game_settings','system_settings','settings'];
                let settingsLoaded = false;
                for (const tbl of settingsTables) {
                    try {
                        const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                        if (!sr.length) continue;
                        const cols = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                        const colNames = cols[0].map(c => c.Field);
                        const kc = colNames.find(n => /key|name/i.test(n));
                        const vc = colNames.find(n => /val|value/i.test(n));
                        if (!kc || !vc) continue;
                        const [rows] = await db.query('SELECT ?? AS k, ?? AS v FROM ??', [kc, vc, tbl]);
                        for (const r of rows) gameLabels[r.k] = r.v;
                        settingsLoaded = true; break;
                    } catch {}
                }
            } catch(labelErr) { console.warn('Label load warning:', labelErr.message); }

            const _joinRegion = await global.getRegionForMap(char.map_id).catch(() => null);

            // Load greet system setting + player's greeted list
            let enableGreetSystem = false;
            let greetedIds = [];
            let hasGreetedIds = [];
            try {
                const [gsRows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='enable_greet_system'");
                enableGreetSystem = gsRows.length ? gsRows[0].setting_value === 'true' || gsRows[0].setting_value === '1' : false;
                const charState = typeof char.state_json === 'string' ? JSON.parse(char.state_json || '{}') : (char.state_json || {});
                greetedIds = charState.greeted || [];
                hasGreetedIds = charState.hasGreeted || [];
            } catch {}

            socket.emit('init_self', {
                ...onlinePlayers[socket.id],
                tutorialDone,
                enableGreetSystem,
                greetedIds,
                hasGreetedIds,
                hp: char.current_hp, maxHp: char.max_hp,
                mp: char.current_mp || 0, maxMp: char.max_mp || 0,
                atk: char.atk, def: char.def,
                mo: char.mo, md: char.md,
                speed: char.speed, luck: char.luck,
                limitbreak: Number(char.limitbreak || 0),
                breaklevel: Number(char.breaklevel || 1),
                role: userRole,
                labels: gameLabels,
                region: _joinRegion ? {
                    id:               _joinRegion.id,
                    name:             _joinRegion.name,
                    danger_level:     _joinRegion.danger_level,
                    corruption_level: _joinRegion.corruption_level,
                    faction_control:  _joinRegion.faction_control,
                    weather_override: _joinRegion.weather_override,
                    pvp_enabled:      _joinRegion.pvp_enabled,
                    is_sanctuary:     _joinRegion.is_sanctuary,
                    active_tags_json: _joinRegion.active_tags_json,
                    xp_mult:          _joinRegion.xp_mult,
                    gold_mult:        _joinRegion.gold_mult,
                } : null
            });
            const mapPlayers = Object.values(onlinePlayers).filter(p => p.mapId === char.map_id && p.charId !== char.id);

            // Also load offline players on this map (sleeping characters)
            let offlinePlayers = [];
            try {
                const [offRows] = await db.query(
                    `SELECT id AS charId, name, x, y, level, 'offline' AS presence
                     FROM characters WHERE map_id=? AND id!=?
                     AND is_offline_visible=1 AND presence_status='offline'`, [char.map_id, char.id]);
                // Filter out anyone who's actually online (already in mapPlayers)
                const onlineIds = new Set(mapPlayers.map(p => p.charId));
                offlinePlayers = offRows.filter(p => !onlineIds.has(p.charId))
                    .map(p => ({ ...p, isOffline: true }));
            } catch {}

            socket.emit('player_list', [...mapPlayers, ...offlinePlayers]);
            socket.to('map_' + char.map_id).emit('player_joined', onlinePlayers[socket.id]);

            // Send live NPC positions for this map (loads from DB if first visitor)
            await ctx.loadMapNpcs(char.map_id);
            socket.emit('npc_list', ctx.getNpcsForMap(char.map_id));

            // Load and send companions
            const _joinP = onlinePlayers[socket.id];
            const comps = await ctx.loadCompanions(_joinP.charId);
            ctx.spawnCompanionsAtPlayer(_joinP);
            socket.emit('companion_list', comps);
            // Broadcast companion sprites to other players on this map
            for (const comp of comps) {
                socket.to('map_' + _joinP.mapId).emit('companion_moved', {
                    ownerId: _joinP.charId, npcId: comp.npcId, name: comp.name, icon: comp.icon, x: comp.x, y: comp.y
                });
            }

            // Crowd reaction: check reputation on this map and react if notable
            await ctx._triggerCrowdReaction(socket, db, onlinePlayers[socket.id], char.map_id);
            // Environmental reaction: surface healer if player is at low HP
            await ctx._triggerEnvironmentalReaction(socket, db, onlinePlayers[socket.id], char.map_id);

            // Send active overworld effects (fly, speed, vision, etc.)
            try {
                const [activeStatuses] = await db.query(
                    `SELECT s.id, s.name, s.icon, s.type, s.effects FROM character_status_effects cse
                     JOIN game_statuses s ON s.id = cse.status_id
                     WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())`,
                    [char.id]
                );
                const owFx = {};
                const statusList = [];
                for (const row of activeStatuses) {
                    statusList.push({ id: row.id, name: row.name, icon: row.icon, type: row.type });
                    try {
                        const fx = typeof row.effects === 'string' ? JSON.parse(row.effects) : row.effects;
                        if (fx) Object.assign(owFx, fx);
                    } catch {}
                }
                socket.emit('active_statuses', statusList);
                socket.emit('overworld_effects', owFx);
            } catch {}

            // Send current world time immediately so fog/lighting works on join
            if (global._worldTime) socket.emit('world_time', global._worldTime);

            // Send tile palette from DB (cached globally)
            if (!global._tilePaletteCache || Date.now() - (global._tilePaletteCacheAt || 0) > 60000) {
                try {
                    const [tiles] = await db.query(
                        `SELECT t.id, t.name, t.color, t.category, t.is_passable, t.animation_id,
                                a.frame_tiles, a.fps
                         FROM game_tile_types t
                         LEFT JOIN game_tile_animations a ON a.id = t.animation_id AND a.is_active=1
                         WHERE t.is_active=1 ORDER BY t.sort_order`);
                    // Parse frame_tiles JSON for tiles with animations
                    for (const t of tiles) {
                        if (t.frame_tiles) {
                            try { t.frame_tiles = JSON.parse(t.frame_tiles); } catch { t.frame_tiles = null; }
                        }
                    }
                    global._tilePaletteCache = tiles;
                    global._tilePaletteCacheAt = Date.now();
                } catch { global._tilePaletteCache = []; }
            }
            socket.emit('tile_palette', global._tilePaletteCache);

            // Send ground items and deployed structures on this map
            await sendGroundItems(socket, char.map_id);
            try {
                const [structs] = await db.query(
                    `SELECT id, x, y, name, icon, owner_id, data_json FROM game_deployed_structures
                     WHERE map_id=? AND is_active=1 AND (expires_at IS NULL OR expires_at > NOW())`,
                    [char.map_id]
                );
                socket.emit('deployed_structures', structs);
            } catch {}

            console.log(`✅ ${char.name} joined Map ${char.map_id}`);

            // Fire AUTO triggers on map load
            try {
                const joinMap = await getMapData(db, char.map_id);
                if (joinMap && Array.isArray(joinMap.events)) {
                    const autoEvents = joinMap.events.filter(e => e.trigger === 'AUTO');
                    for (const ae of autoEvents) {
                        const [stateRows] = await db.query("SELECT state_json FROM characters WHERE id=?", [char.id]);
                        const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};
                        await handleMapEvent({
                            triggerType: 'AUTO', x: ae.x, y: ae.y,
                            mapEvents: [ae], socket, db,
                            player: { ...onlinePlayers[socket.id], level: char.level, classId: char.class_id },
                            state: charState
                        });
                    }
                }
            } catch {}

            // Notify player of unread mail on login
            try {
                const [[mailRow]] = await db.query(
                    'SELECT COUNT(*) AS n FROM character_mail WHERE recipient_char_id=? AND is_deleted=0 AND is_read=0',
                    [char.id]
                );
                if (mailRow.n > 0) {
                    socket.emit('mail_unread_count', { count: mailRow.n });
                }
            } catch {} // mail table may not exist yet on old installs

            // ── ACHIEVEMENT: login_streak + gold_owned triggers ───
            try {
                const achievementRoutes = require('./routes/achievementRoutes');
                const [[uRow]] = await db.query(
                    'SELECT login_streak, currency FROM users WHERE id=?', [char.user_id]);
                if (uRow) {
                    if (uRow.login_streak > 0) {
                        await achievementRoutes.checkForCharacter(
                            db, io, char.id, 'login_streak', uRow.login_streak
                        );
                    }
                    if (uRow.currency > 0) {
                        await achievementRoutes.checkForCharacter(
                            db, io, char.id, 'gold_owned', uRow.currency
                        );
                    }
                }
            } catch(ae) { /* non-critical */ }
        } catch (err) { console.error("Join error:", err); socket.emit('error_msg', "Server error."); }
    });

    // =============================================================
    // SELECT CHARACTER — alias for join_game
    // =============================================================
    // select_character — alias emitted by the Next.js UI after character select.
    // Identical to join_game; both start a game session for a character.
    //
    // FIX: The previous implementation used socket.emit('_internal_join', ...)
    // which sends the event TO THE CLIENT, not back to the server. This meant
    // join_game was never called, onlinePlayers[socket.id] was never populated,
    // and every chat/move/action handler silently dropped all events because
    // they all guard with: const p = onlinePlayers[socket.id]; if (!p) return;
    //
    // The fix is simple: directly invoke the join_game listener server-side
    // instead of going through socket.emit which crosses the network boundary.
    socket.on('select_character', async (data) => {
        try {
            const sessionData = socket.request.session;
            const userId = sessionData && sessionData.userId;
            if (!userId) { socket.emit('error_msg', 'Not logged in.'); return; }
            if (!data || typeof data !== 'object') { socket.emit('error_msg', 'Bad payload.'); return; }
            const charId = parseInt(data.charId, 10);
            if (!charId) { socket.emit('error_msg', 'Missing charId.'); return; }
            // Directly invoke the join_game handler server-side (NOT socket.emit — that goes to the client)
            const joinHandler = socket.listeners('join_game')[0];
            if (joinHandler) await joinHandler({ charId });
            else socket.emit('error_msg', 'Server error: join handler not found.');
        } catch (err) { console.error('select_character error:', err); }
    });

    // =============================================================
    // 2. MOVEMENT (Server-Authoritative)
    // =============================================================
    // TEACHING: Movement is fully server-authoritative. The client
    // sends where it WANTS to go, the server validates every step:
    //   1. Throttle check (cooldown prevents speed hacking)
    //   2. Optional movement limit (daily/hourly cap from AdminSauce)
    //   3. Distance check (must be exactly 1 tile — no teleport cheats)
    //   4. Bounds check (can't walk off the map edge)
    //   5. Blocked tile check (walls, water, etc.)
    // If any check fails, the server sends force_move to snap the
    // client back to the last valid position.
    socket.on('move', async (target) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            // DM movement lock check
            if (p._dmLocked) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
            const now = Date.now();
            // Dynamic cooldown from settings (cached per connection)
            // Refresh cooldown from settings every 5 min
            if (!p._moveCooldown || (now - (p._moveCooldownCacheAt || 0) > 300000)) {
                try {
                    const [cooldownRow] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='movement_cooldown_ms'");
                    p._moveCooldown = parseInt(cooldownRow[0]?.setting_value) || 200; p._moveCooldownCacheAt = now;
                } catch { p._moveCooldown = 200; p._moveCooldownCacheAt = now; }
            }
            // Load active overworld status effects (cached 10s)
            let owEffects = {};
            if (!p._owEffectsCache || (now - (p._owEffectsCacheAt || 0) > 10000)) {
                try {
                    const [activeStatuses] = await db.query(
                        `SELECT s.effects FROM character_status_effects cse
                         JOIN game_statuses s ON s.id = cse.status_id
                         WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())`,
                        [p.charId]
                    );
                    const merged = {};
                    for (const row of activeStatuses) {
                        try {
                            const fx = typeof row.effects === 'string' ? JSON.parse(row.effects) : row.effects;
                            if (fx) Object.assign(merged, fx);
                        } catch {}
                    }
                    p._owEffectsCache = merged;
                    p._owEffectsCacheAt = now;
                } catch { p._owEffectsCache = {}; p._owEffectsCacheAt = now; }
            }
            owEffects = p._owEffectsCache || {};

            // Running halves cooldown, mount speed_mult also modifies
            // Status effects can override speed too
            const isRunning = !!target.running;
            const mountMult = p._mountSpeedMult || 1;
            const statusSpeedMult = owEffects.move_speed_mult || 1;
            const effectiveCooldown = Math.round(p._moveCooldown * (isRunning ? 0.5 : 1) / Math.max(0.5, mountMult * statusSpeedMult));
            if (now - lastMoveTime < effectiveCooldown) return;
            lastMoveTime = now;

            // Movement limit check (optional — configurable from AdminSauce)
            // Refresh move limit settings every 5 minutes
            if (!p._moveLimitChecked || (now - (p._moveLimitCacheAt || 0) > 300000)) {
                try {
                    const [limitRows] = await db.query(
                        "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('movement_limit_enabled','movement_limit_type','movement_limit_amount')"
                    );
                    p._moveLimit = {};
                    for (const r of limitRows) p._moveLimit[r.setting_key] = r.setting_value;
                    p._moveLimitChecked = true; p._moveLimitCacheAt = now;
                } catch { p._moveLimitChecked = true; p._moveLimitCacheAt = now; p._moveLimit = {}; }
            }
            if (p._moveLimit?.movement_limit_enabled === 'true') {
                // Status effects can override the move limit
                const baseLimit = parseInt(p._moveLimit.movement_limit_amount) || 1000;
                const maxMoves = owEffects.move_limit || baseLimit;
                // tiles_per_move: how many tiles count as one "move" (flight = 3 tiles per move, etc.)
                const tilesPerMove = owEffects.tiles_per_move || 1;
                if (!p._moveCount) p._moveCount = 0;
                if (!p._moveResetAt || now > p._moveResetAt) {
                    p._moveCount = 0;
                    const limitType = p._moveLimit.movement_limit_type || 'daily';
                    p._moveResetAt = limitType === 'hourly' ? now + 3600000 : now + 86400000;
                }
                if (p._moveCount >= maxMoves) {
                    socket.emit('chat_msg', { channel: 'system', from: 'System',
                        text: `Movement limit reached (${maxMoves} ${p._moveLimit.movement_limit_type || 'daily'}). Rest and try again later.`,
                        ts: Date.now() });
                    return;
                }
                // tiles_per_move: e.g. flying costs 1 move per 3 tiles
                if (!p._tilesSinceMove) p._tilesSinceMove = 0;
                p._tilesSinceMove++;
                if (p._tilesSinceMove >= tilesPerMove) {
                    p._moveCount++;
                    p._tilesSinceMove = 0;
                }
            }

            const map = await getMapData(db, p.mapId);
            if (!map) return;
            const dx = Math.abs(target.x - p.x), dy = Math.abs(target.y - p.y);
            // Allow cardinal (dist=1) and diagonal (dx=1, dy=1) movement
            if ((dx + dy) < 1 || dx > 1 || dy > 1) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
            // Map edge: transition to neighbor map if configured, otherwise block
            if (target.x < 0 || target.x >= map.width || target.y < 0 || target.y >= map.height) {
                let neighborId = null, newX = target.x, newY = target.y;
                if (target.y < 0 && map.neighbor_north) { neighborId = map.neighbor_north; newY = undefined; }
                else if (target.y >= map.height && map.neighbor_south) { neighborId = map.neighbor_south; newY = 0; }
                else if (target.x < 0 && map.neighbor_west) { neighborId = map.neighbor_west; newX = undefined; }
                else if (target.x >= map.width && map.neighbor_east) { neighborId = map.neighbor_east; newX = 0; }

                if (neighborId) {
                    try {
                        const neighborMap = await getMapData(db, neighborId);
                        if (neighborMap) {
                            // Calculate entry position on the neighbor map
                            if (newY === undefined) newY = neighborMap.height - 1; // came from south
                            if (newX === undefined) newX = neighborMap.width - 1;  // came from east
                            newX = Math.min(Math.max(newX, 0), neighborMap.width - 1);
                            newY = Math.min(Math.max(newY, 0), neighborMap.height - 1);

                            socket.leave('map_' + p.mapId);
                            socket.to('map_' + p.mapId).emit('player_left', p.charId);
                            p.mapId = neighborId; p.x = newX; p.y = newY;
                            await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [neighborId, newX, newY, p.charId]);
                            socket.join('map_' + neighborId);
                            socket.emit('map_data', neighborMap);
                            socket.emit('map_changed', { mapId: neighborId });
                            await ctx.loadMapNpcs(neighborId);
                            socket.emit('npc_list', ctx.getNpcsForMap(neighborId));
                            socket.to('map_' + neighborId).emit('player_joined', onlinePlayers[socket.id]);
                            if (global._worldTime) socket.emit('world_time', global._worldTime);
                            await sendGroundItems(socket, neighborId);
                            return;
                        }
                    } catch {}
                }
                socket.emit('force_move', { x: p.x, y: p.y }); return;
            }
            const idx = target.y * map.width + target.x;
            // Flying / ignore_passability skips collision checks
            if (!owEffects.ignore_passability) {
                if (map.passability && map.passability.length > 0) {
                    if (map.passability[idx] === 1) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
                } else {
                    const tileId = map.tiles[idx];
                    if (BLOCKED_TILES.includes(tileId)) { socket.emit('force_move', { x: p.x, y: p.y }); return; }
                }
            }

            p.x = target.x; p.y = target.y;
            socket.to('map_' + p.mapId).emit('player_moved', { id: p.charId, x: p.x, y: p.y });

            // --- COMPANION FOLLOW ---
            const _comps = ctx.getActiveCompanions(p.charId);
            for (const comp of _comps) {
                const dx = p.x - comp.x;
                const dy = p.y - comp.y;
                const dist = Math.abs(dx) + Math.abs(dy);
                if (dist > 1) {
                    // Move one step toward the player's position
                    const stepX = dx !== 0 ? Math.sign(dx) : 0;
                    const stepY = dx === 0 && dy !== 0 ? Math.sign(dy) : 0;
                    comp.x += stepX;
                    comp.y += stepY;
                    socket.emit('companion_moved', { npcId: comp.npcId, x: comp.x, y: comp.y });
                    socket.to('map_' + p.mapId).emit('companion_moved', {
                        ownerId: p.charId, npcId: comp.npcId, name: comp.name, icon: comp.icon, x: comp.x, y: comp.y
                    });
                }
            }

            // --- HAZARD CHECK: damage/heal/status on step (skip if hazard_immune) ---
            if (owEffects.hazard_immune) { /* skip hazards */ }
            else
            try {
                const [hazards] = await db.query(
                    'SELECT * FROM game_map_hazards WHERE map_id=? AND x=? AND y=?',
                    [p.mapId, p.x, p.y]
                );
                for (const hz of hazards) {
                    if (hz.damage_per_step > 0) {
                        await db.query('UPDATE characters SET current_hp = GREATEST(0, current_hp - ?) WHERE id=?', [hz.damage_per_step, p.charId]);
                        socket.emit('notification', { type: 'warning', message: `${hz.description || hz.hazard_type}: -${hz.damage_per_step} HP` });
                    }
                    if (hz.heal_per_step > 0) {
                        await db.query('UPDATE characters SET current_hp = LEAST(max_hp, current_hp + ?) WHERE id=?', [hz.heal_per_step, p.charId]);
                        socket.emit('notification', { type: 'success', message: `${hz.description || 'Healing zone'}: +${hz.heal_per_step} HP` });
                    }
                    if (hz.status_effect_id) {
                        try {
                            const [[status]] = await db.query('SELECT name, icon FROM game_statuses WHERE id=?', [hz.status_effect_id]);
                            if (status) {
                                await db.query(
                                    `INSERT INTO character_status_effects (character_id, status_id, source, expires_at)
                                     VALUES (?, ?, 'hazard', DATE_ADD(NOW(), INTERVAL 60 SECOND))
                                     ON DUPLICATE KEY UPDATE expires_at = DATE_ADD(NOW(), INTERVAL 60 SECOND)`,
                                    [p.charId, hz.status_effect_id]
                                );
                                socket.emit('notification', { type: 'warning', message: `${status.icon || ''} ${status.name} applied!` });
                            }
                        } catch {}
                    }
                }
            } catch {}

            // --- EVENT RUNNER: Check STEP_ON events at new position ---
            if (Array.isArray(map.events)) {
                // Load player state for condition checks
                const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
                const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};

                const result = await handleMapEvent({
                    triggerType: 'STEP_ON',
                    x: p.x, y: p.y,
                    mapEvents: map.events,
                    socket, db,
                    player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                    state: charState
                });

                // Save modified state if actions changed it
                if (result && result.state) {
                    await db.query("UPDATE characters SET state_json=? WHERE id=?",
                        [JSON.stringify(result.state), p.charId]);
                }

                // PROXIMITY triggers — check all events within radius
                const proxResult = await handleMapEvent({
                    triggerType: 'PROXIMITY', x: p.x, y: p.y,
                    mapEvents: map.events, socket, db,
                    player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                    state: result?.state || charState
                });
                if (proxResult?.state) {
                    await db.query("UPDATE characters SET state_json=? WHERE id=?",
                        [JSON.stringify(proxResult.state), p.charId]);
                }

                // REGION_ENTER triggers — zone-based triggers
                const regionResult = await handleMapEvent({
                    triggerType: 'REGION_ENTER', x: p.x, y: p.y,
                    mapEvents: map.events, socket, db,
                    player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                    state: proxResult?.state || result?.state || charState
                });
                if (regionResult?.state) {
                    await db.query("UPDATE characters SET state_json=? WHERE id=?",
                        [JSON.stringify(regionResult.state), p.charId]);
                }
            }

            // --- RANDOM ENCOUNTER CHECK ---
            // Skip if flying/ignore_encounters status effect
            if (owEffects.ignore_encounters) { /* skip encounters */ }
            else try {
                const [spawns] = await db.query(
                    `SELECT * FROM game_map_spawns WHERE map_id=? AND enabled=1
                     AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max`,
                    [p.mapId, p.x, p.x, p.y, p.y]
                );
                // Get region spawn multiplier
                let spawnRateMult = 1.0;
                try {
                    const _spawnRegion = await global.getRegionForMap(p.mapId);
                    if (_spawnRegion?.spawn_rate_mult) spawnRateMult = parseFloat(_spawnRegion.spawn_rate_mult) || 1.0;
                } catch {}

                for (const zone of spawns) {
                    // Roll encounter chance (modified by region spawn_rate_mult)
                    const effectiveRate = (zone.encounter_rate || 10) * spawnRateMult;
                    if (Math.random() * 100 >= effectiveRate) continue;
                    // Level check
                    const charLevel = p.level || 1;
                    if (charLevel < (zone.min_level || 1) || charLevel > (zone.max_level || 50)) continue;
                    // Player flag check (personal quest flags)
                    if (zone.required_flag) {
                        const [flagRow] = await db.query("SELECT state_json FROM characters WHERE id=?", [p.charId]);
                        const flags = flagRow.length ? safeJsonParse(flagRow[0].state_json, {}) : {};
                        if (!flags[zone.required_flag]) continue;
                    }
                    // WORLD FLAG CONDITIONS: only spawn if global world state matches
                    if (zone.world_flag_conditions && !checkWorldFlagConditions(zone.world_flag_conditions)) continue;
                    // Pick an enemy from encounter table
                    const table = safeJsonParse(zone.encounter_table, []);
                    if (!table.length) continue;
                    // Weighted random selection
                    const totalWeight = table.reduce((s, e) => s + (e.weight || 1), 0);
                    let roll = Math.random() * totalWeight;
                    let picked = table[0];
                    for (const entry of table) {
                        roll -= (entry.weight || 1);
                        if (roll <= 0) { picked = entry; break; }
                    }
                    // Check for spawn waves first
                    let waveEnemies = null;
                    try {
                        const [waves] = await db.query(
                            'SELECT * FROM game_spawn_waves WHERE spawn_id=? ORDER BY wave_number ASC',
                            [zone.id]
                        );
                        if (waves.length > 0) {
                            waveEnemies = waves.map(w => ({
                                wave: w.wave_number,
                                enemies: typeof w.enemies === 'string' ? JSON.parse(w.enemies) : (w.enemies || []),
                                delay: w.delay_seconds || 0,
                                isBoss: !!w.is_boss_wave
                            }));
                        }
                    } catch {}

                    // Start PvE battle with this NPC (or wave data)
                    socket.emit('random_encounter', {
                        zoneName: zone.name,
                        npcId: picked.npc_id,
                        npcName: picked.name || 'Enemy',
                        waves: waveEnemies // null if no waves configured
                    });
                    break; // Only one encounter per step
                }
            } catch (spawnErr) { /* Silent fail — encounters are non-critical */ }

            // --- ARENA ZONE CHECK ---
            // TEACHING: Each step we check if the player entered or left a PvP
            // arena zone. Zones are rectangles stored in game_arenas. We compare
            // the player's new position against every active zone on this map.
            //
            // We track arena state on the player object (p.inArena) so we only
            // fire events when the state actually CHANGES (entered / left),
            // not on every single step inside the zone.
            try {
                const [arenas] = await db.query(
                    `SELECT * FROM game_arenas WHERE map_id=? AND enabled=1
                     AND ?>=x_min AND ?<=x_max AND ?>=y_min AND ?<=y_max`,
                    [p.mapId, p.x, p.x, p.y, p.y]
                );

                const zone = arenas.length ? arenas[0] : null;

                if (zone && !p.inArena) {
                    // Player just ENTERED an arena zone
                    const charLevel = p.level || 1;

                    // Level gate check
                    if (charLevel < (zone.min_level || 1) || charLevel > (zone.max_level || 99)) {
                        socket.emit('notification_msg', {
                            text: `⚔️ Level ${zone.min_level}–${zone.max_level} required for ${zone.name}.`,
                            type: 'damage'
                        });
                    } else {
                        p.inArena = {
                            arenaId:          zone.id,
                            arenaName:        zone.name,
                            arenaType:        zone.type || 'OPEN_PVP',
                            minLevel:         zone.min_level,
                            maxLevel:         zone.max_level,
                            entryFee:         zone.entry_fee || 0,
                            rewardMultiplier: parseFloat(zone.reward_multiplier) || 1
                        };
                        // Tell the player themselves
                        socket.emit('arena_entered', p.inArena);
                        // Tell everyone else on the map so their NearbyUI updates
                        // TEACHING: We broadcast the charId + arena state so
                        // other clients can update Game.players[charId].inArena
                        // and refresh their challenge buttons without a full reload.
                        socket.to('map_' + p.mapId).emit('player_arena_changed', {
                            charId:  p.charId,
                            inArena: p.inArena
                        });
                    }

                } else if (!zone && p.inArena) {
                    // Player just LEFT an arena zone
                    p.inArena = null;
                    socket.emit('arena_left', {});
                    // Tell others this player left the arena
                    socket.to('map_' + p.mapId).emit('player_arena_changed', {
                        charId:  p.charId,
                        inArena: null
                    });
                }
            } catch (arenaErr) { /* Silent fail — non-critical */ }

        } catch (err) { console.error("Move error:", err); }
    });

    // =============================================================
    // 3. TELEPORT — instant map/coordinate change
    // =============================================================
    socket.on('teleport', async (data) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;

            // Clear arena state when leaving a map
            if (p.inArena) {
                p.inArena = null;
                socket.emit('arena_left', {});
            }

            const oldMap = p.mapId, newMap = parseInt(data.mapId);

            // Fetch map data so we can use its spawn point if no coords given
            const mapData = await getMapData(db, newMap);
            if (mapData) socket.emit('map_data', mapData);

            // Rep gate check — block entry if region requires faction reputation
            try {
                const destRegion = await global.getRegionForMap(newMap);
                if (destRegion) {
                    const [repGates] = await db.query(
                        'SELECT * FROM game_region_rep_gates WHERE region_id=?', [destRegion.id]
                    ).catch(() => [[]]);
                    for (const gate of repGates) {
                        const [repRow] = await db.query(
                            'SELECT reputation FROM player_faction_rep WHERE character_id=? AND faction_id=?',
                            [p.charId, gate.faction_id]
                        ).catch(() => [[]]);
                        const rep = repRow[0]?.reputation || 0;
                        if (rep < gate.min_reputation || (gate.max_reputation != null && rep > gate.max_reputation)) {
                            socket.emit('chat_msg', {
                                channel: 'system', from: 'System',
                                text: gate.deny_message || 'You are not welcome here.',
                                ts: Date.now()
                            });
                            socket.emit('force_move', { x: p.x, y: p.y });
                            return; // Block the teleport
                        }
                    }
                }
            } catch {}

            socket.leave('map_' + oldMap);
            socket.to('map_' + oldMap).emit('player_left', p.charId);

            // Use provided coords, or the map's defined spawn, or dead-centre
            const spawnX = data.x ? parseInt(data.x) : ((mapData && mapData.spawn_x) || Math.floor((mapData?.width  || 20) / 2));
            const spawnY = data.y ? parseInt(data.y) : ((mapData && mapData.spawn_y) || Math.floor((mapData?.height || 20) / 2));

            p.mapId = newMap; p.x = spawnX; p.y = spawnY;
            await db.query("UPDATE characters SET map_id=?, x=?, y=? WHERE id=?", [newMap, spawnX, spawnY, p.charId]);
            socket.join('map_' + newMap);

            // Teaching: emit map_changed FIRST so client clears old canvas,
            // THEN player_list so it can draw other players on the new map.
            // Fast Travel discovery: if the destination map allows it,
            // record this map in the player's discovered warp points.
            if (mapData && mapData.fast_travel_enabled) {
                try {
                    const [ftRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
                    const ftState = ftRow.length ? safeJsonParse(ftRow[0].state_json, {}) : {};
                    const warpPoints = Array.isArray(ftState.warpPoints) ? ftState.warpPoints : [];
                    if (!warpPoints.some(wp => wp.mapId === newMap)) {
                        warpPoints.push({ mapId: newMap, name: mapData.name, discoveredAt: Date.now() });
                        ftState.warpPoints = warpPoints;
                        await db.query('UPDATE characters SET state_json=? WHERE id=?',
                            [JSON.stringify(ftState), p.charId]);
                        socket.emit('warp_discovered', { mapId: newMap, name: mapData.name });

                        // ── ACHIEVEMENT: maps_visited trigger ────────────────
                        try {
                            const achievementRoutes = require('./routes/achievementRoutes');
                            await achievementRoutes.checkForCharacter(
                                db, io, p.charId, 'maps_visited', warpPoints.length
                            );
                        } catch(ae) { /* non-critical */ }
                    }
                } catch (e) { /* non-critical */ }
            }

            const _newRegion = await global.getRegionForMap(newMap).catch(() => null);
            socket.emit('map_changed', {
                mapId:   newMap,
                mapName: mapData ? mapData.name : '',
                x:       spawnX,
                y:       spawnY,
                zoneType:    mapData ? (mapData.zone_type    || 'WORLD') : 'WORLD',
                floorNumber: mapData ? (mapData.floor_number || null)    : null,
                dungeonName: mapData ? (mapData.dungeon_name || null)    : null,
                region: _newRegion ? {
                    id: _newRegion.id, name: _newRegion.name,
                    danger_level: _newRegion.danger_level,
                    corruption_level: _newRegion.corruption_level,
                    faction_control: _newRegion.faction_control,
                    weather_override: _newRegion.weather_override,
                    pvp_enabled: _newRegion.pvp_enabled,
                    is_sanctuary: _newRegion.is_sanctuary,
                    active_tags_json: _newRegion.active_tags_json,
                    xp_mult: _newRegion.xp_mult, gold_mult: _newRegion.gold_mult,
                } : null,
            });
            // AI region description (non-blocking)
            ai.describeRegion(db, {
                mapName: mapData?.name, regionName: _newRegion?.name,
                weather: _newRegion?.weather_override, timeOfDay: global._worldTime?.[1]?.phase,
                dangerLevel: _newRegion?.danger_level,
            }).then(desc => {
                if (desc) socket.emit('notification', { type: 'info', message: desc });
            }).catch(() => {});

            // Exclude self from player_list — client already knows its own position
            socket.emit('player_list', Object.values(onlinePlayers).filter(pl => pl.mapId === newMap && pl.charId !== p.charId));

            // Send NPCs for the new map
            await ctx.loadMapNpcs(newMap);
            socket.emit('npc_list', ctx.getNpcsForMap(newMap));
            socket.to('map_' + newMap).emit('player_joined', p);

            // Teleport companions to new map
            const _tpComps = ctx.getActiveCompanions(p.charId);
            for (const comp of _tpComps) {
                comp.mapId = newMap;
                comp.x = p.x;
                comp.y = p.y;
            }
            if (_tpComps.length) {
                socket.emit('companion_list', _tpComps);
            }

            // Crowd reaction + environmental reaction on the new map
            await ctx._triggerCrowdReaction(socket, db, p, newMap);
            await ctx._triggerEnvironmentalReaction(socket, db, p, newMap);
        } catch (err) { console.error("Teleport error:", err); }
    });

    // =============================================================
    // 3b. FAST TRAVEL — teleport to a previously-discovered warp point
    // =============================================================
    socket.on('fast_travel', async ({ mapId }) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            const destMap = parseInt(mapId);

            // Validate: player must have discovered this warp point
            const [ftRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
            const ftState = ftRow.length ? safeJsonParse(ftRow[0].state_json, {}) : {};
            const warpPoints = Array.isArray(ftState.warpPoints) ? ftState.warpPoints : [];
            const knownWarp  = warpPoints.find(wp => wp.mapId === destMap);
            if (!knownWarp) {
                socket.emit('notification', { text: "You haven't discovered that location yet.", type: 'error' });
                return;
            }

            // Re-use the teleport event (fires through the same path)
            const mapData = await getMapData(db, destMap);
            if (!mapData || !mapData.fast_travel_enabled) {
                socket.emit('notification', { text: 'Fast travel is not available to that location.', type: 'error' });
                return;
            }
            // Emit as a normal teleport through the existing path
            socket.emit('teleport', { mapId: destMap });
            socket.emit('notification', { text: `✈️ Fast travel to ${mapData.name}...`, type: 'info' });
        } catch (e) { console.error('Fast travel error:', e); }
    });

    // =============================================================
    // 4. INTERACT (tile-based object/NPC/chest interaction)
    // =============================================================
    // TEACHING: The interact handler is the Swiss Army knife of game
    // interaction. It checks (in order):
    //   1. Sign objects at player position
    //   2. Live wandering NPCs (dialogue tree + AI chat)
    //   3. Map events (chests, doors, switches via event_runner)
    socket.on('interact', async ({ x, y }) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            const map = await getMapData(db, p.mapId);
            if (!map) return;

            // Check for interactable objects at player position (signs with text, etc.)
            if (map.objects && Array.isArray(map.objects)) {
                const obj = map.objects.find(o => {
                    const dist = Math.abs(o.x - p.x) + Math.abs(o.y - p.y);
                    return dist <= 1 && o.preset === 'SIGN' && o.text;
                });
                if (obj) {
                    socket.emit('event_queue', [
                        { cmd: 'dialogue', speaker: obj.label || 'Sign', text: obj.text }
                    ]);
                    return;
                }
            }

            // Load player state
            const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
            const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};

            // Check if the player is interacting with a live wandering NPC
            // (NPCs that move can no longer be matched by fixed tile position)
            const liveNpc = ctx.getNpcsForMap(p.mapId).find(n => {
                const dist = Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
                return dist <= 1; // adjacent or same tile
            });

            if (liveNpc) {
                // ── DIALOGUE TREE CHECK ──────────────────────────────
                // If NPC has a script_key and dialogue mode allows scripts,
                // execute the dialogue tree instead of showing the generic menu.
                let dialogueMode = 'script_then_ai';
                try {
                    const [modeRow] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='npc_dialogue_mode'");
                    if (modeRow.length) dialogueMode = modeRow[0].setting_value || 'script_then_ai';
                } catch {}

                if (liveNpc.scriptKey && dialogueMode !== 'ai_only') {
                    try {
                        const [scriptRows] = await db.query(
                            'SELECT script_json FROM game_scripts WHERE script_key=? LIMIT 1',
                            [liveNpc.scriptKey]
                        );
                        if (scriptRows.length && scriptRows[0].script_json) {
                            const scriptEvents = typeof scriptRows[0].script_json === 'string'
                                ? JSON.parse(scriptRows[0].script_json)
                                : scriptRows[0].script_json;

                            if (Array.isArray(scriptEvents) && scriptEvents.length > 0) {
                                // Convert script events to event_queue commands
                                const eventQueue = [];
                                for (const ev of scriptEvents) {
                                    if (!ev || !ev.actions) continue;
                                    for (const action of (ev.actions || [])) {
                                        switch (action.type) {
                                            case 'DIALOGUE':
                                                eventQueue.push({
                                                    cmd: 'dialogue',
                                                    speaker: action.speaker || liveNpc.name,
                                                    text: action.text || ''
                                                });
                                                break;
                                            case 'CHOICE':
                                                eventQueue.push({
                                                    cmd: 'npc_choice_menu',
                                                    npcName: liveNpc.name,
                                                    choices: (action.choices || []).map((c, i) => ({
                                                        id: `script_choice_${i}`,
                                                        text: c.text || c
                                                    }))
                                                });
                                                break;
                                            case 'QUEST_START':
                                                eventQueue.push({ cmd: 'quest_start', questId: action.questId });
                                                break;
                                            case 'SET_FLAG':
                                                if (action.flag) {
                                                    await db.query(
                                                        "UPDATE characters SET state_json = JSON_SET(COALESCE(state_json,'{}'), ?, ?) WHERE id=?",
                                                        [`$.${action.flag}`, action.value || 'true', p.charId]
                                                    ).catch(() => {});
                                                }
                                                break;
                                            case 'GIVE_ITEM':
                                                if (action.itemId) {
                                                    await db.query(
                                                        'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?',
                                                        [p.charId, action.itemId, action.quantity || 1, action.quantity || 1]
                                                    ).catch(() => {});
                                                    eventQueue.push({ cmd: 'dialogue', speaker: 'System', text: `Received item!` });
                                                }
                                                break;
                                            case 'GIVE_GOLD':
                                                if (action.amount) {
                                                    await db.query('UPDATE users SET currency=currency+? WHERE id=?', [action.amount, p.userId]).catch(() => {});
                                                    eventQueue.push({ cmd: 'dialogue', speaker: 'System', text: `Received ${action.amount} gold!` });
                                                }
                                                break;
                                            case 'TELEPORT':
                                                if (action.mapId) {
                                                    eventQueue.push({ cmd: 'teleport', mapId: action.mapId, x: action.x || 5, y: action.y || 5 });
                                                }
                                                break;
                                            case 'OPEN_SHOP':
                                                if (action.shopId || liveNpc.shopId) {
                                                    eventQueue.push({ cmd: 'shop_open', shopId: action.shopId || liveNpc.shopId });
                                                }
                                                break;
                                        }
                                    }
                                }

                                // If script produced events, send them and skip generic menu
                                if (eventQueue.length > 0) {
                                    // Still offer talk option at the end if mode is script_then_ai
                                    if (dialogueMode === 'script_then_ai') {
                                        eventQueue.push({
                                            cmd: 'npc_choice_menu',
                                            npcName: liveNpc.name,
                                            choices: [
                                                { id: 'talk', text: '💬 Ask something else (AI)' },
                                                { id: 'farewell', text: '👋 Farewell' }
                                            ]
                                        });
                                    }
                                    socket._talkingTo = liveNpc;
                                    socket.emit('event_queue', eventQueue);
                                    return;
                                }
                            }
                        }
                    } catch (scriptErr) {
                        console.warn('[Dialogue] Script execution error for', liveNpc.name, scriptErr.message);
                    }

                    // If script_only mode and no script worked, show a generic message
                    if (dialogueMode === 'script_only') {
                        socket.emit('event_queue', [
                            { cmd: 'dialogue', speaker: liveNpc.name, text: '*looks at you but says nothing.*' },
                        ]);
                        return;
                    }
                }

                // ── STANDARD MENU (AI mode or no script found) ──────
                // Load memory for this player+NPC pair
                const [memRows] = await db.query(
                    'SELECT facts_json, reputation FROM npc_memories WHERE char_id=? AND npc_name=?',
                    [p.charId, liveNpc.name]
                );
                const mem = memRows.length
                    ? { facts: safeJsonParse(memRows[0].facts_json, []), reputation: memRows[0].reputation || 0 }
                    : { facts: [], reputation: 0 };

                // Build a CHOICE menu based on what this NPC offers
                const choices = [];

                // --- Quest offers: filter to ones not started or completed ---
                if (liveNpc.questOffers && liveNpc.questOffers.length) {
                    const playerQuests = charState.quests || {};
                    const offerIds = liveNpc.questOffers.filter(qid => {
                        const qs = playerQuests[qid];
                        return !qs || (qs.step !== -1); // not completed
                    });
                    if (offerIds.length) {
                        const [qRows] = await db.query(
                            'SELECT id, name, description FROM game_quests WHERE id IN (?) AND is_active=1',
                            [offerIds]
                        );
                        for (const q of qRows) {
                            const already = charState.quests && charState.quests[q.id];
                            choices.push({
                                id: `quest_${q.id}`,
                                text: already
                                    ? `📜 "${q.name}" — Check in`
                                    : `📜 "${q.name}" — Tell me more`
                            });
                        }
                    }
                }

                // --- Shop offer ---
                if (liveNpc.shopId) {
                    choices.push({ id: `shop_${liveNpc.shopId}`, text: '🏪 Browse your wares' });
                    // Haggle only available if player has interacted before
                    if (mem.reputation >= 20) {
                        choices.push({ id: `haggle_${liveNpc.shopId}`, text: '💰 Ask for a deal...' });
                    }
                }

                // --- Companion recruit/dismiss ---
                if (liveNpc.isRecruitable) {
                    const [existComp] = await db.query(
                        'SELECT id, is_active FROM character_companions WHERE character_id=? AND npc_id=? LIMIT 1',
                        [p.charId, liveNpc.id]);
                    if (existComp.length && existComp[0].is_active) {
                        choices.push({ id: 'companion_dismiss', text: '👋 I need you to wait here' });
                    } else {
                        const meetsRep = mem.reputation >= (liveNpc.recruitRepReq || 50);
                        let meetsQuest = true;
                        if (liveNpc.recruitQuestReq) {
                            const qs = charState.quests || {};
                            meetsQuest = qs[liveNpc.recruitQuestReq] && qs[liveNpc.recruitQuestReq].step === -1;
                        }
                        const currentComps = ctx.getActiveCompanions(p.charId).length;
                        if (meetsRep && meetsQuest && currentComps < 3) {
                            choices.push({ id: 'companion_recruit', text: '⚔️ Join my party!' });
                        } else if (!meetsRep) {
                            choices.push({ id: 'companion_locked_rep', text: '🔒 Join my party (needs higher reputation)' });
                        } else if (!meetsQuest) {
                            choices.push({ id: 'companion_locked_quest', text: '🔒 Join my party (complete a quest first)' });
                        } else if (currentComps >= 3) {
                            choices.push({ id: 'companion_full', text: '🔒 Join my party (party full)' });
                        }
                    }
                }

                // Always offer talk + farewell
                choices.push({ id: 'talk', text: '💬 Just talking' });
                choices.push({ id: 'farewell', text: '👋 Farewell' });

                // Reputation-aware greeting
                let greeting;
                // Derive title for use in greeting
                const title = await ctx._deriveTitle(p.charId, db);
                const address = title ? `${p.name} ${title}` : p.name;

                // Mood-aware greeting (overrides reputation greeting if set)
                if (liveNpc.mood === 'happy')    greeting = `*${liveNpc.name} grins.* "Ah, ${address}! You've come at a good time!"`;
                else if (liveNpc.mood === 'fearful')  greeting = `*${liveNpc.name} glances around nervously.* "Thank the gods, ${address}. Something is wrong."`;
                else if (liveNpc.mood === 'angry')    greeting = `*${liveNpc.name} scowls.* "What do you want, ${address}?"`;
                else if (liveNpc.mood === 'grieving') greeting = `*${liveNpc.name} looks hollow.* "...${address}. I can barely speak right now."`;
                else if (liveNpc.mood === 'excited')  greeting = `*${liveNpc.name} waves eagerly.* "${address}! Come here, quickly!"`;
                else if (mem.reputation > 50)    greeting = `*${liveNpc.name} smiles.* "Good to see you again, ${address}."`;
                else if (mem.reputation < -30)   greeting = `*${liveNpc.name} eyes you warily.* "You again. What do you want?"`;
                else if (mem.facts.length > 0)  greeting = `"Ah, you're back. What can I do for you?"`;
                else                            greeting = `*${liveNpc.name} looks you over.* "Yes? What do you need?"`;

                socket._talkingTo = liveNpc;
                socket._talkingMem = mem;
                socket.emit('event_queue', [
                    { cmd: 'dialogue', speaker: liveNpc.name, text: greeting },
                    { cmd: 'npc_choice_menu', npcName: liveNpc.name, choices }
                ]);
                return;
            }

            const result = await handleMapEvent({
                triggerType: 'INTERACT',
                x, y,
                mapEvents: map.events,
                socket, db,
                player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                state: charState
            });

            // Save modified state
            if (result && result.state) {
                await db.query("UPDATE characters SET state_json=? WHERE id=?",
                    [JSON.stringify(result.state), p.charId]);
                // Refresh world flags in case a SET_WORLD_FLAG action fired
                await loadWorldFlags(db);
            }
        } catch (err) {
            console.error("Interact error:", err);
        }
    });

    // =============================================================
    // TUTORIAL COMPLETE
    // =============================================================
    // TEACHING: Saves tutorial_done into state_json so the server
    // can tell the client not to show it again on any device.
    socket.on('tutorial_complete', async () => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            // Merge tutorial_done into existing state_json
            const [rows] = await db.query('SELECT state_json FROM characters WHERE id=?', [p.charId]);
            let st = {};
            try { st = JSON.parse(rows[0]?.state_json || '{}'); } catch {}
            st.tutorial_done = true;
            await db.query('UPDATE characters SET state_json=? WHERE id=?',
                [JSON.stringify(st), p.charId]);
        } catch (err) { console.error('tutorial_complete error:', err); }
    });

    // =============================================================
    // EQUIP ITEM — equipment management
    // =============================================================
    socket.on('equip_item', async ({ itemId, slotKey }) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            // Direct DB logic (same as routes/game.js equip-item)
            const [inv] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, itemId]);
            if (!inv.length) { socket.emit('equip_result', { success: false, message: 'Not in inventory.' }); return; }
            const [itemR] = await db.query("SELECT * FROM game_items WHERE id=?", [itemId]);
            if (!itemR.length) { socket.emit('equip_result', { success: false, message: 'Item not found.' }); return; }
            if (itemR[0].slot !== slotKey && itemR[0].slot !== 'ANY') { socket.emit('equip_result', { success: false, message: `Goes in ${itemR[0].slot}.` }); return; }
            // Unequip current
            const [cur] = await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
            if (cur.length) {
                const [ex] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, cur[0].item_id]);
                if (ex.length) await db.query("UPDATE character_items SET quantity=quantity+1 WHERE id=?", [ex[0].id]);
                else await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)", [p.charId, cur[0].item_id]);
                await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
            }
            // Equip new
            await db.query("INSERT INTO character_equipment(character_id,slot_key,item_id)VALUES(?,?,?)", [p.charId, slotKey, itemId]);
            if (inv[0].quantity > 1) await db.query("UPDATE character_items SET quantity=quantity-1 WHERE id=?", [inv[0].id]);
            else await db.query("DELETE FROM character_items WHERE id=?", [inv[0].id]);
            socket.emit('equip_result', { success: true, message: 'Equipped!' });
        } catch (err) { socket.emit('equip_result', { success: false, message: 'Error' }); }
    });

    // =============================================================
    // UNEQUIP ITEM — equipment removal
    // =============================================================
    socket.on('unequip_item', async ({ slotKey }) => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;
            const [eq] = await db.query("SELECT * FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
            if (!eq.length) { socket.emit('equip_result', { success: false, message: 'Nothing there.' }); return; }
            const [ex] = await db.query("SELECT * FROM character_items WHERE character_id=? AND item_id=?", [p.charId, eq[0].item_id]);
            if (ex.length) await db.query("UPDATE character_items SET quantity=quantity+1 WHERE id=?", [ex[0].id]);
            else await db.query("INSERT INTO character_items(character_id,item_id,quantity)VALUES(?,?,1)", [p.charId, eq[0].item_id]);
            await db.query("DELETE FROM character_equipment WHERE character_id=? AND slot_key=?", [p.charId, slotKey]);
            socket.emit('equip_result', { success: true, message: 'Unequipped.' });
        } catch (err) { socket.emit('equip_result', { success: false, message: 'Error' }); }
    });

    // =============================================================
    // REQUEST RESPAWN — death respawn
    // =============================================================
    socket.on('request_respawn', async () => {
        try {
            const p = onlinePlayers[socket.id];
            if (!p) return;

            // Load respawn coordinates and current max_hp
            const [charRows] = await db.query(
                'SELECT max_hp, respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?',
                [p.charId]
            );
            if (!charRows.length) return;
            const char = charRows[0];

            const respawnHp  = Math.max(1, Math.floor(char.max_hp * 0.20));
            const respawnMap = char.respawn_map_id || 1;
            const respawnX   = char.respawn_x || 10;
            const respawnY   = char.respawn_y || 10;

            // Save new position + restored HP
            await db.query(
                'UPDATE characters SET current_hp=?, map_id=?, x=?, y=? WHERE id=?',
                [respawnHp, respawnMap, respawnX, respawnY, p.charId]
            );

            // Tell players on old map this player left
            socket.to('map_' + p.mapId).emit('player_left', p.charId);
            socket.leave('map_' + p.mapId);

            // Update server-side memory
            p.mapId = respawnMap;
            p.x     = respawnX;
            p.y     = respawnY;

            // Join new map room
            socket.join('map_' + respawnMap);

            // Tell client to reinitialise (same as joining for the first time)
            // The client will emit join_game which triggers init_self
            socket.emit('respawn_complete', {
                mapId: respawnMap,
                x: respawnX,
                y: respawnY,
                hp: respawnHp
            });

            // AI death narration (non-blocking)
            const map = await getMapData(db, p.mapId).catch(() => null);
            ai.narrateDeath(db, { playerName: p.name, location: map?.name }).then(text => {
                if (text) socket.emit('notification', { type: 'warning', message: text });
            }).catch(() => {});

        } catch (err) { console.error('Respawn error:', err); }
    });

    // =============================================================
    // ACTION SLOTS — get status, perform campaign-restricted actions
    // =============================================================

    // Get all action slot statuses for the current campaign
    socket.on('get_action_slots', async ({ campaignId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[char]] = await db.query('SELECT race_id, class_id FROM characters WHERE id=?', [p.charId]);
            const [[race]] = char?.race_id ? await db.query('SELECT name FROM game_races WHERE id=?', [char.race_id]) : [[]];
            const [[cls]] = char?.class_id ? await db.query('SELECT name FROM game_classes WHERE id=?', [char.class_id]) : [[]];
            const slots = await actionSlots.getActionSlotStatus(db, {
                characterId: p.charId, campaignId,
                raceName: race?.name, className: cls?.name,
            });
            socket.emit('action_slots', { campaignId, slots });
        } catch (err) { console.warn('get_action_slots error:', err.message); socket.emit('action_slots', { campaignId, slots: [] }); }
    });

    // Perform a campaign action (train, spar, meditate, etc.)
    socket.on('campaign_action', async ({ campaignId, actionType, targetCharId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[char]] = await db.query('SELECT * FROM characters WHERE id=?', [p.charId]);
            if (!char) return;
            const [[race]] = char.race_id ? await db.query('SELECT name FROM game_races WHERE id=?', [char.race_id]) : [[]];
            const [[cls]] = char.class_id ? await db.query('SELECT name FROM game_classes WHERE id=?', [char.class_id]) : [[]];
            const raceName = race?.name || '';
            const className = cls?.name || '';

            // Check if action is allowed
            const check = await actionSlots.canPerformAction(db, {
                characterId: p.charId, campaignId, actionType, raceName, className,
            });
            if (!check.allowed) {
                return socket.emit('campaign_action_result', { success: false, message: check.reason, actionType });
            }

            // Get ruleset for gain calculation
            const ruleset = await actionSlots.getRuleset(db, campaignId);
            const { multiplier, flatBonus } = ruleset
                ? await actionSlots.getGainMultiplier(db, { rulesetId: ruleset.id, raceName, className, actionType })
                : { multiplier: 1, flatBonus: 0 };

            // Get the action window config for effect formula
            let effectResult = {};
            if (ruleset) {
                const windows = await actionSlots.getActionWindows(db, ruleset.id);
                const aw = windows.find(w => w.action_type === actionType);
                const effect = aw?.effect_json ? (typeof aw.effect_json === 'string' ? JSON.parse(aw.effect_json) : aw.effect_json) : null;

                if (effect?.type === 'stat_gain' && effect.stat && effect.formula) {
                    // Simple formula evaluation: "base * 0.02" or "50 + level * 10"
                    const base = ruleset.stat_mode === 'single'
                        ? (char.atk || char.level * 100)  // use atk as powerlevel proxy, or derive
                        : (char[effect.stat] || 0);
                    const vars = { base, level: char.level, atk: char.atk, def: char.def, speed: char.speed };
                    let gain = 0;
                    try {
                        // Safe eval: only allow basic math with known variables
                        const formula = effect.formula.replace(/[a-z_]+/gi, m => vars[m] !== undefined ? vars[m] : 0);
                        gain = Math.round(Function('"use strict";return (' + formula + ')')());
                    } catch { gain = flatBonus || 1; }
                    gain = Math.round(gain * multiplier) + flatBonus;

                    // Apply the gain
                    const statCol = effect.stat === 'powerlevel' ? 'atk' : effect.stat;
                    if (['atk', 'def', 'mo', 'md', 'speed', 'luck', 'max_hp', 'max_mp'].includes(statCol)) {
                        await db.query(`UPDATE characters SET \`${statCol}\`=\`${statCol}\`+? WHERE id=?`, [gain, p.charId]);
                    } else if (statCol === 'experience') {
                        await db.query('UPDATE characters SET experience=experience+? WHERE id=?', [gain, p.charId]);
                    }
                    effectResult = { stat: effect.stat, gain, label: ruleset.primary_stat_name || effect.stat };
                }
            }

            // Record the action
            await actionSlots.recordAction(db, {
                characterId: p.charId, campaignId, actionType, resultJson: effectResult,
            });

            // Get updated slot status
            const updatedCheck = await actionSlots.canPerformAction(db, {
                characterId: p.charId, campaignId, actionType, raceName, className,
            });

            socket.emit('campaign_action_result', {
                success: true,
                actionType,
                ...effectResult,
                remaining: updatedCheck.remaining,
                maxUses: updatedCheck.maxUses,
                message: effectResult.gain
                    ? `${effectResult.label || actionType} +${effectResult.gain}! (${updatedCheck.remaining} remaining)`
                    : `${actionType} complete! (${updatedCheck.remaining} remaining)`,
            });

            // If in a DM session, broadcast to session
            if (global._dmSessions?.[campaignId]) {
                io.to('dm_' + campaignId).emit('dm_response', {
                    speaker: 'System',
                    text: `${p.name} used ${actionType}${effectResult.gain ? ` (+${effectResult.gain} ${effectResult.label || ''})` : ''}.`,
                    sessionId: campaignId,
                });
            }
        } catch (err) {
            console.error('campaign_action error:', err);
            socket.emit('campaign_action_result', { success: false, message: err.message, actionType });
        }
    });

    // Check campaign move limit
    socket.on('check_campaign_moves', async ({ campaignId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[char]] = await db.query('SELECT race_id, class_id FROM characters WHERE id=?', [p.charId]);
            const [[race]] = char?.race_id ? await db.query('SELECT name FROM game_races WHERE id=?', [char.race_id]) : [[]];
            const [[cls]] = char?.class_id ? await db.query('SELECT name FROM game_classes WHERE id=?', [char.class_id]) : [[]];
            // Check for flying status
            const [flyRow] = await db.query(
                `SELECT 1 FROM character_status_effects cse
                 JOIN game_statuses s ON s.id=cse.status_id
                 WHERE cse.character_id=? AND s.effects LIKE '%fly%'
                 AND (cse.expires_at IS NULL OR cse.expires_at > NOW()) LIMIT 1`, [p.charId]);
            const isFlying = flyRow.length > 0;

            const moveCheck = await actionSlots.checkMoveLimit(db, {
                characterId: p.charId, campaignId,
                raceName: race?.name, className: cls?.name, isFlying,
            });
            socket.emit('campaign_move_status', { campaignId, ...moveCheck });
        } catch (err) { console.warn('check_campaign_moves error:', err.message); }
    });

    // =============================================================
    // TABLETOP: Short rest (spend hit dice to heal)
    socket.on('short_rest', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const tabletop = require('./battle/tabletop-rules');
            const [[char]] = await db.query('SELECT current_hp, max_hp, def, level FROM characters WHERE id=?', [p.charId]);
            if (!char) return;
            const combatant = {
                currentHp: char.current_hp, maxHp: char.max_hp,
                def: char.def, level: char.level,
                _hitDice: { max: char.level, current: char.level, size: 8 },
            };
            const results = tabletop.shortRest(combatant);
            await db.query('UPDATE characters SET current_hp=? WHERE id=?', [combatant.currentHp, p.charId]);
            socket.emit('notification', { type: 'success', message: `Short rest: ${results.join('. ') || 'Rested.'}` });
        } catch { socket.emit('notification', { type: 'error', message: 'Rest failed.' }); }
    });

    // TABLETOP: Long rest (full restore)
    socket.on('long_rest', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            await db.query('UPDATE characters SET current_hp=max_hp, current_mp=max_mp WHERE id=?', [p.charId]);
            socket.emit('notification', { type: 'success', message: 'Long rest: fully restored!' });
        } catch { socket.emit('notification', { type: 'error', message: 'Rest failed.' }); }
    });

    // REST AT INN — restore HP/MP
    // =============================================================
    socket.on('rest_at_inn', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        try {
            const innId = data?.innId || 1;
            const [innRows] = await db.query('SELECT * FROM game_inns WHERE id=? AND is_active=1', [innId]);
            if (!innRows.length) return socket.emit('rest_result', { success: false, message: 'Inn not found' });
            const inn = innRows[0];

            // Check currency
            const [userRow] = await db.query('SELECT currency FROM users WHERE id=?', [p.userId]);
            if (!userRow.length || userRow[0].currency < inn.cost_per_rest) {
                return socket.emit('rest_result', { success: false, message: `Not enough gold. Need ${inn.cost_per_rest}.` });
            }

            // Deduct cost
            await db.query('UPDATE users SET currency=currency-? WHERE id=?', [inn.cost_per_rest, p.userId]);

            // Heal character
            const healHp = inn.heal_hp_pct || 1.0;
            const healMp = inn.heal_mp_pct || 1.0;
            await db.query(
                'UPDATE characters SET current_hp=FLOOR(max_hp*?), current_mp=FLOOR(max_mp*?) WHERE id=?',
                [healHp, healMp, p.charId]
            );

            // Reset battle chain if configured
            if (inn.reset_battle_chain) {
                // Battle chain is in-memory, reset for this character
                const battle = BattleManager.getBattleByCharId?.(p.charId);
                if (battle?.combatants?.[p.charId]) {
                    battle.combatants[p.charId]._battleChain = 0;
                }
            }

            socket.emit('rest_result', {
                success: true,
                message: `Rested at ${inn.name}. HP and MP restored! (-${inn.cost_per_rest} gold)`,
                cost: inn.cost_per_rest,
            });
            socket.emit('event_queue', [
                { cmd: 'dialogue', speaker: 'Innkeeper', text: `Welcome! Rest well, traveler. That'll be ${inn.cost_per_rest} gold.` },
                { cmd: 'dialogue', speaker: 'System', text: 'HP and MP fully restored.' },
            ]);
        } catch (e) {
            socket.emit('rest_result', { success: false, message: e.message });
        }
    });

    // =============================================================
    // DISTRIBUTE AP — allocate ability points
    // =============================================================
    socket.on('distribute_ap', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        try {
            const { stat, points } = data;
            if (!stat || !points || points < 1 || !Number.isInteger(points)) return;
            const validStats = ['strength', 'defense', 'magic_offense', 'magic_defense', 'speed', 'luck', 'max_hp', 'max_mp'];
            if (!validStats.includes(stat)) return;

            // Cap single allocation to prevent absurd stat values
            const maxPerAllocation = 50;
            if (points > maxPerAllocation) return socket.emit('ap_result', { success: false, message: `Max ${maxPerAllocation} AP per allocation.` });

            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                const [charRow] = await conn.query('SELECT unspent_ap FROM characters WHERE id=? FOR UPDATE', [p.charId]);
                if (!charRow.length || charRow[0].unspent_ap < points) {
                    await conn.rollback(); conn.release();
                    return socket.emit('ap_result', { success: false, message: 'Not enough AP' });
                }

            // Apply points (HP/MP get 5x multiplier per AP, other stats 1:1)
            const mult = (stat === 'max_hp' || stat === 'max_mp') ? 5 : 1;
            await conn.query(
                `UPDATE characters SET unspent_ap=unspent_ap-?, ${stat}=${stat}+? WHERE id=?`,
                [points, points * mult, p.charId]
            );
            // If max_hp/mp increased, heal current too
            if (stat === 'max_hp') await conn.query('UPDATE characters SET current_hp=current_hp+? WHERE id=?', [points * mult, p.charId]);
            if (stat === 'max_mp') await conn.query('UPDATE characters SET current_mp=current_mp+? WHERE id=?', [points * mult, p.charId]);

            await conn.commit();
            conn.release();
            } catch (txErr) { await conn.rollback().catch(() => {}); conn.release(); throw txErr; }

            socket.emit('ap_result', { success: true, stat, points, message: `+${points * mult} ${stat}` });
        } catch (e) {
            socket.emit('ap_result', { success: false, message: e.message });
        }
    });

    // =============================================================
    // INTERACT OBJECT — stateful map object interaction
    // =============================================================
    // TEACHING: Map objects (levers, torches, buttons) have persistent
    // state stored in game_map_object_state. When a player interacts,
    // we toggle/set the state and broadcast to all players on the map.
    socket.on('interact_object', async (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        const { objectIndex, action } = data;
        try {
            // Load current object state
            const [rows] = await db.query(
                'SELECT state_key FROM game_map_object_state WHERE map_id=? AND object_index=?',
                [p.mapId, objectIndex]
            );
            const currentState = rows.length ? rows[0].state_key : 'default';

            // Determine new state based on action
            let newState = currentState;
            if (action === 'push') newState = 'pushed';
            else if (action === 'toggle') newState = currentState === 'default' ? 'active' : 'default';
            else if (action === 'open') newState = 'open';
            else if (action === 'light') newState = currentState === 'lit' ? 'unlit' : 'lit';

            await db.query(
                'INSERT INTO game_map_object_state (map_id, object_index, state_key, changed_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE state_key=VALUES(state_key), changed_by=VALUES(changed_by)',
                [p.mapId, objectIndex, newState, p.charId]
            );

            // Broadcast state change to all players on this map
            io.to('map_' + p.mapId).emit('object_state_change', {
                objectIndex, state: newState, changedBy: p.name
            });
            // Visual feedback particle at the object location
            const mapDataObj = await getMapData(db, p.mapId);
            const mapEvts = mapDataObj?.events || [];
            const obj = mapEvts[objectIndex];
            if (obj) {
                const preset = action === 'light' ? 'fire' : 'impact';
                io.to('map_' + p.mapId).emit('map_particle', { preset, x: obj.x, y: obj.y });
            }
            socket.emit('interact_result', { success: true, objectIndex, state: newState });
        } catch (e) {
            socket.emit('interact_result', { success: false, message: e.message });
        }
    });

    // =============================================================
    // SPAWN MAP PARTICLE — GM/event-driven visual effects
    // =============================================================
    socket.on('spawn_map_particle', (data) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        const { preset, x, y, mapId } = data;
        const targetMap = mapId || p.mapId;
        io.to('map_' + targetMap).emit('map_particle', {
            preset: preset || 'sparkle',
            x: typeof x === 'number' ? x : p.x,
            y: typeof y === 'number' ? y : p.y,
        });
    });

    // =============================================================
    // REQUEST REFRESH — re-emit character/map/quest state (pull-to-refresh)
    // =============================================================
    socket.on('request_refresh', async () => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        try {
            // Re-fetch character from DB
            const [[char]] = await db.query('SELECT * FROM characters WHERE id=?', [p.charId]);
            if (!char) return;

            // Update online state
            p.x = char.x; p.y = char.y; p.mapId = char.map_id; p.level = char.level;

            // Re-emit init_self with fresh stats
            socket.emit('init_self', {
                ...p,
                hp: char.current_hp, maxHp: char.max_hp,
                mp: char.current_mp || 0, maxMp: char.max_mp || 0,
                atk: char.atk, def: char.def,
                mo: char.mo, md: char.md,
                speed: char.speed, luck: char.luck,
                limitbreak: Number(char.limitbreak || 0),
                breaklevel: Number(char.breaklevel || 1),
            });

            // Re-emit map data
            const mapData = await getMapData(db, p.mapId);
            if (mapData) socket.emit('map_data', mapData);

            // Player list for current map
            const mapPlayers = Object.values(onlinePlayers).filter(mp => mp.mapId === p.mapId && mp.charId !== p.charId);
            socket.emit('player_list', mapPlayers);

            // NPCs
            socket.emit('npc_list', ctx.getNpcsForMap(p.mapId));

            // Companions
            const comps = await ctx.loadCompanions(p.charId);
            socket.emit('companion_list', comps);

            // Active statuses
            const [activeStatuses] = await db.query(
                `SELECT s.id, s.name, s.icon, s.type, s.effects FROM character_status_effects cse
                 JOIN game_statuses s ON s.id = cse.status_id
                 WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())`,
                [p.charId]
            );
            const owFx = {};
            const statusList = [];
            for (const row of activeStatuses) {
                statusList.push({ id: row.id, name: row.name, icon: row.icon, type: row.type });
                try { const fx = typeof row.effects === 'string' ? JSON.parse(row.effects) : row.effects; if (fx) Object.assign(owFx, fx); } catch {}
            }
            socket.emit('active_statuses', statusList);
            socket.emit('overworld_effects', owFx);

            // World time
            if (global._worldTime) socket.emit('world_time', global._worldTime);
        } catch (err) { console.warn('request_refresh error:', err.message); }
    });

    // =============================================================
    // WORLD EVENTS — active events, join, history
    // =============================================================
    socket.on('world_events_get_active', async () => {
        try {
            const charId = onlinePlayers[socket.id]?.charId;
            const [events] = await db.query(
                `SELECT e.*,
                 (SELECT COUNT(*) FROM game_world_event_participants WHERE event_id=e.id) as participant_count,
                 (SELECT id FROM game_world_event_participants WHERE event_id=e.id AND character_id=?) as my_participation,
                 (SELECT contribution FROM game_world_event_participants WHERE event_id=e.id AND character_id=?) as my_contribution
                 FROM game_world_events e WHERE e.is_active=1 ORDER BY e.started_at DESC`,
                [charId || 0, charId || 0]);
            socket.emit('world_events_active', events.map(e => ({
                ...e, am_participating: !!e.my_participation, my_contribution: e.my_contribution || 0
            })));
        } catch (err) { console.error('world_events_get_active error:', err.message); socket.emit('world_events_active', []); }
    });

    socket.on('world_events_get_history', async () => {
        try {
            const [history] = await db.query(
                'SELECT * FROM game_world_event_history ORDER BY ended_at DESC LIMIT 50');
            socket.emit('world_events_history', history);
        } catch { socket.emit('world_events_history', []); }
    });

    socket.on('world_event_join', async ({ eventId }) => {
        const charId = onlinePlayers[socket.id]?.charId;
        if (!charId) return socket.emit('world_event_join_result', { success: false, message: 'No character', eventId });
        try {
            const [[ev]] = await db.query('SELECT * FROM game_world_events WHERE id=? AND is_active=1', [eventId]);
            if (!ev) return socket.emit('world_event_join_result', { success: false, message: 'Event not active', eventId });

            // Level check
            const [[char]] = await db.query('SELECT level FROM characters WHERE id=?', [charId]);
            if (char && ev.min_level && char.level < ev.min_level)
                return socket.emit('world_event_join_result', { success: false, message: `Requires level ${ev.min_level}`, eventId });

            // Capacity check
            if (ev.max_participants > 0) {
                const [[cnt]] = await db.query('SELECT COUNT(*) as c FROM game_world_event_participants WHERE event_id=?', [eventId]);
                if (cnt.c >= ev.max_participants)
                    return socket.emit('world_event_join_result', { success: false, message: 'Event is full', eventId });
            }

            await db.query(
                'INSERT IGNORE INTO game_world_event_participants (event_id, character_id) VALUES (?,?)',
                [eventId, charId]);
            socket.emit('world_event_join_result', { success: true, message: `Joined: ${ev.name}`, eventId });
        } catch (err) {
            socket.emit('world_event_join_result', { success: false, message: 'Failed to join', eventId });
        }
    });

    // =============================================================
    // USER PREFERENCES — render mode, UI settings (persisted to DB)
    // =============================================================
    socket.on('get_preferences', async () => {
        const p = state.onlinePlayers[socket.id];
        if (!p) return;
        try {
            const [[row]] = await db.query('SELECT preferences_json FROM users WHERE id=?', [p.userId]);
            const prefs = row?.preferences_json ? (typeof row.preferences_json === 'string' ? JSON.parse(row.preferences_json) : row.preferences_json) : {};
            socket.emit('preferences', prefs);
        } catch { socket.emit('preferences', {}); }
    });

    socket.on('save_preferences', async (prefs) => {
        const p = state.onlinePlayers[socket.id];
        if (!p || !prefs || typeof prefs !== 'object') return;
        try {
            await db.query('UPDATE users SET preferences_json=? WHERE id=?', [JSON.stringify(prefs), p.userId]);
        } catch (err) { console.warn('save_preferences error:', err.message); }
    });

    // =============================================================
    // TRACK QUEST — persist which quest the player is tracking
    // =============================================================
    socket.on('track_quest', async ({ questId }) => {
        const p = onlinePlayers[socket.id];
        if (!p) return;
        try {
            // Store tracked quest in preferences
            const [[row]] = await db.query('SELECT preferences_json FROM users WHERE id=?', [p.userId]);
            const prefs = row?.preferences_json ? (typeof row.preferences_json === 'string' ? JSON.parse(row.preferences_json) : row.preferences_json) : {};
            prefs.tracked_quest_id = questId;
            await db.query('UPDATE users SET preferences_json=? WHERE id=?', [JSON.stringify(prefs), p.userId]);
            socket.emit('quest_tracked', { questId });
        } catch (err) { console.warn('track_quest error:', err.message); }
    });

    // =============================================================
    // FOG EXPLORATION — persisted per character + map
    // =============================================================
    socket.on('get_fog_exploration', async ({ mapId }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p || !mapId) return;
        try {
            const [[row]] = await db.query(
                'SELECT explored_tiles FROM character_map_exploration WHERE character_id=? AND map_id=?',
                [p.charId, mapId]);
            const tiles = row?.explored_tiles ? JSON.parse(row.explored_tiles) : [];
            socket.emit('fog_exploration', { mapId, tiles });
        } catch { socket.emit('fog_exploration', { mapId, tiles: [] }); }
    });

    socket.on('save_fog_exploration', async ({ mapId, tiles }) => {
        const p = state.onlinePlayers[socket.id];
        if (!p || !mapId || !Array.isArray(tiles)) return;
        try {
            await db.query(
                `INSERT INTO character_map_exploration (character_id, map_id, explored_tiles)
                 VALUES (?,?,?) ON DUPLICATE KEY UPDATE explored_tiles=?, updated_at=NOW()`,
                [p.charId, mapId, JSON.stringify(tiles), JSON.stringify(tiles)]);
        } catch (err) { console.warn('save_fog_exploration error:', err.message); }
    });

    // =============================================================
    // GROUND ITEMS — drop, pickup, list
    // =============================================================
    // Send ground items on current map when player joins or moves
    async function sendGroundItems(sock, mapId) {
        try {
            const [items] = await db.query(
                `SELECT g.id, g.x, g.y, g.quantity, g.item_id, g.is_instanced, g.instance_for,
                        i.name, i.icon, i.type AS item_type, i.rarity
                 FROM game_map_ground_items g
                 JOIN game_items i ON i.id = g.item_id
                 WHERE g.map_id=? AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
                [mapId]
            );
            // Filter instanced items (only visible to the target player)
            const p = onlinePlayers[sock.id];
            const visible = items.filter(it => !it.is_instanced || it.instance_for === p?.charId);
            sock.emit('ground_items', visible);
        } catch {}
    }

    socket.on('get_ground_items', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        await sendGroundItems(socket, p.mapId);
    });

    // Drop an item from inventory onto the map
    socket.on('drop_item', async ({ itemId, quantity }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const qty = Math.max(1, parseInt(quantity) || 1);
        try {
            // Verify player owns the item
            const [inv] = await db.query(
                'SELECT * FROM character_inventory WHERE character_id=? AND item_id=? AND quantity>=?',
                [p.charId, itemId, qty]
            );
            if (!inv.length) { socket.emit('notification', { type: 'error', message: 'Item not found in inventory.' }); return; }

            // Remove from inventory
            if (inv[0].quantity <= qty) {
                await db.query('DELETE FROM character_inventory WHERE id=?', [inv[0].id]);
            } else {
                await db.query('UPDATE character_inventory SET quantity=quantity-? WHERE id=?', [qty, inv[0].id]);
            }

            // Place on ground
            const [result] = await db.query(
                `INSERT INTO game_map_ground_items (map_id, x, y, item_id, quantity, dropped_by, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
                [p.mapId, p.x, p.y, itemId, qty, p.charId]
            );

            // Broadcast to all players on map
            const [itemRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [itemId]);
            const itemName = itemRow[0]?.name || 'Item';
            const itemIcon = itemRow[0]?.icon || '📦';
            io.to('map_' + p.mapId).emit('ground_item_added', {
                id: result.insertId, x: p.x, y: p.y, item_id: itemId,
                quantity: qty, name: itemName, icon: itemIcon,
            });
            socket.emit('notification', { type: 'info', message: `Dropped ${itemName} x${qty}` });
        } catch (e) { socket.emit('notification', { type: 'error', message: 'Failed to drop item.' }); }
    });

    // Pick up a ground item
    socket.on('pickup_item', async ({ groundItemId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[gi]] = await db.query(
                `SELECT g.*, i.name, i.icon FROM game_map_ground_items g
                 JOIN game_items i ON i.id = g.item_id
                 WHERE g.id=? AND g.map_id=? AND (g.expires_at IS NULL OR g.expires_at > NOW())`,
                [groundItemId, p.mapId]
            );
            if (!gi) { socket.emit('notification', { type: 'error', message: 'Item no longer there.' }); return; }

            // Range check — must be within 1 tile
            if (Math.abs(gi.x - p.x) > 1 || Math.abs(gi.y - p.y) > 1) {
                socket.emit('notification', { type: 'error', message: 'Too far away.' }); return;
            }

            // Instance check
            if (gi.is_instanced && gi.instance_for !== p.charId) {
                socket.emit('notification', { type: 'error', message: 'This item is not for you.' }); return;
            }

            // Add to inventory
            await db.query(
                `INSERT INTO character_inventory (character_id, item_id, quantity)
                 VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity=quantity+?`,
                [p.charId, gi.item_id, gi.quantity, gi.quantity]
            );

            // Remove from ground
            await db.query('DELETE FROM game_map_ground_items WHERE id=?', [groundItemId]);

            io.to('map_' + p.mapId).emit('ground_item_removed', { id: groundItemId });
            socket.emit('notification', { type: 'success', message: `Picked up ${gi.icon || ''} ${gi.name} x${gi.quantity}` });
        } catch (e) { socket.emit('notification', { type: 'error', message: 'Failed to pick up item.' }); }
    });

    // =============================================================
    // CAPSULE ITEMS — deployable structures & world transport
    // =============================================================
    // Use item at current map position — checks ITEM_USE triggers
    socket.on('use_item_on_map', async ({ itemId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const map = await getMapData(db, p.mapId);
            if (!map || !Array.isArray(map.events)) return;
            const [stateRows] = await db.query("SELECT state_json, level, class_id FROM characters WHERE id=?", [p.charId]);
            const charState = stateRows.length ? safeJsonParse(stateRows[0].state_json, {}) : {};
            const result = await handleMapEvent({
                triggerType: 'ITEM_USE', x: p.x, y: p.y,
                mapEvents: map.events, socket, db, itemId,
                player: { ...p, level: stateRows[0]?.level || 1, classId: stateRows[0]?.class_id || 1 },
                state: charState
            });
            if (result?.state) {
                await db.query("UPDATE characters SET state_json=? WHERE id=?",
                    [JSON.stringify(result.state), p.charId]);
            }
            if (!result) {
                socket.emit('notification', { type: 'info', message: 'Nothing happens here.' });
            }
        } catch {}
    });

    socket.on('use_capsule', async ({ itemId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            // Verify player has the capsule
            const [[inv]] = await db.query(
                'SELECT * FROM character_inventory WHERE character_id=? AND item_id=? AND quantity>=1',
                [p.charId, itemId]
            );
            if (!inv) { socket.emit('notification', { type: 'error', message: 'Capsule not found.' }); return; }

            // Load capsule config
            const [[capsule]] = await db.query(
                'SELECT * FROM game_capsule_items WHERE item_id=?', [itemId]
            );
            if (!capsule) { socket.emit('notification', { type: 'error', message: 'Not a capsule item.' }); return; }

            // Consume the capsule (unless reusable)
            if (!capsule.is_reusable) {
                if (inv.quantity <= 1) {
                    await db.query('DELETE FROM character_inventory WHERE id=?', [inv.id]);
                } else {
                    await db.query('UPDATE character_inventory SET quantity=quantity-1 WHERE id=?', [inv.id]);
                }
            }

            if (capsule.capsule_type === 'TRANSPORT') {
                // Teleport player to target map/position
                const targetMap = capsule.target_map_id;
                const targetX = capsule.target_x || 5;
                const targetY = capsule.target_y || 5;
                if (!targetMap) { socket.emit('notification', { type: 'error', message: 'No destination configured.' }); return; }

                // Leave current map
                socket.leave('map_' + p.mapId);
                socket.to('map_' + p.mapId).emit('player_left', p.charId);

                // Particle effect at departure
                io.to('map_' + p.mapId).emit('map_particle', { preset: 'warp', x: p.x, y: p.y });

                // Move player
                p.mapId = targetMap; p.x = targetX; p.y = targetY;
                await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [targetMap, targetX, targetY, p.charId]);

                // Join new map
                socket.join('map_' + targetMap);
                const newMapData = await getMapData(db, targetMap);
                if (newMapData) socket.emit('map_data', newMapData);
                socket.emit('map_changed', { mapId: targetMap });

                // Reload NPCs & companions
                await ctx.loadMapNpcs(targetMap);
                socket.emit('npc_list', ctx.getNpcsForMap(targetMap));
                const comps = await ctx.loadCompanions(p.charId);
                ctx.spawnCompanionsAtPlayer(p);
                socket.emit('companion_list', comps);

                // Particle effect at arrival
                io.to('map_' + targetMap).emit('map_particle', { preset: 'warp', x: targetX, y: targetY });
                socket.to('map_' + targetMap).emit('player_joined', onlinePlayers[socket.id]);

                const [itemRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [itemId]);
                socket.emit('notification', { type: 'success', message: `${itemRow[0]?.icon || '💊'} ${itemRow[0]?.name || 'Capsule'} activated!` });

            } else if (capsule.capsule_type === 'STRUCTURE') {
                const structX = capsule.deploy_offset_x ? p.x + capsule.deploy_offset_x : p.x;
                const structY = capsule.deploy_offset_y ? p.y + capsule.deploy_offset_y : p.y + 1;

                // Resolve template if set
                let structName = capsule.structure_name;
                let structIcon = capsule.structure_icon || '🏠';
                let interiorMapId = capsule.interior_map_id;
                let structData = capsule.structure_data_json || '{}';

                if (capsule.template_id) {
                    const [[tmpl]] = await db.query('SELECT * FROM game_structure_templates WHERE id=? AND is_active=1', [capsule.template_id]);
                    if (tmpl) {
                        structName = structName || tmpl.name;
                        structIcon = capsule.structure_icon || tmpl.icon || '🏠';
                        interiorMapId = interiorMapId || tmpl.interior_map_id;
                        structData = structData !== '{}' ? structData : (tmpl.default_data_json || '{}');
                    }
                }

                const [result] = await db.query(
                    `INSERT INTO game_deployed_structures
                     (map_id, x, y, capsule_id, owner_id, name, icon, data_json, interior_map_id, template_id, exit_x, exit_y, deployed_at, expires_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
                    [p.mapId, structX, structY, capsule.id, p.charId,
                     structName || 'Structure', structIcon, structData,
                     interiorMapId || null, capsule.template_id || null,
                     structX, structY,
                     capsule.duration_minutes ? new Date(Date.now() + parseInt(capsule.duration_minutes) * 60000) : null]
                );

                io.to('map_' + p.mapId).emit('structure_deployed', {
                    id: result.insertId, x: structX, y: structY,
                    name: structName || 'Structure', icon: structIcon,
                    ownerId: p.charId, ownerName: p.name,
                    interior_map_id: interiorMapId || null,
                });
                io.to('map_' + p.mapId).emit('map_particle', { preset: 'deploy', x: structX, y: structY });

                const [itemRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [itemId]);
                socket.emit('notification', { type: 'success', message: `${itemRow[0]?.icon || '💊'} Deployed ${structName || itemRow[0]?.name}!` });

            } else if (capsule.capsule_type === 'SPAWN') {
                // Spawn an NPC/vehicle at the player's location
                try {
                    if (capsule.spawn_npc_id) {
                        await db.query('UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?',
                            [p.mapId, p.x, p.y + 1, capsule.spawn_npc_id]);
                        await ctx.loadMapNpcs(p.mapId);
                        io.to('map_' + p.mapId).emit('npc_arrived', {
                            npcId: capsule.spawn_npc_id, name: capsule.structure_name || 'Summoned',
                            x: p.x, y: p.y + 1
                        });
                    }
                } catch {}
                const [itemRow] = await db.query('SELECT name, icon FROM game_items WHERE id=?', [itemId]);
                socket.emit('notification', { type: 'success', message: `${itemRow[0]?.icon || '💊'} ${capsule.structure_name || 'Capsule'} deployed!` });
            }
        } catch (e) { console.error('use_capsule error:', e); socket.emit('notification', { type: 'error', message: 'Capsule failed.' }); }
    });

    // =============================================================
    // USE ABILITY — activate a learned permanent ability (Flight, etc.)
    // =============================================================
    socket.on('use_ability', async ({ abilityType }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            // Verify the player has this ability
            const [[ability]] = await db.query(
                'SELECT * FROM character_abilities WHERE character_id=? AND ability_type=?',
                [p.charId, abilityType]
            );
            if (!ability) { socket.emit('notification', { type: 'error', message: 'You haven\'t learned this ability.' }); return; }

            if (ability.status_id) {
                // Toggle: if the status is already active, remove it
                const [existing] = await db.query(
                    'SELECT id FROM character_status_effects WHERE character_id=? AND status_id=?',
                    [p.charId, ability.status_id]
                );
                if (existing.length) {
                    await db.query('DELETE FROM character_status_effects WHERE character_id=? AND status_id=?',
                        [p.charId, ability.status_id]);
                    socket.emit('notification', { type: 'info', message: `${ability.ability_name} deactivated.` });
                } else {
                    // Get duration from status definition
                    const [[statusDef]] = await db.query('SELECT default_duration, permanent FROM game_statuses WHERE id=?', [ability.status_id]);
                    const isPermanent = statusDef?.permanent;
                    const duration = statusDef?.default_duration || 10; // turns/minutes
                    await db.query(
                        `INSERT INTO character_status_effects (character_id, status_id, source, expires_at)
                         VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE expires_at=VALUES(expires_at), source=VALUES(source)`,
                        [p.charId, ability.status_id, 'ability',
                         isPermanent ? null : new Date(Date.now() + duration * 60000)]
                    );
                    socket.emit('notification', { type: 'success', message: `${ability.ability_name} activated!` });
                }

                // Refresh overworld effects cache
                p._owEffectsCache = null;
                p._owEffectsCacheAt = 0;

                // Resend active statuses to client
                const [activeStatuses] = await db.query(
                    `SELECT s.id, s.name, s.icon, s.type, s.effects FROM character_status_effects cse
                     JOIN game_statuses s ON s.id = cse.status_id
                     WHERE cse.character_id=? AND (cse.expires_at IS NULL OR cse.expires_at > NOW())`,
                    [p.charId]
                );
                const owFx = {};
                const statusList = [];
                for (const row of activeStatuses) {
                    statusList.push({ id: row.id, name: row.name, icon: row.icon, type: row.type });
                    try {
                        const fx = typeof row.effects === 'string' ? JSON.parse(row.effects) : row.effects;
                        if (fx) Object.assign(owFx, fx);
                    } catch {}
                }
                socket.emit('active_statuses', statusList);
                socket.emit('overworld_effects', owFx);
            } else {
                socket.emit('notification', { type: 'info', message: `${ability.ability_name} — passive ability.` });
            }
        } catch (e) { socket.emit('notification', { type: 'error', message: 'Ability failed.' }); }
    });

    // Get learned abilities list
    socket.on('get_abilities', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [abilities] = await db.query(
                'SELECT * FROM character_abilities WHERE character_id=?', [p.charId]);
            socket.emit('abilities_list', abilities);
        } catch { socket.emit('abilities_list', []); }
    });

    // =============================================================
    // ENTER / EXIT STRUCTURE
    // =============================================================
    socket.on('enter_structure', async ({ structureId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[s]] = await db.query(
                `SELECT * FROM game_deployed_structures WHERE id=? AND map_id=? AND is_active=1
                 AND (expires_at IS NULL OR expires_at > NOW())`, [structureId, p.mapId]);
            if (!s) { socket.emit('notification', { type: 'error', message: 'Structure not found.' }); return; }
            if (!s.interior_map_id) { socket.emit('notification', { type: 'info', message: 'This structure has no interior.' }); return; }
            if (Math.abs(s.x - p.x) > 1 || Math.abs(s.y - p.y) > 1) {
                socket.emit('notification', { type: 'error', message: 'Too far away.' }); return;
            }

            // Remember where we came from for exit
            p._structureReturn = { mapId: p.mapId, x: s.exit_x || s.x, y: s.exit_y || s.y, structureId: s.id };

            // Teleport to interior map
            socket.leave('map_' + p.mapId);
            socket.to('map_' + p.mapId).emit('player_left', p.charId);

            p.mapId = s.interior_map_id; p.x = 5; p.y = 5;
            await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [s.interior_map_id, 5, 5, p.charId]);

            socket.join('map_' + s.interior_map_id);
            const mapData = await getMapData(db, s.interior_map_id);
            if (mapData) socket.emit('map_data', mapData);
            socket.emit('map_changed', { mapId: s.interior_map_id });
            await ctx.loadMapNpcs(s.interior_map_id);
            socket.emit('npc_list', ctx.getNpcsForMap(s.interior_map_id));
            socket.to('map_' + s.interior_map_id).emit('player_joined', onlinePlayers[socket.id]);
            socket.emit('notification', { type: 'info', message: `Entered ${s.name}` });
        } catch (e) { socket.emit('notification', { type: 'error', message: 'Cannot enter.' }); }
    });

    socket.on('exit_structure', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const ret = p._structureReturn;
        if (!ret) { socket.emit('notification', { type: 'error', message: 'No exit point.' }); return; }
        try {
            socket.leave('map_' + p.mapId);
            socket.to('map_' + p.mapId).emit('player_left', p.charId);

            p.mapId = ret.mapId; p.x = ret.x; p.y = ret.y;
            delete p._structureReturn;
            await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [ret.mapId, ret.x, ret.y, p.charId]);

            socket.join('map_' + ret.mapId);
            const mapData = await getMapData(db, ret.mapId);
            if (mapData) socket.emit('map_data', mapData);
            socket.emit('map_changed', { mapId: ret.mapId });
            await ctx.loadMapNpcs(ret.mapId);
            socket.emit('npc_list', ctx.getNpcsForMap(ret.mapId));
            socket.to('map_' + ret.mapId).emit('player_joined', onlinePlayers[socket.id]);
            await sendGroundItems(socket, ret.mapId);
            socket.emit('notification', { type: 'info', message: 'Exited structure' });
        } catch (e) { socket.emit('notification', { type: 'error', message: 'Cannot exit.' }); }
    });

    // =============================================================
    // =============================================================
    // AI-POWERED FEATURES (all toggleable via system_settings)
    // =============================================================

    // Generate a dynamic quest for the player
    socket.on('ai_generate_quest', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const map = await getMapData(db, p.mapId);
            const region = await global.getRegionForMap(p.mapId).catch(() => null);
            const quest = await ai.generateQuest(db, {
                playerLevel: p.level || 1,
                mapName: map?.name || 'Unknown',
                regionName: region?.name,
                worldTone: null // uses default
            });
            if (quest) socket.emit('ai_quest_generated', quest);
            else socket.emit('notification', { type: 'info', message: 'No quest available right now.' });
        } catch { socket.emit('notification', { type: 'error', message: 'Quest generation failed.' }); }
    });

    // Generate item flavor text
    socket.on('ai_generate_item_text', async ({ itemName, itemType }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const text = await ai.generateItemText(db, { itemName, itemType });
        socket.emit('ai_item_text', { itemName, text: text || 'A mysterious item.' });
    });

    // Generate lore book content
    socket.on('ai_generate_lore', async ({ topic }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const region = await global.getRegionForMap(p.mapId).catch(() => null);
        const text = await ai.generateLore(db, { topic, regionName: region?.name });
        socket.emit('ai_lore_generated', { topic, text: text || 'The text is too faded to read.' });
    });

    // Generate player biography
    socket.on('ai_generate_biography', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[char]] = await db.query('SELECT * FROM characters WHERE id=?', [p.charId]);
            const [[race]] = await db.query('SELECT name FROM game_races WHERE id=?', [char.race_id]).catch(() => [[null]]);
            const [[cls]] = await db.query('SELECT name FROM game_classes WHERE id=?', [char.class_id]).catch(() => [[null]]);
            const [[guild]] = await db.query('SELECT g.name FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id WHERE gm.character_id=? AND gm.is_active=1', [p.charId]).catch(() => [[null]]);
            const [[stats]] = await db.query('SELECT COUNT(*) as quests FROM character_quests WHERE character_id=? AND status="completed"', [p.charId]).catch(() => [[{ quests: 0 }]]);
            const bio = await ai.generateBiography(db, {
                playerName: char.name, race: race?.name, className: cls?.name,
                level: char.level, questsCompleted: stats?.quests || 0,
                kills: 0, deaths: 0, guildName: guild?.name
            });
            socket.emit('ai_biography', { text: bio || 'Their story has yet to be written.' });
        } catch { socket.emit('ai_biography', { text: 'Their story has yet to be written.' }); }
    });

    // Get crafting hint
    socket.on('ai_crafting_hint', async ({ ingredients }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const hint = await ai.craftingHint(db, { ingredients });
        socket.emit('ai_crafting_hint_result', { hint: hint || 'Nothing comes to mind.' });
    });

    // ── DM MODE ──
    // AI Dungeon Master session
    socket.on('dm_action', async ({ action, sessionId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        // Load or create session
        if (!global._dmSessions) global._dmSessions = {};
        let session = global._dmSessions[sessionId || p.charId];
        if (!session) {
            const map = await getMapData(db, p.mapId);
            const region = await global.getRegionForMap(p.mapId).catch(() => null);
            session = {
                id: sessionId || p.charId,
                history: [],
                location: map?.name || 'Unknown',
                partyMembers: [{ name: p.name, class: 'Adventurer', level: p.level || 1 }],
                dmContext: null,
                isAdminRun: false,
            };
            // Add party members if in a party
            const partyId = charPartyMap[p.charId];
            if (partyId && activeParties[partyId]) {
                for (const memberId of activeParties[partyId].members) {
                    if (memberId === p.charId) continue;
                    const mp = Object.values(onlinePlayers).find(pl => pl.charId === memberId);
                    if (mp) session.partyMembers.push({ name: mp.name, class: 'Adventurer', level: mp.level || 1 });
                }
            }
            global._dmSessions[session.id] = session;
        }

        const response = await ai.dmResponse(db, {
            dmContext: session.dmContext,
            playerAction: action,
            partyMembers: session.partyMembers,
            location: session.location,
            sessionHistory: session.history,
        });

        if (response) {
            session.history.push({ speaker: p.name, text: action });
            session.history.push({ speaker: 'DM', text: response });
            if (session.history.length > 50) session.history.splice(0, 2);

            // Broadcast to party room
            const room = 'dm_' + session.id;
            socket.join(room);
            io.to(room).emit('dm_response', { speaker: 'DM', text: response, sessionId: session.id });
        } else {
            socket.emit('notification', { type: 'error', message: 'DM mode unavailable.' });
        }
    });

    // Admin/Ref DM Mode — human DM with AI assist
    socket.on('dm_assist', async ({ instruction, sessionId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        // Staff check
        const userRole = p.role?.toUpperCase();
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(userRole)) {
            socket.emit('notification', { type: 'error', message: 'Staff only.' }); return;
        }
        const session = global._dmSessions?.[sessionId];
        const response = await ai.dmAssist(db, {
            dmInstruction: instruction,
            partyMembers: session?.partyMembers || [],
            location: session?.location || 'Unknown',
        });
        if (response) {
            socket.emit('dm_assist_result', { text: response });
        }
    });

    // Admin DM broadcast — human DM sends narration to players
    socket.on('dm_narrate', async ({ text, sessionId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        const userRole = p.role?.toUpperCase();
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(userRole)) return;
        if (!global._dmSessions) global._dmSessions = {};
        if (!global._dmSessions[sessionId]) {
            global._dmSessions[sessionId] = { id: sessionId, history: [], location: 'Unknown', partyMembers: [], dmContext: null, isAdminRun: true };
        }
        const session = global._dmSessions[sessionId];
        session.history.push({ speaker: 'DM', text });
        session.isAdminRun = true;
        io.to('dm_' + sessionId).emit('dm_response', { speaker: p.name + ' (DM)', text, sessionId });
    });

    // Join a DM session as player
    socket.on('dm_join_session', ({ sessionId }) => {
        socket.join('dm_' + sessionId);
    });

    // ── DM MAP CONTROLS — Staff locks/unlocks player movement, teleports players, spawns things ──

    // Lock/unlock a specific player's movement
    socket.on('dm_lock_player', ({ targetCharId, locked, sessionId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === targetCharId);
        if (targetEntry) {
            const [tSockId, tPlayer] = targetEntry;
            tPlayer._dmLocked = !!locked;
            const tSock = io.sockets.sockets.get(tSockId);
            if (tSock) {
                tSock.emit('event_queue', [{ cmd: 'lock_movement', locked: !!locked }]);
                tSock.emit('notification', { type: 'info', message: locked ? 'The DM has locked your movement.' : 'You can move again.' });
            }
        }
    });

    // Lock/unlock ALL players in a DM session
    socket.on('dm_lock_all', ({ locked, sessionId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        io.to('dm_' + sessionId).emit('event_queue', [{ cmd: 'lock_movement', locked: !!locked }]);
        io.to('dm_' + sessionId).emit('notification', { type: 'info', message: locked ? 'The DM has locked movement.' : 'Movement unlocked.' });
        // Set lock flag on all session players
        for (const pl of Object.values(onlinePlayers)) {
            if (io.sockets.sockets.get(Object.keys(onlinePlayers).find(k => onlinePlayers[k] === pl) || '')?.rooms?.has('dm_' + sessionId)) {
                pl._dmLocked = !!locked;
            }
        }
    });

    // DM teleports a player to specific position
    socket.on('dm_teleport_player', async ({ targetCharId, mapId, x, y }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === targetCharId);
        if (!targetEntry) return;
        const [tSockId, tPlayer] = targetEntry;
        const tSock = io.sockets.sockets.get(tSockId);
        if (!tSock) return;

        const targetMap = mapId || tPlayer.mapId;
        if (targetMap !== tPlayer.mapId) {
            tSock.leave('map_' + tPlayer.mapId);
            tSock.to('map_' + tPlayer.mapId).emit('player_left', tPlayer.charId);
            tPlayer.mapId = targetMap;
            tSock.join('map_' + targetMap);
            const mapData = await getMapData(db, targetMap);
            if (mapData) tSock.emit('map_data', mapData);
            tSock.emit('map_changed', { mapId: targetMap });
            await ctx.loadMapNpcs(targetMap);
            tSock.emit('npc_list', ctx.getNpcsForMap(targetMap));
            tSock.to('map_' + targetMap).emit('player_joined', tPlayer);
        }
        tPlayer.x = x ?? tPlayer.x;
        tPlayer.y = y ?? tPlayer.y;
        await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [targetMap, tPlayer.x, tPlayer.y, tPlayer.charId]);
        tSock.emit('force_move', { x: tPlayer.x, y: tPlayer.y });
    });

    // DM spawns an NPC at position (for encounters)
    socket.on('dm_spawn_npc', async ({ npcId, mapId, x, y }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        const targetMap = mapId || p.mapId;
        await db.query('UPDATE game_npcs SET map_id=?, x=?, y=? WHERE id=?', [targetMap, x || 5, y || 5, npcId]);
        await ctx.loadMapNpcs(targetMap);
        const [[npc]] = await db.query('SELECT name FROM game_npcs WHERE id=?', [npcId]).catch(() => [[null]]);
        io.to('map_' + targetMap).emit('npc_arrived', { npcId, name: npc?.name || 'NPC', x: x || 5, y: y || 5 });
    });

    // DM triggers a battle for a specific player
    socket.on('dm_force_battle', async ({ targetCharId, enemyNpcId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.charId === targetCharId);
        if (!targetEntry) return;
        const [tSockId] = targetEntry;
        const tSock = io.sockets.sockets.get(tSockId);
        if (tSock) tSock.emit('trigger_pve_battle', { npcId: enemyNpcId });
    });

    // DM changes weather/time/darkness on the fly
    socket.on('dm_set_environment', ({ mapId, weather, ambientDark, timePhase }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        const targetMap = mapId || p.mapId;
        if (weather) io.to('map_' + targetMap).emit('notification', { type: 'info', message: `The weather changes to ${weather}...` });
        if (ambientDark !== undefined) {
            // Update cached map data
            if (global._mapCache?.[targetMap]) global._mapCache[targetMap].ambientDark = ambientDark;
        }
    });

    // DM sends screen effects to players
    socket.on('dm_screen_effect', ({ sessionId, effect, duration, color }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        io.to('dm_' + sessionId).emit('event_queue', [{ cmd: 'screen_effect', effect: effect || 'shake', duration: duration || 500, color }]);
    });

    // DM places particles on map
    socket.on('dm_spawn_particle', ({ mapId, preset, x, y }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        io.to('map_' + (mapId || p.mapId)).emit('map_particle', { preset: preset || 'fire', x: x || p.x, y: y || p.y });
    });

    // =============================================================
    // =============================================================
    // DM CAMPAIGNS — persistent multi-session tabletop alongside main game
    // =============================================================

    // Create a campaign
    socket.on('dm_create_campaign', async ({ name, description, maxPlayers, isOneshot, worldTone, mapId, movesPerDay, tilesPerMove, flyingTiles }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) {
            socket.emit('notification', { type: 'error', message: 'Staff only.' }); return;
        }
        try {
            const [result] = await db.query(
                `INSERT INTO game_dm_campaigns (name, description, dm_user_id, max_players, is_oneshot, world_tone, map_id, moves_per_day, tiles_per_move, flying_tiles)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [name, description || null, p.userId, maxPlayers || 7, isOneshot ? 1 : 0, worldTone || 'dark fantasy', mapId || null,
                 movesPerDay || 3, tilesPerMove || 3, flyingTiles || 3]
            );
            socket.emit('dm_campaign_created', { id: result.insertId, name });
            socket.emit('notification', { type: 'success', message: `Campaign "${name}" created!` });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    // List campaigns (active/recruiting)
    socket.on('dm_list_campaigns', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [campaigns] = await db.query(
                `SELECT c.*, u.username AS dm_name,
                 (SELECT COUNT(*) FROM game_dm_campaign_players WHERE campaign_id=c.id AND status='accepted') AS player_count
                 FROM game_dm_campaigns c JOIN users u ON u.id=c.dm_user_id
                 WHERE c.status IN ('recruiting','active') ORDER BY c.created_at DESC`);
            socket.emit('dm_campaigns_list', campaigns);
        } catch { socket.emit('dm_campaigns_list', []); }
    });

    // Invite player to campaign
    socket.on('dm_invite_player', async ({ campaignId, targetUserId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[campaign]] = await db.query('SELECT * FROM game_dm_campaigns WHERE id=? AND dm_user_id=?', [campaignId, p.userId]);
            if (!campaign) { socket.emit('notification', { type: 'error', message: 'Not your campaign.' }); return; }
            const [existing] = await db.query('SELECT COUNT(*) AS c FROM game_dm_campaign_players WHERE campaign_id=? AND status="accepted"', [campaignId]);
            if (existing[0].c >= campaign.max_players) { socket.emit('notification', { type: 'error', message: 'Campaign is full.' }); return; }
            await db.query(
                'INSERT INTO game_dm_campaign_players (campaign_id, user_id) VALUES (?,?) ON DUPLICATE KEY UPDATE status="invited"',
                [campaignId, targetUserId]
            );
            // Notify the invited player if online
            const targetEntry = Object.entries(onlinePlayers).find(([, pl]) => pl.userId === targetUserId);
            if (targetEntry) {
                const [tSockId] = targetEntry;
                const tSock = io.sockets.sockets.get(tSockId);
                if (tSock) tSock.emit('notification', { type: 'info', message: `You've been invited to "${campaign.name}" campaign!` });
            }
            socket.emit('notification', { type: 'success', message: 'Invite sent!' });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    // Accept/decline campaign invite
    socket.on('dm_campaign_respond', async ({ campaignId, accept }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            await db.query('UPDATE game_dm_campaign_players SET status=?, joined_at=? WHERE campaign_id=? AND user_id=?',
                [accept ? 'accepted' : 'declined', accept ? new Date() : null, campaignId, p.userId]);
            socket.emit('notification', { type: 'info', message: accept ? 'Joined campaign!' : 'Declined invite.' });
        } catch {}
    });

    // Save/update character sheet for a campaign
    socket.on('dm_save_character_sheet', async ({ campaignId, sheet }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const fields = ['name','race','class_name','level','str','dex','con','int_score','wis','cha',
                'max_hp','current_hp','armor_class','background','alignment','personality','backstory',
                'equipment_json','skills_json','spells_json','notes','portrait_url'];
            const vals = fields.map(f => sheet[f] !== undefined ? sheet[f] : null);
            const [existing] = await db.query('SELECT id FROM game_dm_character_sheets WHERE campaign_id=? AND user_id=?', [campaignId, p.userId]);
            if (existing.length) {
                const sets = fields.map(f => `${f}=?`).join(',');
                await db.query(`UPDATE game_dm_character_sheets SET ${sets} WHERE campaign_id=? AND user_id=?`, [...vals, campaignId, p.userId]);
            } else {
                await db.query(
                    `INSERT INTO game_dm_character_sheets (campaign_id, user_id, ${fields.join(',')}) VALUES (?,?,${fields.map(() => '?').join(',')})`,
                    [campaignId, p.userId, ...vals]
                );
            }
            socket.emit('notification', { type: 'success', message: 'Character sheet saved!' });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    // Get character sheets for a campaign
    socket.on('dm_get_sheets', async ({ campaignId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [sheets] = await db.query(
                `SELECT s.*, u.username FROM game_dm_character_sheets s
                 JOIN users u ON u.id = s.user_id WHERE s.campaign_id=?`, [campaignId]);
            socket.emit('dm_character_sheets', { campaignId, sheets });
        } catch { socket.emit('dm_character_sheets', { campaignId, sheets: [] }); }
    });

    // Start a session (creates log entry, moves campaign to active)
    socket.on('dm_start_session', async ({ campaignId, title }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        try {
            const [[campaign]] = await db.query('SELECT * FROM game_dm_campaigns WHERE id=? AND dm_user_id=?', [campaignId, p.userId]);
            if (!campaign) return;
            await db.query('UPDATE game_dm_campaigns SET status="active", session_count=session_count+1 WHERE id=?', [campaignId]);
            const sessionNum = campaign.session_count + 1;
            const [result] = await db.query(
                'INSERT INTO game_dm_session_log (campaign_id, session_number, title) VALUES (?,?,?)',
                [campaignId, sessionNum, title || `Session ${sessionNum}`]
            );
            // Initialize in-memory DM session
            if (!global._dmSessions) global._dmSessions = {};
            const [players] = await db.query(
                `SELECT s.name, s.class_name, s.level, s.user_id FROM game_dm_character_sheets s
                 JOIN game_dm_campaign_players cp ON cp.campaign_id=s.campaign_id AND cp.user_id=s.user_id AND cp.status='accepted'
                 WHERE s.campaign_id=?`, [campaignId]);
            global._dmSessions[campaignId] = {
                id: campaignId,
                sessionLogId: result.insertId,
                history: [],
                location: 'Unknown',
                partyMembers: players.map(pl => ({ name: pl.name, class: pl.class_name, level: pl.level })),
                dmContext: campaign.description,
                isAdminRun: true,
                worldTone: campaign.world_tone,
            };
            // Notify all campaign players
            const [members] = await db.query('SELECT user_id FROM game_dm_campaign_players WHERE campaign_id=? AND status="accepted"', [campaignId]);
            for (const m of members) {
                const entry = Object.entries(onlinePlayers).find(([, pl]) => pl.userId === m.user_id);
                if (entry) {
                    const [sockId] = entry;
                    const sock = io.sockets.sockets.get(sockId);
                    if (sock) {
                        sock.join('dm_' + campaignId);
                        sock.emit('notification', { type: 'success', message: `Campaign "${campaign.name}" Session ${sessionNum} starting!` });
                    }
                }
            }
            socket.join('dm_' + campaignId);
            socket.emit('dm_session_started', { campaignId, sessionNumber: sessionNum, sessionLogId: result.insertId });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    // End a session (save log, close)
    socket.on('dm_end_session', async ({ campaignId, summary }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        try {
            const session = global._dmSessions?.[campaignId];
            if (session?.sessionLogId) {
                await db.query('UPDATE game_dm_session_log SET ended_at=NOW(), summary=?, log_json=? WHERE id=?',
                    [summary || null, JSON.stringify(session.history || []), session.sessionLogId]);
            }
            delete global._dmSessions?.[campaignId];
            io.to('dm_' + campaignId).emit('notification', { type: 'info', message: 'Session ended.' });
            io.to('dm_' + campaignId).emit('dm_session_ended', { campaignId });
        } catch {}
    });

    // =============================================================
    // SCHEDULED GAME EVENTS — main game community events
    // =============================================================

    socket.on('event_list', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [events] = await db.query(
                `SELECT e.*, u.username AS host_name,
                 (SELECT COUNT(*) FROM game_scheduled_event_signups WHERE event_id=e.id) AS signup_count,
                 EXISTS(SELECT 1 FROM game_scheduled_event_signups WHERE event_id=e.id AND character_id=?) AS signed_up
                 FROM game_scheduled_events e
                 LEFT JOIN users u ON u.id=e.host_user_id
                 WHERE e.is_active=1 AND (e.ends_at IS NULL OR e.ends_at > NOW())
                 ORDER BY e.starts_at`, [p.charId]);
            socket.emit('event_list_result', events);
        } catch { socket.emit('event_list_result', []); }
    });

    socket.on('event_signup', async ({ eventId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [[event]] = await db.query('SELECT * FROM game_scheduled_events WHERE id=? AND is_active=1', [eventId]);
            if (!event) { socket.emit('notification', { type: 'error', message: 'Event not found.' }); return; }
            if (event.max_participants) {
                const [[count]] = await db.query('SELECT COUNT(*) AS c FROM game_scheduled_event_signups WHERE event_id=?', [eventId]);
                if (count.c >= event.max_participants) { socket.emit('notification', { type: 'error', message: 'Event is full.' }); return; }
            }
            await db.query('INSERT IGNORE INTO game_scheduled_event_signups (event_id, character_id) VALUES (?,?)', [eventId, p.charId]);
            socket.emit('notification', { type: 'success', message: `Signed up for "${event.name}"!` });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    socket.on('event_cancel_signup', async ({ eventId }) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        await db.query('DELETE FROM game_scheduled_event_signups WHERE event_id=? AND character_id=?', [eventId, p.charId]).catch(() => {});
        socket.emit('notification', { type: 'info', message: 'Signup cancelled.' });
    });

    // Staff: create event
    socket.on('event_create', async (data) => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        if (!['ADMIN', 'GM', 'STAFF', 'OWNER'].includes((p.role || '').toUpperCase())) return;
        try {
            await db.query(
                `INSERT INTO game_scheduled_events (name, description, event_type, host_user_id, map_id, starts_at, ends_at, max_participants, reward_json, recurring)
                 VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [data.name, data.description, data.event_type || 'custom', p.userId, data.map_id || null,
                 data.starts_at, data.ends_at || null, data.max_participants || null,
                 data.reward_json ? JSON.stringify(data.reward_json) : null, data.recurring || 'none']
            );
            // Announce to all online players
            io.emit('notification', { type: 'info', message: `New event: "${data.name}"! Check the events panel.` });
            socket.emit('notification', { type: 'success', message: 'Event created!' });
        } catch (e) { socket.emit('notification', { type: 'error', message: e.message }); }
    });

    // =============================================================
    // GAMEPLAY PANEL DATA — bank, bounties, mounts, creatures, jobs, cards
    // =============================================================
    socket.on('bank_get_items', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [items] = await db.query(
                `SELECT b.*, i.name, i.icon, i.rarity FROM character_bank b
                 JOIN game_items i ON i.id = b.item_id WHERE b.character_id=?`, [p.charId]);
            socket.emit('bank_items', { items });
        } catch (e) { socket.emit('bank_items', { items: [] }); }
    });

    socket.on('bounty_get_tasks', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [tasks] = await db.query(
                `SELECT bt.*, bb.name AS board_name FROM game_bounty_tasks bt
                 JOIN game_bounty_boards bb ON bb.id = bt.board_id
                 WHERE bt.is_active=1 ORDER BY bt.reward_gold DESC`);
            socket.emit('bounty_tasks', { tasks });
        } catch (e) { socket.emit('bounty_tasks', { tasks: [] }); }
    });

    socket.on('mount_get_list', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [mounts] = await db.query(
                `SELECT cm.*, m.name, m.icon, m.speed_bonus FROM character_mounts cm
                 JOIN game_mounts m ON m.id = cm.mount_id WHERE cm.character_id=?`, [p.charId]);
            socket.emit('mount_list', { mounts });
        } catch (e) { socket.emit('mount_list', { mounts: [] }); }
    });

    socket.on('creature_get_list', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [creatures] = await db.query(
                `SELECT * FROM character_creatures WHERE character_id=?`, [p.charId]);
            socket.emit('creature_list', { creatures });
        } catch (e) { socket.emit('creature_list', { creatures: [] }); }
    });

    socket.on('job_get_list', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [jobs] = await db.query(
                `SELECT cj.*, j.name, j.icon, j.description FROM character_jobs cj
                 JOIN game_jobs j ON j.id = cj.job_id WHERE cj.character_id=?`, [p.charId]);
            socket.emit('job_list', { jobs });
        } catch (e) { socket.emit('job_list', { jobs: [] }); }
    });

    socket.on('card_get_collection', async () => {
        const p = onlinePlayers[socket.id]; if (!p) return;
        try {
            const [cards] = await db.query(
                `SELECT cc.*, c.name, c.icon, c.rarity, c.attack, c.defense FROM character_cards cc
                 JOIN game_cards c ON c.id = cc.card_id WHERE cc.character_id=?`, [p.charId]);
            socket.emit('card_collection', { cards });
        } catch (e) { socket.emit('card_collection', { cards: [] }); }
    });

    // =============================================================
    // 6. DISCONNECT — character position save, cleanup
    // =============================================================
    // TEACHING: On disconnect we must:
    //   1. Save the character's last position to DB
    //   2. Notify other players (either remove or mark as sleeping)
    //   3. Clean up party membership
    //   4. Clean up guild map entry (was leaking one per session)
    //   5. Clean up companion state
    //   6. Clean up NPC conversation history (memory leak fix)
    //   7. Update presence to offline in DB
    //   8. Remove from onlinePlayers
    //   9. Clean up staff panel presence
    //  10. Clean up collaborative map editing
    socket.on('disconnect', async () => {
        // Clean up collaborative map editing
        const editMapId = socket._editingMapId;
        if (editMapId && global._mapEditors?.[editMapId]) {
            delete global._mapEditors[editMapId][socket.id];
            if (!Object.keys(global._mapEditors[editMapId]).length) delete global._mapEditors[editMapId];
            else io.to('map_edit_' + editMapId).emit('map_editor_presence', Object.values(global._mapEditors[editMapId]));
        }
        try {
            const p = onlinePlayers[socket.id];
            if (p) {
                await db.query("UPDATE characters SET x=?, y=?, map_id=? WHERE id=?", [p.x, p.y, p.mapId, p.charId]);

                // Check if offline players stay visible on map
                let offlineVisible = true;
                try {
                    const [sv] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='enable_offline_players'");
                    offlineVisible = sv.length && sv[0].setting_value === 'true';
                } catch {}

                if (offlineVisible) {
                    // Don't remove — just mark as sleeping
                    socket.to('map_' + p.mapId).emit('player_status_change', {
                        charId: p.charId, name: p.name,
                        x: p.x, y: p.y, level: p.level,
                        isOffline: true, presence: 'offline'
                    });
                } else {
                    socket.to('map_' + p.mapId).emit('player_left', p.charId);
                }

                // Clean up party membership on disconnect
                const partyId = charPartyMap[p.charId];
                if (partyId) {
                    const party = activeParties[partyId];
                    if (party) {
                        party.members = party.members.filter(id => id !== p.charId);
                        delete charPartyMap[p.charId];
                        socket.leave('party_' + partyId);

                        await db.query(
                            "UPDATE character_party_members SET is_active=0, left_at=NOW() WHERE party_id=? AND character_id=?",
                            [partyId, p.charId]
                        );

                        if (party.members.length === 0) {
                            delete activeParties[partyId];
                            await db.query("UPDATE character_parties SET is_active=0, disbanded_at=NOW() WHERE id=?", [partyId]);
                        } else if (party.leaderId === p.charId) {
                            party.leaderId = party.members[0];
                            await db.query("UPDATE character_parties SET leader_id=? WHERE id=?", [party.leaderId, partyId]);
                            io.to('party_' + partyId).emit('party_update', buildPartyPayload(partyId));
                            io.to('party_' + partyId).emit('chat_msg', {
                                channel: 'party', from: 'System',
                                text: `${p.name} left. Leadership passed.`, ts: Date.now()
                            });
                        } else {
                            io.to('party_' + partyId).emit('party_update', buildPartyPayload(partyId));
                            io.to('party_' + partyId).emit('chat_msg', {
                                channel: 'party', from: 'System',
                                text: `${p.name} left the party.`, ts: Date.now()
                            });
                        }
                    }
                }

                // FIX: clean up guild map entry — was leaking one entry per player per session
                delete charGuildMap[p.charId];

                // Clean up companion state
                delete companionState[p.charId];

                // FIX: clean up NPC conversation history — was leaking one entry per
                // unique (player, npc) conversation pair, forever, until server restart.
                // We delete all keys that start with this player's charId prefix.
                const memPrefix = `${p.charId}_`;
                for (const key of Object.keys(npcMemory)) {
                    if (key.startsWith(memPrefix)) delete npcMemory[key];
                }

                // Update presence to offline in DB
                await db.query(
                    "UPDATE characters SET presence='offline', last_seen=NOW() WHERE id=?",
                    [p.charId]
                ).catch(() => {}); // non-fatal

                delete onlinePlayers[socket.id];
            }
            // Clean up staff panel presence
            if (global._staffPanel?.[socket.id]) {
                const leaving = global._staffPanel[socket.id];
                delete global._staffPanel[socket.id];
                io.to('staff_panel').emit('staff_sign_off', { username: leaving.username, role: leaving.role });
                io.to('staff_panel').emit('staff_panel_presence', Object.values(global._staffPanel));
            }
        } catch (err) { console.error("Disconnect error:", err); }
    });
};
