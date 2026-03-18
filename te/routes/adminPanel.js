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
// TEMPLATE INSTALLER
// =================================================================
router.get('/templates', requireStaff, async (req, res) => {
    try {
        const TemplateInstaller = require('../template_installer');
        const templates = await TemplateInstaller.list(db);
        const active = await TemplateInstaller.getActive(db);
        res.json({ success: true, templates, active });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/templates/:id/install', requireStaff, async (req, res) => {
    try {
        const TemplateInstaller = require('../template_installer');
        const result = await TemplateInstaller.install(db, parseInt(req.params.id));
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// =================================================================
// BATTLE CONFIG MEGA-PANEL — All settings + terminology in one call
// =================================================================
router.get('/battle-config', requireStaff, async (req, res) => {
    try {
        // Load all system_settings
        const [settings] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const settingsMap = {};
        for (const s of settings) settingsMap[s.setting_key] = s.setting_value;

        // Load terminology
        const [terms] = await db.query('SELECT * FROM game_terminology ORDER BY category, term_key');

        // Organize settings into categories with metadata
        const categories = {
            core_combat: {
                label: 'Core Combat', icon: '⚔️',
                settings: [
                    { key: 'enable_limb_targeting', type: 'toggle', label: 'Limb Targeting', desc: 'Target specific body parts for tactical damage.', termKey: 'limb_targeting' },
                    { key: 'enable_active_defense', type: 'toggle', label: 'Active Defense', desc: 'Dodge/Block/Counter on incoming attacks.', termKey: 'active_defense' },
                    { key: 'enable_nonlethal', type: 'toggle', label: 'Non-Lethal Mode', desc: 'Knockout instead of kill.', termKey: 'nonlethal' },
                    { key: 'enable_wound_degradation', type: 'toggle', label: 'Wound Degradation', desc: 'Stats degrade as limbs take damage.', termKey: 'wound_system' },
                    { key: 'enable_called_shot_penalty', type: 'toggle', label: 'Called Shot Penalty', desc: 'Targeting limbs has an accuracy penalty.' },
                    { key: 'enable_diminishing_returns', type: 'toggle', label: 'Diminishing Returns', desc: 'Repeating the same attack gives opponent dodge bonus.' },
                ]
            },
            defense_tuning: {
                label: 'Defense Tuning', icon: '🛡️',
                settings: [
                    { key: 'dodge_base_chance', type: 'percent', label: 'Dodge Base Chance', desc: 'Base probability to dodge (0.15 = 15%).', min: 0, max: 1 },
                    { key: 'dodge_speed_factor', type: 'percent', label: 'Dodge Speed Factor', desc: 'Added per 2x speed advantage.' },
                    { key: 'dodge_max_chance', type: 'percent', label: 'Dodge Max Chance', desc: 'Maximum dodge probability.' },
                    { key: 'block_die_sides', type: 'number', label: 'Block Die Sides', desc: 'Sides on the block die (Mado: 6).' },
                    { key: 'block_one_arm_reduction', type: 'percent', label: 'Block One Arm Reduction', desc: 'Damage reduction for one-arm block.' },
                    { key: 'block_two_arm_reduction', type: 'percent', label: 'Block Two Arm Reduction', desc: 'Damage reduction for two-arm block.' },
                    { key: 'block_stun_die_sides', type: 'number', label: 'Block Die (Stunned)', desc: 'Die sides when stunned (harder to block).' },
                    { key: 'counter_base_chance', type: 'percent', label: 'Counter Base Chance', desc: 'Base counter-attack probability.' },
                    { key: 'counter_charge_bonus', type: 'percent', label: 'Counter Charge Bonus', desc: 'Extra chance if already charging.' },
                    { key: 'counter_max_chance', type: 'percent', label: 'Counter Max Chance', desc: 'Maximum counter probability.' },
                    { key: 'diminishing_returns_per_repeat', type: 'percent', label: 'Diminishing Returns per Repeat', desc: 'Dodge bonus per repeated attack.' },
                    { key: 'diminishing_returns_max', type: 'percent', label: 'Diminishing Returns Max', desc: 'Maximum accumulated dodge bonus.' },
                ]
            },
            damage: {
                label: 'Damage & Wounds', icon: '🩸',
                settings: [
                    { key: 'limb_bleed_through_default', type: 'percent', label: 'Limb Bleed-Through', desc: 'Fraction of limb damage that hits main HP.' },
                    { key: 'wound_threshold_light', type: 'percent', label: 'Light Wound Threshold', desc: 'Below this % = light wound.' },
                    { key: 'wound_threshold_heavy', type: 'percent', label: 'Heavy Wound Threshold', desc: 'Below this % = heavy wound.' },
                    { key: 'called_shot_penalty_head', type: 'percent', label: 'Called Shot Penalty (Head)', desc: 'Accuracy penalty for head shots.' },
                    { key: 'called_shot_penalty_arms', type: 'percent', label: 'Called Shot Penalty (Arms)', desc: 'Accuracy penalty for arm shots.' },
                    { key: 'called_shot_penalty_legs', type: 'percent', label: 'Called Shot Penalty (Legs)', desc: 'Accuracy penalty for leg shots.' },
                    { key: 'ki_ranged_dodge_bonus', type: 'percent', label: 'Ranged/Magic Dodge Bonus', desc: 'Extra dodge chance vs ranged/magic attacks.' },
                    { key: 'enemy_scaling_factor', type: 'number', label: 'Enemy Scaling Factor', desc: 'How much enemies scale per party member (0.3 = +30% per extra player).' },
                ]
            },
            rp_system: {
                label: 'RP & Narration', icon: '🎭',
                settings: [
                    { key: 'enable_rp_descriptions', type: 'toggle', label: 'RP Descriptions', desc: 'Players describe actions for damage bonus.', termKey: 'flavor_text' },
                    { key: 'enable_flavor_text', type: 'toggle', label: 'Flavor Text (Legacy)', desc: 'Simple flavor text system (Session 9).' },
                    { key: 'enable_battle_narration', type: 'toggle', label: 'Battle Narration', desc: 'DM-style combat descriptions.', termKey: 'narration' },
                    { key: 'enable_rp_commands', type: 'toggle', label: 'RP Commands', desc: 'Taunt, Intimidate, Rally.', termKey: 'rp_commands' },
                    { key: 'rp_desc_max_bonus', type: 'percent', label: 'Max RP Description Bonus', desc: 'Maximum damage bonus from descriptions.' },
                    { key: 'rp_desc_short_bonus', type: 'percent', label: 'Short Description Bonus', desc: 'Bonus for 20+ char descriptions.' },
                    { key: 'rp_desc_detailed_bonus', type: 'percent', label: 'Detailed Description Bonus', desc: 'Bonus for 50+ char descriptions.' },
                    { key: 'rp_desc_context_bonus', type: 'percent', label: 'Context-Aware Bonus', desc: 'Extra bonus per battlefield reference.' },
                ]
            },
            ki_magic: {
                label: 'Ki / Magic / Mana', icon: '🔥',
                settings: [
                    { key: 'enable_ki_channeling', type: 'toggle', label: 'Ki Channeling', desc: 'Surge to full power temporarily.', termKey: 'channel_ki' },
                    { key: 'ki_channel_duration', type: 'number', label: 'Channel Duration (turns)', desc: 'How long the power surge lasts.' },
                    { key: 'ki_channel_crash_pct', type: 'percent', label: 'Channel Crash %', desc: 'HP drops to this fraction after surge.' },
                    { key: 'enable_spell_slots', type: 'toggle', label: 'Spell Slots (BG3-style)', desc: 'Limited-use ability charges.', termKey: 'spell_slots' },
                    { key: 'summon_cost_type', type: 'select', label: 'Summon Cost Type', desc: 'How summons are paid for.', options: ['mp', 'spell_slot'] },
                    { key: 'enable_summons', type: 'toggle', label: 'Summons', desc: 'Call creatures via rare Oghams.', termKey: 'summon' },
                ]
            },
            progression: {
                label: 'Progression & Styles', icon: '🥋',
                settings: [
                    { key: 'enable_signature_techs', type: 'toggle', label: 'Signature Techniques', desc: 'Player-created skills from RP.', termKey: 'sig_tech' },
                    { key: 'sig_tech_require_unlock', type: 'toggle', label: 'Require Master for Sig Tech', desc: 'Must train under a master first.' },
                    { key: 'sig_tech_discovery_threshold', type: 'number', label: 'Discovery Threshold', desc: 'Similar flavor texts needed to discover.' },
                    { key: 'sig_tech_max_per_character', type: 'number', label: 'Max Sig Techs per Character' },
                    { key: 'enable_fighting_styles', type: 'toggle', label: 'Fighting Styles', desc: 'Martial arts with belt progression.', termKey: 'fighting_style' },
                    { key: 'enable_combo_procs', type: 'toggle', label: 'Combo Procs', desc: 'Physical attacks can chain.', termKey: 'combo' },
                    { key: 'enable_bleed_tiers', type: 'toggle', label: 'Bleed Tiers', desc: 'Light/Moderate/Heavy bleeding.' },
                ]
            },
            advanced: {
                label: 'Advanced Combat', icon: '👑',
                settings: [
                    { key: 'enable_boss_phases', type: 'toggle', label: 'Boss Phases', desc: 'Multi-stage boss encounters.', termKey: 'boss_phase' },
                    { key: 'enable_custom_win_conditions', type: 'toggle', label: 'Custom Win Conditions', desc: 'Survive, protect, capture, etc.' },
                    { key: 'enable_weather_effects', type: 'toggle', label: 'Weather Effects', desc: 'Rain, storm, fog affect combat.', termKey: 'weather' },
                    { key: 'enable_stealth', type: 'toggle', label: 'Stealth System', desc: 'Hide and ambush.', termKey: 'stealth' },
                    { key: 'enable_transformations', type: 'toggle', label: 'Transformations', desc: 'Power-up forms.', termKey: 'transform' },
                    { key: 'enable_link_attacks', type: 'toggle', label: 'Link Attacks', desc: 'Combined partner attacks.' },
                    { key: 'enable_revive', type: 'toggle', label: 'Revive', desc: 'Bring back fallen allies.' },
                    { key: 'enable_traps', type: 'toggle', label: 'Traps', desc: 'Placeable grid hazards.' },
                    { key: 'enable_elemental_reactions', type: 'toggle', label: 'Elemental Reactions', desc: 'Genshin-style element combos.' },
                    { key: 'enable_status_combos', type: 'toggle', label: 'Status Combos', desc: 'Status pairs trigger bonus effects.' },
                    { key: 'enable_battle_rules', type: 'toggle', label: 'Battle Rules Engine', desc: 'No-code IF/THEN rules.' },
                ]
            },
            social: {
                label: 'Social & Alignment', icon: '⚖️',
                settings: [
                    { key: 'enable_alignment_system', type: 'toggle', label: 'Alignment System', desc: 'KOTOR-style good/evil scale.', termKey: 'alignment' },
                    { key: 'alignment_affects_stats', type: 'toggle', label: 'Alignment Affects Stats', desc: 'Good/evil gives stat bonuses.' },
                    { key: 'alignment_affects_skills', type: 'toggle', label: 'Alignment Affects Skills', desc: 'Some skills locked by alignment.' },
                    { key: 'alignment_affects_shops', type: 'toggle', label: 'Alignment Affects Prices', desc: 'Evil characters pay more.' },
                ]
            },
            ai: {
                label: 'AI & Initiative', icon: '🤖',
                settings: [
                    { key: 'ai_difficulty', type: 'select', label: 'AI Difficulty', desc: 'How smart/strong AI opponents are.', options: ['easy', 'normal', 'hard'] },
                    { key: 'initiative_type', type: 'select', label: 'Turn Order System', desc: 'How turn order is determined.', options: ['speed', 'roll', 'phased', 'countdown'] },
                ]
            },
            meta: {
                label: 'Meta Systems', icon: '🌍',
                settings: [
                    { key: 'enable_afterlife', type: 'toggle', label: 'Afterlife System', desc: 'Death sends you to another world.', termKey: 'afterlife' },
                    { key: 'enable_tournaments', type: 'toggle', label: 'Tournaments', desc: 'Scheduled competitive events.', termKey: 'tournament' },
                    { key: 'enable_spectator_mode', type: 'toggle', label: 'Spectator Mode', desc: 'Watch battles without participating.' },
                    { key: 'enable_offline_players', type: 'toggle', label: 'Offline Players Visible', desc: 'Sleeping players stay on the map.' },
                    { key: 'enable_training_system', type: 'toggle', label: 'Training System', desc: 'Self-train, spar, master training.' },
                    { key: 'enable_battle_equip_swap', type: 'toggle', label: 'Equipment Swap in Battle', desc: 'Change weapons mid-fight.' },
                ]
            },
        };

        // Inject current values + terminology into each setting
        const termsMap = {};
        for (const t of terms) termsMap[t.term_key] = t;

        for (const cat of Object.values(categories)) {
            for (const s of cat.settings) {
                s.value = settingsMap[s.key] ?? null;
                if (s.termKey && termsMap[s.termKey]) {
                    s.terminology = termsMap[s.termKey];
                }
            }
        }

        // Load entity data for sub-panels
        const entities = {};
        const entityQueries = {
            body_types: 'SELECT id, name, label, icon FROM game_body_types ORDER BY id',
            limb_zones: 'SELECT id, body_type_id, zone_key, label, icon, hp_pct, called_shot_penalty FROM game_limb_zones ORDER BY body_type_id, sort_order',
            bleed_tiers: 'SELECT * FROM game_bleed_tiers ORDER BY id',
            fighting_styles: 'SELECT id, name, label, icon, style_type, max_rank FROM game_fighting_styles ORDER BY id',
            style_ranks: 'SELECT style_id, rank_num, label, icon, wins_required FROM game_fighting_style_ranks ORDER BY style_id, rank_num',
            weather_effects: 'SELECT id, name, label, icon, visibility FROM game_weather_effects WHERE active=1 ORDER BY id',
            elemental_reactions: 'SELECT id, element_a, element_b, reaction_name, icon, damage_bonus FROM game_elemental_reactions WHERE active=1',
            status_combos: 'SELECT id, status_a, status_b, combo_name, icon, effect_type FROM game_status_combos WHERE active=1',
            alignment_tiers: 'SELECT id, name, label, icon, min_value, max_value, color FROM game_alignment_tiers ORDER BY min_value DESC',
            alignment_actions: 'SELECT id, action_key, label, shift_amount FROM game_alignment_actions WHERE active=1 ORDER BY shift_amount DESC',
            battle_rules: 'SELECT id, name, trigger_event, target_filter, enabled, priority FROM game_battle_rules ORDER BY priority DESC',
            win_conditions: 'SELECT id, name, condition_type, icon, description FROM game_win_conditions ORDER BY id',
            afterlife_worlds: 'SELECT id, name, label, icon, type, stay_duration_days FROM game_afterlife_worlds WHERE active=1',
            transformations: 'SELECT id, name, icon, trigger_type, duration, level_required FROM game_transformations WHERE active=1',
            traps: 'SELECT id, name, icon, trigger_type, damage_formula FROM game_battle_traps WHERE active=1',
            narrations: 'SELECT id, action_type, weapon_type, element, SUBSTRING(text_template,1,60) AS preview FROM game_battle_narrations WHERE active=1 ORDER BY action_type',
            training_config: 'SELECT id, name, label, training_type, daily_limit, allowed_race_ids, allowed_class_ids FROM game_training_config WHERE active=1',
            sig_levels: 'SELECT level, damage_pct, cost_pct, ability_slots, xp_required FROM game_signature_levels ORDER BY level',
            sig_abilities: 'SELECT id, name, label, icon, category, min_level FROM game_signature_abilities ORDER BY min_level',
            flavor_texts: 'SELECT id, category, SUBSTRING(text,1,50) AS preview, bonus_pct, is_template FROM game_flavor_texts WHERE active=1 LIMIT 20',
            flavor_keywords: 'SELECT id, keyword, bonus_pct, category, terrain_match FROM game_flavor_keywords WHERE active=1',
            tournaments: 'SELECT id, name, status, type, max_participants FROM game_tournaments ORDER BY created_at DESC LIMIT 10',
        };
        for (const [key, query] of Object.entries(entityQueries)) {
            try { const [rows] = await db.query(query); entities[key] = rows; } catch { entities[key] = []; }
        }

        // NPC masters
        try {
            const [masters] = await db.query(
                `SELECT id, name, icon, teaches_style_id, teaches_sig_tech_id, unlocks_sig_tech_creation, training_gain_pct
                 FROM game_npcs WHERE is_master=1 ORDER BY name`);
            entities.masters = masters;
        } catch { entities.masters = []; }

        res.json({ success: true, categories, terminology: terms, allSettings: settingsMap, entities });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Update a battle setting + optional terminology rename
router.post('/battle-config', requireStaff, async (req, res) => {
    try {
        const { key, value, termKey, displayName, icon, description } = req.body;

        // Update the setting value
        if (key && value !== undefined) {
            await db.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                [key, String(value), String(value)]);
        }

        // Update terminology if provided
        if (termKey && displayName) {
            await db.query(
                `UPDATE game_terminology SET display_name=?, icon=COALESCE(?,icon), description=COALESCE(?,description)
                 WHERE term_key=?`,
                [displayName, icon || null, description || null, termKey]);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
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
    map: 'game_maps', quest: 'quest_definitions', class: 'game_classes',
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
    // ── Session 8: Limb Targeting / Combat Options ──────────────────
    body_type:      'game_body_types',       // BodyTypePanel
    limb_zone:      'game_limb_zones',       // LimbZonePanel (child of body_type)
    battle_knockout:'game_battle_knockouts', // KO log (read-only in practice)
    // ── Session 9: Flavor Text / Combo ─────────────────────────────
    flavor_text:    'game_flavor_texts',     // FlavorTextPanel
    flavor_keyword: 'game_flavor_keywords',  // FlavorKeywordPanel
    // ── Session 10: Ki Channeling / Bleed ──────────────────────────
    bleed_tier:     'game_bleed_tiers',      // BleedTierPanel
    // ── Session 11: Signature Techniques ───────────────────────────
    sig_level:      'game_signature_levels',     // SigLevelPanel
    sig_ability:    'game_signature_abilities',  // SigAbilityPanel
    sig_tech:       'character_signature_techs', // SigTechPanel (read/manage player techs)
    // ── Session 12: RP Engine ──────────────────────────────────────
    // ── Session 13: Fighting Styles ───────────────────────────────
    // ── Session 14: Tournaments ───────────────────────────────────
    // ── Session 16: Boss Phases / Win Conditions ─────────────────
    // ── Session 23: Final Systems ─────────────────────────────────
    // ── Session 24: Alignment + Battle Rules ──────────────────────
    // ── Session 25: Training ──────────────────────────────────────
    template:       'game_templates',                // TemplatePanel
    terminology:    'game_terminology',             // TerminologyPanel
    training_config:'game_training_config',       // TrainingConfigPanel
    alignment_tier: 'game_alignment_tiers',      // AlignmentTierPanel
    alignment_action:'game_alignment_actions',   // AlignmentActionPanel
    battle_rule:    'game_battle_rules',          // BattleRulePanel (no-code builder)
    elem_reaction:  'game_elemental_reactions',  // ElementReactionPanel
    status_combo:   'game_status_combos',        // StatusComboPanel
    afterlife:      'game_afterlife_worlds',     // AfterlifePanel
    death_penalty:  'game_death_penalties',       // DeathPenaltyPanel
    transformation: 'game_transformations',       // TransformPanel
    link_attack:    'game_link_attacks',          // LinkAttackPanel
    trap:           'game_battle_traps',          // TrapPanel
    weather:        'game_weather_effects',       // WeatherPanel
    boss_phase:     'game_boss_phases',          // BossPhasePanel
    win_condition:  'game_win_conditions',       // WinConditionPanel
    quest_battle_override: 'game_quest_battle_overrides', // QuestBattleOverridePanel
    tournament:     'game_tournaments',          // TournamentPanel
    tourney_match:  'game_tournament_matches',   // TourneyMatchPanel
    tourney_history:'game_tournament_history',   // TourneyHistoryPanel
    fighting_style: 'game_fighting_styles',      // FightingStylePanel
    style_rank:     'game_fighting_style_ranks', // StyleRankPanel
    char_style:     'character_fighting_styles', // CharStylePanel (admin view)
    narration:      'game_battle_narrations',    // NarrationPanel
    premade_sig:    'game_premade_sig_techs',    // PremadeSigTechPanel
    training_log:   'game_master_training_log',  // TrainingLogPanel (read-only)
};
const ENTITY_PK_MAP = {
    artifact:       'artifact_id',
    artifact_power: 'power_id',
    quest:          'quest_id',
    loot_table:     'id',
    spawn:          'id',
    sig_level:      'level',
    death_penalty:  'death_count',
};

function getTable(type) {
    const t = ENTITY_TABLE_MAP[type];
    if (!t) throw Object.assign(new Error(`Unknown entity type: ${type}`), { status: 400 });
    return t;
}
function getPk(type) { return ENTITY_PK_MAP[type] || 'id'; }

// ── type union used by the three generic CRUD routes below ────────
const ENTITY_TYPES = 'item|skill|npc|map|quest|class|race|ogham|ogham_family|shop|arena|artifact|status|feat|loot_table|spawn|battle_cmd|background|stat|shop_supply|artifact_power|quest_board|region|faction|scheduled_task|craft_recipe|auction_listing|limit|body_type|limb_zone|battle_knockout|flavor_text|flavor_keyword|bleed_tier|sig_level|sig_ability|sig_tech|narration|premade_sig|training_log|fighting_style|style_rank|char_style|tournament|tourney_match|tourney_history|template|terminology|training_config|alignment_tier|alignment_action|battle_rule|elem_reaction|status_combo|afterlife|death_penalty|transformation|link_attack|trap|weather|boss_phase|win_condition|quest_battle_override';

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
router.post('/:type/:id([\\w.-]+)', requireStaff, async (req, res) => {
    try {
        const table = getTable(req.params.type);
        const pk = getPk(req.params.type);
        // Strip fields that don't exist as columns (prevents "Unknown column" errors)
        const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
        const validCols = new Set(cols.map(c => c.Field));
        const data = {};
        for (const [k, v] of Object.entries(req.body)) {
            if (validCols.has(k) && k !== pk) data[k] = v;
        }
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
        // Strip fields that don't exist as columns (prevents "Unknown column" errors)
        const [cols] = await db.query('SHOW COLUMNS FROM ??', [table]);
        const validCols = new Set(cols.map(c => c.Field));
        const data = {};
        for (const [k, v] of Object.entries(req.body)) {
            if (validCols.has(k) && k !== pk) data[k] = v;
        }
        if (!Object.keys(data).length) return res.status(400).json({ success: false, message: 'No valid data' });
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
        const settings = {};
        // Load from system_settings first (legacy / engine defaults)
        try {
            const [sysRows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
            for (const row of sysRows) settings[row.setting_key] = row.setting_value;
        } catch {}
        // Overlay with game_settings (admin panel overrides)
        try {
            const [rows] = await db.query('SELECT setting_key, setting_value, setting_type FROM game_settings');
            for (const row of rows) {
                let val = row.setting_value;
                if (row.setting_type === 'number') val = parseFloat(val);
                else if (row.setting_type === 'boolean') val = val === 'true' || val === '1';
                settings[row.setting_key] = val;
            }
        } catch {} // table may not exist yet
        res.json({ success: true, data: settings });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/settings', requireStaff, async (req, res) => {
    try {
        const settings = req.body;
        // Ensure game_settings table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS game_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT,
                setting_type VARCHAR(20) DEFAULT 'string',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `).catch(() => {});

        for (const [key, value] of Object.entries(settings)) {
            const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
            // Write to game_settings (primary admin store)
            await db.query(
                'INSERT INTO game_settings (setting_key, setting_value, setting_type) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=?, setting_type=?',
                [key, String(value), type, String(value), type]
            ).catch(() => {});
            // Also write to system_settings for keys the engine reads directly (ai_*, enemy_scaling_factor)
            await db.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                [key, String(value), String(value)]
            ).catch(() => {});
        }
        res.json({ success: true, message: 'Settings saved' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});


module.exports = router;
