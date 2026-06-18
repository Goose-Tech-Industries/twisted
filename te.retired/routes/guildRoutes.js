// =================================================================
// GUILD ROUTES — Persistent guild management REST API
// =================================================================
// Mounted at /api/guild
//
// Real-time guild events (invite, accept, chat) happen via Socket.IO
// in server.js. These REST routes handle persistence: CRUD for guilds,
// member lists, invite history, and guild search.
//
// Socket events (in server.js):
//   guild_invite  { targetCharId } — invite a player
//   guild_accept  { guildId }      — accept invite
//   guild_decline { guildId }      — decline invite
//   guild_leave   {}               — leave guild
//   guild_kick    { targetCharId } — kick (leader/officer only)
//   guild_promote { targetCharId } — promote to officer
//   guild_demote  { targetCharId } — demote to member
//
// REST endpoints here:
//   GET  /api/guild/my/:charId          — get my guild + members
//   GET  /api/guild/search?q=name               — search guilds by name/tag
//   GET  /api/guild/info/:guildId               — get guild info + members
//   POST /api/guild/create                      — create a new guild
//   POST /api/guild/disband                     — disband (leader only)
// =================================================================

const express = require('express');
const router  = express.Router();
let db;
router.init = (d) => { db = d; return router; };
// uid is at module scope so all route handlers can call it
function uid(req) { return req.session && req.session.userId; }

// ── HELPERS ──────────────────────────────────────────────────────
async function verifyChar(userId, charId) {
    const [r] = await db.query(
        'SELECT id, name FROM characters WHERE id=? AND user_id=?', [charId, userId]
    );
    return r.length ? r[0] : null;
}

async function getMyGuild(charId) {
    const [rows] = await db.query(
        `SELECT gm.rank, gm.joined_at, g.*
         FROM guild_members gm
         JOIN guilds g ON g.id = gm.guild_id
         WHERE gm.character_id = ? AND gm.is_active = 1 AND g.is_active = 1
         LIMIT 1`,
        [charId]
    );
    return rows.length ? rows[0] : null;
}

async function getGuildMembers(guildId) {
    const [rows] = await db.query(
        `SELECT gm.rank, gm.joined_at, c.id AS char_id, c.name, c.level,
                cl.name AS class_name
         FROM guild_members gm
         JOIN characters c ON c.id = gm.character_id
         LEFT JOIN game_classes cl ON cl.id = c.class_id
         WHERE gm.guild_id = ? AND gm.is_active = 1
         ORDER BY FIELD(gm.rank,'LEADER','OFFICER','MEMBER'), c.level DESC`,
        [guildId]
    );
    return rows;
}

// ── GET MY GUILD ──────────────────────────────────────────────────
router.get('/my/:charId', async (req, res) => {
    try {
        const { charId } = req.params;
        const userId = uid(req);
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        const guild = await getMyGuild(charId);
        if (!guild) return res.json({ success: true, data: null });

        const members = await getGuildMembers(guild.id);
        // Pending invites I received
        const [invites] = await db.query(
            `SELECT gi.*, g.name AS guild_name, g.tag, g.emblem, c.name AS inviter_name
             FROM guild_invites gi
             JOIN guilds g ON g.id = gi.guild_id
             JOIN characters c ON c.id = gi.inviter_id
             WHERE gi.invitee_id = ? AND gi.status = 'pending' AND gi.expires_at > NOW()`,
            [charId]
        );

        res.json({ success: true, data: { guild, members, pendingInvites: invites } });
    } catch (e) {
        console.error('guild/my error:', e);
        res.json({ success: false, error: e.message });
    }
});

