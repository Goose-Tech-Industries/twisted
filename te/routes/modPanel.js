// =================================================================
// MOD PANEL ROUTES  v1.0
// Lighter-weight panel for MOD and STAFF roles.
// TEACHING:
//   AdminSauce gives full game-world control (maps, NPCs, items, etc).
//   The Mod Panel gives ONLY player management + broadcast tools.
//   Mods can't edit game content — they can only manage people.
//
// Mounted at: /mod-panel/
//
// Endpoints:
//   GET  /mod-panel/auth          — verify session, return role/username
//   GET  /mod-panel/online        — list currently online players
//   GET  /mod-panel/players       — search/list players
//   GET  /mod-panel/player/:id    — full player detail
//   POST /mod-panel/kick          — kick a player
//   POST /mod-panel/ban           — ban a player
//   POST /mod-panel/unban         — unban a player
//   POST /mod-panel/broadcast     — chat broadcast to all
//   POST /mod-panel/dm            — private message to one player
// =================================================================

const express = require('express');
const router  = express.Router();
let db, io;

router.init = (database, ioInstance) => { db = database; io = ioInstance; };

// ── Auth middleware ───────────────────────────────────────────────
// Allows all staff roles — but mods can't do destructive game edits
// because those routes don't exist in this file at all.
async function requireMod(req, res, next) {
    try {
        const userId = req.session && req.session.userId;
        if (!userId) return res.status(401).json({ success: false, message: 'Login required.' });
        const [rows] = await db.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
        if (!rows.length) return res.status(401).json({ success: false, message: 'User not found.' });
        const role = rows[0].role;
        if (!['ADMIN', 'GM', 'MOD', 'STAFF', 'OWNER'].includes(role))
            return res.status(403).json({ success: false, message: 'Staff access required.' });
        req.modRole  = role;
        req.modUserId = userId;
        next();
    } catch (e) {
        res.status(500).json({ success: false, message: 'Auth error.' });
    }
}

// ── Internal helpers ──────────────────────────────────────────────
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

async function _log(type, actorId, actorName, targetId, targetName, detail = {}) {
    try {
        await db.query(
            `INSERT INTO game_event_log
             (event_type, actor_id, actor_name, target_id, target_name, detail_json)
             VALUES (?,?,?,?,?,?)`,
            [type, actorId || null, actorName || null,
             targetId || null, targetName || null, JSON.stringify(detail)]
        );
    } catch { /* log table may not exist yet — non-fatal */ }
}

// =================================================================
// AUTH CHECK
// GET /mod-panel/auth
// Used by the mod panel HTML on load to confirm session + role.
// =================================================================
router.get('/auth', requireMod, (req, res) => {
    res.json({ success: true, role: req.modRole, userId: req.modUserId });
});

