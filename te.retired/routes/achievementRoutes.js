// =================================================================
// ACHIEVEMENT ROUTES  v1.0
// Mounted at /api/achievements
//
// TEACHING: Achievements have two parts:
//   1. Definitions — stored in game_achievements (editable in AdminSauce)
//   2. Player progress — tracked server-side when trigger events fire
//
// The key design: achievements are NEVER awarded by the client.
// The server checks them at specific trigger points:
//   - After PvP win     → checkForCharacter(charId, 'pvp_wins', newWinCount)
//   - After PvE win     → checkForCharacter(charId, 'pve_wins', newWinCount)
//   - After quest done  → checkForCharacter(charId, 'quests_done', totalDone)
//   - On map change     → checkForCharacter(charId, 'maps_visited', mapsCount)
//   - On login          → checkForCharacter(charId, 'login_streak', streak)
//   - On level up       → checkForCharacter(charId, 'level_reached', newLevel)
//   - On gold change    → checkForCharacter(charId, 'gold_owned', goldAmount)
//
// The check function is exported so battle_engine, questRoutes, and
// server.js can all call it without circular dependencies.
//
// Endpoints:
//   GET  /api/achievements/definitions     — all achievement defs (for AdminSauce)
//   POST /api/achievements/save            — save definition (AdminSauce)
//   GET  /api/achievements/character/:id   — achievements earned by a character
//   POST /api/achievements/equip-title     — equip/unequip a title
//   GET  /api/achievements/leaderboard     — top achievers (count)
// =================================================================

const express = require('express');
const router  = express.Router();
let db, io;
router.init = (database, ioInstance) => { db = database; io = ioInstance; };

// ── CORE CHECK FUNCTION (exported for use by other modules) ────────
// TEACHING: This is the "brain" of the achievement system.
// Other server files call:
//   achievementRoutes.checkForCharacter(db, io, charId, 'pvp_wins', 5)
// and this function handles finding matching achievements and awarding them.
router.checkForCharacter = async function(database, ioInstance, charId, triggerType, currentValue) {
    const _db = database || db;
    const _io = ioInstance || io;
    if (!_db || !charId) return [];
    try {
        // Find all active achievements for this trigger type
        // where trigger_value <= currentValue (threshold met)
        const [defs] = await _db.query(
            `SELECT a.* FROM game_achievements a
             WHERE a.trigger_type = ? AND a.trigger_value <= ? AND a.is_active = 1`,
            [triggerType, currentValue]
        );
        if (!defs.length) return [];

        // Find which ones this character hasn't earned yet
        const defIds = defs.map(d => d.id);
        const placeholders = defIds.map(() => '?').join(',');
        const [already] = await _db.query(
            `SELECT achievement_id FROM character_achievements WHERE character_id = ? AND achievement_id IN (${placeholders})`,
            [charId, ...defIds]
        );
        const earnedSet = new Set(already.map(r => r.achievement_id));

        const newlyEarned = [];
        for (const def of defs) {
            if (earnedSet.has(def.id)) continue; // already have it

            // Award it
            await _db.query(
                'INSERT IGNORE INTO character_achievements (character_id, achievement_id) VALUES (?,?)',
                [charId, def.id]
            );

            // Give reward gold if any
            if (def.reward_gold > 0) {
                const [[ch]] = await _db.query('SELECT user_id FROM characters WHERE id=?', [charId]);
                if (ch) await _db.query('UPDATE users SET currency=currency+? WHERE id=?', [def.reward_gold, ch.user_id]);
            }

            newlyEarned.push(def);

            // Push real-time notification to the player if online
            if (_io) {
                for (const [sid, p] of Object.entries(global._onlinePlayers || {})) {
                    if (p.charId === parseInt(charId)) {
                        _io.to(sid).emit('achievement_earned', {
                            key:       def.key_name,
                            title:     def.title,
                            icon:      def.icon,
                            rewardGold: def.reward_gold,
                            newTitle:  def.reward_title,
                        });

                        // If first achievement with a title, auto-equip it
                        if (def.reward_title) {
                            const [[c2]] = await _db.query('SELECT equipped_title FROM characters WHERE id=?', [charId]);
                            if (!c2?.equipped_title) {
                                await _db.query('UPDATE characters SET equipped_title=? WHERE id=?', [def.reward_title, charId]);
                            }
                        }
                        break;
                    }
                }
            }
        }
        return newlyEarned;
    } catch (e) {
        console.error('[Achievements] checkForCharacter error:', e.message);
        return [];
    }
};