// ── SEARCH GUILDS ─────────────────────────────────────────────────
router.get('/search', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        let rows;
        if (q) {
            [rows] = await db.query(
                `SELECT g.*, COUNT(gm.id) AS member_count
                 FROM guilds g
                 LEFT JOIN guild_members gm ON gm.guild_id = g.id AND gm.is_active = 1
                 WHERE g.is_active = 1 AND (g.name LIKE ? OR g.tag LIKE ?)
                 GROUP BY g.id ORDER BY member_count DESC LIMIT 20`,
                [`%${q}%`, `%${q}%`]
            );
        } else {
            [rows] = await db.query(
                `SELECT g.*, COUNT(gm.id) AS member_count
                 FROM guilds g
                 LEFT JOIN guild_members gm ON gm.guild_id = g.id AND gm.is_active = 1
                 WHERE g.is_active = 1
                 GROUP BY g.id ORDER BY member_count DESC LIMIT 20`
            );
        }
        res.json({ success: true, data: rows });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── GET GUILD INFO ────────────────────────────────────────────────
router.get('/info/:guildId', async (req, res) => {
    try {
        const [guild] = await db.query('SELECT * FROM guilds WHERE id=? AND is_active=1', [req.params.guildId]);
        if (!guild.length) return res.json({ success: false, error: 'Guild not found' });
        const members = await getGuildMembers(guild[0].id);
        res.json({ success: true, data: { guild: guild[0], members } });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// ── CREATE GUILD ──────────────────────────────────────────────────
router.post('/create', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, name, tag, description, emblem } = req.body;
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized' });

        // Must not already be in a guild
        const existing = await getMyGuild(charId);
        if (existing) return res.json({ success: false, error: 'Already in a guild. Leave first.' });

        // Validate + sanitize
        // Strip HTML from any free-text field that gets displayed to other players.
        // A guild name with <script> in it would execute in every player's browser
        // if the client used innerHTML instead of textContent to render it.
        const esc = (s, max) => String(s || '').trim().slice(0, max)
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#x27;');

        const gName = esc(name, 64);
        const gTag  = esc(tag,  6).toUpperCase();
        const gDesc = esc(description, 300);
        if (!gName || gName.length < 2) return res.json({ success: false, error: 'Name must be 2-64 chars' });
        if (!gTag  || gTag.length  < 2) return res.json({ success: false, error: 'Tag must be 2-6 chars' });

        // Check name uniqueness
        const [taken] = await db.query('SELECT id FROM guilds WHERE name=?', [gName]);
        if (taken.length) return res.json({ success: false, error: 'Guild name already taken' });

        const [result] = await db.query(
            'INSERT INTO guilds (name, tag, leader_id, description, emblem) VALUES (?,?,?,?,?)',
            [gName, gTag, charId, gDesc, String(emblem || '⚔️').slice(0, 8)]
        );
        const guildId = result.insertId;
        await db.query(
            "INSERT INTO guild_members (guild_id, character_id, rank) VALUES (?,?,'LEADER')",
            [guildId, charId]
        );

        res.json({ success: true, guildId, guildName: gName, guildTag: gTag });
    } catch (e) {
        console.error('guild/create error:', e);
        res.json({ success: false, error: e.message });
    }
});

// ── DISBAND GUILD ─────────────────────────────────────────────────
router.post('/disband', async (req, res) => {
    try {
        const userId = uid(req);
    const { charId, guildId } = req.body;
        if (!await verifyChar(userId, charId)) return res.json({ success: false, error: 'Unauthorized' });

        const [g] = await db.query('SELECT * FROM guilds WHERE id=? AND leader_id=? AND is_active=1', [guildId, charId]);
        if (!g.length) return res.json({ success: false, error: 'Not guild leader' });

        await db.query('UPDATE guilds SET is_active=0, disbanded_at=NOW() WHERE id=?', [guildId]);
        await db.query('UPDATE guild_members SET is_active=0, left_at=NOW() WHERE guild_id=?', [guildId]);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});


// =================================================================
// GUILD BANK ROUTES
// =================================================================
// TEACHING: The guild bank has two compartments:
//   1. Gold pool   — stored as guilds.gold_bank (a single integer)
//   2. Item chest  — stored as rows in guild_bank_items
//
// Every action (deposit/withdraw gold or items) is logged in
// guild_bank_log so officers can audit who took what.
//
// Permissions are stored in guild_bank_perms per rank.
// When a guild is first created, we insert default perms:
//   LEADER  → can do everything
//   OFFICER → can deposit anything, withdraw items (not gold by default)
//   MEMBER  → can deposit only
//
// Routes:
//   GET  /guild/bank/:guildId           — current gold + items + log
//   POST /guild/bank/deposit-gold       — deposit gold from personal wallet
//   POST /guild/bank/withdraw-gold      — withdraw gold (perm-checked)
//   POST /guild/bank/deposit-item       — move item from inventory to bank
//   POST /guild/bank/withdraw-item      — move item from bank to inventory
//   GET  /guild/bank/perms/:guildId     — get permission config
//   POST /guild/bank/perms              — save permission config (LEADER only)
// =================================================================

// ── Helpers ────────────────────────────────────────────────────────
async function getMyGuildMembership(charId) {
    const [rows] = await db.query(
        `SELECT gm.guild_id, gm.rank, g.name, g.gold_bank, g.leader_id
         FROM guild_members gm JOIN guilds g ON g.id=gm.guild_id
         WHERE gm.character_id=? AND gm.is_active=1 AND g.is_active=1 LIMIT 1`,
        [charId]
    );
    return rows[0] || null;
}

async function getBankPerms(guildId, rank) {
    // Try DB first; fall back to sensible defaults
    const [rows] = await db.query(
        'SELECT * FROM guild_bank_perms WHERE guild_id=? AND rank=? LIMIT 1',
        [guildId, rank]
    );
    if (rows.length) return rows[0];
    // Default perm object if not configured yet
    const DEFAULTS = {
        LEADER:  { can_deposit_gold:1,can_withdraw_gold:1,can_deposit_item:1,can_withdraw_item:1,gold_withdraw_limit:0 },
        OFFICER: { can_deposit_gold:1,can_withdraw_gold:0,can_deposit_item:1,can_withdraw_item:1,gold_withdraw_limit:0 },
        MEMBER:  { can_deposit_gold:1,can_withdraw_gold:0,can_deposit_item:1,can_withdraw_item:0,gold_withdraw_limit:0 },
    };
    return DEFAULTS[rank] || DEFAULTS.MEMBER;
}

async function logBank(guildId, charId, charName, action, opts = {}) {
    try {
        await db.query(
            `INSERT INTO guild_bank_log (guild_id,character_id,character_name,action,amount,item_id,item_qty,item_name,note)
             VALUES (?,?,?,?,?,?,?,?,?)`,
            [guildId, charId, charName, action,
             opts.amount || null, opts.item_id || null, opts.item_qty || null,
             opts.item_name || null, opts.note || null]
        );
    } catch { /* log failure is non-fatal */ }
}

// ── GET bank state ─────────────────────────────────────────────────
router.get('/bank/:guildId', async (req, res) => {
    const userId  = uid(req);
    const guildId = parseInt(req.params.guildId);
    try {
        // Verify membership
        const [memberRows] = await db.query(
            'SELECT gm.rank FROM guild_members gm WHERE gm.guild_id=? AND gm.character_id IN (SELECT id FROM characters WHERE user_id=?) AND gm.is_active=1 LIMIT 1',
            [guildId, userId]
        );
        if (!memberRows.length) return res.json({ success: false, error: 'Not a member.' });

        // Guild gold
        const [[guild]] = await db.query('SELECT gold_bank FROM guilds WHERE id=?', [guildId]);

        // Items in bank
        const [items] = await db.query(
            `SELECT gbi.id, gbi.item_id, gbi.quantity, gbi.deposited_by, gbi.deposited_at, gbi.note,
                    gi.name AS item_name, gi.icon AS item_icon, gi.description, gi.rarity,
                    gi.item_type, gi.buy_price,
                    c.name AS depositor_name
             FROM guild_bank_items gbi
             JOIN game_items gi ON gi.id = gbi.item_id
             JOIN characters c ON c.id = gbi.deposited_by
             WHERE gbi.guild_id = ?
             ORDER BY gbi.deposited_at DESC`,
            [guildId]
        );

        // Recent log (last 50)
        const [log] = await db.query(
            'SELECT * FROM guild_bank_log WHERE guild_id=? ORDER BY created_at DESC LIMIT 50',
            [guildId]
        );

        // This member's permissions
        const perms = await getBankPerms(guildId, memberRows[0].rank);

        res.json({ success: true, gold: guild.gold_bank || 0, items, log, perms, rank: memberRows[0].rank });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DEPOSIT GOLD ──────────────────────────────────────────────────
router.post('/bank/deposit-gold', async (req, res) => {
    const userId = uid(req);
    const { charId, guildId, amount } = req.body;
    const gold = parseInt(amount);
    if (!gold || gold < 1) return res.json({ success: false, error: 'Invalid amount.' });
    try {
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized.' });

        const membership = await getMyGuildMembership(charId);
        if (!membership || membership.guild_id !== parseInt(guildId))
            return res.json({ success: false, error: 'Not in this guild.' });

        const perms = await getBankPerms(guildId, membership.rank);
        if (!perms.can_deposit_gold) return res.json({ success: false, error: 'Your rank cannot deposit gold.' });

        // Deduct from player wallet (atomic via transaction to prevent race conditions)
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[userRow]] = await conn.query('SELECT currency FROM users WHERE id=? FOR UPDATE', [userId]);
            if ((userRow?.currency || 0) < gold) {
                await conn.rollback(); conn.release();
                return res.json({ success: false, error: 'Not enough gold.' });
            }
            await conn.query('UPDATE users SET currency=currency-? WHERE id=?', [gold, userId]);
            await conn.query('UPDATE guilds SET gold_bank=gold_bank+? WHERE id=?', [gold, guildId]);
            await conn.commit();
            conn.release();
        } catch (txErr) {
            await conn.rollback().catch(() => {}); conn.release();
            return res.json({ success: false, error: 'Transaction failed.' });
        }
        await logBank(guildId, charId, char.name, 'deposit_gold', { amount: gold });

        // Auto-post to guild news for large deposits (500g+)
        if (gold >= 500 && global._guildNews) {
            global._guildNews.postSystem(db, guildId,
                `💰 ${char.name} donated ${gold.toLocaleString()}g`,
                `[b]${char.name}[/b] deposited [color=#ffaa00]${gold.toLocaleString()} gold[/color] into the guild bank.`,
                'bank'
            ).catch(()=>{});
        }

        res.json({ success: true, message: `Deposited ${gold}g to guild bank.` });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── WITHDRAW GOLD ─────────────────────────────────────────────────
router.post('/bank/withdraw-gold', async (req, res) => {
    const userId = uid(req);
    const { charId, guildId, amount } = req.body;
    const gold = parseInt(amount);
    if (!gold || gold < 1) return res.json({ success: false, error: 'Invalid amount.' });
    try {
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized.' });

        const membership = await getMyGuildMembership(charId);
        if (!membership || membership.guild_id !== parseInt(guildId))
            return res.json({ success: false, error: 'Not in this guild.' });

        const perms = await getBankPerms(guildId, membership.rank);
        if (!perms.can_withdraw_gold) return res.json({ success: false, error: 'Your rank cannot withdraw gold.' });

        // Daily limit check
        if (perms.gold_withdraw_limit > 0) {
            const today = new Date().toISOString().slice(0, 10);
            const [[todayRow]] = await db.query(
                `SELECT COALESCE(SUM(amount),0) AS total FROM guild_bank_log
                 WHERE guild_id=? AND character_id=? AND action='withdraw_gold'
                 AND DATE(created_at)=?`,
                [guildId, charId, today]
            );
            if ((todayRow?.total || 0) + gold > perms.gold_withdraw_limit) {
                return res.json({ success: false, error: `Daily withdrawal limit: ${perms.gold_withdraw_limit}g.` });
            }
        }

        // Check bank has enough + withdraw atomically
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[guild]] = await conn.query('SELECT gold_bank FROM guilds WHERE id=? FOR UPDATE', [guildId]);
            if ((guild?.gold_bank || 0) < gold) {
                await conn.rollback(); conn.release();
                return res.json({ success: false, error: 'Bank has insufficient gold.' });
            }
            await conn.query('UPDATE guilds SET gold_bank=gold_bank-? WHERE id=?', [gold, guildId]);
            await conn.query('UPDATE users SET currency=currency+? WHERE id=?', [gold, userId]);
            await conn.commit();
            conn.release();
        } catch (txErr) {
            await conn.rollback().catch(() => {}); conn.release();
            return res.json({ success: false, error: 'Transaction failed.' });
        }
        await logBank(guildId, charId, char.name, 'withdraw_gold', { amount: gold });

        res.json({ success: true, message: `Withdrew ${gold}g from guild bank.` });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── DEPOSIT ITEM ──────────────────────────────────────────────────
router.post('/bank/deposit-item', async (req, res) => {
    const userId = uid(req);
    const { charId, guildId, inventoryId, quantity, note } = req.body;
    const qty = parseInt(quantity) || 1;
    try {
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized.' });

        const membership = await getMyGuildMembership(charId);
        if (!membership || membership.guild_id !== parseInt(guildId))
            return res.json({ success: false, error: 'Not in this guild.' });

        const perms = await getBankPerms(guildId, membership.rank);
        if (!perms.can_deposit_item) return res.json({ success: false, error: 'Your rank cannot deposit items.' });

        // Verify item in player inventory
        const [[invRow]] = await db.query(
            'SELECT ci.*, gi.name AS item_name FROM character_items ci JOIN game_items gi ON gi.id=ci.item_id WHERE ci.id=? AND ci.character_id=?',
            [inventoryId, charId]
        );
        if (!invRow) return res.json({ success: false, error: 'Item not in inventory.' });
        if ((invRow.quantity || 1) < qty) return res.json({ success: false, error: 'Not enough of that item.' });

        // Remove from inventory (or reduce qty)
        if ((invRow.quantity || 1) <= qty) {
            await db.query('DELETE FROM character_items WHERE id=?', [inventoryId]);
        } else {
            await db.query('UPDATE character_items SET quantity=quantity-? WHERE id=?', [qty, inventoryId]);
        }

        // Add to guild bank
        const [[existing]] = await db.query(
            'SELECT id, quantity FROM guild_bank_items WHERE guild_id=? AND item_id=?',
            [guildId, invRow.item_id]
        );
        if (existing) {
            await db.query('UPDATE guild_bank_items SET quantity=quantity+? WHERE id=?', [qty, existing.id]);
        } else {
            await db.query(
                'INSERT INTO guild_bank_items (guild_id, item_id, quantity, deposited_by, note) VALUES (?,?,?,?,?)',
                [guildId, invRow.item_id, qty, charId, note || null]
            );
        }

        await logBank(guildId, charId, char.name, 'deposit_item',
            { item_id: invRow.item_id, item_qty: qty, item_name: invRow.item_name, note });

        res.json({ success: true, message: `Deposited ${qty}x ${invRow.item_name}.` });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── WITHDRAW ITEM ─────────────────────────────────────────────────
router.post('/bank/withdraw-item', async (req, res) => {
    const userId = uid(req);
    const { charId, guildId, bankItemId, quantity } = req.body;
    const qty = parseInt(quantity) || 1;
    try {
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized.' });

        const membership = await getMyGuildMembership(charId);
        if (!membership || membership.guild_id !== parseInt(guildId))
            return res.json({ success: false, error: 'Not in this guild.' });

        const perms = await getBankPerms(guildId, membership.rank);
        if (!perms.can_withdraw_item) return res.json({ success: false, error: 'Your rank cannot withdraw items.' });

        // Verify item in guild bank
        const [[bankRow]] = await db.query(
            'SELECT gbi.*, gi.name AS item_name FROM guild_bank_items gbi JOIN game_items gi ON gi.id=gbi.item_id WHERE gbi.id=? AND gbi.guild_id=?',
            [bankItemId, guildId]
        );
        if (!bankRow) return res.json({ success: false, error: 'Item not in guild bank.' });
        if (bankRow.quantity < qty) return res.json({ success: false, error: 'Bank has insufficient quantity.' });

        // Remove from bank
        if (bankRow.quantity <= qty) {
            await db.query('DELETE FROM guild_bank_items WHERE id=?', [bankItemId]);
        } else {
            await db.query('UPDATE guild_bank_items SET quantity=quantity-? WHERE id=?', [qty, bankItemId]);
        }

        // Add to player inventory
        const [[invExisting]] = await db.query(
            'SELECT id, quantity FROM character_items WHERE character_id=? AND item_id=?',
            [charId, bankRow.item_id]
        );
        if (invExisting) {
            await db.query('UPDATE character_items SET quantity=quantity+? WHERE id=?', [qty, invExisting.id]);
        } else {
            await db.query(
                'INSERT INTO character_items (character_id, item_id, quantity) VALUES (?,?,?)',
                [charId, bankRow.item_id, qty]
            );
        }

        await logBank(guildId, charId, char.name, 'withdraw_item',
            { item_id: bankRow.item_id, item_qty: qty, item_name: bankRow.item_name });

        res.json({ success: true, message: `Withdrew ${qty}x ${bankRow.item_name}.` });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── GET BANK PERMS ────────────────────────────────────────────────
router.get('/bank/perms/:guildId', async (req, res) => {
    const userId  = uid(req);
    const guildId = parseInt(req.params.guildId);
    try {
        // Must be leader or officer
        const [memberRows] = await db.query(
            `SELECT gm.rank FROM guild_members gm
             WHERE gm.guild_id=? AND gm.character_id IN (SELECT id FROM characters WHERE user_id=?)
             AND gm.is_active=1 LIMIT 1`,
            [guildId, userId]
        );
        if (!memberRows.length) return res.json({ success: false, error: 'Not a member.' });
        if (!['LEADER','OFFICER'].includes(memberRows[0].rank))
            return res.json({ success: false, error: 'Officers and Leaders only.' });

        const [perms] = await db.query(
            'SELECT * FROM guild_bank_perms WHERE guild_id=? ORDER BY FIELD(rank,"LEADER","OFFICER","MEMBER")',
            [guildId]
        );
        res.json({ success: true, perms });
    } catch(e) { res.json({ success: false, error: e.message }); }
});

// ── SAVE BANK PERMS ───────────────────────────────────────────────
router.post('/bank/perms', async (req, res) => {
    const userId = uid(req);
    const { charId, guildId, perms } = req.body; // perms = [{rank, flags...}]
    try {
        const char = await verifyChar(userId, charId);
        if (!char) return res.json({ success: false, error: 'Unauthorized.' });

        // Only leader can change perms
        const [[g]] = await db.query('SELECT leader_id FROM guilds WHERE id=? AND is_active=1', [guildId]);
        if (!g || g.leader_id !== charId) return res.json({ success: false, error: 'Only the guild leader can change permissions.' });

        for (const p of (perms || [])) {
            await db.query(
                `INSERT INTO guild_bank_perms
                    (guild_id,rank,can_deposit_gold,can_withdraw_gold,can_deposit_item,can_withdraw_item,gold_withdraw_limit)
                 VALUES (?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE
                    can_deposit_gold=VALUES(can_deposit_gold), can_withdraw_gold=VALUES(can_withdraw_gold),
                    can_deposit_item=VALUES(can_deposit_item), can_withdraw_item=VALUES(can_withdraw_item),
                    gold_withdraw_limit=VALUES(gold_withdraw_limit)`,
                [guildId, p.rank, p.can_deposit_gold?1:0, p.can_withdraw_gold?1:0,
                 p.can_deposit_item?1:0, p.can_withdraw_item?1:0, p.gold_withdraw_limit||0]
            );
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false, error: e.message }); }
});


module.exports = router;
