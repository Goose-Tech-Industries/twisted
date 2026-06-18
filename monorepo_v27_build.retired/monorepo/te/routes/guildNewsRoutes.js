// =================================================================
// GUILD NEWS ROUTES  v1.0
// =================================================================
// Mounted at /api/guild-news
//
// TEACHING: The guild news feed works like a pinboard inside the
// guild. Officers post announcements, and the system auto-posts
// events like big bank deposits, member milestones, achievements.
//
// The auto-post pattern is important — it means the feed stays
// active even in quiet guilds, because the game itself contributes
// to it. This is how games like WoW's guild log worked.
//
// We export postSystemNews() so guildRoutes.js and guildBankRoutes
// can call it without a circular dependency.
//
// Routes:
//   GET  /api/guild-news/:guildId         — load feed (last 30 posts)
//   POST /api/guild-news/post             — officer/leader posts
//   POST /api/guild-news/pin              — toggle pin (leader only)
//   POST /api/guild-news/delete           — soft delete (author or leader)
// =================================================================

const express = require('express');
const router  = express.Router();

let db;
router.init = (d) => { db = d; };

// ── Auth helpers ──────────────────────────────────────────────────
function uid(req) { return req.session?.userId; }
async function getGuildMembership(userId, guildId) {
    const [[row]] = await db.query(
        `SELECT gm.rank, gm.character_id, c.name
         FROM guild_members gm
         JOIN characters c ON c.id = gm.character_id
         WHERE gm.guild_id=? AND c.user_id=? AND gm.is_active=1 LIMIT 1`,
        [guildId, userId]
    );
    return row || null;
}

// ── Shared BBCode parser ──────────────────────────────────────────
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
        return `<img src="${url}" alt="" loading="lazy" style="max-width:100%;max-height:180px;border-radius:6px;margin-top:6px">`;
    });
}

// ── Exported helper: post a system news entry ─────────────────────
// Call this from guildRoutes, guildBankRoutes, achievementRoutes, etc.
// e.g.: await GuildNews.postSystem(db, guildId, '🏆 Bank Event', 'Goose deposited 5000g', 'bank');
router.postSystem = async function(dbConn, guildId, title, body, category='system') {
    try {
        const html = parseBBCode(body);
        await dbConn.query(
            `INSERT INTO guild_news (guild_id, author_char_id, author_name, title, body, body_html, category)
             VALUES (?, NULL, 'System', ?, ?, ?, ?)`,
            [guildId, title.slice(0,128), body.slice(0,2000), html, category]
        );
    } catch(e) { console.error('GuildNews.postSystem error:', e.message); }
};

// ── GET feed ──────────────────────────────────────────────────────
router.get('/:guildId', async (req, res) => {
    try {
        const userId  = uid(req);
        const guildId = parseInt(req.params.guildId);

        // Must be a member
        if (userId) {
            const membership = await getGuildMembership(userId, guildId);
            if (!membership) return res.json({ success: false, error: 'Not a member.' });
        }

        const [rows] = await db.query(
            `SELECT id, author_char_id, author_name, title, body_html,
                    category, is_pinned, created_at
             FROM guild_news
             WHERE guild_id=? AND is_deleted=0
             ORDER BY is_pinned DESC, created_at DESC
             LIMIT 30`,
            [guildId]
        );
        res.json({ success: true, posts: rows });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── POST news ─────────────────────────────────────────────────────
router.post('/post', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, error: 'Not logged in.' });

        const { guildId, title, body } = req.body;
        const t = (title || '').trim();
        const b = (body  || '').trim();
        if (!t || t.length < 2) return res.json({ success: false, error: 'Title required.' });
        if (!b || b.length < 2) return res.json({ success: false, error: 'Body required.' });

        const membership = await getGuildMembership(userId, guildId);
        if (!membership) return res.json({ success: false, error: 'Not a member.' });
        if (membership.rank === 'MEMBER')
            return res.json({ success: false, error: 'Officers and Leaders only.' });

        const html = parseBBCode(b);
        const [result] = await db.query(
            `INSERT INTO guild_news (guild_id, author_char_id, author_name, title, body, body_html, category)
             VALUES (?,?,?,?,?,?,'announcement')`,
            [guildId, membership.character_id, membership.name,
             t.slice(0,128), b.slice(0,2000), html]
        );
        res.json({
            success: true,
            post: {
                id: result.insertId, author_char_id: membership.character_id,
                author_name: membership.name, title: t, body_html: html,
                category: 'announcement', is_pinned: 0,
                created_at: new Date().toISOString()
            }
        });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── TOGGLE PIN ────────────────────────────────────────────────────
router.post('/pin', async (req, res) => {
    try {
        const userId = uid(req);
        const { guildId, postId } = req.body;
        const membership = await getGuildMembership(userId, guildId);
        if (!membership || membership.rank !== 'LEADER')
            return res.json({ success: false, error: 'Leaders only.' });

        await db.query(
            'UPDATE guild_news SET is_pinned = NOT is_pinned WHERE id=? AND guild_id=?',
            [postId, guildId]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DELETE post ───────────────────────────────────────────────────
router.post('/delete', async (req, res) => {
    try {
        const userId = uid(req);
        const { guildId, postId } = req.body;
        const membership = await getGuildMembership(userId, guildId);
        if (!membership) return res.json({ success: false, error: 'Not a member.' });

        const [[post]] = await db.query('SELECT author_char_id FROM guild_news WHERE id=? AND guild_id=?', [postId, guildId]);
        if (!post) return res.json({ success: false, error: 'Post not found.' });

        // Author can delete their own; leader can delete any
        const isAuthor  = post.author_char_id === membership.character_id;
        const isLeader  = membership.rank === 'LEADER';
        if (!isAuthor && !isLeader)
            return res.json({ success: false, error: 'Unauthorized.' });

        await db.query('UPDATE guild_news SET is_deleted=1 WHERE id=?', [postId]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

module.exports = router;