// ── ADMIN: GET ALL DEFINITIONS ────────────────────────────────────
router.get('/definitions', async (req, res) => {
    if (!req.session?.userId) return res.json({ success: false, message: 'Not logged in.' });
    try {
        const [rows] = await db.query('SELECT * FROM game_achievements ORDER BY sort_order, id');
        res.json({ success: true, data: rows });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── ADMIN: SAVE (insert or update) ────────────────────────────────
router.post('/save', async (req, res) => {
    if (!req.session?.userId) return res.json({ success: false, message: 'Not logged in.' });
    const { id, key_name, title, description, icon, category, trigger_type, trigger_value,
            reward_gold, reward_title, is_hidden, is_active, sort_order } = req.body;
    try {
        if (id) {
            await db.query(
                `UPDATE game_achievements SET key_name=?,title=?,description=?,icon=?,category=?,
                 trigger_type=?,trigger_value=?,reward_gold=?,reward_title=?,is_hidden=?,is_active=?,sort_order=?
                 WHERE id=?`,
                [key_name,title,description||'',icon||'🏆',category||'other',
                 trigger_type,trigger_value||1,reward_gold||0,reward_title||null,
                 is_hidden?1:0, is_active?1:0, sort_order||0, id]
            );
        } else {
            await db.query(
                `INSERT INTO game_achievements (key_name,title,description,icon,category,trigger_type,
                 trigger_value,reward_gold,reward_title,is_hidden,is_active,sort_order)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [key_name,title,description||'',icon||'🏆',category||'other',
                 trigger_type,trigger_value||1,reward_gold||0,reward_title||null,
                 is_hidden?1:0, is_active?1:0, sort_order||0]
            );
        }
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── ADMIN: DELETE ─────────────────────────────────────────────────
router.post('/delete', async (req, res) => {
    if (!req.session?.userId) return res.json({ success: false, message: 'Not logged in.' });
    const { id } = req.body;
    if (!id) return res.json({ success: false, message: 'id required.' });
    try {
        await db.query('DELETE FROM game_achievements WHERE id=?', [id]);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── CHARACTER: GET EARNED ACHIEVEMENTS ───────────────────────────
router.get('/character/:charId', async (req, res) => {
    const charId = parseInt(req.params.charId);
    if (!charId) return res.json({ success: false });
    try {
        const [rows] = await db.query(
            `SELECT a.*, ca.earned_at
             FROM character_achievements ca
             JOIN game_achievements a ON a.id = ca.achievement_id
             WHERE ca.character_id = ?
             ORDER BY ca.earned_at DESC`,
            [charId]
        );
        // Also get character's equipped title
        const [[char]] = await db.query('SELECT equipped_title FROM characters WHERE id=?', [charId]);
        res.json({ success: true, data: rows, equippedTitle: char?.equipped_title || null });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── CHARACTER: EQUIP/UNEQUIP TITLE ────────────────────────────────
router.post('/equip-title', async (req, res) => {
    if (!req.session?.userId) return res.json({ success: false, message: 'Not logged in.' });
    const { charId, title } = req.body; // title = null to unequip
    try {
        // Verify ownership
        const [[c]] = await db.query('SELECT id FROM characters WHERE id=? AND user_id=?',
            [charId, req.session.userId]);
        if (!c) return res.json({ success: false, message: 'Not your character.' });

        // Verify they've earned an achievement with this reward_title (if not null)
        if (title) {
            const [[earned]] = await db.query(
                `SELECT ca.id FROM character_achievements ca
                 JOIN game_achievements a ON a.id=ca.achievement_id
                 WHERE ca.character_id=? AND a.reward_title=?`,
                [charId, title]
            );
            if (!earned) return res.json({ success: false, message: 'You haven\'t earned that title.' });
        }

        await db.query('UPDATE characters SET equipped_title=? WHERE id=?', [title || null, charId]);
        res.json({ success: true, title: title || null });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

// ── PUBLIC PROFILE: FULL CHARACTER DATA ──────────────────────────
// GET /api/achievements/profile/:name — used by /profile page
router.get('/profile/:name', async (req, res) => {
    const name = req.params.name;
    try {
        const [[c]] = await db.query(
            `SELECT c.id, c.name, c.level, c.class_id, c.race_id, c.background_id,
                    c.max_hp, c.max_mp, c.atk, c.def, c.mo, c.md, c.speed, c.luck,
                    c.battle_record, c.equipped_title, c.presence_status, c.away_message,
                    c.profile_bio, c.profile_color, c.profile_banner_emoji, c.profile_favorite_quote,
                    c.profile_signature, c.profile_views, c.show_profile_viewers,
                    c.spotify_track_url, c.spotify_track_name, c.spotify_artist_name,
                    c.last_seen_at,
                    gc.name AS class_name, gr.name AS race_name,
                    gb.name AS bg_name, g.name AS guild_name, g.tag AS guild_tag
             FROM characters c
             LEFT JOIN game_classes gc ON gc.id = c.class_id
             LEFT JOIN game_races   gr ON gr.id = c.race_id
             LEFT JOIN game_backgrounds gb ON gb.id = c.background_id
             LEFT JOIN guild_members gm ON gm.character_id = c.id AND gm.status = 'member'
             LEFT JOIN guilds g ON g.id = gm.guild_id
             WHERE c.name = ?`,
            [name]
        );
        if (!c) return res.json({ success: false, message: 'Character not found.' });

        // Increment view counter (fire-and-forget, non-blocking)
        db.query('UPDATE characters SET profile_views=profile_views+1 WHERE id=?', [c.id]).catch(()=>{});

        // ── Viewer-aware enrichments ──────────────────────────────────
        // Who is viewing? Grab from session (null if not logged in).
        // TEACHING: The profile page is public, so we allow anonymous
        // viewing — but logged-in players get extra social context:
        // "You are friends", viewer tracking, etc.
        const viewerUserId = req.session?.userId || null;
        let viewerCharId   = null;
        let isFriend       = false;
        let isOwnProfile   = false;

        if (viewerUserId) {
            const [[vChar]] = await db.query(
                'SELECT id, name, profile_color, equipped_title FROM characters WHERE user_id=? ORDER BY id DESC LIMIT 1',
                [viewerUserId]
            );
            if (vChar) {
                viewerCharId = vChar.id;
                isOwnProfile = viewerCharId === c.id;

                if (!isOwnProfile) {
                    // Check mutual friendship (accepted in either direction)
                    const [[friendRow]] = await db.query(
                        `SELECT id FROM character_friends
                         WHERE status='accepted'
                         AND ((requester_id=? AND recipient_id=?) OR (requester_id=? AND recipient_id=?))
                         LIMIT 1`,
                        [viewerCharId, c.id, c.id, viewerCharId]
                    );
                    isFriend = !!friendRow;

                    // Record profile view if show_profile_viewers is on for this profile
                    if (c.show_profile_viewers) {
                        db.query(
                            `INSERT INTO profile_viewers
                                (profile_char_id, viewer_char_id, viewer_name, viewer_color, viewer_title)
                             VALUES (?,?,?,?,?)
                             ON DUPLICATE KEY UPDATE
                                viewer_name=VALUES(viewer_name),
                                viewer_color=VALUES(viewer_color),
                                viewer_title=VALUES(viewer_title),
                                viewed_at=CURRENT_TIMESTAMP`,
                            [c.id, vChar.id, vChar.name, vChar.profile_color||null, vChar.equipped_title||null]
                        ).catch(()=>{});
                    }
                }
            }
        }

        // Friend count (accepted friendships in either direction)
        const [[friendCountRow]] = await db.query(
            `SELECT COUNT(*) AS cnt FROM character_friends
             WHERE status='accepted' AND (requester_id=? OR recipient_id=?)`,
            [c.id, c.id]
        );
        const friendCount = friendCountRow?.cnt || 0;

        // Profile viewers list (only returned to the profile owner)
        let profileViewers = [];
        if (isOwnProfile && c.show_profile_viewers) {
            const [viewers] = await db.query(
                `SELECT viewer_char_id, viewer_name, viewer_color, viewer_title, viewed_at
                 FROM profile_viewers
                 WHERE profile_char_id=? AND viewed_at > NOW() - INTERVAL 30 DAY
                 ORDER BY viewed_at DESC LIMIT 50`,
                [c.id]
            );
            profileViewers = viewers;
        }

        // Top friends
        const [topFriends] = await db.query(
            `SELECT tf.slot, ch.id AS charId, ch.name, ch.level, ch.equipped_title,
                    ch.profile_color, ch.presence_status, gc.name AS class_name
             FROM character_top_friends tf
             JOIN characters ch ON ch.id = tf.friend_char_id
             JOIN game_classes gc ON gc.id = ch.class_id
             WHERE tf.character_id = ?
             ORDER BY tf.slot ASC`,
            [c.id]
        );

        // Equipment
        const [equip] = await db.query(
            `SELECT ce.slot_key, gi.name, gi.icon, gi.rarity FROM character_equipment ce
             JOIN game_items gi ON ce.item_id = gi.id WHERE ce.character_id=?`,
            [c.id]
        );

        // Achievements
        const [achiev] = await db.query(
            `SELECT a.title, a.icon, a.category, a.description, ca.earned_at
             FROM character_achievements ca
             JOIN game_achievements a ON a.id=ca.achievement_id
             WHERE ca.character_id=? AND a.is_hidden=0
             ORDER BY ca.earned_at DESC`,
            [c.id]
        );

        // Battle record
        let battleRecord = { W:0, L:0, T:0 };
        try { battleRecord = typeof c.battle_record === 'object' ? c.battle_record : JSON.parse(c.battle_record || '{}'); } catch {}

        // Remove sensitive fields
        delete c.user_id; delete c.state_json; delete c.status_effects;

        // Expose user's own invite code + referral stats if viewing own profile
        let inviteCode   = null;
        let referralStats = null;
        if (isOwnProfile && viewerUserId) {
            const [[uRow]] = await db.query(
                'SELECT invite_code, referred_by FROM users WHERE id=?',
                [viewerUserId]
            );
            inviteCode = uRow?.invite_code || null;

            // Referral stats: who this user has referred, and whether payouts have landed
            // We join users (referred_by = viewerUserId) with their characters for display
            const [referredUsers] = await db.query(
                `SELECT u.id AS user_id, u.referral_paid,
                        c.name AS char_name, c.level
                 FROM users u
                 LEFT JOIN characters c ON c.user_id = u.id
                    AND c.id = (SELECT id FROM characters WHERE user_id = u.id ORDER BY level DESC LIMIT 1)
                 WHERE u.referred_by = ?
                 ORDER BY u.id DESC
                 LIMIT 50`,
                [viewerUserId]
            );
            referralStats = {
                totalReferred: referredUsers.length,
                paidCount:     referredUsers.filter(r => r.referral_paid).length,
                referrals:     referredUsers.map(r => ({
                    charName:     r.char_name || '(no character)',
                    level:        r.level || 0,
                    rewardPaid:   !!r.referral_paid,
                })),
            };
        }

        res.json({
            success: true,
            character: c,
            topFriends,
            equipment: equip,
            achievements: achiev,
            battleRecord,
            // Social context
            isFriend,
            isOwnProfile,
            friendCount,
            profileViewers,
            inviteCode,      // only set when viewing own profile
            referralStats,   // only set when viewing own profile
            viewerCharId,
        });
    } catch (e) {
        res.json({ success: false, message: e.message });
    }
});

module.exports = router;
