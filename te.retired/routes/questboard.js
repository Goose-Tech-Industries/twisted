// =================================================================
// QUEST BOARD ROUTES
// =================================================================
// The quest board shows available quests from game_quest_board that
// match the player's current world state and region. Unlike NPC
// quest offers (which are manually assigned), board quests are
// filtered automatically by conditions — so a siege quest only
// appears when the siege is active, a regional quest only appears
// when you're in that region, etc.
//
// POST /api/questboard/available  — quests available to this character
// POST /api/questboard/accept     — take a quest from the board
// POST /api/questboard/complete   — turn in a completed board quest
//
// TEACHING: The "availability check" is the main logic here.
// Each quest in game_quest_board has:
//   requires_flags_json  — world flags that must be set
//   requires_region_json — region state conditions (min_danger, etc.)
//   region_id            — if set, only shows while in this region
//   expires_at           — auto-hides after this time
//   max_completions      — hidden after this many total completions
//
// The character's current quest state is stored in state_json.quests
// (same format as event_runner quests). Board quests use the board
// quest ID prefixed with "board_" so they don't collide with game_quests.
// =================================================================

const express = require('express');
const router  = express.Router();
let db;
function uid(req)  { return req.session?.userId; }
function jp(s, d)  { try { return typeof s === 'string' ? JSON.parse(s) : (s ?? d); } catch { return d; } }

async function verifyOwnership(userId, charId) {
    if (!userId || !charId) return false;
    const [r] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?', [charId, userId]);
    return r.length > 0;
}

// ── Check if a board quest is available to this character ─────────
async function isAvailable(quest, charState, regionId) {
    const wf = global.worldFlags || {};

    // Expired?
    if (quest.expires_at && new Date(quest.expires_at) < new Date()) return false;

    // Max completions hit?
    if (quest.max_completions && quest.times_completed >= quest.max_completions) return false;

    // Already accepted/completed by this character?
    const qKey = `board_${quest.id}`;
    const charQuestState = (charState.quests || {})[qKey];
    if (charQuestState?.step === -1) return false; // completed
    if (charQuestState?.step >= 0)   return false; // already active

    // Region filter: quest only shows in specific region
    if (quest.region_id && quest.region_id !== regionId) return false;

    // World flag requirements
    if (quest.requires_flags_json) {
        const flags = jp(quest.requires_flags_json, []);
        for (const flag of flags) {
            if (wf[flag] !== 'true' && wf[flag] !== true) return false;
        }
    }

    // Region state requirements
    if (quest.requires_region_json) {
        const reqs = jp(quest.requires_region_json, {});
        const region = regionId ? global.regionState?.[regionId] : null;
        if (!region && (reqs.min_danger || reqs.faction || reqs.weather || reqs.min_corruption)) {
            return false; // conditions require a region but player has none
        }
        if (region) {
            if (reqs.min_danger     !== undefined && (region.danger_level     || 0) < reqs.min_danger)     return false;
            if (reqs.max_danger     !== undefined && (region.danger_level     || 0) > reqs.max_danger)     return false;
            if (reqs.min_corruption !== undefined && (region.corruption_level || 0) < reqs.min_corruption) return false;
            if (reqs.faction        !== undefined && (region.faction_control  || '') !== reqs.faction)     return false;
            if (reqs.weather        !== undefined && (region.weather_override || '') !== reqs.weather)     return false;
            if (reqs.tag) {
                const tags = jp(region.active_tags_json, []);
                if (!tags.includes(reqs.tag)) return false;
            }
        }
    }

    return true;
}

// ── GET AVAILABLE QUESTS ──────────────────────────────────────────
router.post('/available', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, mapId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        // Get character state
        const [charRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [charId]);
        const charState = charRow.length ? jp(charRow[0].state_json, {}) : {};

        // Get region for this map
        let regionId = null;
        if (mapId && global.getRegionForMap) {
            const r = await global.getRegionForMap(mapId).catch(() => null);
            if (r) regionId = r.id;
        }

        // Load all active board quests
        const [quests] = await db.query(
            'SELECT * FROM game_quest_board WHERE is_active=1 ORDER BY quest_type, id');

        const available = [];
        for (const q of quests) {
            if (await isAvailable(q, charState, regionId)) {
                available.push({
                    id:           q.id,
                    title:        q.title,
                    description:  q.description,
                    quest_type:   q.quest_type,
                    faction:      q.faction,
                    region_id:    q.region_id,
                    objectives:   jp(q.objectives_json, []),
                    rewards:      jp(q.rewards_json, {}),
                    expires_at:   q.expires_at,
                    times_completed: q.times_completed,
                    max_completions: q.max_completions,
                });
            }
        }

        res.json({ success: true, quests: available, regionId });
    } catch(e) { console.error(e); res.json({ success: false, message: e.message }); }
});

