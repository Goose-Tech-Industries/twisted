// =================================================================
// GUESTBOOK ROUTES  v1.0
// =================================================================
// Mounted at /api/guestbook
//
// TEACHING: A guestbook is one of the oldest social web features —
// phpBB and early forum software all had them. Players visit each
// other's profile pages and leave messages. It's simple but it
// creates real social bonds in a game community.
//
// Rate limit: one post per character per profile per 24 hours.
// This prevents spam while letting active players stay social.
//
// Routes:
//   GET  /api/guestbook/:charId           — load entries for a profile
//   POST /api/guestbook/post              — leave a message
//   POST /api/guestbook/delete            — delete (owner or self)
// =================================================================

const express = require('express');
const router  = express.Router();

let db;
router.init = (d) => { db = d; };

// ── Auth helpers ──────────────────────────────────────────────────
function uid(req)  { return req.session?.userId; }
async function verifyChar(userId, charId) {
    if (!userId || !charId) return null;
    const [[c]] = await db.query(
        'SELECT id, name, equipped_title, profile_color FROM characters WHERE id=? AND user_id=?',
        [charId, userId]
    );
    return c || null;
}

// ── Shared BBCode parser (imported inline — avoids circular require) ──
// We call the route /save-signature's parseBBCode from game.js.
// Since we can't easily require across route files, we inline a
// trimmed version here that includes the [img] allowlist.
const IMG_ALLOWLIST = [
    'i.imgur.com','imgur.com','media.giphy.com','giphy.com',
    'media.tenor.com','cdn.discordapp.com','media.discordapp.net',
    'i.redd.it','preview.redd.it','pbs.twimg.com','images.unsplash.com',
];
function isTrustedImg(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return IMG_ALLOWLIST.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
    } catch { return false; }
}
function parseBBCode(raw) {
    const imgs = [];
    let s = raw.replace(/\[img\](https?:\/\/[^\[]{1,500})\[\/img\]/gis, (_, url) => {
        if (!isTrustedImg(url)) return '';
        const i = imgs.length; imgs.push(url);
        return '\x00IMG' + i + '\x00';
    });
    s = s
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
        .replace(/\[b\](.*?)\[\/b\]/gis,'<strong>$1</strong>')
        .replace(/\[i\](.*?)\[\/i\]/gis,'<em>$1</em>')
        .replace(/\[u\](.*?)\[\/u\]/gis,'<span style="text-decoration:underline">$1</span>')
        .replace(/\[s\](.*?)\[\/s\]/gis,'<span style="text-decoration:line-through">$1</span>')
        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis,'<span style="color:$1">$2</span>')
        .replace(/\[size=(\d{1,2})\](.*?)\[\/size\]/gis,(_,sz,t)=>`<span style="font-size:${Math.min(24,Math.max(8,+sz))}px">${t}</span>`)
        .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis,'<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$2</a>')
        .replace(/\n/g,'<br>');
    return s.replace(/\x00IMG(\d+)\x00/g, (_,i) => {
        const url = imgs[+i]; if (!url) return '';
        return `<img src="${url}" alt="" loading="lazy" style="max-width:100%;max-height:120px;border-radius:4px;vertical-align:middle">`;
    });
}

// ── GET entries ───────────────────────────────────────────────────
router.get('/:charId', async (req, res) => {
    try {
        const charId = parseInt(req.params.charId);
        const [rows] = await db.query(
            `SELECT id, author_char_id, author_name, author_title, author_color,
                    message_html, created_at
             FROM profile_guestbook
             WHERE profile_char_id=? AND is_deleted=0
             ORDER BY created_at DESC
             LIMIT 50`,
            [charId]
        );
        res.json({ success: true, entries: rows });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── POST entry ────────────────────────────────────────────────────
router.post('/post', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, error: 'Not logged in.' });

        const { authorCharId, profileCharId, message } = req.body;
        const msg = (message || '').trim();
        if (!msg || msg.length < 2)  return res.json({ success: false, error: 'Message too short.' });
        if (msg.length > 500)        return res.json({ success: false, error: 'Message too long (max 500 chars).' });
        if (parseInt(authorCharId) === parseInt(profileCharId))
            return res.json({ success: false, error: "You can't sign your own guestbook." });

        // Verify author owns the character
        const author = await verifyChar(userId, authorCharId);
        if (!author) return res.json({ success: false, error: 'Unauthorized.' });

        // Verify the profile character exists
        const [[profileChar]] = await db.query('SELECT id FROM characters WHERE id=?', [profileCharId]);
        if (!profileChar) return res.json({ success: false, error: 'Profile not found.' });

        // Rate limit: one post per author per profile per 24h
        const [[recent]] = await db.query(
            `SELECT id FROM profile_guestbook
             WHERE author_char_id=? AND profile_char_id=?
             AND created_at > NOW() - INTERVAL 24 HOUR
             AND is_deleted=0 LIMIT 1`,
            [authorCharId, profileCharId]
        );
        if (recent) return res.json({ success: false, error: 'You can only post once per day on each profile.' });

        const html = parseBBCode(msg);

        const [result] = await db.query(
            `INSERT INTO profile_guestbook
                (profile_char_id, author_char_id, author_name, author_title, author_color, message, message_html)
             VALUES (?,?,?,?,?,?,?)`,
            [profileCharId, authorCharId, author.name,
             author.equipped_title || null, author.profile_color || null,
             msg, html]
        );
        res.json({
            success: true,
            entry: {
                id: result.insertId,
                author_char_id: authorCharId,
                author_name: author.name,
                author_title: author.equipped_title || null,
                author_color: author.profile_color || null,
                message_html: html,
                created_at: new Date().toISOString(),
            }
        });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DELETE entry ──────────────────────────────────────────────────
// Allowed if: you are the profile owner OR you are the author
router.post('/delete', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, error: 'Not logged in.' });

        const { entryId, charId } = req.body;
        const [[entry]] = await db.query('SELECT * FROM profile_guestbook WHERE id=?', [entryId]);
        if (!entry) return res.json({ success: false, error: 'Entry not found.' });

        // Check if this user owns either the profile or the author character
        const [[myChar]] = await db.query(
            'SELECT id FROM characters WHERE user_id=? AND id IN (?,?)',
            [userId, entry.profile_char_id, entry.author_char_id]
        );
        if (!myChar) return res.json({ success: false, error: 'Unauthorized.' });

        await db.query('UPDATE profile_guestbook SET is_deleted=1 WHERE id=?', [entryId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

module.exports = router;
