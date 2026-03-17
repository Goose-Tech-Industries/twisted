// =================================================================
// ADMIN PANEL ROUTES
// Dashboard stats, Player Manager, GM Broadcast Tools
// =================================================================
const express = require('express');
const router  = express.Router();
let db, io;

router.init = (database, ioInstance) => { db = database; io = ioInstance; };

// ── Auth ──────────────────────────────────────────────────────────
async function requireStaff(req, res, next) {
    const userId = req.session && req.session.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    const [rows] = await db.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found' });
    const role = rows[0].role;
    if (!['ADMIN','GM','MOD','STAFF','OWNER'].includes(role))
        return res.status(403).json({ success: false, message: 'Staff only' });
    req.staffRole = role;
    next();
}

// ── Helpers ───────────────────────────────────────────────────────
function tryCount(db, sql, params = []) {
    return db.query(sql, params)
        .then(([r]) => (r[0] ? (r[0].n || r[0].c || 0) : 0))
        .catch(() => null);
}

// =================================================================
// DASHBOARD STATS
// GET /admin-panel/dashboard
// =================================================================
router.get('/dashboard', requireStaff, async (req, res) => {
    try {
        // Counts that are always safe
        const [users, chars, maps, npcs, items, battles] = await Promise.all([
            tryCount(db, 'SELECT COUNT(*) AS n FROM users'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM characters'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_maps WHERE is_active=1'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_npcs'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_items'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM active_battles').catch(() => null),
        ]);

        // Top maps by population (online players)
        const onlineList = global._onlinePlayers
            ? Object.values(global._onlinePlayers)
            : [];
        const mapPop = {};
        for (const p of onlineList) mapPop[p.mapId] = (mapPop[p.mapId] || 0) + 1;

        // Resolve map names for online player list
        const mapIds = [...new Set(onlineList.map(p => p.mapId).filter(Boolean))];
        let mapNameMap = {};
        if (mapIds.length) {
            const [mapRows] = await db.query(
                'SELECT id, name FROM game_maps WHERE id IN (' + mapIds.map(()=>'?').join(',') + ')', mapIds
            ).catch(() => [[]]);
            for (const m of mapRows) mapNameMap[m.id] = m.name;
        }
        const onlineListFull = onlineList.map(p => ({ ...p, mapName: mapNameMap[p.mapId] || null }));

        // AI provider status
        let aiProvider = 'disabled';
        try {
            const [[aiRow]] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='ai_provider' LIMIT 1");
            if (aiRow) aiProvider = aiRow.setting_value || 'disabled';
        } catch {}

        // Recent registrations (last 7 days)
        const [recentUsers] = await db.query(
            `SELECT id, username, role, created_at, last_login, is_banned
             FROM users ORDER BY created_at DESC LIMIT 10`).catch(() => [[]]);

        // Top characters by level
        const [topChars] = await db.query(
            `SELECT c.name, c.level, c.experience, u.username
             FROM characters c JOIN users u ON u.id=c.user_id
             ORDER BY c.level DESC, c.experience DESC LIMIT 5`).catch(() => [[]]);

        // Gold in world
        const [goldRow] = await db.query('SELECT SUM(currency) AS total FROM users').catch(() => [[{total:0}]]);
        const totalGold = goldRow[0]?.total || 0;

        // ── Extra analytics ──────────────────────────────────────────
        // New registrations per day for the last 7 days (signup trend)
        const [signupTrend] = await db.query(
            `SELECT DATE(created_at) AS day, COUNT(*) AS n
             FROM users
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(created_at)
             ORDER BY day ASC`
        ).catch(() => [[]])

        // Average login streak across active players (logged in last 7 days)
        const [streakRow] = await db.query(
            `SELECT ROUND(AVG(login_streak),1) AS avg_streak,
                    MAX(login_streak)           AS max_streak,
                    COUNT(*)                    AS streak_players
             FROM users
             WHERE last_login >= NOW() - INTERVAL 7 DAY
               AND login_streak > 0`
        ).catch(() => [[{avg_streak:0, max_streak:0, streak_players:0}]]);
        const streakStats = streakRow[0] || { avg_streak: 0, max_streak: 0, streak_players: 0 };

        // Open reports count (if table exists)
        const openReports = await tryCount(
            db, "SELECT COUNT(*) AS n FROM game_reports WHERE status='open'"
        ).catch(() => null);

        // Total battles today
        const battlesToday = await tryCount(
            db, "SELECT COUNT(*) AS n FROM game_battles WHERE created_at >= CURDATE()"
        ).catch(() => null);

        // Tutorial completion rate (characters with tutorial_done flag set)
        const [tutRow] = await db.query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN state_json LIKE '%"tutorial_done":true%' THEN 1 ELSE 0 END) AS done
             FROM characters`
        ).catch(() => [[{total:1, done:0}]]);
        const tutStats = tutRow[0] || { total: 1, done: 0 };
        const tutorialRate = tutStats.total > 0
            ? Math.round((tutStats.done / tutStats.total) * 100)
            : 0;

        res.json({
            success: true,
            stats: { users, chars, maps, npcs, items, battles },
            online: onlineListFull.length,
            onlineList: onlineListFull,
            aiProvider,
            mapPop,
            recentUsers,
            topChars,
            totalGold,
            signupTrend,
            streakStats,
            openReports,
            battlesToday,
            tutorialRate
        });
    } catch (e) {
        console.error('[AdminPanel] dashboard error:', e);
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// PLAYER MANAGER
// GET  /admin-panel/players?q=searchterm
// GET  /admin-panel/player/:id
// POST /admin-panel/player/:id/ban
// POST /admin-panel/player/:id/unban
// POST /admin-panel/player/:id/role
// POST /admin-panel/player/:id/give-gold
// POST /admin-panel/player/:id/give-item
// POST /admin-panel/player/:id/reset-hp
// =================================================================
router.get('/players', requireStaff, async (req, res) => {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    try {
        let sql = `SELECT u.id, u.username, u.email, u.role, u.currency AS gold,
                          u.is_banned, u.created_at, u.last_login,
                          COUNT(c.id) AS char_count
                   FROM users u LEFT JOIN characters c ON c.user_id=u.id`;
        const params = [];
        if (q) { sql += ' WHERE u.username LIKE ? OR u.email LIKE ?'; params.push(`%${q}%`, `%${q}%`); }
        sql += ' GROUP BY u.id ORDER BY u.last_login DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);

        // Mark online
        const onlineUserIds = new Set(
            Object.values(global._onlinePlayers || {}).map(p => p.userId)
        );
        const players = rows.map(r => ({ ...r, online: onlineUserIds.has(r.id) }));
        res.json({ success: true, data: players });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

router.get('/player/:id', requireStaff, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const [[user]]  = await db.query(
            'SELECT id,username,email,role,currency,is_banned,created_at,last_login FROM users WHERE id=?', [userId]);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const [chars] = await db.query(
            `SELECT c.*, gc.name AS class_name, gr.name AS race_name
             FROM characters c
             LEFT JOIN game_classes gc ON gc.id=c.class_id
             LEFT JOIN game_races gr ON gr.id=c.race_id
             WHERE c.user_id=? ORDER BY c.level DESC`, [userId]);

        // For each char, grab equipped items & inventory count
        for (const ch of chars) {
            const [inv] = await db.query(
                'SELECT COUNT(*) AS n FROM character_items WHERE character_id=?', [ch.id]);
            ch.inv_count = inv[0]?.n || 0;
            const [equip] = await db.query(
                `SELECT ce.slot_key, gi.name, gi.icon FROM character_equipment ce
                 JOIN game_items gi ON gi.id=ce.item_id WHERE ce.character_id=?`, [ch.id]);
            ch.equipment = equip;
        }

        const online = Object.values(global._onlinePlayers || {}).some(p => p.userId === userId);
        res.json({ success: true, data: { user, chars, online } });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

router.post('/player/:id/ban', requireStaff, async (req, res) => {
    const { reason } = req.body;
    const [uban] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET is_banned=1 WHERE id=?', [req.params.id]);
    _kickPlayer(parseInt(req.params.id), `You have been banned. ${reason || ''}`);
    const staffId = req.session.userId;
    await logEvent('gm_ban', staffId, 'GM', parseInt(req.params.id), uban[0]?.username, { reason });
    res.json({ success: true, message: 'Player banned.' });
});

router.post('/player/:id/unban', requireStaff, async (req, res) => {
    const [uunban] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET is_banned=0 WHERE id=?', [req.params.id]);
    await logEvent('gm_unban', req.session.userId, 'GM', parseInt(req.params.id), uunban[0]?.username);
    res.json({ success: true, message: 'Player unbanned.' });
});

router.post('/player/:id/role', requireStaff, async (req, res) => {
    const { role } = req.body;
    const valid = ['PLAYER','MOD','GM','ADMIN','OWNER'];
    if (!valid.includes(role)) return res.json({ success: false, message: 'Invalid role.' });
    // Only OWNER can promote to OWNER/ADMIN
    if (['OWNER','ADMIN'].includes(role) && req.staffRole !== 'OWNER')
        return res.json({ success: false, message: 'Only OWNER can grant ADMIN/OWNER.' });
    const [urole] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET role=? WHERE id=?', [role, req.params.id]);
    await logEvent('gm_role_change', req.session.userId, 'GM', parseInt(req.params.id), urole[0]?.username, { role });
    res.json({ success: true, message: `Role set to ${role}.` });
});

router.post('/player/:id/give-gold', requireStaff, async (req, res) => {
    const amount = parseInt(req.body.amount) || 0;
    if (amount === 0) return res.json({ success: false, message: 'Amount must be non-zero.' });
    const [ugold] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET currency=GREATEST(0,currency+?) WHERE id=?', [amount, req.params.id]);
    await logEvent('gm_give_gold', req.session.userId, 'GM', parseInt(req.params.id), ugold[0]?.username, { amount });
    // Notify if online
    _notifyUser(parseInt(req.params.id), {
        text: `💰 A GM has ${amount > 0 ? 'given you' : 'taken'} ${Math.abs(amount)} gold.`,
        type: 'gm_gold'
    });
    res.json({ success: true, message: `${amount > 0 ? '+' : ''}${amount} gold applied.` });
});

router.post('/player/:id/give-item', requireStaff, async (req, res) => {
    const { charId, itemId, qty } = req.body;
    if (!charId || !itemId) return res.json({ success: false, message: 'charId and itemId required.' });
    const quantity = Math.max(1, parseInt(qty) || 1);
    await db.query(
        'INSERT INTO character_items (character_id,item_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+?',
        [charId, itemId, quantity, quantity]
    );
    const [[item]] = await db.query('SELECT name,icon FROM game_items WHERE id=?', [itemId]);
    _notifyChar(parseInt(charId), {
        text: `🎁 A GM gave you ${quantity}× ${item?.icon||'📦'} ${item?.name||'Item'}.`,
        type: 'gm_item'
    });
    res.json({ success: true, message: `Item granted.` });
});

router.post('/player/:id/reset-hp', requireStaff, async (req, res) => {
    const { charId } = req.body;
    if (!charId) return res.json({ success: false, message: 'charId required.' });
    await db.query('UPDATE characters SET current_hp=max_hp, current_mp=max_mp WHERE id=?', [charId]);
    _notifyChar(parseInt(charId), { text: '✨ A GM has restored your HP and MP.', type: 'gm_heal' });
    res.json({ success: true, message: 'HP/MP restored.' });
});

// =================================================================
// GM BROADCAST TOOLS
// POST /admin-panel/broadcast        → all players
// POST /admin-panel/broadcast-map    → players on a specific map
// POST /admin-panel/broadcast-player → one player (by userId)
// POST /admin-panel/world-event      → triggers a client-side world event
// POST /admin-panel/kick             → force disconnect a player
// POST /admin-panel/server-announce  → system announcement (styled differently)
// =================================================================
router.post('/broadcast', requireStaff, async (req, res) => {
    const { message, channel } = req.body;
    if (!message) return res.json({ success: false, message: 'Message required.' });
    if (!io) return res.json({ success: false, message: 'Socket.IO not available.' });
    io.emit('chat_msg', {
        sender: '📢 ANNOUNCEMENT',
        text:   message,
        channel: channel || 'announce',
        isGm:   true
    });
    res.json({ success: true, message: 'Broadcast sent.' });
});

router.post('/broadcast-map', requireStaff, async (req, res) => {
    const { mapId, message } = req.body;
    if (!mapId || !message) return res.json({ success: false, message: 'mapId and message required.' });
    if (!io) return res.json({ success: false, message: 'Socket.IO not available.' });
    io.to('map_' + mapId).emit('chat_msg', {
        sender: '📢 GM',
        text:   message,
        channel: 'local',
        isGm:   true
    });
    res.json({ success: true, message: `Sent to map ${mapId}.` });
});

router.post('/broadcast-player', requireStaff, async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) return res.json({ success: false, message: 'userId and message required.' });
    _notifyUser(parseInt(userId), { text: `📨 GM: ${message}`, type: 'gm_message' });
    res.json({ success: true, message: 'DM sent.' });
});

router.post('/world-event', requireStaff, async (req, res) => {
    const { eventType, payload } = req.body;
    if (!eventType) return res.json({ success: false, message: 'eventType required.' });
    if (!io) return res.json({ success: false, message: 'Socket.IO not available.' });
    // Supported world events: weather_change, darkness_falls, emergency, blood_moon
    io.emit('world_event', { type: eventType, ...(payload || {}) });
    res.json({ success: true, message: `World event '${eventType}' fired.` });
});

router.post('/server-announce', requireStaff, async (req, res) => {
    const { message, style } = req.body; // style: 'info' | 'warning' | 'danger'
    if (!message) return res.json({ success: false, message: 'Message required.' });
    if (!io) return res.json({ success: false, message: 'Socket.IO not available.' });
    io.emit('server_announce', { message, style: style || 'info', ts: Date.now() });
    res.json({ success: true });
});

router.post('/kick', requireStaff, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId required.' });
    _kickPlayer(parseInt(userId), reason || 'Kicked by GM.');
    res.json({ success: true, message: 'Player kicked.' });
});

// =================================================================
// EVENT LOG HELPER
// =================================================================
async function logEvent(type, actorId, actorName, targetId, targetName, detail = {}, mapId = null) {
    try {
        await db.query(
            `INSERT INTO game_event_log (event_type,actor_id,actor_name,target_id,target_name,detail_json,map_id)
             VALUES (?,?,?,?,?,?,?)`,
            [type, actorId||null, actorName||null, targetId||null, targetName||null,
             JSON.stringify(detail), mapId||null]
        );
    } catch(e) { /* non-fatal — log table may not exist yet */ }
}

// =================================================================
// INTERNAL HELPERS — talk to online players via socket.io
// =================================================================
function _kickPlayer(userId, reason) {
    if (!io || !global._onlinePlayers) return;
    for (const [sid, p] of Object.entries(global._onlinePlayers)) {
        if (p.userId === userId) {
            io.to(sid).emit('force_disconnect', { reason });
            const socket = io.sockets.sockets.get(sid);
            if (socket) socket.disconnect(true);
        }
    }
}

function _notifyUser(userId, payload) {
    if (!io || !global._onlinePlayers) return;
    for (const [sid, p] of Object.entries(global._onlinePlayers)) {
        if (p.userId === userId) io.to(sid).emit('notification', payload);
    }
}

function _notifyChar(charId, payload) {
    if (!io) return;
    io.to(`char_${charId}`).emit('notification', payload);
}


// =================================================================
// ECONOMY DASHBOARD
// GET /admin-panel/economy
// =================================================================
router.get('/economy', requireStaff, async (req, res) => {
    try {
        // Total gold in circulation
        const [[goldRow]]   = await db.query('SELECT SUM(currency) AS total, AVG(currency) AS avg, MAX(currency) AS max FROM users');
        // Starting gold from config
        let startingGold = 100;
        try {
            for (const tbl of ['game_settings','system_settings','settings']) {
                const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                if (!sr.length) continue;
                const [cr] = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                const cols = cr.map(c => c.Field);
                const kc = cols.find(n => /key|name/i.test(n));
                const vc = cols.find(n => /val|value/i.test(n));
                if (!kc || !vc) continue;
                const [sv] = await db.query('SELECT ?? AS v FROM ?? WHERE ?? = ?', [vc, tbl, kc, 'starting_gold']);
                if (sv.length) { startingGold = parseInt(sv[0].v) || 100; break; }
            }
        } catch {}

        // Richest players
        const [richest] = await db.query(
            `SELECT u.id, u.username, u.currency AS gold, u.role,
                    COUNT(c.id) AS char_count
             FROM users u LEFT JOIN characters c ON c.user_id=u.id
             GROUP BY u.id ORDER BY u.currency DESC LIMIT 15`);

        // Gold distribution buckets
        const [dist] = await db.query(`
            SELECT
                SUM(currency = 0)                     AS broke,
                SUM(currency BETWEEN 1 AND 100)       AS poor,
                SUM(currency BETWEEN 101 AND 500)     AS modest,
                SUM(currency BETWEEN 501 AND 2000)    AS comfortable,
                SUM(currency BETWEEN 2001 AND 10000)  AS wealthy,
                SUM(currency > 10000)                 AS rich,
                COUNT(*)                              AS total_users
            FROM users`);

        // Battle gold stats from level table
        const [lvlGold] = await db.query(
            'SELECT level, gold_for_win FROM level_requirements ORDER BY level'
        ).catch(() => db.query('SELECT level, gold_for_win FROM game_levels ORDER BY level').catch(() => [[]]));

        // Recent gold events from event log
        const [goldEvents] = await db.query(
            `SELECT * FROM game_event_log
             WHERE event_type IN ('gm_give_gold','battle_end')
             ORDER BY created_at DESC LIMIT 20`
        ).catch(() => [[]]);

        // Total accounts
        const [[userCount]] = await db.query('SELECT COUNT(*) AS n FROM users');
        const theoreticalStartingGold = (userCount.n || 0) * startingGold;

        res.json({
            success: true,
            data: {
                totalGold:   goldRow.total || 0,
                avgGold:     Math.round(goldRow.avg || 0),
                maxGold:     goldRow.max || 0,
                startingGold,
                theoreticalStartingGold,
                richest,
                distribution: dist[0],
                levelGoldTable: lvlGold,
                recentGoldEvents: goldEvents
            }
        });
    } catch(e) {
        console.error('[Economy]', e);
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// EVENT LOG
// GET /admin-panel/event-log?type=&limit=&actorName=
// =================================================================
router.get('/event-log', requireStaff, async (req, res) => {
    const { type, actorName, limit: lim } = req.query;
    const limit = Math.min(parseInt(lim) || 100, 500);
    try {
        let sql = 'SELECT * FROM game_event_log';
        const params = [], where = [];
        if (type)      { where.push('event_type = ?');     params.push(type); }
        if (actorName) { where.push('actor_name LIKE ?');  params.push(`%${actorName}%`); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch(e) {
        // Table might not exist yet
        if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [], note: 'Run migration to create game_event_log table.' });
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// MAP CONNECTIONS — read/write warp events across maps
// GET  /admin-panel/map-connections          → all TELEPORT events across all maps
// POST /admin-panel/map-connections/save     → update one map's collisions_json
// =================================================================
router.get('/map-connections', requireStaff, async (req, res) => {
    try {
        const [maps] = await db.query('SELECT id, name, width, height, collisions_json FROM game_maps WHERE is_active=1 ORDER BY name');
        const connections = [];
        for (const map of maps) {
            let events = [];
            try { events = JSON.parse(map.collisions_json || '[]'); } catch {}
            const warps = events.filter(e => e.type === 'TELEPORT');
            for (const w of warps) {
                const parts = String(w.data || '').split(',');
                const destMapId = parseInt(parts[0]);
                const destMap = maps.find(m => m.id === destMapId);
                connections.push({
                    sourceMapId:   map.id,
                    sourceMapName: map.name,
                    srcX: w.x, srcY: w.y,
                    destMapId,
                    destMapName: destMap ? destMap.name : `Map #${destMapId}`,
                    destX: parseInt(parts[1]) || 0,
                    destY: parseInt(parts[2]) || 0,
                    // raw event for editing
                    raw: w
                });
            }
        }
        res.json({ success: true, maps: maps.map(m => ({ id: m.id, name: m.name, width: m.width, height: m.height })), connections });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

