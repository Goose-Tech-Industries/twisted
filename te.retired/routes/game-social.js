const express = require('express');
const router = express.Router();
let db;
router.init = (c) => { db = c; };

// Helper: get userId from the server-side session
function uid(req) { return req.session && req.session.userId; }

// =================================================================
// PRESENCE / AWAY STATUS ROUTES
// =================================================================
// POST /set-presence   — set status + optional away message
//
// TEACHING: Status is stored in two places:
//   1. DB (characters.presence_status + away_message) — persistent,
//      shown on the profile page and inspect card
//   2. onlinePlayers in-memory object — server reads this for
//      nearby player list and broadcasts to the map on change
//
// The socket 'set_presence' event (in server.js) handles the
// in-memory update and map broadcast. This HTTP route handles
// the DB persistence so it survives reconnects.
// =================================================================

router.post('/set-presence', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, status, awayMessage } = req.body;
        const VALID = ['online','away','busy','lfp','invisible'];
        if (!VALID.includes(status)) return res.json({ success: false, message: 'Invalid status.' });

        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        await db.query(
            'UPDATE characters SET presence_status=?, away_message=? WHERE id=?',
            [status, (awayMessage || '').slice(0, 255) || null, charId]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// LAST SEEN — lightweight heartbeat
// =================================================================
// Called by the client every 2 minutes while the game tab is open.
// Also called on meaningful actions (map change, battle start, etc.)
// We do NOT track this per-action on the server to avoid hammering the DB.
// =================================================================

router.post('/heartbeat', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId } = req.body;
        // Verify ownership, then touch last_seen_at
        await db.query(
            'UPDATE characters SET last_seen_at=NOW() WHERE id=? AND user_id=?',
            [charId, userId]
        );
        res.json({ success: true });
    } catch { res.json({ success: true }); } // non-critical, never error to client
});

// =================================================================
// PROFILE CUSTOMIZATION ROUTES
// =================================================================
// POST /save-profile   — save bio, color, banner, quote, Spotify
// =================================================================

router.post('/save-profile', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, bio, profileColor, bannerEmoji, favoriteQuote,
                spotifyTrackUrl, spotifyTrackName, spotifyArtistName,
                showProfileViewers, musicUrl, background, status,
                pinnedAchievements } = req.body;

        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        // Validate color is a hex code
        const color = /^#[0-9a-fA-F]{6}$/.test(profileColor||'') ? profileColor : '#bb86fc';

        // Validate Spotify URL: only allow open.spotify.com links
        let sUrl = null, sName = null, sArtist = null;
        if (spotifyTrackUrl && spotifyTrackUrl.includes('open.spotify.com')) {
            sUrl    = spotifyTrackUrl.slice(0, 512);
            sName   = (spotifyTrackName   || '').slice(0, 256) || null;
            sArtist = (spotifyArtistName  || '').slice(0, 256) || null;
        }

        // Validate music URL (allow common audio hosts or null)
        let validMusicUrl = null;
        if (musicUrl && typeof musicUrl === 'string' && musicUrl.length < 512) {
            validMusicUrl = musicUrl.slice(0, 512);
        }

        // Validate background (predefined set or null)
        const validBg = typeof background === 'string' && background.length < 128 ? background : null;

        // Validate pinned achievements (array of IDs, max 5)
        let pinnedJson = null;
        if (Array.isArray(pinnedAchievements)) {
            pinnedJson = JSON.stringify(pinnedAchievements.slice(0, 5).map(Number).filter(n => n > 0));
        }

        await db.query(
            `UPDATE characters SET
                profile_bio=?, profile_color=?, profile_banner_emoji=?,
                profile_favorite_quote=?,
                spotify_track_url=?, spotify_track_name=?, spotify_artist_name=?,
                show_profile_viewers=?,
                profile_music_url=?, profile_background=?,
                profile_status=?, profile_pinned_achievements=?
             WHERE id=?`,
            [
                (bio || '').slice(0, 500) || null,
                color,
                (bannerEmoji || '⚔️').slice(0, 8),
                (favoriteQuote || '').slice(0, 200) || null,
                sUrl, sName, sArtist,
                showProfileViewers ? 1 : 0,
                validMusicUrl, validBg,
                (status || '').slice(0, 128) || null,
                pinnedJson,
                charId
            ]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});