// =================================================================
// ONLINE PLAYERS
// GET /mod-panel/online
// Returns all currently connected players with name, map, level.
// =================================================================
router.get('/online', requireMod, async (req, res) => {
    try {
        const online = Object.values(global._onlinePlayers || {});

        // Resolve map names in one query
        const mapIds = [...new Set(online.map(p => p.mapId).filter(Boolean))];
        let mapNames = {};
        if (mapIds.length) {
            const [mrows] = await db.query(
                'SELECT id, name FROM game_maps WHERE id IN (' + mapIds.map(() => '?').join(',') + ')',
                mapIds
            );
            for (const m of mrows) mapNames[m.id] = m.name;
        }

        const players = online.map(p => ({
            userId:   p.userId,
            charId:   p.charId,
            name:     p.name,
            level:    p.level,
            role:     p.role,
            mapId:    p.mapId,
            mapName:  mapNames[p.mapId] || `Map ${p.mapId}`,
            x:        p.x,
            y:        p.y,
        }));

        res.json({ success: true, data: players });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// PLAYER LIST / SEARCH
// GET /mod-panel/players?q=&limit=
// =================================================================
router.get('/players', requireMod, async (req, res) => {
    const q     = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    try {
        let sql = `
            SELECT u.id, u.username, u.role, u.is_banned,
                   u.created_at, u.last_login,
                   COUNT(c.id) AS char_count
            FROM users u
            LEFT JOIN characters c ON c.user_id = u.id`;
        const params = [];
        if (q) {
            sql += ' WHERE u.username LIKE ?';
            params.push(`%${q}%`);
        }
        sql += ' GROUP BY u.id ORDER BY u.last_login DESC LIMIT ?';
        params.push(limit);

        const [rows] = await db.query(sql, params);

        // Mark online players
        const onlineUserIds = new Set(
            Object.values(global._onlinePlayers || {}).map(p => p.userId)
        );
        const players = rows.map(r => ({ ...r, online: onlineUserIds.has(r.id) }));

        res.json({ success: true, data: players });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// PLAYER DETAIL
// GET /mod-panel/player/:id
// =================================================================
router.get('/player/:id', requireMod, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const [[user]] = await db.query(
            'SELECT id, username, role, currency, is_banned, created_at, last_login FROM users WHERE id=?',
            [userId]
        );
        if (!user) return res.json({ success: false, message: 'Player not found.' });

        const [chars] = await db.query(
            `SELECT c.id, c.name, c.level, c.current_hp, c.max_hp, c.map_id,
                    gc.name AS class_name, gr.name AS race_name
             FROM characters c
             LEFT JOIN game_classes gc ON gc.id = c.class_id
             LEFT JOIN game_races   gr ON gr.id = c.race_id
             WHERE c.user_id = ? ORDER BY c.level DESC`,
            [userId]
        );

        const online = Object.values(global._onlinePlayers || {}).some(p => p.userId === userId);

        res.json({ success: true, data: { user, chars, online } });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// KICK
// POST /mod-panel/kick   { userId, reason }
// =================================================================
router.post('/kick', requireMod, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId required.' });
    const [[target]] = await db.query('SELECT username FROM users WHERE id=?', [userId]);
    _kickPlayer(parseInt(userId), reason || 'Kicked by moderator.');
    await _log('mod_kick', req.modUserId, req.modRole, userId, target?.username, { reason });
    res.json({ success: true, message: 'Player kicked.' });
});

// =================================================================
// BAN
// POST /mod-panel/ban   { userId, reason }
// =================================================================
router.post('/ban', requireMod, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId required.' });

    // Mods cannot ban admins or other staff above PLAYER
    const [[target]] = await db.query('SELECT username, role FROM users WHERE id=?', [userId]);
    if (!target) return res.json({ success: false, message: 'Player not found.' });

    const protectedRoles = ['ADMIN', 'GM', 'OWNER'];
    if (protectedRoles.includes(target.role))
        return res.json({ success: false, message: `Cannot ban a ${target.role}.` });

    // MOD/STAFF can't ban other MODs either — only GM+ can
    if (target.role === 'MOD' && !['ADMIN', 'GM', 'OWNER'].includes(req.modRole))
        return res.json({ success: false, message: 'Only GM+ can ban other Mods.' });

    await db.query('UPDATE users SET is_banned=1 WHERE id=?', [userId]);
    _kickPlayer(parseInt(userId), `You have been banned. Reason: ${reason || 'No reason given.'}`);
    await _log('mod_ban', req.modUserId, req.modRole, userId, target.username, { reason });
    res.json({ success: true, message: `${target.username} has been banned.` });
});

// =================================================================
// UNBAN
// POST /mod-panel/unban   { userId }
// =================================================================
router.post('/unban', requireMod, async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ success: false, message: 'userId required.' });
    const [[target]] = await db.query('SELECT username FROM users WHERE id=?', [userId]);
    await db.query('UPDATE users SET is_banned=0 WHERE id=?', [userId]);
    await _log('mod_unban', req.modUserId, req.modRole, userId, target?.username);
    res.json({ success: true, message: `${target?.username || 'Player'} has been unbanned.` });
});

// =================================================================
// BROADCAST
// POST /mod-panel/broadcast   { message }
// Sends to all connected players as an announcement.
// =================================================================
router.post('/broadcast', requireMod, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim())
        return res.json({ success: false, message: 'Message is required.' });
    if (!io) return res.json({ success: false, message: 'Socket not available.' });
    io.emit('chat_msg', {
        sender:  '📢 MODERATOR',
        text:    message.trim(),
        channel: 'announce',
        isGm:    true
    });
    await _log('mod_broadcast', req.modUserId, req.modRole, null, null, { message });
    res.json({ success: true, message: 'Broadcast sent to all players.' });
});

// =================================================================
// DIRECT MESSAGE
// POST /mod-panel/dm   { userId, message }
// Sends a private notification to one player.
// =================================================================
router.post('/dm', requireMod, async (req, res) => {
    const { userId, message } = req.body;
    if (!userId || !message) return res.json({ success: false, message: 'userId and message required.' });
    if (!io || !global._onlinePlayers)
        return res.json({ success: false, message: 'Socket not available.' });
    let sent = false;
    for (const [sid, p] of Object.entries(global._onlinePlayers)) {
        if (p.userId === parseInt(userId)) {
            io.to(sid).emit('notification', { text: `📨 MOD: ${message}`, type: 'gm_message' });
            sent = true;
        }
    }
    if (!sent) return res.json({ success: false, message: 'Player is not online.' });
    await _log('mod_dm', req.modUserId, req.modRole, parseInt(userId), null, { message });
    res.json({ success: true, message: 'Message sent.' });
});

module.exports = router;
