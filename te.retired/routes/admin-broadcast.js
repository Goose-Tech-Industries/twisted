// =================================================================
// ADMIN PANEL — GM Broadcast Tools Sub-Router
// Broadcast, broadcast-map, broadcast-player, world-event, kick
// Helper functions: _kickPlayer, _notifyUser, _notifyChar
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

// =================================================================
// GM BROADCAST TOOLS
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
// INTERNAL HELPERS
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

module.exports = router;