router.post('/map-connections/save', requireStaff, async (req, res) => {
    // Expects: { mapId, events: [...] }  — full collisions_json replacement for one map
    const { mapId, events } = req.body;
    if (!mapId || !Array.isArray(events)) return res.json({ success: false, message: 'mapId and events required.' });
    try {
        await db.query('UPDATE game_maps SET collisions_json=? WHERE id=?', [JSON.stringify(events), mapId]);
        await logEvent('map_connection_edit', req.session.userId, 'GM', mapId, null, { event_count: events.length });
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// LORE BIBLE — shared DB-backed storage (world_forge_lore_bible key)
// =================================================================
router.get('/lore-bible', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT setting_value AS v FROM system_settings WHERE setting_key='world_forge_lore_bible' LIMIT 1"
        );
        res.json({ success: true, value: rows.length ? rows[0].v : '' });
    } catch(e) { res.json({ success: true, value: '' }); }
});

router.post('/lore-bible', requireStaff, async (req, res) => {
    const { value } = req.body;
    try {
        await db.query(
            `INSERT INTO system_settings (setting_key, setting_value, description)
             VALUES ('world_forge_lore_bible', ?, 'Shared World Forge lore context for all GMs')
             ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
            [String(value || '').slice(0, 4000)]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// GM NOTES — global + per-map staff notes
// GET  /admin-panel/notes?mapId=0   (0 = global)
// POST /admin-panel/notes
// DELETE /admin-panel/notes/:id
// =================================================================
router.get('/notes', requireStaff, async (req, res) => {
    const mapId = req.query.mapId !== undefined ? parseInt(req.query.mapId) : null;
    try {
        // Ensure table exists
        await db.query(`CREATE TABLE IF NOT EXISTS gm_notes (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            map_id     INT UNSIGNED DEFAULT NULL,
            author_id  INT UNSIGNED NOT NULL,
            author     VARCHAR(64)  NOT NULL,
            body       TEXT         NOT NULL,
            pinned     TINYINT(1)   NOT NULL DEFAULT 0,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gmnotes_map (map_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        let sql = 'SELECT * FROM gm_notes';
        const params = [];
        if (mapId !== null) {
            sql += mapId === 0 ? ' WHERE map_id IS NULL' : ' WHERE map_id=?';
            if (mapId !== 0) params.push(mapId);
        }
        sql += ' ORDER BY pinned DESC, created_at DESC LIMIT 100';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/notes', requireStaff, async (req, res) => {
    const { body, mapId, pinned } = req.body;
    if (!body?.trim()) return res.json({ success: false, message: 'Note body required.' });
    const userId = req.session.userId;
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS gm_notes (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, map_id INT UNSIGNED DEFAULT NULL,
            author_id INT UNSIGNED NOT NULL, author VARCHAR(64) NOT NULL,
            body TEXT NOT NULL, pinned TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gmnotes_map (map_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        const [urow] = await db.query('SELECT username FROM users WHERE id=?', [userId]);
        const author = urow[0]?.username || 'GM';
        const mid    = mapId ? parseInt(mapId) : null;
        await db.query(
            'INSERT INTO gm_notes (map_id, author_id, author, body, pinned) VALUES (?,?,?,?,?)',
            [mid, userId, author, body.trim(), pinned ? 1 : 0]
        );
        await logEvent('gm_note', userId, author, null, null, { mapId: mid, snippet: body.trim().slice(0,80) });
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.delete('/notes/:id', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM gm_notes WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/notes/:id/pin', requireStaff, async (req, res) => {
    try {
        await db.query('UPDATE gm_notes SET pinned=NOT pinned WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// PARTY & GUILD LIVE VIEWER
// GET /admin-panel/live-social
// =================================================================
router.get('/live-social', requireStaff, async (req, res) => {
    try {
        // Active parties from DB (those with 2+ members)
        const [parties] = await db.query(`
            SELECT p.id, p.name, p.leader_id, c.name AS leader_name,
                   COUNT(pm.character_id) AS member_count
            FROM parties p
            JOIN characters c ON c.id = p.leader_id
            JOIN party_members pm ON pm.party_id = p.id
            GROUP BY p.id
            ORDER BY member_count DESC, p.id DESC
            LIMIT 50`).catch(() => [[]]);

        // Members per party
        const partyDetails = [];
        for (const p of parties) {
            const [members] = await db.query(`
                SELECT c.id, c.name, c.level, u.username,
                       CASE WHEN c.id = ? THEN 1 ELSE 0 END AS is_leader
                FROM party_members pm
                JOIN characters c ON c.id = pm.character_id
                JOIN users u ON u.id = c.user_id
                WHERE pm.party_id = ?`, [p.leader_id, p.id]).catch(() => [[]]);

            const onlineIds = new Set(Object.values(global._onlinePlayers || {}).map(pl => pl.charId));
            partyDetails.push({
                ...p,
                members: members.map(m => ({ ...m, online: onlineIds.has(m.id) }))
            });
        }

        // Active guilds with online member count
        const [guilds] = await db.query(`
            SELECT g.id, g.name, g.tag, g.level AS guild_level,
                   COUNT(gm.character_id) AS total_members
            FROM guilds g
            JOIN guild_members gm ON gm.guild_id = g.id
            GROUP BY g.id
            ORDER BY total_members DESC
            LIMIT 30`).catch(() => [[]]);

        const onlinePlayers = Object.values(global._onlinePlayers || {});
        const guildDetails = [];
        for (const g of guilds) {
            const [members] = await db.query(`
                SELECT c.id, c.name, c.level, gm.rank, u.username
                FROM guild_members gm
                JOIN characters c ON c.id = gm.character_id
                JOIN users u ON u.id = c.user_id
                WHERE gm.guild_id = ?
                ORDER BY gm.rank DESC, c.level DESC`, [g.id]).catch(() => [[]]);

            const onlineIds = new Set(onlinePlayers.map(p => p.charId));
            const onlineCount = members.filter(m => onlineIds.has(m.id)).length;
            guildDetails.push({
                ...g,
                onlineCount,
                members: members.map(m => ({ ...m, online: onlineIds.has(m.id) }))
            });
        }

        res.json({ success: true, parties: partyDetails, guilds: guildDetails });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// CHARACTER APPEARANCE
// GET  /admin-panel/character-appearance/:charId
// POST /admin-panel/character-appearance/:charId
// =================================================================
router.get('/character-appearance/:charId', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT appearance_json FROM characters WHERE id=?', [req.params.charId]);
        if (!rows.length) return res.json({ success: false, message: 'Character not found.' });
        let appearance = {};
        try { appearance = JSON.parse(rows[0].appearance_json || '{}'); } catch {}
        res.json({ success: true, data: appearance });
    } catch(e) { res.json({ success: false, message: e.message }); }
});
// =================================================================
// NEW ROUTES — Added for Next.js UI compatibility
// These aliases bridge the gap between what the v0 UI calls and
// what the original admin panel provides.
// =================================================================

// ── Generic Entity CRUD (REST-style) ─────────────────────────────
// UI calls: GET /admin-panel/:type   → list all
//           GET /admin-panel/:type/:id → single item
//           POST /admin-panel/:type   → create
//           POST /admin-panel/:type/:id → update
//           POST /admin-panel/:type/:id/delete → delete

const ENTITY_TABLE_MAP = {
    // ── original types ────────────────────────────────────────────
    item: 'game_items', skill: 'game_skills', npc: 'game_npcs',
    map: 'game_maps', quest: 'game_quests', class: 'game_classes',
    race: 'game_races', ogham: 'game_oghams', ogham_family: 'ogham_families',
    shop: 'game_shops', arena: 'game_arenas', artifact: 'legendary_artifacts',
    status: 'game_statuses', feat: 'game_feats', loot_table: 'npc_loot_tables',
    spawn: 'map_spawns', battle_cmd: 'game_battle_cmds', background: 'game_backgrounds',
    // ── added for React admin panels ──────────────────────────────
    stat:           'game_stat_definitions',  // StatEnginePanel
    shop_supply:    'shop_supplies',          // ShopSupplyPanel
    artifact_power: 'artifact_powers',        // ArtifactManagerPanel (powers tab)
    quest_board:    'game_quest_board',       // QuestBoardPanel
    region:         'game_regions',           // WorldStatePanel (faction/region lookups)
    faction:        'game_factions',          // WorldStatePanel (faction lookups)
    scheduled_task: 'game_scheduled_tasks',  // SchedulerPanel
    craft_recipe:   'game_craft_recipes',    // CraftManagerPanel
    auction_listing:'auction_listings',      // AuctionPanel
    limit:          'game_limit_breaks',     // LimitBreakPanel (alias for existing 'limit' type)
};
const ENTITY_PK_MAP = {
    artifact:       'artifact_id',
    artifact_power: 'power_id',
    quest:          'quest_id',
    loot_table:     'id',
    spawn:          'id',
};

function getTable(type) {
    const t = ENTITY_TABLE_MAP[type];
    if (!t) throw Object.assign(new Error(`Unknown entity type: ${type}`), { status: 400 });
    return t;
}
function getPk(type) { return ENTITY_PK_MAP[type] || 'id'; }

// ── type union used by the three generic CRUD routes below ────────
const ENTITY_TYPES = 'item|skill|npc|map|quest|class|race|ogham|ogham_family|shop|arena|artifact|status|feat|loot_table|spawn|battle_cmd|background|stat|shop_supply|artifact_power|quest_board|region|faction|scheduled_task|craft_recipe|auction_listing|limit';

// GET /admin-panel/:type — list all entities of a type
router.get(`/:type(${ENTITY_TYPES})`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const [rows] = await db.query('SELECT * FROM ?? ORDER BY ?? DESC', [table, pk]);
        res.json({ success: true, data: rows });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// GET /admin-panel/:type/:id — single entity
router.get('/:type/:id', requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=? LIMIT 1', [table, pk, req.params.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, data: rows[0] });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type/:id/delete — delete
router.post('/:type/:id/delete', requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        await db.query('DELETE FROM ?? WHERE ??=?', [table, pk, req.params.id]);
        res.json({ success: true });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type/:id — update existing entity
router.post('/:type/:id([0-9]+)', requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const data = req.body;
        delete data[pk]; // never update PK
        if (!Object.keys(data).length) return res.status(400).json({ success: false, message: 'No data' });
        await db.query('UPDATE ?? SET ? WHERE ??=?', [table, data, pk, req.params.id]);
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=?', [table, pk, req.params.id]);
        res.json({ success: true, data: rows[0] || null });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// POST /admin-panel/:type — create new entity
router.post(`/:type(${ENTITY_TYPES})`, requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        const data = req.body;
        const [result] = await db.query('INSERT INTO ?? SET ?', [table, data]);
        const insertId = result.insertId;
        const [rows] = await db.query('SELECT * FROM ?? WHERE ??=?', [table, pk, insertId]);
        res.json({ success: true, data: rows[0] || null });
    } catch(e) { res.status(e.status||500).json({ success: false, message: e.message }); }
});

// ── Player action aliases (flat body, not :id param) ─────────────
// UI sends: POST /admin-panel/player/ban   { userId, reason }
// Backend had: POST /admin-panel/player/:id/ban
router.post('/player/ban', requireStaff, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    req.params = { id: userId };
    req.body.reason = reason;
    try {
        await db.query('UPDATE users SET is_banned=1, ban_reason=? WHERE id=?', [reason||'', userId]);
        res.json({ success: true, message: 'Player banned.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/unban', requireStaff, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    try {
        await db.query('UPDATE users SET is_banned=0, ban_reason=NULL WHERE id=?', [userId]);
        res.json({ success: true, message: 'Player unbanned.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/role', requireStaff, async (req, res) => {
    const { userId, role } = req.body;
    if (!userId || !role) return res.status(400).json({ success: false, message: 'userId and role required' });
    const valid = ['PLAYER','STAFF','MOD','GM','ADMIN','OWNER'];
    if (!valid.includes(role.toUpperCase())) return res.status(400).json({ success: false, message: 'Invalid role' });
    try {
        await db.query('UPDATE users SET role=? WHERE id=?', [role.toUpperCase(), userId]);
        res.json({ success: true, message: `Role set to ${role}` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/give-gold', requireStaff, async (req, res) => {
    const { charId, amount } = req.body;
    if (!charId || amount == null) return res.status(400).json({ success: false, message: 'charId and amount required' });
    try {
        await db.query('UPDATE characters SET gold = gold + ? WHERE id=?', [amount, charId]);
        res.json({ success: true, message: `Gave ${amount} gold to character ${charId}` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/give-item', requireStaff, async (req, res) => {
    const { charId, itemId, quantity = 1 } = req.body;
    if (!charId || !itemId) return res.status(400).json({ success: false, message: 'charId and itemId required' });
    try {
        // Upsert: add to existing stack or insert new row
        const [existing] = await db.query(
            'SELECT id, quantity FROM character_inventory WHERE character_id=? AND item_id=? LIMIT 1',
            [charId, itemId]
        );
        if (existing.length) {
            await db.query('UPDATE character_inventory SET quantity=quantity+? WHERE id=?', [quantity, existing[0].id]);
        } else {
            await db.query('INSERT INTO character_inventory (character_id, item_id, quantity) VALUES (?,?,?)', [charId, itemId, quantity]);
        }
        res.json({ success: true, message: `Gave ${quantity}x item ${itemId} to character ${charId}` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/kick', requireStaff, async (req, res) => {
    // Forward to existing /kick handler logic
    const { charId, reason } = req.body;
    if (!charId) return res.status(400).json({ success: false, message: 'charId required' });
    try {
        if (global._onlinePlayers) {
            const player = Object.values(global._onlinePlayers).find(p => p.charId === charId);
            if (player && player.socketId && global._io) {
                global._io.to(player.socketId).emit('kicked', { reason: reason || 'Kicked by GM' });
                global._io.sockets.sockets.get(player.socketId)?.disconnect(true);
            }
        }
        res.json({ success: true, message: `Character ${charId} kicked` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/teleport', requireStaff, async (req, res) => {
    const { charId, mapId, x = 5, y = 5 } = req.body;
    if (!charId || !mapId) return res.status(400).json({ success: false, message: 'charId and mapId required' });
    try {
        await db.query('UPDATE characters SET map_id=?, x=?, y=? WHERE id=?', [mapId, x, y, charId]);
        // If player is online, push a live teleport
        if (global._onlinePlayers && global._io) {
            const player = Object.values(global._onlinePlayers).find(p => p.charId === charId);
            if (player && player.socketId) {
                global._io.to(player.socketId).emit('teleport', { mapId, x, y });
            }
        }
        res.json({ success: true, message: `Teleported character ${charId} to map ${mapId} (${x},${y})` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/set-level', requireStaff, async (req, res) => {
    const { charId, level } = req.body;
    if (!charId || !level) return res.status(400).json({ success: false, message: 'charId and level required' });
    try {
        await db.query('UPDATE characters SET level=? WHERE id=?', [level, charId]);
        res.json({ success: true, message: `Set character ${charId} to level ${level}` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


// ── Edit user account ─────────────────────────────────────────────
router.post('/player/edit-user', requireStaff, async (req, res) => {
    const { userId, username, email, currency } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    try {
        const updates = [], vals = [];
        if (username) { updates.push('username=?'); vals.push(username.trim()); }
        if (email)    { updates.push('email=?');    vals.push(email.trim()); }
        if (currency !== undefined) { updates.push('currency=?'); vals.push(parseInt(currency)); }
        if (!updates.length) return res.json({ success: false, message: 'Nothing to update' });
        vals.push(userId);
        await db.query(`UPDATE users SET ${updates.join(',')} WHERE id=?`, vals);
        res.json({ success: true, message: 'User updated.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/edit-char', requireStaff, async (req, res) => {
    const { charId, ...fields } = req.body;
    if (!charId) return res.status(400).json({ success: false, message: 'charId required' });
    const allowed = ['name','atk','def','mo','md','speed','luck','max_hp','max_mp','current_hp','current_mp','experience','gold','level','x','y','map_id','limitbreak','breaklevel'];
    try {
        const updates = [], vals = [];
        for (const [k, v] of Object.entries(fields)) {
            if (allowed.includes(k) && v !== undefined && v !== '') {
                updates.push(`${k}=?`);
                vals.push(k === 'name' ? String(v).trim() : Number(v));
            }
        }
        if (!updates.length) return res.json({ success: false, message: 'Nothing to update' });
        vals.push(charId);
        await db.query(`UPDATE characters SET ${updates.join(',')} WHERE id=?`, vals);
        res.json({ success: true, message: 'Character updated.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/reset-password', requireStaff, async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ success: false, message: 'userId and newPassword required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be 6+ chars' });
    try {
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash(newPassword, 10);
        await db.query('UPDATE users SET password_hash=? WHERE id=?', [hash, userId]);
        res.json({ success: true, message: 'Password reset.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/clear-status', requireStaff, async (req, res) => {
    const { charId } = req.body;
    if (!charId) return res.status(400).json({ success: false, message: 'charId required' });
    try {
        await db.query("UPDATE characters SET status_effects='[]' WHERE id=?", [charId]);
        res.json({ success: true, message: 'Status effects cleared.' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Settings ──────────────────────────────────────────────────────
// GET  /admin-panel/settings — returns all key/value settings
// POST /admin-panel/settings — saves settings object
router.get('/settings', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_key, setting_value, setting_type FROM game_settings').catch(() => [[]]);
        const settings = {};
        for (const row of rows) {
            let val = row.setting_value;
            if (row.setting_type === 'number') val = parseFloat(val);
            else if (row.setting_type === 'boolean') val = val === 'true' || val === '1';
            settings[row.setting_key] = val;
        }
        res.json({ success: true, data: settings });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/settings', requireStaff, async (req, res) => {
    try {
        const settings = req.body;
        for (const [key, value] of Object.entries(settings)) {
            const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
            await db.query(
                'INSERT INTO game_settings (setting_key, setting_value, setting_type) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=?, setting_type=?',
                [key, String(value), type, String(value), type]
            ).catch(() => {}); // ignore if table doesn't exist
        }
        res.json({ success: true, message: 'Settings saved' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


module.exports = router;
