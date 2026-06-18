// =================================================================
// TWISTED ENGINE — SCHEDULER
// =================================================================
// A cron-like task runner. Runs every minute, checks game_scheduled_tasks
// for any task that is due, executes it, and updates last_run_at.
//
// TASK TYPES:
//   SHOP_RESTOCK   — reset stock to DEFAULT (you set default in AdminSauce)
//   SPAWN_RESPAWN  — forces all dead enemies on a map back to life
//   DUNGEON_RESET  — kicks all players off a map + respawns everything
//   SET_WORLD_FLAG — sets a global world flag value
//   GIVE_XP_ALL    — gives XP to every currently-online character
//   BROADCAST      — sends a colored server message to all players
//
// HOW TO ADD A TASK:
//   AdminSauce → 🕐 Scheduler → New Task
//   No code changes needed. Tasks run automatically.
//
// TEACHING: setInterval runs a function repeatedly. We run it every
// 60 seconds (60000ms). Each run we ask: "is this task due based on
// its schedule_type and last_run_at?" If yes, execute it.
// =================================================================

let _db, _io, _onlinePlayers;

function init(db, io, onlinePlayers) {
    _db = db;
    _io = io;
    _onlinePlayers = onlinePlayers;

    // Run once at startup (catches missed tasks after a restart)
    setTimeout(() => runDueTasks(), 5000);

    // Then every 60 seconds
    setInterval(() => runDueTasks(), 60 * 1000);

    // ── Auction house expiry ───────────────────────────────────────
    // TEACHING: Before this fix, expired auction listings only got
    // cleaned up when a player browsed the auction house, because
    // resolveExpiredListings() was only called inside the browse route.
    // That meant: if no one browses for hours, expired listings just
    // sit there in ACTIVE state and nobody gets their items back.
    //
    // Fix: run it on a server-side timer every 15 minutes, completely
    // independent of player activity. Players browsing still also
    // triggers it (belt-and-suspenders), but this is the safety net.
    try {
        const auctionRoutes = require('./routes/auction');
        const runAuctionExpiry = auctionRoutes.resolveExpiredListings;
        if (typeof runAuctionExpiry === 'function') {
            // Run once at startup to catch anything that expired while server was down
            setTimeout(async () => {
                try {
                    const n = await runAuctionExpiry();
                    if (n > 0) console.log(`[Auction] Resolved ${n} expired listing(s) on startup.`);
                } catch (e) { console.error('[Auction] Startup expiry error:', e.message); }
            }, 8000);

            // Then every 15 minutes
            setInterval(async () => {
                try {
                    const n = await runAuctionExpiry();
                    if (n > 0) console.log(`[Auction] Resolved ${n} expired listing(s).`);
                } catch (e) { console.error('[Auction] Expiry tick error:', e.message); }
            }, 15 * 60 * 1000);

            console.log('[Scheduler] Auction expiry running every 15 minutes.');
        }
    } catch (auctionErr) {
        console.warn('[Scheduler] Auction expiry hook skipped:', auctionErr.message);
    }

    console.log('[Scheduler] Started — checking every 60 seconds');
}

// Returns true if this task is due to run right now.
function isDue(task) {
    const now = new Date();
    const last = task.last_run_at ? new Date(task.last_run_at) : null;

    if (task.schedule_type === 'INTERVAL_MINUTES') {
        const mins = task.interval_minutes || 60;
        if (!last) return true;
        return (now - last) >= mins * 60 * 1000;
    }

    if (task.schedule_type === 'HOURLY') {
        if (!last) return true;
        // Run once per hour — check if we're in a new hour since last run
        const lastHour = last.getHours() + last.getDate() * 24;
        const nowHour  = now.getHours()  + now.getDate()  * 24;
        return nowHour > lastHour;
    }

    if (task.schedule_type === 'DAILY') {
        const runHour = task.run_at_hour || 0;
        if (now.getHours() !== runHour) return false;
        if (!last) return true;
        // Only run once per day at the right hour
        return last.toDateString() !== now.toDateString();
    }

    if (task.schedule_type === 'WEEKLY') {
        const runDay  = task.run_at_day  || 1; // 0=Sun
        const runHour = task.run_at_hour || 0;
        if (now.getDay() !== runDay || now.getHours() !== runHour) return false;
        if (!last) return true;
        // Only run once per week
        return (now - last) >= 6 * 24 * 60 * 60 * 1000;
    }

    return false;
}

