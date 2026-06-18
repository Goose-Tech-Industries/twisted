// =============================================================
// routes/rulesetRoutes.js — Admin CRUD for Campaign Rulesets
// =============================================================

const express = require('express');
const router = express.Router();

module.exports = function(db) {
    // Staff-only middleware
    const staffOnly = async (req, res, next) => {
        const userId = req.session?.userId;
        if (!userId) return res.status(401).json({ error: 'Not logged in' });
        const [[user]] = await db.query('SELECT role FROM users WHERE id=?', [userId]);
        if (!user || !['ADMIN', 'GM', 'STAFF', 'OWNER'].includes((user.role || '').toUpperCase())) {
            return res.status(403).json({ error: 'Staff only' });
        }
        next();
    };

    // ── List all rulesets ──
    router.get('/rulesets', staffOnly, async (req, res) => {
        try {
            const [rulesets] = await db.query('SELECT * FROM game_campaign_rulesets ORDER BY name');
            res.json({ rulesets });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Create ruleset ──
    router.post('/rulesets', staffOnly, async (req, res) => {
        try {
            const { name, stat_mode, combat_mode } = req.body;
            const [result] = await db.query(
                'INSERT INTO game_campaign_rulesets (name, stat_mode, combat_mode) VALUES (?,?,?)',
                [name || 'New Ruleset', stat_mode || 'standard', combat_mode || 'turn_based']);
            res.json({ id: result.insertId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Get one ruleset ──
    router.get('/rulesets/:id', staffOnly, async (req, res) => {
        try {
            const [[ruleset]] = await db.query('SELECT * FROM game_campaign_rulesets WHERE id=?', [req.params.id]);
            if (!ruleset) return res.status(404).json({ error: 'Not found' });
            res.json({ ruleset });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Update ruleset (full save: ruleset + windows + modifiers) ──
    router.put('/rulesets/:id', staffOnly, async (req, res) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const { ruleset, windows, modifiers } = req.body;
            const id = req.params.id;

            // Update ruleset
            if (ruleset) {
                await conn.query(
                    `UPDATE game_campaign_rulesets SET
                        name=?, description=?, stat_mode=?, primary_stat_name=?, custom_stats_json=?,
                        combat_mode=?, moves_per_day=?, tiles_per_move=?, move_reset_time=?, move_reset_timezone=?,
                        near_death_enabled=?, near_death_json=?, allow_flying=?, flying_tile_bonus=?,
                        allow_transformation=?, permadeath=?, friendly_fire=?, level_cap=?, xp_curve=?, xp_curve_json=?,
                        is_active=?
                     WHERE id=?`,
                    [
                        ruleset.name, ruleset.description || null,
                        ruleset.stat_mode, ruleset.primary_stat_name || 'Powerlevel',
                        ruleset.custom_stats_json ? JSON.stringify(ruleset.custom_stats_json) : null,
                        ruleset.combat_mode,
                        ruleset.moves_per_day ?? null, ruleset.tiles_per_move || 3,
                        ruleset.move_reset_time || null, ruleset.move_reset_timezone || 'America/New_York',
                        ruleset.near_death_enabled ? 1 : 0,
                        ruleset.near_death_json ? JSON.stringify(ruleset.near_death_json) : null,
                        ruleset.allow_flying ? 1 : 0, ruleset.flying_tile_bonus || 0,
                        ruleset.allow_transformation ? 1 : 0, ruleset.permadeath ? 1 : 0,
                        ruleset.friendly_fire ? 1 : 0, ruleset.level_cap ?? null,
                        ruleset.xp_curve || 'exponential',
                        ruleset.xp_curve_json ? JSON.stringify(ruleset.xp_curve_json) : null,
                        ruleset.is_active ? 1 : 0,
                        id,
                    ]
                );
            }

            // Replace windows
            if (windows) {
                await conn.query('DELETE FROM game_action_windows WHERE ruleset_id=?', [id]);
                for (const w of windows) {
                    await conn.query(
                        `INSERT INTO game_action_windows
                            (ruleset_id, action_type, label, icon, window_type, max_uses_per_day, max_uses_per_window,
                             block_count, block_start_hour, reset_time, reset_timezone, effect_json,
                             min_level, requires_opponent, requires_master, blocked_in_combat, sort_order, is_active)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                        [
                            id, w.action_type, w.label, w.icon || null,
                            w.window_type, w.max_uses_per_day ?? null, w.max_uses_per_window || 1,
                            w.block_count || 4, w.block_start_hour ?? 0,
                            w.reset_time || '00:00', w.reset_timezone || 'America/New_York',
                            w.effect_json ? JSON.stringify(w.effect_json) : null,
                            w.min_level || 0, w.requires_opponent ? 1 : 0, w.requires_master ? 1 : 0,
                            w.blocked_in_combat ? 1 : 0, w.sort_order || 0, w.is_active ? 1 : 0,
                        ]
                    );
                }
            }

            // Replace modifiers
            if (modifiers) {
                await conn.query('DELETE FROM game_ruleset_modifiers WHERE ruleset_id=?', [id]);
                for (const m of modifiers) {
                    await conn.query(
                        `INSERT INTO game_ruleset_modifiers
                            (ruleset_id, target_type, target_name, action_type, stat_key,
                             multiplier, flat_bonus, extra_uses, tiles_per_move_override, custom_json, is_active)
                         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                        [
                            id, m.target_type, m.target_name, m.action_type || null, m.stat_key || null,
                            m.multiplier ?? 1.0, m.flat_bonus || 0, m.extra_uses || 0,
                            m.tiles_per_move_override ?? null,
                            m.custom_json ? JSON.stringify(m.custom_json) : null,
                            m.is_active ? 1 : 0,
                        ]
                    );
                }
            }

            await conn.commit();

            // Clear action-slots cache
            try { require('../server/action-slots').clearCache(parseInt(id)); } catch {}

            res.json({ success: true });
        } catch (e) {
            await conn.rollback();
            res.status(500).json({ error: e.message });
        } finally {
            conn.release();
        }
    });

    // ── Get action windows ──
    router.get('/rulesets/:id/windows', staffOnly, async (req, res) => {
        try {
            const [windows] = await db.query(
                'SELECT * FROM game_action_windows WHERE ruleset_id=? ORDER BY sort_order', [req.params.id]);
            res.json({ windows });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Get modifiers ──
    router.get('/rulesets/:id/modifiers', staffOnly, async (req, res) => {
        try {
            const [modifiers] = await db.query(
                'SELECT * FROM game_ruleset_modifiers WHERE ruleset_id=? ORDER BY target_type, target_name', [req.params.id]);
            res.json({ modifiers });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Delete ruleset ──
    router.delete('/rulesets/:id', staffOnly, async (req, res) => {
        try {
            await db.query('DELETE FROM game_action_windows WHERE ruleset_id=?', [req.params.id]);
            await db.query('DELETE FROM game_ruleset_modifiers WHERE ruleset_id=?', [req.params.id]);
            await db.query('DELETE FROM game_campaign_rulesets WHERE id=?', [req.params.id]);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};
