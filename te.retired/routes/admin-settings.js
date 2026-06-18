// =================================================================
// ADMIN PANEL — Settings & Dashboard Sub-Router
// Dashboard stats, economy, event log, battle config, GM notes,
// lore bible, live social, map connections/versioning/import/export,
// settings import/export, server settings, system health, role sections,
// activity log, setup wizard, asset usage, templates, reset tools
// =================================================================
const express = require('express');
const router  = express.Router();
let db, io;

router.init = (database, ioInstance) => { db = database; io = ioInstance; };

// ── Auth ──────────────────────────────────────────────────────────
async function requireStaff(req, res, next) {
    const userId = req.session && req.session.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Login required' });
    const [rows] = await db.query('SELECT role FROM users WHERE id=? LIMIT 1', [userId]);
    if (!rows.length) return res.status(401).json({ success: false, message: 'User not found' });
    const role = rows[0].role;
    if (!['ADMIN','GM','MOD','STAFF','OWNER'].includes(role))
        return res.status(403).json({ success: false, message: 'Staff only' });
    req.staffRole = role;
    next();
}

// ── Helpers ───────────────────────────────────────────────────────
function tryCount(db, sql, params = []) {
    return db.query(sql, params)
        .then(([r]) => (r[0] ? (r[0].n || r[0].c || 0) : 0))
        .catch(() => null);
}

async function logEvent(type, actorId, actorName, targetId, targetName, detail = {}, mapId = null) {
    try {
        await db.query(
            `INSERT INTO game_event_log (event_type,actor_id,actor_name,target_id,target_name,detail_json,map_id)
             VALUES (?,?,?,?,?,?,?)`,
            [type, actorId||null, actorName||null, targetId||null, targetName||null,
             JSON.stringify(detail), mapId||null]
        );
    } catch(e) { /* non-fatal */ }
}