async function runDueTasks() {
    try {
        const [tasks] = await _db.query(
            'SELECT * FROM game_scheduled_tasks WHERE is_enabled=1 ORDER BY id');

        for (const task of tasks) {
            if (!isDue(task)) continue;

            try {
                await executeTask(task);
                await _db.query(
                    'UPDATE game_scheduled_tasks SET last_run_at=NOW() WHERE id=?',
                    [task.id]);
                console.log(`[Scheduler] ✅ Ran task #${task.id}: ${task.name}`);
            } catch (err) {
                console.error(`[Scheduler] ❌ Task #${task.id} failed:`, err.message);
            }
        }
    } catch (e) {
        console.error('[Scheduler] runDueTasks error:', e.message);
    }
}

async function executeTask(task) {
    const cfg = task.config_json
        ? (typeof task.config_json === 'string' ? JSON.parse(task.config_json) : task.config_json)
        : {};

    switch (task.task_type) {

        case 'SHOP_RESTOCK': {
            // TEACHING: When stock=-1 it means unlimited and never needs restocking.
            // We only restock items where restock_qty > 0 (a column we're treating as
            // the "default max stock" for limited items). If restock_qty doesn't exist
            // yet, we reset stock to 10 as a safe default for limited-stock items.
            //
            // Logic: find all supplies with stock >= 0 (finite stock items).
            // If a target shop_id is set, only restock that shop.
            let query = 'UPDATE game_shop_supplies SET stock = COALESCE(restock_qty, 10) WHERE stock >= 0';
            const params = [];
            if (task.target_id) {
                query += ' AND shop_id = ?';
                params.push(task.target_id);
            }
            await _db.query(query, params).catch(async () => {
                // restock_qty column might not exist yet — use a safe fallback
                let q2 = 'UPDATE game_shop_supplies SET stock = 10 WHERE stock >= 0 AND stock < 10';
                if (task.target_id) { q2 += ' AND shop_id = ?'; }
                await _db.query(q2, task.target_id ? [task.target_id] : []);
            });
            // Tell everyone's shop UIs to refresh
            _io.emit('shop_restocked', { shopId: task.target_id || null });
            break;
        }

        case 'SPAWN_RESPAWN': {
            // Mark dead NPC enemies as alive again on target map(s)
            // This also involves resetting their HP — we update via character rows
            if (task.target_id) {
                await _db.query(
                    `UPDATE characters c
                     JOIN game_npcs n ON n.char_id = c.id
                     SET c.current_hp = c.max_hp, n.is_dead = 0
                     WHERE n.map_id = ? AND n.is_enemy = 1`,
                    [task.target_id]);
            } else {
                await _db.query(
                    `UPDATE characters c
                     JOIN game_npcs n ON n.char_id = c.id
                     SET c.current_hp = c.max_hp, n.is_dead = 0
                     WHERE n.is_enemy = 1`);
            }
            console.log(`[Scheduler] Spawn respawn complete (map: ${task.target_id || 'all'})`);
            break;
        }

        case 'DUNGEON_RESET': {
            // 1. Find all players on this map
            // 2. Teleport them to their respawn point
            // 3. Respawn all enemies
            if (!task.target_id) {
                console.warn('[Scheduler] DUNGEON_RESET requires a target map_id — skipping');
                break;
            }
            const mapId = task.target_id;

            // Teleport online players off the map
            for (const [sockId, p] of Object.entries(_onlinePlayers)) {
                if (p.mapId === mapId) {
                    const [charRow] = await _db.query(
                        'SELECT respawn_map_id, respawn_x, respawn_y FROM characters WHERE id=?',
                        [p.charId]);
                    const rmap = charRow.length ? charRow[0].respawn_map_id || 1 : 1;
                    const rx   = charRow.length ? charRow[0].respawn_x    || 10 : 10;
                    const ry   = charRow.length ? charRow[0].respawn_y    || 10 : 10;
                    await _db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?',
                        [rmap, rx, ry, p.charId]);
                    p.mapId = rmap; p.x = rx; p.y = ry;
                    const sock = _io.sockets.sockets.get(sockId);
                    if (sock) {
                        sock.leave('map_' + mapId);
                        sock.join('map_' + rmap);
                        sock.emit('force_map_change', { mapId: rmap, x: rx, y: ry,
                            message: '⚠️ The dungeon has reset. You have been returned to safety.' });
                    }
                }
            }
            // Respawn enemies
            await _db.query(
                `UPDATE characters c JOIN game_npcs n ON n.char_id = c.id
                 SET c.current_hp = c.max_hp, n.is_dead = 0
                 WHERE n.map_id = ? AND n.is_enemy = 1`, [mapId]);
            break;
        }

        case 'SET_WORLD_FLAG': {
            if (!cfg.flag) break;
            const flagVal = String(cfg.value ?? 'true');
            await _db.query(
                `INSERT INTO world_flags (flag_key, flag_value, set_by)
                 VALUES (?, ?, 'scheduler')
                 ON DUPLICATE KEY UPDATE flag_value=VALUES(flag_value), set_by='scheduler'`,
                [cfg.flag, flagVal]);
            // Update in-memory worldFlags
            if (global.worldFlags) global.worldFlags[cfg.flag] = flagVal;
            _io.emit('world_flag_changed', { flag: cfg.flag, value: flagVal });
            // Re-evaluate region auto_rules since a flag changed
            if (global.loadRegionState) await global.loadRegionState();
            console.log(`[Scheduler] World flag set: ${cfg.flag} = ${flagVal}`);
            break;
        }

        case 'GIVE_XP_ALL': {
            const amount = parseInt(cfg.amount) || 100;
            // Give XP to all currently online characters
            const charIds = Object.values(_onlinePlayers).map(p => p.charId);
            if (!charIds.length) break;
            const placeholders = charIds.map(() => '?').join(',');
            await _db.query(
                `UPDATE characters SET experience = experience + ? WHERE id IN (${placeholders})`,
                [amount, ...charIds]);
            _io.emit('server_xp_grant', {
                amount,
                message: `🌟 You received ${amount} XP from a server event!`
            });
            break;
        }

        case 'SET_REGION_STATE': {
            // Directly update one or more fields on a region at runtime.
            // config_json example: {"region_id":2, "danger_level":4, "weather_override":"STORM"}
            if (!cfg.region_id) { console.warn('[Scheduler] SET_REGION_STATE missing region_id'); break; }
            const rid = parseInt(cfg.region_id);
            const { region_id: _rid, ...fields } = cfg;  // strip region_id from the fields to apply
            if (!Object.keys(fields).length) break;

            // Build dynamic SET clause
            const setCols = Object.keys(fields).map(k => `${k} = ?`).join(', ');
            const vals    = [...Object.values(fields), rid];
            await _db.query(`UPDATE game_regions SET ${setCols} WHERE id = ?`, vals);

            // Reload region into memory
            if (global.loadRegionState) await global.loadRegionState();
            const updated = global.regionState?.[rid];
            if (updated) _io.emit('region_updated', { region: updated });
            console.log(`[Scheduler] Region #${rid} updated:`, fields);
            break;
        }

        case 'BROADCAST': {
            const msg = cfg.message || 'Server announcement.';
            const color = cfg.color || '#bb86fc';
            _io.emit('server_broadcast', { message: msg, color });
            break;
        }
    }
}

