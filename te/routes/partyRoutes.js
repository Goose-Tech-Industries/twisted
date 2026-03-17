// =================================================================
// PARTY ROUTES — Friends persistence + Party REST helpers
// =================================================================
// Mounted at /api/party
//
// Friends are stored in DB (character_friends table).
// Active parties are also stored in DB (character_parties + members).
// Real-time party events (invite, accept, kick, leave) happen via
// Socket.IO in server.js — these routes are for fetching state.
//
// Endpoints:
// GET  /api/party/friends/:charId   — list friends
// POST /api/party/friends/request           — send friend request
// POST /api/party/friends/accept            — accept request
// POST /api/party/friends/decline           — decline/remove
// GET  /api/party/current/:charId   — current party info
// POST /api/party/create                    — create party (also done via socket)
// POST /api/party/disband                   — disband (leader only)
// =================================================================

const express = require('express');
const router = express.Router();
let db;
let io;
router.init = (d, ioInstance) => { db = d; io = ioInstance; return router; };
// uid is at module scope so all route handlers can call it
function uid(req) { return req.session && req.session.userId; }

function jp(s, f = null) { try { return JSON.parse(s); } catch { return f; } }

async function verifyChar(userId, charId) {
    const [r] = await db.query(
        'SELECT id, name FROM characters WHERE id=? AND user_id=?', [charId, userId]
    );
    return r.length ? r[0] : null;
}

// ── GET FRIENDS LIST ─────────────────────────────────────────────
// Returns accepted friends plus pending incoming requests.
router.get('/friends/:charId', async (req, res) => {
    try {
        const { charId } = req.params;
        const userId = uid(req);
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        // Accepted friends (either direction)
        const [accepted] = await db.query(`
            SELECT
                f.id, f.status, f.created_at,
                CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END AS friend_char_id,
                c.name AS friend_name
            FROM character_friends f
            JOIN characters c ON c.id = CASE WHEN f.requester_id = ? THEN f.recipient_id ELSE f.requester_id END
            WHERE (f.requester_id = ? OR f.recipient_id = ?) AND f.status = 'accepted'
            ORDER BY c.name`,
            [charId, charId, charId, charId]
        );

        // Pending incoming (someone requested me)
        const [incoming] = await db.query(`
            SELECT f.id, f.requester_id, c.name AS requester_name, f.created_at
            FROM character_friends f
            JOIN characters c ON c.id = f.requester_id
            WHERE f.recipient_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC`,
            [charId]
        );

        // Pending outgoing (I requested someone)
        const [outgoing] = await db.query(`
            SELECT f.id, f.recipient_id, c.name AS recipient_name, f.created_at
            FROM character_friends f
            JOIN characters c ON c.id = f.recipient_id
            WHERE f.requester_id = ? AND f.status = 'pending'
            ORDER BY f.created_at DESC`,
            [charId]
        );

        res.json({ success: true, data: { accepted, incoming, outgoing } });
    } catch (e) {
        console.error('Friends list error:', e);
        res.json({ success: false, error: e.message });
    }
});

// ── SEND FRIEND REQUEST ──────────────────────────────────────────
router.post('/friends/request', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, targetCharId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });
        if (parseInt(charId) === parseInt(targetCharId)) return res.json({ success: false, error: "Can't friend yourself" });

        // Check target exists
        const [target] = await db.query('SELECT id, name FROM characters WHERE id=?', [targetCharId]);
        if (!target.length) return res.json({ success: false, error: 'Player not found' });

        // Check for existing relationship
        const [existing] = await db.query(
            `SELECT * FROM character_friends WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)`,
            [charId, targetCharId, targetCharId, charId]
        );
        if (existing.length) {
            const ex = existing[0];
            if (ex.status === 'accepted')  return res.json({ success: false, error: 'Already friends' });
            if (ex.status === 'pending')   return res.json({ success: false, error: 'Request already pending' });
            if (ex.status === 'blocked')   return res.json({ success: false, error: 'Unable to send request' });
        }

        await db.query(
            'INSERT INTO character_friends (requester_id, recipient_id, status) VALUES (?,?,?)',
            [charId, targetCharId, 'pending']
        );

        res.json({ success: true, targetName: target[0].name });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── ACCEPT FRIEND REQUEST ────────────────────────────────────────