// =================================================================
// SIGNATURE ROUTE
// =================================================================
// TEACHING: A "forum signature" is a short block of styled text
// that appears at the bottom of every post (or profile). We support
// a small subset of BBCode — the markup language phpBB and vBulletin
// used. We parse it SERVER-SIDE before storing so the stored value
// is already safe HTML. This means the profile page just outputs it
// directly without needing a client-side parser.
//
// Supported tags: [b],[i],[u],[s],[color=#hex],[size],[url],[img=URL]
// [img] ONLY allowed from trusted image hosts (allowlist below).
// BLOCKED: [script], arbitrary domains → stripped.
// =================================================================

// Trusted image hosts for [img] tags.
// Only https URLs from these domains are allowed through.
const IMG_ALLOWLIST = [
    'i.imgur.com', 'imgur.com',
    'media.giphy.com', 'giphy.com', 'media.tenor.com',
    'cdn.discordapp.com', 'media.discordapp.net',
    'i.redd.it', 'preview.redd.it',
    'pbs.twimg.com',                          // Twitter/X image CDN
    'images.unsplash.com',
];

function isTrustedImgUrl(url) {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') return false;
        return IMG_ALLOWLIST.some(host => u.hostname === host || u.hostname.endsWith('.' + host));
    } catch { return false; }
}

