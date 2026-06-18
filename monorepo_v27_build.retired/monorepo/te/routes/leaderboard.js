// =================================================================
// LEADERBOARD ROUTES  v1.0
// Mounted at /api/leaderboard
//
// TEACHING: Leaderboards are just SQL queries with ORDER BY and LIMIT.
// We already have all the data we need in the characters table:
//   - level + experience  → Top Level board
//   - battle_record JSON  → Top PvP (wins)
//   - users.currency      → Richest players
//   - guilds table        → Top Guilds (member count + avg level)
//
// Results are cached for 60 seconds so a busy server doesn't run
// these queries on every page open. Cache is in-memory (resets on
// server restart) — good enough for a leaderboard.
//
// Endpoints:
//   GET /api/leaderboard/pvp      — top 20 PvP win leaders
//   GET /api/leaderboard/level    — top 20 by level+XP
//   GET /api/leaderboard/wealth   — top 20 richest players
//   GET /api/leaderboard/guilds   — top 10 guilds by avg level
//   GET /api/leaderboard/all      — all four in one call (used by UI)
// =================================================================

const express = require('express');
const router  = express.Router();
let db;
router.init = (database) => { db = database; };

// Simple in-memory cache: { key -> { data, expiresAt } }
const cache = {};
const CACHE_TTL_MS = 60_000; // 60 seconds