// =================================================================
// DASHBOARD STATS
// =================================================================
router.get('/dashboard', requireStaff, async (req, res) => {
    try {
        // Counts that are always safe
        const [users, chars, maps, npcs, items, battles] = await Promise.all([
            tryCount(db, 'SELECT COUNT(*) AS n FROM users'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM characters'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_maps WHERE is_active=1'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_npcs'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM game_items'),
            tryCount(db, 'SELECT COUNT(*) AS n FROM active_battles').catch(() => null),
        ]);

        // Top maps by population (online players)
        const onlineList = global._onlinePlayers
            ? Object.values(global._onlinePlayers)
            : [];
        const mapPop = {};
        for (const p of onlineList) mapPop[p.mapId] = (mapPop[p.mapId] || 0) + 1;

        // Resolve map names for online player list
        const mapIds = [...new Set(onlineList.map(p => p.mapId).filter(Boolean))];
        let mapNameMap = {};
        if (mapIds.length) {
            const [mapRows] = await db.query(
                'SELECT id, name FROM game_maps WHERE id IN (' + mapIds.map(()=>'?').join(',') + ')', mapIds
            ).catch(() => [[]]);
            for (const m of mapRows) mapNameMap[m.id] = m.name;
        }
        const onlineListFull = onlineList.map(p => ({ ...p, mapName: mapNameMap[p.mapId] || null }));

        // AI provider status
        let aiProvider = 'disabled';
        try {
            const [[aiRow]] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='ai_provider' LIMIT 1");
            if (aiRow) aiProvider = aiRow.setting_value || 'disabled';
        } catch {}

        // Recent registrations (last 7 days)
        const [recentUsers] = await db.query(
            `SELECT id, username, role, created_at, last_login, is_banned
             FROM users ORDER BY created_at DESC LIMIT 10`).catch(() => [[]]);

        // Top characters by level
        const [topChars] = await db.query(
            `SELECT c.name, c.level, c.experience, u.username
             FROM characters c JOIN users u ON u.id=c.user_id
             ORDER BY c.level DESC, c.experience DESC LIMIT 5`).catch(() => [[]]);

        // Gold in world
        const [goldRow] = await db.query('SELECT SUM(currency) AS total FROM users').catch(() => [[{total:0}]]);
        const totalGold = goldRow[0]?.total || 0;

        // ── Extra analytics ──────────────────────────────────────────
        // New registrations per day for the last 7 days (signup trend)
        const [signupTrend] = await db.query(
            `SELECT DATE(created_at) AS day, COUNT(*) AS n
             FROM users
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(created_at)
             ORDER BY day ASC`
        ).catch(() => [[]])

        // Average login streak across active players (logged in last 7 days)
        const [streakRow] = await db.query(
            `SELECT ROUND(AVG(login_streak),1) AS avg_streak,
                    MAX(login_streak)           AS max_streak,
                    COUNT(*)                    AS streak_players
             FROM users
             WHERE last_login >= NOW() - INTERVAL 7 DAY
               AND login_streak > 0`
        ).catch(() => [[{avg_streak:0, max_streak:0, streak_players:0}]]);
        const streakStats = streakRow[0] || { avg_streak: 0, max_streak: 0, streak_players: 0 };

        // Open reports count (if table exists)
        const openReports = await tryCount(
            db, "SELECT COUNT(*) AS n FROM player_reports WHERE status='open'"
        ).catch(() => null);

        // Total battles today
        const battlesToday = await tryCount(
            db, "SELECT COUNT(*) AS n FROM game_battles WHERE created_at >= CURDATE()"
        ).catch(() => null);

        // Tutorial completion rate (characters with tutorial_done flag set)
        const [tutRow] = await db.query(
            `SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN state_json LIKE '%"tutorial_done":true%' THEN 1 ELSE 0 END) AS done
             FROM characters`
        ).catch(() => [[{total:1, done:0}]]);
        const tutStats = tutRow[0] || { total: 1, done: 0 };
        const tutorialRate = tutStats.total > 0
            ? Math.round((tutStats.done / tutStats.total) * 100)
            : 0;

        res.json({
            success: true,
            stats: { users, chars, maps, npcs, items, battles },
            online: onlineListFull.length,
            onlineList: onlineListFull,
            aiProvider,
            mapPop,
            recentUsers,
            topChars,
            totalGold,
            signupTrend,
            streakStats,
            openReports,
            battlesToday,
            tutorialRate
        });
    } catch (e) {
        console.error('[AdminPanel] dashboard error:', e);
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// ECONOMY DASHBOARD
// =================================================================
router.get('/economy', requireStaff, async (req, res) => {
    try {
        // Total gold in circulation
        const [[goldRow]]   = await db.query('SELECT SUM(currency) AS total, AVG(currency) AS avg, MAX(currency) AS max FROM users');
        // Starting gold from config
        let startingGold = 100;
        try {
            for (const tbl of ['game_settings','system_settings','settings']) {
                const [sr] = await db.query('SHOW TABLES LIKE ?', [tbl]);
                if (!sr.length) continue;
                const [cr] = await db.query('SHOW COLUMNS FROM ??', [tbl]);
                const cols = cr.map(c => c.Field);
                const kc = cols.find(n => /key|name/i.test(n));
                const vc = cols.find(n => /val|value/i.test(n));
                if (!kc || !vc) continue;
                const [sv] = await db.query('SELECT ?? AS v FROM ?? WHERE ?? = ?', [vc, tbl, kc, 'starting_gold']);
                if (sv.length) { startingGold = parseInt(sv[0].v) || 100; break; }
            }
        } catch {}

        // Richest players
        const [richest] = await db.query(
            `SELECT u.id, u.username, u.currency AS gold, u.role,
                    COUNT(c.id) AS char_count
             FROM users u LEFT JOIN characters c ON c.user_id=u.id
             GROUP BY u.id ORDER BY u.currency DESC LIMIT 15`);

        // Gold distribution buckets
        const [dist] = await db.query(`
            SELECT
                SUM(currency = 0)                     AS broke,
                SUM(currency BETWEEN 1 AND 100)       AS poor,
                SUM(currency BETWEEN 101 AND 500)     AS modest,
                SUM(currency BETWEEN 501 AND 2000)    AS comfortable,
                SUM(currency BETWEEN 2001 AND 10000)  AS wealthy,
                SUM(currency > 10000)                 AS rich,
                COUNT(*)                              AS total_users
            FROM users`);

        // Battle gold stats from level table
        const [lvlGold] = await db.query(
            'SELECT level, gold_for_win FROM level_requirements ORDER BY level'
        ).catch(() => db.query('SELECT level, gold_for_win FROM game_levels ORDER BY level').catch(() => [[]]));

        // Recent gold events from event log
        const [goldEvents] = await db.query(
            `SELECT * FROM game_event_log
             WHERE event_type IN ('gm_give_gold','battle_end')
             ORDER BY created_at DESC LIMIT 20`
        ).catch(() => [[]]);

        // Total accounts
        const [[userCount]] = await db.query('SELECT COUNT(*) AS n FROM users');
        const theoreticalStartingGold = (userCount.n || 0) * startingGold;

        res.json({
            success: true,
            data: {
                totalGold:   goldRow.total || 0,
                avgGold:     Math.round(goldRow.avg || 0),
                maxGold:     goldRow.max || 0,
                startingGold,
                theoreticalStartingGold,
                richest,
                distribution: dist[0],
                levelGoldTable: lvlGold,
                recentGoldEvents: goldEvents
            }
        });
    } catch(e) {
        console.error('[Economy]', e);
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// EVENT LOG
// =================================================================
router.get('/event-log', requireStaff, async (req, res) => {
    const { type, actorName, limit: lim } = req.query;
    const limit = Math.min(parseInt(lim) || 100, 500);
    try {
        let sql = 'SELECT * FROM game_event_log';
        const params = [], where = [];
        if (type)      { where.push('event_type = ?');     params.push(type); }
        if (actorName) { where.push('actor_name LIKE ?');  params.push(`%${actorName}%`); }
        if (where.length) sql += ' WHERE ' + where.join(' AND ');
        sql += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch(e) {
        // Table might not exist yet
        if (e.code === 'ER_NO_SUCH_TABLE') return res.json({ success: true, data: [], note: 'Run migration to create game_event_log table.' });
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// BATTLE CONFIG MEGA-PANEL
// =================================================================
router.get('/battle-config', requireStaff, async (req, res) => {
    try {
        // Load all system_settings
        const [settings] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const settingsMap = {};
        for (const s of settings) settingsMap[s.setting_key] = s.setting_value;

        // Load terminology
        const [terms] = await db.query('SELECT * FROM game_terminology ORDER BY category, term_key');

        // Organize settings into categories with metadata
        const categories = {
            core_combat: {
                label: 'Core Combat', icon: '⚔️',
                settings: [
                    { key: 'enable_limb_targeting', type: 'toggle', label: 'Limb Targeting & Called Shots', desc: 'Target specific body parts for tactical damage.', termKey: 'limb_targeting' },
                    { key: 'enable_called_shot_penalty', type: 'toggle', label: 'Called Shot Penalty', desc: 'Targeting limbs has an accuracy penalty.' },
                    { key: 'called_shot_penalty_head', type: 'percent', label: 'Called Shot Penalty (Head)', desc: 'Accuracy penalty for head shots.' },
                    { key: 'called_shot_penalty_arms', type: 'percent', label: 'Called Shot Penalty (Arms)', desc: 'Accuracy penalty for arm shots.' },
                    { key: 'called_shot_penalty_legs', type: 'percent', label: 'Called Shot Penalty (Legs)', desc: 'Accuracy penalty for leg shots.' },
                    { key: 'limb_bleed_through_default', type: 'percent', label: 'Limb Bleed-Through', desc: 'Fraction of limb damage that hits main HP.' },
                    { key: 'enable_active_defense', type: 'toggle', label: 'Dodge, Block & Counter', desc: 'Dodge/Block/Counter on incoming attacks.', termKey: 'active_defense' },
                    { key: 'defense_prompt_timeout_ms', type: 'number', label: 'Defense Prompt Timeout (ms)', desc: 'How long players have to choose a defense action (10000 = 10 seconds).' },
                    { key: 'dodge_base_chance', type: 'percent', label: 'Dodge Base Chance', desc: 'Base probability to dodge (0.15 = 15%).' },
                    { key: 'dodge_speed_factor', type: 'percent', label: 'Dodge Speed Factor', desc: 'Dodge bonus per 2x speed advantage.' },
                    { key: 'dodge_max_chance', type: 'percent', label: 'Dodge Max Chance', desc: 'Maximum dodge probability cap.' },
                    { key: 'block_die_sides', type: 'number', label: 'Block Die Sides', desc: 'Sides on the block die (Mado: 6).' },
                    { key: 'block_one_arm_reduction', type: 'percent', label: 'Block One Arm Reduction', desc: 'Damage reduction for one-arm block.' },
                    { key: 'block_two_arm_reduction', type: 'percent', label: 'Block Two Arm Reduction', desc: 'Damage reduction for two-arm block.' },
                    { key: 'block_stun_die_sides', type: 'number', label: 'Block Die (Stunned)', desc: 'Die sides when stunned (harder to block).' },
                    { key: 'counter_base_chance', type: 'percent', label: 'Counter Base Chance', desc: 'Base counter-attack probability.' },
                    { key: 'counter_charge_bonus', type: 'percent', label: 'Counter Charge Bonus', desc: 'Extra chance if already charging.' },
                    { key: 'counter_max_chance', type: 'percent', label: 'Counter Max Chance', desc: 'Maximum counter probability cap.' },
                    { key: 'enable_nonlethal', type: 'toggle', label: 'Knockout & Mercy', desc: 'Knockout instead of kill.', termKey: 'nonlethal' },
                    { key: 'ko_interrogate_base_chance', type: 'percent', label: 'Interrogation Success Chance', desc: 'Base chance to extract info from a KO\'d enemy.' },
                    { key: 'nonlethal_rep_bonus_release', type: 'number', label: 'Rep Bonus (Release)', desc: 'Reputation gained for releasing a KO\'d enemy.' },
                    { key: 'nonlethal_rep_penalty_finish', type: 'number', label: 'Rep Penalty (Finish Off)', desc: 'Reputation lost for finishing off a KO\'d enemy.' },
                    { key: 'enable_wound_degradation', type: 'toggle', label: 'Wound Penalties', desc: 'Stats degrade as limbs take damage.', termKey: 'wound_system' },
                    { key: 'wound_threshold_light', type: 'percent', label: 'Light Wound Threshold', desc: 'Below this limb HP % = light wound.' },
                    { key: 'wound_threshold_heavy', type: 'percent', label: 'Heavy Wound Threshold', desc: 'Below this limb HP % = heavy wound.' },
                    { key: 'wound_threshold_disable', type: 'percent', label: 'Disable Threshold', desc: 'Below this limb HP % = limb disabled (0 = at zero HP).' },
                    { key: 'enable_diminishing_returns', type: 'toggle', label: 'Repetition Penalty', desc: 'Repeating the same attack gives opponent dodge bonus.' },
                    { key: 'diminishing_returns_per_repeat', type: 'percent', label: 'Dodge Bonus per Repeat', desc: 'Dodge bonus opponent gains per repeated attack (0.05 = +5%).' },
                    { key: 'diminishing_returns_max', type: 'percent', label: 'Max Accumulated Penalty', desc: 'Maximum dodge bonus from repetition (0.15 = +15% cap).' },
                ]
            },
            loot_rewards: {
                label: 'Loot & Rewards', icon: '💰',
                settings: [
                    { key: 'enable_steal', type: 'toggle', label: 'Steal Action', desc: 'Mid-battle steal command.' },
                    { key: 'steal_base_chance', type: 'number', label: 'Steal Base Chance (%)', desc: 'Base success chance before luck/speed bonuses (default 50).' },
                    { key: 'steal_rare_chance', type: 'percent', label: 'Rare Steal Chance', desc: 'Chance to get rare pool item instead of common (0.20 = 20%).' },
                    { key: 'enable_overkill_bonus', type: 'toggle', label: 'Overkill Bonus', desc: 'Excess damage on killing blow boosts rewards.' },
                    { key: 'overkill_threshold_small', type: 'number', label: 'Overkill Small Threshold', desc: 'Excess damage for small bonus.' },
                    { key: 'overkill_mult_small', type: 'number', label: 'Overkill Small Multiplier', desc: 'XP/drop multiplier for small overkill.' },
                    { key: 'overkill_threshold_medium', type: 'number', label: 'Overkill Medium Threshold', desc: 'Excess damage for medium bonus.' },
                    { key: 'overkill_mult_medium', type: 'number', label: 'Overkill Medium Multiplier', desc: 'XP/drop multiplier for medium overkill.' },
                    { key: 'overkill_threshold_large', type: 'number', label: 'Overkill Large Threshold', desc: 'Excess damage for large bonus.' },
                    { key: 'overkill_mult_large', type: 'number', label: 'Overkill Large Multiplier', desc: 'XP/drop multiplier for large overkill.' },
                    { key: 'enable_battle_chain', type: 'toggle', label: 'Battle Chain Bonus', desc: 'Consecutive fights boost rewards.' },
                    { key: 'chain_xp_bonus', type: 'percent', label: 'Chain XP Bonus per Fight', desc: 'XP multiplier added per chain fight (0.05 = +5%).' },
                    { key: 'chain_drop_bonus', type: 'percent', label: 'Chain Drop Bonus per Fight', desc: 'Drop rate bonus per chain fight (0.10 = +10%).' },
                    { key: 'chain_max_bonus', type: 'percent', label: 'Chain Max Bonus', desc: 'Maximum chain multiplier cap (0.50 = +50%).' },
                    { key: 'enable_battle_rating', type: 'toggle', label: 'Battle Performance Rating', desc: 'S/A/B/C/D rank affects rewards.' },
                    { key: 'rating_target_turns', type: 'number', label: 'Target Turns for S-Rank', desc: 'Finish in this many turns or fewer for best score.' },
                    { key: 'rating_s_xp_mult', type: 'number', label: 'S-Rank XP Multiplier', desc: 'XP multiplier for S rank (1.50 = +50%).' },
                    { key: 'rating_s_gold_mult', type: 'number', label: 'S-Rank Gold Multiplier', desc: 'Gold multiplier for S rank.' },
                    { key: 'rating_a_xp_mult', type: 'number', label: 'A-Rank XP Multiplier', desc: 'XP multiplier for A rank.' },
                    { key: 'rating_a_gold_mult', type: 'number', label: 'A-Rank Gold Multiplier', desc: 'Gold multiplier for A rank.' },
                ]
            },
            buff_system: {
                label: 'Buff & Status Rules', icon: '✨',
                settings: [
                    { key: 'enable_buff_stacking', type: 'toggle', label: 'Buff Stacking', desc: 'Same status can stack for compounding effects.' },
                    { key: 'default_stack_mode', type: 'select', label: 'Default Stack Mode', desc: 'How duplicate statuses behave.', options: ['refresh', 'stack', 'overwrite', 'ignore'] },
                    { key: 'default_max_stacks', type: 'number', label: 'Default Max Stacks', desc: 'Maximum times a status can stack (default 5).' },
                    { key: 'enable_cleanse', type: 'toggle', label: 'Cleanse (Remove Debuffs)', desc: 'Skills/items can remove debuffs from allies.' },
                    { key: 'enable_dispel', type: 'toggle', label: 'Dispel (Remove Buffs)', desc: 'Strip buffs from enemies.' },
                    { key: 'enable_status_immunity', type: 'toggle', label: 'Immunity Windows', desc: 'Temporary immunity after status removal.' },
                    { key: 'cleanse_immunity_duration', type: 'number', label: 'Immunity Duration (turns)', desc: 'Turns of immunity after a status is cleansed.' },
                ]
            },
            defensive: {
                label: 'Defensive Systems', icon: '🛡️',
                settings: [
                    { key: 'enable_cover_system', type: 'toggle', label: 'Provoke & Cover', desc: 'Tank intercepts damage meant for an ally.' },
                    { key: 'cover_duration', type: 'number', label: 'Cover Duration (turns)', desc: 'How many turns cover protection lasts.' },
                    { key: 'cover_damage_split', type: 'percent', label: 'Cover Damage Split', desc: 'Fraction of damage the coverer takes (1.0 = all, 0.5 = split 50/50).' },
                    { key: 'enable_barriers', type: 'toggle', label: 'Absorption Barriers', desc: 'Temporary shield HP that absorbs damage before real HP.' },
                ]
            },
            grid_positioning: {
                label: 'Grid & Positioning', icon: '🗺️',
                settings: [
                    { key: 'enable_elevation', type: 'toggle', label: 'Elevation & Height Advantage', desc: 'Tiles have height levels that affect damage and accuracy.' },
                    { key: 'elevation_height_bonus', type: 'percent', label: 'Height Bonus per Level', desc: 'Damage bonus per elevation level advantage (0.15 = +15%).' },
                    { key: 'enable_difficult_terrain', type: 'toggle', label: 'Difficult Terrain', desc: 'Mud, water, ice etc. cost extra movement.' },
                    { key: 'difficult_terrain_cost', type: 'number', label: 'Difficult Terrain Move Cost', desc: 'Movement points to cross difficult terrain (default 2).' },
                    { key: 'enable_opportunity_attacks', type: 'toggle', label: 'Opportunity Attacks', desc: 'Free attack when enemy leaves melee range.' },
                    { key: 'opportunity_attack_damage_pct', type: 'percent', label: 'Opportunity Attack Damage %', desc: 'Damage as fraction of normal attack (0.50 = 50%).' },
                    { key: 'enable_zone_of_control', type: 'toggle', label: 'Zone of Control', desc: 'Melee fighters threaten adjacent tiles.' },
                    { key: 'enable_aoe_shapes', type: 'toggle', label: 'AoE Targeting Shapes', desc: 'Line, cone, cross, ring AoE shapes for abilities.' },
                    { key: 'grid_width', type: 'number', label: 'Grid Width', desc: 'Battle grid width in tiles (default 8).' },
                    { key: 'grid_height', type: 'number', label: 'Grid Height', desc: 'Battle grid height in tiles (default 5).' },
                ]
            },
            damage_status: {
                label: 'Damage & Status', icon: '🩸',
                settings: [
                    { key: 'enable_bleed_tiers', type: 'toggle', label: 'Bleeding & Wound Severity', desc: 'Light/Moderate/Heavy bleeding over time.' },
                    { key: 'enable_stagger_system', type: 'toggle', label: 'Stagger & Poise', desc: 'Hits build stagger; full meter = vulnerable.' },
                    { key: 'stagger_base_increase', type: 'number', label: 'Stagger per Hit', desc: 'Base stagger meter increase per attack.' },
                    { key: 'stagger_decay_per_turn', type: 'number', label: 'Stagger Decay per Turn', desc: 'How much stagger meter decays each turn.' },
                    { key: 'enable_break_shield', type: 'toggle', label: 'Shield Break', desc: 'Break enemy shields for stun + bonus damage.' },
                    { key: 'break_stun_turns', type: 'number', label: 'Break Stun Duration', desc: 'Turns stunned after shield break.' },
                    { key: 'break_damage_bonus', type: 'percent', label: 'Break Damage Bonus', desc: 'Extra damage dealt to broken enemies (0.50 = +50%).' },
                    { key: 'enable_elemental_reactions', type: 'toggle', label: 'Elemental Reactions', desc: 'Combining elements triggers bonus effects.' },
                    { key: 'enable_status_combos', type: 'toggle', label: 'Status Effect Combos', desc: 'Overlapping statuses trigger combo effects.' },
                    { key: 'enable_weather_effects', type: 'toggle', label: 'Weather & Environment', desc: 'Rain, storm, fog affect combat.', termKey: 'weather' },
                    { key: 'ki_ranged_dodge_bonus', type: 'percent', label: 'Ranged/Magic Dodge Bonus', desc: 'Extra dodge vs ranged/magic attacks.' },
                    { key: 'enemy_scaling_factor', type: 'number', label: 'Enemy Scaling Factor', desc: 'Enemy stat scaling per extra party member (0.3 = +30%).' },
                    { key: 'base_crit_chance', type: 'number', label: 'Base Crit Chance', desc: 'Base critical hit chance (added to luck). Default 5.' },
                    { key: 'crit_damage_multiplier', type: 'number', label: 'Crit Damage Multiplier', desc: 'Damage multiplier on critical hit (1.5 = 150%).' },
                    { key: 'damage_cap', type: 'number', label: 'Damage Cap', desc: 'Maximum damage per hit (0 = no cap). Prevents one-shots.' },
                ]
            },
            turn_systems: {
                label: 'Turn & Action Systems', icon: '⏱️',
                settings: [
                    { key: 'enable_one_more', type: 'toggle', label: 'One More (Weakness Exploit)', desc: 'Hitting a weakness grants an extra turn.' },
                    { key: 'enable_turn_manipulation', type: 'toggle', label: 'Turn Order Manipulation', desc: 'Abilities can delay enemy or advance ally turns.' },
                    { key: 'enable_action_commands', type: 'toggle', label: 'Action Commands', desc: 'Timed button presses for bonus damage.' },
                    { key: 'enable_combo_input', type: 'toggle', label: 'Multi-Hit Combo Input', desc: 'Chain rapid inputs for multiple smaller hits.' },
                    { key: 'combo_ap_regen_per_turn', type: 'number', label: 'Combo AP Regen per Turn', desc: 'Action points regenerated each turn for combo input.' },
                    { key: 'combo_individual_hit_damage', type: 'percent', label: 'Combo Hit Damage', desc: 'Damage multiplier per individual combo hit (0.5 = 50% of normal).' },
                    { key: 'enable_weapon_triangle', type: 'toggle', label: 'Weapon Triangle', desc: 'Rock-paper-scissors weapon type advantages.' },
                    { key: 'enable_advantage_system', type: 'toggle', label: 'Advantage & Disadvantage', desc: 'Roll twice, take best/worst based on positioning.' },
                    { key: 'enable_threat_system', type: 'toggle', label: 'Threat & Aggro', desc: 'Enemies target highest-threat fighter.' },
                    { key: 'threat_damage_multiplier', type: 'percent', label: 'Threat per Damage', desc: 'Threat generated per point of damage dealt.' },
                    { key: 'threat_heal_multiplier', type: 'percent', label: 'Threat per Heal', desc: 'Threat generated per point healed.' },
                ]
            },
            rp_system: {
                label: 'RP & Narration', icon: '🎭',
                settings: [
                    { key: 'enable_rp_descriptions', type: 'toggle', label: 'RP Attack Descriptions', desc: 'Players describe attacks for damage bonus.', termKey: 'flavor_text' },
                    { key: 'rp_desc_max_bonus', type: 'percent', label: 'Max RP Description Bonus', desc: 'Maximum damage bonus from descriptions.' },
                    { key: 'rp_desc_short_bonus', type: 'percent', label: 'Short Description Bonus', desc: 'Bonus for 20+ char descriptions.' },
                    { key: 'rp_desc_detailed_bonus', type: 'percent', label: 'Detailed Description Bonus', desc: 'Bonus for 50+ char descriptions.' },
                    { key: 'rp_desc_context_bonus', type: 'percent', label: 'Context-Aware Bonus', desc: 'Extra bonus per battlefield reference.' },
                    { key: 'enable_flavor_text', type: 'toggle', label: 'Flavor Text Templates', desc: 'Pre-built flavor texts with keyword matching.' },
                    { key: 'flavor_text_min_length', type: 'number', label: 'Min Text Length', desc: 'Minimum characters for flavor text to count.' },
                    { key: 'flavor_text_max_bonus', type: 'percent', label: 'Max Flavor Bonus', desc: 'Maximum damage bonus from flavor text.' },
                    { key: 'flavor_text_base_bonus', type: 'percent', label: 'Base Flavor Bonus', desc: 'Base bonus for any qualifying flavor text.' },
                    { key: 'flavor_text_keyword_bonus', type: 'percent', label: 'Per-Keyword Bonus', desc: 'Extra bonus per matching keyword.' },
                    { key: 'flavor_text_keyword_max', type: 'number', label: 'Max Keywords Counted', desc: 'Maximum keywords that give bonus per text.' },
                    { key: 'enable_battle_narration', type: 'toggle', label: 'Auto DM Narration', desc: 'Auto-generated combat descriptions.', termKey: 'narration' },
                    { key: 'enable_rp_commands', type: 'toggle', label: 'Social Combat', desc: 'Taunt, Intimidate, Rally.', termKey: 'rp_commands' },
                ]
            },
            ki_magic: {
                label: 'Ki & Magic', icon: '🔥',
                settings: [
                    { key: 'enable_ki_channeling', type: 'toggle', label: 'Power Surge (Ki Channel)', desc: 'Surge to full power temporarily.', termKey: 'channel_ki' },
                    { key: 'ki_channel_duration', type: 'number', label: 'Surge Duration (turns)', desc: 'How many turns the power surge lasts.' },
                    { key: 'ki_channel_crash_pct', type: 'percent', label: 'Crash HP %', desc: 'HP drops to this fraction after surge ends.' },
                    { key: 'ki_channel_uses_per_battle', type: 'number', label: 'Uses per Battle', desc: 'How many times ki channel can be used per fight.' },
                    { key: 'enable_spell_slots', type: 'toggle', label: 'Ability Charges (Spell Slots)', desc: 'Limited-use ability charges.', termKey: 'spell_slots' },
                    { key: 'spell_slots_refresh_on', type: 'select', label: 'Slots Refresh On', desc: 'When spell slots regenerate.', options: ['rest', 'battle_end', 'dawn'] },
                    { key: 'enable_summons', type: 'toggle', label: 'Summoning', desc: 'Call creatures via rare Oghams.', termKey: 'summon' },
                    { key: 'max_summons_per_player', type: 'number', label: 'Max Summons per Player', desc: 'Maximum active summons at once.' },
                    { key: 'summon_cost_type', type: 'select', label: 'Summon Cost Type', desc: 'How summons are paid for.', options: ['mp', 'spell_slot'] },
                    { key: 'summon_mp_cost_pct', type: 'percent', label: 'Summon MP Cost %', desc: 'Fraction of max MP to summon (0.20 = 20%).' },
                    { key: 'summon_base_duration', type: 'number', label: 'Summon Duration (turns)', desc: 'How many turns a summon stays active.' },
                ]
            },
            progression: {
                label: 'Progression & Styles', icon: '🥋',
                settings: [
                    { key: 'enable_signature_techs', type: 'toggle', label: 'Signature Techniques', desc: 'Player-created skills from RP.', termKey: 'sig_tech' },
                    { key: 'sig_tech_require_unlock', type: 'toggle', label: 'Require Master for Sig Tech', desc: 'Must train under a master first.' },
                    { key: 'sig_tech_discovery_threshold', type: 'number', label: 'Discovery Threshold', desc: 'Similar flavor texts needed to discover.' },
                    { key: 'sig_tech_max_per_character', type: 'number', label: 'Max Sig Techs per Character' },
                    { key: 'enable_fighting_styles', type: 'toggle', label: 'Martial Arts & Styles', desc: 'Learnable styles with rank progression.', termKey: 'fighting_style' },
                    { key: 'enable_combo_procs', type: 'toggle', label: 'Multi-Hit Combos', desc: 'Physical attacks can chain into follow-ups.', termKey: 'combo' },
                    { key: 'combo_chain_decay', type: 'percent', label: 'Combo Damage Decay', desc: 'Each combo hit does this fraction of the previous (0.50 = 50% decay).' },
                    { key: 'combo_crit_chance', type: 'percent', label: 'Combo Crit Chance', desc: 'Chance for a combo hit to crit (0.03 = 3%).' },
                    { key: 'enable_passive_abilities', type: 'toggle', label: 'Passive Abilities', desc: 'Equippable always-active combat effects.' },
                    { key: 'max_passive_slots', type: 'number', label: 'Max Passive Slots', desc: 'How many passive abilities a character can equip.' },
                ]
            },
            advanced: {
                label: 'Advanced Combat', icon: '👑',
                settings: [
                    { key: 'enable_boss_phases', type: 'toggle', label: 'Boss Phase Transitions', desc: 'Multi-stage boss encounters.', termKey: 'boss_phase' },
                    { key: 'enable_custom_win_conditions', type: 'toggle', label: 'Victory Conditions', desc: 'Survive, protect, capture, etc.' },
                    { key: 'enable_stealth', type: 'toggle', label: 'Stealth & Ambush', desc: 'Hide and surprise-attack.', termKey: 'stealth' },
                    { key: 'stealth_surprise_bonus', type: 'percent', label: 'Ambush Damage Bonus', desc: 'Extra damage on surprise attack (0.50 = +50%).' },
                    { key: 'enable_transformations', type: 'toggle', label: 'Power Transformations', desc: 'Temporary power-up forms.', termKey: 'transform' },
                    { key: 'enable_link_attacks', type: 'toggle', label: 'Dual Strikes', desc: 'Combined ally attacks.' },
                    { key: 'enable_revive', type: 'toggle', label: 'Revival', desc: 'Bring back fallen allies.' },
                    { key: 'enable_traps', type: 'toggle', label: 'Battlefield Traps', desc: 'Placeable grid hazards.' },
                    { key: 'enable_battle_rules', type: 'toggle', label: 'Custom Battle Rules', desc: 'No-code IF/THEN rules engine.' },
                    { key: 'enable_party_swap', type: 'toggle', label: 'Party Swap', desc: 'Swap reserve members into combat.' },
                    { key: 'enable_rolling_hp', type: 'toggle', label: 'Hidden HP Bars', desc: 'Enemy HP shown as vague descriptions instead of numbers.' },
                ]
            },
            social: {
                label: 'Social & Alignment', icon: '⚖️',
                settings: [
                    { key: 'enable_alignment_system', type: 'toggle', label: 'Moral Alignment', desc: 'KOTOR-style good/evil scale.', termKey: 'alignment' },
                    { key: 'alignment_affects_stats', type: 'toggle', label: 'Alignment Affects Stats', desc: 'Good/evil gives stat bonuses.' },
                    { key: 'alignment_affects_skills', type: 'toggle', label: 'Alignment Affects Skills', desc: 'Some skills locked by alignment.' },
                    { key: 'alignment_affects_shops', type: 'toggle', label: 'Alignment Affects Prices', desc: 'Evil characters pay more.' },
                ]
            },
            formation: {
                label: 'Formation & Rows', icon: '⚔️',
                settings: [
                    { key: 'enable_formations', type: 'toggle', label: 'Front Row / Back Row', desc: 'Combatants positioned in rows that affect melee damage.' },
                    { key: 'front_melee_bonus', type: 'percent', label: 'Front Row Melee Bonus', desc: 'Extra melee damage from front row (0 = none).' },
                    { key: 'back_melee_penalty', type: 'percent', label: 'Back Row Melee Penalty', desc: 'Melee damage dealt reduced from back row (0.30 = -30%).' },
                    { key: 'back_melee_reduction', type: 'percent', label: 'Back Row Melee Reduction', desc: 'Melee damage taken reduced in back row (0.50 = -50%).' },
                    { key: 'back_ranged_bonus', type: 'percent', label: 'Back Row Ranged Bonus', desc: 'Ranged/magic bonus from back row safety.' },
                    { key: 'row_swap_costs_turn', type: 'toggle', label: 'Row Swap Costs Turn', desc: 'Swapping rows uses your action.' },
                ]
            },
            ai: {
                label: 'AI & Initiative', icon: '🤖',
                settings: [
                    { key: 'ai_difficulty', type: 'select', label: 'AI Difficulty', desc: 'How smart/strong AI opponents are.', options: ['easy', 'normal', 'hard'] },
                    { key: 'initiative_type', type: 'select', label: 'Turn Order System', desc: 'How turn order is determined.', options: ['speed', 'roll', 'atb', 'ctb', 'phased', 'countdown'] },
                    { key: 'atb_wait_mode', type: 'toggle', label: 'ATB Wait Mode', desc: 'Pause ATB bars during menu selection.' },
                    { key: 'atb_speed_factor', type: 'number', label: 'ATB Speed Factor', desc: 'How fast ATB bars fill (default 5.0).' },
                    { key: 'atb_tick_rate', type: 'number', label: 'ATB Tick Rate (ms)', desc: 'Milliseconds between ATB gauge ticks.' },
                    { key: 'ctb_base_recovery', type: 'number', label: 'CTB Base Recovery', desc: 'Base ticks between turns (default 100).' },
                    { key: 'ctb_speed_divisor', type: 'number', label: 'CTB Speed Divisor', desc: 'Divides speed for CTB calc (default 10).' },
                    { key: 'ctb_timeline_length', type: 'number', label: 'CTB Timeline Length', desc: 'Predicted future turns shown (default 10).' },
                ]
            },
            meta: {
                label: 'Meta Systems', icon: '🌍',
                settings: [
                    { key: 'enable_afterlife', type: 'toggle', label: 'Death & Afterlife', desc: 'Death sends you to another world.', termKey: 'afterlife' },
                    { key: 'enable_tournaments', type: 'toggle', label: 'Tournament System', desc: 'Scheduled competitive events.', termKey: 'tournament' },
                    { key: 'enable_spectator_mode', type: 'toggle', label: 'Spectator Mode', desc: 'Watch battles without participating.' },
                    { key: 'enable_offline_players', type: 'toggle', label: 'Persistent Characters', desc: 'Logged-out players remain on the map.' },
                    { key: 'enable_training_system', type: 'toggle', label: 'Training & Masters', desc: 'Self-train, spar, master training.' },
                    { key: 'enable_battle_equip_swap', type: 'toggle', label: 'Mid-Battle Gear Swap', desc: 'Change weapons mid-fight.' },
                ]
            },
        };

        // Inject current values + terminology into each setting
        const termsMap = {};
        for (const t of terms) termsMap[t.term_key] = t;

        for (const cat of Object.values(categories)) {
            for (const s of cat.settings) {
                s.value = settingsMap[s.key] ?? null;
                if (s.termKey && termsMap[s.termKey]) {
                    s.terminology = termsMap[s.termKey];
                }
            }
        }

        // Load entity data for sub-panels
        const entities = {};
        const entityQueries = {
            body_types: 'SELECT id, name, label, icon FROM game_body_types ORDER BY id',
            limb_zones: 'SELECT id, body_type_id, zone_key, label, icon, hp_pct, called_shot_penalty FROM game_limb_zones ORDER BY body_type_id, sort_order',
            bleed_tiers: 'SELECT * FROM game_bleed_tiers ORDER BY id',
            fighting_styles: 'SELECT id, name, label, icon, style_type, max_rank FROM game_fighting_styles ORDER BY id',
            style_ranks: 'SELECT style_id, rank_num, label, icon, wins_required FROM game_fighting_style_ranks ORDER BY style_id, rank_num',
            weather_effects: 'SELECT id, name, label, icon, visibility FROM game_weather_effects WHERE active=1 ORDER BY id',
            elemental_reactions: 'SELECT id, element_a, element_b, reaction_name, icon, damage_bonus FROM game_elemental_reactions WHERE active=1',
            status_combos: 'SELECT id, status_a, status_b, combo_name, icon, effect_type FROM game_status_combos WHERE active=1',
            alignment_tiers: 'SELECT id, name, label, icon, min_value, max_value, color FROM game_alignment_tiers ORDER BY min_value DESC',
            alignment_actions: 'SELECT id, action_key, label, shift_amount FROM game_alignment_actions WHERE active=1 ORDER BY shift_amount DESC',
            battle_rules: 'SELECT id, name, trigger_event, target_filter, enabled, priority FROM game_battle_rules ORDER BY priority DESC',
            win_conditions: 'SELECT id, name, condition_type, icon, description FROM game_win_conditions ORDER BY id',
            afterlife_worlds: 'SELECT id, name, label, icon, type, stay_duration_days FROM game_afterlife_worlds WHERE active=1',
            transformations: 'SELECT id, name, icon, trigger_type, duration, level_required FROM game_transformations WHERE active=1',
            traps: 'SELECT id, name, icon, trigger_type, damage_formula FROM game_battle_traps WHERE active=1',
            narrations: 'SELECT id, action_type, weapon_type, element, SUBSTRING(text_template,1,60) AS preview FROM game_battle_narrations WHERE active=1 ORDER BY action_type',
            training_config: 'SELECT id, name, label, training_type, daily_limit, allowed_race_ids, allowed_class_ids FROM game_training_config WHERE active=1',
            sig_levels: 'SELECT level, damage_pct, cost_pct, ability_slots, xp_required FROM game_signature_levels ORDER BY level',
            sig_abilities: 'SELECT id, name, label, icon, category, min_level FROM game_signature_abilities ORDER BY min_level',
            flavor_texts: 'SELECT id, category, SUBSTRING(text,1,50) AS preview, bonus_pct, is_template FROM game_flavor_texts WHERE active=1 LIMIT 20',
            flavor_keywords: 'SELECT id, keyword, bonus_pct, category, terrain_match FROM game_flavor_keywords WHERE active=1',
            tournaments: 'SELECT id, name, status, type, max_participants FROM game_tournaments ORDER BY created_at DESC LIMIT 10',
            formation_shapes: 'SELECT id, name, label, icon, shape_type, min_members, active FROM game_formation_shapes ORDER BY min_members',
            battle_terrain: 'SELECT id, name, icon, description, movement_cost_mult FROM game_battle_terrain ORDER BY id',
            battle_items: 'SELECT id, name, icon, description, uses_per_battle, cooldown_turns FROM game_battle_items ORDER BY id',
            battle_conditions: 'SELECT id, name, icon, condition_type, description FROM game_battle_conditions ORDER BY id',
        };
        for (const [key, query] of Object.entries(entityQueries)) {
            try { const [rows] = await db.query(query); entities[key] = rows; } catch { entities[key] = []; }
        }

        // NPC masters
        try {
            const [masters] = await db.query(
                `SELECT id, name, icon, teaches_style_id, teaches_sig_tech_id, unlocks_sig_tech_creation, training_gain_pct
                 FROM game_npcs WHERE is_master=1 ORDER BY name`);
            entities.masters = masters;
        } catch { entities.masters = []; }

        res.json({ success: true, categories, terminology: terms, allSettings: settingsMap, entities });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// Update a battle setting + optional terminology rename
router.post('/battle-config', requireStaff, async (req, res) => {
    try {
        const { key, value, termKey, displayName, icon, description } = req.body;

        // Update the setting value
        if (key && value !== undefined) {
            await db.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                [key, String(value), String(value)]);
        }

        // Update terminology if provided
        if (termKey && displayName) {
            await db.query(
                `UPDATE game_terminology SET display_name=?, icon=COALESCE(?,icon), description=COALESCE(?,description)
                 WHERE term_key=?`,
                [displayName, icon || null, description || null, termKey]);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// =================================================================
// GM NOTES
// =================================================================
router.get('/notes', requireStaff, async (req, res) => {
    const mapId = req.query.mapId !== undefined ? parseInt(req.query.mapId) : null;
    try {
        // Ensure table exists
        await db.query(`CREATE TABLE IF NOT EXISTS gm_notes (
            id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            map_id     INT UNSIGNED DEFAULT NULL,
            author_id  INT UNSIGNED NOT NULL,
            author     VARCHAR(64)  NOT NULL,
            body       TEXT         NOT NULL,
            pinned     TINYINT(1)   NOT NULL DEFAULT 0,
            created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gmnotes_map (map_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        let sql = 'SELECT * FROM gm_notes';
        const params = [];
        if (mapId !== null) {
            sql += mapId === 0 ? ' WHERE map_id IS NULL' : ' WHERE map_id=?';
            if (mapId !== 0) params.push(mapId);
        }
        sql += ' ORDER BY pinned DESC, created_at DESC LIMIT 100';
        const [rows] = await db.query(sql, params);
        res.json({ success: true, data: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/notes', requireStaff, async (req, res) => {
    const { body, mapId, pinned } = req.body;
    if (!body?.trim()) return res.json({ success: false, message: 'Note body required.' });
    const userId = req.session.userId;
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS gm_notes (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, map_id INT UNSIGNED DEFAULT NULL,
            author_id INT UNSIGNED NOT NULL, author VARCHAR(64) NOT NULL,
            body TEXT NOT NULL, pinned TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_gmnotes_map (map_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        const [urow] = await db.query('SELECT username FROM users WHERE id=?', [userId]);
        const author = urow[0]?.username || 'GM';
        const mid    = mapId ? parseInt(mapId) : null;
        await db.query(
            'INSERT INTO gm_notes (map_id, author_id, author, body, pinned) VALUES (?,?,?,?,?)',
            [mid, userId, author, body.trim(), pinned ? 1 : 0]
        );
        await logEvent('gm_note', userId, author, null, null, { mapId: mid, snippet: body.trim().slice(0,80) });
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.delete('/notes/:id', requireStaff, async (req, res) => {
    try {
        await db.query('DELETE FROM gm_notes WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/notes/:id/pin', requireStaff, async (req, res) => {
    try {
        await db.query('UPDATE gm_notes SET pinned=NOT pinned WHERE id=?', [req.params.id]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// LORE BIBLE
// =================================================================
router.get('/lore-bible', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT setting_value AS v FROM system_settings WHERE setting_key='world_forge_lore_bible' LIMIT 1"
        );
        res.json({ success: true, value: rows.length ? rows[0].v : '' });
    } catch(e) { res.json({ success: true, value: '' }); }
});

router.post('/lore-bible', requireStaff, async (req, res) => {
    const { value } = req.body;
    try {
        await db.query(
            `INSERT INTO system_settings (setting_key, setting_value, description)
             VALUES ('world_forge_lore_bible', ?, 'Shared World Forge lore context for all GMs')
             ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)`,
            [String(value || '').slice(0, 4000)]
        );
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// LIVE SOCIAL METRICS
// =================================================================
router.get('/live-social', requireStaff, async (req, res) => {
    try {
        // Active parties from DB (those with 2+ members)
        const [parties] = await db.query(`
            SELECT p.id, p.name, p.leader_id, c.name AS leader_name,
                   COUNT(pm.character_id) AS member_count
            FROM parties p
            JOIN characters c ON c.id = p.leader_id
            JOIN party_members pm ON pm.party_id = p.id
            GROUP BY p.id
            ORDER BY member_count DESC, p.id DESC
            LIMIT 50`).catch(() => [[]]);

        // Members per party
        const partyDetails = [];
        for (const p of parties) {
            const [members] = await db.query(`
                SELECT c.id, c.name, c.level, u.username,
                       CASE WHEN c.id = ? THEN 1 ELSE 0 END AS is_leader
                FROM party_members pm
                JOIN characters c ON c.id = pm.character_id
                JOIN users u ON u.id = c.user_id
                WHERE pm.party_id = ?`, [p.leader_id, p.id]).catch(() => [[]]);

            const onlineIds = new Set(Object.values(global._onlinePlayers || {}).map(pl => pl.charId));
            partyDetails.push({
                ...p,
                members: members.map(m => ({ ...m, online: onlineIds.has(m.id) }))
            });
        }

        // Active guilds with online member count
        const [guilds] = await db.query(`
            SELECT g.id, g.name, g.tag, g.level AS guild_level,
                   COUNT(gm.character_id) AS total_members
            FROM guilds g
            JOIN guild_members gm ON gm.guild_id = g.id
            GROUP BY g.id
            ORDER BY total_members DESC
            LIMIT 30`).catch(() => [[]]);

        const onlinePlayers = Object.values(global._onlinePlayers || {});
        const guildDetails = [];
        for (const g of guilds) {
            const [members] = await db.query(`
                SELECT c.id, c.name, c.level, gm.rank, u.username
                FROM guild_members gm
                JOIN characters c ON c.id = gm.character_id
                JOIN users u ON u.id = c.user_id
                WHERE gm.guild_id = ?
                ORDER BY gm.rank DESC, c.level DESC`, [g.id]).catch(() => [[]]);

            const onlineIds = new Set(onlinePlayers.map(p => p.charId));
            const onlineCount = members.filter(m => onlineIds.has(m.id)).length;
            guildDetails.push({
                ...g,
                onlineCount,
                members: members.map(m => ({ ...m, online: onlineIds.has(m.id) }))
            });
        }

        res.json({ success: true, parties: partyDetails, guilds: guildDetails });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// MAP CONNECTIONS
// =================================================================
router.get('/map-connections', requireStaff, async (req, res) => {
    try {
        const [maps] = await db.query('SELECT id, name, width, height, collisions_json FROM game_maps WHERE is_active=1 ORDER BY name');
        const connections = [];
        for (const map of maps) {
            let events = [];
            try { events = JSON.parse(map.collisions_json || '[]'); } catch {}
            const warps = events.filter(e => e.type === 'TELEPORT');
            for (const w of warps) {
                const parts = String(w.data || '').split(',');
                const destMapId = parseInt(parts[0]);
                const destMap = maps.find(m => m.id === destMapId);
                connections.push({
                    sourceMapId:   map.id,
                    sourceMapName: map.name,
                    srcX: w.x, srcY: w.y,
                    destMapId,
                    destMapName: destMap ? destMap.name : `Map #${destMapId}`,
                    destX: parseInt(parts[1]) || 0,
                    destY: parseInt(parts[2]) || 0,
                    // raw event for editing
                    raw: w
                });
            }
        }
        res.json({ success: true, maps: maps.map(m => ({ id: m.id, name: m.name, width: m.width, height: m.height })), connections });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

router.post('/map-connections/save', requireStaff, async (req, res) => {
    // Expects: { mapId, events: [...] }  — full collisions_json replacement for one map
    const { mapId, events } = req.body;
    if (!mapId || !Array.isArray(events)) return res.json({ success: false, message: 'mapId and events required.' });
    try {
        await db.query('UPDATE game_maps SET collisions_json=? WHERE id=?', [JSON.stringify(events), mapId]);
        await logEvent('map_connection_edit', req.session.userId, 'GM', mapId, null, { event_count: events.length });
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false, message: e.message });
    }
});

// =================================================================
// MAP VERSIONING
// =================================================================
router.get('/map-versions/:mapId', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, version_num, label, width, height, created_by, created_at FROM game_map_versions WHERE map_id=? ORDER BY version_num DESC LIMIT 20',
            [req.params.mapId]
        );
        res.json({ success: true, versions: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/map-versions/:mapId/revert/:versionId', requireStaff, async (req, res) => {
    try {
        const [ver] = await db.query('SELECT * FROM game_map_versions WHERE id=? AND map_id=?', [req.params.versionId, req.params.mapId]);
        if (!ver.length) return res.json({ success: false, message: 'Version not found' });
        const v = ver[0];
        await db.query(
            'UPDATE game_maps SET tiles_json=?, collisions_json=?, objects_json=?, anims_json=?, width=?, height=? WHERE id=?',
            [v.tiles_json, v.collisions_json, v.objects_json, v.anims_json, v.width, v.height, req.params.mapId]
        );
        res.json({ success: true, message: `Reverted to version ${v.version_num}` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// MAP IMPORT / EXPORT
// =================================================================
router.get('/map-export/:mapId', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM game_maps WHERE id=?', [req.params.mapId]);
        if (!rows.length) return res.json({ success: false, message: 'Map not found' });
        const m = rows[0];
        res.json({ success: true, export: { name: m.name, width: m.width, height: m.height, tiles_json: m.tiles_json, collisions_json: m.collisions_json, objects_json: m.objects_json, anims_json: m.anims_json, ambient_dark: m.ambient_dark, tileset_url: m.tileset_url, parallax_url: m.parallax_url, fog_of_war: m.fog_of_war, fog_reveal_radius: m.fog_reveal_radius, exported_at: new Date().toISOString(), engine_version: '28.0' } });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/map-import', requireStaff, async (req, res) => {
    try {
        const d = req.body;
        if (!d.name || !d.width || !d.height) return res.json({ success: false, message: 'Invalid map data' });
        const [result] = await db.query(
            'INSERT INTO game_maps (name, width, height, tiles_json, collisions_json, objects_json, anims_json, ambient_dark, tileset_url, parallax_url, fog_of_war, fog_reveal_radius) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            [d.name + ' (imported)', d.width, d.height, d.tiles_json || '[]', d.collisions_json || '[]', d.objects_json || '[]', d.anims_json || '[]', d.ambient_dark || 0, d.tileset_url || null, d.parallax_url || null, d.fog_of_war || 0, d.fog_reveal_radius || 3]
        );
        res.json({ success: true, mapId: result.insertId, message: `Imported as "${d.name} (imported)"` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// SETTINGS IMPORT / EXPORT
// =================================================================
router.get('/settings-export', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const settings = {};
        for (const r of rows) settings[r.setting_key] = r.setting_value;
        res.json({ success: true, settings, exported_at: new Date().toISOString(), engine_version: '28.0' });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/settings-import', requireStaff, async (req, res) => {
    try {
        const { settings } = req.body;
        if (!settings || typeof settings !== 'object') return res.json({ success: false, message: 'Invalid settings data' });
        let count = 0;
        for (const [key, value] of Object.entries(settings)) {
            await db.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
                [key, String(value)]);
            count++;
        }
        // Log activity
        try { await db.query('INSERT INTO admin_activity_log (user_id, username, action, details) VALUES (?,?,?,?)',
            [req.session?.userId || 0, req.session?.username || 'admin', 'settings_import', `Imported ${count} settings`]); } catch {}
        res.json({ success: true, message: `Imported ${count} settings` });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// SERVER SETTINGS (game_settings + system_settings dual write)
// =================================================================
router.get('/settings', requireStaff, async (req, res) => {
    try {
        const settings = {};
        // Load from system_settings first (legacy / engine defaults)
        try {
            const [sysRows] = await db.query('SELECT setting_key, setting_value FROM system_settings');
            for (const row of sysRows) settings[row.setting_key] = row.setting_value;
        } catch {}
        // Overlay with game_settings (admin panel overrides)
        try {
            const [rows] = await db.query('SELECT setting_key, setting_value, setting_type FROM game_settings');
            for (const row of rows) {
                let val = row.setting_value;
                if (row.setting_type === 'number') val = parseFloat(val);
                else if (row.setting_type === 'boolean') val = val === 'true' || val === '1';
                settings[row.setting_key] = val;
            }
        } catch {} // table may not exist yet
        res.json({ success: true, data: settings });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/settings', requireStaff, async (req, res) => {
    try {
        const settings = req.body;
        // Ensure game_settings table exists
        await db.query(`
            CREATE TABLE IF NOT EXISTS game_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT,
                setting_type VARCHAR(20) DEFAULT 'string',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `).catch(() => {});

        for (const [key, value] of Object.entries(settings)) {
            const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
            // Get old value for change log
            const [oldRow] = await db.query('SELECT setting_value FROM system_settings WHERE setting_key=?', [key]).catch(() => [[]]);
            const oldVal = oldRow[0]?.setting_value || null;
            // Write to game_settings (primary admin store)
            await db.query(
                'INSERT INTO game_settings (setting_key, setting_value, setting_type) VALUES (?,?,?) ON DUPLICATE KEY UPDATE setting_value=?, setting_type=?',
                [key, String(value), type, String(value), type]
            ).catch(() => {});
            // Also write to system_settings for keys the engine reads directly
            await db.query(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                [key, String(value), String(value)]
            ).catch(() => {});
            // Log the change
            if (oldVal !== String(value)) {
                await db.query(
                    'INSERT INTO settings_change_log (setting_key, old_value, new_value, changed_by, changed_by_name) VALUES (?,?,?,?,?)',
                    [key, oldVal, String(value), req.session.userId, req.session.username || 'Admin']
                ).catch(() => {});
            }
        }
        res.json({ success: true, message: 'Settings saved' });
    } catch(e) { res.status(500).json({ success: false, message: e.message }); }
});

// =================================================================
// SYSTEM HEALTH
// =================================================================
router.get('/system-health', requireStaff, async (req, res) => {
    try {
        const os = require('os');
        const [dbCheck] = await db.query('SELECT 1');
        const [poolInfo] = await db.query('SHOW STATUS LIKE "Threads_connected"');
        const onlineCount = Object.keys(global._onlinePlayers || {}).length;
        const staffCount = Object.keys(global._staffPanel || {}).length;
        res.json({
            success: true,
            data: {
                uptime: process.uptime(),
                memory: { total: os.totalmem(), free: os.freemem(), used: process.memoryUsage() },
                cpu: os.loadavg(),
                cpuCount: os.cpus().length,
                dbConnections: parseInt(poolInfo[0]?.Value || '0'),
                onlinePlayers: onlineCount,
                staffOnline: staffCount,
                nodeVersion: process.version,
                platform: os.platform(),
            }
        });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// CONFIG EXPORT / IMPORT (full)
// =================================================================
router.get('/config-export', requireStaff, async (req, res) => {
    try {
        const [settings] = await db.query('SELECT setting_key, setting_value FROM system_settings');
        const [gameSettings] = await db.query('SELECT setting_key, setting_value FROM game_settings').catch(() => [[]]);
        const [terminology] = await db.query('SELECT * FROM game_terminology').catch(() => [[]]);
        const [modules] = await db.query('SELECT * FROM core_modules').catch(() => [[]]);
        res.json({
            success: true,
            data: {
                system_settings: settings,
                game_settings: gameSettings,
                terminology,
                modules,
                exported_at: new Date().toISOString()
            }
        });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/config-import', requireStaff, async (req, res) => {
    try {
        const { system_settings, game_settings, terminology, modules } = req.body;
        let applied = 0;
        if (Array.isArray(system_settings)) {
            for (const s of system_settings) {
                await db.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                    [s.setting_key, s.setting_value, s.setting_value]).catch(() => {});
                applied++;
            }
        }
        if (Array.isArray(game_settings)) {
            for (const s of game_settings) {
                await db.query('INSERT INTO game_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=?',
                    [s.setting_key, s.setting_value, s.setting_value]).catch(() => {});
                applied++;
            }
        }
        res.json({ success: true, message: applied + ' settings imported' });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// ROLE SECTIONS
// =================================================================
router.get('/role-sections', requireStaff, async (req, res) => {
    try {
        const [userRows] = await db.query('SELECT role FROM users WHERE id=?', [req.session.userId]);
        const role = userRows.length ? (userRows[0].role || 'STAFF').toUpperCase() : 'STAFF';
        const [roleRows] = await db.query('SELECT allowed_sections FROM admin_role_sections WHERE role=?', [role]);
        const sections = roleRows.length ? JSON.parse(roleRows[0].allowed_sections) : ['dashboard'];
        res.json({ success: true, role, sections });
    } catch(e) { res.json({ success: true, role: 'STAFF', sections: ['dashboard'] }); }
});

router.post('/role-sections/:role', requireStaff, async (req, res) => {
    try {
        const sections = JSON.stringify(req.body.sections || []);
        await db.query('INSERT INTO admin_role_sections (role, allowed_sections) VALUES (?,?) ON DUPLICATE KEY UPDATE allowed_sections=VALUES(allowed_sections)',
            [req.params.role.toUpperCase(), sections]);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// ACTIVITY LOG
// =================================================================
router.get('/activity-log', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM admin_activity_log ORDER BY created_at DESC LIMIT 100');
        res.json({ success: true, log: rows });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

// =================================================================
// SETUP WIZARD
// =================================================================
router.post('/setup-wizard', requireStaff, async (req, res) => {
    try {
        const { preset, settings } = req.body;
        if (settings && typeof settings === 'object') {
            for (const [key, value] of Object.entries(settings)) {
                await db.query('INSERT INTO system_settings (setting_key, setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
                    [key, String(value)]);
            }
        }
        await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('setup_wizard_completed','true') ON DUPLICATE KEY UPDATE setting_value='true'");
        await db.query("INSERT INTO system_settings (setting_key, setting_value) VALUES ('game_preset',?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",
            [preset || 'custom']);
        res.json({ success: true });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.get('/setup-status', requireStaff, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='setup_wizard_completed'");
        const completed = rows.length && rows[0].setting_value === 'true';
        const [preset] = await db.query("SELECT setting_value FROM system_settings WHERE setting_key='game_preset'");
        res.json({ success: true, completed, preset: preset.length ? preset[0].setting_value : null });
    } catch(e) { res.json({ success: true, completed: false, preset: null }); }
});

// =================================================================
// TEMPLATE INSTALLER
// =================================================================
router.get('/templates', requireStaff, async (req, res) => {
    try {
        const TemplateInstaller = require('../template_installer');
        const templates = await TemplateInstaller.list(db);
        const active = await TemplateInstaller.getActive(db);
        res.json({ success: true, templates, active });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.post('/templates/:id/install', requireStaff, async (req, res) => {
    try {
        const TemplateInstaller = require('../template_installer');
        const result = await TemplateInstaller.install(db, parseInt(req.params.id));
        res.json(result);
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// =================================================================
// ASSET USAGE REPORT
// =================================================================
router.get('/asset-usage', requireStaff, async (req, res) => {
    try {
        const usage = [];
        const tables = [
            { table: 'game_npcs', col: 'icon_asset_id', label: 'NPC' },
            { table: 'game_items', col: 'icon_asset_id', label: 'Item' },
            { table: 'game_skills', col: 'icon_asset_id', label: 'Skill' },
        ];
        for (const t of tables) {
            const [rows] = await db.query(
                'SELECT e.id, e.name, e.?? AS asset_id FROM ?? e WHERE e.?? IS NOT NULL',
                [t.col, t.table, t.col]
            ).catch(() => [[]]);
            for (const r of rows) {
                usage.push({ asset_id: r.asset_id, entity_type: t.label, entity_id: r.id, entity_name: r.name });
            }
        }
        res.json({ success: true, data: usage });
    } catch(e) { res.json({ success: true, data: [] }); }
});

// =================================================================
// GAME RESET TOOLS (OWNER only)
// =================================================================
router.post('/reset-world-state', requireStaff, async (req, res) => {
    if (req.staffRole !== 'OWNER') return res.json({ success: false, message: 'Only OWNER can reset world state' });
    try {
        await db.query('DELETE FROM world_flags').catch(() => {});
        await db.query('UPDATE game_npcs SET mood=NULL, is_dead=0').catch(() => {});
        await db.query('DELETE FROM npc_memories').catch(() => {});
        res.json({ success: true, message: 'World state reset: flags cleared, NPCs restored, memories wiped' });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

router.post('/reset-player-data', requireStaff, async (req, res) => {
    if (req.staffRole !== 'OWNER') return res.json({ success: false, message: 'Only OWNER can reset player data' });
    try {
        // Delete all character data but keep user accounts
        const charTables = ['character_items','character_equipment','character_stats','character_ability_scores',
            'character_skills','character_oghams','character_quests','character_mail',
            'character_fighting_styles','character_signature_techs','character_titles',
            'character_transformations','character_enchantments','character_ogham_shards',
            'character_learned_spells','character_elemental_affinity','character_magic_affinity',
            'character_discovered_recipes'];
        for (const t of charTables) await db.query('DELETE FROM ??', [t]).catch(() => {});
        await db.query('DELETE FROM characters').catch(() => {});
        await db.query('UPDATE users SET currency=0, referral_count=0').catch(() => {});
        res.json({ success: true, message: 'All character data wiped. User accounts preserved.' });
    } catch(e) { res.json({ success: false, message: e.message }); }
});

module.exports = router;