// Two-pass BBCode parser: first extract [img] tags with trusted URLs,
// replace with placeholders, then run the rest of the parser, then
// restore img tags. This avoids the HTML-escaping problem.
function parseBBCode(raw) {
    // Pass 1: extract and validate [img] tags BEFORE HTML escaping
    const imgPlaceholders = [];
    let s = raw.replace(/\[img\](https?:\/\/[^\[]{1,500})\[\/img\]/gis, (_, url) => {
        if (!isTrustedImgUrl(url)) return ''; // strip untrusted
        const idx = imgPlaceholders.length;
        imgPlaceholders.push(url);
        return '\x00IMG' + idx + '\x00'; // temporary placeholder
    });

    // Pass 2: HTML escape + rest of BBCode
    s = s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/\[b\](.*?)\[\/b\]/gis,        '<strong>$1</strong>')
        .replace(/\[i\](.*?)\[\/i\]/gis,        '<em>$1</em>')
        .replace(/\[u\](.*?)\[\/u\]/gis,        '<span style="text-decoration:underline">$1</span>')
        .replace(/\[s\](.*?)\[\/s\]/gis,        '<span style="text-decoration:line-through">$1</span>')
        .replace(/\[color=(#[0-9a-fA-F]{3,6})\](.*?)\[\/color\]/gis,
                 '<span style="color:$1">$2</span>')
        .replace(/\[size=(\d{1,2})\](.*?)\[\/size\]/gis,
                 (_, sz, content) => {
                     const px = Math.min(24, Math.max(8, parseInt(sz)));
                     return '<span style="font-size:' + px + 'px">' + content + '</span>';
                 })
        .replace(/\[url=(https?:\/\/[^\]]{1,300})\](.*?)\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$2</a>')
        .replace(/\[url\](https?:\/\/[^\[]{1,300})\[\/url\]/gis,
                 '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#58a6ff">$1</a>')
        .replace(/\n/g, '<br>');

    // Pass 3: restore img placeholders as safe <img> tags
    s = s.replace(/\x00IMG(\d+)\x00/g, (_, idx) => {
        const url = imgPlaceholders[parseInt(idx)];
        if (!url) return '';
        // Enforce size limits via CSS — no width/height attrs that could be spoofed
        return `<img src="${url}" alt="sig image" loading="lazy"
                    style="max-width:100%;max-height:120px;border-radius:4px;vertical-align:middle">`;
    });

    return s;
}

router.post('/save-signature', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, signature } = req.body;
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        const raw = (signature || '').slice(0, 500); // 500 char BBCode limit
        const html = raw ? parseBBCode(raw) : null;

        await db.query(
            'UPDATE characters SET profile_signature=? WHERE id=?',
            [html, charId]
        );
        res.json({ success: true, preview: html });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// TOP FRIENDS ROUTES
// =================================================================
// GET  /top-friends/:charId   — load the character's top 8 slots
// POST /save-top-friends      — save the ordered list
//
// TEACHING: We replace the entire list on every save (DELETE then
// INSERT). This is simpler and safer than trying to diff individual
// slots. Since it's at most 8 rows it's negligibly fast.
// =================================================================

router.get('/top-friends/:charId', async (req, res) => {
    try {
        const charId = parseInt(req.params.charId);
        const [rows] = await db.query(
            `SELECT tf.slot, c.id AS charId, c.name, c.level, c.class_id,
                    c.equipped_title, c.profile_color, c.presence_status,
                    gc.name AS class_name
             FROM character_top_friends tf
             JOIN characters c  ON c.id  = tf.friend_char_id
             JOIN game_classes gc ON gc.id = c.class_id
             WHERE tf.character_id = ?
             ORDER BY tf.slot ASC`,
            [charId]
        );
        res.json({ success: true, friends: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/save-top-friends', async (req, res) => {
    try {
        const userId = uid(req);
        const { charId, friendIds } = req.body;
        // friendIds = array of charIds in order (slot 1 = index 0), max 8
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
        if (!c) return res.json({ success: false, message: 'Unauthorized.' });

        const slots = (friendIds || []).slice(0, 8).map(id => parseInt(id)).filter(id => id && id !== charId);

        // Verify all provided charIds actually exist
        if (slots.length > 0) {
            const [exists] = await db.query(
                'SELECT id FROM characters WHERE id IN (' + slots.map(()=>'?').join(',') + ')',
                slots
            );
            const validIds = new Set(exists.map(r => r.id));
            const allValid = slots.every(id => validIds.has(id));
            if (!allValid) return res.json({ success: false, message: 'One or more characters not found.' });
        }

        // Replace all slots atomically
        await db.query('DELETE FROM character_top_friends WHERE character_id=?', [charId]);
        for (let i = 0; i < slots.length; i++) {
            await db.query(
                'INSERT INTO character_top_friends (character_id, friend_char_id, slot) VALUES (?,?,?)',
                [charId, slots[i], i + 1]
            );
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── PvP Team Roster ─────────────────────────────────────────────────────
// GET current user's pvp team roster
router.post('/get-pvp-team', async (req, res) => {
    try {
        const userId = req.session?.userId;
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const [teamRow] = await db.query(
            'SELECT team_chars FROM character_pvp_teams WHERE user_id=? AND is_active=1 LIMIT 1',
            [userId]);
        let teamCharIds = [];
        if (teamRow.length) {
            try { teamCharIds = JSON.parse(teamRow[0].team_chars || '[]'); } catch {}
        }

        // Get the user's characters for the picker
        const [chars] = await db.query(
            `SELECT c.id, c.name, c.level, c.class_id, cl.name AS class_name
             FROM characters c LEFT JOIN game_classes cl ON cl.id=c.class_id
             WHERE c.user_id=? AND c.is_active=1 ORDER BY c.id`,
            [userId]);

        // Read pvp_team_size setting
        const [szRow] = await db.query(
            "SELECT value FROM game_settings WHERE `key`='pvp_team_size' LIMIT 1");
        const maxTeam = szRow.length ? (parseInt(szRow[0].value) || 3) : 3;

        res.json({ success: true, teamCharIds, chars, maxTeam });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// SAVE pvp team roster
router.post('/save-pvp-team', async (req, res) => {
    try {
        const userId = req.session?.userId;
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });
        const { charIds } = req.body;
        if (!Array.isArray(charIds)) return res.json({ success: false, message: 'Invalid charIds.' });

        // Read max team size
        const [szRow] = await db.query(
            "SELECT value FROM game_settings WHERE `key`='pvp_team_size' LIMIT 1");
        const maxTeam = szRow.length ? (parseInt(szRow[0].value) || 3) : 3;
        const capped = charIds.slice(0, maxTeam);

        // Validate ownership
        if (capped.length) {
            const [owned] = await db.query(
                `SELECT id FROM characters WHERE id IN (${capped.map(()=>'?').join(',')}) AND user_id=?`,
                [...capped, userId]);
            if (owned.length !== capped.length)
                return res.json({ success: false, message: 'Some characters do not belong to you.' });
        }

        await db.query(
            `INSERT INTO character_pvp_teams (user_id, team_chars, is_active)
             VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE team_chars=VALUES(team_chars), is_active=1`,
            [userId, JSON.stringify(capped)]);
        res.json({ success: true, teamCharIds: capped });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