// ── ACCEPT QUEST ──────────────────────────────────────────────────
router.post('/accept', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, questId, mapId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query(
            'SELECT * FROM game_quest_board WHERE id=? AND is_active=1', [questId]);
        if (!rows.length) return res.json({ success: false, message: 'Quest not found.' });
        const quest = rows[0];

        const [charRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [charId]);
        const charState = charRow.length ? jp(charRow[0].state_json, {}) : {};

        // Re-check availability
        let regionId = null;
        if (mapId && global.getRegionForMap) {
            const r = await global.getRegionForMap(mapId).catch(() => null);
            if (r) regionId = r.id;
        }
        if (!await isAvailable(quest, charState, regionId))
            return res.json({ success: false, message: 'This quest is no longer available.' });

        const qKey = `board_${quest.id}`;
        if (!charState.quests) charState.quests = {};
        charState.quests[qKey] = { step: 0, started_at: new Date().toISOString() };

        await db.query('UPDATE characters SET state_json=? WHERE id=?',
            [JSON.stringify(charState), charId]);

        res.json({ success: true,
            message: `Quest accepted: ${quest.title}`,
            quest: { id: questId, title: quest.title,
                objectives: jp(quest.objectives_json, []) }
        });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// ── COMPLETE QUEST ────────────────────────────────────────────────
// For now: the server trusts the client's completion claim and
// verifies that the quest was accepted. Objective tracking is done
// client-side via state_json (same system as event_runner quests).
// A future pass can add server-side objective verification.
router.post('/complete', async (req, res) => {
    try {
        const userId = uid(req);
        if (!userId) return res.json({ success: false, message: 'Not logged in.' });

        const { charId, questId } = req.body;
        if (!await verifyOwnership(userId, charId))
            return res.json({ success: false, message: 'Unauthorized.' });

        const [rows] = await db.query('SELECT * FROM game_quest_board WHERE id=?', [questId]);
        if (!rows.length) return res.json({ success: false, message: 'Quest not found.' });
        const quest = rows[0];

        const [charRow] = await db.query('SELECT state_json FROM characters WHERE id=?', [charId]);
        const charState = charRow.length ? jp(charRow[0].state_json, {}) : {};

        const qKey = `board_${quest.id}`;
        const qState = (charState.quests || {})[qKey];
        if (!qState || qState.step === -1)
            return res.json({ success: false, message: 'Quest not active.' });

        // Mark complete
        if (!charState.quests) charState.quests = {};
        charState.quests[qKey] = { step: -1, completed_at: new Date().toISOString() };

        // Grant rewards
        const rewards = jp(quest.rewards_json, {});
        const granted = [];

        if (rewards.xp) {
            await db.query('UPDATE characters SET experience=experience+? WHERE id=?',
                [rewards.xp, charId]);
            granted.push(`${rewards.xp} XP`);
        }
        if (rewards.gold) {
            await db.query('UPDATE users SET currency=currency+? WHERE id=?',
                [rewards.gold, userId]);
            granted.push(`${rewards.gold}g`);
        }
        if (Array.isArray(rewards.items)) {
            for (const it of rewards.items) {
                if (!it.item_id) continue;
                await db.query(`INSERT INTO character_items (character_id,item_id,quantity)
                    VALUES(?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)`,
                    [charId, it.item_id, it.qty || 1]);
                const [ir] = await db.query('SELECT name FROM game_items WHERE id=?', [it.item_id]);
                if (ir.length) granted.push(`${it.qty||1}x ${ir[0].name}`);
            }
        }

        await db.query('UPDATE characters SET state_json=? WHERE id=?',
            [JSON.stringify(charState), charId]);
        await db.query('UPDATE game_quest_board SET times_completed=times_completed+1 WHERE id=?', [questId]);

        res.json({ success: true,
            message: `✅ ${quest.title} complete! Earned: ${granted.join(', ')}`,
            rewards: granted });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
module.exports.init = d => { db = d; };