// ── LFP Cleanup Job ──────────────────────────────────────────────
// Run every hour to purge expired LFP listings.
// TEACHING: We don't rely only on the DB expires_at column for
// cleanup — we proactively delete to keep the table small and
// the board fresh. Four-hour listings mean anyone who forgets
// to unlist will auto-expire by the time they log off.
// ── Profile Viewer Cleanup ───────────────────────────────────────
// Purge profile_viewers rows older than 30 days. Runs daily.
function startProfileViewerCleanup(db) {
    const cleanup = async () => {
        try {
            const [r] = await db.query('DELETE FROM profile_viewers WHERE viewed_at < NOW() - INTERVAL 30 DAY');
            if (r.affectedRows > 0) console.log(`[ProfileViewers] Cleaned ${r.affectedRows} stale row(s).`);
        } catch(e) { console.error('[ProfileViewers cleanup]', e.message); }
    };
    cleanup();
    setInterval(cleanup, 24 * 60 * 60 * 1000); // daily
}

function startLfpCleanup(db) {
    const cleanup = async () => {
        try {
            const [r] = await db.query('DELETE FROM lfp_listings WHERE expires_at < NOW()');
            if (r.affectedRows > 0)
                console.log(`[LFP] Cleaned up ${r.affectedRows} expired listing(s).`);
        } catch(e) { console.error('[LFP cleanup error]', e.message); }
    };
    cleanup(); // run once on startup
    setInterval(cleanup, 60 * 60 * 1000); // then every hour
}

module.exports = { init, runDueTasks, startLfpCleanup, startProfileViewerCleanup };