function fromCache(key) {
    const entry = cache[key];
    if (entry && entry.expiresAt > Date.now()) return entry.data;
    return null;
}
function toCache(key, data) {
    cache[key] = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

// ── TOP PvP ──────────────────────────────────────────────────────
// Sorts by W (wins) descending, then W/L ratio as tiebreaker.
router.get('/pvp', async (req, res) => {
    const cached = fromCache('pvp');
    if (cached) return res.json({ success: true, data: cached });
    try {
        const [rows] = await db.query(`
            SELECT c.id, c.name, c.level,
                   CAST(JSON_EXTRACT(c.battle_record, '$.W') AS UNSIGNED) AS wins,
                   CAST(JSON_EXTRACT(c.battle_record, '$.L') AS UNSIGNED) AS losses,
                   CAST(JSON_EXTRACT(c.battle_record, '$.T') AS UNSIGNED) AS ties,
                   gc.name AS class_name,
                   g.name  AS guild_name
            FROM characters c
            LEFT JOIN game_classes gc ON gc.id = c.class_id
            LEFT JOIN guild_members gm ON gm.character_id = c.id AND gm.status = 'member'
            LEFT JOIN guilds g ON g.id = gm.guild_id
            WHERE JSON_EXTRACT(c.battle_record, '$.W') > 0
            ORDER BY wins DESC, losses ASC
            LIMIT 20
        `);
        const data = rows.map((r, i) => ({
            rank:       i + 1,
            charId:     r.id,
            name:       r.name,
            level:      r.level,
            className:  r.class_name || '?',
            guildName:  r.guild_name || null,
            wins:       r.wins   || 0,
            losses:     r.losses || 0,
            ties:       r.ties   || 0,
            ratio:      r.losses > 0 ? (r.wins / r.losses).toFixed(2) : r.wins + '.00',
        }));
        toCache('pvp', data);
        res.json({ success: true, data });
    } catch (e) {
        console.error('[Leaderboard] pvp:', e.message);
        res.json({ success: false, message: e.message });
    }
});

// ── TOP LEVEL ────────────────────────────────────────────────────
// Primary: level desc. Tiebreaker: raw XP in state_json (if available).
router.get('/level', async (req, res) => {
    const cached = fromCache('level');
    if (cached) return res.json({ success: true, data: cached });
    try {
        const [rows] = await db.query(`
            SELECT c.id, c.name, c.level, c.experience, c.state_json,
                   gc.name AS class_name, gr.name AS race_name,
                   g.name  AS guild_name
            FROM characters c
            LEFT JOIN game_classes gc ON gc.id = c.class_id
            LEFT JOIN game_races   gr ON gr.id = c.race_id
            LEFT JOIN guild_members gm ON gm.character_id = c.id AND gm.status = 'member'
            LEFT JOIN guilds g ON g.id = gm.guild_id
            ORDER BY c.level DESC, c.experience DESC
            LIMIT 20
        `);
        const data = rows.map((r, i) => {
            let xp = r.experience || 0;
            try {
                const s = typeof r.state_json === 'string' ? JSON.parse(r.state_json) : r.state_json;
                if (typeof s?.xp === 'number') xp = s.xp;
            } catch {}
            return {
                rank:      i + 1,
                charId:    r.id,
                name:      r.name,
                level:     r.level,
                xp,
                className: r.class_name || '?',
                raceName:  r.race_name  || '?',
                guildName: r.guild_name || null,
            };
        });
        toCache('level', data);
        res.json({ success: true, data });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── RICHEST PLAYERS ───────────────────────────────────────────────
router.get('/wealth', async (req, res) => {
    const cached = fromCache('wealth');
    if (cached) return res.json({ success: true, data: cached });
    try {
        const [rows] = await db.query(`
            SELECT c.id, c.name, c.level, u.currency AS gold,
                   gc.name AS class_name, g.name AS guild_name
            FROM characters c
            JOIN users u ON u.id = c.user_id
            LEFT JOIN game_classes gc ON gc.id = c.class_id
            LEFT JOIN guild_members gm ON gm.character_id = c.id AND gm.status = 'member'
            LEFT JOIN guilds g ON g.id = gm.guild_id
            ORDER BY u.currency DESC
            LIMIT 20
        `);
        const data = rows.map((r, i) => ({
            rank:      i + 1,
            charId:    r.id,
            name:      r.name,
            level:     r.level,
            gold:      r.gold || 0,
            className: r.class_name || '?',
            guildName: r.guild_name || null,
        }));
        toCache('wealth', data);
        res.json({ success: true, data });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── TOP GUILDS ────────────────────────────────────────────────────
// Ranked by average member level, then member count as tiebreaker.
router.get('/guilds', async (req, res) => {
    const cached = fromCache('guilds');
    if (cached) return res.json({ success: true, data: cached });
    try {
        const [rows] = await db.query(`
            SELECT g.id, g.name, g.tag, g.description,
                   COUNT(gm.id)      AS member_count,
                   AVG(c.level)      AS avg_level,
                   MAX(c.level)      AS max_level,
                   SUM(CAST(JSON_EXTRACT(c.battle_record,'$.W') AS UNSIGNED)) AS total_wins
            FROM guilds g
            JOIN guild_members gm ON gm.guild_id = g.id AND gm.status = 'member'
            JOIN characters c ON c.id = gm.character_id
            GROUP BY g.id
            ORDER BY avg_level DESC, member_count DESC
            LIMIT 10
        `);
        const data = rows.map((r, i) => ({
            rank:        i + 1,
            guildId:     r.id,
            name:        r.name,
            tag:         r.tag || '',
            memberCount: r.member_count || 0,
            avgLevel:    parseFloat(r.avg_level || 0).toFixed(1),
            maxLevel:    r.max_level || 0,
            totalWins:   r.total_wins || 0,
        }));
        toCache('guilds', data);
        res.json({ success: true, data });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── ALL (single call for the UI) ──────────────────────────────────
router.get('/all', async (req, res) => {
    try {
        const [pvp, level, wealth, guilds] = await Promise.all([
            fetch_board('pvp'),
            fetch_board('level'),
            fetch_board('wealth'),
            fetch_board('guilds'),
        ]);
        res.json({ success: true, pvp, level, wealth, guilds });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

async function fetch_board(type) {
    const cached = fromCache(type);
    if (cached) return cached;
    // Delegate to the individual handler logic by hitting ourselves
    // (simpler than extracting into shared functions)
    return new Promise((resolve) => {
        const fakeRes = {
            json(d) { if (d.success) toCache(type, d.data); resolve(d.data || []); }
        };
        // Map type to the actual handler function
        const handlers = {
            pvp:    () => router.handle({ method: 'GET', url: '/pvp',    path: '/pvp'    }, fakeRes, () => {}),
            level:  () => router.handle({ method: 'GET', url: '/level',  path: '/level'  }, fakeRes, () => {}),
            wealth: () => router.handle({ method: 'GET', url: '/wealth', path: '/wealth' }, fakeRes, () => {}),
            guilds: () => router.handle({ method: 'GET', url: '/guilds', path: '/guilds' }, fakeRes, () => {}),
        };
        // Actually just run the DB queries inline to avoid internal routing hacks
        resolve([]);  // Will be replaced below
    }).then(async () => {
        // Re-run cleanly: call the DB directly
        return fromCache(type) || [];
    });
}

// Cleaner /all: parallel DB queries
router.get('/all', async (req, res) => {
    try {
        const [pvpR, lvlR, wealthR, guildsR] = await Promise.all([
            db.query(`
                SELECT c.id, c.name, c.level,
                    CAST(JSON_EXTRACT(c.battle_record,'$.W') AS UNSIGNED) AS wins,
                    CAST(JSON_EXTRACT(c.battle_record,'$.L') AS UNSIGNED) AS losses,
                    gc.name AS class_name, g.name AS guild_name
                FROM characters c
                LEFT JOIN game_classes gc ON gc.id=c.class_id
                LEFT JOIN guild_members gm ON gm.character_id=c.id AND gm.status='member'
                LEFT JOIN guilds g ON g.id=gm.guild_id
                WHERE JSON_EXTRACT(c.battle_record,'$.W')>0
                ORDER BY wins DESC, losses ASC LIMIT 20`),
            db.query(`
                SELECT c.id, c.name, c.level, c.experience, c.state_json,
                    gc.name AS class_name, gr.name AS race_name, g.name AS guild_name
                FROM characters c
                LEFT JOIN game_classes gc ON gc.id=c.class_id
                LEFT JOIN game_races gr ON gr.id=c.race_id
                LEFT JOIN guild_members gm ON gm.character_id=c.id AND gm.status='member'
                LEFT JOIN guilds g ON g.id=gm.guild_id
                ORDER BY c.level DESC, c.experience DESC LIMIT 20`),
            db.query(`
                SELECT c.id, c.name, c.level, u.currency AS gold,
                    gc.name AS class_name, g.name AS guild_name
                FROM characters c
                JOIN users u ON u.id=c.user_id
                LEFT JOIN game_classes gc ON gc.id=c.class_id
                LEFT JOIN guild_members gm ON gm.character_id=c.id AND gm.status='member'
                LEFT JOIN guilds g ON g.id=gm.guild_id
                ORDER BY u.currency DESC LIMIT 20`),
            db.query(`
                SELECT g.id, g.name, g.tag,
                    COUNT(gm.id) AS member_count,
                    AVG(c.level) AS avg_level,
                    MAX(c.level) AS max_level,
                    SUM(CAST(JSON_EXTRACT(c.battle_record,'$.W') AS UNSIGNED)) AS total_wins
                FROM guilds g
                JOIN guild_members gm ON gm.guild_id=g.id AND gm.status='member'
                JOIN characters c ON c.id=gm.character_id
                GROUP BY g.id
                ORDER BY avg_level DESC, member_count DESC LIMIT 10`),
        ]);

        const pvp = pvpR[0].map((r,i) => ({
            rank: i+1, charId: r.id, name: r.name, level: r.level,
            className: r.class_name||'?', guildName: r.guild_name||null,
            wins: r.wins||0, losses: r.losses||0,
            ratio: r.losses>0 ? (r.wins/r.losses).toFixed(2) : (r.wins||0)+'.00',
        }));

        const level = lvlR[0].map((r,i) => {
            let xp = r.experience || 0;
            try { const s = typeof r.state_json==='string'?JSON.parse(r.state_json):r.state_json; if(typeof s?.xp==='number') xp=s.xp; } catch{}
            return { rank:i+1, charId:r.id, name:r.name, level:r.level, xp,
                className:r.class_name||'?', raceName:r.race_name||'?', guildName:r.guild_name||null };
        });

        const wealth = wealthR[0].map((r,i) => ({
            rank:i+1, charId:r.id, name:r.name, level:r.level,
            gold:r.gold||0, className:r.class_name||'?', guildName:r.guild_name||null,
        }));

        const guilds = guildsR[0].map((r,i) => ({
            rank:i+1, guildId:r.id, name:r.name, tag:r.tag||'',
            memberCount:r.member_count||0, avgLevel:parseFloat(r.avg_level||0).toFixed(1),
            maxLevel:r.max_level||0, totalWins:r.total_wins||0,
        }));

        res.json({ success: true, pvp, level, wealth, guilds });
    } catch (e) {
        console.error('[Leaderboard] all:', e.message);
        res.json({ success: false, message: e.message });
    }
});

module.exports = router;
