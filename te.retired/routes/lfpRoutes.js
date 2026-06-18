// =================================================================
// LFP BOARD ROUTES  v1.0
// =================================================================
// Mounted at /api/lfp
//
// TEACHING: LFP = "Looking For Party". This is one of the most
// requested features in any MMO — a way to say "I'm available,
// here's my role, come find me."
//
// We tie it to the Presence system: setting your status to ⚔️ LFP
// also creates a DB listing. Clearing it removes the listing.
// This means the LFP board reflects real-time availability.
//
// Listings expire after 4 hours automatically via a scheduled
// cleanup query (or the scheduler.js job). When a player changes
// status away from LFP, their listing is removed immediately.
//
// Routes:
//   GET  /api/lfp/board              — all active listings (live)
//   POST /api/lfp/list               — create/update listing
//   POST /api/lfp/unlist             — remove listing
//   POST /api/lfp/cleanup            — called by scheduler to purge expired
// =================================================================

const express = require('express');
const router  = express.Router();

let db;
router.init = (d) => { db = d; };

function uid(req) { return req.session?.userId; }

// ── GET board ─────────────────────────────────────────────────────
router.get('/board', async (req, res) => {
    try {
        // Return active (non-expired) listings, newest first
        const [rows] = await db.query(
            `SELECT l.id, l.character_id, l.character_name, l.level,
                    l.class_name, l.role, l.note, l.content_type,
                    l.expires_at, l.created_at,
                    c.equipped_title, c.profile_color, c.presence_status,
                    c.away_message,
                    -- Is this player actually online right now?
                    (c.last_seen_at > NOW() - INTERVAL 5 MINUTE) AS is_online
             FROM lfp_listings l
             JOIN characters c ON c.id = l.character_id
             WHERE l.expires_at > NOW()
             ORDER BY l.created_at DESC
             LIMIT 50`,
            []
        );
        res.json({ success: true, listings: rows });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── LIST (create/update) ──────────────────────────────────────────
router.post('/list', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, error: 'Not logged in.' });

        const { charId, role, note, contentType } = req.body;

        // Verify ownership + load class
        const [[c]] = await db.query(
            `SELECT ch.id, ch.name, ch.level, gc.name AS class_name
             FROM characters ch
             LEFT JOIN game_classes gc ON gc.id = ch.class_id
             WHERE ch.id=? AND ch.user_id=?`,
            [charId, userId]
        );
        if (!c) return res.json({ success: false, error: 'Unauthorized.' });

        const VALID_ROLES = ['DPS','Tank','Healer','Support','Any'];
        const safeRole = VALID_ROLES.includes(role) ? role : 'Any';

        // Upsert — one listing per character
        await db.query(
            `INSERT INTO lfp_listings
                (character_id, character_name, level, class_name, role, note, content_type, expires_at)
             VALUES (?,?,?,?,?,?,?, NOW() + INTERVAL 4 HOUR)
             ON DUPLICATE KEY UPDATE
                character_name=VALUES(character_name),
                level=VALUES(level),
                class_name=VALUES(class_name),
                role=VALUES(role),
                note=VALUES(note),
                content_type=VALUES(content_type),
                expires_at=NOW() + INTERVAL 4 HOUR`,
            [c.id, c.name, c.level, c.class_name,
             safeRole,
             (note || '').slice(0, 255) || null,
             (contentType || '').slice(0, 64) || null]
        );

        // Also set presence to LFP
        await db.query(
            "UPDATE characters SET presence_status='lfp' WHERE id=?", [charId]
        );

        res.json({ success: true, message: `${c.name} is now Listed on the LFP board.` });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── UNLIST ────────────────────────────────────────────────────────
router.post('/unlist', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId } = req.body;
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, error: 'Unauthorized.' });

        await db.query('DELETE FROM lfp_listings WHERE character_id=?', [charId]);
        // Restore to online
        await db.query("UPDATE characters SET presence_status='online' WHERE id=?", [charId]);

        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── CLEANUP (called by scheduler) ────────────────────────────────
router.post('/cleanup', async (req, res) => {
    try {
        const [result] = await db.query('DELETE FROM lfp_listings WHERE expires_at < NOW()');
        res.json({ success: true, removed: result.affectedRows });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

module.exports = router;