router.post('/friends/accept', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, requesterId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        const [r] = await db.query(
            `UPDATE character_friends SET status='accepted', updated_at=NOW()
             WHERE requester_id=? AND recipient_id=? AND status='pending'`,
            [requesterId, charId]
        );
        if (r.affectedRows === 0) return res.json({ success: false, error: 'Request not found' });

        const [req_char] = await db.query('SELECT name FROM characters WHERE id=?', [requesterId]);
        res.json({ success: true, requesterName: req_char[0]?.name });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── DECLINE / REMOVE FRIEND ──────────────────────────────────────
router.post('/friends/remove', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, targetCharId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        await db.query(
            `DELETE FROM character_friends
             WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)`,
            [charId, targetCharId, targetCharId, charId]
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── GET CURRENT PARTY ────────────────────────────────────────────
router.get('/current/:charId', async (req, res) => {
    try {
        const { charId } = req.params;
        const userId = uid(req);
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        // Find active party this character belongs to
        const [memberRow] = await db.query(
            `SELECT m.party_id FROM character_party_members m
             WHERE m.character_id=? AND m.is_active=1 LIMIT 1`,
            [charId]
        );
        if (!memberRow.length) return res.json({ success: true, data: null });

        const partyId = memberRow[0].party_id;
        const [partyRow] = await db.query('SELECT * FROM character_parties WHERE id=? AND is_active=1', [partyId]);
        if (!partyRow.length) return res.json({ success: true, data: null });

        const [members] = await db.query(
            `SELECT m.role, m.joined_at, c.id AS char_id, c.name, c.level,
                    cl.name AS class_name
             FROM character_party_members m
             JOIN characters c ON c.id = m.character_id
             LEFT JOIN game_classes cl ON cl.id = c.class_id
             WHERE m.party_id=? AND m.is_active=1
             ORDER BY m.role DESC, m.joined_at ASC`,
            [partyId]
        );

        res.json({ success: true, data: { party: partyRow[0], members } });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── DISBAND PARTY ────────────────────────────────────────────────
router.post('/disband', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, partyId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        // Verify this char is the leader
        const [p] = await db.query(
            'SELECT * FROM character_parties WHERE id=? AND leader_id=? AND is_active=1',
            [partyId, charId]
        );
        if (!p.length) return res.json({ success: false, error: 'Not party leader' });

        await db.query(
            'UPDATE character_parties SET is_active=0, disbanded_at=NOW() WHERE id=?', [partyId]
        );
        await db.query(
            'UPDATE character_party_members SET is_active=0, left_at=NOW() WHERE party_id=?', [partyId]
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});


// ── FIND CHARACTER BY NAME (for mail compose + friend add) ────────
// GET /api/party/friends/find-by-name?name=
router.get('/friends/find-by-name', async (req, res) => {
    const name = (req.query.name || '').trim();
    if (!name) return res.json({ success: false, message: 'name required.' });
    try {
        const [rows] = await db.query(
            'SELECT id, name FROM characters WHERE name=? LIMIT 1', [name]);
        if (!rows.length) return res.json({ success: false, message: 'Character not found.' });
        res.json({ success: true, charId: rows[0].id, name: rows[0].name });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── BLOCK PLAYER ──────────────────────────────────────────────────
// POST /api/party/friends/block   { charId, targetCharId }
// Blocks all contact (DM, friend requests, mail)
router.post('/friends/block', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, targetCharId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });
        if (parseInt(charId) === parseInt(targetCharId))
            return res.json({ success: false, error: "Can't block yourself." });

        // Upsert: remove existing friendship (if any) and insert blocked record
        await db.query(
            `DELETE FROM character_friends
             WHERE (requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?)`,
            [charId, targetCharId, targetCharId, charId]
        );
        await db.query(
            'INSERT INTO character_friends (requester_id, recipient_id, status) VALUES (?,?,?)',
            [charId, targetCharId, 'blocked']
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── UNBLOCK PLAYER ────────────────────────────────────────────────
// POST /api/party/friends/unblock   { charId, targetCharId }
router.post('/friends/unblock', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, targetCharId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });
        await db.query(
            `DELETE FROM character_friends
             WHERE requester_id=? AND recipient_id=? AND status='blocked'`,
            [charId, targetCharId]
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
