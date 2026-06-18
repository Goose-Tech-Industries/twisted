// =================================================================
// ADMIN PANEL — Player Management Sub-Router
// Player search/list, detail, audit, notes, flags, ban/unban,
// role change, gift items, bulk actions
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

// ── Event Log Helper ─────────────────────────────────────────────
async function logEvent(type, actorId, actorName, targetId, targetName, detail = {}, mapId = null) {
    try {
        await db.query(
            `INSERT INTO game_event_log (event_type,actor_id,actor_name,target_id,target_name,detail_json,map_id)
             VALUES (?,?,?,?,?,?,?)`,
            [type, actorId||null, actorName||null, targetId||null, targetName||null,
             JSON.stringify(detail), mapId||null]
        );
    } catch(e) { /* non-fatal */ }
}

// ── Internal Helpers ─────────────────────────────────────────────
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
// PLAYER SEARCH / LIST
// =================================================================
router.get('/players', requireStaff, async (req, res) => {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    try {
        let sql = `SELECT u.id, u.username, u.email, u.role, u.currency AS gold,
                          u.is_banned, u.created_at, u.last_login, u.chat_color,
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

// =================================================================
// PLAYER DETAIL
// =================================================================
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

// =================================================================
// PLAYER AUDIT TRAIL
// =================================================================
router.get('/player/:id/audit', requireStaff, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const [rows] = await db.query(
            `SELECT * FROM game_event_log
             WHERE target_id=? OR actor_id=?
             ORDER BY created_at DESC LIMIT 50`,
            [userId, userId]
        );
        res.json({ success: true, data: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// PLAYER NOTES & FLAGS
// =================================================================
router.get('/player/:id/notes', requireStaff, async (req, res) => {
    const userId = parseInt(req.params.id);
    try {
        const [rows] = await db.query(
            'SELECT * FROM admin_player_notes WHERE user_id=? ORDER BY created_at DESC',
            [userId]
        );
        res.json({ success: true, data: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/player/:id/notes', requireStaff, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { body, flag } = req.body;
    if (!body || !body.trim()) return res.json({ success: false, message: 'Note body required' });
    const validFlags = ['none','watch','vip','trusted','suspicious'];
    const noteFlag = validFlags.includes(flag) ? flag : 'none';
    try {
        const [userRow] = await db.query('SELECT username FROM users WHERE id=?', [req.session.userId]);
        const authorName = userRow[0]?.username || 'Unknown';
        await db.query(
            'INSERT INTO admin_player_notes (user_id, author_id, author_name, flag, body) VALUES (?,?,?,?,?)',
            [userId, req.session.userId, authorName, noteFlag, body.trim()]
        );
        res.json({ success: true, message: 'Note added' });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.delete('/player/:id/notes/:noteId', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM admin_player_notes WHERE id=? AND user_id=?',
            [req.params.noteId, req.params.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// Set player flag (latest note's flag = player's flag)
router.post('/player/:id/flag', requireStaff, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { flag } = req.body;
    const validFlags = ['none','watch','vip','trusted','suspicious'];
    if (!validFlags.includes(flag)) return res.json({ success: false, message: 'Invalid flag' });
    try {
        const [userRow] = await db.query('SELECT username FROM users WHERE id=?', [req.session.userId]);
        const authorName = userRow[0]?.username || 'Unknown';
        await db.query(
            'INSERT INTO admin_player_notes (user_id, author_id, author_name, flag, body) VALUES (?,?,?,?,?)',
            [userId, req.session.userId, authorName, flag, flag === 'none' ? 'Flag removed' : `Flagged as ${flag}`]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// Get flags for player list display
router.get('/player-flags', requireStaff, async (req, res) => {
    try {
        // Get the latest flag per user
        const [rows] = await db.query(
            `SELECT n.user_id, n.flag FROM admin_player_notes n
             INNER JOIN (SELECT user_id, MAX(id) AS max_id FROM admin_player_notes WHERE flag != 'none' GROUP BY user_id) latest
             ON n.id = latest.max_id`
        );
        const flags = {};
        for (const r of rows) flags[r.user_id] = r.flag;
        res.json({ success: true, data: flags });
    } catch(e) { res.json({ success: true, data: {} }); }
});

// =================================================================
// DELETE CHARACTER
// =================================================================
router.post('/player/delete-character', requireStaff, async (req, res) => {
    const { charId } = req.body;
    if (!charId) return res.json({ success: false, message: 'charId required' });
    try {
        // Get char info for logging
        const [[char]] = await db.query('SELECT name, user_id FROM characters WHERE id=?', [charId]);
        if (!char) return res.json({ success: false, message: 'Character not found' });

        // Kick if online
        if (global._onlinePlayers) {
            const entry = Object.entries(global._onlinePlayers).find(([, p]) => p.charId === parseInt(charId));
            if (entry) {
                const sock = io?.sockets?.sockets?.get(entry[0]);
                if (sock) { sock.emit('force_disconnect', 'Character deleted by admin'); sock.disconnect(true); }
                delete global._onlinePlayers[entry[0]];
            }
        }

        // Clean up all related data
        const tables = [
            'character_items', 'character_equipment', 'character_stats',
            'character_ability_scores', 'character_skills', 'character_oghams',
            'character_quests', 'character_mail', 'character_fighting_styles',
            'character_signature_techs',
        ];
        for (const tbl of tables) {
            await db.query(`DELETE FROM ?? WHERE character_id=?`, [tbl, charId]).catch(() => {});
        }
        // Delete the character itself
        await db.query('DELETE FROM characters WHERE id=?', [charId]);

        // Log it
        await logEvent('gm_delete_char', req.session.userId, 'GM', parseInt(charId), char.name, { userId: char.user_id });

        res.json({ success: true, message: `Character "${char.name}" deleted.` });
    } catch(e) {
        console.error('[DeleteChar]', e);
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// BAN / UNBAN / ROLE / GIVE GOLD / GIVE ITEM / RESET HP
// =================================================================
router.post('/player/:id/ban', requireStaff, async (req, res) => {
    const { reason } = req.body;
    const [uban] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET is_banned=1, ban_reason=? WHERE id=?', [reason || '', req.params.id]);
    _kickPlayer(parseInt(req.params.id), `You have been banned. ${reason || ''}`);
    const staffId = req.session.userId;
    await logEvent('gm_ban', staffId, 'GM', parseInt(req.params.id), uban[0]?.username, { reason });
    res.json({ success: true, message: 'Player banned.' });
});

router.post('/player/:id/unban', requireStaff, async (req, res) => {
    const [uunban] = await db.query('SELECT username FROM users WHERE id=?',[req.params.id]);
    await db.query('UPDATE users SET is_banned=0, ban_reason=NULL WHERE id=?', [req.params.id]);
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
    // Notify connected player of role change via Socket.IO
    const targetUserId = parseInt(req.params.id);
    if (global._onlinePlayers && io) {
        for (const [sid, p] of Object.entries(global._onlinePlayers)) {
            if (p.userId === targetUserId) {
                p.role = role; // Update in-memory
                const sock = io.sockets.sockets.get(sid);
                if (sock) {
                    sock.emit('role_changed', { role });
                    // Update admin_chat room membership
                    const isStaff = ['ADMIN','GM','MOD','STAFF','OWNER'].includes(role.toUpperCase());
                    if (isStaff) sock.join('admin_chat');
                    else sock.leave('admin_chat');
                }
            }
        }
    }
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
// CHARACTER APPEARANCE
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
// BULK PLAYER ACTIONS (flat body, not :id param)
// =================================================================
router.post('/player/ban', requireStaff, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
    try {
        await db.query('UPDATE users SET is_banned=1, ban_reason=? WHERE id=?', [reason || '', userId]);
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
        // Gold is stored on users.currency, not characters
        const [[char]] = await db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
        if (!char) return res.json({ success: false, message: 'Character not found' });
        await db.query('UPDATE users SET currency=GREATEST(0,currency+?) WHERE id=?', [amount, char.user_id]);
        res.json({ success: true, message: `${amount > 0 ? '+' : ''}${amount} gold applied.` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/give-item', requireStaff, async (req, res) => {
    const { charId, itemId, quantity = 1 } = req.body;
    if (!charId || !itemId) return res.status(400).json({ success: false, message: 'charId and itemId required' });
    try {
        // Upsert: add to existing stack or insert new row
        const [existing] = await db.query(
            'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=? LIMIT 1',
            [charId, itemId]
        );
        if (existing.length) {
            await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?', [quantity, existing[0].id]);
        } else {
            await db.query('INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?)', [charId, itemId, quantity]);
        }
        res.json({ success: true, message: `Gave ${quantity}x item ${itemId} to character ${charId}` });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/player/kick', requireStaff, async (req, res) => {
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

module.exports = router;
